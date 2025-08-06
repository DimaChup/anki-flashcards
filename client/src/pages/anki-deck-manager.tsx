import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Book, Play, Trash2, Eye, RotateCcw } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

interface WordEntry {
  id: string;
  word: string;
  pos: string;
  translation: string;
  position: number;
  firstInstance: boolean;
}

interface AnkiCard {
  id: string;
  word: string;
  pos: string;
  translations: string[];
  wordKey: number;
  state: 'new' | 'learning' | 'review';
  due: string;
}

interface AnkiDeck {
  id: string;
  deckName: string;
  totalCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
}

interface Database {
  id: string;
  name: string;
  analysisData: WordEntry[];
  knownWords: string[];
}

export default function AnkiDeckManager() {
  const [, params] = useRoute('/database/:id/anki');
  const databaseId = params?.id;
  const [currentCard, setCurrentCard] = useState<AnkiCard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get database info
  const { data: database } = useQuery<Database>({
    queryKey: [`/api/databases/${databaseId}`],
    enabled: !!databaseId,
  });

  // Get deck info
  const { data: deck } = useQuery<AnkiDeck>({
    queryKey: [`/api/anki-study/settings/${databaseId}`],
    enabled: !!databaseId,
  });

  // Get today's cards
  const { data: todayCards = [], refetch: refetchCards } = useQuery<AnkiCard[]>({
    queryKey: [`/api/anki-study/cards/${databaseId}/today`],
    enabled: !!databaseId,
  });

  // Get ordered deck words (all cards in the deck sorted by position)
  const { data: deckWords = [] } = useQuery<WordEntry[]>({
    queryKey: [`/api/anki-study/deck-words/${databaseId}`],
    enabled: !!databaseId,
  });

  // Initialize deck
  const initializeDeckMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/anki-study/cards/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseId }),
      });
      if (!response.ok) throw new Error('Failed to initialize deck');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/settings/${databaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/cards/${databaseId}/today`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/deck-words/${databaseId}`] });
      toast({ title: 'Deck created successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error creating deck', description: error.message, variant: 'destructive' });
    },
  });

  // Delete deck
  const deleteDeckMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/anki-study/deck/${databaseId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete deck');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/settings/${databaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/cards/${databaseId}/today`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/deck-words/${databaseId}`] });
      setCurrentCard(null);
      toast({ title: 'Deck deleted successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error deleting deck', description: error.message, variant: 'destructive' });
    },
  });

  // Review card
  const reviewCardMutation = useMutation({
    mutationFn: async ({ cardId, difficulty }: { cardId: string; difficulty: string }) => {
      // Map difficulty strings to numbers for API
      const difficultyMap: Record<string, number> = {
        'again': 1,
        'hard': 2, 
        'good': 3,
        'easy': 4
      };
      
      const response = await fetch(`/api/anki-study/cards/${cardId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: difficultyMap[difficulty] }),
      });
      if (!response.ok) throw new Error('Failed to review card');
      return response.json();
    },
    onSuccess: () => {
      refetchCards();
      setCurrentCard(null);
      setShowAnswer(false);
      setSelectedDifficulty('');
    },
    onError: (error) => {
      toast({ title: 'Error reviewing card', description: error.message, variant: 'destructive' });
    },
  });

  // Start study session
  const startStudy = () => {
    if (todayCards.length > 0) {
      setCurrentCard(todayCards[0]);
      setShowAnswer(false);
    }
  };

  // Handle card review
  const handleReview = (difficulty: string) => {
    if (currentCard) {
      reviewCardMutation.mutate({ cardId: currentCard.id, difficulty });
    }
  };

  // Get next card after review
  useEffect(() => {
    if (todayCards.length > 0 && !currentCard) {
      // Don't auto-start, let user click Begin Study
    }
  }, [todayCards, currentCard]);

  if (!database) {
    return <div className="p-6">Loading database...</div>;
  }

  const progress = deck ? ((deck.totalCards - deck.newCards) / deck.totalCards) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href={`/database/${databaseId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Database
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{database.name} - Anki Study</h1>
            <p className="text-muted-foreground">Spaced repetition learning deck</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Study Area */}
          <div className="lg:col-span-2 space-y-6">
            {!deck ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Book className="h-5 w-5" />
                    No Anki Deck Found
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground">
                    Create an Anki deck from this database to start studying with spaced repetition.
                  </p>
                  <Button
                    onClick={() => initializeDeckMutation.mutate()}
                    disabled={initializeDeckMutation.isPending}
                    data-testid="button-create-deck"
                  >
                    {initializeDeckMutation.isPending ? 'Creating...' : 'Create Anki Deck from Database'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Deck Stats */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Book className="h-5 w-5" />
                        {deck.deckName}
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteDeckMutation.mutate()}
                        disabled={deleteDeckMutation.isPending}
                        data-testid="button-delete-deck"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Deck
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span>Progress</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-blue-600">{deck.newCards}</div>
                          <div className="text-sm text-muted-foreground">New</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-yellow-600">{deck.learningCards}</div>
                          <div className="text-sm text-muted-foreground">Learning</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600">{deck.reviewCards}</div>
                          <div className="text-sm text-muted-foreground">Review</div>
                        </div>
                      </div>
                      <div className="text-center">
                        <Badge variant="secondary" className="text-lg px-4 py-2">
                          {todayCards.length} cards due today
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Study Session */}
                {!currentCard ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center space-y-4">
                        <div className="text-6xl">📚</div>
                        <h2 className="text-xl font-semibold">Ready to Study?</h2>
                        <p className="text-muted-foreground">
                          You have {todayCards.length} cards ready for review
                        </p>
                        <Button
                          onClick={startStudy}
                          disabled={todayCards.length === 0}
                          size="lg"
                          data-testid="button-begin-study"
                        >
                          <Play className="h-5 w-5 mr-2" />
                          Begin Study Session
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex justify-between">
                        <span>Study Card</span>
                        <Badge variant={currentCard.state === 'new' ? 'default' : 'secondary'}>
                          {currentCard.state}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="text-center space-y-4">
                        <div className="text-4xl font-bold">{currentCard.word}</div>
                        <Badge variant="outline">{currentCard.pos}</Badge>
                      </div>

                      {showAnswer ? (
                        <div className="space-y-4">
                          <Separator />
                          <div className="text-center">
                            <div className="text-xl font-semibold mb-2">Translation:</div>
                            <div className="text-lg text-muted-foreground">
                              {currentCard.translations.join(', ')}
                            </div>
                          </div>
                          <Separator />
                          <div className="text-center space-y-3">
                            <p className="font-medium">How was that?</p>
                            <div className="flex gap-2 justify-center">
                              <Button
                                variant="destructive"
                                onClick={() => handleReview('again')}
                                disabled={reviewCardMutation.isPending}
                                data-testid="button-again"
                              >
                                Again
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => handleReview('hard')}
                                disabled={reviewCardMutation.isPending}
                                data-testid="button-hard"
                              >
                                Hard
                              </Button>
                              <Button
                                variant="default"
                                onClick={() => handleReview('good')}
                                disabled={reviewCardMutation.isPending}
                                data-testid="button-good"
                              >
                                Good
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => handleReview('easy')}
                                disabled={reviewCardMutation.isPending}
                                data-testid="button-easy"
                              >
                                Easy
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Button onClick={() => setShowAnswer(true)} size="lg" data-testid="button-show-answer">
                            <Eye className="h-5 w-5 mr-2" />
                            Show Answer
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Sidebar - Deck Word Order */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Deck Word Order</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Words in chronological order from the text
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-96">
                  <div className="p-4 space-y-2">
                    {deckWords.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        No deck created yet
                      </div>
                    ) : (
                      deckWords.map((word, index) => (
                        <div
                          key={word.id}
                          className={`flex items-center justify-between p-2 rounded-md border text-sm ${
                            currentCard?.word === word.word
                              ? 'bg-primary/10 border-primary'
                              : 'bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono w-8 text-right">
                              {word.position}
                            </span>
                            <span className="font-medium">{word.word}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {word.pos}
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {deck && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Today's Cards</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Due Today:</span>
                      <span className="font-medium">{todayCards.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Cards:</span>
                      <span className="font-medium">{deck.totalCards}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}