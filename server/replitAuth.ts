import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import fs from 'fs';
import path from 'path';

// Validate required environment variables for authentication
function validateEnvironmentVariables() {
  const requiredVars = ['SESSION_SECRET'];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}.\n` +
      `Please add these variables to your deployment secrets.`;
    throw new Error(errorMessage);
  }
}

// Validate environment variables on module load
validateEnvironmentVariables();

// Hash password utility
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password utility
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

// Create sample database for new users
async function createSampleDatabase(userId: string) {
  try {
    const sampleFilePath = path.join(process.cwd(), 'sample-mundo-database.json');
    
    if (fs.existsSync(sampleFilePath)) {
      const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf8'));
      
      // Create the sample database
      const database = await storage.createLinguisticDatabase({
        name: "Call Me Ishmael (Spanish Sample)",
        description: "Sample Spanish text analysis - Call Me Ishmael excerpt with full linguistic analysis",
        language: "Spanish",
        inputText: sampleData.inputText,
        wordDatabase: sampleData.wordDatabase,
        knownWords: []
      }, userId);
      
      console.log(`Created sample database for user ${userId}: ${database.id}`);
      return database;
    } else {
      console.log('Sample database file not found, skipping sample creation');
    }
  } catch (error) {
    console.error('Error creating sample database:', error);
    // Don't throw error - this is optional
  }
}

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

// Setup Local Strategy for username/password authentication
function setupLocalStrategy() {
  passport.use(new LocalStrategy(
    async (username: string, password: string, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          return done(null, false, { message: 'Invalid username or password' });
        }
        
        const isValidPassword = await verifyPassword(password, user.passwordHash);
        
        if (!isValidPassword) {
          return done(null, false, { message: 'Invalid username or password' });
        }
        
        // Return user without password hash
        const { passwordHash, ...userWithoutPassword } = user;
        return done(null, userWithoutPassword);
      } catch (error) {
        return done(error);
      }
    }
  ));
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Setup local strategy
  setupLocalStrategy();

  // Serialize user for sessions
  passport.serializeUser((user: any, cb) => {
    cb(null, user.id);
  });

  passport.deserializeUser(async (id: string, cb) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        const { passwordHash, ...userWithoutPassword } = user;
        cb(null, userWithoutPassword);
      } else {
        cb(null, false);
      }
    } catch (error) {
      cb(error);
    }
  });

  // Login route
  app.post("/api/login", (req, res, next) => {
    passport.authenticate('local', (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ error: 'Authentication error' });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || 'Authentication failed' });
      }
      
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Login error' });
        }
        return res.json({ user, message: 'Login successful' });
      });
    })(req, res, next);
  });

  // Register route
  app.post("/api/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // Basic validation
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const newUser = await storage.createUser({
        username,
        passwordHash,
      });

      // Create sample database for the new user
      await createSampleDatabase(newUser.id);

      // Remove password hash from response
      const { passwordHash: _, ...userWithoutPassword } = newUser;
      
      // Auto-login the user
      req.logIn(userWithoutPassword, (err) => {
        if (err) {
          console.error('Auto-login error:', err);
          return res.status(500).json({ error: 'Registration successful but auto-login failed. Please log in manually.' });
        }
        return res.json({ user: userWithoutPassword, message: 'Registration successful' });
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      
      // Handle specific database errors
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
      }
      
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  // Logout route
  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      // Destroy the session completely
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
        }
        // Clear the session cookie
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};