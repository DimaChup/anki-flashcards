import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Brain, ArrowLeft, Play, RotateCcw, Eye, EyeOff, Filter } from 'lucide-react';
import type { LinguisticDatabase } from '@shared/schema';

interface AnkiDeck {
  id: string;
  deckName: string;
  totalCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
}

interface AnkiCard {
  id: string;
  word: string;
  translations: string[];
  pos: string;
  lemma: string;
  sentence: string;
  status: 'new' | 'learning' | 'review';
  wordKey: number; // Position in original text
}

// Helper function to get POS text color
function getPosTextColor(pos: string): string {
  const posLower = pos.toLowerCase();
  if (posLower.includes('verb')) return 'text-pink-300';
  if (posLower.includes('noun') || posLower.includes('propn')) return 'text-blue-300';
  if (posLower.includes('adj')) return 'text-green-300';
  if (posLower.includes('aux')) return 'text-yellow-300';
  return 'text-orange-300';
}

export default function AnkiStudy() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [currentCard, setCurrentCard] = useState<AnkiCard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [studyStarted, setStudyStarted] = useState(false);
  const [viewDeck, setViewDeck] = useState(false);
  const [newCardsLimit, setNewCardsLimit] = useState(20);
  const [hideKnownWords, setHideKnownWords] = useState(false);
  const [posAssist, setPosAssist] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  // Get user's databases
  const { data: databases = [] } = useQuery<LinguisticDatabase[]>({
    queryKey: ['/api/databases'],
    enabled: isAuthenticated,
  });

  // Get Anki deck for selected database
  const { data: deck, isLoading: deckLoading, refetch: refetchDeck } = useQuery<AnkiDeck>({
    queryKey: ['/api/anki/deck', selectedDatabase],
    enabled: !!selectedDatabase,
  });

  // Get cards for deck view (all cards ordered by wordKey)
  const { data: allCards = [], isLoading: cardsLoading } = useQuery<AnkiCard[]>({
    queryKey: ['/api/anki/cards', deck?.id],
    enabled: !!deck?.id && viewDeck, // Only load when viewing deck
  });

  // Get study queue for study sessions (proper Anki spaced repetition)
  const { data: studyQueue = [], isLoading: studyQueueLoading, refetch: refetchStudyQueue } = useQuery<AnkiCard[]>({
    queryKey: ['/api/anki/study-queue', deck?.id, newCardsLimit, 100], 
    queryFn: async () => {
      const response = await fetch(`/api/anki/deck/${deck?.id}/study-queue?newCards=${newCardsLimit}&reviewLimit=100`);
      if (!response.ok) throw new Error('Failed to fetch study queue');
      return response.json();
    },
    enabled: !!deck?.id, // Load when deck is available to show correct button text
  });

  // Get known words from the database
  const { data: databaseData } = useQuery<LinguisticDatabase>({
    queryKey: ['/api/databases', selectedDatabase],
    enabled: !!selectedDatabase,
  });



  // Apply known words filter to study queue if enabled
  const filteredStudyQueue = React.useMemo(() => {
    if (!hideKnownWords || !databaseData?.knownWords || !Array.isArray(databaseData.knownWords)) {
      return studyQueue;
    }
    
    // Extract just the word part from knownWords (format: "word::POS" -> "word")
    const knownWordsSet = new Set(
      databaseData.knownWords
        .map(w => {
          const wordPart = w.split('::')[0];
          return wordPart.toLowerCase();
        })
    );
    
    return studyQueue.filter(card => {
      const cardWordLower = card.word.toLowerCase();
      return !knownWordsSet.has(cardWordLower);
    });
  }, [hideKnownWords, databaseData?.knownWords, studyQueue]);

  // Apply known words filter to view cards if enabled
  const filteredViewCards = React.useMemo(() => {
    if (!viewDeck || !hideKnownWords || !databaseData?.knownWords || !Array.isArray(databaseData.knownWords)) {
      return allCards;
    }
    
    const knownWordsSet = new Set(
      databaseData.knownWords
        .map(w => {
          const wordPart = w.split('::')[0];
          return wordPart.toLowerCase();
        })
    );
    
    return allCards.filter(card => {
      const cardWordLower = card.word.toLowerCase();
      return !knownWordsSet.has(cardWordLower);
    });
  }, [viewDeck, hideKnownWords, databaseData?.knownWords, allCards]);

  // Current study session state
  const [sessionCards, setSessionCards] = React.useState<AnkiCard[]>([]);
  const [sessionCycleCards, setSessionCycleCards] = React.useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);

  // Generate Anki deck mutation
  const generateDeckMutation = useMutation({
    mutationFn: async (databaseId: string) => {
      const response = await apiRequest('POST', `/api/anki/generate-deck/${databaseId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Anki Deck Generated!", 
        description: "Your flashcard deck has been created from first-instance words." 
      });
      refetchDeck();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to generate Anki deck",
        variant: "destructive" 
      });
    }
  });

  // Regenerate Anki deck mutation - resets all progress 
  const regenerateDeckMutation = useMutation({
    mutationFn: async (databaseId: string) => {
      const response = await apiRequest('POST', `/api/anki/regenerate/${databaseId}`, {});
      return response.json();
    },
    onSuccess: () => {
      // Invalidate ALL relevant caches to show updated card statuses
      queryClient.invalidateQueries({ queryKey: ['/api/anki/deck', selectedDatabase] });
      queryClient.invalidateQueries({ queryKey: ['/api/anki/cards', deck?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/anki/study-queue', deck?.id] });
      
      toast({ 
        title: "Deck Reset!", 
        description: "All cards reset to new status - progress cleared" 
      });
      refetchDeck();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to regenerate deck",
        variant: "destructive" 
      });
    }
  });

  // Review card mutation with session cycling logic
  const reviewCardMutation = useMutation({
    mutationFn: async ({ cardId, rating }: { cardId: string; rating: number }) => {
      const response = await apiRequest('POST', '/api/anki/review', { cardId, rating });
      return response.json();
    },
    onSuccess: (updatedCard, variables) => {
      const { rating } = variables;
      
      // Session cycling logic: Hard cards cycle back, Easy cards graduate
      if (rating === 2) { // Hard - add to cycle list
        if (currentCard) {
          setSessionCycleCards(prev => [...prev.filter(id => id !== currentCard.id), currentCard.id]);
        }
      } else if (rating === 4 && currentCard) { // Easy - check if already marked easy
        const previousEasyCount = (currentCard as any).sessionEasyCount || 0;
        if (previousEasyCount >= 1) {
          // Second Easy - remove from cycle list
          setSessionCycleCards(prev => prev.filter(id => id !== currentCard.id));
        }
      }
      
      // Move to next card
      handleNextCard();
      
      // Invalidate queries to refresh deck view and study queue
      queryClient.invalidateQueries({ queryKey: ['/api/anki/deck', selectedDatabase] });
      queryClient.invalidateQueries({ queryKey: ['/api/anki/cards', deck?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/anki/study-queue', deck?.id] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to review card",
        variant: "destructive" 
      });
    }
  });

  // Initialize study session with proper queue management
  React.useEffect(() => {
    if (studyStarted && filteredStudyQueue.length > 0 && !currentCard) {
      // Initialize session with study queue
      setSessionCards(filteredStudyQueue);
      setCurrentIndex(0);
      setCurrentCard(filteredStudyQueue[0]);
      setShowAnswer(false);
      setSessionCycleCards([]); // Reset cycle tracking
    }
  }, [studyStarted, filteredStudyQueue, currentCard]);

  // Handle next card logic with session cycling
  const handleNextCard = () => {
    let nextIndex = currentIndex + 1;
    let nextCard: AnkiCard | null = null;

    // First check if we have more cards in the current session
    if (nextIndex < sessionCards.length) {
      nextCard = sessionCards[nextIndex];
      setCurrentIndex(nextIndex);
    } else {
      // Check if we have cards that need to cycle back (marked Hard)
      const cardsToReview = sessionCards.filter(card => sessionCycleCards.includes(card.id));
      
      if (cardsToReview.length > 0) {
        // Cycle back to first hard card
        nextCard = cardsToReview[0];
        setCurrentIndex(sessionCards.findIndex(card => card.id === nextCard?.id));
      } else {
        // Session complete - no more cards to review
        setStudyStarted(false);
        setCurrentCard(null);
        setCurrentIndex(0);
        setSessionCards([]);
        setSessionCycleCards([]);
        
        const totalReviewed = sessionCards.length;
        // Refresh deck view to show updated statuses
        queryClient.invalidateQueries({ queryKey: ['/api/anki/deck', selectedDatabase] });
        queryClient.invalidateQueries({ queryKey: ['/api/anki/cards', selectedDatabase] });
        
        toast({ 
          title: "Study Session Complete!", 
          description: `Great work! You reviewed ${totalReviewed} cards using Anki's spaced repetition algorithm.` 
        });
        return;
      }
    }

    setCurrentCard(nextCard);
    setShowAnswer(false);
  };

  const startStudy = () => {
    if (filteredStudyQueue.length === 0) {
      toast({ 
        title: "No Cards Available", 
        description: "No cards are due for review. Try adjusting settings or come back later.",
        variant: "destructive" 
      });
      return;
    }
    
    setStudyStarted(true);
    // currentCard will be set by useEffect when studyStarted becomes true
  };

  const handleCardReview = (rating: number) => {
    if (currentCard) {
      reviewCardMutation.mutate({ cardId: currentCard.id, rating });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-1 sm:px-2 md:px-4 py-3 sm:py-4 md:py-8">
        
        {/* Header - iPhone XR Optimized */}
        <div className="mb-3 sm:mb-4 md:mb-8">
          <Button
            onClick={() => setLocation('/')}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700 mb-3 sm:mb-4 min-h-[48px] sm:min-h-[44px] text-xs sm:text-sm md:text-base px-3 py-2"
            data-testid="button-back-home"
          >
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Back to Home</span>
            <span className="sm:hidden">Home</span>
          </Button>
          
          <h1 className="text-xl sm:text-2xl md:text-4xl font-bold text-white mb-2">
            <Brain className="inline h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 mr-1 sm:mr-2 md:mr-3 text-purple-400" />
            <span className="hidden sm:inline">Anki Study System</span>
            <span className="sm:hidden">Anki Study</span>
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm md:text-lg">
            <span className="hidden sm:inline">Generate flashcard decks from your linguistic databases and study with spaced repetition</span>
            <span className="sm:hidden">Smart flashcard learning system</span>
          </p>
        </div>

        <div className="max-w-4xl mx-auto px-1 sm:px-0">
          
          {/* Database Selection - iPhone XR Optimized */}
          {!selectedDatabase && (
            <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl">
              <CardHeader className="px-3 sm:px-6 py-4 sm:py-6">
                <CardTitle className="text-white text-lg sm:text-2xl">Select Database</CardTitle>
                <p className="text-slate-300 text-sm sm:text-base">Choose a linguistic database to create your Anki deck from</p>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6">
                <Select onValueChange={setSelectedDatabase} data-testid="select-database">
                  <SelectTrigger className="w-full bg-slate-700 border-slate-600 text-white">
                    <SelectValue placeholder="Select a database..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    {databases.map((db) => (
                      <SelectItem 
                        key={db.id} 
                        value={db.id} 
                        className="text-white hover:bg-slate-600"
                        data-testid={`option-database-${db.id}`}
                      >
                        {db.name} ({db.language}) - {db.wordCount} words
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Deck Generation/Management */}
          {selectedDatabase && !studyStarted && (
            <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl">
              <CardHeader>
                <CardTitle className="text-white text-2xl flex items-center gap-3">
                  <Brain className="h-6 w-6 text-purple-400" />
                  Anki Deck Management
                </CardTitle>
                <p className="text-slate-300">
                  Generate and study flashcards from first-instance words in your selected database
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Database Info */}
                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <p className="text-slate-300">
                    <span className="font-medium">Selected Database:</span>{' '}
                    {databases.find(db => db.id === selectedDatabase)?.name}
                  </p>
                  <Button
                    onClick={() => setSelectedDatabase('')}
                    variant="outline"
                    size="sm"
                    className="mt-2 border-slate-600 text-slate-300 hover:bg-slate-700"
                    data-testid="button-change-database"
                  >
                    Change Database
                  </Button>
                </div>

                {/* Deck Status */}
                {deckLoading ? (
                  <div className="text-center py-8">
                    <div className="text-slate-300">Loading deck information...</div>
                  </div>
                ) : deck ? (
                  <div className="space-y-4">
                    <div className="bg-green-900/20 border border-green-700 p-4 rounded-lg">
                      <h3 className="text-green-400 font-semibold mb-2">✓ Anki Deck Ready</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-white" data-testid="text-total-cards">{deck.totalCards}</div>
                          <div className="text-slate-400">Total Cards</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-400" data-testid="text-new-cards">{deck.newCards}</div>
                          <div className="text-slate-400">New</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-yellow-400" data-testid="text-learning-cards">{deck.learningCards}</div>
                          <div className="text-slate-400">Learning</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-400" data-testid="text-review-cards">{deck.reviewCards}</div>
                          <div className="text-slate-400">Review</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Study Settings */}
                    <div className="bg-slate-700/50 p-4 rounded-lg space-y-4">
                      <h4 className="text-slate-300 font-medium">Study Settings</h4>
                      <div className="flex items-center gap-4">
                        <label className="text-slate-300 text-sm">New cards to study:</label>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => setNewCardsLimit(Math.max(1, newCardsLimit - 5))}
                            variant="outline"
                            size="sm"
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 h-8 w-8 p-0"
                            data-testid="button-decrease-cards"
                          >
                            -
                          </Button>
                          <input
                            type="number"
                            value={newCardsLimit}
                            onChange={(e) => setNewCardsLimit(Math.max(1, Math.min(filteredViewCards.length, parseInt(e.target.value) || 1)))}
                            className="w-16 h-8 text-center bg-slate-800 border border-slate-600 text-white rounded text-sm"
                            min="1"
                            max={filteredViewCards.length}
                            data-testid="input-cards-limit"
                          />
                          <Button
                            onClick={() => setNewCardsLimit(Math.min(filteredViewCards.length, newCardsLimit + 5))}
                            variant="outline"
                            size="sm"
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 h-8 w-8 p-0"
                            data-testid="button-increase-cards"
                          >
                            +
                          </Button>
                          <span className="text-slate-400 text-sm">
                            of {filteredViewCards.length} available
                            {hideKnownWords && databaseData?.knownWords && Array.isArray(databaseData.knownWords) && (
                              <span className="ml-1 text-orange-400">
                                ({deck.totalCards - filteredViewCards.length} known words hidden)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      
                      {/* POS Assist Toggle */}
                      <div className="flex items-center gap-4">
                        <label className="text-slate-300 text-sm">POS Assist:</label>
                        <Button
                          onClick={() => setPosAssist(!posAssist)}
                          variant="outline"
                          size="sm"
                          className={`border-slate-600 text-sm ${
                            posAssist 
                              ? 'bg-purple-600 text-white border-purple-600' 
                              : 'text-slate-300 hover:bg-slate-700'
                          }`}
                          data-testid="button-pos-assist"
                        >
                          {posAssist ? 'ON' : 'OFF'}
                        </Button>
                        <span className="text-slate-400 text-xs">
                          Color-code words by part of speech during study
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <Button
                        onClick={startStudy}
                        disabled={studyQueueLoading || (!studyStarted && filteredStudyQueue.length === 0)}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                        data-testid="button-start-study"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {studyQueueLoading 
                          ? 'Loading study queue...' 
                          : `Start Study Session (${filteredStudyQueue.length} cards due)`
                        }
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="text-slate-300 mb-4">
                      No Anki deck found for this database. Generate one to start studying!
                    </div>
                    <Button
                      onClick={() => generateDeckMutation.mutate(selectedDatabase)}
                      disabled={generateDeckMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 text-lg"
                      data-testid="button-generate-deck"
                    >
                      <Brain className="h-5 w-5 mr-2" />
                      {generateDeckMutation.isPending ? 'Generating...' : 'Generate Anki Deck'}
                    </Button>
                    <p className="text-sm text-slate-400">
                      This will create flashcards from all first-instance words in your database, 
                      maintaining their original order in the text.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Study Session - Mobile Optimized */}
          {studyStarted && currentCard && (
            <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl">
              <CardHeader className="px-3 md:px-6">
                <CardTitle className="text-white text-lg md:text-2xl">Study Session</CardTitle>
                <div className="flex justify-between text-xs md:text-sm text-slate-400 mt-2">
                  <span>Card {sessionCards.findIndex(c => c.id === currentCard.id) + 1} of {sessionCards.length}</span>
                  <span className="hidden sm:inline">Position: {currentCard.wordKey}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 md:space-y-6 px-3 md:px-6">
                
                {/* Flash Card - Mobile Responsive */}
                <div className="bg-slate-700/50 p-4 md:p-8 rounded-lg text-center min-h-[200px] md:min-h-[250px] flex flex-col justify-center">
                  <div className={`text-2xl md:text-4xl font-bold mb-4 break-words ${
                    posAssist 
                      ? getPosTextColor(currentCard.pos)
                      : 'text-white'
                  }`} data-testid="text-card-word">
                    {currentCard.word}
                  </div>
                  
                  {!showAnswer ? (
                    <Button
                      onClick={() => setShowAnswer(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white mx-auto min-h-[50px] px-8 text-lg"
                      data-testid="button-show-answer"
                    >
                      Show Answer
                    </Button>
                  ) : (
                    <div className="space-y-3 md:space-y-4">
                      <div className="text-lg md:text-xl text-green-400 break-words" data-testid="text-card-translations">
                        {currentCard.translations.join(', ')}
                      </div>
                      {currentCard.lemma && (
                        <div className="text-sm text-blue-300">
                          <span className="font-medium">Lemma:</span> {currentCard.lemma}
                        </div>
                      )}
                      {currentCard.pos && (
                        <div className="text-sm text-slate-400">
                          <span className="font-medium">POS:</span> {currentCard.pos}
                        </div>
                      )}
                      {currentCard.sentence && (
                        <div className="text-xs md:text-sm text-slate-300 italic border-l-2 border-slate-600 pl-3 md:pl-4 break-words">
                          "{currentCard.sentence}"
                        </div>
                      )}
                      
                      {/* Rating Buttons - iPhone XR Optimized */}
                      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:flex md:gap-3 justify-center mt-3 sm:mt-4 md:mt-6">
                        <Button
                          onClick={() => handleCardReview(1)}
                          disabled={reviewCardMutation.isPending}
                          variant="destructive"
                          className="min-h-[52px] sm:min-h-[50px] text-sm md:text-base font-semibold"
                          data-testid="button-again"
                        >
                          Again
                        </Button>
                        <Button
                          onClick={() => handleCardReview(2)}
                          disabled={reviewCardMutation.isPending}
                          className="bg-yellow-600 hover:bg-yellow-700 min-h-[52px] sm:min-h-[50px] text-sm md:text-base font-semibold"
                          data-testid="button-hard"
                        >
                          Hard
                        </Button>
                        <Button
                          onClick={() => handleCardReview(3)}
                          disabled={reviewCardMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700 min-h-[52px] sm:min-h-[50px] text-sm md:text-base font-semibold"
                          data-testid="button-good"
                        >
                          Good
                        </Button>
                        <Button
                          onClick={() => handleCardReview(4)}
                          disabled={reviewCardMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 min-h-[52px] sm:min-h-[50px] text-sm md:text-base font-semibold"
                          data-testid="button-easy"
                        >
                          Easy
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Study Controls - Mobile Responsive */}
                <div className="flex justify-center pt-2">
                  <Button
                    onClick={() => {
                      setStudyStarted(false);
                      setCurrentCard(null);
                      setShowAnswer(false);
                    }}
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 min-h-[44px] text-sm md:text-base"
                    data-testid="button-end-session"
                  >
                    <span className="hidden sm:inline">End Study Session</span>
                    <span className="sm:hidden">End Session</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deck Controls - Always visible when deck exists */}
          {selectedDatabase && deck && (
            <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl mt-6">
              <CardHeader>
                <CardTitle className="text-white text-xl">Deck Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <Button
                      onClick={() => setViewDeck(!viewDeck)}
                      disabled={deck.totalCards === 0}
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      data-testid="button-view-deck"
                    >
                      {viewDeck ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                      {viewDeck ? 'Hide Deck' : 'View Deck'}
                    </Button>
                    
                    <Button
                      onClick={() => regenerateDeckMutation.mutate(selectedDatabase)}
                      disabled={regenerateDeckMutation.isPending}
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      data-testid="button-regenerate-deck"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {regenerateDeckMutation.isPending ? 'Resetting...' : 'Regenerate Deck'}
                    </Button>
                  </div>

                  {/* Filter Toggle */}
                  {databaseData?.knownWords && Array.isArray(databaseData.knownWords) && databaseData.knownWords.length > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
                      <Filter className="h-4 w-4 text-orange-400" />
                      <span className="text-slate-300 text-sm">Filter Options:</span>
                      <Button
                        onClick={() => setHideKnownWords(!hideKnownWords)}
                        variant="outline"
                        size="sm"
                        className={`border-slate-600 text-sm ${
                          hideKnownWords 
                            ? 'bg-orange-600 text-white border-orange-600' 
                            : 'text-slate-300 hover:bg-slate-700'
                        }`}
                        data-testid="button-hide-known-words"
                      >
                        {hideKnownWords ? 'Show Known Words' : 'Hide Known Words'}
                      </Button>
                      <span className="text-slate-400 text-xs">
                        {Array.isArray(databaseData?.knownWords) ? databaseData.knownWords.length : 0} known words in database
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deck Viewing Table */}
          {selectedDatabase && viewDeck && deck && (
            <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl mt-6">
              <CardHeader>
                <CardTitle className="text-white text-2xl flex items-center gap-3">
                  <Eye className="h-6 w-6 text-blue-400" />
                  Anki Deck Contents
                </CardTitle>
                <p className="text-slate-300">
                  All flashcards in this deck, ordered by their appearance in the original text
                </p>
              </CardHeader>
              <CardContent>
                {cardsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-slate-300">Loading cards...</div>
                  </div>
                ) : filteredViewCards.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-slate-400">No cards found in this deck</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm text-slate-400 mb-4">
                      Showing {filteredViewCards.length} cards in text order
                    </div>
                    
                    {/* Table for larger screens */}
                    <div className="hidden md:block">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-600">
                              <th className="text-left p-3 text-slate-300 font-medium">Position</th>
                              <th className="text-left p-3 text-slate-300 font-medium">Word</th>
                              <th className="text-left p-3 text-slate-300 font-medium">Translation</th>
                              <th className="text-left p-3 text-slate-300 font-medium">POS</th>
                              <th className="text-left p-3 text-slate-300 font-medium">Status</th>
                              <th className="text-left p-3 text-slate-300 font-medium">Context</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredViewCards.map((card, index) => (
                              <tr 
                                key={card.id} 
                                className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors"
                                data-testid={`row-card-${index}`}
                              >
                                <td className="p-3 text-slate-400 font-mono text-sm" data-testid={`text-position-${index}`}>
                                  {card.wordKey}
                                </td>
                                <td className={`p-3 font-semibold ${getPosTextColor(card.pos)}`} data-testid={`text-word-${index}`}>
                                  {card.word}
                                </td>
                                <td className="p-3 text-green-400" data-testid={`text-translations-${index}`}>
                                  {card.translations.join(', ')}
                                </td>
                                <td className="p-3 text-blue-400 text-sm" data-testid={`text-pos-${index}`}>
                                  {card.pos || '-'}
                                </td>
                                <td className="p-3" data-testid={`text-status-${index}`}>
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    card.status === 'new' ? 'bg-blue-900 text-blue-300' :
                                    card.status === 'learning' ? 'bg-yellow-900 text-yellow-300' :
                                    'bg-green-900 text-green-300'
                                  }`}>
                                    {card.status}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-400 text-sm max-w-md truncate" data-testid={`text-sentence-${index}`}>
                                  {card.sentence || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {/* Cards for mobile screens */}
                    <div className="md:hidden space-y-4">
                      {filteredViewCards.map((card, index) => (
                        <div 
                          key={card.id} 
                          className="bg-slate-700/50 p-4 rounded-lg border border-slate-600"
                          data-testid={`card-mobile-${index}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className={`font-semibold text-lg ${getPosTextColor(card.pos)}`} data-testid={`text-mobile-word-${index}`}>
                              {card.word}
                            </div>
                            <div className="text-slate-400 text-sm font-mono" data-testid={`text-mobile-position-${index}`}>
                              #{card.wordKey}
                            </div>
                          </div>
                          <div className="text-green-400 mb-2" data-testid={`text-mobile-translations-${index}`}>
                            {card.translations.join(', ')}
                          </div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-blue-400 text-sm" data-testid={`text-mobile-pos-${index}`}>
                              {card.pos || 'Unknown POS'}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              card.status === 'new' ? 'bg-blue-900 text-blue-300' :
                              card.status === 'learning' ? 'bg-yellow-900 text-yellow-300' :
                              'bg-green-900 text-green-300'
                            }`} data-testid={`text-mobile-status-${index}`}>
                              {card.status}
                            </span>
                          </div>
                          {card.sentence && (
                            <div className="text-slate-400 text-sm italic border-l-2 border-slate-600 pl-3" data-testid={`text-mobile-sentence-${index}`}>
                              "{card.sentence}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}