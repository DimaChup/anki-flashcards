// Anki-like Spaced Repetition Algorithm Implementation
import { db } from "./db";
import { spacedRepetitionCards, reviewHistory } from "@shared/schema";
import { eq, and, lte, desc } from "drizzle-orm";
import type { SpacedRepetitionCard, InsertSpacedRepetitionCard } from "@shared/schema";

export class SpacedRepetitionService {
  // Create a new flashcard from a word
  static async createCard(
    userId: string,
    databaseId: string,
    wordId: string,
    word: string,
    translation: string
  ): Promise<SpacedRepetitionCard> {
    const newCard: InsertSpacedRepetitionCard = {
      userId,
      databaseId,
      wordId,
      word,
      translation,
      easeFactor: 2500, // Starting ease factor (2.5 * 1000)
      interval: 1, // 1 day initial interval
      repetitions: 0,
      quality: 0,
      nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    };

    const [card] = await db.insert(spacedRepetitionCards).values(newCard).returning();
    return card;
  }

  // Get cards due for review for a user
  static async getDueCards(userId: string, databaseId?: string): Promise<SpacedRepetitionCard[]> {
    const now = new Date();
    
    let query = db
      .select()
      .from(spacedRepetitionCards)
      .where(
        and(
          eq(spacedRepetitionCards.userId, userId),
          lte(spacedRepetitionCards.nextReviewDate, now)
        )
      )
      .orderBy(spacedRepetitionCards.nextReviewDate);

    if (databaseId) {
      query = query.where(
        and(
          eq(spacedRepetitionCards.userId, userId),
          eq(spacedRepetitionCards.databaseId, databaseId),
          lte(spacedRepetitionCards.nextReviewDate, now)
        )
      );
    }

    return await query;
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

  // Get learning statistics for a user
  static async getLearningStats(userId: string, databaseId?: string) {
    let cardQuery = db
      .select()
      .from(spacedRepetitionCards)
      .where(eq(spacedRepetitionCards.userId, userId));

    if (databaseId) {
      cardQuery = cardQuery.where(
        and(
          eq(spacedRepetitionCards.userId, userId),
          eq(spacedRepetitionCards.databaseId, databaseId)
        )
      );
    }

    const allCards = await cardQuery;
    const now = new Date();

    const dueCards = allCards.filter(card => card.nextReviewDate <= now);
    const newCards = allCards.filter(card => card.repetitions === 0);
    const learningCards = allCards.filter(card => card.repetitions > 0 && card.repetitions < 3);
    const matureCards = allCards.filter(card => card.repetitions >= 3);

    // Get recent review history
    let historyQuery = db
      .select()
      .from(reviewHistory)
      .where(eq(reviewHistory.userId, userId))
      .orderBy(desc(reviewHistory.reviewDate))
      .limit(100);

    const recentHistory = await historyQuery;

    return {
      totalCards: allCards.length,
      dueCards: dueCards.length,
      newCards: newCards.length,
      learningCards: learningCards.length,
      matureCards: matureCards.length,
      averageEaseFactor: allCards.length > 0 
        ? Math.round(allCards.reduce((sum, card) => sum + card.easeFactor, 0) / allCards.length) 
        : 2500,
      reviewsToday: recentHistory.filter(review => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return review.reviewDate >= today;
      }).length,
      recentHistory: recentHistory.slice(0, 10),
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
    words: Array<{ id: string; word: string; translation: string }>
  ): Promise<SpacedRepetitionCard[]> {
    const cardData: InsertSpacedRepetitionCard[] = words.map(word => ({
      userId,
      databaseId,
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