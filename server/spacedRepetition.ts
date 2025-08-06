// Batch-based Spaced Repetition Algorithm Implementation
import { db } from "./db";
import { spacedRepetitionCards, spacedRepetitionBatches, reviewHistory } from "@shared/schema";
import { eq, and, lte, desc } from "drizzle-orm";
import type { 
  SpacedRepetitionCard, 
  SpacedRepetitionBatch,
  InsertSpacedRepetitionCard, 
  InsertSpacedRepetitionBatch 
} from "@shared/schema";

export class SpacedRepetitionService {
  // Create batches from first instances in a database
  static async createBatchesFromFirstInstances(
    userId: string,
    databaseId: string,
    batchSize: number = 20
  ): Promise<SpacedRepetitionBatch[]> {
    // Get database to access analysis data
    const databases = await db.select().from(spacedRepetitionCards).where(eq(spacedRepetitionCards.userId, userId));
    // This needs to be replaced with proper database fetch - using storage service would be better
    
    // For now, we'll create a method that external services can call with the analysis data
    throw new Error("Use createBatchesFromAnalysisData instead");
  }

  // Create batches using IDENTICAL logic to First Instances List View
  static async createBatchesFromFirstInstancesData(
    userId: string,
    databaseId: string,
    uniqueWords: any[],
    knownWords: string[] = [],
    batchSize: number = 25,
    batchByUnknown: boolean = true,
    newWordsOnly: boolean = true,
    firstInstancesOnly: boolean = true
  ): Promise<SpacedRepetitionBatch[]> {
    // Step 1: Apply IDENTICAL filtering logic as List View
    let filtered = [...uniqueWords];
    const knownWordsSet = new Set(knownWords);

    // Filter by known words if newWordsOnly is enabled (EXACT list view logic)
    if (newWordsOnly) {
      filtered = filtered.filter(word => 
        !knownWordsSet.has(`${word.word}::${word.pos}`) && 
        !knownWordsSet.has(word.word.toLowerCase())
      );
    }

    // Filter to first instances only if enabled
    if (firstInstancesOnly) {
      filtered = filtered.filter(word => word.firstInstance);
    }

    // Step 2: Apply IDENTICAL batching logic as List View
    const wordBatches: any[][] = [];
    
    if (batchByUnknown) {
      // Batch by unknown words count (IDENTICAL to list view implementation)
      let currentBatch: any[] = [];
      let unknownCount = 0;
      
      for (const word of filtered) {
        currentBatch.push(word);
        
        // Count as unknown if newWordsOnly is enabled (same as list view)
        const isUnknown = newWordsOnly ? 
          (!knownWordsSet.has(`${word.word}::${word.pos}`) && !knownWordsSet.has(word.word.toLowerCase())) :
          true;
        
        if (isUnknown) {
          unknownCount++;
        }
        
        // Create new batch when we hit the unknown word limit
        if (unknownCount >= batchSize) {
          wordBatches.push([...currentBatch]);
          currentBatch = [];
          unknownCount = 0;
        }
      }
      
      // Add remaining words as final batch
      if (currentBatch.length > 0) {
        wordBatches.push(currentBatch);
      }
    } else {
      // Simple sequential batching by total count
      for (let i = 0; i < filtered.length; i += batchSize) {
        wordBatches.push(filtered.slice(i, i + batchSize));
      }
    }

    const batches: SpacedRepetitionBatch[] = [];

    // Create database batches from word batches
    for (let i = 0; i < wordBatches.length; i++) {
      const batchWords = wordBatches[i];
      
      const batchData: InsertSpacedRepetitionBatch = {
        userId,
        databaseId,
        name: `Batch ${i + 1} (${batchWords.length} words)`,
        batchNumber: i + 1,
        totalWords: batchWords.length,
        wordsLearned: 0,
        isActive: i === 0 ? 'true' : 'false', // First batch is active
        isCompleted: 'false',
      };

      const [batch] = await db.insert(spacedRepetitionBatches).values(batchData).returning();
      batches.push(batch);

      // Create cards for this batch
      for (const word of batchWords) {
        const cardData: InsertSpacedRepetitionCard = {
          userId,
          databaseId,
          batchId: batch.id,
          wordId: word.id,
          word: word.word,
          translation: word.translation,
          easeFactor: 2500,
          interval: 1,
          repetitions: 0,
          quality: 0,
          nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

        await db.insert(spacedRepetitionCards).values(cardData);
      }
    }

    return batches;
  }

  // Clear all batches and cards for a database (used when regenerating)
  static async clearBatchesForDatabase(userId: string, databaseId: string): Promise<void> {
    // Delete all cards first (due to foreign key constraints)
    await db.delete(spacedRepetitionCards).where(
      and(
        eq(spacedRepetitionCards.userId, userId),
        eq(spacedRepetitionCards.databaseId, databaseId)
      )
    );
    
    // Delete all batches
    await db.delete(spacedRepetitionBatches).where(
      and(
        eq(spacedRepetitionBatches.userId, userId),
        eq(spacedRepetitionBatches.databaseId, databaseId)
      )
    );
  }

  // Get all batches for a database
  static async getBatchesForDatabase(userId: string, databaseId: string): Promise<SpacedRepetitionBatch[]> {
    return await db
      .select()
      .from(spacedRepetitionBatches)
      .where(
        and(
          eq(spacedRepetitionBatches.userId, userId),
          eq(spacedRepetitionBatches.databaseId, databaseId)
        )
      )
      .orderBy(spacedRepetitionBatches.batchNumber);
  }

  // Get current active batch
  static async getActiveBatch(userId: string, databaseId: string): Promise<SpacedRepetitionBatch | null> {
    const [batch] = await db
      .select()
      .from(spacedRepetitionBatches)
      .where(
        and(
          eq(spacedRepetitionBatches.userId, userId),
          eq(spacedRepetitionBatches.databaseId, databaseId),
          eq(spacedRepetitionBatches.isActive, 'true')
        )
      );
    
    return batch || null;
  }

  // Activate next batch when current is completed
  static async activateNextBatch(userId: string, databaseId: string): Promise<SpacedRepetitionBatch | null> {
    const currentBatch = await this.getActiveBatch(userId, databaseId);
    if (!currentBatch) return null;

    // Mark current batch as completed and inactive
    await db
      .update(spacedRepetitionBatches)
      .set({ 
        isActive: 'false', 
        isCompleted: 'true',
        updatedAt: new Date()
      })
      .where(eq(spacedRepetitionBatches.id, currentBatch.id));

    // Find and activate next batch
    const [nextBatch] = await db
      .select()
      .from(spacedRepetitionBatches)
      .where(
        and(
          eq(spacedRepetitionBatches.userId, userId),
          eq(spacedRepetitionBatches.databaseId, databaseId),
          eq(spacedRepetitionBatches.batchNumber, currentBatch.batchNumber + 1)
        )
      );

    if (nextBatch) {
      await db
        .update(spacedRepetitionBatches)
        .set({ 
          isActive: 'true',
          updatedAt: new Date()
        })
        .where(eq(spacedRepetitionBatches.id, nextBatch.id));
      
      return nextBatch;
    }

    return null;
  }

  // Get cards due for review (from active batch only)
  static async getDueCardsFromActiveBatch(userId: string, databaseId: string): Promise<SpacedRepetitionCard[]> {
    const activeBatch = await this.getActiveBatch(userId, databaseId);
    if (!activeBatch) return [];

    const now = new Date();
    
    return await db
      .select()
      .from(spacedRepetitionCards)
      .where(
        and(
          eq(spacedRepetitionCards.userId, userId),
          eq(spacedRepetitionCards.databaseId, databaseId),
          eq(spacedRepetitionCards.batchId, activeBatch.id),
          lte(spacedRepetitionCards.nextReviewDate, now)
        )
      )
      .orderBy(spacedRepetitionCards.nextReviewDate);
  }

  // Get all cards from active batch (for learning new words)
  static async getCardsFromActiveBatch(userId: string, databaseId: string): Promise<SpacedRepetitionCard[]> {
    const activeBatch = await this.getActiveBatch(userId, databaseId);
    if (!activeBatch) return [];
    
    return await db
      .select()
      .from(spacedRepetitionCards)
      .where(
        and(
          eq(spacedRepetitionCards.userId, userId),
          eq(spacedRepetitionCards.databaseId, databaseId),
          eq(spacedRepetitionCards.batchId, activeBatch.id)
        )
      )
      .orderBy(spacedRepetitionCards.nextReviewDate);
  }

  // Get batch by number
  static async getBatchByNumber(userId: string, databaseId: string, batchNumber: number): Promise<SpacedRepetitionBatch | null> {
    const [batch] = await db
      .select()
      .from(spacedRepetitionBatches)
      .where(
        and(
          eq(spacedRepetitionBatches.userId, userId),
          eq(spacedRepetitionBatches.databaseId, databaseId),
          eq(spacedRepetitionBatches.batchNumber, batchNumber)
        )
      );

    return batch || null;
  }

  // Get due cards from a specific batch
  static async getDueCardsFromBatch(userId: string, databaseId: string, batchNumber: number): Promise<SpacedRepetitionCard[]> {
    const batch = await this.getBatchByNumber(userId, databaseId, batchNumber);
    if (!batch) return [];

    const now = new Date();
    return await db
      .select()
      .from(spacedRepetitionCards)
      .where(
        and(
          eq(spacedRepetitionCards.userId, userId),
          eq(spacedRepetitionCards.databaseId, databaseId),
          eq(spacedRepetitionCards.batchId, batch.id),
          lte(spacedRepetitionCards.nextReviewDate, now)
        )
      )
      .orderBy(spacedRepetitionCards.nextReviewDate);
  }

  // Get all cards from a specific batch
  static async getCardsFromBatch(userId: string, databaseId: string, batchNumber: number): Promise<SpacedRepetitionCard[]> {
    const batch = await this.getBatchByNumber(userId, databaseId, batchNumber);
    if (!batch) return [];
    
    return await db
      .select()
      .from(spacedRepetitionCards)
      .where(
        and(
          eq(spacedRepetitionCards.userId, userId),
          eq(spacedRepetitionCards.databaseId, databaseId),
          eq(spacedRepetitionCards.batchId, batch.id)
        )
      )
      .orderBy(spacedRepetitionCards.nextReviewDate);
  }

  // Core Anki algorithm: Update card based on review quality
  static async reviewCard(cardId: string, quality: number): Promise<SpacedRepetitionCard> {
    const [card] = await db
      .select()
      .from(spacedRepetitionCards)
      .where(eq(spacedRepetitionCards.id, cardId));

    if (!card) {
      throw new Error("Card not found");
    }

    // Store previous values for history
    const previousInterval = card.interval;
    const previousEaseFactor = card.easeFactor;

    // Calculate new values using Anki algorithm
    const newValues = this.calculateAnkiValues(
      quality,
      card.repetitions,
      card.easeFactor,
      card.interval
    );

    // Update the card
    const [updatedCard] = await db
      .update(spacedRepetitionCards)
      .set({
        easeFactor: newValues.easeFactor,
        interval: newValues.interval,
        repetitions: newValues.repetitions,
        quality,
        nextReviewDate: newValues.nextReviewDate,
        lastReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(spacedRepetitionCards.id, cardId))
      .returning();

    // Record review history
    await db.insert(reviewHistory).values({
      userId: card.userId,
      cardId: card.id,
      quality,
      previousInterval,
      newInterval: newValues.interval,
      previousEaseFactor,
      newEaseFactor: newValues.easeFactor,
    });

    return updatedCard;
  }

  // Core Anki SM-2 Algorithm Implementation
  private static calculateAnkiValues(
    quality: number, // 0-5 (0=complete failure, 5=perfect recall)
    repetitions: number,
    easeFactor: number, // Stored as integer (2500 = 2.5)
    interval: number
  ) {
    let newRepetitions = repetitions;
    let newEaseFactor = easeFactor;
    let newInterval = interval;

    // Convert ease factor from storage format
    const currentEase = easeFactor / 1000;

    if (quality >= 3) {
      // Successful recall
      if (repetitions === 0) {
        newInterval = 1;
      } else if (repetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(interval * currentEase);
      }
      newRepetitions = repetitions + 1;
    } else {
      // Failed recall - reset repetitions and set short interval
      newRepetitions = 0;
      newInterval = 1;
    }

    // Update ease factor based on quality
    // EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
    const newEase = Math.max(
      1.3,
      currentEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
    newEaseFactor = Math.round(newEase * 1000);

    // Calculate next review date
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

    return {
      repetitions: newRepetitions,
      easeFactor: newEaseFactor,
      interval: newInterval,
      nextReviewDate,
    };
  }

  // Get learning statistics for a database (batch-focused)
  static async getBatchLearningStats(userId: string, databaseId: string) {
    const batches = await this.getBatchesForDatabase(userId, databaseId);
    const activeBatch = await this.getActiveBatch(userId, databaseId);
    
    if (!activeBatch) {
      return {
        totalBatches: batches.length,
        completedBatches: batches.filter(b => b.isCompleted === 'true').length,
        currentBatch: null,
        totalCards: 0,
        dueCards: 0,
        newCards: 0,
        learningCards: 0,
        matureCards: 0,
        reviewsToday: 0,
        batchProgress: 0,
      };
    }

    // Get cards from active batch
    const activeBatchCards = await this.getCardsFromActiveBatch(userId, databaseId);
    const now = new Date();

    const dueCards = activeBatchCards.filter(card => card.nextReviewDate <= now);
    const newCards = activeBatchCards.filter(card => card.repetitions === 0);
    const learningCards = activeBatchCards.filter(card => card.repetitions > 0 && card.repetitions < 3);
    const matureCards = activeBatchCards.filter(card => card.repetitions >= 3);

    // Get recent review history
    const recentHistory = await db
      .select()
      .from(reviewHistory)
      .where(eq(reviewHistory.userId, userId))
      .orderBy(desc(reviewHistory.reviewDate))
      .limit(100);

    // Update batch progress
    const wordsLearned = matureCards.length;
    if (wordsLearned !== activeBatch.wordsLearned) {
      await db
        .update(spacedRepetitionBatches)
        .set({ 
          wordsLearned,
          updatedAt: new Date()
        })
        .where(eq(spacedRepetitionBatches.id, activeBatch.id));
    }

    // Check if batch is completed (all words are mature)
    const batchCompleted = activeBatchCards.length > 0 && matureCards.length === activeBatchCards.length;
    
    return {
      totalBatches: batches.length,
      completedBatches: batches.filter(b => b.isCompleted === 'true').length,
      currentBatch: {
        ...activeBatch,
        wordsLearned,
        progress: activeBatch.totalWords > 0 ? (wordsLearned / activeBatch.totalWords) * 100 : 0,
        isReadyForNext: batchCompleted
      },
      totalCards: activeBatchCards.length,
      dueCards: dueCards.length,
      newCards: newCards.length,
      learningCards: learningCards.length,
      matureCards: matureCards.length,
      reviewsToday: recentHistory.filter(review => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return review.reviewDate >= today;
      }).length,
      batchProgress: activeBatch.totalWords > 0 ? (wordsLearned / activeBatch.totalWords) * 100 : 0,
      allBatches: batches.map(batch => ({
        ...batch,
        progress: batch.totalWords > 0 ? (batch.wordsLearned / batch.totalWords) * 100 : 0
      }))
    };
  }

  // Get all cards for a database (for management)
  static async getCardsForDatabase(userId: string, databaseId: string): Promise<SpacedRepetitionCard[]> {
    return await db
      .select()
      .from(spacedRepetitionCards)
      .where(
        and(
          eq(spacedRepetitionCards.userId, userId),
          eq(spacedRepetitionCards.databaseId, databaseId)
        )
      )
      .orderBy(spacedRepetitionCards.nextReviewDate);
  }

  // Delete a card
  static async deleteCard(cardId: string, userId: string): Promise<void> {
    await db
      .delete(spacedRepetitionCards)
      .where(
        and(
          eq(spacedRepetitionCards.id, cardId),
          eq(spacedRepetitionCards.userId, userId)
        )
      );
  }

  // Bulk create cards from words in a database
  static async createCardsFromWords(
    userId: string,
    databaseId: string,
    batchId: string,
    words: Array<{ id: string; word: string; translation: string }>
  ): Promise<SpacedRepetitionCard[]> {
    const cardData: InsertSpacedRepetitionCard[] = words.map(word => ({
      userId,
      databaseId,
      batchId,
      wordId: word.id,
      word: word.word,
      translation: word.translation,
      easeFactor: 2500,
      interval: 1,
      repetitions: 0,
      quality: 0,
      nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }));

    return await db.insert(spacedRepetitionCards).values(cardData).returning();
  }
}