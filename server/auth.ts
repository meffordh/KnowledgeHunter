import { Auth } from "@auth/express";
import LinkedIn from "@auth/core/providers/linkedin";
import express from "express";
import { storage } from "./storage";

export function setupAuth(app: express.Express) {
  const router = express.Router();

  const auth = new Auth({
    secret: process.env.AUTH_SECRET || process.env.REPLIT_ID || 'development-secret',
    trustHost: true,
    providers: [
      LinkedIn({
        clientId: process.env.AUTH_LINKEDIN_CLIENT_ID || '',
        clientSecret: process.env.AUTH_LINKEDIN_CLIENT_SECRET || '',
        authorization: {
          params: {
            scope: "openid profile email"
          }
        }
      })
    ],
    session: {
      strategy: "jwt"
    },
    callbacks: {
      async jwt({ token, user, account }) {
        if (account) {
          token.provider = account.provider;
          token.providerId = account.providerAccountId;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.sub as string;
        }
        return session;
      },
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
  }).use(app);

  return router;
}