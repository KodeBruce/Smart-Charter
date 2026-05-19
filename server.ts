import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import express from "express";
import path from "path";

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import OpenAI from "openai";
import multer from "multer";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import officeparser from 'officeparser';
import { chunkText } from './src/lib/ragChunker.js';
import { getContractOwnerId } from './src/lib/contracts.js';
import { computeImpactedContractCount } from './src/lib/sentinelImpact.js';

// ---------------------------------------------------------------------------
// Firebase Admin SDK — used server-side only for ID token verification.
// When deployed on Google Cloud / AI Studio, credentials are auto-injected
// via Application Default Credentials (ADC).
// For local dev, run: gcloud auth application-default login
// OR set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
// ---------------------------------------------------------------------------
let adminApp: App;
if (getApps().length === 0) {
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credentialObj;
  
  if (serviceAccountEnv) {
    try {
      const parsed = serviceAccountEnv.trim().startsWith('{') 
        ? JSON.parse(serviceAccountEnv) 
        : JSON.parse(Buffer.from(serviceAccountEnv, 'base64').toString('utf8'));
      credentialObj = cert(parsed);
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e);
    }
  }

  try { adminApp = initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
    ...(credentialObj ? { credential: credentialObj } : {})
  }); } catch(err) { console.error('Firebase Init Error:', err); }
} else {
  adminApp = getApps()[0];
}

// ---------------------------------------------------------------------------
// RAG System — Pure in-memory vector store with Firestore persistence.
//
// Architecture:
//   - One Map<chunkId, RagChunkCached> per user stored in ragStore.
//   - Chunks are embedded via Gemini text-embedding-004 (free tier: 1500 req/day).
//   - Embeddings + metadata + text are written to Firestore for durability.
//   - On first query, if in-memory store is empty, it is rebuilt from Firestore.
//   - Cosine similarity computed in-process over top-K chunks.
// ---------------------------------------------------------------------------

interface RagChunkCached {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    docId: string;
    userId: string;
    chunkIndex: number;
    jurisdiction?: string;
    docType?: string;
  };
}

// ragStore: userId → Map<chunkId, RagChunkCached>
const ragStore = new Map<string, Map<string, RagChunkCached>>();

const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '6', 10);

function getUserStore(userId: string): Map<string, RagChunkCached> {
  if (!ragStore.has(userId)) {
    ragStore.set(userId, new Map());
  }
  return ragStore.get(userId)!;
}

async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-2' });

  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    const result = await model.embedContent(texts[i]);
    embeddings.push(result.embedding.values);
    // 1 second delay to prevent 429 Too Many Requests on free tier
    await new Promise(r => setTimeout(r, 1000));
  }

  return embeddings;
}

/**
 * Computes cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Rebuilds the in-memory RAG store for a user from Firestore.
 * Called on first query if the store is empty (e.g. after server restart).
 */
async function rebuildRagStoreForUser(userId: string): Promise<void> {
  try {
    const db = getDb();
    const chunksSnap = await db
      .collection('rag_chunks')
      .where('metadata.userId', '==', userId)
      .get();

    if (chunksSnap.empty) return;

    const store = getUserStore(userId);
    for (const docSnap of chunksSnap.docs) {
      const chunk = docSnap.data() as RagChunkCached;
      store.set(chunk.id, chunk);
    }
    console.log(`[RAG] Rebuilt in-memory store for user ${userId} with ${chunksSnap.size} chunks.`);
  } catch (err) {
    console.error('[RAG] Failed to rebuild store from Firestore:', err);
  }
}

// ---------------------------------------------------------------------------
// Nvidia NIM (OpenAI-compatible) Client Initialization
// ---------------------------------------------------------------------------
const nvidiaApiKey = process.env.NVIDIA_API_KEY;
let openai: OpenAI | null = null;
if (nvidiaApiKey) {
  openai = new OpenAI({
    apiKey: nvidiaApiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });
}

/**
 * Express middleware that validates a Firebase ID token from the
 * Authorization: Bearer <token> header. Rejects unauthenticated requests
 * before they can consume Gemini API quota.
 */
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: missing Bearer token" });
    return;
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    await getAdminAuth(adminApp).verifyIdToken(idToken);
    next();
  } catch {
    res.status(403).json({ error: "Forbidden: invalid or expired token" });
  }
}

