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
  app.get('/api/research/history', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const reports = await storage.getUserReports(req.user.id);
      res.json(reports);
    } catch (error) {
      console.error('Error fetching research history:', error);
      res.status(500).json({ error: 'Failed to fetch research history' });
    }
  });

  wss.on('connection', async (ws) => {
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        const { userId, ...researchData } = data;

        // Validate research data
        const research = researchSchema.parse(researchData);

        // Verify user exists and get user data
        const user = await storage.getUser(userId);
        if (!user) {
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

        // Increment research count
        await storage.incrementResearchCount(user.id);

        // Handle research with a callback to save the report
        await handleResearch(research, ws, async (report, visitedUrls) => {
          if (report) {
            try {
              await storage.createResearchReport({
                userId: user.id,
                query: research.query,
                report,
                visitedUrls
              });
              console.log('Research report saved successfully for user:', user.id);
            } catch (error) {
              console.error('Error saving research report:', error);
            }
          }
        });
      } catch (error) {
        console.error('WebSocket error:', error);
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