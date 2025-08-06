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
  type AnkiStudyCard,
  type InsertAnkiStudyCard,
  type AnkiStudySettings,
  type InsertAnkiStudySettings,
  linguisticDatabases,
  promptTemplates,
  processingConfigs,
  processingJobs,
  ankiStudyDecks,
  ankiFlashcards,
  ankiStudyCards,
  ankiStudySettings
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
  getAllPromptTemplates(): Promise<PromptTemplate[]>;
  createPromptTemplate(template: InsertPromptTemplate): Promise<PromptTemplate>;
  updatePromptTemplate(id: string, template: Partial<InsertPromptTemplate>): Promise<PromptTemplate | undefined>;
  deletePromptTemplate(id: string): Promise<boolean>;

  // Processing Configs CRUD operations
  getProcessingConfig(id: string): Promise<ProcessingConfig | undefined>;
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
  getAnkiDeckByDatabase(databaseId: string, userId?: string): Promise<AnkiStudyDeck | undefined>;
  createAnkiDeck(deck: InsertAnkiStudyDeck): Promise<AnkiStudyDeck>;
  updateAnkiDeck(deckId: string, updates: Partial<InsertAnkiStudyDeck>): Promise<AnkiStudyDeck | undefined>;
  getAnkiCards(deckId: string, status?: string): Promise<AnkiFlashcard[]>;
  getAnkiCardsDue(deckId: string, limit?: number): Promise<AnkiFlashcard[]>;
  createAnkiCard(card: InsertAnkiFlashcard): Promise<AnkiFlashcard>;
  updateAnkiCard(cardId: string, updates: Partial<InsertAnkiFlashcard>): Promise<AnkiFlashcard | undefined>;
  reviewAnkiCard(review: AnkiReview): Promise<AnkiFlashcard | undefined>;
  generateAnkiDeckFromDatabase(databaseId: string, userId: string): Promise<AnkiStudyDeck>;

  // Long-term Anki Study Cards (proper spaced repetition)
  getAnkiStudySettings(userId: string, databaseId: string): Promise<AnkiStudySettings | undefined>;
  createAnkiStudySettings(settings: InsertAnkiStudySettings): Promise<AnkiStudySettings>;
  updateAnkiStudySettings(id: string, settings: Partial<InsertAnkiStudySettings>): Promise<AnkiStudySettings | undefined>;
  
  // Get cards due for today's study session (reviews + new cards according to limits)
  getTodaysStudyCards(userId: string, databaseId: string): Promise<AnkiStudyCard[]>;
  // Initialize new study cards from database words
  initializeStudyCards(userId: string, databaseId: string, wordKeys: string[]): Promise<AnkiStudyCard[]>;
  // Process review with real Anki algorithm
  processStudyCardReview(cardId: string, rating: 1 | 2 | 3 | 4): Promise<AnkiStudyCard | undefined>;
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
    const result = await db.delete(linguisticDatabases).where(eq(linguisticDatabases.id, id));
    return (result.rowCount ?? 0) > 0;
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

  // Anki Study System implementation
  async getAnkiDeckByDatabase(databaseId: string, userId?: string): Promise<AnkiStudyDeck | undefined> {
    const conditions = userId 
      ? and(eq(ankiStudyDecks.databaseId, databaseId), eq(ankiStudyDecks.userId, userId))
      : eq(ankiStudyDecks.databaseId, databaseId);
    
    const [deck] = await db.select().from(ankiStudyDecks).where(conditions);
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
    
    return await db.select().from(ankiFlashcards).where(conditions);
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

  async reviewAnkiCard(review: AnkiReview): Promise<AnkiFlashcard | undefined> {
    const card = await db.select().from(ankiFlashcards).where(eq(ankiFlashcards.id, review.cardId)).limit(1);
    if (!card[0]) return undefined;

    const currentCard = card[0];
    
    // Anki algorithm based on the original script
    const SRS_DEFAULTS = {
      EASE_FACTOR: 2.5,
      INTERVAL_MODIFIERS: { 1: 0, 2: 1.2, 3: 1.0, 4: 1.3 }, // Again, Hard, Good, Easy
      EASE_MODIFIERS: { 1: -0.20, 2: -0.15, 3: 0, 4: 0.15 },
      LEARNING_STEPS: [1, 10], // in minutes
      GRADUATING_INTERVAL: 1, // in days
    };

    const easeModifier = SRS_DEFAULTS.EASE_MODIFIERS[review.rating as keyof typeof SRS_DEFAULTS.EASE_MODIFIERS];
    const intervalModifier = SRS_DEFAULTS.INTERVAL_MODIFIERS[review.rating as keyof typeof SRS_DEFAULTS.INTERVAL_MODIFIERS];
    
    let newEaseFactor = Math.max(1300, currentCard.easeFactor + (easeModifier * 1000));
    let newInterval: number;
    let newStatus = currentCard.status;
    const now = new Date();

    if (review.rating === 1) { // Again
      newStatus = 'learning';
      newInterval = SRS_DEFAULTS.LEARNING_STEPS[0] * 60 * 1000; // Convert to milliseconds
    } else {
      if (currentCard.status === 'new' || currentCard.status === 'learning') {
        newStatus = 'review';
        newInterval = SRS_DEFAULTS.GRADUATING_INTERVAL * 24 * 60 * 60 * 1000;
      } else {
        newInterval = currentCard.interval * (newEaseFactor / 1000) * intervalModifier * 24 * 60 * 60 * 1000;
      }
    }

    const newDue = new Date(now.getTime() + newInterval);

    return await this.updateAnkiCard(review.cardId, {
      status: newStatus,
      easeFactor: newEaseFactor,
      interval: Math.round(newInterval / (24 * 60 * 60 * 1000)), // Convert back to days
      due: newDue,
      repetitions: currentCard.repetitions + 1,
      lapses: review.rating === 1 ? currentCard.lapses + 1 : currentCard.lapses
    });
  }

  async generateAnkiDeckFromDatabase(databaseId: string, userId: string): Promise<AnkiStudyDeck> {
    // Get the linguistic database
    const database = await this.getLinguisticDatabase(databaseId, userId);
    if (!database) throw new Error('Database not found');

    // Check if deck already exists
    const existingDeck = await this.getAnkiDeckByDatabase(databaseId, userId);
    if (existingDeck) return existingDeck;

    // Create the deck
    const deck = await this.createAnkiDeck({
      userId,
      databaseId,
      deckName: `${database.name} - Anki Deck`,
      totalCards: 0,
      newCards: 0,
      learningCards: 0,
      reviewCards: 0,
      studySettings: { newCardsPerDay: 20, maxReviews: 100, colorAssist: true }
    });

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

  // Long-term Anki Study Cards (proper spaced repetition) - implementing full system
  async getAnkiStudySettings(userId: string, databaseId: string): Promise<AnkiStudySettings | undefined> {
    const [settings] = await db.select().from(ankiStudySettings)
      .where(and(eq(ankiStudySettings.userId, userId), eq(ankiStudySettings.databaseId, databaseId)));
    return settings || undefined;
  }

  async createAnkiStudySettings(settings: InsertAnkiStudySettings): Promise<AnkiStudySettings> {
    const [newSettings] = await db.insert(ankiStudySettings).values(settings).returning();
    return newSettings;
  }

  async updateAnkiStudySettings(id: string, settings: Partial<InsertAnkiStudySettings>): Promise<AnkiStudySettings | undefined> {
    const [updated] = await db.update(ankiStudySettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(ankiStudySettings.id, id))
      .returning();
    return updated || undefined;
  }

  // Get cards due for today's study session (reviews + new cards according to limits)
  async getTodaysStudyCards(userId: string, databaseId: string): Promise<AnkiStudyCard[]> {
    const now = new Date();
    
    // Get or create study settings
    let settings = await this.getAnkiStudySettings(userId, databaseId);
    if (!settings) {
      settings = await this.createAnkiStudySettings({
        userId,
        databaseId,
        // deckName not part of settings schema
        newCardsPerDay: 20,
        reviewLimit: 200,
        easyBonus: 0.3,
        intervalModifier: 1.0,
        maxInterval: 36500,
        graduatingInterval: 1,
        easyInterval: 4,
        startingEase: 2500,
        learningSteps: "1,10"
      });
    }

    // Check if any cards exist, if not auto-initialize from database
    const existingCards = await db.select().from(ankiStudyCards)
      .where(and(
        eq(ankiStudyCards.userId, userId),
        eq(ankiStudyCards.databaseId, databaseId)
      ))
      .limit(1);
      
    if (existingCards.length === 0) {
      // Auto-initialize cards from database words (first_inst=true, excluding known words)
      await this.initializeStudyCards(userId, databaseId);
    }

    // Filter out cards for words that are now in knownWords
    const database = await this.getLinguisticDatabase(databaseId, userId);
    const knownWords = new Set(database?.knownWords || [] as string[]);
    
    // Get due review cards (due <= now) that are not in knownWords
    const dueCards = await db.select().from(ankiStudyCards)
      .where(and(
        eq(ankiStudyCards.userId, userId),
        eq(ankiStudyCards.databaseId, databaseId),
        lte(ankiStudyCards.due, now)
      ))
      .orderBy(ankiStudyCards.due)
      .limit(settings.reviewLimit || 200);

    // Filter out known words from due cards
    const filteredDueCards = dueCards.filter(card => !knownWords.has(card.word));

    // Get new cards if we haven't hit the daily limit (also excluding known words)
    const newCardsNeeded = Math.max(0, (settings.newCardsPerDay || 20) - filteredDueCards.filter(c => c.state === 'new').length);
    
    if (newCardsNeeded > 0) {
      const newCards = await db.select().from(ankiStudyCards)
        .where(and(
          eq(ankiStudyCards.userId, userId),
          eq(ankiStudyCards.databaseId, databaseId),
          eq(ankiStudyCards.state, 'new')
        ))
        .limit(newCardsNeeded);
      
      // Filter out known words from new cards
      const filteredNewCards = newCards.filter(card => !knownWords.has(card.word));
      
      return [...filteredDueCards, ...filteredNewCards];
    }

    return filteredDueCards;
  }

  // Initialize new study cards from database words (based on first_inst=true, excluding known words)
  async initializeStudyCards(userId: string, databaseId: string, wordKeys?: string[]): Promise<AnkiStudyCard[]> {
    const database = await this.getLinguisticDatabase(databaseId, userId);
    if (!database) return [];

    const analysisData = database.analysisData as WordEntry[];
    const knownWords = new Set(database.knownWords || [] as string[]);
    const now = new Date();
    
    // Get all words that have firstInstance=true and are not in knownWords
    const eligibleWords = analysisData
      .filter(entry => entry.firstInstance === true)  // Only first instances
      .filter(entry => !knownWords.has(entry.word)) // Exclude known words
      .sort((a, b) => Number(a.id) - Number(b.id)); // Sort by word number/order of appearance
    
    // If specific wordKeys are provided, filter to those, otherwise use all eligible words
    const wordsToProcess = wordKeys && wordKeys.length > 0 
      ? eligibleWords.filter(entry => wordKeys.includes(entry.id.toString()))
      : eligibleWords;
    
    const newCards = wordsToProcess.map(wordEntry => ({
      userId,
      databaseId,
      wordKey: wordEntry.id.toString(),
      word: wordEntry.word,
      definition: wordEntry.translation || wordEntry.lemma,
      context: wordEntry.sentence || `POS: ${wordEntry.pos}`,
      pos: wordEntry.pos, // Add POS field
      state: 'new' as const,
      easeFactor: 2500,
      interval: 0,
      step: 0,
      due: now,
      reviews: 0,
      lapses: 0,
      lastQuality: null
    })) as InsertAnkiStudyCard[];

    if (newCards.length === 0) return [];

    // Remove existing cards for these words to avoid duplicates
    await db.delete(ankiStudyCards).where(and(
      eq(ankiStudyCards.userId, userId),
      eq(ankiStudyCards.databaseId, databaseId)
    ));

    const inserted = await db.insert(ankiStudyCards).values(newCards).returning();
    return inserted;
  }

  // Process review with real Anki algorithm - exactly matching anki.html
  async processStudyCardReview(cardId: string, rating: 1 | 2 | 3 | 4): Promise<AnkiStudyCard | undefined> {
    const [card] = await db.select().from(ankiStudyCards).where(eq(ankiStudyCards.id, cardId));
    if (!card) return undefined;

    const now = new Date();
    const ratingMap = { 1: 'AGAIN', 2: 'HARD', 3: 'GOOD', 4: 'EASY' } as const;
    const ratingName = ratingMap[rating];
    
    // SRS Constants from research (exact Anki algorithm)
    const EASE_MODIFIERS = { AGAIN: -0.20, HARD: -0.15, GOOD: 0, EASY: 0.15 };
    const INTERVAL_MODIFIERS = { AGAIN: 0, HARD: 1.2, GOOD: 1.0, EASY: 1.3 };
    const LEARNING_STEPS = [1, 10]; // minutes
    const GRADUATING_INTERVAL = 1; // days

    // Update ease factor (minimum 130% = 1300)
    let newEaseFactor = Math.max(1300, (card.easeFactor || 2500) + (EASE_MODIFIERS[ratingName] * 100));
    
    let newInterval: number;
    let newStatus: 'new' | 'learning' | 'review' | 'relearning';
    let newStep = card.step || 0;
    
    if (ratingName === 'AGAIN') {
      // Failed card goes to learning
      newStatus = 'learning';
      newStep = 0;
      newInterval = LEARNING_STEPS[0] / (24 * 60); // Convert minutes to days
    } else {
      if (card.state === 'new' || card.state === 'learning') {
        // Graduate to review
        newStatus = 'review';
        newInterval = GRADUATING_INTERVAL;
        newStep = 0;
      } else {
        // Existing review card
        newStatus = 'review';
        newInterval = (card.interval || 1) * (newEaseFactor / 100) * INTERVAL_MODIFIERS[ratingName];
      }
    }
    
    const newDue = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);
    
    // Update the card
    const [updated] = await db.update(ankiStudyCards)
      .set({
        state: newStatus,
        easeFactor: newEaseFactor,
        interval: Math.round(newInterval),
        step: newStep,
        due: newDue,
        reviews: (card.reviews || 0) + 1,
        lapses: ratingName === 'AGAIN' ? (card.lapses || 0) + 1 : card.lapses,
        lastQuality: rating,
        updatedAt: now
      })
      .where(eq(ankiStudyCards.id, cardId))
      .returning();
    
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
