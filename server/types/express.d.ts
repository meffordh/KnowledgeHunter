declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        getToken: () => Promise<string | null>;
      };
    }
  }
}

export {};
