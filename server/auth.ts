
import { ClerkExpressWithAuth } from '@clerk/express';
import express from 'express';

const router = express.Router();

// Initialize clerk middleware
const auth = ClerkExpressWithAuth();

// Protected route to get user data
router.get('/user', auth, (req, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  res.json({
    id: req.auth.userId,
    email: req.auth.sessionClaims?.email,
    firstName: req.auth.sessionClaims?.firstName,
    lastName: req.auth.sessionClaims?.lastName
  });
});

export function setupAuth(app: express.Express) {
  // Mount auth router
  app.use('/api/auth', router);
}
