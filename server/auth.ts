
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
  app.use(clerkMiddleware({
    debug: true,
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
    afterSignIn: "/",
    afterSignUp: "/",
    publicRoutes: [
      "/sign-in",
      "/sign-up", 
      "/user/profile",
      "/user/security",
      "/user/account",
      "/verify"
    ],
    // Add session config
    session: {
      maxAge: 7 * 24 * 60 * 60, // 7 days
      sameSite: 'strict'
    }
  }));
  
  // Mount auth router
  app.use('/api/auth', router);
}
