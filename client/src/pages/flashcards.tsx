import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  Target, 
  Clock, 
  TrendingUp, 
  RotateCcw, 
  CheckCircle, 
  XCircle,
  Zap,
  Star
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
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

export default function Flashcards() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [currentCard, setCurrentCard] = useState<SpacedRepetitionCard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  // Get user's databases
  const { data: databases = [] } = useQuery({
    queryKey: ['/api/databases'],
    enabled: isAuthenticated,
  });

  // Get batch learning statistics
  const { data: stats, isLoading: statsLoading } = useQuery<BatchLearningStats>({
    queryKey: ['/api/spaced-repetition/batch-stats', selectedDatabase],
    enabled: isAuthenticated && !!selectedDatabase,
  });

  // Get active batch and cards
  const { 
    data: activeBatchData, 
    isLoading: cardsLoading, 
    refetch: refetchCards 
  } = useQuery<ActiveBatchData>({
    queryKey: ['/api/spaced-repetition/active-batch', selectedDatabase],
    enabled: isAuthenticated && !!selectedDatabase,
  });

  const dueCards = activeBatchData?.dueCards || [];

  // Review card mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ cardId, quality }: { cardId: string; quality: number }) => {
      return apiRequest('POST', '/api/spaced-repetition/review', { cardId, quality });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/active-batch'] });
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/batch-stats'] });
      setShowAnswer(false);
      setCurrentCard(null);
    },
  });

  // Create batches mutation
  const createBatchesMutation = useMutation({
    mutationFn: async ({ databaseId, batchSize }: { databaseId: string; batchSize: number }) => {
      return apiRequest('POST', '/api/spaced-repetition/create-batches', { databaseId, batchSize });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/batch-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/spaced-repetition/active-batch'] });
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
    },
  });

  // Start review session
  const startReview = () => {
    if (dueCards.length > 0) {
      setCurrentCard(dueCards[0]);
      setShowAnswer(false);
    }
  };

  // Handle review response
  const handleReview = (quality: number) => {
    if (currentCard) {
      reviewMutation.mutate({ cardId: currentCard.id, quality });
    }
  };

  // Create batches from first instances
  const createBatches = async (batchSize: number = 20) => {
    if (!selectedDatabase) return;
    createBatchesMutation.mutate({ databaseId: selectedDatabase, batchSize });
  };

  // Activate next batch
  const activateNextBatch = () => {
    if (!selectedDatabase) return;
    activateNextBatchMutation.mutate(selectedDatabase);
  };

  if (!isAuthenticated) {
    return <div>Redirecting...</div>;
  }

  const qualityButtons = [
    { quality: 0, label: "Again", color: "bg-red-500", icon: XCircle },
    { quality: 1, label: "Hard", color: "bg-orange-500", icon: RotateCcw },
    { quality: 3, label: "Good", color: "bg-blue-500", icon: CheckCircle },
    { quality: 4, label: "Easy", color: "bg-green-500", icon: Zap },
    { quality: 5, label: "Perfect", color: "bg-purple-500", icon: Star },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-xl">
            <Brain className="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Spaced Repetition Learning</h1>
            <p className="text-muted-foreground">Optimize your vocabulary retention with Anki-like algorithms</p>
          </div>
        </div>

        {/* Database Selection */}
        {databases.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>📚 Select Database for Batch Learning</CardTitle>
              <CardDescription>
                Choose a database to learn words in batches based on their appearance order in the text
              </CardDescription>
            </CardHeader>
            <CardContent>
              <select 
                value={selectedDatabase} 
                onChange={(e) => setSelectedDatabase(e.target.value)}
                className="w-full max-w-md p-3 border border-gray-300 rounded-lg dark:border-gray-600 dark:bg-gray-800"
                data-testid="database-select"
              >
                <option value="">Choose a database to create flashcard batches from...</option>
                {databases.map((db: any) => (
                  <option key={db.id} value={db.id}>
                    {db.name} ({db.language}) - {db.analysisData?.filter((w: any) => w.firstInstance && w.translation).length || 0} words available
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}

        {selectedDatabase && (
          <Tabs defaultValue="review" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="review" data-testid="tab-review">Review</TabsTrigger>
              <TabsTrigger value="stats" data-testid="tab-stats">Statistics</TabsTrigger>
            </TabsList>

            <TabsContent value="review">
              {currentCard ? (
                // Review Session
                <Card className="max-w-2xl mx-auto">
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl">{currentCard.word}</CardTitle>
                    <CardDescription>
                      Interval: {currentCard.interval} days | 
                      Repetitions: {currentCard.repetitions} | 
                      Ease: {(currentCard.easeFactor / 1000).toFixed(1)}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="space-y-6">
                    {!showAnswer ? (
                      <div className="text-center py-8">
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
                        <div className="text-center p-6 bg-muted rounded-lg">
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
                  </CardContent>
                </Card>
              ) : (
                // Batch Learning Dashboard
                <div className="space-y-6">
                  {/* Batch Overview */}
                  {stats?.currentBatch ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          📦 Current Batch: {stats.currentBatch.name}
                        </CardTitle>
                        <CardDescription>
                          Learning words {stats.currentBatch.batchNumber * 20 - 19} to {stats.currentBatch.batchNumber * 20} as they appear in your text
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span>Progress:</span>
                            <span className="font-semibold">
                              {stats.currentBatch.wordsLearned}/{stats.currentBatch.totalWords} words mastered
                            </span>
                          </div>
                          <Progress value={stats.currentBatch.progress} className="w-full" />
                          
                          {stats.currentBatch.isReadyForNext && (
                            <div className="text-center mt-4">
                              <p className="text-green-600 dark:text-green-400 mb-3 font-semibold">
                                🎉 Batch completed! Ready for next batch?
                              </p>
                              <Button 
                                onClick={activateNextBatch}
                                disabled={activateNextBatchMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Start Next Batch
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>Create Learning Batches</CardTitle>
                        <CardDescription>
                          Organize words from your database into learning batches based on their first appearance in the text
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Button 
                          onClick={() => createBatches(20)}
                          disabled={createBatchesMutation.isPending}
                          className="w-full"
                        >
                          {createBatchesMutation.isPending ? "Creating Batches..." : "Create Batches (20 words each)"}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="p-4 text-center">
                          <Target className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                          <p className="text-2xl font-bold">{stats.dueCards}</p>
                          <p className="text-sm text-muted-foreground">Due Now</p>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="p-4 text-center">
                          <Clock className="h-8 w-8 mx-auto mb-2 text-green-600" />
                          <p className="text-2xl font-bold">{stats.reviewsToday}</p>
                          <p className="text-sm text-muted-foreground">Today</p>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="p-4 text-center">
                          <TrendingUp className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                          <p className="text-2xl font-bold">{stats.totalCards}</p>
                          <p className="text-sm text-muted-foreground">Total Cards</p>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="p-4 text-center">
                          <Star className="h-8 w-8 mx-auto mb-2 text-yellow-600" />
                          <p className="text-2xl font-bold">{(stats.averageEaseFactor / 1000).toFixed(1)}</p>
                          <p className="text-sm text-muted-foreground">Avg Ease</p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  <div className="flex gap-4 justify-center">
                    {stats && stats.dueCards > 0 ? (
                      <Button 
                        onClick={startReview} 
                        size="lg" 
                        className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                        data-testid="start-review-button"
                      >
                        <Brain className="h-5 w-5 mr-2" />
                        Start Review ({stats.dueCards} cards)
                      </Button>
                    ) : (
                      <div className="text-center py-8">
                        <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
                        <p className="text-xl font-semibold mb-2">All caught up!</p>
                        <p className="text-muted-foreground mb-4">No cards due for review right now.</p>
                      </div>
                    )}

                    {stats && stats.totalCards === 0 && (
                      <Button 
                        onClick={createFlashcards} 
                        disabled={createCardsMutation.isPending}
                        data-testid="create-flashcards-button"
                      >
                        Create Flashcards from Database
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="stats">
              {stats && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Learning Progress</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <Badge variant="secondary" className="mb-2">New</Badge>
                          <p className="text-2xl font-bold">{stats.newCards}</p>
                        </div>
                        <div className="text-center">
                          <Badge variant="outline" className="mb-2">Learning</Badge>
                          <p className="text-2xl font-bold">{stats.learningCards}</p>
                        </div>
                        <div className="text-center">
                          <Badge variant="default" className="mb-2">Mature</Badge>
                          <p className="text-2xl font-bold">{stats.matureCards}</p>
                        </div>
                        <div className="text-center">
                          <Badge variant="destructive" className="mb-2">Due</Badge>
                          <p className="text-2xl font-bold">{stats.dueCards}</p>
                        </div>
                      </div>
                      
                      {stats.totalCards > 0 && (
                        <div className="mt-6">
                          <p className="text-sm font-medium mb-2">Progress Overview</p>
                          <Progress 
                            value={(stats.matureCards / stats.totalCards) * 100} 
                            className="h-3"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {Math.round((stats.matureCards / stats.totalCards) * 100)}% cards are mature
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {stats.recentHistory.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Recent Reviews</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {stats.recentHistory.slice(0, 5).map((review, index) => (
                            <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                              <span className="text-sm">
                                Quality: {review.quality}/5
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {review.previousInterval}d → {review.newInterval}d
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        {databases.length === 0 && (
          <Card className="text-center py-8">
            <CardContent>
              <Brain className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No databases found</h3>
              <p className="text-muted-foreground mb-4">
                Create or upload a linguistic database first to start learning with flashcards.
              </p>
              <Button onClick={() => setLocation('/create-database')}>
                Create Database
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}