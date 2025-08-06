import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, integer } from "drizzle-orm/pg-core";
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

// Database schema for linguistic analysis databases
export const linguisticDatabases = pgTable("linguistic_databases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  language: text("language").notNull(),
  originalText: text("original_text").notNull(),
  wordCount: integer("word_count").notNull().default(0),
  analysisData: jsonb("analysis_data").notNull(), // Array of WordEntry objects
  knownWords: jsonb("known_words").notNull().default('[]'), // Array of known word strings
  segments: jsonb("segments").default('[]'), // Array of Segment objects
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
