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
  // State variables matching the original page-view.html
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
  
  // Tooltip state
  const [tooltipData, setTooltipData] = useState<any>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Refs
  const dualPageContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  // Calculate pagination
  useEffect(() => {
    if (analysisData?.length) {
      const total = Math.ceil(analysisData.length / wordsPerPage);
      setTotalPages(total);
      if (currentPage > total) {
        setCurrentPage(1);
      }
    }
  }, [analysisData, wordsPerPage, currentPage]);

  // Handle segment mode toggle
  const handleSegmentModeToggle = () => {
    if (!segmentMode) {
      // Entering segment mode - force dual page view and save current view
      setViewModeBeforeSegments(isDualPageView);
      setIsDualPageView(true);
    } else {
      // Exiting segment mode - restore previous view
      setIsDualPageView(viewModeBeforeSegments);
      setCurrentlyHighlightedSegmentId(null);
      setSegmentDisplayState({ id: null, keys: [], index: 0 });
    }
    setSegmentMode(!segmentMode);
  };

  // Handle word hover
  const handleWordHover = (e: React.MouseEvent, word: WordEntry) => {
    if (segmentMode) return; // Skip regular tooltips in segment mode
    
    setTooltipData(word);
    setTooltipPosition({ x: e.clientX, y: e.clientY });
    setShowTooltip(true);
  };

  const handleWordMouseOut = () => {
    setShowTooltip(false);
    setTooltipData(null);
  };

  // Handle segment hover
  const handleSegmentHover = (e: React.MouseEvent, wordIndex: number) => {
    if (!segmentMode || !selectedDatabase?.segments) return;
    
    const segment = selectedDatabase.segments.find(seg => 
      wordIndex >= seg.startWordKey && wordIndex <= seg.endWordKey
    );
    
    if (segment) {
      const segmentId = segment.id?.toString() || `${segment.startWordKey}-${segment.endWordKey}`;
      if (currentlyHighlightedSegmentId !== segmentId) {
        setCurrentlyHighlightedSegmentId(segmentId);
        updateRightPaneWithSegment(segment);
      }
    } else {
      setCurrentlyHighlightedSegmentId(null);
      setSegmentDisplayState({ id: null, keys: [], index: 0 });
    }
  };

  // Update right pane with segment translation
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

  // Cycle through segment translations
  const cycleSegmentTranslation = () => {
    if (!segmentDisplayState.id || segmentDisplayState.keys.length <= 1) return;
    
    const newIndex = (segmentDisplayState.index + 1) % segmentDisplayState.keys.length;
    setSegmentDisplayState(prev => ({
      ...prev,
      index: newIndex
    }));
  };

  // Handle word click
  const handleWordClick = (word: WordEntry, index: number) => {
    const signature = `${word.word}::${word.pos}`;
    const isCurrentlyKnown = knownSignaturesSet.has(signature);
    
    const newKnownWords = isCurrentlyKnown 
      ? knownWords.filter(kw => kw !== signature)
      : [...knownWords, signature];
    
    onKnownWordsChange(newKnownWords);
  };

  // Handle word right click
  const handleWordRightClick = (e: React.MouseEvent, word: WordEntry, index: number) => {
    e.preventDefault();
    // Could implement context menu here
    console.log('Right clicked word:', word);
  };

  // Handle mouse move for tooltip positioning
  const handleMouseMove = (e: React.MouseEvent) => {
    if (showTooltip) {
      setTooltipPosition({ x: e.clientX, y: e.clientY });
    }
  };

  // Render words with highlighting and click functionality
  const renderWordSpan = (word: WordEntry, absoluteIndex: number) => {
    const isHighlighted = highlightedPOS.has(word.pos);
    const signature = `${word.word}::${word.pos}`;
    const isKnown = knownSignaturesSet.has(signature);
    const isFirstInstance = word.firstInstance;
    
    let className = "word-span";
    let style: React.CSSProperties = {};
    
    // Segment highlighting - takes priority
    if (segmentMode && selectedDatabase?.segments) {
      const wordPosition = word.position || absoluteIndex;
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
    // Regular POS highlighting (only if not in segment mode or no segment highlight)
    else if (isHighlighted) {
      if (highlightStyle === 'underline') {
        className += ` pos-underline pos-underline-${word.pos.toLowerCase()}`;
      } else {
        className += ` pos-highlight pos-highlight-${word.pos.toLowerCase()}`;
      }
    }
    
    // Apply opacity for filtering effects (fading, not removal)
    if (filterFirstInstance && isFirstInstance) {
      style.opacity = 0.3;
    }
    
    // Known word styling
    if (isKnown) {
      className += " known-word";
      style.textDecoration = 'line-through';
      style.opacity = 0.5;
    }

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

    const pageWords = words.slice(startIndex, startIndex + wordsPerPage);
    const elements: React.ReactNode[] = [];
    let textPosition = 0;
    
    pageWords.forEach((word, index) => {
      const absoluteIndex = startIndex + index;
      const wordStart = selectedDatabase.originalText.indexOf(word.word, textPosition);
      
      if (wordStart > textPosition) {
        // Add any text/punctuation before this word
        const beforeText = selectedDatabase.originalText.slice(textPosition, wordStart);
        elements.push(<span key={`before-${absoluteIndex}`}>{beforeText}</span>);
      }
      
      // Add the word span
      elements.push(renderWordSpan(word, absoluteIndex));
      
      textPosition = wordStart + word.word.length;
    });
    
    return elements;
  };

  // Render page content
  const renderPageContent = () => {
    if (!analysisData?.length) {
      return <div className="no-data">No analysis data available</div>;
    }

    const startIndex = (currentPage - 1) * wordsPerPage;
    const pageWords = analysisData.slice(startIndex, startIndex + wordsPerPage);
    
    return (
      <div className="text-reconstruction">
        {reconstructTextWithPunctuation(analysisData, startIndex)}
      </div>
    );
  };

  // Render right pane content
  const renderRightPaneContent = () => {
    if (!segmentMode) return null;

    if (!segmentDisplayState.id || segmentDisplayState.keys.length === 0) {
      return (
        <div className="segment-instruction">
          <p>Hover over words to see segment translations</p>
        </div>
      );
    }

    const currentSegment = selectedDatabase?.segments?.find(s => 
      (s.id?.toString() || `${s.startWordKey}-${s.endWordKey}`) === segmentDisplayState.id
    );

    if (!currentSegment) return null;

    const currentKey = segmentDisplayState.keys[segmentDisplayState.index];
    const translation = currentSegment.translations?.[currentKey];

    return (
      <div className="segment-translation-display">
        <div className="segment-info">
          <strong>Segment:</strong> {segmentDisplayState.id}
        </div>
        {segmentDisplayState.keys.length > 1 && (
          <div className="translation-controls">
            <button 
              onClick={cycleSegmentTranslation}
              className="cycle-button"
            >
              {currentKey} ({segmentDisplayState.index + 1}/{segmentDisplayState.keys.length})
            </button>
          </div>
        )}
        <div className="translation-text">
          {translation || 'No translation available'}
        </div>
      </div>
    );
  };

  return (
    <div className="page-view-section">
      {/* Controls */}
      <div className="controls-section">
        {/* POS Highlighting Toggles */}
        <div className="pos-controls">
          <div className="pos-toggles">
            {posButtonGroups.map(group => (
              <button
                key={group.key}
                className={`pos-toggle ${group.key} ${group.tags.every(tag => highlightedPOS.has(tag)) ? 'active' : ''}`}
                onClick={() => togglePOSHighlight(group.tags)}
              >
                {group.text}
              </button>
            ))}
          </div>
        </div>

        {/* View Controls */}
        <div className="view-controls">
          <button
            className={`view-toggle ${isDualPageView ? 'active' : ''}`}
            onClick={() => !segmentMode && setIsDualPageView(!isDualPageView)}
            disabled={segmentMode}
          >
            Dual Page View
          </button>
          
          <button
            className={`segment-toggle ${segmentMode ? 'active' : ''}`}
            onClick={handleSegmentModeToggle}
          >
            Segment Mode
          </button>
          
          <button
            className={`grammar-toggle ${showGrammar ? 'active' : ''}`}
            onClick={() => setShowGrammar(!showGrammar)}
          >
            Show Grammar
          </button>
        </div>

        {/* Filter Controls */}
        <div className="filter-controls">
          <label>
            <input
              type="checkbox"
              checked={filterFirstInstance}
              onChange={(e) => setFilterFirstInstance(e.target.checked)}
            />
            Filter First Instance
          </label>
          
          <label>
            <input
              type="checkbox"
              checked={filterNewWords}
              onChange={(e) => setFilterNewWords(e.target.checked)}
            />
            Filter New Words
          </label>
        </div>

        {/* Pagination */}
        <div className="pagination-controls">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
          <select
            value={wordsPerPage}
            onChange={(e) => setWordsPerPage(Number(e.target.value))}
          >
            <option value={50}>50 words/page</option>
            <option value={100}>100 words/page</option>
            <option value={200}>200 words/page</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div className={`main-content ${isDualPageView ? 'dual-page' : 'single-page'}`}>
        <div className="left-pane">
          {renderPageContent()}
        </div>
        
        {isDualPageView && (
          <div className="right-pane">
            {segmentMode ? (
              renderRightPaneContent()
            ) : (
              <div className="known-words-section">
                <h3>Known Words</h3>
                <textarea
                  value={knownWordsInput}
                  onChange={(e) => handleKnownWordsInputChange(e.target.value)}
                  placeholder="Enter known words (word::POS format)"
                  rows={10}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tooltip */}
      {showTooltip && tooltipData && !segmentMode && (
        <div
          ref={tooltipRef}
          className="word-tooltip"
          style={{
            position: 'fixed',
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y - 10,
            zIndex: 1000
          }}
        >
          <div className="tooltip-content">
            <div className="tooltip-line">
              <strong>{tooltipData.word}</strong> ({tooltipData.pos})
            </div>
            {tooltipData.translations && (
              <div className="tooltip-line">
                {Array.isArray(tooltipData.translations) 
                  ? tooltipData.translations.join(', ')
                  : tooltipData.translations}
              </div>
            )}
            {tooltipData.contextualInfo && (
              <div className="grammar-details">
                {tooltipData.contextualInfo.gender && (
                  <div>Gender: {tooltipData.contextualInfo.gender}</div>
                )}
                {tooltipData.contextualInfo.number && (
                  <div>Number: {tooltipData.contextualInfo.number}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}