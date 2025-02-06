import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import express from 'express';
import Express from '@auth/express';
const Auth = Express.Auth;
import LinkedInProvider from '@auth/core/providers/linkedin';
import { storage } from "./storage";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { pool } from "./db";
import connectPg from "connect-pg-simple";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

const router = express.Router();

// Configure Auth.js with the LinkedIn provider
router.use(
  '/',
  Auth({
    providers: [
      LinkedInProvider({
        clientId: process.env.AUTH_LINKEDIN_ID || '',
        clientSecret: process.env.AUTH_LINKEDIN_SECRET || '',
        authorization: {
          params: {
            scope: 'openid profile email'
          }
        }
      }),
    ],
    secret: process.env.AUTH_SECRET || process.env.REPL_ID || 'development-secret',
    session: { strategy: 'jwt' },
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!profile?.email) {
          return false;
        }

        // Find or create user in our database
        let dbUser = await storage.getUserByEmail(profile.email);
        if (!dbUser) {
          dbUser = await storage.createUser({
            email: profile.email,
            password: '' // We don't need password for OAuth users
          });
        }

        return true;
      },
      async session({ session, token }) {
        if (session.user?.email) {
          const dbUser = await storage.getUserByEmail(session.user.email);
          if (dbUser) {
            session.user.id = dbUser.id;
            session.user.researchCount = dbUser.researchCount;
          }
        }
        return session;
      }
    },
    pages: {
      signIn: '/auth',
      error: '/auth'
    },
  })
);

export function setupAuth(app: express.Express) {
  console.log('Setting up authentication...');
  app.use('/api/auth', router);

  const sessionStore = new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
    tableName: 'session'
  });

  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || 'development-secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    },
    name: 'researchhunter.sid'
  };

  if (app.get('env') === 'production') {
    app.set('trust proxy', 1);
    if (sessionSettings.cookie) {
      sessionSettings.cookie.secure = true;
    }
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    console.log('Deserializing user:', id);
    try {
      const user = await storage.getUser(id);
      if (!user) {
        console.log('Deserialization failed: User not found:', id);
        return done(null, false);
      }
      console.log('Successfully deserialized user:', user.id);
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });


  // Local Strategy
  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        console.log('Login attempt with email:', email);
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) {
            console.log('Login failed: User not found');
            return done(null, false, { message: 'Invalid email or password' });
          }
          const isValid = await comparePasswords(password, user.password);
          console.log('Password validation:', isValid ? 'success' : 'failed');
          if (!isValid) {
            return done(null, false, { message: 'Invalid email or password' });
          }
          return done(null, user);
        } catch (error) {
          console.error('Login error:', error);
          return done(error);
        }
      }
    )
  );

  app.post("/api/register", async (req, res) => {
    console.log('Registration request received:', req.body);
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        console.log('Registration failed: Missing email or password');
        return res.status(400).json({ error: "Email and password are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        console.log('Registration failed: Email already exists');
        return res.status(400).json({ error: "Email already registered" });
      }

      const hashedPassword = await hashPassword(password);
      console.log('Creating new user with email:', email);
      const user = await storage.createUser({
        email,
        password: hashedPassword
      });

      console.log('User created successfully:', user.id);

      req.login(user, (err) => {
        if (err) {
          console.error('Login after registration failed:', err);
          return res.status(500).json({ error: "Login failed after registration" });
        }
        console.log('User logged in after registration:', user.id);
        return res.status(201).json({
          id: user.id,
          email: user.email,
          researchCount: user.researchCount
        });
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ error: "Registration failed", details: error.message });
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log('Login request received:', req.body.email);
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: "Login failed" });
      }
      if (!user) {
        console.log('Login failed: Invalid credentials');
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error('Login session creation failed:', err);
          return res.status(500).json({ error: "Login session creation failed" });
        }
        console.log('Login successful:', user.id);
        res.json({
          id: user.id,
          email: user.email,
          researchCount: user.researchCount
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    console.log('Logout request received');
    req.logout((err) => {
      if (err) {
        console.error('Logout failed:', err);
        return res.status(500).json({ error: "Logout failed" });
      }
      console.log('Logout successful');
      res.sendStatus(200);
    });
  });

  // User endpoint from edited code
  app.get("/api/user", async (req, res) => {
    const session = await Auth.getSession(req);
    if (!session?.user?.email) {
      return res.sendStatus(401);
    }

    const user = await storage.getUserByEmail(session.user.email);
    if (!user) {
      return res.sendStatus(401);
    }

    res.json({
      id: user.id,
      email: user.email,
      researchCount: user.researchCount
    });
  });
}

import { User as SelectUser } from "@shared/schema";