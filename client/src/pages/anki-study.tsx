import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Brain } from 'lucide-react';
import type { AnkiStudyDeck, AnkiFlashcard } from '@shared/schema';

export default function AnkiStudy() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [currentCard, setCurrentCard] = useState<AnkiFlashcard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [newWordsLimit, setNewWordsLimit] = useState(20);
  const [enablePosColors, setEnablePosColors] = useState(true);
  const [excludeKnownWords, setExcludeKnownWords] = useState(true);

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

  // Get study cards for selected database
  const { data: studyData, isLoading: cardsLoading } = useQuery({
    queryKey: [`/api/anki/study-cards/${selectedDatabase}`],
    enabled: !!selectedDatabase,
  });

  // Simple study cards list
  const studyCards = studyData?.cards || [];
  const totalCards = studyData?.totalCards || 0;

  // Set the first card as current when session starts
  useEffect(() => {
    if (sessionStarted && studyCards.length > 0 && !currentCard) {
      setCurrentCard(studyCards[0]);
    }
  }, [sessionStarted, studyCards, currentCard]);

  // Review card mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ cardId, rating }: { cardId: string; rating: number }) => {
      return apiRequest('POST', '/api/anki/review', { cardId, rating });
    },
    onSuccess: () => {
      // Move to next card
      const currentIndex = studyCards.findIndex(card => card.id === currentCard?.id);
      const nextCard = studyCards[currentIndex + 1];
      
      if (nextCard) {
        setCurrentCard(nextCard);
        setShowAnswer(false);
      } else {
        // Session complete
        setCurrentCard(null);
        setSessionStarted(false);
        toast({
          title: "Session Complete!",
          description: "You've studied all available cards. Great job!",
        });
      }
      
      setShowAnswer(false);
      
      // Refetch data
      queryClient.invalidateQueries({ queryKey: ['/api/anki/deck'] });
      refetchCards();
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
    reviewMutation.mutate({ cardId: currentCard.id, rating });
  };

  const startSession = () => {
    if (studyCards.length > 0) {
      setSessionStarted(true);
      setShowAnswer(false);
      setCurrentCard(studyCards[0]);
    }
  };

  const resetSession = () => {
    setSessionStarted(false);
    setCurrentCard(null);
    setShowAnswer(false);
  };

  // Get POS styling class
  const getPosColor = (pos: string) => {
    switch (pos?.toUpperCase()) {
      case 'VERB': return 'bg-pink-100 text-pink-800 border-pink-300';
      case 'NOUN':
      case 'PROPN': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'ADJ': return 'bg-green-100 text-green-800 border-green-300';
      case 'AUX': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="w-full max-w-4xl mx-auto">
        
        {/* Header with Back Button */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-xl">
              <Brain className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Anki Study System</h1>
              <p className="text-slate-300">Master your vocabulary with spaced repetition</p>
            </div>
          </div>
          <Button
            onClick={() => setLocation('/')}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            ← Back to Home
          </Button>
        </div>

        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-full max-w-2xl">
        
            {/* Database Selection */}
            {!selectedDatabase && (
              <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl">
                <CardHeader className="text-center pb-8">
                  <h1 className="text-3xl font-bold text-white mb-2">Flashcard Study System</h1>
                  <p className="text-slate-300">Select a database to begin your Anki-style study session</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Choose Database
                    </label>
                    <Select onValueChange={setSelectedDatabase}>
                      <SelectTrigger className="w-full bg-slate-700 border-slate-600 text-white">
                        <SelectValue placeholder="Select a database..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        {databases.map((db: any) => (
                          <SelectItem key={db.id} value={db.id} className="text-white hover:bg-slate-600">
                            {db.name} ({db.language}) - {db.wordCount} words
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Session Setup */}
            {selectedDatabase && !sessionStarted && (
              <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <h2 className="text-2xl font-bold text-white">Study Session Setup</h2>
              <p className="text-slate-300">Configure your study session</p>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* New words per session control */}
              <div className="flex items-center justify-between">
                <label className="text-slate-300 text-lg">New words per session:</label>
                <input
                  type="number"
                  value={newWordsLimit}
                  onChange={(e) => setNewWordsLimit(Number(e.target.value))}
                  className="w-20 p-2 bg-slate-900 border border-slate-600 text-white text-center rounded text-xl"
                  min="1"
                  max="100"
                />
              </div>

              {/* Toggle for POS color assistance */}
              <div className="flex items-center justify-between">
                <label className="text-slate-300 text-lg cursor-pointer flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={enablePosColors}
                    onChange={(e) => setEnablePosColors(e.target.checked)}
                    className="hidden"
                  />
                  <div className={`relative inline-block w-10 h-5 rounded-full transition-colors ${
                    enablePosColors ? 'bg-blue-600' : 'bg-slate-600'
                  }`}>
                    <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-transform ${
                      enablePosColors ? 'translate-x-5' : 'translate-x-0.5'
                    }`}></div>
                  </div>
                  Enable POS color assistance
                </label>
              </div>

              {/* Toggle for excluding known words */}
              <div className="flex items-center justify-between">
                <label className="text-slate-300 text-lg cursor-pointer flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={excludeKnownWords}
                    onChange={(e) => setExcludeKnownWords(e.target.checked)}
                    className="hidden"
                  />
                  <div className={`relative inline-block w-10 h-5 rounded-full transition-colors ${
                    excludeKnownWords ? 'bg-blue-600' : 'bg-slate-600'
                  }`}>
                    <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-transform ${
                      excludeKnownWords ? 'translate-x-5' : 'translate-x-0.5'
                    }`}></div>
                  </div>
                  Exclude known words
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  onClick={() => {
                    console.log('Start session clicked!', { studyData, cardsLoading });
                    startSession();
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 text-lg"
                  disabled={cardsLoading || totalCards === 0}
                  data-testid="start-session-btn"
                >
                  Start Study Session
                </Button>
                <Button
                  onClick={() => setSelectedDatabase('')}
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700 px-6"
                >
                  Change Database
                </Button>
              </div>
              </CardContent>
              </Card>
            )}

            {/* Study Session */}
            {sessionStarted && (
              <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl min-h-[500px]">
                {studyCards.length === 0 ? (
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="text-6xl mb-4">🎉</div>
                    <h3 className="text-2xl font-bold text-white mb-2">No Cards to Study!</h3>
                    <p className="text-slate-300 mb-6 text-center">
                      All first instance words are already in your known words list.
                    </p>
                    <Button
                      onClick={resetSession}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Back to Setup
                    </Button>
                  </CardContent>
                ) : currentCard ? (
                  <>
                    <CardHeader className="text-center border-b border-slate-700 pb-6">
                      <div className="flex justify-between items-center mb-4">
                        <Badge variant="outline" className="border-slate-600 text-slate-300">
                          {studyCards.findIndex(card => card.id === currentCard.id) + 1} / {studyCards.length}
                        </Badge>
                        <Button
                          onClick={resetSession}
                          variant="ghost"
                          className="text-slate-400 hover:text-white hover:bg-slate-700"
                          size="sm"
                        >
                          End Session
                        </Button>
                      </div>
                  
                  {/* Question */}
                  <div className="space-y-4">
                    <div className="text-4xl font-bold text-white mb-4">
                      {currentCard.word}
                    </div>
                    
                    {currentCard.pos && (
                      <Badge className={`${enablePosColors ? getPosColor(currentCard.pos) : 'bg-gray-100 text-gray-800 border-gray-300'} text-xs font-medium`}>
                        {currentCard.pos}
                      </Badge>
                    )}
                    
                    {currentCard.sentence && (
                      <p className="text-slate-300 italic mt-4 text-lg leading-relaxed">
                        "{currentCard.sentence}"
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  {/* Answer Section */}
                  {showAnswer && (
                    <div className="border-t border-slate-600 pt-6 mb-6">
                      <div className="text-center space-y-3">
                        <div className="text-2xl font-semibold text-green-400">
                          {Array.isArray(currentCard.translations) 
                            ? currentCard.translations.join(', ') 
                            : (currentCard.translations as string)}
                        </div>
                        
                        {currentCard.lemma && currentCard.lemma !== currentCard.word && (
                          <div className="text-slate-400">
                            <span className="text-sm">Lemma: </span>
                            <span className="font-medium">{currentCard.lemma}</span>
                          </div>
                        )}
                        
                        <div className="text-xs text-slate-500 space-x-4">
                          <span>Status: {currentCard.status}</span>
                          <span>Ease: {(currentCard.easeFactor / 100).toFixed(1)}</span>
                          <span>Interval: {currentCard.interval} days</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-4">
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
                          className="bg-red-600 hover:bg-red-700 text-white font-bold py-3"
                          disabled={reviewMutation.isPending}
                        >
                          Again
                        </Button>
                        <Button
                          onClick={() => handleReview(2)}
                          className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3"
                          disabled={reviewMutation.isPending}
                        >
                          Hard
                        </Button>
                        <Button
                          onClick={() => handleReview(3)}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold py-3"
                          disabled={reviewMutation.isPending}
                        >
                          Good
                        </Button>
                        <Button
                          onClick={() => handleReview(4)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3"
                          disabled={reviewMutation.isPending}
                        >
                          Easy
                        </Button>
                      </div>
                    )}
                  </div>
                    </CardContent>
                  </>
                ) : (
                  <CardContent className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                    <span className="ml-4 text-white">Loading cards...</span>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}