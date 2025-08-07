import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Brain } from 'lucide-react';
import type { AnkiStudyDeck, AnkiFlashcard } from '@shared/schema';

export default function SimpleFlashcards() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [currentCard, setCurrentCard] = useState<AnkiFlashcard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

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

  // Get Anki deck for selected database
  const { data: deck } = useQuery<AnkiStudyDeck>({
    queryKey: ['/api/anki/deck', selectedDatabase],
    enabled: !!selectedDatabase,
  });

  // Get cards due for review
  const { 
    data: dueCards = [], 
    refetch: refetchCards 
  } = useQuery<AnkiFlashcard[]>({
    queryKey: ['/api/anki/deck', deck?.id, 'due'],
    enabled: !!deck?.id,
  });

  // Set the first due card when cards load
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
    onSuccess: () => {
      // Move to next card
      const currentIndex = dueCards.findIndex(card => card.id === currentCard?.id);
      const nextCard = dueCards[currentIndex + 1];
      
      if (nextCard) {
        setCurrentCard(nextCard);
      } else {
        // Session complete
        setCurrentCard(null);
        toast({
          title: "Session Complete!",
          description: "You've reviewed all due cards.",
        });
      }
      
      setShowAnswer(false);
      
      // Refetch data
      queryClient.invalidateQueries({ queryKey: ['/api/anki/deck'] });
      refetchCards();
    },
  });

  const handleReview = (rating: number) => {
    if (!currentCard) return;
    reviewMutation.mutate({ cardId: currentCard.id, rating });
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-xl">
            <Brain className="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Simple Flashcards</h1>
            <p className="text-muted-foreground">Basic flashcard review system</p>
          </div>
        </div>

        {/* Database Selection */}
        {!selectedDatabase && databases.length > 0 && (
          <Card className="mb-6 max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Select Database</CardTitle>
            </CardHeader>
            <CardContent>
              <Select onValueChange={setSelectedDatabase}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a database..." />
                </SelectTrigger>
                <SelectContent>
                  {databases.map((db: any) => (
                    <SelectItem key={db.id} value={db.id}>
                      {db.name} ({db.language})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Study Card */}
        {selectedDatabase && currentCard && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="flex justify-between items-center mb-4">
                <Badge variant="outline">
                  Card {dueCards.findIndex(card => card.id === currentCard.id) + 1} / {dueCards.length}
                </Badge>
                <Button
                  onClick={() => setSelectedDatabase('')}
                  variant="ghost"
                  size="sm"
                >
                  Change Database
                </Button>
              </div>
              
              <CardTitle className="text-3xl mb-4">{currentCard.word}</CardTitle>
              
              {currentCard.sentence && (
                <p className="text-muted-foreground italic">
                  "{currentCard.sentence}"
                </p>
              )}
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Answer Section */}
              {showAnswer && (
                <div className="border-t pt-6">
                  <div className="text-center space-y-3">
                    <div className="text-2xl font-semibold text-green-600">
                      {Array.isArray(currentCard.translations) 
                        ? currentCard.translations.join(', ') 
                        : (currentCard.translations as string)}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {!showAnswer ? (
                <Button
                  onClick={() => setShowAnswer(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 text-lg"
                >
                  Show Answer
                </Button>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Button
                    onClick={() => handleReview(1)}
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={reviewMutation.isPending}
                  >
                    Again
                  </Button>
                  <Button
                    onClick={() => handleReview(2)}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    disabled={reviewMutation.isPending}
                  >
                    Hard
                  </Button>
                  <Button
                    onClick={() => handleReview(3)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={reviewMutation.isPending}
                  >
                    Good
                  </Button>
                  <Button
                    onClick={() => handleReview(4)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={reviewMutation.isPending}
                  >
                    Easy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Session Complete */}
        {selectedDatabase && dueCards.length === 0 && (
          <Card className="max-w-md mx-auto text-center">
            <CardContent className="py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-2xl font-bold mb-2">All Done!</h3>
              <p className="text-muted-foreground mb-6">
                No cards due for review right now.
              </p>
              <Button
                onClick={() => setSelectedDatabase('')}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Choose Another Database
              </Button>
            </CardContent>
          </Card>
        )}

        {/* No Databases */}
        {databases.length === 0 && (
          <Card className="max-w-md mx-auto text-center">
            <CardContent className="py-8">
              <Brain className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No databases found</h3>
              <p className="text-muted-foreground mb-4">
                Create a database first to start studying.
              </p>
              <Button onClick={() => setLocation('/')}>
                Go to Home
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}