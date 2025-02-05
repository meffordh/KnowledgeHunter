import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

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

  // Configure session middleware with secure settings for Replit
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || 'your-fallback-secret',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: false, // Set to false for non-HTTPS development
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: 'lax'
    },
    name: 'researchhunter.sid' // Custom session name
  };

  // Trust proxy in production (Replit environment)
  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    if (sessionSettings.cookie) {
      sessionSettings.cookie.secure = true;
    }
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        console.log('Attempting login with email:', email);
        try {
          const user = await storage.getUserByEmail(email);
          if (!user || !(await comparePasswords(password, user.password))) {
            console.log('Login failed: Invalid credentials');
            return done(null, false, { message: 'Invalid email or password' });
          }
          console.log('Login successful for user:', user.id);
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
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      console.error('Deserialize error:', error);
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    console.log('Received registration request for email:', req.body.email);

    try {
      if (!req.body.email || !req.body.password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const existingUser = await storage.getUserByEmail(req.body.email);
      if (existingUser) {
        console.log('Registration failed: Email already exists');
        return res.status(400).json({ error: "Email already registered" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        email: req.body.email,
        password: hashedPassword,
      });

      console.log('User created successfully:', user.id);

      req.login(user, (err) => {
        if (err) {
          console.error('Login after registration failed:', err);
          return next(err);
        }
        res.status(201).json({ id: user.id, email: user.email, researchCount: user.researchCount });
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error('Login error:', err);
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || 'Invalid credentials' });
      }
      req.login(user, (err) => {
        if (err) {
          console.error('Login error:', err);
          return next(err);
        }
        console.log('Login successful, sending user data');
        res.json({ id: user.id, email: user.email, researchCount: user.researchCount });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    console.log('Logout request received');
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    console.log('User request received, authenticated:', req.isAuthenticated());
    if (!req.isAuthenticated()) {
      console.log('Unauthorized access to /api/user');
      return res.sendStatus(401);
    }
    res.json({
      id: req.user.id,
      email: req.user.email,
      researchCount: req.user.researchCount
    });
  });

  // Add endpoints for research reports
  app.get("/api/reports", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthorized access to /api/reports');
      return res.sendStatus(401);
    }
    try {
      const reports = await storage.getUserReports(req.user.id);
      res.json(reports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });
  // Add middleware to check research limit
  app.use("/api/research", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthorized access to /api/research');
      return res.sendStatus(401);
    }

    const count = await storage.getUserResearchCount(req.user.id);
    if (count >= 100) {
      console.log('Research limit reached for user:', req.user.id);
      return res.status(403).json({ 
        error: "Research limit reached", 
        message: "You have reached the maximum limit of 100 research queries."
      });
    }

    next();
  });
}