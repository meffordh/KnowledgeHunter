
import { Auth } from "@auth/core";
import LinkedIn from "@auth/core/providers/linkedin";
import express from "express";
import { storage } from "./storage";

export function setupAuth(app: express.Express) {
  const router = express.Router();

  const auth = Auth({
    providers: [
      LinkedIn({
        clientId: process.env.AUTH_LINKEDIN_ID || '',
        clientSecret: process.env.AUTH_LINKEDIN_SECRET || '',
        authorization: {
          params: {
            scope: "openid profile email"
          }
        }
      })
    ],
    secret: process.env.AUTH_SECRET || process.env.REPL_ID || 'development-secret',
    trustHost: true,
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!profile?.email) {
          return false;
        }

        try {
          let dbUser = await storage.getUserByEmail(profile.email);
          if (!dbUser) {
            dbUser = await storage.createUser({
              email: profile.email,
              name: profile.name || '',
              provider: "linkedin",
              providerId: profile.sub
            });
          }
          return true;
        } catch (error) {
          console.error('Error during sign in:', error);
          return false;
        }
      }
    }
  });

  router.use("/", auth.handleRequest());
  app.use("/api/auth", router);

  app.get("/api/user", auth.authenticateRequest(), async (req, res) => {
    if (!req.auth?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.json(req.auth.user);
  });
}
