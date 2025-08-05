import { type LinguisticDatabase, type InsertLinguisticDatabase, type WordEntry, type UpdateKnownWordsRequest } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Linguistic Database CRUD operations
  getLinguisticDatabase(id: string): Promise<LinguisticDatabase | undefined>;
  getAllLinguisticDatabases(): Promise<LinguisticDatabase[]>;
  createLinguisticDatabase(database: InsertLinguisticDatabase): Promise<LinguisticDatabase>;
  updateLinguisticDatabase(id: string, database: Partial<InsertLinguisticDatabase>): Promise<LinguisticDatabase | undefined>;
  deleteLinguisticDatabase(id: string): Promise<boolean>;
  
  // Known words management
  updateKnownWords(databaseId: string, knownWords: string[]): Promise<LinguisticDatabase | undefined>;
  
  // Analysis operations
  getWordsByPage(databaseId: string, page: number, pageSize: number, posFilter?: string[], knownWordsFilter?: boolean): Promise<{ words: WordEntry[], totalPages: number, totalWords: number }>;
  getUniqueWords(databaseId: string, firstInstancesOnly?: boolean): Promise<WordEntry[]>;
}

export class MemStorage implements IStorage {
  private linguisticDatabases: Map<string, LinguisticDatabase>;

  constructor() {
    this.linguisticDatabases = new Map();
  }

  async getLinguisticDatabase(id: string): Promise<LinguisticDatabase | undefined> {
    return this.linguisticDatabases.get(id);
  }

  async getAllLinguisticDatabases(): Promise<LinguisticDatabase[]> {
    return Array.from(this.linguisticDatabases.values());
  }

  async createLinguisticDatabase(insertDatabase: InsertLinguisticDatabase): Promise<LinguisticDatabase> {
    const id = randomUUID();
    const database: LinguisticDatabase = {
      ...insertDatabase,
      id,
      description: insertDatabase.description || null,
      wordCount: insertDatabase.wordCount || 0,
      knownWords: insertDatabase.knownWords || [],
      createdAt: new Date().toISOString(),
    };
    
    this.linguisticDatabases.set(id, database);
    return database;
  }

  async updateLinguisticDatabase(id: string, updateData: Partial<InsertLinguisticDatabase>): Promise<LinguisticDatabase | undefined> {
    const existing = this.linguisticDatabases.get(id);
    if (!existing) return undefined;

    const updated: LinguisticDatabase = {
      ...existing,
      ...updateData,
    };
    
    this.linguisticDatabases.set(id, updated);
    return updated;
  }

  async deleteLinguisticDatabase(id: string): Promise<boolean> {
    return this.linguisticDatabases.delete(id);
  }

  async updateKnownWords(databaseId: string, knownWords: string[]): Promise<LinguisticDatabase | undefined> {
    const database = this.linguisticDatabases.get(databaseId);
    if (!database) return undefined;

    const updated: LinguisticDatabase = {
      ...database,
      knownWords: knownWords,
    };
    
    this.linguisticDatabases.set(databaseId, updated);
    return updated;
  }

  async getWordsByPage(
    databaseId: string, 
    page: number, 
    pageSize: number, 
    posFilter?: string[], 
    knownWordsFilter?: boolean
  ): Promise<{ words: WordEntry[], totalPages: number, totalWords: number }> {
    const database = this.linguisticDatabases.get(databaseId);
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
    const database = this.linguisticDatabases.get(databaseId);
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

export const storage = new MemStorage();
