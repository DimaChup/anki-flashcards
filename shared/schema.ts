import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Word entry in the linguistic database
export const wordEntrySchema = z.object({
  id: z.string(),
  word: z.string(),
  lemma: z.string(),
  pos: z.string(),
  translation: z.string(),
  frequency: z.number(),
  firstInstance: z.boolean(),
  contextualInfo: z.object({
    gender: z.string().optional(),
    number: z.string().optional(),
    tense: z.string().optional(),
    mood: z.string().optional(),
    person: z.string().optional(),
  }).optional(),
  position: z.number(), // Position in the original text
  sentence: z.string(),
});

export type WordEntry = z.infer<typeof wordEntrySchema>;

// Segment schema for text segments - matching original format
export const segmentSchema = z.object({
  id: z.number().optional(),
  startWordKey: z.number(),
  endWordKey: z.number(),
  translations: z.record(z.string()).optional(), // Object with language keys -> translations
  translation: z.string().optional(), // Single translation fallback
  context: z.string().optional(),
});

export type Segment = z.infer<typeof segmentSchema>;

// Idiom schema for text idioms - matching original format
export const idiomSchema = z.object({
  id: z.number().optional(),
  startWordKey: z.number(),
  endWordKey: z.number(),
  text: z.string().optional(),
  translation: z.string().optional(),
  meaning: z.string().optional(),
});

export type Idiom = z.infer<typeof idiomSchema>;

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { withTimezone: true }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// Users table for simple username/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const registerUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(128),
  confirmPassword: z.string().min(6).max(128),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const loginUserSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;