async function createSpeechmaticsRealtimeToken(apiKey: string) {
  const response = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl: 300 }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Speechmatics token creation failed (${response.status})`);
  }

  return response.json();
}

/**
 * Wraps a Gemini API call with automatic retry on 429 (Too Many Requests).
 * If Gemini fails after all retries (or hits a 500/503), it automatically falls back
 * to the Nvidia NIM API if configured.
 */
async function geminiWithRetry<T>(
  geminiFn: () => Promise<T>, 
  fallbackPrompt?: string, 
  fallbackSystemInstruction?: string,
  fallbackIsJson: boolean = false,
  maxAttempts = 3
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await geminiFn();
    } catch (err: any) {
      lastError = err;
      if (err?.status === 429) {
        let delayMs = 15000;
        try {
          const retryInfo = err?.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'));
          if (retryInfo?.retryDelay) {
            const seconds = parseInt(retryInfo.retryDelay.replace('s', ''), 10);
            if (!isNaN(seconds)) delayMs = (seconds + 2) * 1000;
          }
        } catch { /* use default */ }
        if (attempt < maxAttempts) {
          console.log(`[Gemini] Rate limited. Retrying in ${delayMs / 1000}s (attempt ${attempt}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }
      break; // Exit loop on non-429 or if max attempts reached
    }
  }

  // Fallback Logic
  if (openai && fallbackPrompt) {
    console.log(`[Fallback] Gemini failed (${lastError?.status || lastError?.message || 'Unknown'}). Switching to Nvidia NIM...`);
    try {
      const completion = await openai.chat.completions.create({
        model: "google/gemma-3n-e4b-it",
        messages: [
          { role: "system", content: fallbackSystemInstruction || "You are a helpful legal AI assistant." },
          { role: "user", content: fallbackPrompt }
        ],
        temperature: 0.20,
        top_p: 0.70,
        frequency_penalty: 0.00,
        presence_penalty: 0.00,
        max_tokens: 4096, // Kept high to prevent incomplete JSON schema responses
        ...(fallbackIsJson && { response_format: { type: 'json_object' } })
      });
      
      const content = completion.choices[0]?.message?.content || "";
      // Mock the Gemini response structure so the caller doesn't have to change
      return {
        response: {
          text: () => content
        }
      } as unknown as T;
    } catch (nvidiaErr: any) {
      console.error("[Fallback] Nvidia API also failed:", nvidiaErr?.message || nvidiaErr);
      throw nvidiaErr;
    }
  }

  throw lastError;
}


const app = express();
app.get('/api/health', (req,res)=>res.json({status:'ok'}));
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.post('/api/speechmatics/realtime-token', requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.SPEECHMATICS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'SPEECHMATICS_API_KEY not configured' });
      }

      const tempToken = await createSpeechmaticsRealtimeToken(apiKey);
      res.json({
        token: tempToken.key_value,
        region: process.env.SPEECHMATICS_REGION || 'eu',
      });
    } catch (error) {
      console.error('Speechmatics token error:', error);
      res.status(500).json({ error: 'Failed to create Speechmatics realtime token' });
    }
  });
  
  // Use memory storage for uploaded files so they are never persisted on disk
  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json({ limit: '10mb' }));

  // Helper function for robust text extraction
