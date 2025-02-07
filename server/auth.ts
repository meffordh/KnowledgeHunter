
import { clerkMiddleware, requireAuth } from '@clerk/express';
import express from 'express';

const router = express.Router();

// Protected route to get user data
router.get('/user', requireAuth(), (req, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.json({
    id: req.auth.userId,
    email: req.auth.sessionClaims?.email,
  });
});

export function setupAuth(app: express.Express) {
  app.use(clerkMiddleware());
  app.use('/api/auth', router);
}
