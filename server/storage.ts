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
  linguisticDatabases,
  promptTemplates,
  processingConfigs,
  processingJobs
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
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
      .values({
        ...userData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
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
      segments: insertDatabase.segments || []
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
