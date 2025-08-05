import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLinguisticDatabaseSchema, updateKnownWordsSchema, exportRequestSchema, type WordEntry } from "@shared/schema";
import multer from "multer";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Get all linguistic databases
  app.get("/api/databases", async (req, res) => {
    try {
      const databases = await storage.getAllLinguisticDatabases();
      res.json(databases);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch databases" });
    }
  });

  // Get specific linguistic database
  app.get("/api/databases/:id", async (req, res) => {
    try {
      const database = await storage.getLinguisticDatabase(req.params.id);
      if (!database) {
        return res.status(404).json({ message: "Database not found" });
      }
      res.json(database);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch database" });
    }
  });

  // Create new linguistic database
  app.post("/api/databases", async (req, res) => {
    try {
      const validatedData = insertLinguisticDatabaseSchema.parse(req.body);
      const database = await storage.createLinguisticDatabase(validatedData);
      res.status(201).json(database);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create database" });
      }
    }
  });

  // Upload JSON database file
  app.post("/api/databases/upload", upload.single('jsonFile'), async (req: Request & { file?: Express.Multer.File }, res) => {
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
          knownWords: []
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

        const database = await storage.createLinguisticDatabase(transformedData);
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
        });

        const database = await storage.createLinguisticDatabase(validatedData);
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
  app.put("/api/databases/:id/known-words", async (req, res) => {
    try {
      const validatedData = updateKnownWordsSchema.parse({
        databaseId: req.params.id,
        knownWords: req.body.knownWords,
      });

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
  app.get("/api/databases/:id/words", async (req, res) => {
    try {
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
  app.delete("/api/databases/:id", async (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
