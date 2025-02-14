declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        getToken: () => Promise<string | null>;
        sessionClaims?: {
          external_accounts?: Array<{
            provider: string;
            provider_user_id: string;
            approved_scopes: string;
            access_token?: string;
          }>;
        };
      };
    }
  }
}

export {};