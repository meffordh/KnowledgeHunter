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
import fetch from "node-fetch";

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

export function setupAuth(app: Express) {
  console.log('Setting up authentication...');

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

  if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    console.log('Setting up LinkedIn authentication strategy');

    const callbackURL = 'https://deep-research-web-interface-meffordh.replit.app/api/auth/linkedin/callback';
    console.log('LinkedIn callback URL:', callbackURL);

    passport.use(new LinkedInStrategy({
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL,
      scope: ['openid', 'profile', 'email', 'w_member_social'],
      state: true,
      proxy: true
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('LinkedIn auth callback received:', {
          hasToken: !!accessToken,
          tokenLength: accessToken?.length,
          profile: profile ? 'exists' : 'undefined'
        });

        // Fetch LinkedIn profile
        console.log('Fetching LinkedIn profile...');
        const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202402'
          }
        });

        // Fetch LinkedIn email
        console.log('Fetching LinkedIn email...');
        const emailResponse = await fetch(
          'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
              'LinkedIn-Version': '202402'
            }
          }
        );

        let profileData = null;
        let emailData = null;

        if (profileResponse.ok) {
          profileData = await profileResponse.json();
          console.log('Successfully retrieved profile:', {
            hasId: !!profileData.id,
          });
        } else {
          console.error('Profile request failed:', {
            status: profileResponse.status,
            error: await profileResponse.text()
          });
        }

        if (emailResponse.ok) {
          emailData = await emailResponse.json();
          console.log('Successfully retrieved email data');
        } else {
          console.error('Email request failed:', {
            status: emailResponse.status,
            error: await emailResponse.text()
          });
        }

        // If both requests fail, return error
        if (!profileData && !emailData) {
          return done(new Error('Failed to fetch user profile and email'));
        }

        // Extract email from response or fallback
        const email = emailData?.elements?.[0]?.['handle~']?.emailAddress
          || profile?.emails?.[0]?.value
          || `${profileData?.id || 'unknown'}@linkedin.user`;
        console.log('Looking up user by email:', email);
        let user = await storage.getUserByEmail(email);

        if (!user) {
          console.log('Creating new user for email:', email);
          const randomPassword = randomBytes(16).toString('hex');
          const hashedPassword = await hashPassword(randomPassword);
          user = await storage.createUser({
            email,
            password: hashedPassword
          });
          console.log('Created new user:', user.id);
        } else {
          console.log('Found existing user:', user.id);
        }

        return done(null, user);
      } catch (error) {
        console.error('LinkedIn authentication error:', error);
        return done(error);
      }
    }));

    // LinkedIn auth routes
    app.get('/api/auth/linkedin', (req, res, next) => {
      console.log('LinkedIn auth request received', {
        session: req.session,
        sessionID: req.sessionID
      });
      passport.authenticate('linkedin')(req, res, next);
    });

    app.get('/api/auth/linkedin/callback', (req, res, next) => {
      console.log('LinkedIn callback received:', {
        query: req.query,
        hasSession: !!req.session,
        sessionID: req.sessionID
      });

      if (req.query.error) {
        console.error('LinkedIn auth error:', req.query);
        return res.redirect(`/auth?error=${encodeURIComponent(req.query.error_description as string)}`);
      }

      passport.authenticate('linkedin', (err, user, info) => {
        console.log('LinkedIn authentication result:', {
          hasError: !!err,
          hasUser: !!user,
          info: info
        });

        if (err) {
          console.error('Authentication error:', err);
          return res.redirect(`/auth?error=${encodeURIComponent(err.message)}`);
        }

        if (!user) {
          console.log('Authentication failed:', info);
          return res.redirect('/auth?error=Authentication failed');
        }

        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error('Login error:', loginErr);
            return res.redirect(`/auth?error=${encodeURIComponent(loginErr.message)}`);
          }

          console.log('Successfully logged in user:', user.id);
          res.redirect('/');
        });
      })(req, res, next);
    });
  } else {
    console.warn('LinkedIn credentials not found, LinkedIn authentication will not be available');
  }

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