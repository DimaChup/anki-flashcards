import { useState, useEffect } from "react";
import { type LinguisticDatabase } from "@shared/schema";

interface KnownWordsSectionProps {
  selectedDatabase: LinguisticDatabase | null;
  knownWords: string[];
  onKnownWordsChange: (knownWords: string[]) => void;
}

export default function KnownWordsSection({ 
  selectedDatabase, 
  knownWords, 
  onKnownWordsChange 
}: KnownWordsSectionProps) {
  const [knownWordsInput, setKnownWordsInput] = useState("");

  // Sync known words input with prop changes
  useEffect(() => {
    if (knownWords && knownWords.length > 0) {
      setKnownWordsInput(knownWords.join('\n'));
    } else {
      setKnownWordsInput('');
    }
  }, [knownWords, selectedDatabase?.id]);

  // Handle input changes and update parent
  const handleKnownWordsInputChange = (value: string) => {
    setKnownWordsInput(value);
    const wordsArray = value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    onKnownWordsChange(wordsArray);
  };

  if (!selectedDatabase) {
    return null;
  }

  return (
    <section 
      className="p-5 rounded-xl"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      <div className="input-section">
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
            data-testid="known-words-input"
          />
        </div>
      </div>
    </section>
  );
}