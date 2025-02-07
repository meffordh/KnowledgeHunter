import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from 'ws';
import { setupAuth } from './auth.js';
import { handleResearch, generateClarifyingQuestions } from './deep-research';
import { researchSchema } from '@shared/schema';
import { storage } from './storage';

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  app.post('/api/clarify', async (req, res) => {
    try {
      const query = req.body.query;
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      const questions = await generateClarifyingQuestions(query);
      res.json({ questions });
    } catch (error) {
      console.error('Error generating clarifying questions:', error);
      res.status(500).json({ error: 'Failed to generate clarifying questions' });
    }
  });

  // Add new endpoint to fetch user's research history
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
      res.status(500).json({ error: 'Failed to fetch research history' });
    }
  });

  wss.on('connection', async (ws, req) => {
    console.log('WebSocket connection attempt');
    
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
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
    };

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