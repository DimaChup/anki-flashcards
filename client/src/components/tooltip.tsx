import { useEffect, useRef } from "react";
import { type WordEntry } from "@shared/schema";

interface TooltipProps {
  word: WordEntry;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function Tooltip({ word, position, onClose }: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', handleScroll, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const contextInfo = word.contextualInfo || {};
  const contextDetails = [
    contextInfo.gender && `Gender: ${contextInfo.gender}`,
    contextInfo.number && `Number: ${contextInfo.number}`,
    contextInfo.tense && `Tense: ${contextInfo.tense}`,
    contextInfo.mood && `Mood: ${contextInfo.mood}`,
    contextInfo.person && `Person: ${contextInfo.person}`,
  ].filter(Boolean).join(', ');

  return (
    <div
      ref={tooltipRef}
      className="tooltip"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%) translateY(-100%)',
      }}
      data-testid="word-tooltip"
    >
      <div className="tooltip-word">{word.word}</div>
      <div className="tooltip-translation">{word.translation}</div>
      <div className="tooltip-pos">
        {word.pos} • Frequency: {word.frequency}
        {contextDetails && ` • ${contextDetails}`}
      </div>
    </div>
  );
}