async function extractDocumentText(file: Express.Multer.File): Promise<string> {
  const originalExt = file.originalname.includes('.') ? file.originalname.split('.').pop()?.toLowerCase() || '' : '';
  
  if (originalExt === 'txt' || file.mimetype.includes('text/plain')) {
    return file.buffer.toString('utf-8');
  }

  const validExts = ['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'pdf', 'rtf', 'md', 'html', 'csv'];
  const safeExt = validExts.includes(originalExt) ? originalExt : undefined;
  
  try {
    const parsed = await officeparser.parseOffice(file.buffer, safeExt ? { fileType: safeExt as any } : undefined);
    return parsed.toText();
  } catch (error) {
    console.error("[Document Parser Error]:", error);
    // If officeparser fails completely, attempt to return a basic string representation
    // or let the AI try to parse it via inlineData natively if it's a PDF.
    throw new Error(`Unsupported document format or corrupted file. Extension detected: ${originalExt}`);
  }
}

// ---------------------------------------------------------------------------
  // Auth guard — applied to ALL /api/gemini/* routes.
  // Requests without a valid Firebase ID token are rejected before any
  // AI processing or quota consumption occurs.
  // ---------------------------------------------------------------------------
  app.use("/api/gemini", requireAuth);

  // API Routes
  app.post("/api/gemini/analyze", upload.single('file'), async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      const genAI = new GoogleGenerativeAI(apiKey);
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      
      // Extract text from buffer using robust helper
      const extractedText = await extractDocumentText(file);

      const prompt = `Analyze the following contractual document and extract key information in the specified JSON format. 
      
      RECONSTRUCTION REQUIREMENT: 
      In the 'rawText' field, you MUST reconstruct the full, original contract text using high-fidelity Markdown. 
      - Preserve all structural elements: clear headings (using #, ##, ###), bulleted/numbered lists, and bold text for emphasized terms.
      - Ensure the layout matches the original document's flow as closely as possible.
      - The text MUST be professional and suitable for legal review.

      ANALYSIS REQUIREMENT:
      - Your analysis, suggestions, and risk assessments MUST be grounded in real-world international legal standards (UK, USA, RSA, EU). 
      - ZERO-CLICK RISK EVALUATION: You MUST evaluate this contract against 20 standard legal risk vectors:
        1. Liability Caps, 2. Mutual Indemnification, 3. Auto-Renewals, 4. Intellectual Property, 5. Governing Law & Jurisdiction, 
        6. Termination Notice, 7. Liquidated Damages, 8. GDPR & Data Protection, 9. Force Majeure, 10. Confidentiality, 
        11. Assignment Rights, 12. Warranties & Disclaimers, 13. Subcontracting Rights, 14. Audit Rights, 15. Restrictive Covenants, 
        16. Dispute Resolution, 17. Change of Control, 18. Payment Terms, 19. Amendment Provisions, and 20. Survival Provisions.
      - Based on these 20 vectors, assign a 'riskScore' from 0 (completely safe/compliant) to 100 (critical threat overall), and choose 'riskLevel' ('Low Risk' | 'Medium Risk' | 'High Risk').
      - For 'value', 'expiry', and 'jurisdiction', provide ULTRA-CONCISE summaries (maximum 3-5 words).
      - For 'missingProtections', provide a proactive title, remediation suggestion, and legal reference.`;

      const expectedSchema = {
        name: "Document Name",
        counterparty: "Counterparty Name",
        value: "Value summary",
        expiry: "Expiry summary",
        riskLevel: "Low Risk | Medium Risk | High Risk",
        riskScore: "Number between 0 and 100",
        summary: "Executive summary",
        jurisdiction: "Jurisdiction",
        governingLaw: "Governing Law",
        terminationNotice: "Notice period",
        rawText: "FULL CONTRACT TEXT IN HIGH-FIDELITY MARKDOWN",
        keyObligations: ["Obligation 1", "Obligation 2"],
        missingProtections: [{ title: "Title", suggestion: "Remediation", reference: "Legal Ref" }],
        parties: [{ name: "Name", role: "Role", entityType: "Type", status: "Verified | Unverified" }],
        signatories: [{ name: "Name", title: "Title", party: "Party" }],
        keyClauses: [{ title: "Clause Title", content: "Clause Content", priority: "Critical | Standard | Low", implications: "Impact", risk: "Risk description", citation: "Reference" }],
        directive: "AI recommendation"
      };

      const promptText = `${prompt}\n\nYou MUST return your response as a valid JSON object strictly adhering to this structure:\n${JSON.stringify(expectedSchema, null, 2)}\n\nDocument Content:\n${extractedText}`;
      const result = await geminiWithRetry(
        () => model.generateContent({
          contents: [{ 
            role: 'user', 
            parts: [{ text: promptText }] 
          }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              name: { type: SchemaType.STRING },
              counterparty: { type: SchemaType.STRING },
              value: { type: SchemaType.STRING },
              expiry: { type: SchemaType.STRING },
              riskLevel: { type: SchemaType.STRING, enum: ['Low Risk', 'Medium Risk', 'High Risk'], format: "enum" },
              riskScore: { type: SchemaType.NUMBER },
              summary: { type: SchemaType.STRING },
              jurisdiction: { type: SchemaType.STRING },
              governingLaw: { type: SchemaType.STRING },
              terminationNotice: { type: SchemaType.STRING },
              rawText: { type: SchemaType.STRING },
              keyObligations: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              missingProtections: { 
                type: SchemaType.ARRAY, 
                items: { 
                  type: SchemaType.OBJECT,
                  properties: {
                    title: { type: SchemaType.STRING },
                    suggestion: { type: SchemaType.STRING },
                    reference: { type: SchemaType.STRING }
                  },
                  required: ['title', 'suggestion', 'reference']
                } 
              },
              parties: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    role: { type: SchemaType.STRING },
                    entityType: { type: SchemaType.STRING },
                    status: { type: SchemaType.STRING, enum: ['Verified', 'Unverified', 'Unknown'], format: "enum" }
                  },
                  required: ['name', 'role', 'entityType', 'status']
                }
              },
              signatories: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    title: { type: SchemaType.STRING },
                    party: { type: SchemaType.STRING }
                  },
                  required: ['name', 'title', 'party']
                }
              },
              keyClauses: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    title: { type: SchemaType.STRING },
                    content: { type: SchemaType.STRING },
                    priority: { type: SchemaType.STRING, enum: ['Critical', 'Standard', 'Low'], format: "enum" },
                    implications: { type: SchemaType.STRING },
                    risk: { type: SchemaType.STRING },
                    citation: { type: SchemaType.STRING }
                  }
                }
              },
              directive: { type: SchemaType.STRING }
            },
            required: ['name', 'counterparty', 'riskLevel', 'riskScore', 'summary', 'keyClauses', 'directive', 'jurisdiction', 'governingLaw', 'terminationNotice', 'keyObligations', 'missingProtections', 'parties', 'signatories', 'rawText']
          }
        }
        }),
        promptText,
        "You are an expert legal AI assistant. Output valid JSON matching the schema.",
        true
      );

      let rawResponseText = result.response.text();
      // Strip markdown code blocks if the model wrapped the JSON
      if (rawResponseText.startsWith('```')) {
        rawResponseText = rawResponseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }
      const analysisResult = JSON.parse(rawResponseText);
      res.json(analysisResult);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze contract" });
    }
  });

  app.post("/api/gemini/search", async (req, res) => {
    try {
      const { query, context } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-pro",
        systemInstruction: "You are a legal analyst. Provide concise, accurate answers based only on the provided context. If the answer is not in the context, say so."
      });

      const promptText = `Based on the following contract context, answer the query: "${query}"\n\nContext:\n${context}`;
      const result = await geminiWithRetry(
        () => model.generateContent(promptText),
        promptText,
        "You are a legal analyst. Provide concise, accurate answers based only on the provided context. If the answer is not in the context, say so.",
        false
      );
      res.json({ text: result.response.text() });
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.post("/api/gemini/extract-text", upload.single('file'), async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      const genAI = new GoogleGenerativeAI(apiKey);
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      
      // Extract text from buffer using robust helper
      const extractedText = await extractDocumentText(file);

      const promptText = "Extract all the human-readable text from this document. Maintain the structural layout (paragraphs, headers) where possible. Do NOT include any binary data, metadata, or computer code. Just the plain text for a human to read.\n\n" + extractedText;
      const result = await geminiWithRetry(
        () => model.generateContent([
          { text: "Extract all the human-readable text from this document. Maintain the structural layout (paragraphs, headers) where possible. Do NOT include any binary data, metadata, or computer code. Just the plain text for a human to read." },
          { text: extractedText }
        ]),
        promptText,
        "You are a helpful data extraction assistant.",
        false
      );

      res.json({ text: result.response.text() });
    } catch (error) {
      console.error("Extraction API Error:", error);
      res.status(500).json({ error: "Extraction failed" });
    }
  });

  app.post("/api/gemini/suggest-esign", upload.single('file'), async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      const genAI = new GoogleGenerativeAI(apiKey);
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      
      // Extract text from buffer using robust helper
      const extractedText = await extractDocumentText(file);

      const result = await geminiWithRetry(() => model.generateContent({
        contents: [{ 
          role: 'user', 
          parts: [{ 
            text: `Analyze this document and identify where signatures and dates should be placed. Return a list of fields with their type, relative coordinates (x, y from 0-100), and a label. Focus on the signature area at the end of the document.\n\nDocument Content:\n${extractedText}` 
          }] 
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                type: { type: SchemaType.STRING, enum: ['signature', 'date'], format: "enum" },
                x: { type: SchemaType.NUMBER },
                y: { type: SchemaType.NUMBER },
                label: { type: SchemaType.STRING }
              },
              required: ['type', 'x', 'y', 'label']
            }
          }
        }
        }),
        `Analyze this document and identify where signatures and dates should be placed. Return a list of fields with their type, relative coordinates (x, y from 0-100), and a label. Focus on the signature area at the end of the document.\n\nDocument Content:\n${extractedText}`,
        "You are a helpful legal document assistant. Output valid JSON matching the schema.",
        true
      );

      res.json(JSON.parse(result.response.text()));
      } catch (error) {
      console.error("Field Suggestion API Error:", error);
      res.status(500).json({ error: "Field suggestion failed" });
    }
  });


  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, systemInstruction } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      if (!prompt) return res.status(400).json({ error: "prompt is required" });

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-pro",
        systemInstruction: systemInstruction || "You are a professional legal AI assistant. Be concise, accurate, and insightful."
      });

      const result = await geminiWithRetry(
        () => model.generateContent(prompt),
        prompt,
        systemInstruction || "You are a professional legal AI assistant. Be concise, accurate, and insightful.",
        false
      );
      const text = result.response.text();
      res.json({ text });
    } catch (error: any) {
      const message = error?.message || String(error);
      console.error("Generation error:", message);
      res.status(500).json({ error: `Generation failed: ${message}` });
    }
  });

  app.post("/api/gemini/generate-json", async (req, res) => {
    try {
      const { prompt, schema, systemInstruction } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: systemInstruction || "You are a legal assistant."
      });

      const result = await geminiWithRetry(() => model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
        }),
        prompt,
        systemInstruction || "You are a legal assistant. Output valid JSON.",
        true
      );

      res.json(JSON.parse(result.response.text()));
    } catch (error: any) {
      console.error("JSON Generation error:", error);
      const msg = error?.message || String(error) || 'JSON Generation failed';
      // Include the underlying message to help client-side debugging (safe since requests are authenticated)
      res.status(500).json({ error: `JSON Generation failed: ${msg}` });
    }
  });

  // Phase 5: Smart Model Router
  function routeModel(queryOrPrompt: string): string {
    const len = queryOrPrompt.trim().length;
    if (len < 200) {
      console.log(`[Model Router] Short query (${len} chars) → gemini-2.0-flash`);
      return 'gemini-2.0-flash';
    }
    console.log(`[Model Router] Deep query (${len} chars) → gemini-2.5-pro`);
    return 'gemini-2.5-pro';
  }

  // Phase 5: Smart Workspace Starters
  app.post('/api/gemini/starters', requireAuth, async (req, res) => {
    try {
      const { documentName, documentType, summary } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

      const genAI = new GoogleGenerativeAI(apiKey);
      // Always use flash for starters — fast and cheap
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: 'You are a senior legal analyst. Generate smart, high-value questions that a lawyer would ask about this specific document type.'
      });

      const prompt = `Document: "${documentName}"
Type: ${documentType || 'Legal Agreement'}
Summary: ${summary || 'Not available'}

Generate exactly 4 high-value legal questions a professional should ask about this specific document. Each question should:
- Be specific to this document type (not generic)
- Target a potential legal risk or missing protection
- Be answerable from the document content
- Be concise (max 12 words)

Return a JSON array of 4 strings.`;

      const result = await geminiWithRetry(
        () => model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }
            }
          }
        }),
        prompt,
        'You are a senior legal analyst. Return valid JSON.',
        true
      );

      const starters = JSON.parse(result.response.text());
      res.json({ starters: Array.isArray(starters) ? starters.slice(0, 4) : [] });
    } catch (error) {
      console.error('[Starters API Error]:', error);
      res.status(500).json({ error: 'Failed to generate starters' });
    }
  });

  // Real News Intelligence Feed — Jurisdictional Sentinel
  app.get("/api/news/legal", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      // Fetch real legal/regulatory headlines from Google News RSS via a no-auth JSON proxy
      const topics = ['legal regulation law', 'GDPR compliance 2026', 'data protection law', 'corporate governance regulation'];
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const rssUrl = encodeURIComponent(`https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en&gl=US&ceid=US:en`);
      
      let headlines: string[] = [];
      try {
        const rssResp = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=8`);
        const rssData = await rssResp.json();
        if (rssData.items && rssData.items.length > 0) {
          headlines = rssData.items.map((item: any) => item.title).slice(0, 6);
        }
      } catch (rssErr) {
        // Fall back to a direct Reuters RSS
        try {
          const altResp = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://feeds.reuters.com/reuters/businessNews')}&count=8`);
          const altData = await altResp.json();
          if (altData.items) headlines = altData.items.map((i: any) => i.title).slice(0, 6);
        } catch { /* if both fail, use AI-generated */ }
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

      const prompt = headlines.length > 0
        ? `Parse these REAL news headlines into legal intelligence events for a contract management platform. For each headline, identify the most relevant jurisdiction (e.g. "EU / Brussels", "USA / Washington D.C.", "UK / London", "RSA / Johannesburg"), extract a concise event description (max 10 words), rate the impact on business contracts (Low/Medium/High), and assign a Sentinel agent name (e.g. "Sentinel-Alpha").
Headlines:
${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}
Return a JSON array of objects with keys: jurisdiction, event, impact, agent`
        : `Generate 5 realistic real-world legal/regulatory events happening in 2026 across EU, USA, UK, RSA jurisdictions that would affect business contracts. Return a JSON array with: jurisdiction, event, impact (Low/Medium/High), agent (Sentinel-Alpha/Beta/Gamma/Delta)`;

      const result = await geminiWithRetry(
        () => model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        }),
        prompt,
        "You are a legal AI assistant.",
        true
      );

      const parsed = JSON.parse(result.response.text());
      let events = Array.isArray(parsed) ? parsed.slice(0, 5) : [];

      // Phase 3: Proactive Regulatory Monitoring (Sentinel Autonomous RAG Check)
      try {
        const authHeader = req.headers.authorization;
        if (authHeader) {
          const idToken = authHeader.split('Bearer ')[1];
          const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
          const userId = decodedToken.uid;
          const userStore = getUserStore(userId);
          
          if (userStore.size > 0 && events.length > 0) {
            const eventTexts = events.map((e: any) => e.event);
            const eventEmbeddings = await embedTexts(eventTexts, apiKey);
            
            events = events.map((event: any, i: number) => {
              const embedding = eventEmbeddings[i];
              return {
                ...event,
                impactedContracts: computeImpactedContractCount(embedding, userStore.values())
              };
            });
          }
        }
      } catch (err) {
        console.error("Sentinel Autonomous RAG failed:", err);
      }

      res.json({ items: events, source: headlines.length > 0 ? 'live' : 'ai-generated' });
    } catch (error) {
      console.error("News API error:", error);
      res.status(500).json({ error: "Failed to fetch intelligence feed" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RAG API Routes
  // ─────────────────────────────────────────────────────────────────────────
  
  // TEMPORARY GLOBAL INGESTION ROUTE (No Auth Required)
  app.get('/api/rag/ingest-global', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const filesToIngest = [
        'Smart Charter AI_ Data Ingestion Implementation Guide.md',
        'Authoritative Legal Data Sources for Smart Charter AI RAG.md'
      ];
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

      let totalChunks = 0;
      const userStore = getUserStore('system');

      for (const filename of filesToIngest) {
        const filePath = path.join(process.cwd(), filename);
        if (!fs.existsSync(filePath)) continue;
        
        const rawText = fs.readFileSync(filePath, 'utf8');
        const chunks = chunkText(rawText);
        const embeddings = await embedTexts(chunks, apiKey);

        for (let i = 0; i < chunks.length; i++) {
          const chunkId = `sys_${filename.replace(/[^a-zA-Z0-9]/g, '_')}_${i}`;
          const chunkData = {
            id: chunkId,
            text: chunks[i],
            embedding: embeddings[i],
            metadata: {
              userId: 'system',
              docId: 'smart_charter_guides',
              chunkIndex: i,
              jurisdiction: 'Global',
              docType: 'Documentation'
            }
          };
          
          userStore.set(chunkId, chunkData as any);
        }
        totalChunks += chunks.length;
      }
      res.json({ success: true, totalChunks });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/rag', requireAuth);

  /**
   * POST /api/rag/ingest
   * 
   * Accepts a document file + metadata, chunks it, embeds each chunk
   * using Gemini text-embedding-004, and stores in-memory + Firestore.
   * 
   * Body (multipart/form-data):
   *   file         - The document file
   *   docId        - Firestore contract document ID
   *   jurisdiction - Optional: 'UK' | 'USA' | 'EU' | 'RSA' | etc.
   *   docType      - Optional: 'NDA' | 'SLA' | etc.
   */
  app.post('/api/rag/ingest', upload.single('file'), async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const docId = req.body.docId as string;
      if (!docId) return res.status(400).json({ error: 'docId is required' });

      // Get userId from the verified token
      const authHeader = req.headers.authorization!;
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const jurisdiction = (req.body.jurisdiction as string) || undefined;
      const docType = (req.body.docType as string) || undefined;

      console.log(`[RAG] Ingesting document ${docId} for user ${userId}...`);

      // 1. Extract text from the uploaded file
      const rawText = await extractDocumentText(file);
      if (!rawText || rawText.trim().length < 50) {
        return res.status(422).json({ error: 'Document text extraction yielded insufficient content' });
      }

      // 2. Semantic chunking
      const chunks = chunkText(rawText);
      if (chunks.length === 0) {
        return res.status(422).json({ error: 'Document could not be chunked' });
      }
      console.log(`[RAG] Generated ${chunks.length} chunks for ${docId}`);

      // 3. Generate embeddings via Gemini text-embedding-004
      const embeddings = await embedTexts(chunks, apiKey);
      console.log(`[RAG] Generated ${embeddings.length} embeddings for ${docId}`);

      // 4. Build chunk objects
      const ragChunks: RagChunkCached[] = chunks.map((text, i) => ({
        id: `${docId}_chunk_${i}`,
        text,
        embedding: embeddings[i],
        metadata: { docId, userId, chunkIndex: i, jurisdiction, docType },
      }));

      // 5. Remove old chunks for this docId from in-memory store
      const userStore = getUserStore(userId);
      for (const [key] of userStore) {
        if (key.startsWith(`${docId}_chunk_`)) userStore.delete(key);
      }

      // 6. Upsert into in-memory store
      for (const chunk of ragChunks) {
        userStore.set(chunk.id, chunk);
      }

      // 7. Persist to Firestore (delete old, write new)
      const db = getDb();
      const oldChunks = await db
        .collection('rag_chunks')
        .where('metadata.docId', '==', docId)
        .where('metadata.userId', '==', userId)
        .get();
      const deleteBatch = db.batch();
      oldChunks.forEach(d => deleteBatch.delete(d.ref));
      await deleteBatch.commit();

      const writeBatch = db.batch();
      for (const chunk of ragChunks) {
        writeBatch.set(db.collection('rag_chunks').doc(chunk.id), {
          id: chunk.id,
          text: chunk.text,
          embedding: chunk.embedding,
          metadata: chunk.metadata,
          createdAt: new Date().toISOString(),
        });
      }
      await writeBatch.commit();

      console.log(`[RAG] Successfully indexed ${ragChunks.length} chunks for ${docId}`);
      res.json({ success: true, chunkCount: ragChunks.length, docId });
    } catch (error: any) {
      console.error('[RAG Ingest Error]:', error?.message || error);
      res.status(500).json({ error: `RAG ingest failed: ${error?.message || 'Unknown error'}` });
    }
  });

  /**
   * POST /api/rag/query
   * 
   * Retrieves the top-K most relevant chunks for a query and grounds
   * Gemini on those chunks to produce a cited, accurate answer.
   * 
   * Body (JSON):
   *   query        - The user's natural language question
   *   docId        - Optional: restrict to a specific document
   *   jurisdiction - Optional: metadata filter
   */
  app.post('/api/rag/query', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

      const { query, docId, jurisdiction } = req.body;
      if (!query || !query.trim()) return res.status(400).json({ error: 'query is required' });

      // Get userId from the verified token
      const authHeader = req.headers.authorization!;
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      const userId = decodedToken.uid;

      // Rebuild from Firestore if the in-memory store is empty (server restart)
      const userStore = getUserStore(userId);
      if (userStore.size === 0) {
        console.log(`[RAG] Store empty for user ${userId}, rebuilding from Firestore...`);
        await rebuildRagStoreForUser(userId);
      }

      // Also ensure the 'system' global store is loaded
      const systemStore = getUserStore('system');
      if (systemStore.size === 0) {
        console.log(`[RAG] Store empty for system, rebuilding from Firestore...`);
        await rebuildRagStoreForUser('system');
      }

      // Combine user's personal chunks and global system chunks
      const allChunks = [...Array.from(userStore.values()), ...Array.from(systemStore.values())];

      // Filter chunks by docId and/or jurisdiction
      const candidates = allChunks.filter(chunk => {
        if (docId && chunk.metadata.docId !== docId) return false;
        if (jurisdiction && chunk.metadata.jurisdiction && chunk.metadata.jurisdiction !== jurisdiction) return false;
        return true;
      });

      if (candidates.length === 0) {
        // No RAG index available — fall back to basic Gemini answer
        console.log(`[RAG] No indexed chunks for user ${userId}${docId ? ` / doc ${docId}` : ''}, using fallback.`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await geminiWithRetry(
          () => model.generateContent(
            `You are a legal AI assistant. Answer this question concisely: ${query}\n\nNote: This document has not been indexed yet for RAG retrieval. Provide a general legal answer.`
          ),
          query,
          'You are a legal AI assistant.',
          false
        );
        return res.json({
          answer: result.response.text(),
          sources: [],
          model: 'fallback',
          indexed: false,
          auditTrail: {
            systemPrompt: "You are a legal AI assistant.",
            exactUserPrompt: `You are a legal AI assistant. Answer this question concisely: ${query}\n\nNote: This document has not been indexed yet for RAG retrieval. Provide a general legal answer.`,
            retrievedChunks: [],
            timestamp: new Date().toISOString()
          }
        });
      }

      // 1. Embed the query
      const [queryEmbedding] = await embedTexts([query], apiKey);

      // 2. Score all candidate chunks via cosine similarity
      const scored = candidates.map(chunk => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }));

      // 3. Sort descending and take top-K
      scored.sort((a, b) => b.score - a.score);
      const topK = scored.slice(0, RAG_TOP_K);

      // 4. Build grounded context string
      const contextBlocks = topK.map((s, i) =>
        `[Excerpt ${i + 1} (relevance: ${(s.score * 100).toFixed(1)}%)]:\n${s.chunk.text}`
      ).join('\n\n---\n\n');

      // 5. Grounded Gemini generation with anti-hallucination guardrails
      const systemInstruction = `You are an expert legal AI assistant with deep knowledge of contract law across multiple jurisdictions (UK, USA, EU, RSA).

You MUST follow these rules:
1. Answer ONLY based on the provided legal document excerpts.
2. If the answer is not clearly supported by the excerpts, say: "The document does not contain sufficient information to answer this question confidently."
3. Always cite which excerpt(s) your answer is based on (e.g., "[Excerpt 2]").
4. Be concise and professional.
5. NEVER fabricate information not present in the excerpts.`;

      const prompt = `LEGAL DOCUMENT EXCERPTS (Retrieved via semantic search):

${contextBlocks}

---

QUESTION: ${query}

Provide a precise, cited answer based ONLY on the excerpts above.`;

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction,
      });

      const result = await geminiWithRetry(
        () => model.generateContent(prompt),
        prompt,
        systemInstruction,
        false
      );

      const sources = topK.map(s => ({
        chunkId: s.chunk.id,
        text: s.chunk.text.length > 300 ? s.chunk.text.substring(0, 297) + '...' : s.chunk.text,
        score: parseFloat((s.score * 100).toFixed(1)),
        chunkIndex: s.chunk.metadata.chunkIndex,
      }));

      res.json({
        answer: result.response.text(),
        sources,
        model: 'rag',
        indexed: true,
        auditTrail: {
          systemPrompt: systemInstruction,
          exactUserPrompt: prompt,
          retrievedChunks: topK.map((s, i) => ({
            index: i + 1,
            text: s.chunk.text,
            score: parseFloat((s.score * 100).toFixed(1)),
            docId: s.chunk.metadata.docId,
            chunkIndex: s.chunk.metadata.chunkIndex
          })),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('[RAG Query Error]:', error?.message || error);
      res.status(500).json({ error: `RAG query failed: ${error?.message || 'Unknown error'}` });
    }
  });

  /**
   * GET /api/rag/status?docId=...
   * 
   * Returns whether a document has been indexed and how many chunks exist.
   */
  app.get('/api/rag/status', async (req, res) => {
    try {
      const docId = req.query.docId as string;
      if (!docId) return res.status(400).json({ error: 'docId is required' });

      const authHeader = req.headers.authorization!;
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const db = getDb();
      const chunksSnap = await db
        .collection('rag_chunks')
        .where('metadata.docId', '==', docId)
        .where('metadata.userId', '==', userId)
        .get();

      res.json({
        indexed: !chunksSnap.empty,
        chunkCount: chunksSnap.size,
        docId,
      });
    } catch (error: any) {
      console.error('[RAG Status Error]:', error?.message || error);
      res.status(500).json({ error: 'Status check failed' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Playbook-Driven Automated Redlining API
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/api/rag/redline', async (req, res) => {
    try {
      const { docId, playbookId } = req.body;
      if (!docId) return res.status(400).json({ error: 'docId is required' });

      // In a production environment, we would fetch the playbook from Firestore using playbookId
      const defaultPlaybook = `
        Smart Charter Global Playbook:
        1. Governing Law MUST be New York, Delaware, or United Kingdom.
        2. Indemnification must be mutual (both parties indemnify each other).
        3. Liability caps cannot be lower than $1,000,000 or the total fees paid, whichever is higher.
        4. Payment terms must be Net 30 or Net 45. Net 60 is unacceptable.
        5. Data processing agreements (DPA) must comply with GDPR.
      `;

      const authHeader = req.headers.authorization!;
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await getAdminAuth(adminApp).verifyIdToken(idToken);
      const userId = decodedToken.uid;

      // Fetch the raw document text from Firestore
      const db = getDb();
      const docSnap = await db.collection('contracts').doc(docId).get();
      if (!docSnap.exists) return res.status(404).json({ error: 'Document not found' });
      
      const contractData = docSnap.data();
      // Support both current and legacy ownership fields so saved contracts
      // continue to work across older ingestion paths.
      const contractOwnerId = getContractOwnerId(contractData);
      if (contractOwnerId !== userId) return res.status(403).json({ error: 'Forbidden' });

      let rawText = '';
      if (contractData?.content) {
        rawText = contractData.content;
      } else if (contractData?.analysis) {
        if (typeof contractData.analysis === 'string') {
          try {
            const parsed = JSON.parse(contractData.analysis);
            rawText = parsed.rawText || '';
          } catch (e) {
            console.error("Failed to parse analysis string:", e);
          }
        } else {
          rawText = contractData.analysis.rawText || '';
        }
      }
      
      if (!rawText) return res.status(400).json({ error: 'No raw text found for this document.' });

      // Use Gemini to generate redlines
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

      const prompt = `You are an expert autonomous legal AI. You must review the following CONTRACT TEXT against the provided PLAYBOOK rules.
      For any clause in the contract that violates a playbook rule, you must propose an exact redline replacement.
      
      PLAYBOOK:
      ${defaultPlaybook}

      CONTRACT TEXT:
      """
      ${rawText.substring(0, 30000)} // truncate to prevent token limits if extremely long
      """

      Return a JSON array of objects. Each object MUST have:
      - "originalText": The exact original text from the contract that violates the playbook.
      - "proposedText": The redlined/rewritten text that complies with the playbook.
      - "reasoning": A 1-sentence explanation citing the playbook rule.
      - "severity": "High" or "Medium".
      `;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      let redlines = [];
      try {
        redlines = JSON.parse(result.response.text());
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse AI response' });
      }

      res.json({ success: true, redlines });
    } catch (error: any) {
      console.error('[RAG Redline Error]:', error?.message || error);
      res.status(500).json({ error: 'Redline generation failed' });
    }
  });

  // Server Start & Vite Middleware
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    async function startLocalServer() {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
    startLocalServer();
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

export default app;
