
import { ClerkExpressRequireAuth } from '@clerk/express';
import express from 'express';

const router = express.Router();

const clerkMiddleware = ClerkExpressRequireAuth({});

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
