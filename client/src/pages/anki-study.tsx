import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Brain, Home } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface StudyCard {
  id: string;
  word: string;
  translation: string;
  pos: string;
  lemma?: string;
  sentence?: string;
}

export default function AnkiStudy() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [enablePosColors, setEnablePosColors] = useState(true);
  const [excludeKnownWords, setExcludeKnownWords] = useState(true);

  // POS color mapping
  const posColors: Record<string, string> = {
    'VERB': 'text-pink-400',
    'NOUN': 'text-blue-400',
    'ADJ': 'text-green-400',
    'AUX': 'text-orange-400',
    'PROPN': 'text-purple-400',
    'PRON': 'text-cyan-400',
    'ADV': 'text-yellow-400',
    'ADP': 'text-gray-400',
    'SCONJ': 'text-red-400',
    'NUM': 'text-indigo-400',
  };

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
    queryKey: ['/api/anki/study-cards', selectedDatabase, excludeKnownWords],
    queryFn: () => 
      fetch(`/api/anki/study-cards/${selectedDatabase}?excludeKnownWords=${excludeKnownWords}`)
        .then(res => res.json()),
    enabled: !!selectedDatabase,
  });

  const studyCards: StudyCard[] = studyData?.cards || [];
  const currentCard = studyCards[currentCardIndex];

  const startSession = () => {
    if (studyCards.length > 0) {
      setSessionStarted(true);
      setCurrentCardIndex(0);
      setShowAnswer(false);
    } else {
      toast({
        title: "No cards available",
        description: "No study cards found for this database.",
        variant: "destructive",
      });
    }
  };

  const nextCard = () => {
    if (currentCardIndex < studyCards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setShowAnswer(false);
    } else {
      // Session complete
      setSessionStarted(false);
      setCurrentCardIndex(0);
      toast({
        title: "Session Complete!",
        description: `You've studied ${studyCards.length} cards. Great job!`,
      });
    }
  };

  const endSession = () => {
    setSessionStarted(false);
    setCurrentCardIndex(0);
    setShowAnswer(false);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Brain className="h-8 w-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">Anki Study System</h1>
          </div>
          <Button
            onClick={() => setLocation('/')}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
            data-testid="back-home-btn"
          >
            <Home className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>

        {!sessionStarted ? (
          /* Session Setup */
          <div className="max-w-2xl mx-auto">
            <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl">
              <CardHeader>
                <h2 className="text-2xl font-bold text-white text-center">Session Setup</h2>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Database Selection */}
                <div className="space-y-2">
                  <label className="text-slate-300 font-medium">Select Database:</label>
                  <Select value={selectedDatabase} onValueChange={setSelectedDatabase}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue placeholder="Choose a database to study" />
                    </SelectTrigger>
                    <SelectContent>
                      {databases.map((db: any) => (
                        <SelectItem key={db.id} value={db.id}>
                          {db.name} ({db.analysisData?.length || 0} words)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* POS Colors Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Enable POS Color Assistance</label>
                    <p className="text-sm text-slate-400">Color-code words by their part of speech</p>
                  </div>
                  <Switch
                    checked={enablePosColors}
                    onCheckedChange={setEnablePosColors}
                    data-testid="pos-colors-toggle"
                  />
                </div>

                {/* Exclude Known Words Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Exclude Known Words</label>
                    <p className="text-sm text-slate-400">Skip words you've already marked as known</p>
                  </div>
                  <Switch
                    checked={excludeKnownWords}
                    onCheckedChange={setExcludeKnownWords}
                    data-testid="exclude-known-toggle"
                  />
                </div>

                {/* Study Info */}
                {selectedDatabase && studyData && (
                  <div className="p-4 bg-slate-700/50 rounded-lg">
                    <h3 className="text-white font-medium mb-2">Ready to Study:</h3>
                    <div className="text-slate-300 space-y-1">
                      <div>Database: <span className="text-white">{studyData.databaseName}</span></div>
                      <div>Available Cards: <span className="text-white">{studyData.totalCards}</span></div>
                      {studyData.knownWordsCount > 0 && (
                        <div>Known Words: <span className="text-white">{studyData.knownWordsCount}</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Start Button */}
                <Button
                  onClick={startSession}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 text-lg"
                  disabled={cardsLoading || !selectedDatabase || studyCards.length === 0}
                  data-testid="start-session-btn"
                >
                  {cardsLoading ? 'Loading...' : 'Start Study Session'}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Study Session */
          <div className="max-w-3xl mx-auto">
            {currentCard ? (
              <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl min-h-[500px]">
                <CardHeader className="text-center border-b border-slate-700 pb-6">
                  <div className="flex justify-between items-center mb-4">
                    <Badge variant="outline" className="border-slate-600 text-slate-300">
                      {currentCardIndex + 1} / {studyCards.length}
                    </Badge>
                    <Button
                      onClick={endSession}
                      variant="ghost"
                      className="text-slate-400 hover:text-white hover:bg-slate-700"
                      size="sm"
                    >
                      End Session
                    </Button>
                  </div>
                  
                  {/* Question - Word with POS coloring */}
                  <div className="space-y-4">
                    <div className="text-5xl font-bold mb-4">
                      <span className={enablePosColors ? (posColors[currentCard.pos] || 'text-white') : 'text-white'}>
                        {currentCard.word}
                      </span>
                    </div>
                    
                    {currentCard.pos && (
                      <Badge className="bg-slate-600 text-slate-200 text-sm">
                        {currentCard.pos}
                      </Badge>
                    )}
                    
                    {currentCard.sentence && (
                      <p className="text-slate-300 italic text-lg leading-relaxed max-w-2xl mx-auto">
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
                        <div className="text-3xl font-semibold text-green-400">
                          {currentCard.translation}
                        </div>
                        
                        {currentCard.lemma && currentCard.lemma !== currentCard.word && (
                          <div className="text-slate-400">
                            <span className="text-sm">Lemma: </span>
                            <span className="font-medium">{currentCard.lemma}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-4">
                    {!showAnswer ? (
                      <Button
                        onClick={() => setShowAnswer(true)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 text-lg"
                        data-testid="show-answer-btn"
                      >
                        Show Answer
                      </Button>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          onClick={nextCard}
                          className="bg-red-600 hover:bg-red-700 text-white font-bold py-4"
                          data-testid="again-btn"
                        >
                          Again
                        </Button>
                        <Button
                          onClick={nextCard}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold py-4"
                          data-testid="good-btn"
                        >
                          Good
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-slate-800/80 border-slate-700 backdrop-blur-sm shadow-2xl">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="text-6xl mb-4">🎉</div>
                  <h3 className="text-2xl font-bold text-white mb-2">No Cards Available</h3>
                  <p className="text-slate-300 mb-6 text-center">
                    All first instance words are already in your known words list.
                  </p>
                  <Button
                    onClick={endSession}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Back to Setup
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}