import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Brain, ArrowLeft, Play, RotateCcw, Eye, EyeOff } from 'lucide-react';
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

  // Get cards for the deck (ordered by wordKey to maintain original text order)
  const { data: allCards = [], isLoading: cardsLoading } = useQuery<AnkiCard[]>({
    queryKey: ['/api/anki/cards', deck?.id],
    enabled: !!deck?.id,
  });

  // Filter cards for study session based on newCardsLimit
  const studyCards = allCards.slice(0, newCardsLimit);
  const viewCards = viewDeck ? allCards : [];

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

  // Review card mutation  
  const reviewCardMutation = useMutation({
    mutationFn: async ({ cardId, rating }: { cardId: string; rating: number }) => {
      const response = await apiRequest('POST', '/api/anki/review', { cardId, rating });
      return response.json();
    },
    onSuccess: () => {
      // Move to next card
      const currentIndex = studyCards.findIndex(card => card.id === currentCard?.id);
      const nextCard = studyCards[currentIndex + 1];
      
      if (nextCard) {
        setCurrentCard(nextCard);
        setShowAnswer(false);
      } else {
        // Study session complete
        setStudyStarted(false);
        setCurrentCard(null);
        toast({ title: "Study Session Complete!", description: `Great work! You reviewed ${studyCards.length} cards.` });
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/anki/deck'] });
      queryClient.invalidateQueries({ queryKey: ['/api/anki/cards'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to review card",
        variant: "destructive" 
      });
    }
  });

  const startStudy = () => {
    if (allCards.length > 0) {
      const cardsToStudy = allCards.slice(0, newCardsLimit);
      setCurrentCard(cardsToStudy[0]);
      setStudyStarted(true);
      setShowAnswer(false);
      // Don't hide deck view - user can toggle it during study
    }
  };

  const handleCardReview = (rating: number) => {
    if (currentCard) {
      reviewCardMutation.mutate({ cardId: currentCard.id, rating });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="mb-8">
          <Button
            onClick={() => setLocation('/')}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700 mb-4"
            data-testid="button-back-home"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
          
          <h1 className="text-4xl font-bold text-white mb-2">
            <Brain className="inline h-8 w-8 mr-3 text-purple-400" />
            Anki Study System
          </h1>
          <p className="text-slate-300 text-lg">
            Generate flashcard decks from your linguistic databases and study with spaced repetition
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          
          {/* Database Selection */}
          {!selectedDatabase && (
            <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl">
              <CardHeader>
                <CardTitle className="text-white text-2xl">Select Database</CardTitle>
                <p className="text-slate-300">Choose a linguistic database to create your Anki deck from</p>
              </CardHeader>
              <CardContent className="space-y-4">
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
                            onChange={(e) => setNewCardsLimit(Math.max(1, Math.min(deck.totalCards, parseInt(e.target.value) || 1)))}
                            className="w-16 h-8 text-center bg-slate-800 border border-slate-600 text-white rounded text-sm"
                            min="1"
                            max={deck.totalCards}
                            data-testid="input-cards-limit"
                          />
                          <Button
                            onClick={() => setNewCardsLimit(Math.min(deck.totalCards, newCardsLimit + 5))}
                            variant="outline"
                            size="sm"
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 h-8 w-8 p-0"
                            data-testid="button-increase-cards"
                          >
                            +
                          </Button>
                          <span className="text-slate-400 text-sm">of {deck.totalCards} total</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <Button
                        onClick={startStudy}
                        disabled={deck.totalCards === 0 || cardsLoading}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                        data-testid="button-start-study"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Start Study Session ({newCardsLimit} cards)
                      </Button>
                      
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
                        onClick={() => generateDeckMutation.mutate(selectedDatabase)}
                        disabled={generateDeckMutation.isPending}
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        data-testid="button-regenerate-deck"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Regenerate Deck
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
                ) : viewCards.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-slate-400">No cards found in this deck</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm text-slate-400 mb-4">
                      Showing {viewCards.length} cards in text order
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
                            {viewCards.map((card, index) => (
                              <tr 
                                key={card.id} 
                                className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors"
                                data-testid={`row-card-${index}`}
                              >
                                <td className="p-3 text-slate-400 font-mono text-sm" data-testid={`text-position-${index}`}>
                                  {card.wordKey}
                                </td>
                                <td className="p-3 text-white font-semibold" data-testid={`text-word-${index}`}>
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
                      {viewCards.map((card, index) => (
                        <div 
                          key={card.id} 
                          className="bg-slate-700/50 p-4 rounded-lg border border-slate-600"
                          data-testid={`card-mobile-${index}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-white font-semibold text-lg" data-testid={`text-mobile-word-${index}`}>
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

          {/* Study Session */}
          {studyStarted && currentCard && (
            <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-white text-2xl">Study Session</CardTitle>
                    <div className="flex justify-between text-sm text-slate-400 mt-2">
                      <span>Card {studyCards.findIndex(c => c.id === currentCard.id) + 1} of {studyCards.length}</span>
                      <span>Position in text: {currentCard.wordKey}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => setViewDeck(!viewDeck)}
                    variant="outline"
                    size="sm"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    data-testid="button-toggle-deck-view"
                  >
                    {viewDeck ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    {viewDeck ? 'Hide Deck' : 'View Deck'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Flash Card */}
                <div className="bg-slate-700/50 p-8 rounded-lg text-center min-h-[200px] flex flex-col justify-center">
                  <div className="text-4xl font-bold text-white mb-4" data-testid="text-card-word">
                    {currentCard.word}
                  </div>
                  
                  {!showAnswer ? (
                    <Button
                      onClick={() => setShowAnswer(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white mx-auto"
                      data-testid="button-show-answer"
                    >
                      Show Answer
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-xl text-green-400" data-testid="text-card-translations">
                        {currentCard.translations.join(', ')}
                      </div>
                      {currentCard.pos && (
                        <div className="text-sm text-slate-400">
                          <span className="font-medium">POS:</span> {currentCard.pos}
                        </div>
                      )}
                      {currentCard.sentence && (
                        <div className="text-sm text-slate-300 italic border-l-2 border-slate-600 pl-4">
                          "{currentCard.sentence}"
                        </div>
                      )}
                      
                      {/* Rating Buttons */}
                      <div className="flex gap-2 justify-center mt-6">
                        <Button
                          onClick={() => handleCardReview(1)}
                          disabled={reviewCardMutation.isPending}
                          variant="destructive"
                          data-testid="button-again"
                        >
                          Again
                        </Button>
                        <Button
                          onClick={() => handleCardReview(2)}
                          disabled={reviewCardMutation.isPending}
                          className="bg-yellow-600 hover:bg-yellow-700"
                          data-testid="button-hard"
                        >
                          Hard
                        </Button>
                        <Button
                          onClick={() => handleCardReview(3)}
                          disabled={reviewCardMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700"
                          data-testid="button-good"
                        >
                          Good
                        </Button>
                        <Button
                          onClick={() => handleCardReview(4)}
                          disabled={reviewCardMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                          data-testid="button-easy"
                        >
                          Easy
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Study Controls */}
                <div className="flex justify-center">
                  <Button
                    onClick={() => {
                      setStudyStarted(false);
                      setCurrentCard(null);
                      setShowAnswer(false);
                    }}
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    data-testid="button-end-session"
                  >
                    End Study Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}