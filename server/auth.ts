
import { clerkClient } from '@clerk/clerk-sdk-node';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import express from 'express';

const router = express.Router();

// Initialize Clerk with the secret key
clerkClient.setKey(process.env.CLERK_SECRET_KEY || '');

const clerkMiddleware = ClerkExpressRequireAuth();

// Protected route to get user data
router.get('/user', clerkMiddleware, (req, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.json({
    id: req.auth.userId,
    email: req.auth.sessionClaims?.email,
  });
});

export function setupAuth(app: express.Express) {
  app.use('/api/auth', router);
}
