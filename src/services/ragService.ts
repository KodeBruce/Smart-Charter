import { auth } from '../lib/firebase';

/**
 * Returns auth headers for authenticated API calls.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to use RAG features.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface RagIngestOptions {
  jurisdiction?: string;
  docType?: string;
}

export interface RagIngestResult {
  success: boolean;
  chunkCount: number;
  docId: string;
  message?: string;
}

export interface RagSource {
  chunkId: string;
  text: string;
  score: number;
  chunkIndex: number;
}

export interface RagAuditTrail {
  systemPrompt: string;
  exactUserPrompt: string;
  retrievedChunks: {
    index: number;
    text: string;
    score: number;
    docId: string;
    chunkIndex: number;
  }[];
  timestamp: string;
}

export interface RagQueryResult {
  answer: string;
  sources: RagSource[];
  model: 'rag' | 'fallback';
  indexed: boolean;
  auditTrail?: RagAuditTrail;
}

export interface RagStatusResult {
  indexed: boolean;
  chunkCount: number;
  docId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// API Functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Ingests a document into the RAG index.
 * Call this after a successful analyzeContract() to index the document.
 * 
 * @param file       The document file to index
 * @param docId      Unique document ID (from Firestore contract doc)
 * @param options    Optional metadata: jurisdiction, docType
 */
export async function ragIngest(
  file: File,
  docId: string,
  options: RagIngestOptions = {}
): Promise<RagIngestResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('docId', docId);
  if (options.jurisdiction) formData.append('jurisdiction', options.jurisdiction);
  if (options.docType) formData.append('docType', options.docType);

  const headers = await getAuthHeaders();
  const response = await fetch('/api/rag/ingest', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let parsed: any = {};
    try { parsed = JSON.parse(errText); } catch { /* ignore */ }
    throw new Error(`RAG ingest failed (${response.status}): ${parsed.error || errText}`);
  }

  return response.json();
}

/**
 * Queries the RAG index with a natural language question.
 * 
 * @param query        The user's question
 * @param docId        Optional: restrict to a specific document
 * @param jurisdiction Optional: filter by jurisdiction metadata
 */
export async function ragQuery(
  query: string,
  docId?: string,
  jurisdiction?: string
): Promise<RagQueryResult> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, docId, jurisdiction }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let parsed: any = {};
    try { parsed = JSON.parse(errText); } catch { /* ignore */ }
    throw new Error(`RAG query failed (${response.status}): ${parsed.error || errText}`);
  }

  return response.json();
}

/**
 * Checks whether a document has been indexed in the RAG system.
 * 
 * @param docId  The document ID to check
 */
export async function getRagStatus(docId: string): Promise<RagStatusResult> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/rag/status?docId=${encodeURIComponent(docId)}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    return { indexed: false, chunkCount: 0, docId };
  }

  return response.json();
}
