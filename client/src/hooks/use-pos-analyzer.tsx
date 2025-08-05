import { type POSConfig } from "@shared/schema";

export function usePOSAnalyzer() {
  const getPosGroup = (pos: string): string => {
    switch (pos.toUpperCase()) {
      case 'VERB':
        return 'verb';
      case 'NOUN':
      case 'PROPN':
        return 'noun';
      case 'ADJ':
        return 'adj';
      case 'AUX':
        return 'aux';
      default:
        return 'other';
    }
  };

  const shouldHighlight = (pos: string, config: POSConfig): boolean => {
    const posGroup = getPosGroup(pos);
    return config[posGroup as keyof POSConfig];
  };

  const getPosIndicatorClass = (pos: string): string => {
    const posGroup = getPosGroup(pos);
    return `pos-${posGroup}`;
  };

  const getHighlightClass = (pos: string): string => {
    const posGroup = getPosGroup(pos);
    return `highlight-${posGroup}`;
  };

  return {
    getPosGroup,
    shouldHighlight,
    getPosIndicatorClass,
    getHighlightClass,
  };
}
