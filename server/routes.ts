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
  type WordEntry 
} from "@shared/schema";
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
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  
  // Get all linguistic databases (now user-filtered)
  app.get("/api/databases", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const databases = await storage.getAllLinguisticDatabases(userId);
      res.json(databases);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch databases" });
    }
  });

  // Get specific linguistic database
  app.get("/api/databases/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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

      const userId = req.user.claims.sub;
      const database = await storage.createLinguisticDatabase(transformedData, userId);
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

        const userId = req.user.claims.sub;
        const database = await storage.createLinguisticDatabase(transformedData, userId);
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

        const userId = req.user.claims.sub;
        const database = await storage.createLinguisticDatabase(validatedData, userId);
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      
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
      const userId = req.user.claims.sub;
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
      const { spawn } = require('child_process');
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

  const httpServer = createServer(app);
  return httpServer;
}
