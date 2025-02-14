import { clerkClient, ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import express, { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

const router = express.Router();

// Protected route to get user data
router.get('/api/auth/user', ClerkExpressRequireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get user details using clerkClient
    const clerkUser = await clerkClient.users.getUser(userId);

    // Sync user with database
    const user = await storage.createOrUpdateUser({
      id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress || '',
      name: `${clerkUser.firstName} ${clerkUser.lastName}`.trim(),
      researchCount: 0
    });

    res.json(user);
  } catch (error) {
    console.error('Auth route error:', error);
    next(error);
  }
});

// Error handling middleware
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Auth error:', err);
  // Check if error is from Clerk authentication
  if (err.message.includes('JWT')) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  res.status(401).json({ error: 'Authentication failed' });
});

export function setupAuth(app: express.Express) {
  app.use(router);
}