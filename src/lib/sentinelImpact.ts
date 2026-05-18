export interface ChunkWithEmbedding {
  embedding: number[];
  metadata: {
    docId: string;
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeImpactedContractCount(
  eventEmbedding: number[],
  chunks: Iterable<ChunkWithEmbedding>,
  threshold = 0.72
): number {
  const impactedDocIds = new Set<string>();

  for (const chunk of chunks) {
    const score = cosineSimilarity(eventEmbedding, chunk.embedding);
    if (score > threshold) {
      impactedDocIds.add(chunk.metadata.docId);
    }
  }

  return impactedDocIds.size;
}
