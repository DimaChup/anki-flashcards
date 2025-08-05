import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import WordSpan from "@/components/word-span";
import { usePOSAnalyzer } from "@/hooks/use-pos-analyzer";
import { type LinguisticDatabase, type WordEntry, type POSConfig } from "@shared/schema";
import { FileText, ChevronLeft, ChevronRight, Settings } from "lucide-react";

interface PageViewSectionProps {
  database: LinguisticDatabase | undefined;
}

export default function PageViewSection({ database }: PageViewSectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [wordsPerPage, setWordsPerPage] = useState(50);
  const [jumpToPage, setJumpToPage] = useState("");
  const [highlightingEnabled, setHighlightingEnabled] = useState(true);
  const [showKnownWords, setShowKnownWords] = useState(false);
  const [posConfig, setPosConfig] = useState<POSConfig>({
    verb: true,
    noun: true,
    adj: true,
    aux: false,
    other: false,
  });

  const { getPosGroup, shouldHighlight } = usePOSAnalyzer();

  const { data: wordsData, isLoading } = useQuery({
    queryKey: ["/api/databases", database?.id, "words", currentPage, wordsPerPage],
    enabled: !!database?.id,
    queryFn: async () => {
      const response = await fetch(
        `/api/databases/${database?.id}/words?page=${currentPage}&pageSize=${wordsPerPage}`
      );
      if (!response.ok) throw new Error('Failed to fetch words');
      return response.json();
    },
  });

  // Reset page when database changes
  useEffect(() => {
    setCurrentPage(1);
    setJumpToPage("");
  }, [database?.id]);

  const handlePosToggle = (posType: keyof POSConfig) => {
    setPosConfig(prev => ({
      ...prev,
      [posType]: !prev[posType]
    }));
  };

  const handlePageChange = (direction: number) => {
    const newPage = currentPage + direction;
    if (newPage >= 1 && newPage <= (wordsData?.totalPages || 1)) {
      setCurrentPage(newPage);
    }
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage);
    if (pageNum >= 1 && pageNum <= (wordsData?.totalPages || 1)) {
      setCurrentPage(pageNum);
      setJumpToPage("");
    }
  };

  const handleWordsPerPageChange = (value: string) => {
    const newValue = parseInt(value);
    if (newValue >= 10 && newValue <= 200) {
      setWordsPerPage(newValue);
      setCurrentPage(1);
    }
  };

  const knownWordsSet = new Set((database?.knownWords as string[]) || []);
  
  const getWordClasses = (word: WordEntry) => {
    const classes = ["word-span"];
    
    if (highlightingEnabled && shouldHighlight(word.pos, posConfig)) {
      const posGroup = getPosGroup(word.pos);
      classes.push(`highlight-${posGroup}`);
    }
    
    if (showKnownWords && knownWordsSet.has(word.word.toLowerCase())) {
      classes.push("known-word");
    }
    
    return classes.join(" ");
  };

  if (!database) {
    return (
      <section 
        className="p-6 rounded-xl"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        <h2 className="flex items-center gap-3 text-xl font-bold mb-4">
          <FileText className="w-5 h-5" />
          Text Analysis View
        </h2>
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a database to view text analysis</p>
        </div>
      </section>
    );
  }

  return (
    <section 
      className="p-6 rounded-xl flex flex-col gap-5"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      <h2 className="flex items-center gap-3 text-xl font-bold">
        <FileText className="w-5 h-5" />
        Text Analysis View
      </h2>

      {/* Controls */}
      <div 
        className="p-4 rounded-xl flex flex-wrap gap-0 items-stretch justify-between"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex flex-wrap gap-4 items-center px-4">
          <Toggle
            pressed={highlightingEnabled}
            onPressedChange={setHighlightingEnabled}
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            data-testid="enable-highlighting-toggle"
          >
            Enable POS Highlighting
          </Toggle>
          
          <Toggle
            pressed={showKnownWords}
            onPressedChange={setShowKnownWords}
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            data-testid="fade-known-words-toggle"
          >
            Fade Known Words
          </Toggle>
        </div>

        <div className="control-separator" />

        <div className="flex flex-col gap-2 px-4 items-start justify-center">
          <div className="flex gap-4 items-center">
            <Toggle
              pressed={posConfig.verb}
              onPressedChange={() => handlePosToggle('verb')}
              size="sm"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              data-testid="highlight-verb-toggle"
            >
              VERB
            </Toggle>
            <Toggle
              pressed={posConfig.noun}
              onPressedChange={() => handlePosToggle('noun')}
              size="sm"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              data-testid="highlight-noun-toggle"
            >
              NOUN
            </Toggle>
            <Toggle
              pressed={posConfig.adj}
              onPressedChange={() => handlePosToggle('adj')}
              size="sm"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              data-testid="highlight-adj-toggle"
            >
              ADJ
            </Toggle>
          </div>
          <div className="flex gap-4 items-center">
            <Toggle
              pressed={posConfig.aux}
              onPressedChange={() => handlePosToggle('aux')}
              size="sm"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              data-testid="highlight-aux-toggle"
            >
              AUX
            </Toggle>
            <Toggle
              pressed={posConfig.other}
              onPressedChange={() => handlePosToggle('other')}
              size="sm"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              data-testid="highlight-other-toggle"
            >
              OTHER
            </Toggle>
          </div>
        </div>

        <div className="control-separator" />

        <div className="flex items-center gap-3 px-4">
          <Label htmlFor="words-per-page" className="text-sm whitespace-nowrap">
            Words per page:
          </Label>
          <Input
            id="words-per-page"
            type="number"
            value={wordsPerPage}
            onChange={(e) => handleWordsPerPageChange(e.target.value)}
            min={10}
            max={200}
            className="w-16 text-center bg-input"
            data-testid="words-per-page-input"
          />
        </div>
      </div>

      {/* Text Display Area */}
      <div 
        className={`min-h-[300px] p-5 rounded-lg border font-mono text-lg leading-relaxed ${isLoading ? 'loading' : ''}`}
        style={{ 
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)'
        }}
        data-testid="text-display-area"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading words...</div>
          </div>
        ) : wordsData?.words?.length ? (
          <div className="space-y-1">
            {wordsData.words.map((word: WordEntry, index: number) => (
              <WordSpan
                key={`${word.id}-${index}`}
                word={word}
                className={getWordClasses(word)}
                data-testid={`word-span-${index}`}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No words found for this page.
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handlePageChange(-1)}
            disabled={currentPage <= 1 || isLoading}
            data-testid="prev-page-button"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => handlePageChange(1)}
            disabled={currentPage >= (wordsData?.totalPages || 1) || isLoading}
            data-testid="next-page-button"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="text-sm text-muted-foreground" data-testid="page-info">
          {wordsData && (
            <>
              Page <strong>{currentPage}</strong> of <strong>{wordsData.totalPages}</strong> 
              {" "}(Words {((currentPage - 1) * wordsPerPage) + 1}-{Math.min(currentPage * wordsPerPage, wordsData.totalWords)} of {wordsData.totalWords})
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="jump-to-page" className="text-sm whitespace-nowrap">
            Jump to page:
          </Label>
          <Input
            id="jump-to-page"
            type="number"
            value={jumpToPage}
            onChange={(e) => setJumpToPage(e.target.value)}
            min={1}
            max={wordsData?.totalPages || 1}
            className="w-16 text-center"
            data-testid="jump-to-page-input"
          />
          <Button
            variant="outline"
            onClick={handleJumpToPage}
            disabled={!jumpToPage || isLoading}
            data-testid="jump-page-button"
          >
            Go
          </Button>
        </div>
      </div>
    </section>
  );
}
