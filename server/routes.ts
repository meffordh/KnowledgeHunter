import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from 'ws';
import { requireAuth } from '@clerk/express';
import { setupAuth } from './auth.js';
import { handleResearch, generateClarifyingQuestions } from './deep-research';
import { researchSchema } from '@shared/schema';
import { storage } from './storage';
import { handleLinkedInShare } from './linkedin';

export function registerRoutes(app: Express): Server {
  // Add CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
  });

  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Get report templates
  app.get('/api/report-templates', requireAuth(), async (_req, res) => {
    try {
      const templates = await storage.getReportTemplates();
      res.json(templates);
    } catch (error) {
      console.error('Error fetching report templates:', error);
      res.status(500).json({ error: 'Failed to fetch report templates' });
    }
  });

  // Get report customization
  app.get('/api/reports/:reportId/customize', requireAuth(), async (req, res) => {
    try {
      const reportId = parseInt(req.params.reportId);
      const customization = await storage.getReportCustomization(reportId);

      if (!customization) {
        return res.status(404).json({ error: 'Report customization not found' });
      }

      res.json(customization);
    } catch (error) {
      console.error('Error fetching report customization:', error);
      res.status(500).json({ error: 'Failed to fetch report customization' });
    }
  });

  // Create or update report customization
  app.post('/api/reports/:reportId/customize', requireAuth(), async (req, res) => {
    try {
      const reportId = parseInt(req.params.reportId);
      const customization = await storage.createReportCustomization({
        ...req.body,
        reportId,
      });
      res.json(customization);
    } catch (error) {
      console.error('Error creating report customization:', error);
      res.status(500).json({ error: 'Failed to create report customization' });
    }
  });

  // Get a single report by ID
  app.get('/api/reports/:id', requireAuth(), async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);
      const report = await storage.getReport(reportId);

      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }

      res.json(report);
    } catch (error) {
      console.error('Error fetching report:', error);
      res.status(500).json({ error: 'Failed to fetch report' });
    }
  });

  app.post('/api/clarify', requireAuth(), async (req, res) => {
    try {
      const query = req.body.query;
      console.log('[Clarify] Request received with query:', query);

      if (!query) {
        console.log('[Clarify] Error: No query provided');
        return res.status(400).json({ error: 'Query is required' });
      }

      console.log('[Clarify] Generating clarifying questions for query:', query);
      const questions = await generateClarifyingQuestions(query);
      console.log('[Clarify] Generated questions:', questions);

      if (!Array.isArray(questions) || questions.length === 0) {
        console.log('[Clarify] Error: Invalid or empty questions array returned');
        return res.status(500).json({ 
          error: 'Failed to generate valid clarifying questions',
          details: 'Questions array was empty or invalid'
        });
      }

      res.json({ questions });
    } catch (error) {
      console.error('[Clarify] Error generating clarifying questions:', error);
      res.status(500).json({ 
        error: 'Failed to generate clarifying questions',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/research/history', requireAuth(), async (req, res) => {
    const userId = req.auth?.userId;
    console.log('Research history request received for user:', userId);

    if (!userId) {
      console.log('Research history request rejected: Not authenticated');
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const reports = await storage.getUserReports(userId);
      console.log('Research history retrieved:', reports.length, 'reports for user:', userId);
      res.json(reports);
    } catch (error) {
      console.error('Error fetching research history:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch research history' });
    }
  });

  app.post('/api/social/linkedin/share', requireAuth(), async (req, res) => {
    try {
      const result = await handleLinkedInShare(req);
      res.json({ 
        success: true, 
        postId: result.id,
      });
    } catch (error) {
      console.error('LinkedIn share error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to share on LinkedIn' });
    }
  });

  wss.on('connection', async (ws, req) => {
    console.log('WebSocket connection attempt');

    // First message should contain auth token
    ws.once('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        const authToken = data.authorization;

        if (!authToken?.startsWith('Bearer ')) {
          console.log('WebSocket connection rejected: No auth token');
          ws.send(JSON.stringify({
            status: 'ERROR',
            error: 'Authentication required',
            learnings: [],
            progress: 0,
            totalProgress: 0,
            visitedUrls: []
          }));
          ws.close();
          return;
        }
      } catch (error) {
        console.error('Error handling WebSocket auth message:', error);
        ws.close();
        return;
      }
    });

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        const { userId, ...researchData } = data;

        // Validate research data
        const research = researchSchema.parse(researchData);

        // Verify user exists and get user data
        const user = await storage.getUser(userId);
        if (!user) {
          console.log('Research rejected: User not found:', userId);
          ws.send(JSON.stringify({
            status: 'ERROR',
            error: 'User not found',
            learnings: [],
            progress: 0,
            totalProgress: 0,
            visitedUrls: []
          }));
          return;
        }

        // Check research limit
        const count = await storage.getUserResearchCount(user.id);
        if (count >= 100) {
          console.log('Research rejected: Limit reached for user:', userId);
          ws.send(JSON.stringify({
            status: 'ERROR',
            error: 'Research limit reached. Maximum of 100 research queries allowed.',
            learnings: [],
            progress: 0,
            totalProgress: 0,
            visitedUrls: []
          }));
          return;
        }

        console.log('Starting research for user:', userId, 'query:', research.query);

        // Increment research count
        await storage.incrementResearchCount(user.id);

        // Handle research with a callback to save the report
        await handleResearch(research, ws, async (report, visitedUrls) => {
          if (report) {
            try {
              console.log('Saving research report for user:', user.id);
              const savedReport = await storage.createResearchReport({
                userId: user.id,
                query: research.query,
                report,
                visitedUrls
              });
              console.log('Research report saved successfully:', savedReport.id);
            } catch (error) {
              console.error('Error saving research report:', error);
              ws.send(JSON.stringify({
                status: 'ERROR',
                error: 'Failed to save research report',
                learnings: [],
                progress: 0,
                totalProgress: 0,
                visitedUrls: []
              }));
            }
          }
        });
      } catch (error) {
        console.error('WebSocket message handling error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        ws.send(JSON.stringify({
          status: 'ERROR',
          error: errorMessage,
          learnings: [],
          progress: 0,
          totalProgress: 0,
          visitedUrls: []
        }));
      }
    });
  });

  return httpServer;
}