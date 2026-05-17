import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import OpenAI from "openai";
import multer from "multer";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import officeparser from 'officeparser';

// ---------------------------------------------------------------------------
// Firebase Admin SDK — used server-side only for ID token verification.
// When deployed on Google Cloud / AI Studio, credentials are auto-injected
// via Application Default Credentials (ADC).
// For local dev, run: gcloud auth application-default login
// OR set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
// ---------------------------------------------------------------------------
let adminApp: App;
if (getApps().length === 0) {
  adminApp = initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  });
} else {
  adminApp = getApps()[0];
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


async function startServer() {
  const app = express();
  const PORT = 3000;
  
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

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      
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
        model: "gemini-1.5-pro",
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

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      
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

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      
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
        model: "gemini-1.5-pro",
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
        model: "gemini-1.5-flash",
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
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

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
      const events = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
      res.json({ items: events, source: headlines.length > 0 ? 'live' : 'ai-generated' });
    } catch (error) {
      console.error("News API error:", error);
      res.status(500).json({ error: "Failed to fetch intelligence feed" });
    }
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
