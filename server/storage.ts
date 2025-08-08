import { 
  users,
  type User,
  type UpsertUser,
  type LinguisticDatabase, 
  type InsertLinguisticDatabase, 
  type WordEntry, 
  type UpdateKnownWordsRequest,
  type PromptTemplate,
  type InsertPromptTemplate,
  type ProcessingConfig,
  type InsertProcessingConfig,
  type ProcessingJob,
  type InsertProcessingJob,
  type AnkiStudyDeck,
  type InsertAnkiStudyDeck,
  type AnkiFlashcard,
  type InsertAnkiFlashcard,
  type AnkiReview,
  linguisticDatabases,
  promptTemplates,
  processingConfigs,
  processingJobs,
  ankiStudyDecks,
  ankiFlashcards
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations for local authentication
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(userData: {
    username: string;
    passwordHash: string;
  }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Linguistic Database CRUD operations (now user-filtered)
  getLinguisticDatabase(id: string, userId?: string): Promise<LinguisticDatabase | undefined>;
  getAllLinguisticDatabases(userId?: string): Promise<LinguisticDatabase[]>;
  createLinguisticDatabase(database: InsertLinguisticDatabase, userId?: string): Promise<LinguisticDatabase>;
  updateLinguisticDatabase(id: string, database: Partial<InsertLinguisticDatabase>): Promise<LinguisticDatabase | undefined>;
  deleteLinguisticDatabase(id: string): Promise<boolean>;
  
  // Known words management
  updateKnownWords(databaseId: string, knownWords: string[]): Promise<LinguisticDatabase | undefined>;
  
  // Analysis operations
  getWordsByPage(databaseId: string, page: number, pageSize: number, posFilter?: string[], knownWordsFilter?: boolean): Promise<{ words: WordEntry[], totalPages: number, totalWords: number }>;
  getUniqueWords(databaseId: string, firstInstancesOnly?: boolean): Promise<WordEntry[]>;

  // Prompt Templates CRUD operations
  getPromptTemplate(id: string): Promise<PromptTemplate | undefined>;
  getPromptTemplateByName(name: string): Promise<PromptTemplate | undefined>;
  getAllPromptTemplates(): Promise<PromptTemplate[]>;
  createPromptTemplate(template: InsertPromptTemplate): Promise<PromptTemplate>;
  updatePromptTemplate(id: string, template: Partial<InsertPromptTemplate>): Promise<PromptTemplate | undefined>;
  deletePromptTemplate(id: string): Promise<boolean>;

  // Processing Configs CRUD operations
  getProcessingConfig(id: string): Promise<ProcessingConfig | undefined>;
  getProcessingConfigByName(name: string): Promise<ProcessingConfig | undefined>;
  getAllProcessingConfigs(): Promise<ProcessingConfig[]>;
  createProcessingConfig(config: InsertProcessingConfig): Promise<ProcessingConfig>;
  updateProcessingConfig(id: string, config: Partial<InsertProcessingConfig>): Promise<ProcessingConfig | undefined>;
  deleteProcessingConfig(id: string): Promise<boolean>;

  // Processing Jobs CRUD operations
  getProcessingJob(id: string): Promise<ProcessingJob | undefined>;
  getAllProcessingJobs(): Promise<ProcessingJob[]>;
  getProcessingJobsByDatabase(databaseId: string): Promise<ProcessingJob[]>;
  createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob>;
  updateProcessingJob(id: string, job: Partial<InsertProcessingJob>): Promise<ProcessingJob | undefined>;
  deleteProcessingJob(id: string): Promise<boolean>;

  // Anki Study System operations
  calculateDeckStatistics(deckId: string): Promise<{totalCards: number, newCards: number, learningCards: number, reviewCards: number}>;
  getAnkiDeckByDatabase(databaseId: string, userId?: string): Promise<AnkiStudyDeck | undefined>;
  createAnkiDeck(deck: InsertAnkiStudyDeck): Promise<AnkiStudyDeck>;
  updateAnkiDeck(deckId: string, updates: Partial<InsertAnkiStudyDeck>): Promise<AnkiStudyDeck | undefined>;
  getAnkiCards(deckId: string, status?: string): Promise<AnkiFlashcard[]>;
  getAnkiCardsDue(deckId: string, limit?: number): Promise<AnkiFlashcard[]>;
  createAnkiCard(card: InsertAnkiFlashcard): Promise<AnkiFlashcard>;
  updateAnkiCard(cardId: string, updates: Partial<InsertAnkiFlashcard>): Promise<AnkiFlashcard | undefined>;
  reviewAnkiCard(review: AnkiReview): Promise<AnkiFlashcard | undefined>;
  generateAnkiDeckFromDatabase(databaseId: string, userId: string): Promise<AnkiStudyDeck>;
  
  // Session-based study operations for proper Anki flow
  getStudyQueue(deckId: string, newCardLimit: number, reviewLimit: number): Promise<AnkiFlashcard[]>;
  getTimeUntilDue(card: AnkiFlashcard): { timeString: string, isOverdue: boolean, dueDate: Date };
  resetSessionCounts(deckId: string): Promise<void>;
  getSessionCycleCards(deckId: string): Promise<AnkiFlashcard[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations for local authentication
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(userData: {
    username: string;
    passwordHash: string;
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();
    return user;
  }

  async getLinguisticDatabase(id: string, userId?: string): Promise<LinguisticDatabase | undefined> {
    const conditions = userId 
      ? and(eq(linguisticDatabases.id, id), eq(linguisticDatabases.userId, userId))
      : eq(linguisticDatabases.id, id);
    
    const [database] = await db.select().from(linguisticDatabases).where(conditions);
    return database || undefined;
  }

  async getAllLinguisticDatabases(userId?: string): Promise<LinguisticDatabase[]> {
    const query = userId 
      ? db.select().from(linguisticDatabases).where(eq(linguisticDatabases.userId, userId))
      : db.select().from(linguisticDatabases);
    
    return await query.orderBy(desc(linguisticDatabases.createdAt));
  }

  async createLinguisticDatabase(insertDatabase: InsertLinguisticDatabase, userId?: string): Promise<LinguisticDatabase> {
    const [database] = await db.insert(linguisticDatabases).values({
      ...insertDatabase,
      userId,
      segments: insertDatabase.segments || [],
      idioms: insertDatabase.idioms || []
    }).returning();
    return database;
  }

  async updateLinguisticDatabase(id: string, updateData: Partial<InsertLinguisticDatabase>): Promise<LinguisticDatabase | undefined> {
    const [updated] = await db.update(linguisticDatabases)
      .set(updateData)
      .where(eq(linguisticDatabases.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteLinguisticDatabase(id: string): Promise<boolean> {
    try {
      // Find associated Anki deck first
      const deck = await this.getAnkiDeckByDatabase(id);
      
      if (deck) {
        // Delete all flashcards for this deck first
        await db.delete(ankiFlashcards).where(eq(ankiFlashcards.deckId, deck.id));
        
        // Delete review history for cards in this deck (if exists)
        // Note: Review history cleanup handled by cascade if configured, otherwise skip for now
        
        // Delete the deck itself
        await db.delete(ankiStudyDecks).where(eq(ankiStudyDecks.id, deck.id));
      }
      
      // Delete any processing jobs associated with this database
      await db.delete(processingJobs).where(eq(processingJobs.databaseId, id));
      
      // Delete any spaced repetition data associated with this database (if exists)
      // Note: Legacy spaced repetition cleanup handled separately if tables exist
      
      // Finally delete the database itself
      const result = await db.delete(linguisticDatabases).where(eq(linguisticDatabases.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Error deleting database:', error);
      throw new Error(`Failed to delete database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateKnownWords(databaseId: string, knownWords: string[]): Promise<LinguisticDatabase | undefined> {
    const [updated] = await db.update(linguisticDatabases)
      .set({ knownWords })
      .where(eq(linguisticDatabases.id, databaseId))
      .returning();
    return updated || undefined;
  }

  async getWordsByPage(
    databaseId: string, 
    page: number, 
    pageSize: number, 
    posFilter?: string[], 
    knownWordsFilter?: boolean
  ): Promise<{ words: WordEntry[], totalPages: number, totalWords: number }> {
    const database = await this.getLinguisticDatabase(databaseId);
    if (!database) {
      return { words: [], totalPages: 0, totalWords: 0 };
    }

    let words = database.analysisData as WordEntry[];
    const knownWordsSet = new Set(database.knownWords as string[]);

    // Apply filters
    if (posFilter && posFilter.length > 0) {
      words = words.filter(word => {
        const posGroup = this.getPosGroup(word.pos);
        return posFilter.includes(posGroup);
      });
    }

    if (knownWordsFilter === true) {
      words = words.filter(word => !knownWordsSet.has(word.word.toLowerCase()));
    } else if (knownWordsFilter === false) {
      words = words.filter(word => knownWordsSet.has(word.word.toLowerCase()));
    }

    const totalWords = words.length;
    const totalPages = Math.ceil(totalWords / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageWords = words.slice(startIndex, endIndex);

    return {
      words: pageWords,
      totalPages,
      totalWords,
    };
  }

  async getUniqueWords(databaseId: string, firstInstancesOnly: boolean = false): Promise<WordEntry[]> {
    const database = await this.getLinguisticDatabase(databaseId);
    if (!database) return [];

    const words = database.analysisData as WordEntry[];
    
    if (firstInstancesOnly) {
      return words.filter(word => word.firstInstance);
    }

    // Group by word and return one entry per unique word
    const uniqueWordsMap = new Map<string, WordEntry>();
    words.forEach(word => {
      const key = word.word.toLowerCase();
      if (!uniqueWordsMap.has(key) || word.firstInstance) {
        uniqueWordsMap.set(key, word);
      }
    });

    return Array.from(uniqueWordsMap.values());
  }

  // Prompt Templates
  async getPromptTemplate(id: string): Promise<PromptTemplate | undefined> {
    const [template] = await db.select().from(promptTemplates).where(eq(promptTemplates.id, id));
    return template || undefined;
  }

  async getPromptTemplateByName(name: string): Promise<PromptTemplate | undefined> {
    const [template] = await db.select().from(promptTemplates).where(eq(promptTemplates.name, name));
    return template || undefined;
  }

  async getAllPromptTemplates(): Promise<PromptTemplate[]> {
    return await db.select().from(promptTemplates).orderBy(desc(promptTemplates.createdAt));
  }

  async createPromptTemplate(template: InsertPromptTemplate): Promise<PromptTemplate> {
    const [created] = await db.insert(promptTemplates).values(template).returning();
    return created;
  }

  async updatePromptTemplate(id: string, template: Partial<InsertPromptTemplate>): Promise<PromptTemplate | undefined> {
    const [updated] = await db.update(promptTemplates)
      .set(template)
      .where(eq(promptTemplates.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePromptTemplate(id: string): Promise<boolean> {
    const result = await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Processing Configs
  async getProcessingConfig(id: string): Promise<ProcessingConfig | undefined> {
    const [config] = await db.select().from(processingConfigs).where(eq(processingConfigs.id, id));
    return config || undefined;
  }

  async getProcessingConfigByName(name: string): Promise<ProcessingConfig | undefined> {
    const [config] = await db.select().from(processingConfigs).where(eq(processingConfigs.name, name));
    return config || undefined;
  }

  async getAllProcessingConfigs(): Promise<ProcessingConfig[]> {
    return await db.select().from(processingConfigs).orderBy(desc(processingConfigs.createdAt));
  }

  async createProcessingConfig(config: InsertProcessingConfig): Promise<ProcessingConfig> {
    const [created] = await db.insert(processingConfigs).values(config).returning();
    return created;
  }

  async updateProcessingConfig(id: string, config: Partial<InsertProcessingConfig>): Promise<ProcessingConfig | undefined> {
    const [updated] = await db.update(processingConfigs)
      .set(config)
      .where(eq(processingConfigs.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProcessingConfig(id: string): Promise<boolean> {
    const result = await db.delete(processingConfigs).where(eq(processingConfigs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Processing Jobs
  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    const [job] = await db.select().from(processingJobs).where(eq(processingJobs.id, id));
    return job || undefined;
  }

  async getAllProcessingJobs(): Promise<ProcessingJob[]> {
    return await db.select().from(processingJobs).orderBy(desc(processingJobs.createdAt));
  }

  async getProcessingJobsByDatabase(databaseId: string): Promise<ProcessingJob[]> {
    return await db.select().from(processingJobs)
      .where(eq(processingJobs.databaseId, databaseId))
      .orderBy(desc(processingJobs.createdAt));
  }

  async createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob> {
    const [created] = await db.insert(processingJobs).values(job).returning();
    return created;
  }

  async updateProcessingJob(id: string, job: Partial<InsertProcessingJob>): Promise<ProcessingJob | undefined> {
    const [updated] = await db.update(processingJobs)
      .set(job)
      .where(eq(processingJobs.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProcessingJob(id: string): Promise<boolean> {
    const result = await db.delete(processingJobs).where(eq(processingJobs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Calculate real-time deck statistics from actual card data
  async calculateDeckStatistics(deckId: string): Promise<{totalCards: number, newCards: number, learningCards: number, reviewCards: number}> {
    const cards = await db.select().from(ankiFlashcards).where(eq(ankiFlashcards.deckId, deckId));
    
    const stats = {
      totalCards: cards.length,
      newCards: cards.filter(c => c.status === 'new').length,
      learningCards: cards.filter(c => c.status === 'learning').length,
      reviewCards: cards.filter(c => c.status === 'review').length
    };
    
    return stats;
  }

  // Anki Study System implementation
  async getAnkiDeckByDatabase(databaseId: string, userId?: string): Promise<AnkiStudyDeck | undefined> {
    const conditions = userId 
      ? and(eq(ankiStudyDecks.databaseId, databaseId), eq(ankiStudyDecks.userId, userId))
      : eq(ankiStudyDecks.databaseId, databaseId);
    
    const [deck] = await db.select().from(ankiStudyDecks).where(conditions);
    
    // Update deck statistics with real-time data if deck exists
    if (deck) {
      const stats = await this.calculateDeckStatistics(deck.id);
      
      // Update the deck with current statistics
      const [updatedDeck] = await db.update(ankiStudyDecks)
        .set({
          totalCards: stats.totalCards,
          newCards: stats.newCards,
          learningCards: stats.learningCards,
          reviewCards: stats.reviewCards,
          updatedAt: new Date()
        })
        .where(eq(ankiStudyDecks.id, deck.id))
        .returning();
      
      return updatedDeck || deck;
    }
    
    return deck || undefined;
  }

  async createAnkiDeck(deck: InsertAnkiStudyDeck): Promise<AnkiStudyDeck> {
    const [created] = await db.insert(ankiStudyDecks).values(deck).returning();
    return created;
  }

  async updateAnkiDeck(deckId: string, updates: Partial<InsertAnkiStudyDeck>): Promise<AnkiStudyDeck | undefined> {
    const [updated] = await db.update(ankiStudyDecks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(ankiStudyDecks.id, deckId))
      .returning();
    return updated || undefined;
  }

  async getAnkiCards(deckId: string, status?: string): Promise<AnkiFlashcard[]> {
    const conditions = status 
      ? and(eq(ankiFlashcards.deckId, deckId), eq(ankiFlashcards.status, status))
      : eq(ankiFlashcards.deckId, deckId);
    
    return await db.select().from(ankiFlashcards).where(conditions).orderBy(ankiFlashcards.wordKey);
  }

  async clearAnkiCards(deckId: string): Promise<void> {
    await db.delete(ankiFlashcards).where(eq(ankiFlashcards.deckId, deckId));
  }

  async getAnkiCardsDue(deckId: string, limit: number = 20): Promise<AnkiFlashcard[]> {
    const now = new Date();
    return await db.select().from(ankiFlashcards)
      .where(and(
        eq(ankiFlashcards.deckId, deckId),
        lte(ankiFlashcards.due, now) // Cards due now or in the past
      ))
      .limit(limit);
  }

  async createAnkiCard(card: InsertAnkiFlashcard): Promise<AnkiFlashcard> {
    const [created] = await db.insert(ankiFlashcards).values(card).returning();
    return created;
  }

  async updateAnkiCard(cardId: string, updates: Partial<InsertAnkiFlashcard>): Promise<AnkiFlashcard | undefined> {
    const [updated] = await db.update(ankiFlashcards)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(ankiFlashcards.id, cardId))
      .returning();
    return updated || undefined;
  }

  // Proper SM-2 spaced repetition algorithm with time-based scheduling
  async reviewAnkiCard(review: AnkiReview): Promise<AnkiFlashcard | undefined> {
    const card = await db.select().from(ankiFlashcards).where(eq(ankiFlashcards.id, review.cardId)).limit(1);
    if (!card[0]) return undefined;

    const currentCard = card[0];
    const now = new Date();
    
    // SM-2 Algorithm Constants (faithful to original research)
    const SM2_CONSTANTS = {
      MIN_EASE_FACTOR: 1300, // 1.3 minimum (prevents "ease hell")
      INITIAL_EASE_FACTOR: 2500, // 2.5 starting ease factor
      LEARNING_STEPS_MINUTES: [1, 10], // Learning phase: 1min, 10min
      GRADUATING_INTERVAL_DAYS: 1, // First review interval (days)
      EASY_BONUS_MULTIPLIER: 1.3, // Easy button gets 30% bonus
      HARD_PENALTY_MULTIPLIER: 1.2, // Hard button gets 20% penalty (instead of full ease)
      LAPSE_MULTIPLIER: 0.1, // Failed cards get 10% of previous interval
    };

    let newEaseFactor = currentCard.easeFactor;
    let newInterval = currentCard.interval;
    let newStatus = currentCard.status;
    let newRepetitions = currentCard.repetitions;
    let newLapses = currentCard.lapses;
    let newSessionCycleCount = (currentCard.sessionCycleCount || 0);
    let newSessionEasyCount = (currentCard.sessionEasyCount || 0);
    let dueDate = new Date(now);

    // Handle session cycling for Hard cards
    if (review.rating === 2) { // Hard - cycle back in session
      newSessionCycleCount += 1;
    } else if (review.rating === 4) { // Easy
      newSessionEasyCount += 1;
    }

    // Original SM-2 ease factor calculation: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
    // Simplified for 4-button system (1=Again, 2=Hard, 3=Good, 4=Easy)
    const easeAdjustments = {
      1: -0.20, // Again: -0.20 (equivalent to q=0 in original)
      2: -0.15, // Hard: -0.15 (equivalent to q=2 in original)
      3: 0.0,   // Good: no change (equivalent to q=3 in original)
      4: 0.15   // Easy: +0.15 (equivalent to q=5 in original)
    };

    // Apply ease factor adjustment (except for new/learning cards on first few reviews)
    if (currentCard.status === 'review' || (currentCard.status === 'learning' && review.rating === 1)) {
      newEaseFactor = Math.max(
        SM2_CONSTANTS.MIN_EASE_FACTOR,
        newEaseFactor + (easeAdjustments[review.rating] * 1000)
      );
    }

    // SM-2 Algorithm Implementation
    if (review.rating === 1) { // Again - Failed recall
      newStatus = 'learning';
      newLapses += 1;
      newRepetitions = 0;
      
      // Lapsed cards: 10% of previous interval or 1 day minimum
      if (currentCard.status === 'review') {
        newInterval = Math.max(1, Math.round(currentCard.interval * SM2_CONSTANTS.LAPSE_MULTIPLIER));
      } else {
        newInterval = 0; // Back to learning steps
      }
      
      newSessionCycleCount = 1; // Will cycle back in session
      dueDate = new Date(now.getTime() + (SM2_CONSTANTS.LEARNING_STEPS_MINUTES[0] * 60 * 1000)); // 1 minute

    } else if (currentCard.status === 'new') { // New card
      if (review.rating === 2) { // Hard - enter learning
        newStatus = 'learning';
        newInterval = 0;
        dueDate = new Date(now.getTime() + (SM2_CONSTANTS.LEARNING_STEPS_MINUTES[0] * 60 * 1000)); // 1 minute
        
      } else { // Good/Easy - graduate immediately
        newStatus = 'review';
        newRepetitions = 1;
        
        if (review.rating === 4) { // Easy - longer first interval
          newInterval = Math.round(SM2_CONSTANTS.GRADUATING_INTERVAL_DAYS * SM2_CONSTANTS.EASY_BONUS_MULTIPLIER * 3); // ~4 days
          newEaseFactor = Math.min(2800, newEaseFactor + 150); // Bonus ease
        } else { // Good
          newInterval = SM2_CONSTANTS.GRADUATING_INTERVAL_DAYS; // 1 day
        }
        
        dueDate = new Date(now.getTime() + (newInterval * 24 * 60 * 60 * 1000));
      }

    } else if (currentCard.status === 'learning') { // Learning card
      if (review.rating === 2) { // Hard - repeat current step
        newInterval = 0;
        dueDate = new Date(now.getTime() + (SM2_CONSTANTS.LEARNING_STEPS_MINUTES[0] * 60 * 1000)); // 1 minute
        
      } else { // Good/Easy - advance or graduate
        if (review.rating === 4) { // Easy - graduate immediately
          newStatus = 'review';
          newRepetitions = 1;
          newInterval = Math.round(SM2_CONSTANTS.GRADUATING_INTERVAL_DAYS * SM2_CONSTANTS.EASY_BONUS_MULTIPLIER * 3); // ~4 days
          newEaseFactor = Math.min(2800, newEaseFactor + 150);
          dueDate = new Date(now.getTime() + (newInterval * 24 * 60 * 60 * 1000));
          
        } else { // Good - graduate to review
          newStatus = 'review';
          newRepetitions = 1;
          newInterval = SM2_CONSTANTS.GRADUATING_INTERVAL_DAYS; // 1 day
          dueDate = new Date(now.getTime() + (newInterval * 24 * 60 * 60 * 1000));
        }
      }

    } else { // Review card - apply full SM-2 algorithm
      newRepetitions += 1;
      
      // Original SM-2 interval calculation
      if (newRepetitions === 1) {
        newInterval = 1; // First review: 1 day
      } else if (newRepetitions === 2) {
        newInterval = 6; // Second review: 6 days
      } else {
        // SM-2 formula: I(n) = I(n-1) × EF
        const easeFactor = newEaseFactor / 1000; // Convert to decimal (e.g., 2500 → 2.5)
        newInterval = Math.round(currentCard.interval * easeFactor);
      }
      
      // Apply rating-specific modifiers
      if (review.rating === 2) { // Hard
        newInterval = Math.max(1, Math.round(newInterval * SM2_CONSTANTS.HARD_PENALTY_MULTIPLIER));
        // Ensure minimum increase of 1 day
        newInterval = Math.max(currentCard.interval + 1, newInterval);
        
      } else if (review.rating === 4) { // Easy  
        newInterval = Math.round(newInterval * SM2_CONSTANTS.EASY_BONUS_MULTIPLIER);
      }
      
      // Ensure minimum progression (at least 1 day longer than previous)
      newInterval = Math.max(currentCard.interval + 1, newInterval);
      
      // Calculate due date
      dueDate = new Date(now.getTime() + (newInterval * 24 * 60 * 60 * 1000));
    }

    // Update the card with all new values
    const updatedCard = await this.updateAnkiCard(review.cardId, {
      status: newStatus,
      easeFactor: newEaseFactor,
      interval: newInterval,
      due: dueDate,
      repetitions: newRepetitions,
      lapses: newLapses,
      lastQuality: review.rating,
      sessionCycleCount: newSessionCycleCount,
      sessionEasyCount: newSessionEasyCount
    });

    // Update deck statistics after card review to reflect real-time changes
    if (updatedCard) {
      const stats = await this.calculateDeckStatistics(updatedCard.deckId);
      await this.updateAnkiDeck(updatedCard.deckId, {
        totalCards: stats.totalCards,
        newCards: stats.newCards,
        learningCards: stats.learningCards,
        reviewCards: stats.reviewCards
      });
    }

    return updatedCard;
  }

  async generateAnkiDeckFromDatabase(databaseId: string, userId: string): Promise<AnkiStudyDeck> {
    // Get the linguistic database
    const database = await this.getLinguisticDatabase(databaseId, userId);
    if (!database) throw new Error('Database not found');

    // Check if deck already exists
    const existingDeck = await this.getAnkiDeckByDatabase(databaseId, userId);
    let deck: AnkiStudyDeck;
    
    if (existingDeck) {
      // Delete all existing cards for this deck before regenerating
      await db.delete(ankiFlashcards).where(eq(ankiFlashcards.deckId, existingDeck.id));
      deck = existingDeck;
    } else {
      // Create the deck
      deck = await this.createAnkiDeck({
        userId,
        databaseId,
        deckName: `${database.name} - Anki Deck`,
        totalCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        studySettings: { newCardsPerDay: 20, maxReviews: 100, colorAssist: true }
      });
    }

    // Generate cards from first instance words
    const analysisData = database.analysisData as WordEntry[];
    const firstInstanceWords = analysisData.filter(word => word.firstInstance);

    const cards: InsertAnkiFlashcard[] = firstInstanceWords.map(word => ({
      userId,
      deckId: deck.id,
      databaseId,
      signature: `${word.word.toLowerCase()}::${word.pos}`,
      word: word.word,
      wordKey: word.position,
      pos: word.pos,
      lemma: word.lemma,
      translations: [word.translation],
      possibleTranslations: word.possibleTranslations || [],
      lemmaTranslations: word.lemmaTranslations || [],
      details: word.details || null,
      sentence: word.sentence,
      status: 'new',
      easeFactor: 2500,
      interval: 0,
      due: new Date(),
      repetitions: 0,
      lapses: 0
    }));

    // Insert all cards
    for (const card of cards) {
      await this.createAnkiCard(card);
    }

    // Update deck stats
    await this.updateAnkiDeck(deck.id, {
      totalCards: cards.length,
      newCards: cards.length,
      learningCards: 0,
      reviewCards: 0
    });

    return deck;
  }

  // Session-based study operations for proper Anki flow with time-based scheduling
  async getStudyQueue(deckId: string, newCardLimit: number, reviewLimit: number): Promise<AnkiFlashcard[]> {
    const now = new Date();
    
    // Get review cards that are due (including overdue) - highest priority
    const reviewCards = await db.select().from(ankiFlashcards)
      .where(and(
        eq(ankiFlashcards.deckId, deckId),
        eq(ankiFlashcards.status, 'review'),
        lte(ankiFlashcards.due, now)
      ))
      .orderBy(ankiFlashcards.due) // Oldest due dates first
      .limit(reviewLimit);
    
    // Get learning cards that are due (including overdue) - medium priority
    const learningCards = await db.select().from(ankiFlashcards)
      .where(and(
        eq(ankiFlashcards.deckId, deckId),
        eq(ankiFlashcards.status, 'learning'),
        lte(ankiFlashcards.due, now)
      ))
      .orderBy(ankiFlashcards.due); // Oldest due dates first
    
    // Get new cards only if there's capacity after due cards - lowest priority
    const dueCount = reviewCards.length + learningCards.length;
    const availableForNew = Math.max(0, newCardLimit - Math.max(0, dueCount - reviewLimit));
    
    const newCards = availableForNew > 0 ? await db.select().from(ankiFlashcards)
      .where(and(
        eq(ankiFlashcards.deckId, deckId),
        eq(ankiFlashcards.status, 'new')
      ))
      .orderBy(ankiFlashcards.wordKey) // Maintain text order for new cards
      .limit(availableForNew) : [];
    
    // Anki priority: Review cards first (most important), then learning, then new
    return [...reviewCards, ...learningCards, ...newCards];
  }

  // Get time until next review for a card (for UI display)
  getTimeUntilDue(card: AnkiFlashcard): { timeString: string, isOverdue: boolean, dueDate: Date } {
    const now = new Date();
    const dueDate = new Date(card.due);
    const timeDiff = dueDate.getTime() - now.getTime();
    const isOverdue = timeDiff < 0;
    
    if (isOverdue) {
      const overdueDiff = Math.abs(timeDiff);
      const days = Math.floor(overdueDiff / (24 * 60 * 60 * 1000));
      const hours = Math.floor((overdueDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      
      if (days > 0) {
        return { timeString: `${days}d overdue`, isOverdue: true, dueDate };
      } else if (hours > 0) {
        return { timeString: `${hours}h overdue`, isOverdue: true, dueDate };
      } else {
        return { timeString: `Overdue`, isOverdue: true, dueDate };
      }
    } else {
      const days = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
      const hours = Math.floor((timeDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((timeDiff % (60 * 60 * 1000)) / (60 * 1000));
      
      if (days > 0) {
        return { timeString: `${days}d`, isOverdue: false, dueDate };
      } else if (hours > 0) {
        return { timeString: `${hours}h`, isOverdue: false, dueDate };
      } else if (minutes > 0) {
        return { timeString: `${minutes}m`, isOverdue: false, dueDate };
      } else {
        return { timeString: `Now`, isOverdue: false, dueDate };
      }
    }
  }

  async resetSessionCounts(deckId: string): Promise<void> {
    // Reset session-specific counters for all cards in the deck
    await db.update(ankiFlashcards)
      .set({
        sessionCycleCount: 0,
        sessionEasyCount: 0,
        updatedAt: new Date()
      })
      .where(eq(ankiFlashcards.deckId, deckId));
  }

  async resetAnkiDeckProgress(databaseId: string, userId: string): Promise<void> {
    // Find the deck for this database and user
    const deck = await this.getAnkiDeckByDatabase(databaseId, userId);
    if (!deck) return;
    
    // Reset all cards in this deck to "new" status, clearing all progress
    await db.update(ankiFlashcards)
      .set({
        status: 'new',
        easeFactor: 2500, // Reset to default SM-2 value
        interval: 0,
        due: new Date(), // Due immediately 
        repetitions: 0,
        lapses: 0,
        lastQuality: null,
        sessionCycleCount: 0,
        sessionEasyCount: 0,
        updatedAt: new Date()
      })
      .where(eq(ankiFlashcards.deckId, deck.id));
      
    // Update deck stats to reflect all cards are now "new"
    const totalCards = await db.select().from(ankiFlashcards)
      .where(eq(ankiFlashcards.deckId, deck.id));
      
    await this.updateAnkiDeck(deck.id, {
      newCards: totalCards.length,
      learningCards: 0,
      reviewCards: 0
    });
  }

  async getSessionCycleCards(deckId: string): Promise<AnkiFlashcard[]> {
    // Get cards that should cycle back in the current session
    // (Hard cards that haven't been marked Easy twice)
    return await db.select().from(ankiFlashcards)
      .where(and(
        eq(ankiFlashcards.deckId, deckId)
        // Add conditions for session cycling when ready
      ))
      .orderBy(ankiFlashcards.sessionCycleCount); // Cards marked hard more recently first
  }

  private getPosGroup(pos: string): string {
    switch (pos.toUpperCase()) {
      case 'VERB':
        return 'verb';
      case 'NOUN':
      case 'PROPN':
        return 'noun';
      case 'ADJ':
        return 'adj';
      case 'AUX':
        return 'aux';
      default:
        return 'other';
    }
  }
}

export const storage = new DatabaseStorage();
