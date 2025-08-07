import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  insertLinguisticDatabaseSchema, 
  updateKnownWordsSchema, 
  exportRequestSchema, 
  insertPromptTemplateSchema,
  insertProcessingConfigSchema,
  insertProcessingJobSchema,
  reviewCardSchema,
  createBatchSchema,
  ankiReviewSchema,
  ankiStudyDecks,
  type WordEntry 
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { SpacedRepetitionService } from "./spacedRepetition";
import multer from "multer";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (user) {
        // Remove password hash from response
        const { passwordHash, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Demo endpoints to simulate different users (for testing multi-tenancy)
  app.get('/api/demo/user/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await storage.getUser(userId);
      const databases = await storage.getAllLinguisticDatabases(userId);
      
      res.json({
        user: user,
        databases: databases,
        message: `This user sees ${databases.length} databases`
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch demo user data" });
    }
  });
  
  // Get all linguistic databases (now user-filtered)
  app.get("/api/databases", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databases = await storage.getAllLinguisticDatabases(userId);
      res.json(databases);
    } catch (error) {
      console.error("Error fetching databases:", error);
      res.status(500).json({ message: "Failed to fetch databases" });
    }
  });

  // Get specific linguistic database
  app.get("/api/databases/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const database = await storage.getLinguisticDatabase(req.params.id, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }
      res.json(database);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch database" });
    }
  });

  // Create new linguistic database
  app.post("/api/databases", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = insertLinguisticDatabaseSchema.parse(req.body);
      const database = await storage.createLinguisticDatabase(validatedData, userId);
      res.status(201).json(database);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create database" });
      }
    }
  });

  // Initialize database from text (matching original script behavior)
  app.post("/api/databases/initialize", isAuthenticated, async (req: any, res) => {
    try {
      const { mode, inputText, filename } = req.body;
      
      if (mode !== 'initialize' || !inputText) {
        return res.status(400).json({ message: "Invalid request. Expected mode: 'initialize' and inputText." });
      }

      // Create database structure exactly like original script
      const transformedData = {
        name: filename || `Database_${Date.now()}`,
        description: `Initialized from text input on ${new Date().toLocaleDateString()}`,
        language: "Spanish", // Default to Spanish based on original behavior
        originalText: inputText, // Store the original input text
        wordCount: inputText.split(/\s+/).filter((word: string) => word.trim()).length,
        analysisData: [], // Empty - to be filled by AI processing later
        knownWords: [], // Empty initially
        segments: [] // Empty initially
      };

      const userId = req.user.id;
      const database = await storage.createLinguisticDatabase(transformedData, userId);
      
      // Automatically create associated Anki deck
      try {
        await storage.generateAnkiDeckFromDatabase(database.id, userId);
      } catch (error) {
        console.error("Failed to create Anki deck:", error);
        // Don't fail the database creation if Anki deck creation fails
      }
      
      res.status(201).json(database);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to initialize database" });
      }
    }
  });

  // Upload JSON database file
  app.post("/api/databases/upload", isAuthenticated, upload.single('jsonFile'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileContent = req.file.buffer.toString('utf-8');
      const jsonData = JSON.parse(fileContent);



      // Check if this is the user's format with inputText and wordDatabase
      if (jsonData.inputText && jsonData.wordDatabase) {
        // Transform from user's format to our schema
        const transformedData = {
          name: req.file.originalname.replace('.json', '') || "Uploaded Database",
          description: "Linguistic analysis database uploaded by user",
          language: "Spanish", // Default to Spanish based on sample
          originalText: jsonData.inputText,
          wordCount: Object.keys(jsonData.wordDatabase).length,
          analysisData: [],
          knownWords: [],
          segments: jsonData.segments || []
        };

        // Transform each word entry
        Object.entries(jsonData.wordDatabase).forEach(([id, wordData]: [string, any]) => {
          const transformedWord: WordEntry = {
            id: id,
            word: wordData.word,
            lemma: wordData.lemma || wordData.word,
            pos: wordData.pos || "UNKNOWN",
            translation: wordData.best_translation || wordData.translation || "",
            frequency: parseInt(wordData.freq) || 1,
            firstInstance: wordData.first_inst === "true" || wordData.first_inst === true,
            contextualInfo: {
              gender: wordData.details?.Gender,
              number: wordData.details?.Number,
              tense: wordData.details?.Tense,
              mood: wordData.details?.Mood,
              person: wordData.details?.Person,
            },
            position: parseInt(id),
            sentence: wordData.sentence || `Context for word: ${wordData.word}`
          };
          
          (transformedData.analysisData as WordEntry[]).push(transformedWord);
        });

        const userId = req.user.id;
        const database = await storage.createLinguisticDatabase(transformedData, userId);
        
        // Automatically create associated Anki deck
        try {
          await storage.generateAnkiDeckFromDatabase(database.id, userId);
        } catch (error) {
          console.error("Failed to create Anki deck:", error);
          // Don't fail the database creation if Anki deck creation fails
        }
        
        res.status(201).json(database);
      } else {
        // Try our original schema format
        if (!jsonData.name || !jsonData.language || !jsonData.originalText || !jsonData.analysisData) {
          return res.status(400).json({ 
            message: "Invalid JSON structure. Expected format with 'inputText' and 'wordDatabase' properties, or our schema format." 
          });
        }

        const validatedData = insertLinguisticDatabaseSchema.parse({
          name: jsonData.name,
          description: jsonData.description || "",
          language: jsonData.language,
          originalText: jsonData.originalText,
          wordCount: jsonData.analysisData.length,
          analysisData: jsonData.analysisData,
          knownWords: jsonData.knownWords || [],
          segments: jsonData.segments || []
        });

        const userId = req.user.id;
        const database = await storage.createLinguisticDatabase(validatedData, userId);
        
        // Automatically create associated Anki deck
        try {
          await storage.generateAnkiDeckFromDatabase(database.id, userId);
        } catch (error) {
          console.error("Failed to create Anki deck:", error);
          // Don't fail the database creation if Anki deck creation fails
        }
        
        res.status(201).json(database);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        res.status(400).json({ message: "Invalid JSON file" });
      } else if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to upload database" });
      }
    }
  });

  // Update known words for a database
  app.put("/api/databases/:id/known-words", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = updateKnownWordsSchema.parse({
        databaseId: req.params.id,
        knownWords: req.body.knownWords,
      });

      // First verify user owns this database
      const existingDatabase = await storage.getLinguisticDatabase(validatedData.databaseId, userId);
      if (!existingDatabase) {
        return res.status(404).json({ message: "Database not found" });
      }

      const database = await storage.updateKnownWords(validatedData.databaseId, validatedData.knownWords);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }

      res.json(database);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update known words" });
      }
    }
  });

  // Get words with pagination and filtering
  app.get("/api/databases/:id/words", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // First verify user owns this database
      const database = await storage.getLinguisticDatabase(req.params.id, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }
      
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const posFilter = req.query.posFilter ? (req.query.posFilter as string).split(',') : undefined;
      const knownWordsFilter = req.query.knownWordsFilter === 'true' ? true : 
                              req.query.knownWordsFilter === 'false' ? false : undefined;

      const result = await storage.getWordsByPage(req.params.id, page, pageSize, posFilter, knownWordsFilter);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch words" });
    }
  });

  // Get all analysis data for page view (no pagination)
  app.get("/api/databases/:id/analysis-data", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const database = await storage.getLinguisticDatabase(req.params.id, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }
      res.json(database.analysisData || []);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analysis data" });
    }
  });

  // Get unique words for list view
  app.get("/api/databases/:id/unique-words", async (req, res) => {
    try {
      const firstInstancesOnly = req.query.firstInstancesOnly === 'true';
      const words = await storage.getUniqueWords(req.params.id, firstInstancesOnly);
      res.json(words);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch unique words" });
    }
  });

  // Export database data
  app.post("/api/databases/:id/export", async (req, res) => {
    try {
      const exportRequest = exportRequestSchema.parse({
        databaseId: req.params.id,
        ...req.body,
      });

      const database = await storage.getLinguisticDatabase(exportRequest.databaseId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }

      let words: WordEntry[] = database.analysisData as WordEntry[];
      
      if (exportRequest.firstInstancesOnly) {
        words = words.filter(word => word.firstInstance);
      }

      if (exportRequest.format === 'csv') {
        const csvHeaders = ['Word', 'POS', 'Translation', 'Frequency', 'First Instance', 'Position', 'Sentence'];
        const csvRows = words.map(word => [
          word.word,
          word.pos,
          word.translation,
          word.frequency,
          word.firstInstance ? 'Yes' : 'No',
          word.position,
          word.sentence.replace(/"/g, '""'), // Escape quotes for CSV
        ]);
        
        const csvContent = [
          csvHeaders.join(','),
          ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${database.name}-export.csv"`);
        res.send(csvContent);
      } else {
        const jsonData = {
          name: database.name,
          description: database.description,
          language: database.language,
          originalText: database.originalText,
          wordCount: database.wordCount,
          analysisData: words,
          knownWords: exportRequest.includeKnownWords ? database.knownWords : [],
          exportedAt: new Date().toISOString(),
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${database.name}-export.json"`);
        res.json(jsonData);
      }
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to export data" });
      }
    }
  });

  // Delete database
  app.delete("/api/databases/:id", isAuthenticated, async (req: any, res) => {
    try {
      const success = await storage.deleteLinguisticDatabase(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Database not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete database" });
    }
  });

  // ==================== PROMPT TEMPLATES ====================
  
  // Get all prompt templates
  app.get("/api/prompt-templates", async (req, res) => {
    try {
      const templates = await storage.getAllPromptTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch prompt templates" });
    }
  });

  // Get specific prompt template
  app.get("/api/prompt-templates/:id", async (req, res) => {
    try {
      const template = await storage.getPromptTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Prompt template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch prompt template" });
    }
  });

  // Create new prompt template
  app.post("/api/prompt-templates", async (req, res) => {
    try {
      const validatedData = insertPromptTemplateSchema.parse(req.body);
      const template = await storage.createPromptTemplate(validatedData);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create prompt template" });
      }
    }
  });

  // Update prompt template
  app.put("/api/prompt-templates/:id", async (req, res) => {
    try {
      const updateData = insertPromptTemplateSchema.partial().parse(req.body);
      const template = await storage.updatePromptTemplate(req.params.id, updateData);
      if (!template) {
        return res.status(404).json({ message: "Prompt template not found" });
      }
      res.json(template);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update prompt template" });
      }
    }
  });

  // Delete prompt template
  app.delete("/api/prompt-templates/:id", async (req, res) => {
    try {
      const success = await storage.deletePromptTemplate(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Prompt template not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete prompt template" });
    }
  });

  // ==================== PROCESSING CONFIGS ====================
  
  // Get all processing configs
  app.get("/api/processing-configs", async (req, res) => {
    try {
      const configs = await storage.getAllProcessingConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch processing configs" });
    }
  });

  // Get specific processing config
  app.get("/api/processing-configs/:id", async (req, res) => {
    try {
      const config = await storage.getProcessingConfig(req.params.id);
      if (!config) {
        return res.status(404).json({ message: "Processing config not found" });
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch processing config" });
    }
  });

  // Create new processing config
  app.post("/api/processing-configs", async (req, res) => {
    try {
      const validatedData = insertProcessingConfigSchema.parse(req.body);
      const config = await storage.createProcessingConfig(validatedData);
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create processing config" });
      }
    }
  });

  // Update processing config
  app.put("/api/processing-configs/:id", async (req, res) => {
    try {
      const updateData = insertProcessingConfigSchema.partial().parse(req.body);
      const config = await storage.updateProcessingConfig(req.params.id, updateData);
      if (!config) {
        return res.status(404).json({ message: "Processing config not found" });
      }
      res.json(config);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update processing config" });
      }
    }
  });

  // Delete processing config
  app.delete("/api/processing-configs/:id", async (req, res) => {
    try {
      const success = await storage.deleteProcessingConfig(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Processing config not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete processing config" });
    }
  });

  // ==================== PROCESSING JOBS ====================
  
  // Get all processing jobs
  app.get("/api/processing-jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllProcessingJobs();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch processing jobs" });
    }
  });

  // Get processing jobs for a specific database
  app.get("/api/databases/:id/processing-jobs", async (req, res) => {
    try {
      const jobs = await storage.getProcessingJobsByDatabase(req.params.id);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch processing jobs" });
    }
  });

  // Get specific processing job
  app.get("/api/processing-jobs/:id", async (req, res) => {
    try {
      const job = await storage.getProcessingJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Processing job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch processing job" });
    }
  });

  // Create new processing job
  app.post("/api/processing-jobs", async (req, res) => {
    try {
      const validatedData = insertProcessingJobSchema.parse(req.body);
      const job = await storage.createProcessingJob(validatedData);
      res.status(201).json(job);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create processing job" });
      }
    }
  });

  // Update processing job (for status updates, progress, etc.)
  app.put("/api/processing-jobs/:id", async (req, res) => {
    try {
      const updateData = insertProcessingJobSchema.partial().parse(req.body);
      const job = await storage.updateProcessingJob(req.params.id, updateData);
      if (!job) {
        return res.status(404).json({ message: "Processing job not found" });
      }
      res.json(job);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update processing job" });
      }
    }
  });

  // Delete processing job
  app.delete("/api/processing-jobs/:id", async (req, res) => {
    try {
      const success = await storage.deleteProcessingJob(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Processing job not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete processing job" });
    }
  });

  // ==================== SEED DATA ====================
  
  // Initialize database with default templates
  app.post("/api/seed-database", async (req, res) => {
    try {
      // Check if we already have templates
      const existingTemplates = await storage.getAllPromptTemplates();
      if (existingTemplates.length > 0) {
        return res.json({ message: "Database already seeded", templates: existingTemplates.length });
      }

      // Create default prompt templates
      const defaultTemplates = [
        {
          name: "Translation Enhancement",
          description: "Improve word translations based on context",
          template: "Analyze these Spanish words and provide better translations based on their context:\n\n{words}\n\nFor each word, provide:\n1. Improved translation\n2. Contextual explanation\n3. Usage examples",
          category: "translation",
          isDefault: "true"
        },
        {
          name: "Grammar Analysis",
          description: "Analyze grammatical patterns and structures",
          template: "Analyze the grammatical patterns in these Spanish words:\n\n{words}\n\nProvide detailed analysis of:\n1. Verb conjugations\n2. Noun-adjective agreements\n3. Sentence structure patterns",
          category: "grammar",
          isDefault: "false"
        },
        {
          name: "Learning Difficulty Assessment",
          description: "Assess learning difficulty for vocabulary",
          template: "Assess the learning difficulty of these Spanish words for English speakers:\n\n{words}\n\nFor each word, rate:\n1. Difficulty level (1-5)\n2. Common confusion points\n3. Memory techniques",
          category: "learning",
          isDefault: "false"
        },
        {
          name: "Cultural Context",
          description: "Provide cultural and regional context for words",
          template: "Provide cultural and regional context for these Spanish words:\n\n{words}\n\nInclude:\n1. Regional variations\n2. Cultural significance\n3. Formal vs informal usage",
          category: "culture",
          isDefault: "false"
        }
      ];

      const createdTemplates = [];
      for (const template of defaultTemplates) {
        const created = await storage.createPromptTemplate(template);
        createdTemplates.push(created);
      }

      // Create default processing configs
      const defaultConfigs = [
        {
          name: "Quick Processing",
          modelName: "gemini-2.0-flash",
          batchSize: 20,
          concurrency: 3,
          promptTemplateId: createdTemplates[0].id,
          isDefault: "true"
        },
        {
          name: "Detailed Analysis",
          modelName: "gemini-2.0-pro",
          batchSize: 10,
          concurrency: 2,
          promptTemplateId: createdTemplates[1].id,
          isDefault: "false"
        }
      ];

      const createdConfigs = [];
      for (const config of defaultConfigs) {
        const created = await storage.createProcessingConfig(config);
        createdConfigs.push(created);
      }

      res.status(201).json({
        message: "Database seeded successfully",
        templates: createdTemplates.length,
        configs: createdConfigs.length
      });
    } catch (error) {
      console.error("Seed error:", error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to seed database" });
      }
    }
  });

  // Initialize file processing - equivalent to Python script --initialize-only
  app.post("/api/initialize-file", isAuthenticated, async (req: any, res) => {
    try {
      const { inputText, fileName } = req.body;
      const userId = req.user.id;
      
      if (!inputText || !fileName) {
        return res.status(400).json({ message: "Input text and file name are required" });
      }

      // Tokenize the text and create analysis data array
      const tokenRegex = /([\p{L}'']+)|(\s+)|(\n+)|([^\p{L}\s\n'']+)/gu;
      let currentWordIndex = 0;
      const analysisData: any[] = [];
      let match;

      console.log(`Starting tokenization for "${fileName}"...`);

      while ((match = tokenRegex.exec(inputText)) !== null) {
        const tokenText = match[0];
        const isWord = match[1]; // First capture group - letters/apostrophes

        if (isWord) {
          currentWordIndex++;
          
          // Create word entry matching our database schema
          analysisData.push({
            id: currentWordIndex.toString(),
            word: tokenText,
            lemma: tokenText.toLowerCase(), // Default lemma
            pos: "TBD",
            translation: "TBD",
            frequency: 1, // Default frequency
            firstInstance: true, // Will be calculated properly later
            contextualInfo: {
              gender: undefined,
              number: undefined,
              tense: undefined,
              mood: undefined,
              person: undefined
            },
            position: currentWordIndex,
            sentence: `Context for word: ${tokenText}` // Default context
          });
        }
      }

      // Create the linguistic database
      const databaseData = {
        name: fileName,
        description: `Initialized from text input - ${currentWordIndex} words found`,
        language: "Unknown", // Can be detected later
        originalText: inputText,
        wordCount: currentWordIndex,
        analysisData: analysisData,
        knownWords: [],
        segments: []
      };

      const database = await storage.createLinguisticDatabase(databaseData, userId);
      
      // Automatically create associated Anki deck
      try {
        await storage.generateAnkiDeckFromDatabase(database.id, userId);
      } catch (error) {
        console.error("Failed to create Anki deck:", error);
        // Don't fail the database creation if Anki deck creation fails
      }

      console.log(`File initialization complete: ${currentWordIndex} words found in "${fileName}"`);
      
      res.status(201).json({
        message: "File initialized and database created successfully",
        database: database,
        wordCount: currentWordIndex
      });

    } catch (error) {
      console.error("Error initializing file:", error);
      res.status(500).json({ message: "Failed to initialize file" });
    }
  });

  // Quick Processing - equivalent to Python script --resume-from with specific prompt
  app.post("/api/quick-processing", isAuthenticated, async (req: any, res) => {
    try {
      const { databaseId } = req.body;
      const userId = req.user.id;
      
      if (!databaseId) {
        return res.status(400).json({ message: "Database ID is required" });
      }

      // Get the database
      const database = await storage.getLinguisticDatabase(databaseId, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }

      // Check if Spanish prompt template exists, if not create it
      let spanishPrompt = await storage.getPromptTemplateByName("Spanish Analysis - Quick Processing");
      if (!spanishPrompt) {
        const spanishPromptData = {
          name: "Spanish Analysis - Quick Processing",
          description: "Comprehensive Spanish text analysis with translation, POS tagging, and idiom identification",
          template: `Analyze the following text segment and complete the provided JSON structure following the specific instruction order. **CRITICAL:** The output MUST be ONLY the completed JSON object, perfectly formatted, with no additional text, explanations, markdown formatting (like \`\`\`json), or invisible characters. Strictly adhere to valid JSON syntax, including double quotes for all keys and strings, and correct comma placement. Aim for the **absolute highest linguistic accuracy** and **strict adherence to Universal Dependencies (UD) standards** for Spanish as detailed below. **Execute ALL instructions thoroughly, sequentially, and meticulously; do not cut corners. Prioritize accuracy and completeness over speed. Take the necessary time to ensure every detail is correct.** The output will be parsed programmatically.

Text Segment:
"""
{BATCH_TEXT_HERE}
"""

JSON Structure to Complete:
\`\`\`json
{COMBINED_JSON_HERE}
Instructions (Follow in Order):

Segment Translation First:

Analyze the entire 'Text Segment'.
Add at least two accurate English translations into the "translations" object within the "segmentData" section (using the segment ID provided in the input JSON structure).
Use the key "en_variant1" for a direct, strictly literal translation, preserving original structure as much as possible while being grammatically correct English. Represent each word very closely to its core dictionary meaning in context. Ignore punctuation when translating.
Use the key "en_variant2" for the best-sounding, most natural, and idiomatic English translation, focusing on flow, capturing intended meaning, and using standard English punctuation.
You may add other variants if necessary.
wordData Analysis (Per Word):

Scope: Process ONLY the actual words. Completely IGNORE all punctuation. Ensure the final wordData object contains NO entries for punctuation.
Input Keys: Use the keys provided in {COMBINED_JSON_HERE} that correspond to words. Skip/ignore any keys potentially intended for punctuation.
CRITICAL: Independent & Sequential Analysis: Process each word token sequentially and carefully. Analyze each word instance independently. Do not assume a word's pos or lemma is the same as a previous instance of the identical word form within this text segment. Context determines the function and base form (e.g., que PRON vs. que SCONJ; se PRON vs. sé VERB). Always check the specific context for each token.
For each word entry: a. word: Ensure the value is always lowercase. b. pos (UPOS): CRITICAL POS Verification & Correction: Review the provided 'pos' tag (if not "TBD"). Rigorously verify this tag against the specific sentence context and standard Universal POS tags (UPOS) following Spanish UD guidelines [https://universaldependencies.org/es/index.html]. Correct the 'pos' tag ONLY if the provided tag is definitively incorrect according to UD standards and the context. Pay extreme attention to common Spanish ambiguities: * VERB vs. AUX: Meticulously apply standard UD distinctions (e.g., modal 'poder'+inf=AUX; 'ser'/'estar' as copula=AUX; 'haber' in perfect tenses=AUX; 'haber' for existence ('hay')=VERB). * PRON vs. DET vs. SCONJ (especially for 'que', 'cuyo'). * ADP vs. ADV (e.g., 'bajo'). * PART (e.g., 'no'). * Ensure PROPN is used correctly for proper nouns. Use the standard UD tag set: (NOUN, VERB, ADJ, ADP, PROPN, DET, CCONJ, PRON, ADV, AUX, SCONJ, NUM, PART, INTJ, X, SPACE). c. lemma (Lowercase & Orthographically Precise): CRITICAL: Lemma Accuracy is Paramount. Accurately fill in the lemma field with the precise, orthographically correct canonical base/dictionary form according to standard Spanish morphological analysis. The lemma MUST always be strictly lowercase. CRITICAL: Include required accent marks (diacritics) where they are part of the standard lemma's spelling (e.g., lemma of pronoun él is él, lemma of verb sé [I know] is saber, lemma of adverb más [more] is más, lemma of noun capitán is capitán). Do not omit necessary diacritics from the lemma. For contractions (e.g., 'del', 'al'), the lemma MUST be the lowercase canonical base form of the primary grammatical component (the preposition: 'de', 'a'). For pronouns, assign the standard canonical lemma used in Spanish UD conventions (typically the nominative singular or a specific reflexive form like 'se'). d. lemma_translations: Provide context-independent English translations for the precise, lowercase lemma from step 2c. Include a reasonable range of common meanings. CRITICAL: ONLY verbs should start with "to ". e. possible_translations: Provide context-independent English translations for the specific word form (word). Include a reasonable range of common alternative meanings. Store temporarily. f. best_translation (Strict Literal): Analyze context within the source 'Text Segment'. Select the single best literal translation from the list in 2e, prioritizing a core dictionary meaning of the word itself in that specific context. CRITICAL: Do not incorporate idiom meanings or translate the word's function in a way that deviates significantly from its core meaning (e.g., use "of" for 'de' indicating authorship; use "(I) had" for 'tenía' indicating age; translate components of idioms literally unless the component itself has no sensible literal meaning in context). g. Implied Subject: Use bracket notation (e.g., (I), (he/she/it)) at the start of best_translation for verbs where subject is implied by conjugation. Use (he/she/it) if gender is ambiguous from form alone. h. Format possible_translations: Populate the field using the list from 2e. Ensure best_translation (literal form) is included. Use bracket notation format "(pronoun) translation1, translation2" where applicable. best_translation capitalization should follow English rules (e.g., "Herman", but "of"). i. details (Strict UD Features): Adhere closely to standard UD features/values for Spanish ([https://universaldependencies.org/es/feat/]). * CRITICAL: Strings Only: ALL feature values MUST be strings (e.g., "1", "s", "Past") and NOT numbers or bare letters. * Appropriateness: Apply features ONLY where appropriate for the UPOS tag per UD guidelines. * Pronoun Case: MUST include Case (e.g., "Acc", "Dat", "Nom", "Obl") for PRON where applicable. * Contractions (del/al): The ADP entry (pos="ADP", lemma="de"/"a") MUST have details as {} or only contain features appropriate for the ADP itself (NO Gender/Number). * CRITICAL: Person Ambiguity: For verb forms ambiguous in person (e.g., imperfect 'ía'/'aba'), list ALL possible persons as a comma-separated string (e.g., Person="1,3"). * CRITICAL: Attached Clitics: For verbs with attached clitics (e.g., 'resistirme'), the VERB entry's details MUST include the clitic's features per UD guidelines (e.g., Reflex="Yes", Person="1", PronType="Prs"). Do not create separate entries for clitics. * CRITICAL EXCEPTION (Format): For Gender and Number values, MUST USE the single letters: m/f/n for Gender, s/p for Number. DO NOT USE Masc/Fem/Sing/Plur. Use standard UD value names (as strings) for all other features. * Leave details as {} if no standard UD features apply. j. Preserved Fields: Do NOT change pre-filled freq, freq_till_now, first_inst.
Expert Idiom Identification & Scoring:

Identify multi-word expressions that function as a single semantic unit, where the meaning is non-literal, figurative, or highly conventionalized. Assign an idiomaticity score from 1 to 3 based on the criteria below.
CRITICAL: Exclude proper named entities (like 'Puerto Montt', 'Polo Sur') unless the name itself is part of a separate established idiomatic expression. CRITICAL: Be conservative. Do not identify highly compositional phrases (e.g., 'mediados de diciembre', 'aeropuerto de Hamburgo') where the meaning is directly derived from the sum of the parts, even if common.
Assign scores as follows:
Score 1 (Highly Fixed Collocations / Semi-Idiomatic): Use for very common, structurally rigid phrases where the meaning is mostly literal or easily inferable, but has a degree of conventionalization or slight semantic shift, functioning as a fixed unit. These are common but still warrant capturing due to their fixed nature. (Examples: 'a bordo', 'de nuevo', 'pese a', 'tener en cuenta', 'sala de embarque', 'bolso de mano', 'cada vez mayor'). Use this score sparingly and only for truly fixed combinations that meet this criterion.
Score 2 (Standard Figurative Idioms): Use for common idioms where the overall meaning is clearly non-literal and cannot be directly derived from the individual word meanings, but the metaphorical connection might be somewhat understandable or the idiom is widely known. (Examples: 'tomar el pelo', 'dar la lata', 'ser pan comido', 'costar un ojo de la cara').
Score 3 (Opaque or Culturally Specific Idioms): Use for idioms where the meaning is highly opaque, figurative, and very difficult or impossible to guess from the literal meanings of the words. These may be less common, more culturally bound, or represent the "most difficult" level of idiomatic expression. (Examples: 'no tener pelos en la lengua', 'estar en Babia', 'irse por los cerros de Úbeda', 'buscar tres pies al gato').
For each valid idiom found: Add object to "idioms" array. Required fields: id, startWordKey, endWordKey (pointing to words), text (exact phrase), meaning, translation (idiomatic English, use "/"), idiomaticity_score (1-3 based on non-literalness).
If none found, use [].
MANDATORY Self-Correction Checklist: Perform a final, sequential pass through your generated data before generating the final JSON. Meticulously review against ALL points below. Correct any deviations rigorously. Do not skip checks.

JSON Validity & Formatting: Valid JSON? Overall indent okay? CRITICAL: Are wordData entries and idioms objects each entirely on a single line?
Punctuation Exclusion (Instr 2 Scope): Confirm: wordData contains ONLY words? ZERO punctuation entries?
Lowercase word (Instr 2a): Confirm: All word values lowercase?
Lemma Correctness (Instr 2c): CRITICAL Double-Check: Re-verify EVERY lemma against standard Spanish morphological analysis (canonical dictionary form). Confirm: Is every lemma strictly lowercase? Is orthography (including ALL required accent marks like in él, más, sé, capitán) perfect? Adherence must be absolute.
Contraction Lemmatization (Instr 2c): Verify: Lemma for del=de? Lemma for al=a? Is it the lemma of the primary component?
Pronoun Lemmatization (Instr 2c): Verify: Is the lemma for each PRON the standard canonical form per Spanish UD conventions (e.g., 'yo', 'él', 'se')?
Independent Analysis (Instr 2): Verify: Was each word instance analyzed independently for pos and lemma based on its context?
UPOS Tag Accuracy (Instr 2b): Verify: Standard UPOS used accurately? AUX/VERB distinction correct? Specific Rules Followed (no=PART, Quantifiers=ADJ)?
lemma_translations Format (Instr 2d): Verify: ONLY verbs start with "to "?
best_translation Literalness (Instr 2f): Verify: Strictly literal (core dictionary meaning)? Separated from idiom meaning? Components of idioms translated literally?
details - String Values (Instr 2i): Confirm: ALL values within details are STRINGS?
details - Gender/Number Format (Instr 2i EXCEPTION): CRITICAL Verify: m/f/n and s/p format used EXCLUSIVELY? Masc/Fem/Sing/Plur ABSENT?
details - Feature Appropriateness (Instr 2i): Verify: Features appropriate for POS? del/al details empty/minimal? Case on PRON correct?
details - Person Ambiguity (Instr 2i): Verify: Ambiguous persons listed (e.g., "1,3")?
details - Clitic Features (Instr 2i): Verify: Clitic features correctly added to main VERB entry?
Idiom Identification & Scoring (Instr 3): Verify: Only true idioms/set phrases? Proper names excluded? Compositional phrases excluded? List complete for text? Scores reflect non-literalness (per NEW definitions)? Conservative approach used?
Final Sanity Check: Reread the entire generated JSON one last time. Is every single field accurate according to all preceding instructions? Is the linguistic analysis sound? Is the formatting perfect? Confirm thoroughness has been prioritized.
Formatting Requirements:

The overall JSON structure should be pretty-printed (e.g., 2-space indent).
CRITICAL: Each individual entry within the wordData object (e.g., "1033": { ... }) MUST be formatted entirely on a single line.
CRITICAL: Each individual object within the idioms array ({ ... }) MUST be formatted entirely on a single line.
Take your time, be super careful, no cutting corners.`,
          category: "spanish",
          isDefault: "false"
        };
        spanishPrompt = await storage.createPromptTemplate(spanishPromptData);
      }

      // Get or create default quick processing config
      let quickConfig = await storage.getProcessingConfigByName("Quick Spanish Processing");
      if (!quickConfig) {
        const quickConfigData = {
          name: "Quick Spanish Processing",
          modelName: "gemini-2.5-flash",
          batchSize: 30,
          concurrency: 5,
          promptTemplateId: spanishPrompt.id,
          isDefault: "false"
        };
        quickConfig = await storage.createProcessingConfig(quickConfigData);
      }

      // Create processing job
      const job = await storage.createProcessingJob({
        databaseId,
        configId: quickConfig.id,
        status: "pending",
        progress: 0,
        totalBatches: 0,
        currentBatch: 0,
        results: {}
      });

      // Export database to JSON file for Python script
      const { writeFileSync } = await import('fs');
      const jsonFilePath = `/tmp/database_${databaseId}.json`;
      const promptFilePath = './server/prompt_es.txt';
      
      // Write database analysis_data to JSON file
      writeFileSync(jsonFilePath, JSON.stringify(database.analysisData, null, 2));
      
      // Mark job as processing
      await storage.updateProcessingJob(job.id, { status: 'processing' });

      // Execute the exact Python command you specified
      const { spawn } = await import('child_process');
      const python = spawn('python', [
        './server/process_llm.py',
        '--resume-from', jsonFilePath,
        '--output', jsonFilePath,
        '--model', 'gemini-2.5-flash',
        '--prompt', promptFilePath
      ], {
        stdio: 'pipe',
        env: { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY },
        cwd: process.cwd()
      });

      // Log any output for debugging
      python.stdout?.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
      });
      
      python.stderr?.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
      });

      python.on('close', async (code) => {
        console.log(`Python process exited with code ${code}`);
        
        try {
          if (code === 0) {
            // Read the processed JSON file back
            const { readFileSync, unlinkSync } = await import('fs');
            const processedData = JSON.parse(readFileSync(jsonFilePath, 'utf8'));
            
            // Update database with processed data
            await storage.updateLinguisticDatabase(databaseId, database.userId, {
              analysisData: processedData
            });
            
            // Mark job as completed
            await storage.updateProcessingJob(job.id, { 
              status: 'completed',
              progress: 100
            });
            
            console.log('✓ Quick processing completed successfully!');
            
            // Clean up temp file
            try {
              unlinkSync(jsonFilePath);
            } catch (e) {
              console.log('Could not clean up temp file:', e);
            }
          } else {
            // Mark job as failed
            await storage.updateProcessingJob(job.id, { 
              status: 'failed'
            });
            
            console.log('✗ Quick processing failed!');
          }
        } catch (error) {
          console.error('Error handling Python process completion:', error);
          await storage.updateProcessingJob(job.id, { status: 'failed' });
        }
      })

      res.status(201).json({
        message: "Quick processing started",
        jobId: job.id,
        status: job.status,
        config: {
          model: "gemini-2.5-flash",
          batchSize: 30,
          template: "Spanish Analysis - Quick Processing"
        }
      });

    } catch (error) {
      console.error("Quick processing error:", error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to start quick processing" });
      }
    }
  });

  // Start AI processing job
  app.post("/api/start-processing", async (req, res) => {
    try {
      const { databaseId, configId, promptTemplateId, userApiKey } = req.body;

      if (!databaseId) {
        return res.status(400).json({ message: "Database ID is required" });
      }

      // Get processing config
      let config = null;
      if (configId) {
        config = await storage.getProcessingConfig(configId);
      } else {
        // Use default config
        const configs = await storage.getAllProcessingConfigs();
        config = configs.find(c => c.isDefault === "true") || configs[0];
      }

      if (!config) {
        return res.status(400).json({ message: "No processing configuration found" });
      }

      // Get prompt template
      let promptTemplate = null;
      if (promptTemplateId) {
        promptTemplate = await storage.getPromptTemplate(promptTemplateId);
      } else if (config.promptTemplateId) {
        promptTemplate = await storage.getPromptTemplate(config.promptTemplateId);
      } else {
        // Use default template
        const templates = await storage.getAllPromptTemplates();
        promptTemplate = templates.find(t => t.isDefault === "true") || templates[0];
      }

      if (!promptTemplate) {
        return res.status(400).json({ message: "No prompt template found" });
      }

      // Create processing job
      const job = await storage.createProcessingJob({
        databaseId,
        configId: config.id,
        status: "pending",
        progress: 0,
        totalBatches: 0,
        currentBatch: 0,
        results: {}
      });

      // Prepare configuration for Python script
      const processingConfig = {
        database_id: databaseId,
        model_name: config.modelName,
        batch_size: config.batchSize,
        concurrency: config.concurrency,
        prompt_template: promptTemplate.template,
        api_key: userApiKey || undefined  // Pass user-provided API key if available
      };

      // Execute Python processing script asynchronously
      const { spawn } = await import('child_process');
      const python = spawn('python3', [
        './server/ai-processor.py',
        job.id,
        JSON.stringify(processingConfig)
      ], {
        detached: true,
        stdio: 'ignore'
      });

      python.unref(); // Allow parent process to continue

      res.status(201).json({
        message: "Processing job started",
        jobId: job.id,
        status: job.status,
        config: {
          model: config.modelName,
          batchSize: config.batchSize,
          template: promptTemplate.name
        }
      });

    } catch (error) {
      console.error("Processing start error:", error);
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to start processing" });
      }
    }
  });

  // === BATCH-BASED SPACED REPETITION API ROUTES ===
  
  // Create batches from first instances
  app.post('/api/spaced-repetition/create-batches', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = createBatchSchema.parse(req.body);
      
      // Get the database analysis data
      const database = await storage.getLinguisticDatabase(validatedData.databaseId, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }

      const batches = await SpacedRepetitionService.createBatchesFromFirstInstancesData(
        userId,
        validatedData.databaseId,
        database.analysisData as any[],
        [],
        validatedData.batchSize,
        validatedData.batchByUnknown,
        validatedData.newWordsOnly,
        true
      );
      
      res.status(201).json(batches);
    } catch (error) {
      console.error("Error creating batches:", error);
      res.status(500).json({ message: "Failed to create batches" });
    }
  });

  // Get all batches for a database
  app.get('/api/spaced-repetition/batches/:databaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      const batches = await SpacedRepetitionService.getBatchesForDatabase(userId, databaseId);
      res.json(batches);
    } catch (error) {
      console.error("Error fetching batches:", error);
      res.status(500).json({ message: "Failed to fetch batches" });
    }
  });

  // Get active batch and due cards
  app.get('/api/spaced-repetition/active-batch/:databaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      const activeBatch = await SpacedRepetitionService.getActiveBatch(userId, databaseId);
      const dueCards = await SpacedRepetitionService.getDueCardsFromActiveBatch(userId, databaseId);
      const allCards = await SpacedRepetitionService.getCardsFromActiveBatch(userId, databaseId);
      
      res.json({
        activeBatch,
        dueCards,
        allCards
      });
    } catch (error) {
      console.error("Error fetching active batch:", error);
      res.status(500).json({ message: "Failed to fetch active batch" });
    }
  });

  // Get cards from a specific batch number
  app.get('/api/spaced-repetition/batch-cards/:databaseId/:batchNumber', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      const batchNumber = parseInt(req.params.batchNumber);
      
      if (isNaN(batchNumber) || batchNumber < 1) {
        return res.status(400).json({ message: "Invalid batch number" });
      }
      
      const specificBatch = await SpacedRepetitionService.getBatchByNumber(userId, databaseId, batchNumber);
      const dueCards = await SpacedRepetitionService.getDueCardsFromBatch(userId, databaseId, batchNumber);
      const allCards = await SpacedRepetitionService.getCardsFromBatch(userId, databaseId, batchNumber);
      
      res.json({
        activeBatch: specificBatch,
        dueCards,
        allCards
      });
    } catch (error) {
      console.error("Error fetching batch cards:", error);
      res.status(500).json({ message: "Failed to fetch batch cards" });
    }
  });

  // Activate next batch
  app.post('/api/spaced-repetition/activate-next/:databaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      const nextBatch = await SpacedRepetitionService.activateNextBatch(userId, databaseId);
      res.json(nextBatch);
    } catch (error) {
      console.error("Error activating next batch:", error);
      res.status(500).json({ message: "Failed to activate next batch" });
    }
  });

  // Review a card (submit answer quality)
  app.post('/api/spaced-repetition/review', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = reviewCardSchema.parse(req.body);
      
      const updatedCard = await SpacedRepetitionService.reviewCard(
        validatedData.cardId, 
        validatedData.quality
      );
      
      res.json(updatedCard);
    } catch (error) {
      console.error("Error reviewing card:", error);
      res.status(500).json({ message: "Failed to review card" });
    }
  });

  // Generate flashcard batches using First Instances List logic  
  app.post("/api/spaced-repetition/generate-batches/:databaseId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      // Get the parameters from request body (same as First Instances List)
      const {
        batchSize = 25,
        batchByUnknown = true,
        newWordsOnly = true,
        firstInstancesOnly = true
      } = req.body;
      
      // Get database and its data
      const database = await storage.getLinguisticDatabase(databaseId, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }
      
      // Get unique words (same endpoint as First Instances List uses)
      const uniqueWords = await storage.getUniqueWords(databaseId, firstInstancesOnly);
      const knownWords = (database.knownWords as string[]) || [];
      
      // Clear existing batches and cards for this database
      await SpacedRepetitionService.clearBatchesForDatabase(userId, databaseId);
      
      // Create new batches using IDENTICAL logic to First Instances List
      const batches = await SpacedRepetitionService.createBatchesFromFirstInstancesData(
        userId,
        databaseId,
        uniqueWords,
        knownWords,
        batchSize,
        batchByUnknown,
        newWordsOnly,
        firstInstancesOnly
      );
      
      res.json({ 
        message: "Flashcard batches generated successfully", 
        batches: batches.length,
        totalWords: batches.reduce((sum, batch) => sum + batch.totalWords, 0)
      });
    } catch (error) {
      console.error('Error generating batches:', error);
      res.status(500).json({ message: "Failed to generate flashcard batches" });
    }
  });

  // Get batch learning statistics
  app.get('/api/spaced-repetition/batch-stats/:databaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      const stats = await SpacedRepetitionService.getBatchLearningStats(userId, databaseId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching batch learning stats:", error);
      res.status(500).json({ message: "Failed to fetch batch learning stats" });
    }
  });

  // Get all cards for a database
  app.get('/api/spaced-repetition/cards/:databaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      const cards = await SpacedRepetitionService.getCardsForDatabase(userId, databaseId);
      res.json(cards);
    } catch (error) {
      console.error("Error fetching cards:", error);
      res.status(500).json({ message: "Failed to fetch cards" });
    }
  });

  // Delete a card
  app.delete('/api/spaced-repetition/cards/:cardId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const cardId = req.params.cardId;
      
      await SpacedRepetitionService.deleteCard(cardId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting card:", error);
      res.status(500).json({ message: "Failed to delete card" });
    }
  });

  // Anki Study System API Routes
  // Get Anki deck for a database
  app.get('/api/anki/deck/:databaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      // First verify user owns this database
      const database = await storage.getLinguisticDatabase(databaseId, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }
      
      let deck = await storage.getAnkiDeckByDatabase(databaseId, userId);
      
      // If no deck exists, create one automatically
      if (!deck) {
        deck = await storage.createAnkiDeck({
          userId,
          databaseId,
          deckName: `${database.name} Flashcards`,
          totalCards: 0,
          newCards: 0,
          learningCards: 0,
          reviewCards: 0,
        });
        
        // Auto-create cards from first instance words
        if (database.analysisData && Array.isArray(database.analysisData)) {
          const firstInstanceWords = database.analysisData.filter((word: any) => 
            word.firstInstance && word.translation && word.translation.trim()
          );
          
          let createdCount = 0;
          for (const word of firstInstanceWords.slice(0, 200)) { // Limit to first 200
            try {
              await storage.createAnkiCard({
                userId,
                databaseId,
                deckId: deck.id,
                signature: `${word.word}::${word.pos || 'unknown'}`,
                wordKey: word.position || 0,
                word: word.word,
                translations: word.possible_translations && Array.isArray(word.possible_translations) 
                  ? word.possible_translations 
                  : (Array.isArray(word.translation) ? word.translation : [word.translation]),
                pos: word.pos || null,
                lemma: word.lemma || null,
                sentence: word.sentence || null,
                status: 'new',
                easeFactor: 2500,
                interval: 0,
                repetitions: 0,
                lapses: 0,
                due: new Date(),
              });
              createdCount++;
            } catch (error) {
              console.error('Error creating card for word:', word.word, error);
            }
          }
          
          // Update deck stats
          if (createdCount > 0) {
            await storage.updateAnkiDeck(deck.id, {
              totalCards: createdCount,
              newCards: createdCount,
            });
            
            deck = await storage.getAnkiDeckByDatabase(databaseId, userId);
          }
        }
      }
      
      res.json(deck);
    } catch (error) {
      console.error("Error fetching Anki deck:", error);
      res.status(500).json({ message: "Failed to fetch Anki deck" });
    }
  });

  // Get cards for an Anki deck with optional status filter
  app.get('/api/anki/cards/:deckId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const deckId = req.params.deckId;
      const status = req.query.status as string;
      
      // Get the deck to verify access and get database info
      const allDecks = await storage.getStudyQueue(deckId, 1000, 1000); // Get large batch to check deck exists
      if (allDecks.length === 0) {
        // Try to find the deck by ID through the database
        const deckQuery = await db.select().from(ankiStudyDecks).where(eq(ankiStudyDecks.id, deckId));
        if (deckQuery.length === 0 || deckQuery[0].userId !== userId) {
          return res.status(404).json({ message: "Deck not found" });
        }
      }
      
      const cards = await storage.getAnkiCards(deckId, status);
      
      // Add time tracking information to each card
      const cardsWithTimings = cards.map(card => ({
        ...card,
        timeInfo: storage.getTimeUntilDue(card)
      }));
      
      res.json(cardsWithTimings);
    } catch (error) {
      console.error("Error fetching Anki cards:", error);
      res.status(500).json({ message: "Failed to fetch Anki cards" });
    }
  });

  // Get cards due for review (legacy endpoint)
  app.get('/api/anki/deck/:deckId/due', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const deckId = req.params.deckId;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const dueCards = await storage.getAnkiCardsDue(deckId, limit);
      res.json(dueCards);
    } catch (error) {
      console.error("Error fetching due cards:", error);
      res.status(500).json({ message: "Failed to fetch due cards" });
    }
  });

  // Get study queue with proper Anki spaced repetition logic
  app.get('/api/anki/deck/:deckId/study-queue', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const deckId = req.params.deckId;
      const newCardLimit = parseInt(req.query.newCards as string) || 20;
      const reviewLimit = parseInt(req.query.reviewLimit as string) || 100;
      
      const studyQueue = await storage.getStudyQueue(deckId, newCardLimit, reviewLimit);
      res.json(studyQueue);
    } catch (error) {
      console.error("Error fetching study queue:", error);
      res.status(500).json({ message: "Failed to fetch study queue" });
    }
  });

  // Reset session counters for a new study session
  app.post('/api/anki/deck/:deckId/reset-session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const deckId = req.params.deckId;
      
      await storage.resetSessionCounts(deckId);
      res.json({ message: "Session counters reset successfully" });
    } catch (error) {
      console.error("Error resetting session:", error);
      res.status(500).json({ message: "Failed to reset session" });
    }
  });

  // Review an Anki card (submit rating)
  app.post('/api/anki/review', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = ankiReviewSchema.parse(req.body);
      const updatedCard = await storage.reviewAnkiCard(validatedData);
      
      if (!updatedCard) {
        return res.status(404).json({ message: "Card not found" });
      }
      
      res.json(updatedCard);
    } catch (error) {
      console.error("Error reviewing Anki card:", error);
      res.status(500).json({ message: "Failed to review Anki card" });
    }
  });

  // Generate new Anki deck from first-instance words
  app.post('/api/anki/generate-deck/:databaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      // First verify user owns this database
      const database = await storage.getLinguisticDatabase(databaseId, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }
      
      // Check if deck already exists and clear it
      let deck = await storage.getAnkiDeckByDatabase(databaseId, userId);
      if (deck) {
        // Clear existing cards
        await storage.clearAnkiCards(deck.id);
      } else {
        // Create new deck
        deck = await storage.createAnkiDeck({
          userId,
          databaseId,
          deckName: `${database.name} Flashcards`,
          totalCards: 0,
          newCards: 0,
          learningCards: 0,
          reviewCards: 0,
        });
      }
      
      // Get first-instance words from the database, maintaining order
      if (database.analysisData && Array.isArray(database.analysisData)) {
        const firstInstanceWords = database.analysisData
          .filter((word: any) => {
            // Check for both possible_translations and translation fields
            const hasTranslations = (word.possible_translations && Array.isArray(word.possible_translations) && word.possible_translations.length > 0) ||
                                   (word.translation && word.translation.trim());
            return word.firstInstance && hasTranslations;
          })
          .sort((a: any, b: any) => (a.position || 0) - (b.position || 0)); // Sort by position to maintain text order
        
        let createdCount = 0;
        for (const word of firstInstanceWords) {
          try {
            await storage.createAnkiCard({
              userId,
              databaseId,
              deckId: deck.id,
              signature: `${word.word}::${word.pos || 'unknown'}`,
              wordKey: word.position || createdCount, // Use position from text or fallback to index
              word: word.word,
              translations: word.possible_translations && Array.isArray(word.possible_translations) 
                ? word.possible_translations 
                : (Array.isArray(word.translation) ? word.translation : [word.translation]),
              pos: word.pos || null,
              lemma: word.lemma || null,
              sentence: word.sentence || null,
              status: 'new',
              easeFactor: 2500,
              interval: 0,
              repetitions: 0,
              lapses: 0,
              due: new Date(),
            });
            createdCount++;
          } catch (error) {
            console.error('Error creating card for word:', word.word, error);
          }
        }
        
        // Update deck stats
        await storage.updateAnkiDeck(deck.id, {
          totalCards: createdCount,
          newCards: createdCount,
          learningCards: 0,
          reviewCards: 0,
        });
        
        // Fetch updated deck
        deck = await storage.getAnkiDeckByDatabase(databaseId, userId);
      }
      
      res.json({ 
        message: "Anki deck generated successfully",
        deck: deck,
        totalCards: deck?.totalCards || 0
      });
    } catch (error) {
      console.error("Error generating Anki deck:", error);
      res.status(500).json({ message: "Failed to generate Anki deck" });
    }
  });

  // Regenerate Anki deck from database (useful for updates)
  app.post('/api/anki/regenerate/:databaseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const databaseId = req.params.databaseId;
      
      // First verify user owns this database
      const database = await storage.getLinguisticDatabase(databaseId, userId);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }
      
      // Reset all existing cards to "new" status before regenerating
      await storage.resetAnkiDeckProgress(databaseId, userId);
      
      const deck = await storage.generateAnkiDeckFromDatabase(databaseId, userId);
      res.json({
        ...deck,
        message: "Deck regenerated successfully - all progress reset"
      });
    } catch (error) {
      console.error("Error regenerating Anki deck:", error);
      res.status(500).json({ message: "Failed to regenerate Anki deck" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