// User subscription schema for monetization
export const userSubscriptions = pgTable("user_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  plan: text("plan").notNull().default('free'), // free, pro, enterprise
  status: text("status").notNull().default('active'), // active, cancelled, expired
  wordsPerMonth: integer("words_per_month").notNull().default(1000), // Usage limit
  wordsUsed: integer("words_used").notNull().default(0), // Current usage
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodStart: text("current_period_start"),
  currentPeriodEnd: text("current_period_end"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Database schema for linguistic analysis databases (now with user ownership)
export const linguisticDatabases = pgTable("linguistic_databases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // Link to user for multi-tenancy (nullable for existing data)
  name: text("name").notNull(),
  description: text("description"),
  language: text("language").notNull(),
  originalText: text("original_text").notNull(),
  wordCount: integer("word_count").notNull().default(0),
  analysisData: jsonb("analysis_data").notNull(), // Array of WordEntry objects
  knownWords: jsonb("known_words").notNull().default('[]'), // Array of known word strings
  segments: jsonb("segments").default('[]'), // Array of Segment objects
  idioms: jsonb("idioms").default('[]'), // Array of Idiom objects
  isPublic: text("is_public").notNull().default('false'), // Allow sharing for premium users
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Spaced Repetition Batch Schema (for organized learning)
export const spacedRepetitionBatches = pgTable("spaced_repetition_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  databaseId: varchar("database_id").notNull(),
  name: text("name").notNull(),
  batchNumber: integer("batch_number").notNull(),
  totalWords: integer("total_words").notNull().default(0),
  wordsLearned: integer("words_learned").notNull().default(0),
  isActive: text("is_active").notNull().default('false'), // Currently learning this batch
  isCompleted: text("is_completed").notNull().default('false'), // Batch completed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Spaced Repetition Card Schema (Anki-like algorithm)
export const spacedRepetitionCards = pgTable("spaced_repetition_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  databaseId: varchar("database_id").notNull(),
  batchId: varchar("batch_id").notNull(), // Link to batch
  wordId: text("word_id").notNull(), // Reference to word in analysisData
  word: text("word").notNull(),
  translation: text("translation").notNull(),
  // Anki algorithm fields
  easeFactor: integer("ease_factor").notNull().default(2500), // Starting at 2.5 (stored as 2500)
  interval: integer("interval").notNull().default(1), // Days until next review
  repetitions: integer("repetitions").notNull().default(0), // Number of successful reviews
  quality: integer("quality").default(0), // Last response quality (0-5)
  // Review scheduling
  nextReviewDate: timestamp("next_review_date", { withTimezone: true }).notNull(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Anki-style study cards for true long-term spaced repetition
export const ankiStudyCards = pgTable("anki_study_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  databaseId: varchar("database_id").notNull(),
  wordKey: text("word_key").notNull(), // Key from word database
  word: text("word").notNull(),
  pos: text("pos"),
  lemma: text("lemma"),
  translations: jsonb("translations").default('[]'), // Array of translations
  
  // Core SRS (Spaced Repetition System) fields - exact Anki algorithm
  state: text("state").notNull().default("new"), // "new", "learning", "review", "relearning" 
  easeFactor: integer("ease_factor").default(2500), // 2500 = 250% (stored as integer)
  interval: integer("interval").default(0), // Days between reviews
  step: integer("step").default(0), // Current learning step index
  due: timestamp("due", { withTimezone: true }).notNull().defaultNow(),
  
  // Learning configuration (per card to allow flexibility)
  learningSteps: text("learning_steps").default("1,10"), // Minutes: "1,10" = 1min, 10min
  graduatingInterval: integer("graduating_interval").default(1), // Days after graduation
  easyInterval: integer("easy_interval").default(4), // Days for easy during learning
  
  // Review tracking for algorithm optimization
  reviews: integer("reviews").default(0), // Total number of reviews
  lapses: integer("lapses").default(0), // Number of times failed in review
  lastQuality: integer("last_quality").default(0), // Last button pressed (1-4)
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userDatabaseIdx: index("anki_cards_user_database_idx").on(table.userId, table.databaseId),
  dueStateIdx: index("anki_cards_due_state_idx").on(table.due, table.state),
  wordUniqueIdx: index("anki_cards_word_unique").on(table.userId, table.databaseId, table.wordKey),
}));

// Daily study session configuration per user per database
export const ankiStudySettings = pgTable("anki_study_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  databaseId: varchar("database_id").notNull(),
  
  // Daily limits and configuration
  newCardsPerDay: integer("new_cards_per_day").default(20),
  reviewLimit: integer("review_limit").default(200),
  
  // Learning phase settings (global for this user/database pair)
  learningSteps: text("learning_steps").default("1,10"), // Minutes
  graduatingInterval: integer("graduating_interval").default(1), // Days
  easyInterval: integer("easy_interval").default(4), // Days for easy button during learning
  
  // Advanced SRS settings
  startingEase: integer("starting_ease").default(2500), // 250% for new cards
  easyBonus: integer("easy_bonus").default(130), // 130% multiplier for easy reviews
  intervalModifier: integer("interval_modifier").default(100), // 100% = normal intervals
  maxInterval: integer("max_interval").default(36500), // Max days (100 years)
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userDatabaseUnique: index("anki_settings_user_database_unique").on(table.userId, table.databaseId),
}));

// Anki Study Deck - automatically associated with linguistic databases
export const ankiStudyDecks = pgTable("anki_study_decks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  databaseId: varchar("database_id").notNull().unique(), // One-to-one with linguistic database
  deckName: text("deck_name").notNull(),
  totalCards: integer("total_cards").notNull().default(0),
  newCards: integer("new_cards").notNull().default(0),
  learningCards: integer("learning_cards").notNull().default(0),
  reviewCards: integer("review_cards").notNull().default(0),
  studySettings: jsonb("study_settings").default('{"newCardsPerDay": 20, "maxReviews": 100, "colorAssist": true}'),
  lastStudied: timestamp("last_studied", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Anki Flashcards - modeled on the original script
export const ankiFlashcards = pgTable("anki_flashcards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  deckId: varchar("deck_id").notNull(),
  databaseId: varchar("database_id").notNull(),
  signature: text("signature").notNull(), // Unique identifier like "word::pos"
  // Front side of card
  word: text("word").notNull(),
  wordKey: integer("word_key").notNull(), // Position in original text
  // Back side of card  
  pos: text("pos"),
  lemma: text("lemma"),
  translations: jsonb("translations").default('[]'), // Array of translations
  sentence: text("sentence"), // Context sentence
  // SRS fields based on the script
  status: text("status").notNull().default('new'), // new, learning, review
  easeFactor: integer("ease_factor").notNull().default(2500), // 2.5 * 1000 for precision
  interval: integer("interval").notNull().default(0), // Days
  due: timestamp("due", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  repetitions: integer("repetitions").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  // Metadata
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Review History for Analytics
export const reviewHistory = pgTable("review_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  cardId: varchar("card_id").notNull(),
  quality: integer("quality").notNull(), // 0-5 (fail, hard, good, easy, etc.)
  previousInterval: integer("previous_interval").notNull(),
  newInterval: integer("new_interval").notNull(),
  previousEaseFactor: integer("previous_ease_factor").notNull(),
  newEaseFactor: integer("new_ease_factor").notNull(),
  reviewDate: timestamp("review_date", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertLinguisticDatabaseSchema = createInsertSchema(linguisticDatabases).omit({
  id: true,
  createdAt: true,
});

export const updateKnownWordsSchema = z.object({
  databaseId: z.string(),
  knownWords: z.array(z.string()),
});

export type InsertLinguisticDatabase = z.infer<typeof insertLinguisticDatabaseSchema>;
export type LinguisticDatabase = typeof linguisticDatabases.$inferSelect;
export type UpdateKnownWordsRequest = z.infer<typeof updateKnownWordsSchema>;

// Spaced Repetition schemas
export const insertSpacedRepetitionBatchSchema = createInsertSchema(spacedRepetitionBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSpacedRepetitionCardSchema = createInsertSchema(spacedRepetitionCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const reviewCardSchema = z.object({
  cardId: z.string(),
  quality: z.number().min(0).max(5), // 0=complete failure, 5=perfect recall
});

export const createBatchSchema = z.object({
  databaseId: z.string(),
  batchSize: z.number().min(5).max(100).default(20), // Words per batch
  startFromBatch: z.number().min(1).default(1), // Which batch to start from
  batchByUnknown: z.boolean().default(true), // Whether to batch by unknown words or simple count
  newWordsOnly: z.boolean().default(true), // Whether to consider all words as "unknown" (first instances)
});

export type SpacedRepetitionBatch = typeof spacedRepetitionBatches.$inferSelect;
export type InsertSpacedRepetitionBatch = z.infer<typeof insertSpacedRepetitionBatchSchema>;
export type SpacedRepetitionCard = typeof spacedRepetitionCards.$inferSelect;
export type InsertSpacedRepetitionCard = z.infer<typeof insertSpacedRepetitionCardSchema>;
export type ReviewHistory = typeof reviewHistory.$inferSelect;

// Anki system types
export const insertAnkiStudyDeckSchema = createInsertSchema(ankiStudyDecks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnkiFlashcardSchema = createInsertSchema(ankiFlashcards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const ankiReviewSchema = z.object({
  cardId: z.string(),
  rating: z.number().min(1).max(4), // 1=Again, 2=Hard, 3=Good, 4=Easy
});

export type AnkiStudyDeck = typeof ankiStudyDecks.$inferSelect;
export type InsertAnkiStudyDeck = z.infer<typeof insertAnkiStudyDeckSchema>;
export type AnkiFlashcard = typeof ankiFlashcards.$inferSelect;
export type InsertAnkiFlashcard = z.infer<typeof insertAnkiFlashcardSchema>;
export type AnkiReview = z.infer<typeof ankiReviewSchema>;

// New Anki Study Card types from proper schema
export type AnkiStudyCard = typeof ankiStudyCards.$inferSelect;
export type InsertAnkiStudyCard = typeof ankiStudyCards.$inferInsert;
export type AnkiStudySettings = typeof ankiStudySettings.$inferSelect;
export type InsertAnkiStudySettings = typeof ankiStudySettings.$inferInsert;

export type StudyCard = {
  id: string;
  word: string;
  pos: string;
  lemma: string;
  translations: string[];
  frequency?: number;
  firstInstance?: boolean;
  contextualInfo?: {
    gender?: string;
    number?: string;
    tense?: string;
    mood?: string;
    person?: string;
  };
  position?: number;
  sentence?: string;
  examples?: Array<{
    sentence: string;
    translation?: string;
  }>;
};

// POS highlighting configuration
export const posConfigSchema = z.object({
  verb: z.boolean().default(true),
  noun: z.boolean().default(true),
  adj: z.boolean().default(true),
  aux: z.boolean().default(false),
  other: z.boolean().default(false),
});

export type POSConfig = z.infer<typeof posConfigSchema>;
export type AnkiStudyDeck = typeof ankiStudyDecks.$inferSelect;
export type InsertAnkiStudyDeck = z.infer<typeof insertAnkiStudyDeckSchema>;
export type AnkiFlashcard = typeof ankiFlashcards.$inferSelect;
export type InsertAnkiFlashcard = z.infer<typeof insertAnkiFlashcardSchema>;
export type AnkiReview = z.infer<typeof ankiReviewSchema>;

// Export request schema
export const exportRequestSchema = z.object({
  databaseId: z.string(),
  format: z.enum(['csv', 'json']),
  includeKnownWords: z.boolean().default(false),
  firstInstancesOnly: z.boolean().default(false),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;

// Prompt Templates for AI processing (now with user ownership and premium features)
export const promptTemplates = pgTable("prompt_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // null for system templates, user_id for custom templates
  name: text("name").notNull(),
  description: text("description"),
  template: text("template").notNull(),
  category: text("category").notNull().default('general'),
  isPremium: text("is_premium").notNull().default('false'), // Premium-only templates
  isDefault: text("is_default").notNull().default('false'),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertPromptTemplateSchema = createInsertSchema(promptTemplates).omit({
  id: true,
  createdAt: true,
});

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type InsertPromptTemplate = z.infer<typeof insertPromptTemplateSchema>;

// Processing configurations for AI batch processing
export const processingConfigs = pgTable("processing_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  modelName: text("model_name").notNull().default('gemini-2.0-flash'),
  batchSize: integer("batch_size").notNull().default(30),
  concurrency: integer("concurrency").notNull().default(5),
  promptTemplateId: varchar("prompt_template_id").references(() => promptTemplates.id),
  isDefault: text("is_default").notNull().default('false'),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertProcessingConfigSchema = createInsertSchema(processingConfigs).omit({
  id: true,
  createdAt: true,
});

export type ProcessingConfig = typeof processingConfigs.$inferSelect;
export type InsertProcessingConfig = z.infer<typeof insertProcessingConfigSchema>;

// Processing jobs to track AI processing status
export const processingJobs = pgTable("processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  databaseId: varchar("database_id").references(() => linguisticDatabases.id).notNull(),
  configId: varchar("config_id").references(() => processingConfigs.id),
  status: text("status").notNull().default('pending'), // pending, running, completed, failed
  progress: integer("progress").notNull().default(0),
  totalBatches: integer("total_batches").notNull().default(0),
  currentBatch: integer("current_batch").notNull().default(0),
  errorMessage: text("error_message"),
  results: jsonb("results").notNull().default('{}'),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertProcessingJobSchema = createInsertSchema(processingJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;

// Add missing subscription types
export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
