import { useState, useEffect, useRef, useCallback } from "react";
import { type LinguisticDatabase, type WordEntry } from "@shared/schema";
import FlashcardSection from "./flashcard-section";

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
  const [isGridView, setIsGridView] = useState(false);
  const [viewModeBeforeSegments, setViewModeBeforeSegments] = useState(true);
  
  // Toggle states
  const [highlightedPOS, setHighlightedPOS] = useState<Set<string>>(new Set());
  const [filterFirstInstance, setFilterFirstInstance] = useState(false);
  const [filterNewWords, setFilterNewWords] = useState(false);
  const [highlightStyle, setHighlightStyle] = useState<'underline' | 'background'>('underline');
  const [showGrammar, setShowGrammar] = useState(false);
  const [segmentMode, setSegmentMode] = useState(false);
  const [currentlyHighlightedSegmentId, setCurrentlyHighlightedSegmentId] = useState<string | null>(null);
  const [segmentDisplayState, setSegmentDisplayState] = useState<{
    id: string | null;
    keys: string[];
    index: number;
  }>({ id: null, keys: [], index: 0 });
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

  // Update segment mode and handle view mode - exactly like original
  const updateSegmentMode = (newSegmentMode: boolean) => {
    const wasSegmentModeActive = segmentMode;
    
    if (newSegmentMode && !wasSegmentModeActive) {
      // Entering segment mode - force dual page view to show translations
      setViewModeBeforeSegments(isDualPageView);
      if (!isDualPageView) {
        setIsDualPageView(true);
      }
    } else if (!newSegmentMode && wasSegmentModeActive) {
      // Exiting segment mode - restore previous view
      setIsDualPageView(viewModeBeforeSegments);
    }
    
    // Clear any existing segment highlights
    setCurrentlyHighlightedSegmentId(null);
    setSegmentDisplayState({ id: null, keys: [], index: 0 });
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

  // Get words to display (don't filter out, just return all for proper fading)
  const getFilteredWords = () => {
    if (!analysisData) return [];
    
    let filtered = [...analysisData];
    
    // Only apply filterNewWords as a real filter (removes words)
    if (filterNewWords) {
      filtered = filtered.filter(word => !knownSignaturesSet.has(`${word.word}::${word.pos}`));
    }
    
    // filterFirstInstance should not remove words, just fade them in rendering
    return filtered;
  };

  // Handle word click (toggle known status)
  const handleWordClick = (word: WordEntry, index: number) => {
    if (segmentMode) return; // Don't handle clicks in segment mode
    
    const signature = `${word.word}::${word.pos}`;
    const currentKnownWords = knownWords || [];
    
    if (knownSignaturesSet.has(signature)) {
      // Remove from known words
      const updatedKnownWords = currentKnownWords.filter(kw => kw !== signature);
      onKnownWordsChange(updatedKnownWords);
    } else {
      // Add to known words
      const updatedKnownWords = [...currentKnownWords, signature];
      onKnownWordsChange(updatedKnownWords);
    }
  };

  // Tooltip state - exactly like original page-view.html
  const [tooltipData, setTooltipData] = useState<{
    visible: boolean;
    x: number;
    y: number;
    word: string;
    pos: string;
    translation: string;
    frequency: number;
    position: number | null;
    firstInstance: boolean;
    contextualInfo?: any;
    showDetailed?: boolean;
  } | null>(null);

  // Handle word hover (show tooltip) - exact copy from page-view.html behavior
  const handleWordHover = (e: React.MouseEvent, word: WordEntry) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    setTooltipData({
      visible: true,
      x: mouseX,
      y: mouseY,
      word: word.word,
      pos: word.pos,
      translation: word.translation || '',
      frequency: word.frequency || 1,
      position: word.position || null,
      firstInstance: word.firstInstance || false,
      contextualInfo: word.contextualInfo
    });
  };

  // Handle word mouse out (hide tooltip)
  const handleWordMouseOut = () => {
    setTooltipData(null);
  };

  // Cycle through segment translation variants - exactly like original
  const cycleSegmentTranslation = () => {
    if (!segmentDisplayState.id || segmentDisplayState.keys.length <= 1) return;
    
    const nextIndex = (segmentDisplayState.index + 1) % segmentDisplayState.keys.length;
    setSegmentDisplayState(prev => ({
      ...prev,
      index: nextIndex
    }));
  };

  // Handle mouse move to update tooltip position
  const handleMouseMove = (e: React.MouseEvent) => {
    if (tooltipData) {
      setTooltipData({
        ...tooltipData,
        x: e.clientX,
        y: e.clientY
      });
    }
  };

  // Handle right-click (toggle detailed view) - like original contextmenu behavior
  const handleWordRightClick = (e: React.MouseEvent, word: WordEntry, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Toggle detailed view if tooltip is visible
    if (tooltipData) {
      setTooltipData({
        ...tooltipData,
        showDetailed: !tooltipData.showDetailed
      });
    }
  };
  
  // Hide tooltip when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      setTooltipData(null);
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Render words with highlighting and click functionality
  const renderWordSpan = (word: WordEntry, absoluteIndex: number) => {
    const isHighlighted = highlightedPOS.has(word.pos);
    const signature = `${word.word}::${word.pos}`;
    const isKnown = knownSignaturesSet.has(signature);
    const isFirstInstance = word.firstInstance;
    
    let className = "word-span";
    let style: React.CSSProperties = {};
    
    // Segment highlighting - takes priority like original (use word.position which is the absolute index)
    if (segmentMode && selectedDatabase?.segments) {
      const wordPosition = word.position || absoluteIndex; // Use word.position if available, fallback to index
      const wordSegment = selectedDatabase.segments.find(segment => 
        wordPosition >= segment.startWordKey && wordPosition <= segment.endWordKey
      );
      
      if (wordSegment) {
        const segmentId = wordSegment.id?.toString() || `${wordSegment.startWordKey}-${wordSegment.endWordKey}`;
        if (currentlyHighlightedSegmentId === segmentId) {
          className += " segment-word-highlight";
        }
      }
    }
    
    // Apply first instance filter fading (like original)
    if (filterFirstInstance && !isFirstInstance) {
      style.opacity = '0.3'; // Fade non-first instances
      className += " filtered-non-first";
    } else if (isKnown) {
      className += " known-word";
      style.opacity = 'var(--known-word-opacity, 0.6)';
    }
    
    if (isHighlighted) {
      const group = posButtonGroups.find(g => g.tags.includes(word.pos));
      if (group) {
        className += " highlight-active";
        
        if (highlightStyle === 'background') {
          style.backgroundColor = `hsl(var(${group.hueVar}), var(${group.satVar}), var(${group.lightVar}))`;
          style.color = 'var(--hl-text)';
        } else {
          style.textDecoration = 'underline';
          style.textDecorationColor = `hsl(var(${group.hueVar}), var(${group.satVar}), var(${group.lightVar}))`;
        }
        
        // Apply combined opacity for highlighted known words or filtered words
        if (filterFirstInstance && !isFirstInstance) {
          style.opacity = '0.3'; // Faded non-first instances have priority
        } else if (isKnown) {
          style.opacity = 'var(--highlight-known-alpha, 0.4)';
        }
      }
    }
    
    // Handle segment hover - exactly like original
    const handleSegmentHover = (e: React.MouseEvent, wordIndex: number) => {
      if (!segmentMode) return;
      
      console.log('Segment hover - wordIndex:', wordIndex, 'segments:', selectedDatabase?.segments);
      
      if (selectedDatabase?.segments && Array.isArray(selectedDatabase.segments)) {
        const segment = selectedDatabase.segments.find(seg => 
          wordIndex >= seg.startWordKey && wordIndex <= seg.endWordKey
        );
        
        console.log('Found segment:', segment);
        
        if (segment) {
          const segmentId = segment.id?.toString() || `${segment.startWordKey}-${segment.endWordKey}`;
          if (currentlyHighlightedSegmentId !== segmentId) {
            console.log('Setting segment highlight:', segmentId);
            setCurrentlyHighlightedSegmentId(segmentId);
            updateRightPaneWithSegment(segment);
          }
        } else {
          // No segment found, clear highlighting
          setCurrentlyHighlightedSegmentId(null);
          setSegmentDisplayState({ id: null, keys: [], index: 0 });
        }
      } else {
        console.log('No segments data available');
      }
    };

    // Update right pane with segment translation - exactly like original
    const updateRightPaneWithSegment = (segment: any) => {
      if (!segment) {
        setSegmentDisplayState({ id: null, keys: [], index: 0 });
        return;
      }

      const segmentId = segment.id?.toString() || `${segment.startWordKey}-${segment.endWordKey}`;
      
      if (segment.translations && typeof segment.translations === 'object' && Object.keys(segment.translations).length > 0) {
        const keys = Object.keys(segment.translations);
        setSegmentDisplayState({
          id: segmentId,
          keys: keys,
          index: 0
        });
      } else {
        setSegmentDisplayState({ id: segmentId, keys: [], index: 0 });
      }
    };

    // This function should be at component level, not here

    return (
      <span
        key={absoluteIndex}
        className={className}
        style={style}
        data-key={absoluteIndex}
        data-word={word.word}
        data-pos={word.pos}
        data-signature={signature}
        data-first-instance={word.firstInstance ? 'true' : 'false'}
        onClick={() => handleWordClick(word, absoluteIndex)}
        onMouseEnter={(e) => {
          if (!segmentMode) {
            handleWordHover(e, word);
          }
          handleSegmentHover(e, word.position || absoluteIndex);
        }}
        onMouseLeave={(e) => {
          if (!segmentMode) {
            handleWordMouseOut();
          }
        }}
        onMouseMove={handleMouseMove}
        onContextMenu={(e) => handleWordRightClick(e, word, absoluteIndex)}
        title={`${word.word} (${word.pos}) - Hover for details, click to toggle known status`}
      >
        {word.word}
        {showGrammar && word.contextualInfo && (
          <sup className="grammar-details">
            {[
              word.contextualInfo.gender,
              word.contextualInfo.number
            ].filter(Boolean).join('.')}
          </sup>
        )}
      </span>
    );
  };

  // Reconstruct text with punctuation - like original page-view.html
  const reconstructTextWithPunctuation = (words: WordEntry[], startIndex: number = 0) => {
    if (!selectedDatabase?.originalText || !words.length) {
      // Fallback to simple word display
      return words.slice(startIndex, startIndex + wordsPerPage).map((word, index) => (
        <span key={startIndex + index}>
          {renderWordSpan(word, startIndex + index)}
          {startIndex + index < words.length - 1 && ' '}
        </span>
      ));
    }

    const originalText = selectedDatabase.originalText;
    const pageWords = words.slice(startIndex, startIndex + wordsPerPage);
    const result = [];
    
    // Calculate starting text position based on previous words
    let textPosition = 0;
    
    // Find text position for the first word on this page
    for (let i = 0; i < startIndex && i < words.length; i++) {
      const prevWord = words[i];
      const wordPos = originalText.indexOf(prevWord.word, textPosition);
      if (wordPos >= 0) {
        textPosition = wordPos + prevWord.word.length;
      }
    }
    
    for (let i = 0; i < pageWords.length; i++) {
      const word = pageWords[i];
      const wordIndex = startIndex + i;
      
      // Find word in original text starting from current position
      const wordPosition = originalText.indexOf(word.word, textPosition);
      
      if (wordPosition > textPosition && wordPosition >= 0) {
        // Add any punctuation/whitespace before the word
        const punctuation = originalText.substring(textPosition, wordPosition);
        if (punctuation.trim() || punctuation.includes('\n')) {
          result.push(
            <span key={`punct-${wordIndex}`} className="punctuation">
              {punctuation}
            </span>
          );
        }
      }
      
      // Add the word span
      result.push(renderWordSpan(word, wordIndex));
      
      // Update position past this word
      if (wordPosition >= 0) {
        textPosition = wordPosition + word.word.length;
      }
    }
    
    return result;
  };

  // Render segment translations in right pane - exactly like original
  const renderSegmentTranslations = () => {
    console.log('Rendering segments, state:', segmentDisplayState, 'segments available:', selectedDatabase?.segments?.length || 0);
    
    if (!segmentDisplayState.id) {
      return (
        <div className="segment-placeholder">
          <i style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Hover over text on the left to see segment translations...
            {selectedDatabase?.segments ? ` (${selectedDatabase.segments.length} segments available)` : ' (No segments in database)'}
          </i>
        </div>
      );
    }

    // Find the current segment
    const segment = selectedDatabase?.segments?.find(seg => {
      const segmentId = seg.id?.toString() || `${seg.startWordKey}-${seg.endWordKey}`;
      return segmentId === segmentDisplayState.id;
    });

    if (!segment) return null;

    const translations = segment.translations;
    const keys = segmentDisplayState.keys;
    
    if (!translations || keys.length === 0) {
      return (
        <div className="no-translations">
          <i style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No segment translations available.
          </i>
        </div>
      );
    }

    const currentKey = keys[segmentDisplayState.index];
    const currentTranslation = translations[currentKey];
    const totalTranslations = keys.length;

    return (
      <div className="segment-translation-content">
        <div className="translation-block" style={{
          marginBottom: '12px',
          paddingLeft: '5px',
          borderLeft: '2px solid var(--segment-word-highlight-color)'
        }}>
          <span className="translation-lang-key" style={{
            fontWeight: 'bold',
            color: 'var(--text-primary)'
          }}>
            [{currentKey}]
          </span>{' '}
          <span style={{ color: 'var(--text-primary)' }}>
            {currentTranslation}
          </span>
          {totalTranslations > 1 && (
            <span 
              className="segment-translation-cycle"
              onClick={cycleSegmentTranslation}
              style={{
                display: 'inline-block',
                marginLeft: '10px',
                padding: '2px 8px',
                backgroundColor: 'var(--accent-primary)',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9em',
                userSelect: 'none'
              }}
              title={`Next Translation (${segmentDisplayState.index + 1}/${totalTranslations})`}
            >
              Next &gt;
            </span>
          )}
        </div>
      </div>
    );
  };

  // Render page content (main text display - always in text flow)
  const renderPageContent = (words: WordEntry[], startIndex: number = 0) => {
    // If no analysis data available but we have original text, show it
    if ((!words || words.length === 0) && selectedDatabase?.originalText) {
      return (
        <div className="text-display-content">
          <div className="unprocessed-text" style={{
            padding: '20px',
            backgroundColor: 'var(--muted)',
            borderRadius: '8px',
            border: '2px dashed var(--border)',
            marginBottom: '20px'
          }}>
            <div style={{
              fontSize: '0.9em',
              color: 'var(--muted-foreground)',
              marginBottom: '15px',
              fontWeight: '500'
            }}>
              📝 Original Text (Not yet processed by AI)
            </div>
            <div style={{
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {selectedDatabase.originalText}
            </div>
            <div style={{
              fontSize: '0.8em',
              color: 'var(--muted-foreground)',
              marginTop: '15px',
              fontStyle: 'italic'
            }}>
              💡 Use the Control Panel to process this text with AI for word analysis, POS tagging, and interactive features.
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="text-display-content">
        {reconstructTextWithPunctuation(words, startIndex)}
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

      {/* Controls Container - Exact copy from original page-view.html */}
      <div className="controls-container">
        <div className="control-group highlight-controls">
          <div className="highlight-row">
            <button
              onClick={toggleAllHighlights}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                highlightedPOS.size > 0 ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
              }`}
            >
              Highlight All
            </button>
            
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={highlightStyle === 'underline'}
                onChange={(e) => setHighlightStyle(e.target.checked ? 'underline' : 'background')}
              />
              <span className="toggle-switch"></span>
              <span className="toggle-text">Style</span>
            </label>
          </div>
          
          {/* POS Button Rows */}
          <div className="highlight-row button-container">
            {(posButtonGroups[0]?.tags || []).map((pos: string) => (
              <button
                key={pos}
                onClick={() => togglePOSHighlight(pos)}
                className={`pos-button text-xs px-2 py-1 rounded border transition-colors ${
                  highlightedPOS.has(pos)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-background border-border hover:bg-muted'
                }`}
                style={highlightedPOS.has(pos) ? {
                  backgroundColor: `hsl(var(${posButtonGroups[0]?.hueVar}), var(${posButtonGroups[0]?.satVar}), var(${posButtonGroups[0]?.lightVar}))`,
                  borderColor: `hsl(var(${posButtonGroups[0]?.hueVar}), var(${posButtonGroups[0]?.satVar}), var(${posButtonGroups[0]?.lightVar}))`,
                  color: 'white'
                } : {}}
              >
                {pos}
              </button>
            ))}
          </div>
          
          <div className="highlight-row button-container">
            {(posButtonGroups[1]?.tags || []).map((pos: string) => (
              <button
                key={pos}
                onClick={() => togglePOSHighlight(pos)}
                className={`pos-button text-xs px-2 py-1 rounded border transition-colors ${
                  highlightedPOS.has(pos)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-background border-border hover:bg-muted'
                }`}
                style={highlightedPOS.has(pos) ? {
                  backgroundColor: `hsl(var(${posButtonGroups[1]?.hueVar}), var(${posButtonGroups[1]?.satVar}), var(${posButtonGroups[1]?.lightVar}))`,
                  borderColor: `hsl(var(${posButtonGroups[1]?.hueVar}), var(${posButtonGroups[1]?.satVar}), var(${posButtonGroups[1]?.lightVar}))`,
                  color: 'white'
                } : {}}
              >
                {pos}
              </button>
            ))}
          </div>
          
          <div className="highlight-row button-container">
            {(posButtonGroups[2]?.tags || []).map((pos: string) => (
              <button
                key={pos}
                onClick={() => togglePOSHighlight(pos)}
                className={`pos-button text-xs px-2 py-1 rounded border transition-colors ${
                  highlightedPOS.has(pos)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-background border-border hover:bg-muted'
                }`}
                style={highlightedPOS.has(pos) ? {
                  backgroundColor: `hsl(var(${posButtonGroups[2]?.hueVar}), var(${posButtonGroups[2]?.satVar}), var(${posButtonGroups[2]?.lightVar}))`,
                  borderColor: `hsl(var(${posButtonGroups[2]?.hueVar}), var(${posButtonGroups[2]?.satVar}), var(${posButtonGroups[2]?.lightVar}))`,
                  color: 'white'
                } : {}}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        <div className="control-separator"></div>

        <div className="control-group filter-toggles">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={filterFirstInstance}
              onChange={(e) => setFilterFirstInstance(e.target.checked)}
            />
            <span className="toggle-switch"></span>
            <span className="toggle-text">Filter 1st</span>
          </label>
          
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={filterNewWords}
              onChange={(e) => setFilterNewWords(e.target.checked)}
            />
            <span className="toggle-switch"></span>
            <span className="toggle-text">Filter New</span>
          </label>
          
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showGrammar}
              onChange={(e) => setShowGrammar(e.target.checked)}
            />
            <span className="toggle-switch"></span>
            <span className="toggle-text">Grammar</span>
          </label>
          
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={segmentMode}
              onChange={(e) => updateSegmentMode(e.target.checked)}
            />
            <span className="toggle-switch"></span>
            <span className="toggle-text">Segments</span>
          </label>
        </div>

        <div className="control-separator"></div>

        <div className="control-group action-controls">
          <label className="toggle-label" title="Control scope for Add/Clear buttons">
            <input
              type="checkbox"
              checked={scopeMode === 'page'}
              onChange={(e) => setScopeMode(e.target.checked ? 'page' : 'entire')}
            />
            <span className="toggle-switch"></span>
            <span className="toggle-text">Scope</span>
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

      {/* Text Display Area - Scrollable Half Page */}
      <div 
        className="output-section"
        style={{
          height: '50vh',
          maxHeight: '400px',
          minHeight: '300px',
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          backgroundColor: 'var(--card)'
        }}
      >
        <div
          ref={dualPageContainerRef}
          className={`dual-page-container ${isDualPageView ? 'dual-view' : 'single-view'}`}
        >
          <div className="text-display-page text-display-left">
            {renderPageContent(filteredWords, (currentPage - 1) * wordsPerPage)}
          </div>
          {isDualPageView && (
            <div className={`text-display-page text-display-right ${segmentMode ? 'segment-translation-display' : ''}`}>
              {segmentMode ? renderSegmentTranslations() : renderPageContent(filteredWords, currentPage * wordsPerPage)}
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
            {segmentMode && (
              <span className="text-sm text-muted-foreground">
                Segment Mode: Dual view (translations shown in right pane)
              </span>
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

      {/* Tooltip - exact copy from original page-view.html */}
      {tooltipData && (
        <div
          id="tooltip-container"
          style={{
            position: 'fixed',
            left: tooltipData.x + 10,
            top: tooltipData.y + 10,
            zIndex: 1000,
            backgroundColor: 'hsl(215, 15%, 19%)', /* Solid bg-tertiary color */
            border: '1px solid hsl(215, 14%, 29%)', /* Solid border-color */
            borderRadius: '6px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.8)', /* Stronger shadow for contrast */
            fontSize: '0.9em',
            maxWidth: '700px',
            pointerEvents: 'none'
          }}
        >
          <div id="word-info-tooltip" style={{ display: 'flex' }}>
            {/* Concise part */}
            <div className="tooltip-part" style={{ padding: '8px 12px', whiteSpace: 'pre-wrap', color: 'hsl(210, 9%, 91%)', maxWidth: '350px' }}>
              <div className="tooltip-line">
                <strong style={{ 
                  color: tooltipData.pos === 'VERB' ? `hsl(var(--hl-verb-hue), var(--hl-verb-sat), var(--hl-verb-light))` :
                         tooltipData.pos === 'NOUN' || tooltipData.pos === 'PROPN' ? `hsl(var(--hl-noun-hue), var(--hl-noun-sat), var(--hl-noun-light))` :
                         tooltipData.pos === 'ADJ' ? `hsl(var(--hl-adj-hue), var(--hl-adj-sat), var(--hl-adj-light))` :
                         tooltipData.pos === 'AUX' ? `hsl(var(--hl-aux-hue), var(--hl-aux-sat), var(--hl-aux-light))` :
                         `hsl(var(--hl-other-hue), var(--hl-other-sat), var(--hl-other-light))`
                }}>{tooltipData.word}</strong> ({tooltipData.pos})
              </div>
              <div className="tooltip-line tooltip-best-translation" style={{ 
                fontSize: '1.8em', 
                lineHeight: '1.1',
                color: tooltipData.pos === 'VERB' ? `hsl(var(--hl-verb-hue), var(--hl-verb-sat), var(--hl-verb-light))` :
                       tooltipData.pos === 'NOUN' || tooltipData.pos === 'PROPN' ? `hsl(var(--hl-noun-hue), var(--hl-noun-sat), var(--hl-noun-light))` :
                       tooltipData.pos === 'ADJ' ? `hsl(var(--hl-adj-hue), var(--hl-adj-sat), var(--hl-adj-light))` :
                       tooltipData.pos === 'AUX' ? `hsl(var(--hl-aux-hue), var(--hl-aux-sat), var(--hl-aux-light))` :
                       `hsl(var(--hl-other-hue), var(--hl-other-sat), var(--hl-other-light))`
              }}>
                {tooltipData.translation || 'No translation'}
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid hsl(215, 14%, 29%)', margin: '6px 0' }} />
              <div className="tooltip-line">
                <strong>Freq:</strong> {tooltipData.frequency}
              </div>
              {tooltipData.position && (
                <div className="tooltip-line">
                  <strong>Pos:</strong> {tooltipData.position}
                </div>
              )}
              <div className="tooltip-line">
                <strong>First:</strong> {tooltipData.firstInstance ? 'Yes' : 'No'}
              </div>
            </div>
            
            {/* Detailed part - conditional display like original */}
            {tooltipData.contextualInfo && tooltipData.showDetailed && (
              <div 
                className="tooltip-part detailed-part" 
                style={{ 
                  padding: '8px 12px', 
                  borderLeft: '1px solid hsl(215, 14%, 29%)', /* Solid separator color */
                  whiteSpace: 'pre-wrap', 
                  color: 'hsl(210, 9%, 91%)', /* Solid text color */
                  maxWidth: '350px' 
                }}
              >
                <div className="tooltip-line">
                  <strong>Grammar Details:</strong>
                </div>
                {tooltipData.contextualInfo.gender && (
                  <div className="tooltip-line">Gender: {tooltipData.contextualInfo.gender}</div>
                )}
                {tooltipData.contextualInfo.number && (
                  <div className="tooltip-line">Number: {tooltipData.contextualInfo.number}</div>
                )}
                {tooltipData.contextualInfo.tense && (
                  <div className="tooltip-line">Tense: {tooltipData.contextualInfo.tense}</div>
                )}
                {tooltipData.contextualInfo.mood && (
                  <div className="tooltip-line">Mood: {tooltipData.contextualInfo.mood}</div>
                )}
                {tooltipData.contextualInfo.person && (
                  <div className="tooltip-line">Person: {tooltipData.contextualInfo.person}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flashcard Section */}
      <FlashcardSection selectedDatabaseId={selectedDatabase.id} />
    </div>
  );
}