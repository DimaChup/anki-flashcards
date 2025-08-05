import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePOSAnalyzer } from "@/hooks/use-pos-analyzer";
import { type LinguisticDatabase, type WordEntry } from "@shared/schema";
import { 
  List, 
  Download, 
  Plus, 
  Trash, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle,
  Minus,
  Save,
  Bookmark
} from "lucide-react";

interface ListViewSectionProps {
  database: LinguisticDatabase | undefined;
}

export default function ListViewSection({ database }: ListViewSectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [wordsPerPage, setWordsPerPage] = useState(25);
  const [jumpToPage, setJumpToPage] = useState("");
  const [firstInstancesOnly, setFirstInstancesOnly] = useState(true);
  const [knownWordsText, setKnownWordsText] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getPosGroup, getPosIndicatorClass } = usePOSAnalyzer();

  const { data: uniqueWords, isLoading } = useQuery({
    queryKey: ["/api/databases", database?.id, "unique-words", firstInstancesOnly],
    enabled: !!database?.id,
    queryFn: async () => {
      const response = await fetch(
        `/api/databases/${database?.id}/unique-words?firstInstancesOnly=${firstInstancesOnly}`
      );
      if (!response.ok) throw new Error('Failed to fetch unique words');
      return response.json();
    },
  });

  // Update known words text when database changes
  useEffect(() => {
    if (database?.knownWords) {
      setKnownWordsText((database.knownWords as string[]).join('\n'));
    } else {
      setKnownWordsText('');
    }
    setCurrentPage(1);
    setJumpToPage("");
  }, [database?.id]);

  const updateKnownWordsMutation = useMutation({
    mutationFn: async (knownWords: string[]) => {
      const response = await apiRequest('PUT', `/api/databases/${database?.id}/known-words`, {
        knownWords,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/databases', database?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/databases'] });
      toast({
        title: "Success",
        description: "Known words updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async ({ format, includeKnownWords }: { format: 'csv' | 'json', includeKnownWords: boolean }) => {
      const response = await apiRequest('POST', `/api/databases/${database?.id}/export`, {
        format,
        includeKnownWords,
        firstInstancesOnly,
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${database?.name}-export.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Data exported successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUpdateKnownWords = () => {
    const knownWords = knownWordsText
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0);
    
    updateKnownWordsMutation.mutate(knownWords);
  };

  const handleAddAllToKnown = () => {
    if (!uniqueWords) return;
    
    const currentKnownWords = knownWordsText
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0);
    
    const newWords = uniqueWords
      .map((word: WordEntry) => word.word.toLowerCase())
      .filter((word: string) => !currentKnownWords.includes(word));
    
    const allKnownWords = [...currentKnownWords, ...newWords];
    setKnownWordsText(allKnownWords.join('\n'));
  };

  const handleClearKnownWords = () => {
    setKnownWordsText('');
  };

  const handleAddWordToKnown = (word: string) => {
    const currentWords = knownWordsText
      .split('\n')
      .map(w => w.trim())
      .filter(w => w.length > 0);
    
    if (!currentWords.includes(word.toLowerCase())) {
      setKnownWordsText([...currentWords, word.toLowerCase()].join('\n'));
    }
  };

  const handleRemoveWordFromKnown = (word: string) => {
    const currentWords = knownWordsText
      .split('\n')
      .map(w => w.trim())
      .filter(w => w.length > 0 && w !== word.toLowerCase());
    
    setKnownWordsText(currentWords.join('\n'));
  };

  const handlePageChange = (direction: number) => {
    const totalPages = Math.ceil((uniqueWords?.length || 0) / wordsPerPage);
    const newPage = currentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleJumpToPage = () => {
    const totalPages = Math.ceil((uniqueWords?.length || 0) / wordsPerPage);
    const pageNum = parseInt(jumpToPage);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setJumpToPage("");
    }
  };

  const handleWordsPerPageChange = (value: string) => {
    const newValue = parseInt(value);
    if (newValue >= 10 && newValue <= 100) {
      setWordsPerPage(newValue);
      setCurrentPage(1);
    }
  };

  if (!database) {
    return (
      <section 
        className="p-6 rounded-xl"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        <h2 className="flex items-center gap-3 text-xl font-bold mb-4">
          <List className="w-5 h-5" />
          Word Analysis List
        </h2>
        <div className="text-center py-12 text-muted-foreground">
          <List className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a database to view word analysis</p>
        </div>
      </section>
    );
  }

  const knownWordsSet = new Set((database.knownWords as string[]) || []);
  const totalPages = Math.ceil((uniqueWords?.length || 0) / wordsPerPage);
  const startIndex = (currentPage - 1) * wordsPerPage;
  const endIndex = startIndex + wordsPerPage;
  const currentWords = uniqueWords?.slice(startIndex, endIndex) || [];

  return (
    <section 
      className="p-6 rounded-xl flex flex-col gap-5"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      <h2 className="flex items-center gap-3 text-xl font-bold">
        <List className="w-5 h-5" />
        Word Analysis List
      </h2>

      {/* List Controls */}
      <div 
        className="p-4 rounded-xl flex flex-wrap gap-0 items-stretch justify-between"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex flex-wrap gap-4 items-center px-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="list-words-per-page" className="text-sm whitespace-nowrap">
              Words per page:
            </Label>
            <Input
              id="list-words-per-page"
              type="number"
              value={wordsPerPage}
              onChange={(e) => handleWordsPerPageChange(e.target.value)}
              min={10}
              max={100}
              className="w-16 text-center bg-input"
              data-testid="list-words-per-page-input"
            />
          </div>
          
          <Toggle
            pressed={firstInstancesOnly}
            onPressedChange={setFirstInstancesOnly}
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            data-testid="first-instances-toggle"
          >
            First Instances Only
          </Toggle>
        </div>

        <div className="control-separator" />

        <div className="flex flex-wrap gap-2 items-center px-4">
          <Button
            onClick={() => exportMutation.mutate({ format: 'csv', includeKnownWords: false })}
            disabled={exportMutation.isPending}
            className="btn-download flex items-center gap-2"
            data-testid="download-csv-button"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </Button>
          <Button
            onClick={handleAddAllToKnown}
            disabled={!uniqueWords?.length}
            className="btn-add flex items-center gap-2"
            data-testid="add-all-known-button"
          >
            <Plus className="w-4 h-4" />
            Add All to Known
          </Button>
          <Button
            onClick={handleClearKnownWords}
            className="btn-clear flex items-center gap-2"
            data-testid="clear-known-button"
          >
            <Trash className="w-4 h-4" />
            Clear Known Words
          </Button>
        </div>
      </div>

      {/* Word List Table */}
      <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
        <Table>
          <TableHeader>
            <TableRow style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <TableHead>Word</TableHead>
              <TableHead>POS</TableHead>
              <TableHead>Translation</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>First Instance</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading words...
                </TableCell>
              </TableRow>
            ) : currentWords.length > 0 ? (
              currentWords.map((word: WordEntry, index: number) => {
                const isKnown = knownWordsSet.has(word.word.toLowerCase());
                return (
                  <TableRow
                    key={`${word.id}-${index}`}
                    className={isKnown ? "known-word-row" : ""}
                    data-testid={`word-row-${index}`}
                  >
                    <TableCell className="font-semibold">{word.word}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <span className={`pos-indicator ${getPosIndicatorClass(word.pos)}`} />
                        {word.pos}
                      </div>
                    </TableCell>
                    <TableCell>{word.translation}</TableCell>
                    <TableCell>{word.frequency}</TableCell>
                    <TableCell>
                      {word.firstInstance && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </TableCell>
                    <TableCell>
                      {isKnown ? (
                        <Button
                          size="sm"
                          onClick={() => handleRemoveWordFromKnown(word.word)}
                          className="btn-clear flex items-center gap-1"
                          data-testid={`remove-word-${index}`}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleAddWordToKnown(word.word)}
                          className="btn-add flex items-center gap-1"
                          data-testid={`add-word-${index}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No words found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* List Pagination */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handlePageChange(-1)}
            disabled={currentPage <= 1 || isLoading}
            data-testid="list-prev-page-button"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => handlePageChange(1)}
            disabled={currentPage >= totalPages || isLoading}
            data-testid="list-next-page-button"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="text-sm text-muted-foreground" data-testid="list-page-info">
          {uniqueWords && (
            <>
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> 
              {" "}(Words {startIndex + 1}-{Math.min(endIndex, uniqueWords.length)} of {uniqueWords.length})
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="list-jump-to-page" className="text-sm whitespace-nowrap">
            Jump to page:
          </Label>
          <Input
            id="list-jump-to-page"
            type="number"
            value={jumpToPage}
            onChange={(e) => setJumpToPage(e.target.value)}
            min={1}
            max={totalPages}
            className="w-16 text-center"
            data-testid="list-jump-to-page-input"
          />
          <Button
            variant="outline"
            onClick={handleJumpToPage}
            disabled={!jumpToPage || isLoading}
            data-testid="list-jump-page-button"
          >
            Go
          </Button>
        </div>
      </div>

      {/* Known Words Management */}
      <div className="flex flex-col gap-4">
        <Label htmlFor="known-words-textarea" className="flex items-center gap-2 text-sm font-semibold">
          <Bookmark className="w-4 h-4" />
          Known Words (one per line):
        </Label>
        <Textarea
          id="known-words-textarea"
          value={knownWordsText}
          onChange={(e) => setKnownWordsText(e.target.value)}
          placeholder="Add known words here, one per line..."
          className="min-h-24 font-mono text-sm bg-input"
          data-testid="known-words-textarea"
        />
        
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleUpdateKnownWords}
            disabled={updateKnownWordsMutation.isPending}
            className="flex items-center gap-2"
            data-testid="update-known-words-button"
          >
            <Save className="w-4 h-4" />
            {updateKnownWordsMutation.isPending ? "Updating..." : "Update Known Words"}
          </Button>
          <Button
            onClick={() => exportMutation.mutate({ format: 'json', includeKnownWords: true })}
            disabled={exportMutation.isPending}
            className="btn-download flex items-center gap-2"
            data-testid="export-known-words-button"
          >
            <Download className="w-4 h-4" />
            Export Known Words
          </Button>
          <Button
            onClick={handleClearKnownWords}
            className="btn-clear flex items-center gap-2"
            data-testid="clear-all-known-button"
          >
            <Trash className="w-4 h-4" />
            Clear All
          </Button>
        </div>
      </div>
    </section>
  );
}
