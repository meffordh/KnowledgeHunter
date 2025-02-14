import { clerkClient, ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import express, { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

const router = express.Router();

// Protected route to get user data
router.get('/api/auth/user', ClerkExpressRequireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      console.log('[Auth] No userId in request:', req.headers);
      return res.status(401).json({ error: "Not authenticated" });
    }

    console.log('[Auth] Getting user details for:', userId);

    // Get user details using clerkClient
    const clerkUser = await clerkClient.users.getUser(userId);
    console.log('[Auth] Clerk user found:', clerkUser.id);

    // Sync user with database
    const user = await storage.createOrUpdateUser({
      id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress || '',
      name: `${clerkUser.firstName} ${clerkUser.lastName}`.trim(),
      researchCount: 0
    });

    console.log('[Auth] User synced with database:', user.id);
    res.json(user);
  } catch (error) {
    console.error('[Auth] Route error:', error);
    if (error instanceof Error && error.message.includes('JWT')) {
      return res.status(401).json({ 
        error: 'Session expired. Please sign in again.',
        details: error.message
      });
    }
    next(error);
  }
});

// Error handling middleware
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Auth] Error:', err);
  const headers = {
    'clerk-status': req.headers['x-clerk-auth-status'],
    'clerk-reason': req.headers['x-clerk-auth-reason']
  };
  console.log('[Auth] Request headers:', headers);

  // Check if error is from Clerk authentication
  if (err.message.includes('JWT')) {
    return res.status(401).json({ 
      error: 'Session expired. Please sign in again.',
      details: headers
    });
  }
  res.status(401).json({ 
    error: 'Authentication failed',
    details: headers
  });
});

export function setupAuth(app: express.Express) {
  app.use(router);
}