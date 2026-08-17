export const normalizeName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

// Classic Levenshtein edit distance — small alphabet, short strings (person names), so O(n*m) is fine.
export const levenshtein = (a: string, b: string): number => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) dist[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return dist[rows - 1][cols - 1];
};

// Treats short names strictly (any edit) and longer names leniently (small edit distance),
// so "Jon"/"John" flags but two genuinely different long names don't.
export const isFuzzyNameMatch = (nameA: string, nameB: string): boolean => {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);
  if (a === b) return true;

  const maxLen = Math.max(a.length, b.length);
  const threshold = maxLen <= 5 ? 1 : maxLen <= 10 ? 2 : 3;
  return levenshtein(a, b) <= threshold;
};

// Generic 0-100 similarity for the Duplicate Review match-score breakdown — not name-specific
// (used for names, NICs, and other short identifier strings alike).
export const stringSimilarityPct = (a: string, b: string): number => {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA === normB) return 100;
  const maxLen = Math.max(normA.length, normB.length) || 1;
  return Math.max(0, Math.round((1 - levenshtein(normA, normB) / maxLen) * 100));
};
