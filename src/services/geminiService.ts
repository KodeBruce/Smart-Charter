import { GoogleGenAI, Type } from "@google/genai";

export interface ContractAnalysis {
  name: string;
  counterparty: string;
  value: string;
  expiry: string;
  riskLevel: 'Low Risk' | 'Medium Risk' | 'High Risk';
  riskScore: number;
  summary: string;
  keyClauses: { 
    title: string; 
    content: string; 
    priority: 'Critical' | 'Standard' | 'Low';
    implications?: string;
    risk?: string;
    citation?: string;
  }[];
  directive: string;
  jurisdiction: string;
  governingLaw: string;
  terminationNotice: string;
  keyObligations: string[];
  missingProtections: {
    title: string;
    suggestion: string;
    reference: string;
  }[];
  parties: { name: string; role: string; entityType: string; status: 'Verified' | 'Unverified' | 'Unknown' }[];
  signatories: { name: string; title: string; party: string }[];
  rawText?: string;
}

export async function analyzeContract(file: File): Promise<ContractAnalysis> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const isPdf = file.type === 'application/pdf';
  const isDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'application/msword';
  
  let content: any;
  let rawText = '';

  if (isPdf || isDoc) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    content = {
      inlineData: {
        data: base64,
        mimeType: file.type
      }
    };
    rawText = `[Analysis of ${file.name}]`; 
  } else {
    rawText = await file.text();
    content = rawText;
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: "Analyze the following contractual document and extract key information in the specified JSON format. For 'missingProtections', provide a proactive title, a specific suggestion on how to remediate it, and a relevant legal reference or standard." },
          typeof content === 'string' ? { text: content } : content
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          counterparty: { type: Type.STRING },
          value: { type: Type.STRING },
          expiry: { type: Type.STRING },
          riskLevel: { type: Type.STRING, enum: ['Low Risk', 'Medium Risk', 'High Risk'] },
          riskScore: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          jurisdiction: { type: Type.STRING },
          governingLaw: { type: Type.STRING },
          terminationNotice: { type: Type.STRING },
          keyObligations: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingProtections: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                suggestion: { type: Type.STRING },
                reference: { type: Type.STRING }
              },
              required: ['title', 'suggestion', 'reference']
            } 
          },
          parties: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                entityType: { type: Type.STRING },
                status: { type: Type.STRING, enum: ['Verified', 'Unverified', 'Unknown'] }
              },
              required: ['name', 'role', 'entityType', 'status']
            }
          },
          signatories: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                title: { type: Type.STRING },
                party: { type: Type.STRING }
              },
              required: ['name', 'title', 'party']
            }
          },
          keyClauses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ['Critical', 'Standard', 'Low'] },
                implications: { type: Type.STRING, description: "Detailed breakdown of the legal implications of this clause." },
                risk: { type: Type.STRING, description: "Specific risks associated with this clause." },
                citation: { type: Type.STRING, description: "Legal citations or statutory references relevant to this clause." }
              }
            }
          },
          directive: { type: Type.STRING }
        },
        required: ['name', 'counterparty', 'riskLevel', 'riskScore', 'summary', 'keyClauses', 'directive', 'jurisdiction', 'governingLaw', 'terminationNotice', 'keyObligations', 'missingProtections', 'parties', 'signatories']
      }
    }
  });

  const analysis = JSON.parse(response.text);
  return { ...analysis, name: file.name, rawText: rawText };
}

export async function semanticSearch(query: string, context: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the following contract context, answer the query: "${query}"
    
    Context:
    ${context}`,
    config: {
      systemInstruction: "You are a legal analyst. Provide concise, accurate answers based only on the provided context. If the answer is not in the context, say so."
    }
  });

  return response.text;
}
