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
  // Basic states
  const [segmentMode, setSegmentMode] = useState(false);
  const [currentlyHighlightedSegmentId, setCurrentlyHighlightedSegmentId] = useState<string | null>(null);
  const [segmentDisplayState, setSegmentDisplayState] = useState<{
    id: string | null;
    keys: string[];
    index: number;
  }>({ id: null, keys: [], index: 0 });

  // Cycle through segment translations
  const cycleSegmentTranslation = () => {
    if (!segmentDisplayState.id || segmentDisplayState.keys.length <= 1) return;
    
    const newIndex = (segmentDisplayState.index + 1) % segmentDisplayState.keys.length;
    setSegmentDisplayState(prev => ({
      ...prev,
      index: newIndex
    }));
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

  // Render a simple word span for testing
  const renderWordSpan = (word: WordEntry, index: number) => {
    let className = "word-span";
    
    // Segment highlighting
    if (segmentMode && selectedDatabase?.segments) {
      const wordPosition = word.position || index;
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

    return (
      <span
        key={index}
        className={className}
        data-key={index}
        onMouseEnter={(e) => {
          handleSegmentHover(e, word.position || index);
        }}
      >
        {word.word}
      </span>
    );
  };

  return (
    <div className="page-view-section">
      <div className="controls">
        <button 
          onClick={() => setSegmentMode(!segmentMode)}
          className={segmentMode ? 'active' : ''}
        >
          Segment Mode
        </button>
      </div>
      
      <div className="content">
        <div className="text-content">
          {analysisData.slice(0, 100).map((word, index) => (
            <span key={index}>
              {renderWordSpan(word, index)}
              {index < 99 && ' '}
            </span>
          ))}
        </div>
        
        {segmentMode && (
          <div className="right-pane">
            <h3>Segment Translation</h3>
            {segmentDisplayState.id && segmentDisplayState.keys.length > 0 && (
              <div>
                <button onClick={cycleSegmentTranslation}>
                  Cycle Translation ({segmentDisplayState.index + 1}/{segmentDisplayState.keys.length})
                </button>
                <div className="segment-translation">
                  {selectedDatabase?.segments?.find(s => 
                    (s.id?.toString() || `${s.startWordKey}-${s.endWordKey}`) === segmentDisplayState.id
                  )?.translations?.[segmentDisplayState.keys[segmentDisplayState.index]]}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}