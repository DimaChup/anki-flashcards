import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  RotateCcw, 
  CheckCircle, 
  XCircle,
  Zap,
  Clock,
  Target
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { AnkiStudyDeck, AnkiFlashcard } from '@shared/schema';

interface AnkiFlashcardSectionProps {
  databaseId: string;
}

export default function AnkiFlashcardSection({ databaseId }: AnkiFlashcardSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentCard, setCurrentCard] = useState<AnkiFlashcard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Get Anki deck for the database
  const { data: deck, isLoading: deckLoading } = useQuery<AnkiStudyDeck>({
    queryKey: ['/api/anki/deck', databaseId],
    enabled: !!databaseId,
  });

  // Get cards due for review
  const { 
    data: dueCards = [], 
    isLoading: cardsLoading, 
    refetch: refetchCards 
  } = useQuery<AnkiFlashcard[]>({
    queryKey: ['/api/anki/deck', deck?.id, 'due'],
    enabled: !!deck?.id,
  });

  // Set the first due card as current
  useEffect(() => {
    if (dueCards.length > 0 && !currentCard) {
      setCurrentCard(dueCards[0]);
    }
  }, [dueCards, currentCard]);

  // Review card mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ cardId, rating }: { cardId: string; rating: number }) => {
      return apiRequest('POST', '/api/anki/review', { cardId, rating });
    },
    onSuccess: (updatedCard) => {
      // Move to next card
      const currentIndex = dueCards.findIndex(card => card.id === currentCard?.id);
      const nextCard = dueCards[currentIndex + 1];
      
      if (nextCard) {
        setCurrentCard(nextCard);
      } else {
        setCurrentCard(null);
      }
      
      setShowAnswer(false);
      
      // Refetch deck and due cards
      queryClient.invalidateQueries({ queryKey: ['/api/anki/deck'] });
      refetchCards();
      
      toast({
        title: "Card reviewed",
        description: "Moving to next card",
      });
    },
    onError: (error) => {
      toast({
        title: "Review failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReview = (rating: number) => {
    if (!currentCard) return;
    
    reviewMutation.mutate({
      cardId: currentCard.id,
      rating,
    });
  };

  const showNextCard = () => {
    if (dueCards.length > 1) {
      const currentIndex = dueCards.findIndex(card => card.id === currentCard?.id);
      const nextIndex = (currentIndex + 1) % dueCards.length;
      setCurrentCard(dueCards[nextIndex]);
      setShowAnswer(false);
    }
  };

  if (deckLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Loading Anki deck...</span>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No Anki deck found for this database.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Deck Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            {deck.deckName}
          </CardTitle>
          <CardDescription>
            Anki-style spaced repetition flashcards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{deck.totalCards}</div>
              <div className="text-sm text-muted-foreground">Total Cards</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{deck.newCards}</div>
              <div className="text-sm text-muted-foreground">New</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{deck.learningCards}</div>
              <div className="text-sm text-muted-foreground">Learning</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{deck.reviewCards}</div>
              <div className="text-sm text-muted-foreground">Review</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Study Session */}
      {dueCards.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">All caught up!</h3>
              <p className="text-muted-foreground">
                No cards are due for review right now. Come back later for more practice.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : currentCard ? (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-green-600" />
                Study Session
              </CardTitle>
              <Badge variant="outline">
                {dueCards.findIndex(card => card.id === currentCard.id) + 1} / {dueCards.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Question Side */}
            <div className="text-center">
              <div className="text-3xl font-bold mb-4 text-primary">
                {currentCard.word}
              </div>
              {currentCard.pos && (
                <Badge variant="secondary" className="mb-2">
                  {currentCard.pos}
                </Badge>
              )}
              {currentCard.sentence && (
                <p className="text-muted-foreground italic">
                  "{currentCard.sentence}"
                </p>
              )}
            </div>

            {/* Answer Side */}
            {showAnswer && (
              <div className="border-t pt-4">
                <div className="text-center space-y-2">
                  <div className="text-xl font-semibold text-green-700">
                    {Array.isArray(currentCard.translations) 
                      ? currentCard.translations.join(', ') 
                      : (currentCard.translations as string)}
                  </div>
                  {currentCard.lemma && currentCard.lemma !== currentCard.word && (
                    <div className="text-sm text-muted-foreground">
                      Lemma: {currentCard.lemma}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Status: {currentCard.status} | 
                    Ease: {(currentCard.easeFactor / 100).toFixed(1)} | 
                    Interval: {currentCard.interval} days
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-4">
              {!showAnswer ? (
                <Button
                  onClick={() => setShowAnswer(true)}
                  className="w-full"
                  size="lg"
                  data-testid="button-show-answer"
                >
                  Show Answer
                </Button>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Button
                    onClick={() => handleReview(1)}
                    variant="destructive"
                    size="sm"
                    disabled={reviewMutation.isPending}
                    data-testid="button-again"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Again
                  </Button>
                  <Button
                    onClick={() => handleReview(2)}
                    variant="outline"
                    size="sm"
                    disabled={reviewMutation.isPending}
                    data-testid="button-hard"
                  >
                    <Clock className="h-4 w-4 mr-1" />
                    Hard
                  </Button>
                  <Button
                    onClick={() => handleReview(3)}
                    variant="default"
                    size="sm"
                    disabled={reviewMutation.isPending}
                    data-testid="button-good"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Good
                  </Button>
                  <Button
                    onClick={() => handleReview(4)}
                    variant="default"
                    size="sm"
                    disabled={reviewMutation.isPending}
                    data-testid="button-easy"
                  >
                    <Zap className="h-4 w-4 mr-1" />
                    Easy
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={showNextCard}
                  variant="outline"
                  size="sm"
                  disabled={dueCards.length <= 1}
                  data-testid="button-skip"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Skip
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Progress */}
      {dueCards.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Session Progress</span>
                <span>{dueCards.length} cards remaining</span>
              </div>
              <Progress 
                value={((dueCards.length - (dueCards.findIndex(card => card.id === currentCard?.id) + 1)) / dueCards.length) * 100} 
                className="h-2" 
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}