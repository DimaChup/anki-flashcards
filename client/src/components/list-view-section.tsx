import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePOSAnalyzer } from "@/hooks/use-pos-analyzer";
import { type LinguisticDatabase, type WordEntry } from "@shared/schema";
import { 
  List, 
  Download, 
  Plus, 
  Trash, 
  CheckCircle,
  Minus,
  Save,
  Bookmark
} from "lucide-react";

interface ListViewSectionProps {
  database: LinguisticDatabase | undefined;
}

export default function ListViewSection({ database }: ListViewSectionProps) {
  // State matching original
  const [batchSize, setBatchSize] = useState(25);
  const [firstInstancesOnly, setFirstInstancesOnly] = useState(true);
  const [newWordsOnly, setNewWordsOnly] = useState(true);
  const [batchByUnknown, setBatchByUnknown] = useState(true);
  const [ankiFormat, setAnkiFormat] = useState(true);
  const [downloadBatchFrom, setDownloadBatchFrom] = useState(1);
  const [downloadBatchTo, setDownloadBatchTo] = useState(1);
  const [knownWordsText, setKnownWordsText] = useState("");
  const [isGridView, setIsGridView] = useState(false);

  // Get current known words for filtering
  const getCurrentKnownWords = () => {
    return (database?.knownWords as string[]) || [];
  };
  
  // POS column filters (matching original checkbox values)
  const [selectedPosColumns, setSelectedPosColumns] = useState<Set<string>>(
    new Set(['pink', 'blue', 'green', 'orange', 'yellow'])
  );
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getPosGroup, getPosIndicatorClass } = usePOSAnalyzer();

  // Fetch unique words
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
  }, [database?.id, database?.knownWords]);

  // Update known words mutation
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
        description: "Known words updated successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update known words",
        variant: "destructive"
      });
    }
  });

  // Save known words
  const handleSaveKnownWords = () => {
    const words = knownWordsText
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0);
    updateKnownWordsMutation.mutate(words);
  };

  // Get filtered words based on settings
  const getFilteredWords = () => {
    if (!uniqueWords) return [];
    
    let filtered = [...uniqueWords];
    const knownWordsSet = new Set(getCurrentKnownWords());

    if (newWordsOnly) {
      filtered = filtered.filter(word => 
        !knownWordsSet.has(`${word.word}::${word.pos}`) && 
        !knownWordsSet.has(word.word.toLowerCase())
      );
    }

    return filtered;
  };

  // Create batches based on settings
  const createBatches = (words: WordEntry[]) => {
    const batches: WordEntry[][] = [];
    
    if (batchByUnknown) {
      // Batch by unknown words count (similar to original logic)
      let currentBatch: WordEntry[] = [];
      let unknownCount = 0;
      
      for (const word of words) {
        const isUnknown = newWordsOnly; // If we're showing only new words, they're all unknown
        currentBatch.push(word);
        
        if (isUnknown) {
          unknownCount++;
        }
        
        if (unknownCount >= batchSize) {
          batches.push([...currentBatch]);
          currentBatch = [];
          unknownCount = 0;
        }
      }
      
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
    } else {
      // Simple batching by count
      for (let i = 0; i < words.length; i += batchSize) {
        batches.push(words.slice(i, i + batchSize));
      }
    }
    
    return batches;
  };

  // Filter by POS columns
  const filterByPosColumns = (words: WordEntry[]) => {
    if (selectedPosColumns.size === 0) return words;
    
    return words.filter(word => {
      const posGroup = getPosGroup(word.pos);
      const posKey = getPosColumnKey(posGroup);
      return selectedPosColumns.has(posKey);
    });
  };

  // Map POS groups to column keys (matching original)
  const getPosColumnKey = (posGroup: string) => {
    switch (posGroup) {
      case 'verb': return 'pink';
      case 'noun': return 'blue';
      case 'adjective': return 'green';
      case 'auxiliary': return 'orange';
      default: return 'yellow';
    }
  };

  // Toggle POS column selection
  const togglePosColumn = (columnKey: string) => {
    setSelectedPosColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey);
      } else {
        newSet.add(columnKey);
      }
      return newSet;
    });
  };

  // Download functionality
  const handleDownload = () => {
    const filteredWords = getFilteredWords();
    const posFilteredWords = filterByPosColumns(filteredWords);
    const batches = createBatches(posFilteredWords);
    
    const selectedBatches = batches.slice(downloadBatchFrom - 1, downloadBatchTo);
    const flatWords = selectedBatches.flat();
    
    let content = '';
    let filename = '';
    
    if (ankiFormat) {
      // Anki format with key
      content = flatWords.map((word, index) => 
        `${word.word}::${word.pos}\t${word.translation || ''}\t${index + 1}`
      ).join('\n');
      filename = `anki_unknown_batch_${downloadBatchFrom}-${downloadBatchTo}.txt`;
    } else {
      // Simple signatures format
      content = flatWords.map(word => `${word.word}::${word.pos}`).join('\n');
      filename = `unknown_signatures_batch_${downloadBatchFrom}-${downloadBatchTo}_ordered.txt`;
    }
    
    // Create and download file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download Complete",
      description: `Downloaded ${flatWords.length} words from batches ${downloadBatchFrom}-${downloadBatchTo}`
    });
  };

  // Handle word click (toggle known status)
  const handleWordClick = (word: WordEntry) => {
    const signature = `${word.word}::${word.pos}`;
    const currentKnownWords = (database?.knownWords as string[]) || [];
    
    if (currentKnownWords.includes(signature)) {
      // Remove from known words
      const updatedKnownWords = currentKnownWords.filter((kw: string) => kw !== signature);
      updateKnownWordsMutation.mutate(updatedKnownWords);
    } else {
      // Add to known words
      const updatedKnownWords = [...currentKnownWords, signature];
      updateKnownWordsMutation.mutate(updatedKnownWords);
    }
  };

  // Handle right-click (show word details)
  const handleWordRightClick = (e: React.MouseEvent, word: WordEntry) => {
    e.preventDefault();
    
    const contextDetails = [];
    if (word.contextualInfo?.gender) contextDetails.push(`Gender: ${word.contextualInfo.gender}`);
    if (word.contextualInfo?.number) contextDetails.push(`Number: ${word.contextualInfo.number}`);
    if (word.contextualInfo?.tense) contextDetails.push(`Tense: ${word.contextualInfo.tense}`);
    if (word.contextualInfo?.mood) contextDetails.push(`Mood: ${word.contextualInfo.mood}`);
    if (word.contextualInfo?.person) contextDetails.push(`Person: ${word.contextualInfo.person}`);
    
    const tooltipContent = `
Word: ${word.word}
POS: ${word.pos}
Translation: ${word.translation || 'N/A'}
Frequency: ${word.frequency || 1}
Position: ${word.position || 'N/A'}
First Instance: ${word.firstInstance ? 'Yes' : 'No'}
${contextDetails.length > 0 ? `Grammar: ${contextDetails.join(', ')}` : ''}

Left-click to toggle known status`;
    
    toast({
      title: `${word.word} (${word.pos})`,
      description: tooltipContent.trim(),
      duration: 3000,
    });
  };

  // Render word span with highlighting and click functionality
  const renderWordSpan = (word: WordEntry, showKey: boolean = false) => {
    const posGroup = getPosGroup(word.pos);
    const posKey = getPosColumnKey(posGroup);
    const signature = `${word.word}::${word.pos}`;
    const knownWordsSet = new Set(getCurrentKnownWords());
    const isKnown = knownWordsSet.has(signature) || 
                   knownWordsSet.has(word.word.toLowerCase());
    
    return (
      <span
        key={`${word.word}-${word.pos}`}
        className={`word-span pos-${posKey} ${isKnown ? 'known-word' : ''} cursor-pointer hover:scale-105 transition-transform`}
        data-word={word.word}
        data-pos={word.pos}
        data-signature={signature}
        data-first-instance={word.firstInstance ? 'true' : 'false'}
        onClick={() => handleWordClick(word)}
        onContextMenu={(e) => handleWordRightClick(e, word)}
        title={`${word.word} (${word.pos}) - Click to toggle known status, right-click for details`}
        style={{
          opacity: isKnown ? 'var(--known-word-opacity)' : 1
        }}
      >
        {word.word}
        {showKey && word.position && (
          <span className="word-key">({word.position})</span>
        )}
      </span>
    );
  };

  // Render list view - exact copy from original HTML (shows batches in rows)
  const renderListView = () => {
    const filteredWords = getFilteredWords();
    const posFilteredWords = filterByPosColumns(filteredWords);
    const batches = createBatches(posFilteredWords);
    
    if (batches.length === 0) {
      return <div className="no-items">No words found matching current filters</div>;
    }
    
    return (
      <>
        {batches.map((batch, batchIndex) => {
          const maxKey = Math.max(...batch.map(w => w.position || 0));
          const maxKeyDisplay = maxKey > 0 ? (
            <div className="batch-max-key">( {maxKey} )</div>
          ) : null;
          
          return (
            <div key={batchIndex} className="grid-batch-row" data-batch-number={batchIndex + 1}>
              <div className="grid-cell row-number-cell">
                {batchIndex + 1}
                {maxKeyDisplay}
              </div>
              <div className="grid-cell list-view-words-cell">
                {batch.map((word, wordIndex) => (
                  <span key={`${word.word}-${word.pos}-${wordIndex}`}>
                    {renderWordSpan(word, true)}{' '}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  };



  // Render POS-based grid view (organized by POS columns)
  const renderPOSGridBatches = () => {
    const filteredWords = getFilteredWords();
    const posFilteredWords = filterByPosColumns(filteredWords);
    const batches = createBatches(posFilteredWords);
    
    if (batches.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-8">
          No words found matching current filters
        </div>
      );
    }
    
    // Define the 5 POS columns exactly like original list-view.html
    const posColumns = [
      { key: "pink", tags: ["VERB"], label: "V" },
      { key: "blue", tags: ["NOUN", "PROPN"], label: "N" },
      { key: "green", tags: ["ADJ"], label: "Adj" },
      { key: "orange", tags: ["AUX"], label: "Aux" },
      { key: "yellow", tags: ["ADV", "ADP", "DET", "CONJ", "PRON", "SCONJ", "CCONJ", "NUM", "PART", "INTJ", "SYM", "X"], label: "Oth" }
    ];
    
    return (
      <div className="first-instance-grid">
        {/* Header row showing column labels */}
        <div className="grid-batch-row grid-header-row">
          <div className="grid-cell row-number-cell">
            <div>#</div>
          </div>
          {posColumns.filter(col => selectedPosColumns.has(col.key)).map(column => (
            <div key={column.key} className="grid-cell grid-header-cell">
              {column.label}
            </div>
          ))}
        </div>
        
        {/* Data rows */}
        {batches.map((batch, batchIndex) => {
          const maxKey = Math.max(...batch.map(w => w.position || 0));
          
          return (
            <div key={batchIndex} className="grid-batch-row" data-batch-number={batchIndex + 1}>
              <div className="grid-cell row-number-cell">
                <div>{batchIndex + 1}</div>
                {maxKey > 0 && (
                  <div className="batch-max-key">{maxKey}</div>
                )}
              </div>
              
              {/* Create exactly one column for each selected POS category */}
              {posColumns.filter(col => selectedPosColumns.has(col.key)).map(column => {
                const columnWords = batch.filter(word => {
                  if (column.key === "yellow") {
                    // "Other" category - words that don't match the first 4 categories
                    return column.tags.includes(word.pos);
                  }
                  return column.tags.includes(word.pos);
                });
                
                return (
                  <div key={column.key} className="grid-cell">
                    {columnWords.length > 0 ? (
                      columnWords.map((word, wordIndex) => (
                        <span key={`${word.word}-${word.pos}-${wordIndex}`}>
                          {renderWordSpan(word, true)}
                          {wordIndex < columnWords.length - 1 && ' '}
                        </span>
                      ))
                    ) : (
                      <span className="no-items">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // Render content based on view mode
  const renderBatches = () => {
    if (isGridView) {
      return renderPOSGridBatches(); // Grid view shows POS-organized columns
    } else {
      return renderListView(); // List view shows separate batches (original behavior)
    }
  };

  // Update batch range when total batches change
  useEffect(() => {
    const filteredWords = getFilteredWords();
    const posFilteredWords = filterByPosColumns(filteredWords);
    const batches = createBatches(posFilteredWords);
    const totalBatches = batches.length;
    
    if (downloadBatchTo > totalBatches) {
      setDownloadBatchTo(totalBatches);
    }
  }, [uniqueWords, batchSize, batchByUnknown, selectedPosColumns, newWordsOnly, knownWordsText]);

  if (!database) {
    return (
      <div className="list-view-section">
        <div className="text-center text-muted-foreground py-8">
          Select a database to view word list
        </div>
      </div>
    );
  }

  const filteredWords = getFilteredWords();
  const posFilteredWords = filterByPosColumns(filteredWords);
  const batches = createBatches(posFilteredWords);
  const totalBatches = batches.length;

  return (
    <div className="list-view-section">

      {/* Controls Container */}
      <div className="controls-container bg-muted p-4 rounded-lg mb-6">
        <div className="flex flex-wrap gap-6 justify-between items-start">
          
          {/* Filter Toggles */}
          <div className="control-group flex flex-col gap-3">
            <h3 className="text-sm font-medium">Filters</h3>
            
            <label className="toggle-label flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={firstInstancesOnly}
                onChange={(e) => setFirstInstancesOnly(e.target.checked)}
                className="sr-only"
              />
              <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
                <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${firstInstancesOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm">First Instances</span>
            </label>
            
            <label className="toggle-label flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newWordsOnly}
                onChange={(e) => setNewWordsOnly(e.target.checked)}
                className="sr-only"
              />
              <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
                <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${newWordsOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm">New Words Only</span>
            </label>
          </div>

          {/* Batch Settings */}
          <div className="control-group flex flex-col gap-3">
            <h3 className="text-sm font-medium">Batch Settings</h3>
            
            <div className="setting-control flex items-center gap-2">
              <label className="text-sm">Words per Batch:</label>
              <input
                type="number"
                min="1"
                max="200"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 25)}
                className="w-16 px-2 py-1 text-center border border-border rounded text-sm"
              />
              <div className="flex flex-col">
                <button
                  onClick={() => setBatchSize(Math.min(200, batchSize + 1))}
                  className="px-1 py-0 text-xs border border-border hover:bg-muted"
                >
                  ▲
                </button>
                <button
                  onClick={() => setBatchSize(Math.max(1, batchSize - 1))}
                  className="px-1 py-0 text-xs border border-border hover:bg-muted"
                >
                  ▼
                </button>
              </div>
            </div>
            
            <label className="toggle-label flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={batchByUnknown}
                onChange={(e) => setBatchByUnknown(e.target.checked)}
                className="sr-only"
              />
              <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
                <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${batchByUnknown ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm">Batch by Unknown</span>
            </label>
          </div>

          {/* View Controls */}
          <div className="control-group flex flex-col gap-3">
            <h3 className="text-sm font-medium">View</h3>
            
            <Button
              onClick={() => setIsGridView(!isGridView)}
              variant="outline"
              size="sm"
              className="view-toggle-button"
            >
              {isGridView ? 'Switch to List View' : 'Switch to Grid View'}
            </Button>
          </div>

          {/* Download Settings */}
          <div className="control-group flex flex-col gap-3">
            <h3 className="text-sm font-medium">Download</h3>
            
            <label className="toggle-label flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ankiFormat}
                onChange={(e) => setAnkiFormat(e.target.checked)}
                className="sr-only"
              />
              <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
                <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${ankiFormat ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm">Anki Format</span>
            </label>
            
            <div className="flex items-center gap-2">
              <label className="text-sm">Batch From:</label>
              <input
                type="number"
                min="1"
                max={totalBatches}
                value={downloadBatchFrom}
                onChange={(e) => setDownloadBatchFrom(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-center border border-border rounded text-sm bg-background text-foreground"
              />
              <span className="text-sm">To:</span>
              <input
                type="number"
                min="1"
                max={totalBatches}
                value={downloadBatchTo}
                onChange={(e) => setDownloadBatchTo(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-center border border-border rounded text-sm bg-background text-foreground"
              />
            </div>
            
            <Button
              onClick={handleDownload}
              disabled={totalBatches === 0}
              className="bg-green-600 hover:bg-green-700"
              size="sm"
            >
              <Download className="w-4 h-4 mr-1" />
              Download
            </Button>
          </div>

          {/* POS Column Filters */}
          <div className="control-group flex flex-col gap-3">
            <h3 className="text-sm font-medium">POS Columns</h3>
            
            <div className="flex gap-2 flex-wrap">
              {[
                { key: 'pink', label: 'V', title: 'Verb' },
                { key: 'blue', label: 'N', title: 'Noun' },
                { key: 'green', label: 'Adj', title: 'Adjective' },
                { key: 'orange', label: 'Aux', title: 'Auxiliary' },
                { key: 'yellow', label: 'Oth', title: 'Other' }
              ].map(({ key, label, title }) => (
                <label key={key} className="checkbox-label flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPosColumns.has(key)}
                    onChange={() => togglePosColumn(key)}
                    className="w-3 h-3"
                  />
                  <span className="text-sm" title={title}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <List className="w-5 h-5" />
          First Instances List
        </h2>
        <div className="text-sm text-muted-foreground">
          {filteredWords.length} words, {totalBatches} batches
        </div>
      </div>

      {/* Word List Display */}
      <div className="list-display bg-background border border-border rounded-lg p-4">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading words...
          </div>
        ) : (
          renderBatches()
        )}
      </div>
    </div>
  );
}