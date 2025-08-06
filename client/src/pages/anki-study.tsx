import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, RotateCcw, Settings, Home, BookOpen, Brain, Target, Trophy, Clock, Trash2, Play } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AnkiStudyCard {
  id: string;
  userId: string;
  databaseId: string;
  wordKey: string;
  word: string;
  pos: string;
  lemma: string;
  translations: string[];
  state: 'new' | 'learning' | 'review' | 'relearning';
  easeFactor: number;
  interval: number;
  step: number;
  due: string;
  reviews: number;
  lapses: number;
  lastQuality: number;
  createdAt: string;
  updatedAt: string;
}

interface AnkiStudySettings {
  id: string;
  userId: string;
  databaseId: string;
  newCardsPerDay: number;
  reviewLimit: number;
  learningSteps: string;
  graduatingInterval: number;
  easyInterval: number;
  startingEase: number;
}

interface StudySession {
  total: number;
  cards: AnkiStudyCard[];
  breakdown: {
    new: number;
    learning: number;
    review: number;
  };
}

export default function AnkiStudyPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isInitializing, setIsInitializing] = useState(false);
  
  // Extract database ID from URL params
  const databaseId = location.split('/anki-study/')[1];
  
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [studyStats, setStudyStats] = useState({ reviewed: 0, total: 0 });
  const [settingsTab, setSettingsTab] = useState('daily');
  const [studyMode, setStudyMode] = useState(false);

  // Get study settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: [`/api/anki-study/settings/${databaseId}`],
    enabled: !!databaseId,
  });

  // Get today's study session
  const { data: session, isLoading: sessionLoading, refetch: refetchSession } = useQuery<StudySession>({
    queryKey: [`/api/anki-study/cards/${databaseId}/today`],
    enabled: !!databaseId,
  });

  // Review card mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ cardId, rating }: { cardId: string; rating: 1 | 2 | 3 | 4 }) => {
      const response = await apiRequest('POST', `/api/anki-study/cards/${cardId}/review`, { rating });
      return await response.json();
    },
    onSuccess: (data, variables) => {
      const { rating } = variables;
      const ratingNames = ['', 'Again', 'Hard', 'Good', 'Easy'];
      
      toast({
        title: `Reviewed: ${ratingNames[rating]}`,
        description: `Next review: ${data.nextReviewTime} (${data.intervalDays} days)`,
      });
      
      // Update study stats
      setStudyStats(prev => ({ ...prev, reviewed: prev.reviewed + 1 }));
      
      // Move to next card or complete session
      if (currentCardIndex < (session?.cards.length || 0) - 1) {
        setCurrentCardIndex(prev => prev + 1);
        setShowAnswer(false);
      } else {
        setSessionComplete(true);
      }
      
      // Invalidate and refetch session data for updated counts
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/cards/${databaseId}/today`] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Review Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<AnkiStudySettings>) => {
      if (!settings?.id) throw new Error('Settings not found');
      const response = await apiRequest('PUT', `/api/anki-study/settings/${settings.id}`, newSettings);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Settings Updated',
        description: 'Your study preferences have been saved.',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/settings/${databaseId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Settings Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete deck mutation
  const deleteDeckMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/anki-study/deck/${databaseId}`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Deck Deleted',
        description: `Removed ${data.deletedCards} cards from your Anki deck`,
      });
      
      // Reset state and refetch data
      setStudyMode(false);
      setSessionComplete(false);
      setCurrentCardIndex(0);
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/settings/${databaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/cards/${databaseId}/today`] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Initialize cards mutation
  const initializeCardsMutation = useMutation({
    mutationFn: async () => {
      if (!databaseId) throw new Error('No database selected');
      
      // Initialize all eligible words from database (first_inst=true, excluding known words)
      const initResponse = await apiRequest('POST', '/api/anki-study/cards/initialize', {
        databaseId
        // No wordKeys means it will use all eligible words
      });
      return await initResponse.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Anki Deck Created!',
        description: `${data.message}`,
      });
      // Refresh the session to show the new cards
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/settings/${databaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anki-study/cards/${databaseId}/today`] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Initialization Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Initialize study stats when session loads
  useEffect(() => {
    if (session) {
      setStudyStats({ reviewed: 0, total: session.total });
    }
  }, [session]);

  const currentCard = session?.cards[currentCardIndex];

  const handleReview = (rating: 1 | 2 | 3 | 4) => {
    if (!currentCard) return;
    reviewMutation.mutate({ cardId: currentCard.id, rating });
  };

  const resetSession = () => {
    setCurrentCardIndex(0);
    setShowAnswer(false);
    setSessionComplete(false);
    setStudyStats({ reviewed: 0, total: session?.total || 0 });
    refetchSession();
  };

  if (!databaseId) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No database selected. Please go back and select a database to study.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Link href="/" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800">
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (settingsLoading || sessionLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading study session...</div>
      </div>
    );
  }

  // Session complete state
  if (sessionComplete) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card className="text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">Session Complete!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold text-blue-600">{studyStats.reviewed}</div>
                <div className="text-sm text-gray-600">Cards Reviewed</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-purple-600">{Math.round((studyStats.reviewed / studyStats.total) * 100)}%</div>
                <div className="text-sm text-gray-600">Completion</div>
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <Button onClick={resetSession} className="w-full" size="lg">
                <RotateCcw className="w-4 h-4 mr-2" />
                Study More Cards
              </Button>
              <Link href="/" className="block">
                <Button variant="outline" className="w-full" size="lg">
                  <Home className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No cards to study
  if (!session || session.cards.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Create Your Anki Deck
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-gray-600">
              Create a personalized Anki deck from your database words with first-instance filtering.
            </p>
            
            {/* Study Settings Display */}
            {settings && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-800">Study Settings</h3>
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{settings.newCardsPerDay}</div>
                    <div className="text-sm text-gray-600">New Cards/Day</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{settings.reviewLimit}</div>
                    <div className="text-sm text-gray-600">Review Limit/Day</div>
                  </div>
                </div>
                
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800 mb-1">
                    <strong>Deck includes:</strong> First-instance words only, excluding known words
                  </p>
                  <p className="text-xs text-blue-600">
                    Cards appear in order of appearance in your original text (1, 2, 3, etc.)
                  </p>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              <Button 
                onClick={() => initializeCardsMutation.mutate()}
                disabled={initializeCardsMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-700"
                size="lg"
              >
                <Target className="w-4 h-4 mr-2" />
                {initializeCardsMutation.isPending ? 'Creating Anki Deck...' : 'Create Anki Deck from Database'}
              </Button>
              
              <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                <Home className="w-4 h-4 mr-2" />
                Go back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show deck status and study options when deck exists but not in study mode
  const hasDeck = session?.cards && session.cards.length > 0;
  
  if (hasDeck && !studyMode) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              Anki Deck Ready
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl font-bold text-green-600 mb-2">{session.cards.length}</div>
              <div className="text-sm text-green-800 font-medium">Cards Ready for Study</div>
              <div className="text-xs text-green-600 mt-1">
                Sorted by appearance order • First instances only • Known words excluded
              </div>
            </div>

            {/* Deck breakdown */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-semibold text-blue-600">{session.breakdown?.new || 0}</div>
                <div className="text-xs text-gray-600">New</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-orange-600">{session.breakdown?.learning || 0}</div>
                <div className="text-xs text-gray-600">Learning</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-green-600">{session.breakdown?.review || 0}</div>
                <div className="text-xs text-gray-600">Review</div>
              </div>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={() => setStudyMode(true)}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <Play className="w-4 h-4 mr-2" />
                Begin Study Session
              </Button>
              
              <Button 
                variant="destructive"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this Anki deck? All progress will be lost.')) {
                    deleteDeckMutation.mutate();
                  }
                }}
                disabled={deleteDeckMutation.isPending}
                className="w-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleteDeckMutation.isPending ? 'Deleting Deck...' : 'Delete Deck'}
              </Button>
              
              <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                <Home className="w-4 h-4 mr-2" />
                Go back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header with progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-blue-600" />
            Anki Study Session
          </h1>
          <Link href="/" className="text-blue-600 hover:text-blue-800">
            <Home className="w-5 h-5" />
          </Link>
        </div>
        
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Progress: {studyStats.reviewed} / {studyStats.total}</span>
            <span>{Math.round((studyStats.reviewed / studyStats.total) * 100)}%</span>
          </div>
          <Progress value={(studyStats.reviewed / studyStats.total) * 100} className="w-full" />
        </div>

        {/* Session breakdown */}
        <div className="flex gap-4 mt-4">
          <Badge variant="outline" className="flex items-center gap-1">
            <Target className="w-3 h-3" />
            New: {session.breakdown.new}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Learning: {session.breakdown.learning}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />
            Review: {session.breakdown.review}
          </Badge>
        </div>
      </div>

      <Tabs value="study" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="study">Study Cards</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="study" className="space-y-6">
          {/* Current Card */}
          {currentCard && (
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{currentCard.word}</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      {currentCard.pos} • {currentCard.lemma}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={currentCard.state === 'new' ? 'default' : 
                                   currentCard.state === 'learning' ? 'secondary' : 'outline'}>
                      {currentCard.state.toUpperCase()}
                    </Badge>
                    <p className="text-xs text-gray-500 mt-1">
                      Card {currentCardIndex + 1} of {session.cards.length}
                    </p>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {!showAnswer ? (
                  <div className="text-center py-8">
                    <div className="text-4xl font-bold mb-4 text-blue-600">
                      {currentCard.word}
                    </div>
                    <div className="text-gray-600 mb-6">
                      Part of Speech: <span className="font-medium">{currentCard.pos}</span>
                    </div>
                    <Button onClick={() => setShowAnswer(true)} size="lg" className="px-8">
                      Show Answer
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold mb-2 text-blue-600">
                        {currentCard.word}
                      </div>
                      <div className="text-xl text-gray-700 mb-4">
                        {currentCard.translations.join(', ')}
                      </div>
                      <div className="text-sm text-gray-500">
                        {currentCard.pos} • {currentCard.lemma}
                      </div>
                    </div>

                    <Separator />

                    {/* Review buttons */}
                    <div className="space-y-3">
                      <p className="text-center text-sm text-gray-600 font-medium">
                        How well did you know this word?
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="destructive"
                          onClick={() => handleReview(1)}
                          disabled={reviewMutation.isPending}
                          className="h-12"
                        >
                          <span className="font-bold">Again</span>
                          <span className="ml-2 text-xs opacity-75">&lt; 1min</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleReview(2)}
                          disabled={reviewMutation.isPending}
                          className="h-12 border-orange-300 text-orange-700 hover:bg-orange-50"
                        >
                          <span className="font-bold">Hard</span>
                          <span className="ml-2 text-xs opacity-75">6min</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleReview(3)}
                          disabled={reviewMutation.isPending}
                          className="h-12 border-green-300 text-green-700 hover:bg-green-50"
                        >
                          <span className="font-bold">Good</span>
                          <span className="ml-2 text-xs opacity-75">10min</span>
                        </Button>
                        <Button
                          onClick={() => handleReview(4)}
                          disabled={reviewMutation.isPending}
                          className="h-12 bg-blue-600 hover:bg-blue-700"
                        >
                          <span className="font-bold">Easy</span>
                          <span className="ml-2 text-xs opacity-75">4 days</span>
                        </Button>
                      </div>
                    </div>

                    {/* Card info */}
                    {currentCard.reviews > 0 && (
                      <div className="text-xs text-gray-500 text-center">
                        Reviews: {currentCard.reviews} • Ease: {Math.round(currentCard.easeFactor / 100)}% • 
                        Lapses: {currentCard.lapses}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Study Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {settings && (
                <Tabs value={settingsTab} onValueChange={setSettingsTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="daily">Daily Limits</TabsTrigger>
                    <TabsTrigger value="algorithm">Algorithm</TabsTrigger>
                  </TabsList>

                  <TabsContent value="daily" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="newCardsPerDay">New Cards Per Day</Label>
                        <Input
                          id="newCardsPerDay"
                          type="number"
                          defaultValue={settings.newCardsPerDay}
                          min="1"
                          max="100"
                          onBlur={(e) => {
                            const value = parseInt(e.target.value);
                            if (value !== settings.newCardsPerDay) {
                              updateSettingsMutation.mutate({ newCardsPerDay: value });
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor="reviewLimit">Review Limit</Label>
                        <Input
                          id="reviewLimit"
                          type="number"
                          defaultValue={settings.reviewLimit}
                          min="10"
                          max="500"
                          onBlur={(e) => {
                            const value = parseInt(e.target.value);
                            if (value !== settings.reviewLimit) {
                              updateSettingsMutation.mutate({ reviewLimit: value });
                            }
                          }}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="algorithm" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="graduatingInterval">Graduating Interval (days)</Label>
                        <Input
                          id="graduatingInterval"
                          type="number"
                          defaultValue={settings.graduatingInterval}
                          min="1"
                          max="10"
                          onBlur={(e) => {
                            const value = parseInt(e.target.value);
                            if (value !== settings.graduatingInterval) {
                              updateSettingsMutation.mutate({ graduatingInterval: value });
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor="easyInterval">Easy Interval (days)</Label>
                        <Input
                          id="easyInterval"
                          type="number"
                          defaultValue={settings.easyInterval}
                          min="2"
                          max="10"
                          onBlur={(e) => {
                            const value = parseInt(e.target.value);
                            if (value !== settings.easyInterval) {
                              updateSettingsMutation.mutate({ easyInterval: value });
                            }
                          }}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}