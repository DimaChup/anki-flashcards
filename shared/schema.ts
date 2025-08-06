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

// Users table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

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
});

export type SpacedRepetitionBatch = typeof spacedRepetitionBatches.$inferSelect;
export type InsertSpacedRepetitionBatch = z.infer<typeof insertSpacedRepetitionBatchSchema>;
export type SpacedRepetitionCard = typeof spacedRepetitionCards.$inferSelect;
export type InsertSpacedRepetitionCard = z.infer<typeof insertSpacedRepetitionCardSchema>;
export type ReviewHistory = typeof reviewHistory.$inferSelect;

// POS highlighting configuration
export const posConfigSchema = z.object({
  verb: z.boolean().default(true),
  noun: z.boolean().default(true),
  adj: z.boolean().default(true),
  aux: z.boolean().default(false),
  other: z.boolean().default(false),
});

export type POSConfig = z.infer<typeof posConfigSchema>;

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
