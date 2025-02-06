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
              tokenLength: accessToken?.length
            });

            // Try multiple endpoints in sequence until we get valid user data
            let userInfo;
            let userEmail;

            // 1. Try OpenID Connect userinfo endpoint
            console.log('Trying OpenID Connect userinfo endpoint...');
            const userinfoResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'x-li-format': 'json',
                'X-Restli-Protocol-Version': '2.0.0'
              }
            });

            if (userinfoResponse.ok) {
              userInfo = await userinfoResponse.json();
              userEmail = userInfo.email;
              console.log('Successfully retrieved user info from OpenID endpoint');
            } else {
              console.log('OpenID userinfo endpoint failed:', await userinfoResponse.text());

              // 2. Try v2 /me endpoint with specific fields
              console.log('Trying /v2/me endpoint...');
              const meResponse = await fetch('https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture)', {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'x-li-format': 'json',
                  'X-Restli-Protocol-Version': '2.0.0',
                  'LinkedIn-Version': '202402'
                }
              });

              if (meResponse.ok) {
                const meData = await meResponse.json();
                console.log('Retrieved profile data:', { hasId: !!meData.id });

                // 3. Try email endpoint
                console.log('Trying email endpoint...');
                const emailResponse = await fetch('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'x-li-format': 'json',
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': '202402'
                  }
                });

                if (emailResponse.ok) {
                  const emailData = await emailResponse.json();
                  userEmail = emailData?.elements?.[0]?.['handle~']?.emailAddress;
                  userInfo = {
                    ...meData,
                    email: userEmail
                  };
                } else {
                  console.log('Email endpoint failed:', await emailResponse.text());
                  // Use ID as fallback
                  userEmail = `${meData.id}@linkedin.user`;
                  userInfo = meData;
                }
              } else {
                console.error('Failed to fetch profile:', await meResponse.text());
                return done(new Error('Failed to fetch user profile from all available endpoints'));
              }
            }

            if (!userEmail) {
              console.error('No email could be retrieved');
              return done(new Error('Could not retrieve user email'));
            }

            // Look up or create user
            console.log('Looking up user by email:', userEmail);
            let user = await storage.getUserByEmail(userEmail);

            if (!user) {
              console.log('Creating new user for email:', userEmail);
              const randomPassword = randomBytes(16).toString('hex');
              const hashedPassword = await hashPassword(randomPassword);

              user = await storage.createUser({
                email: userEmail,
                password: hashedPassword
              });
              console.log('Created new user:', user.id);
            } else {
              console.log('Found existing user:', user.id);
            }

            return done(null, user);
          } catch (error) {
            console.error('LinkedIn auth error:', error);
            return done(error);
          }
        }));

    // LinkedIn auth routes with improved logging
    app.get('/api/auth/linkedin',
      (req, res, next) => {
        console.log('LinkedIn auth request received', {
          session: req.session,
          sessionID: req.sessionID
        });
        passport.authenticate('linkedin', {
          state: true,
          scope: ['openid', 'profile', 'email', 'w_member_social']
        })(req, res, next);
      }
    );

    app.get('/api/auth/linkedin/callback',
      (req, res, next) => {
        console.log('LinkedIn callback received:', {
          query: req.query,
          hasSession: !!req.session,
          sessionID: req.sessionID,
          headers: req.headers
        });

        if (req.query.error) {
          console.error('LinkedIn auth error:', {
            error: req.query.error,
            description: req.query.error_description
          });
          return res.redirect(`/auth?error=${encodeURIComponent(req.query.error_description as string)}`);
        }

        passport.authenticate('linkedin', (err, user, info) => {
          console.log('LinkedIn authentication result:', {
            hasError: !!err,
            hasUser: !!user,
            info,
            session: req.session
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

            // Save session before redirect
            req.session.save((err) => {
              if (err) {
                console.error('Session save error:', err);
                return res.redirect('/auth?error=Session save failed');
              }
              console.log('Session saved successfully, redirecting to home page');
              res.redirect('/');
            });
          });
        })(req, res, next);
      }
    );
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