
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
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/gemini/analyze', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error('Failed to analyze contract via secure backend');
  }

  const analysis = await response.json();
  return { ...analysis, name: file.name };
}

export async function semanticSearch(query: string, context: string): Promise<string> {
  const response = await fetch('/api/gemini/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    body: formData
  });

  if (!response.ok) {
    throw new Error('Failed to extract text via secure backend');
  }

  const data = await response.json();
  return data.text;
}

export async function suggestESignFields(file: File): Promise<SuggestedESignField[]> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/gemini/suggest-esign', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error('Failed to suggest fields via secure backend');
  }

  return response.json();
}

export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, systemInstruction })
  });
  if (!response.ok) throw new Error('Generation failed');
  const data = await response.json();
  return data.text;
}

export async function generateJson(prompt: string, schema: any, systemInstruction?: string): Promise<any> {
  const response = await fetch('/api/gemini/generate-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, schema, systemInstruction })
  });
  if (!response.ok) throw new Error('JSON Generation failed');
  return response.json();
}
