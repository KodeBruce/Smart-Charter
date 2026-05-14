import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import multer from "multer";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Use memory storage for uploaded files so they are never persisted on disk
  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.post("/api/gemini/analyze", upload.single('file'), async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      const genAI = new GoogleGenerativeAI(apiKey);
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const content = {
        inlineData: {
          data: file.buffer.toString('base64'),
          mimeType: file.mimetype
        }
      };

      const prompt = "Analyze the following contractual document and extract key information in the specified JSON format. For 'missingProtections', provide a proactive title, a specific suggestion on how to remediate it, and a relevant legal reference or standard.";

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, content] }],
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
            required: ['name', 'counterparty', 'riskLevel', 'riskScore', 'summary', 'keyClauses', 'directive', 'jurisdiction', 'governingLaw', 'terminationNotice', 'keyObligations', 'missingProtections', 'parties', 'signatories']
          }
        }
      });

      res.json(JSON.parse(result.response.text()));
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
        model: "gemini-1.5-flash",
        systemInstruction: "You are a legal analyst. Provide concise, accurate answers based only on the provided context. If the answer is not in the context, say so."
      });

      const result = await model.generateContent(`Based on the following contract context, answer the query: "${query}"\n\nContext:\n${context}`);
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

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const content = {
        inlineData: {
          data: file.buffer.toString('base64'),
          mimeType: file.mimetype
        }
      };

      const result = await model.generateContent([
        { text: "Extract all the human-readable text from this document. Maintain the structural layout (paragraphs, headers) where possible. Do NOT include any binary data, metadata, or computer code. Just the plain text for a human to read." },
        content
      ]);

      res.json({ text: result.response.text() });
    } catch (error) {
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

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const content = {
        inlineData: {
          data: file.buffer.toString('base64'),
          mimeType: file.mimetype
        }
      };

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: "Analyze this document and identify where signatures and dates should be placed. Return a list of fields with their type, relative coordinates (x, y from 0-100), and a label. Focus on the signature area at the end of the document." }, content] }],
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
      });

      res.json(JSON.parse(result.response.text()));
    } catch (error) {
      res.status(500).json({ error: "Field suggestion failed" });
    }
  });

  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, systemInstruction } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: systemInstruction || "You are a legal assistant."
      });

      const result = await model.generateContent(prompt);
      res.json({ text: result.response.text() });
    } catch (error) {
      console.error("Generation error:", error);
      res.status(500).json({ error: "Generation failed" });
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

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      res.json(JSON.parse(result.response.text()));
    } catch (error) {
      console.error("JSON Generation error:", error);
      res.status(500).json({ error: "JSON Generation failed" });
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
