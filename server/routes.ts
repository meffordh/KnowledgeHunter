import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from 'ws';
import { setupAuth } from './auth';
import { handleResearch, generateClarifyingQuestions } from './deep-research';
import { researchSchema } from '@shared/schema';

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

  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        const research = researchSchema.parse(data);
        await handleResearch(research, ws);
      } catch (error) {
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