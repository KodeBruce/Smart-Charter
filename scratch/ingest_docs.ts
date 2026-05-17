import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// We must require the chunker (which is TS, so we run this file with tsx)
import { chunkText } from '../src/lib/ragChunker';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  });
}

const db = getFirestore();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY missing");

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-embedding-2' });

async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    console.log(`  - Embedding chunk ${i+1}/${texts.length}...`);
    const result = await model.embedContent(texts[i]);
    embeddings.push(result.embedding.values);
    await new Promise(r => setTimeout(r, 1000));
  }
  return embeddings;
}

const filesToIngest = [
  'Smart Charter AI_ Data Ingestion Implementation Guide.md',
  'Authoritative Legal Data Sources for Smart Charter AI RAG.md'
];

async function run() {
  const userId = 'system'; // Global store
  const docId = 'smart_charter_guides'; // Group them under one docId, or use separate ones

  console.log(`Starting ingestion into global RAG store...`);

  let totalChunks = 0;
  
  for (const filename of filesToIngest) {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }
    
    console.log(`\nProcessing ${filename}...`);
    const rawText = fs.readFileSync(filePath, 'utf8');
    
    // 1. Chunking
    const chunks = chunkText(rawText);
    console.log(`- Generated ${chunks.length} chunks.`);
    
    // 2. Embedding
    console.log(`- Generating embeddings...`);
    const embeddings = await embedTexts(chunks);
    
    // 3. Storing
    const batch = db.batch();
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `sys_${filename.replace(/[^a-zA-Z0-9]/g, '_')}_${i}`;
      const chunkRef = db.collection('rag_chunks').doc(chunkId);
      batch.set(chunkRef, {
        id: chunkId,
        text: chunks[i],
        embedding: embeddings[i],
        metadata: {
          userId,
          docId, // or filename
          chunkIndex: i,
          jurisdiction: 'Global',
          docType: 'Documentation'
        },
        createdAt: new Date().toISOString()
      });
    }
    await batch.commit();
    console.log(`- Successfully saved ${chunks.length} chunks to Firestore.`);
    totalChunks += chunks.length;
  }
  
  console.log(`\n✅ Ingestion complete! Total chunks added to global system: ${totalChunks}`);
}

run().catch(console.error);
