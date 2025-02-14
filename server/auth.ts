import { clerkClient, ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import express from 'express';
import { storage } from './storage';

const router = express.Router();

// Protected route to get user data
router.get('/api/auth/user', ClerkExpressRequireAuth(), async (req, res, next) => {
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
    next(error); // Pass error to error handling middleware
  }
});

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Auth error:', err.stack);
  res.status(401).json({ error: 'Unauthenticated!' });
});

export function setupAuth(app: express.Express) {
  app.use(router);
}