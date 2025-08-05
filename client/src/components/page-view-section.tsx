import { useState, useEffect, useRef, useCallback } from "react";
import { type LinguisticDatabase, type WordEntry } from "@shared/schema";

interface PageViewSectionProps {
  selectedDatabase: LinguisticDatabase | null;
  analysisData: WordEntry[];
  knownWords: string[];
  onKnownWordsChange: (knownWords: string[]) => void;
}

export default function PageViewSection({
  selectedDatabase,
  analysisData,
  knownWords,
  onKnownWordsChange,
}: PageViewSectionProps) {
  // State variables matching the original
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [wordsPerPage, setWordsPerPage] = useState(100);
  const [isDualPageView, setIsDualPageView] = useState(true);
  const [viewModeBeforeSegments, setViewModeBeforeSegments] = useState(true);
  
  // Toggle states
  const [highlightedPOS, setHighlightedPOS] = useState<Set<string>>(new Set());
  const [filterFirstInstance, setFilterFirstInstance] = useState(false);
  const [filterNewWords, setFilterNewWords] = useState(false);
  const [highlightStyle, setHighlightStyle] = useState<'underline' | 'background'>('underline');
  const [showGrammar, setShowGrammar] = useState(false);
  const [segmentMode, setSegmentMode] = useState(false);
  const [scopeMode, setScopeMode] = useState<'entire' | 'page'>('entire');
  
  // Known words state
  const [knownWordsInput, setKnownWordsInput] = useState("");
  const [knownSignaturesSet, setKnownSignaturesSet] = useState<Set<string>>(new Set());
  
  // Refs
  const dualPageContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const wordInfoTooltipRef = useRef<HTMLDivElement>(null);
  const idiomInfoTooltipRef = useRef<HTMLDivElement>(null);

  // POS button configuration matching original
  const posButtonGroups = [
    { key: "pink", group: "verb", text: "Verb", tags: ["VERB"], hueVar: "--hl-verb-hue", satVar: "--hl-verb-sat", lightVar: "--hl-verb-light" },
    { key: "blue", group: "noun-propn", text: "Noun/PropN", tags: ["NOUN", "PROPN"], hueVar: "--hl-noun-hue", satVar: "--hl-noun-sat", lightVar: "--hl-noun-light" },
    { key: "green", group: "adj", text: "Adjective", tags: ["ADJ"], hueVar: "--hl-adj-hue", satVar: "--hl-adj-sat", lightVar: "--hl-adj-light" },
    { key: "orange", group: "aux", text: "Aux", tags: ["AUX"], hueVar: "--hl-aux-hue", satVar: "--hl-aux-sat", lightVar: "--hl-aux-light" },
    { key: "yellow", group: "other", text: "Other", tags: [], hueVar: "--hl-other-hue", satVar: "--hl-other-sat", lightVar: "--hl-other-light" }
  ];

  // Process known words into signatures
  useEffect(() => {
    const signatures = new Set<string>();
    if (knownWords && Array.isArray(knownWords)) {
      knownWords.forEach(word => {
        if (word && word.includes('::')) {
          signatures.add(word);
        }
      });
      setKnownWordsInput(knownWords.join('\n'));
    }
    setKnownSignaturesSet(signatures);
  }, [knownWords]);

  // Handle known words input change
  const handleKnownWordsInputChange = (value: string) => {
    setKnownWordsInput(value);
    const words = value.split('\n').filter(word => word.trim()).map(word => word.trim());
    onKnownWordsChange(words);
  };

  // Toggle POS highlighting
  const togglePOSHighlight = (tags: string[]) => {
    setHighlightedPOS(prev => {
      const newSet = new Set(prev);
      const hasAll = tags.every(tag => newSet.has(tag));
      
      if (hasAll) {
        // Remove all tags
        tags.forEach(tag => newSet.delete(tag));
      } else {
        // Add all tags
        tags.forEach(tag => newSet.add(tag));
      }
      
      return newSet;
    });
  };

  // Toggle all highlights
  const toggleAllHighlights = () => {
    const allTags = posButtonGroups.flatMap(group => group.tags);
    const hasAll = allTags.every(tag => highlightedPOS.has(tag));
    
    if (hasAll) {
      setHighlightedPOS(new Set());
    } else {
      setHighlightedPOS(new Set(allTags));
    }
  };

  // Update segment mode and handle view mode
  const updateSegmentMode = (newSegmentMode: boolean) => {
    if (newSegmentMode && !segmentMode) {
      // Entering segment mode
      setViewModeBeforeSegments(isDualPageView);
      if (isDualPageView) {
        setIsDualPageView(false);
      }
    } else if (!newSegmentMode && segmentMode) {
      // Exiting segment mode
      setIsDualPageView(viewModeBeforeSegments);
    }
    setSegmentMode(newSegmentMode);
  };

  // Add first instances to known words
  const addFirstInstances = () => {
    if (!analysisData) return;
    
    const firstInstances = analysisData
      .filter(word => word.firstInstance)
      .map(word => `${word.word}::${word.pos}`);
    
    const existingKnownWords = knownWords || [];
    const combinedWords = [...existingKnownWords, ...firstInstances];
    const newKnownWords = Array.from(new Set(combinedWords));
    onKnownWordsChange(newKnownWords);
  };

  // Clear known words
  const clearKnownWords = () => {
    if (scopeMode === 'entire') {
      onKnownWordsChange([]);
    } else {
      // Clear only current page words - implement page-specific logic
      onKnownWordsChange([]);
    }
  };

  // Get words to display based on filters
  const getFilteredWords = () => {
    if (!analysisData) return [];
    
    let filtered = [...analysisData];
    
    if (filterFirstInstance) {
      filtered = filtered.filter(word => word.firstInstance);
    }
    
    if (filterNewWords) {
      filtered = filtered.filter(word => !knownSignaturesSet.has(`${word.word}::${word.pos}`));
    }
    
    return filtered;
  };

  // Render words with highlighting
  const renderWordSpan = (word: WordEntry, index: number) => {
    const isHighlighted = highlightedPOS.has(word.pos);
    const isKnown = knownSignaturesSet.has(`${word.word}::${word.pos}`);
    
    let className = "word-span";
    let style: React.CSSProperties = {};
    
    if (isHighlighted) {
      const group = posButtonGroups.find(g => g.tags.includes(word.pos));
      if (group) {
        if (highlightStyle === 'background') {
          style.backgroundColor = `hsl(var(${group.hueVar}), var(${group.satVar}), var(${group.lightVar}))`;
          style.color = 'var(--hl-text)';
        } else {
          style.textDecoration = 'underline';
          style.textDecorationColor = `hsl(var(${group.hueVar}), var(${group.satVar}), var(${group.lightVar}))`;
        }
        
        if (isKnown) {
          style.opacity = 'var(--highlight-known-alpha)';
        }
      }
    }
    
    return (
      <span
        key={index}
        className={className}
        style={style}
        data-key={index}
        data-word={word.word}
        data-pos={word.pos}
        onContextMenu={(e) => {
          e.preventDefault();
          // Handle right-click to show detailed tooltip
        }}
      >
        {word.word}
      </span>
    );
  };

  // Render page content
  const renderPageContent = (words: WordEntry[], startIndex: number = 0) => {
    return (
      <div className="text-display-content">
        {words.slice(startIndex, startIndex + wordsPerPage).map((word, index) => (
          <span key={startIndex + index}>
            {renderWordSpan(word, startIndex + index)}
            {startIndex + index < words.length - 1 && ' '}
          </span>
        ))}
      </div>
    );
  };

  const filteredWords = getFilteredWords();
  const totalWordsCount = filteredWords.length;
  const calculatedTotalPages = Math.ceil(totalWordsCount / wordsPerPage);

  useEffect(() => {
    setTotalPages(calculatedTotalPages);
    if (currentPage > calculatedTotalPages) {
      setCurrentPage(1);
    }
  }, [calculatedTotalPages, currentPage]);

  if (!selectedDatabase) {
    return (
      <div className="page-view-section">
        <div className="text-center text-muted-foreground py-8">
          Select a database to view text analysis
        </div>
      </div>
    );
  }

  return (
    <div className="page-view-section">
      {/* Known Words Input Section */}
      <div className="input-section mb-6">
        <div className="textarea-group">
          <label htmlFor="known-words-input" className="text-sm font-medium text-muted-foreground mb-2 block">
            Known Words (Signatures: word::POS):
          </label>
          <textarea
            id="known-words-input"
            value={knownWordsInput}
            onChange={(e) => handleKnownWordsInputChange(e.target.value)}
            className="w-full h-32 p-3 bg-muted border border-border rounded-lg font-mono text-sm resize-vertical"
            placeholder="Load data from server or edit here..."
          />
        </div>
      </div>

      {/* Controls Container */}
      <div className="controls-container bg-muted p-4 rounded-lg mb-6 flex flex-wrap justify-between items-center gap-4">
        {/* Highlight Controls */}
        <div className="control-group highlight-controls flex flex-col gap-2">
          <div className="highlight-row flex items-center gap-4">
            <button
              onClick={toggleAllHighlights}
              className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm"
            >
              Highlight All
            </button>
            <label className="toggle-label flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={highlightStyle === 'background'}
                onChange={(e) => setHighlightStyle(e.target.checked ? 'background' : 'underline')}
                className="sr-only"
              />
              <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
                <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${highlightStyle === 'background' ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm">Style</span>
            </label>
          </div>
          
          {/* POS Buttons */}
          <div className="pos-buttons flex flex-wrap gap-2">
            {posButtonGroups.map((group) => (
              <button
                key={group.key}
                onClick={() => togglePOSHighlight(group.tags)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  group.tags.every(tag => highlightedPOS.has(tag))
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted-foreground/20 hover:bg-muted-foreground/30'
                }`}
                data-pos-group={group.group}
              >
                {group.text}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Toggles */}
        <div className="control-group filter-toggles flex gap-4">
          <label className="toggle-label flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterFirstInstance}
              onChange={(e) => setFilterFirstInstance(e.target.checked)}
              className="sr-only"
            />
            <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
              <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${filterFirstInstance ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm">Filter 1st</span>
          </label>
          
          <label className="toggle-label flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterNewWords}
              onChange={(e) => setFilterNewWords(e.target.checked)}
              className="sr-only"
            />
            <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
              <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${filterNewWords ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm">Filter New</span>
          </label>
          
          <label className="toggle-label flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showGrammar}
              onChange={(e) => setShowGrammar(e.target.checked)}
              className="sr-only"
            />
            <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
              <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${showGrammar ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm">Grammar</span>
          </label>
          
          <label className="toggle-label flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={segmentMode}
              onChange={(e) => updateSegmentMode(e.target.checked)}
              className="sr-only"
            />
            <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
              <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${segmentMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm">Segments</span>
          </label>
        </div>

        {/* Action Controls */}
        <div className="control-group action-controls flex items-center gap-4">
          <label className="toggle-label flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scopeMode === 'page'}
              onChange={(e) => setScopeMode(e.target.checked ? 'page' : 'entire')}
              className="sr-only"
            />
            <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
              <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${scopeMode === 'page' ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm">Scope</span>
          </label>
          
          <button
            onClick={addFirstInstances}
            disabled={!analysisData?.some(word => word.firstInstance)}
            className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Add First Inst.
          </button>
          
          <button
            onClick={clearKnownWords}
            disabled={knownSignaturesSet.size === 0}
            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Clear Known Words
          </button>
        </div>
      </div>

      {/* Text Display Area */}
      <div className="output-section">
        <div
          ref={dualPageContainerRef}
          className={`dual-page-container ${isDualPageView ? 'dual-view' : 'single-view'}`}
        >
          <div className="text-display-page text-display-left">
            {renderPageContent(filteredWords, (currentPage - 1) * wordsPerPage)}
          </div>
          {isDualPageView && (
            <div className="text-display-page text-display-right">
              {renderPageContent(filteredWords, currentPage * wordsPerPage)}
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        <div className="pagination-controls flex justify-between items-center mt-4 p-3 bg-muted rounded-lg">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &lt; Previous
          </button>
          
          <div className="pagination-center flex items-center gap-2">
            <span className="text-sm">Page {currentPage} of {totalPages}</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                const page = parseInt(e.target.value);
                if (page >= 1 && page <= totalPages) {
                  setCurrentPage(page);
                }
              }}
              className="w-16 px-2 py-1 text-center border border-border rounded text-sm"
              placeholder="Page"
            />
          </div>
          
          <div className="pagination-right flex items-center gap-4">
            {!segmentMode && (
              <label className="toggle-label flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDualPageView}
                  onChange={(e) => setIsDualPageView(e.target.checked)}
                  className="sr-only"
                />
                <div className="toggle-switch w-10 h-5 bg-muted-foreground rounded-full relative transition-colors duration-300">
                  <div className={`toggle-slider w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${isDualPageView ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm">View: Dual/Single</span>
              </label>
            )}
            
            <div className="setting-control flex items-center gap-2">
              <label className="text-sm">Words/Page:</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min="5"
                  max="500"
                  step="10"
                  value={wordsPerPage}
                  onChange={(e) => setWordsPerPage(parseInt(e.target.value) || 100)}
                  className="w-16 px-2 py-1 text-center border border-border rounded text-sm"
                />
                <div className="flex flex-col ml-1">
                  <button
                    onClick={() => setWordsPerPage(Math.min(500, wordsPerPage + 10))}
                    className="px-1 py-0 text-xs border border-border hover:bg-muted"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => setWordsPerPage(Math.max(5, wordsPerPage - 10))}
                    className="px-1 py-0 text-xs border border-border hover:bg-muted"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next &gt;
          </button>
        </div>
      </div>

      {/* Tooltip Container */}
      <div
        ref={tooltipRef}
        className="tooltip-container fixed z-50 hidden"
        style={{ display: 'none' }}
      >
        <div ref={wordInfoTooltipRef} className="word-info-tooltip bg-popover border border-border rounded-lg p-2 shadow-lg">
        </div>
        <div ref={idiomInfoTooltipRef} className="idiom-info-tooltip bg-popover border border-border rounded-lg p-2 shadow-lg">
        </div>
      </div>
    </div>
  );
}