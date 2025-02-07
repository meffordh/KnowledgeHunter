
import { clerkClient, clerkMiddleware, requireAuth } from '@clerk/express';
import express from 'express';
import { storage } from './storage';

const router = express.Router();

// Protected route to get user data
router.get('/user', requireAuth(), async (req, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    // Get user details using clerkClient
    const user = await clerkClient.users.getUser(req.auth.userId);
    
    // Sync user with database
    await storage.createOrUpdateUser({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || '',
      name: `${user.firstName} ${user.lastName}`.trim(),
      researchCount: 0
    });

    res.json({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName
    });
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Error syncing user data' });
  }
});

export function setupAuth(app: express.Express) {
  // Add global Clerk middleware
  app.use(clerkMiddleware());
  
  // Mount auth router
  app.use('/api/auth', router);
}
