import fs from 'fs';

// Read the sample data
const rawData = JSON.parse(fs.readFileSync('attached_assets/combinedData_1754433218588.json', 'utf8'));

// Transform to our schema format
const transformedData = {
  name: "Spanish Text Analysis - Patagonia Story",
  description: "Linguistic analysis of a Spanish text about travel to Patagonia, featuring word-by-word POS tagging and translations",
  language: "Spanish",
  originalText: rawData.inputText,
  wordCount: Object.keys(rawData.wordDatabase).length,
  analysisData: [],
  knownWords: []
};

// Transform each word entry
Object.entries(rawData.wordDatabase).forEach(([id, wordData]) => {
  const transformedWord = {
    id: id,
    word: wordData.word,
    lemma: wordData.lemma,
    pos: wordData.pos,
    translation: wordData.best_translation,
    frequency: parseInt(wordData.freq) || 1,
    firstInstance: wordData.first_inst === "true" || wordData.first_inst === true,
    contextualInfo: {
      gender: wordData.details?.Gender,
      number: wordData.details?.Number,
      tense: wordData.details?.Tense,
      mood: wordData.details?.Mood,
      person: wordData.details?.Person,
    },
    position: parseInt(id),
    sentence: wordData.sentence || `Context for word: ${wordData.word}`
  };
  
  transformedData.analysisData.push(transformedWord);
});

// Write the transformed data
fs.writeFileSync('sample-spanish-database.json', JSON.stringify(transformedData, null, 2));
console.log('Sample database created: sample-spanish-database.json');
console.log(`Processed ${transformedData.analysisData.length} words`);