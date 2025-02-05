import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as LinkedInStrategy } from "passport-linkedin-oauth2";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { pool } from "./db";
import connectPg from "connect-pg-simple";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresStore = connectPg(session);

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

export function setupAuth(app: Express) {
  console.log('Setting up authentication...');

  const sessionStore = new PostgresStore({
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

  // Add LinkedIn Strategy
  passport.use(new LinkedInStrategy({
    clientID: process.env.LINKEDIN_CLIENT_ID!,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    callbackURL: "https://deep-research-web-interface-meffordh.replit.app/api/auth/linkedin/callback",
    scope: ['r_emailaddress', 'r_liteprofile'],
    state: true
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('LinkedIn auth callback with profile:', profile.id);
      const email = profile.emails?.[0]?.value;

      if (!email) {
        console.error('No email provided by LinkedIn');
        return done(new Error('No email provided by LinkedIn'));
      }

      // Check if user exists
      let user = await storage.getUserByEmail(email);

      if (!user) {
        // Create new user with random password for LinkedIn users
        const randomPassword = randomBytes(16).toString('hex');
        const hashedPassword = await hashPassword(randomPassword);

        user = await storage.createUser({
          email,
          password: hashedPassword
        });
        console.log('Created new user for LinkedIn auth:', user.id);
      }

      done(null, user);
    } catch (error) {
      console.error('LinkedIn auth error:', error);
      done(error);
    }
  }));

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
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  // Add LinkedIn auth routes
  app.get('/api/auth/linkedin',
    passport.authenticate('linkedin', { state: true }));

  app.get('/api/auth/linkedin/callback',
    passport.authenticate('linkedin', {
      successRedirect: '/',
      failureRedirect: '/auth'
    }));

  // Existing routes
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
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: "Registration failed", details: error.message });
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log('Login request received:', req.body.email);
    passport.authenticate("local", (err, user, info) => {
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

  app.get("/api/user", (req, res) => {
    console.log('User request received, authenticated:', req.isAuthenticated());
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    res.json({
      id: req.user.id,
      email: req.user.email,
      researchCount: req.user.researchCount
    });
  });
}