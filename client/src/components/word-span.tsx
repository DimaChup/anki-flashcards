import { useState } from "react";
import { type WordEntry } from "@shared/schema";
import Tooltip from "@/components/tooltip";

interface WordSpanProps {
  word: WordEntry;
  className?: string;
}

export default function WordSpan({ word, className = "" }: WordSpanProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <>
      <span
        className={`word-span ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-word-id={word.id}
        data-testid="word-span"
      >
        {word.word}
      </span>
      {showTooltip && (
        <Tooltip
          word={word}
          position={tooltipPosition}
          onClose={() => setShowTooltip(false)}
        />
      )}
    </>
  );
}
