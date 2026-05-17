import { auth } from '../lib/firebase';

/**
 * Returns HTTP headers including a Firebase ID token for server-side
 * authentication. All calls to /api/gemini/* must include this header;
 * the server rejects requests without a valid token.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to use AI features.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

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
    mitigatedAt?: string;
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
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/gemini/analyze', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Analyze error:", response.status, errText);
    let parsed: any = {};
    try { parsed = JSON.parse(errText); } catch {}
    throw new Error(`Server error ${response.status}: ${parsed.error || errText}`);
  }

  const analysis = await response.json();
  return { ...analysis, name: file.name };
}

export async function semanticSearch(query: string, context: string): Promise<string> {
  const response = await fetch('/api/gemini/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ query, context })
  });

  if (!response.ok) {
    throw new Error('Failed to perform search via secure backend');
  }

  const data = await response.json();
  return data.text;
}

export interface SuggestedESignField {
  type: 'signature' | 'date';
  x: number;
  y: number;
  label: string;
}

export async function extractHumanReadableText(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/gemini/extract-text', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Extract text error:", response.status, errText);
    let parsed: any = {};
    try { parsed = JSON.parse(errText); } catch {}
    throw new Error(`Server error ${response.status}: ${parsed.error || errText}`);
  }

  const data = await response.json();
  return data.text;
}

export async function suggestESignFields(file: File): Promise<SuggestedESignField[]> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/gemini/suggest-esign', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Suggest fields error:", response.status, errText);
    let parsed: any = {};
    try { parsed = JSON.parse(errText); } catch {}
    throw new Error(`Server error ${response.status}: ${parsed.error || errText}`);
  }

  return response.json();
}

export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ prompt, systemInstruction })
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Generate API Error:", response.status, errorText);
    throw new Error(`Generation failed: ${errorText}`);
  }
  const data = await response.json();
  return data.text;
}

export async function generateJson(prompt: string, schema: any, systemInstruction?: string): Promise<any> {
  const response = await fetch('/api/gemini/generate-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ prompt, schema, systemInstruction })
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('generateJson failed:', response.status, errText);
    let parsed: any = null;
    try { parsed = JSON.parse(errText); } catch {}
    const msg = parsed?.error || errText || `Server returned ${response.status}`;
    throw new Error(`JSON Generation failed: ${msg}`);
  }
  return response.json();
}
