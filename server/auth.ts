
import type { Express } from "express";
import passport from "passport";
import { Strategy as LinkedInStrategy } from "passport-linkedin-oauth2";
import session from "express-session";
import MemoryStore from "memorystore";
import { storage } from "./storage";

const MemoryStoreSession = MemoryStore(session);

export function setupAuth(app: Express) {
  // Session setup
  app.use(
    session({
      store: new MemoryStoreSession({
        checkPeriod: 86400000 // prune expired entries every 24h
      }),
      secret: process.env.AUTH_SECRET || process.env.REPL_ID || 'development-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: process.env.NODE_ENV === "production" }
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LinkedInStrategy(
      {
        clientID: process.env.AUTH_LINKEDIN_ID || '',
        clientSecret: process.env.AUTH_LINKEDIN_SECRET || '',
        callbackURL: "/api/auth/linkedin/callback",
        scope: ["openid", "profile", "email"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await storage.getUserByEmail(profile.emails[0].value);
          
          if (!user) {
            user = await storage.createUser({
              email: profile.emails[0].value,
              name: profile.displayName,
              provider: "linkedin",
              providerId: profile.id
            });
          }
          
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Auth routes
  app.get("/api/auth/linkedin", passport.authenticate("linkedin"));
  
  app.get(
    "/api/auth/linkedin/callback",
    passport.authenticate("linkedin", {
      successRedirect: "/",
      failureRedirect: "/auth",
    })
  );

  app.post("/api/logout", (req, res) => {
    req.logout(() => {
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.user) {
      return res.sendStatus(401);
    }
    res.json(req.user);
  });
}
