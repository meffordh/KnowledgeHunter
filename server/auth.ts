import { clerkClient, ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import express from 'express';
import { storage } from './storage';

const router = express.Router();

// Protected route to get user data
router.get('/api/auth/user', ClerkExpressRequireAuth(), async (req, res) => {
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
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Error syncing user data' });
  }
});

export function setupAuth(app: express.Express) {
  // Mount auth router directly
  app.use(router);
}