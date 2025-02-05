import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from 'ws';
import { setupAuth } from './auth';
import { handleResearch } from './deep-research';
import { researchSchema } from '@shared/schema';

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        const research = researchSchema.parse(data);
        await handleResearch(research, ws);
      } catch (error) {
        ws.send(JSON.stringify({
          status: 'ERROR',
          error: error.message
        }));
      }
    });
  });

  return httpServer;
}
