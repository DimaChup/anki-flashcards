import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Brain, Target, Clock, TrendingUp, Star, CheckCircle, XCircle, RotateCcw, Zap, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SpacedRepetitionCard } from '@shared/schema';

interface BatchLearningStats {
  totalBatches: number;
  completedBatches: number;
  currentBatch: {
    id: string;
    name: string;
    batchNumber: number;
    totalWords: number;
    wordsLearned: number;
    progress: number;
    isReadyForNext: boolean;
  } | null;
  totalCards: number;
  dueCards: number;
  newCards: number;
  learningCards: number;
  matureCards: number;
  reviewsToday: number;
  batchProgress: number;
  allBatches: Array<{
    id: string;
    name: string;
    batchNumber: number;
    totalWords: number;
    wordsLearned: number;
    progress: number;
    isActive: boolean;
    isCompleted: boolean;
  }>;
}

interface ActiveBatchData {
  activeBatch: any;
  dueCards: SpacedRepetitionCard[];
  allCards: SpacedRepetitionCard[];
}

interface FlashcardSectionProps {
  selectedDatabaseId: string;
  batchSize: number;
  batchByUnknown: boolean;
  newWordsOnly: boolean;
}

export default function FlashcardSection({ selectedDatabaseId, batchSize, batchByUnknown, newWordsOnly }: FlashcardSectionProps) {
  const [currentCard, setCurrentCard] = useState<SpacedRepetitionCard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedBatchNumber, setSelectedBatchNumber] = useState<number>(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get batch learning statistics
  const { data: stats, isLoading: statsLoading } = useQuery<BatchLearningStats>({
    queryKey: ['/api/spaced-repetition/batch-stats', selectedDatabaseId],
    enabled: !!selectedDatabaseId,
  });

  // Get active batch and cards for selected batch
  const { 
    data: activeBatchData, 
    isLoading: cardsLoading, 
    refetch: refetchCards 
  } = useQuery<ActiveBatchData>({
    queryKey: ['/api/spaced-repetition/batch-cards', selectedDatabaseId, selectedBatchNumber],
    enabled: !!selectedDatabaseId,
    queryFn: async () => {
      const response = await fetch(`/api/spaced-repetition/batch-cards/${selectedDatabaseId}/${selectedBatchNumber}`);
      if (!response.ok) throw new Error('Failed to fetch batch cards');
      return response.json();
    },
  });

  const dueCards = activeBatchData?.dueCards || [];

  // Review card mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ cardId, quality }: { cardId: string; quality: number }) => {
      return apiRequest('POST', '/api/spaced-repetition/review', { cardId, quality });
    },
    onSuccess: () => {
      // Only invalidate stats, not the active batch data to avoid resetting cards
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/batch-stats'] });
      // Don't reset currentCard here - let handleReview manage card progression
      toast({ title: "Card reviewed!", description: "Your progress has been saved." });
    },
  });

  // Create batches mutation
  const createBatchesMutation = useMutation({
    mutationFn: async ({ databaseId, batchSize, batchByUnknown, newWordsOnly }: { databaseId: string; batchSize: number; batchByUnknown: boolean; newWordsOnly: boolean }) => {
      return apiRequest('POST', '/api/spaced-repetition/create-batches', { databaseId, batchSize, batchByUnknown, newWordsOnly });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/batch-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/active-batch'] });
      toast({ title: "Batches created!", description: "Your learning batches are ready to use." });
    },
  });

  // Activate next batch mutation
  const activateNextBatchMutation = useMutation({
    mutationFn: async (databaseId: string) => {
      return apiRequest('POST', `/api/spaced-repetition/activate-next/${databaseId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/batch-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/active-batch'] });
      setCurrentCard(null);
      setShowAnswer(false);
      toast({ title: "Next batch activated!", description: "You can now start learning new words." });
    },
  });

  // Handle review response and move to next card
  const handleReview = (quality: number) => {
    if (currentCard) {
      reviewMutation.mutate({ cardId: currentCard.id, quality });
      
      // Move to next card in the batch
      const allCards = activeBatchData?.allCards || [];
      const currentIndex = allCards.findIndex(card => card.id === currentCard.id);
      const nextIndex = currentIndex + 1;
      
      if (nextIndex < allCards.length) {
        setCurrentCard(allCards[nextIndex]);
        setShowAnswer(false);
      } else {
        // Finished all cards in this batch
        setCurrentCard(null);
        setShowAnswer(false);
      }
    }
  };

  // Create batches from first instances using the EXACT same settings as First Instances list
  const createBatches = () => {
    if (!selectedDatabaseId) return;
    createBatchesMutation.mutate({ databaseId: selectedDatabaseId, batchSize, batchByUnknown, newWordsOnly });
  };

  // Activate next batch
  const activateNextBatch = () => {
    if (!selectedDatabaseId) return;
    activateNextBatchMutation.mutate(selectedDatabaseId);
  };

  // Start reviewing - use all cards from selected batch, not just due cards
  const startReview = () => {
    const allCards = activeBatchData?.allCards || [];
    if (allCards.length > 0) {
      setCurrentCard(allCards[0]);
      setShowAnswer(false);
    }
  };

  const qualityButtons = [
    { quality: 0, label: "Again", color: "bg-red-500", icon: XCircle },
    { quality: 1, label: "Hard", color: "bg-orange-500", icon: RotateCcw },
    { quality: 3, label: "Good", color: "bg-blue-500", icon: CheckCircle },
    { quality: 4, label: "Easy", color: "bg-green-500", icon: Zap },
    { quality: 5, label: "Perfect", color: "bg-purple-500", icon: Star },
  ];

  if (!selectedDatabaseId) {
    return null;
  }

  if (statsLoading || cardsLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4">Loading flashcard data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-purple-600" />
          Batch-Based Flashcard Learning
        </CardTitle>
        <CardDescription>
          Learn vocabulary using scientifically-proven spaced repetition, organized by word appearance in your text
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Batch Selector */}
        {stats && stats.totalBatches > 0 && (
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <label className="text-sm font-medium">Select Batch to Learn:</label>
            <Select 
              value={selectedBatchNumber.toString()} 
              onValueChange={(value) => {
                setSelectedBatchNumber(parseInt(value));
                setCurrentCard(null);
                setShowAnswer(false);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select batch" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: stats.totalBatches }, (_, i) => i + 1).map((batchNum) => (
                  <SelectItem key={batchNum} value={batchNum.toString()}>
                    Batch {batchNum} {stats.allBatches?.find(b => b.batchNumber === batchNum)?.isCompleted ? '✓' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {dueCards.length} cards due in this batch
            </span>
          </div>
        )}

        {currentCard ? (
          // Review Session
          <div className="space-y-6">
            <div className="text-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
              <h3 className="text-2xl font-bold mb-2">{currentCard.word}</h3>
              <p className="text-sm text-gray-600">
                Interval: {currentCard.interval} days | Repetitions: {currentCard.repetitions} | 
                Ease: {(currentCard.easeFactor / 1000).toFixed(1)}
              </p>
            </div>
            
            {!showAnswer ? (
              <div className="text-center">
                <p className="text-lg mb-6">Think of the translation...</p>
                <Button 
                  onClick={() => setShowAnswer(true)}
                  size="lg"
                  data-testid="show-answer-button"
                >
                  Show Answer
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-xl font-semibold">{currentCard.translation}</p>
                </div>
                
                <div className="text-center">
                  <p className="mb-4">How well did you know this word?</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {qualityButtons.map(({ quality, label, color, icon: Icon }) => (
                      <Button
                        key={quality}
                        onClick={() => handleReview(quality)}
                        className={`${color} hover:opacity-80 text-white`}
                        disabled={reviewMutation.isPending}
                        data-testid={`quality-${quality}-button`}
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Simple Dashboard - Just batch selector and start button
          <div className="space-y-6">
            {stats && stats.totalBatches > 0 ? (
              <div className="text-center space-y-4">
                <p className="text-gray-600 dark:text-gray-400">
                  Ready to learn words from Batch {selectedBatchNumber}
                </p>
                
                <Button 
                  onClick={startReview} 
                  size="lg" 
                  className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  data-testid="start-review-button"
                  disabled={!activeBatchData?.allCards || activeBatchData.allCards.length === 0}
                >
                  <Brain className="h-5 w-5 mr-2" />
                  Start Learning Batch {selectedBatchNumber}
                </Button>
                
                {activeBatchData?.allCards && (
                  <p className="text-sm text-gray-500">
                    {activeBatchData.allCards.length} words in this batch
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
                <Brain className="h-12 w-12 mx-auto mb-4 text-purple-600" />
                <h4 className="font-semibold mb-2">Create Learning Batches</h4>
                <p className="text-sm text-gray-600 mb-4">
                  Organize words from your database into learning batches based on their first appearance in the text
                </p>
                <Button 
                  onClick={createBatches}
                  disabled={createBatchesMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {createBatchesMutation.isPending ? "Creating Batches..." : `Create Batches (${batchSize} words each)`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}