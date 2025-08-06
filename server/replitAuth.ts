import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// Validate required environment variables for authentication
function validateEnvironmentVariables() {
  const missingVars = [];
  
  // SESSION_SECRET must be manually set by user
  if (!process.env.SESSION_SECRET) {
    missingVars.push('SESSION_SECRET');
  }
  
  // REPLIT_DOMAINS and REPL_ID should be auto-provided by Replit
  // but may not be available during build time
  if (!process.env.REPLIT_DOMAINS) {
    missingVars.push('REPLIT_DOMAINS (should be auto-provided by Replit)');
  }
  
  if (!process.env.REPL_ID) {
    missingVars.push('REPL_ID (should be auto-provided by Replit)');
  }
  
  if (missingVars.length > 0) {
    console.error('Missing environment variables for authentication:', missingVars);
    
    const errorMessage = `Missing required environment variables for authentication: ${missingVars.join(', ')}.\n\n` +
      `DEPLOYMENT SETUP INSTRUCTIONS:\n` +
      `1. Add SESSION_SECRET to your deployment secrets (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")\n` +
      `2. REPLIT_DOMAINS and REPL_ID should be automatically provided by Replit\n` +
      `3. If auto-provided variables are missing, check your deployment configuration\n\n` +
      `For detailed setup instructions, see: DEPLOYMENT_SETUP.md`;
    throw new Error(errorMessage);
  }
}

// Validate environment variables on module load
validateEnvironmentVariables();

const getOidcConfig = memoize(
  async () => {
    if (!process.env.REPL_ID) {
      throw new Error("REPL_ID environment variable is required for OIDC configuration");
    }
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required for session management");
  }
  
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  if (!process.env.REPLIT_DOMAINS) {
    throw new Error("REPLIT_DOMAINS environment variable is required for authentication setup");
  }

  for (const domain of process.env.REPLIT_DOMAINS.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    if (!process.env.REPL_ID) {
      return res.status(500).json({ error: "REPL_ID environment variable is required for logout" });
    }
    
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};