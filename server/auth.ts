
import { clerkClient, clerkMiddleware, requireAuth } from '@clerk/express';
import express from 'express';

const router = express.Router();

// Protected route to get user data
router.get('/user', requireAuth(), async (req, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Get user details using clerkClient
  const user = await clerkClient.users.getUser(req.auth.userId);
  
  res.json({
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    firstName: user.firstName,
    lastName: user.lastName
  });
});

export function setupAuth(app: express.Express) {
  // Add global Clerk middleware
  app.use(clerkMiddleware());
  
  // Mount auth router
  app.use('/api/auth', router);
}
