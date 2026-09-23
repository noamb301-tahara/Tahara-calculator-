/** Text helpers shared by script writer, subtitles and timing. */

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/u).length : 0;
}

/** Estimated narration seconds for Hebrew text at a given words/sec rate. */
export function estimateSpeechSec(text: string, wordsPerSecond: number): number {
  const words = countWords(text);
  // Punctuation adds natural pauses.
  const pauses = (text.match(/[.,!?;:–—]/g) ?? []).length * 0.18;
  return Math.max(0.6, words / wordsPerSecond + pauses);
}

/** Split into sentences, keeping the punctuation. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"'`’‘]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** 0..1 similarity of two labels, tolerant to OCR noise and case. */
export function labelSimilarity(a: string, b: string): number {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) / Math.max(na.length, nb.length) * 0.35 + 0.6;
  }
  const d = editDistance(na, nb);
  return Math.max(0, 1 - d / Math.max(na.length, nb.length));
}

/** Wrap text in quotes suitable for Hebrew UI copy. */
export function quoteLabel(label: string): string {
  return `'${label}'`;
}
