/**
 * RAG Chunker Utility
 * 
 * Splits raw legal document text into semantically coherent chunks
 * suitable for embedding and retrieval. Targets ~500 tokens per chunk
 * (~375 words) which fits comfortably within embedding model limits.
 */

const TARGET_WORDS = 375; // ≈ 500 tokens
const MAX_WORDS = 600;    // hard ceiling before a forced split
const MIN_WORDS = 40;     // minimum to be worth keeping as a chunk

/**
 * Estimates token count from word count (rough 1.33x multiplier).
 */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Splits text at the last sentence boundary within maxWords.
 */
function splitAtSentence(text: string, maxWords: number): [string, string] {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return [text, ''];

  // Walk backwards from maxWords to find a sentence boundary
  for (let i = maxWords; i > maxWords / 2; i--) {
    const candidate = words.slice(0, i).join(' ');
    if (/[.!?]\s*$/.test(candidate)) {
      return [candidate.trim(), words.slice(i).join(' ').trim()];
    }
  }

  // No sentence boundary found – hard split at maxWords
  return [words.slice(0, maxWords).join(' '), words.slice(maxWords).join(' ')];
}

/**
 * Main chunking function.
 * 
 * Strategy:
 * 1. Split on double newlines (paragraphs / section breaks).
 * 2. Merge very short paragraphs into the accumulator chunk.
 * 3. When the accumulator exceeds TARGET_WORDS, emit it as a chunk.
 * 4. If any single paragraph exceeds MAX_WORDS, split at sentence boundaries.
 * 
 * @param text    Full document text.
 * @param target  Target word count per chunk (default: TARGET_WORDS).
 * @returns       Array of non-empty text chunks.
 */
export function chunkText(text: string, target: number = TARGET_WORDS): string[] {
  if (!text || !text.trim()) return [];

  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const chunks: string[] = [];
  let accumulator = '';

  for (const para of paragraphs) {
    // Handle over-long paragraphs by splitting at sentence boundaries
    let remaining = para;
    while (wordCount(remaining) > MAX_WORDS) {
      const [head, tail] = splitAtSentence(remaining, MAX_WORDS);
      if (accumulator) {
        // Flush accumulator first
        chunks.push(accumulator.trim());
        accumulator = '';
      }
      if (wordCount(head) >= MIN_WORDS) {
        chunks.push(head.trim());
      }
      remaining = tail;
    }

    // remaining is now a manageable paragraph
    const combined = accumulator ? `${accumulator}\n\n${remaining}` : remaining;

    if (wordCount(combined) >= target) {
      // Emit the combined chunk
      chunks.push(combined.trim());
      accumulator = '';
    } else {
      // Keep accumulating
      accumulator = combined;
    }
  }

  // Flush any leftover
  if (accumulator.trim() && wordCount(accumulator) >= MIN_WORDS) {
    chunks.push(accumulator.trim());
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Returns a concise preview of a chunk (first 200 chars).
 */
export function chunkPreview(chunk: string): string {
  return chunk.length > 200 ? chunk.substring(0, 197) + '...' : chunk;
}
