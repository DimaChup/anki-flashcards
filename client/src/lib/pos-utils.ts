import { type WordEntry } from "@shared/schema";

export function generateCSV(words: WordEntry[]): string {
  const headers = ['Word', 'POS', 'Translation', 'Frequency', 'First Instance', 'Position', 'Sentence'];
  const rows = words.map(word => [
    word.word,
    word.pos,
    word.translation,
    word.frequency.toString(),
    word.firstInstance ? 'Yes' : 'No',
    word.position.toString(),
    word.sentence.replace(/"/g, '""'), // Escape quotes for CSV
  ]);
  
  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
}

export function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export function validateJSONStructure(data: any): boolean {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.name === 'string' &&
    typeof data.language === 'string' &&
    typeof data.originalText === 'string' &&
    Array.isArray(data.analysisData) &&
    data.analysisData.every((word: any) => 
      word &&
      typeof word.id === 'string' &&
      typeof word.word === 'string' &&
      typeof word.pos === 'string' &&
      typeof word.translation === 'string' &&
      typeof word.frequency === 'number' &&
      typeof word.firstInstance === 'boolean' &&
      typeof word.position === 'number' &&
      typeof word.sentence === 'string'
    )
  );
}

export function processKnownWords(knownWordsText: string): string[] {
  return knownWordsText
    .split('\n')
    .map(word => word.trim().toLowerCase())
    .filter(word => word.length > 0);
}

export function formatWordFrequency(frequency: number): string {
  if (frequency === 1) return '1 time';
  if (frequency < 1000) return `${frequency} times`;
  if (frequency < 1000000) return `${(frequency / 1000).toFixed(1)}k times`;
  return `${(frequency / 1000000).toFixed(1)}M times`;
}

export function getWordStatistics(words: WordEntry[]): {
  totalWords: number;
  uniqueWords: number;
  averageFrequency: number;
  posDistribution: Record<string, number>;
} {
  const totalWords = words.length;
  const uniqueWordsSet = new Set(words.map(w => w.word.toLowerCase()));
  const uniqueWords = uniqueWordsSet.size;
  
  const totalFrequency = words.reduce((sum, word) => sum + word.frequency, 0);
  const averageFrequency = totalWords > 0 ? totalFrequency / totalWords : 0;
  
  const posDistribution: Record<string, number> = {};
  words.forEach(word => {
    posDistribution[word.pos] = (posDistribution[word.pos] || 0) + 1;
  });
  
  return {
    totalWords,
    uniqueWords,
    averageFrequency,
    posDistribution,
  };
}
