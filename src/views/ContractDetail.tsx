import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, Bell, HelpCircle, AlertTriangle, 
  ArrowRight, Info, Gavel, Search, Send, 
  MessageSquare, Sparkles, ChevronRight, User, Users,
  ArrowLeft, Download, Share2, Calendar, Loader2, X,
  Maximize2, Minimize2, Shield, FileText, Globe,
  RefreshCw, Check, AlertCircle, History, Clock,
  ArrowRightCircle, DollarSign, Activity, ChevronDown, Files,
  Volume2, VolumeX
} from 'lucide-react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { semanticSearch, ContractAnalysis, generateJson, generateText } from '../services/geminiService';
import { ragQuery, getRagStatus, RagQueryResult } from '../services/ragService';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRef } from 'react';
import { diffWords } from 'diff';
import { generateRedlineDocx, downloadRedline } from '../lib/redlineExporter';
import LegalEditor, { LegalEditorHandle } from '../components/LegalEditor';


export default function ContractDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const docRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<LegalEditorHandle>(null);
  const [isDownloadingRedline, setIsDownloadingRedline] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searchSources, setSearchSources] = useState<RagQueryResult['sources']>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(!!id);

  // RAG indexing state
  const [ragStatus, setRagStatus] = useState<'idle' | 'indexing' | 'indexed' | 'error'>('idle');
  const [ragChunkCount, setRagChunkCount] = useState(0);

  const initialAnalysis = location.state?.analysis as ContractAnalysis | undefined;

  const [isRemediationOpen, setIsRemediationOpen] = useState(false);
  const [selectedClause, setSelectedClause] = useState<any>(null);
  const [isDocumentFullScreen, setIsDocumentFullScreen] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState<'All' | 'Critical' | 'Standard' | 'Low'>('All');
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isSwappingModalOpen, setIsSwappingModalOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [targetJurisdiction, setTargetJurisdiction] = useState('United Kingdom');
  const [isSwapping, setIsSwapping] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [previousText, setPreviousText] = useState<string | null>(null);

  const [intelligenceModal, setIntelligenceModal] = useState<{ 
    isOpen: boolean, 
    title: string, 
    value: string, 
    findings?: string[],
    explanation: string | null,
    optimizedRawText?: string | null,
    changeSummary?: string | null,
    isGenerating: boolean,
    isApplyingChange?: boolean
  } | null>(null);
  const [showDiffInModal, setShowDiffInModal] = useState(false);
  const [isIntelligenceMuted, setIsIntelligenceMuted] = useState(false);
  const intelligenceSpeechRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [remediationInsight, setRemediationInsight] = useState<{
    remediatedLanguage: string | null;
    analysisInsight: string | null;
    originalTextToReplace: string | null;
    isGenerating: boolean;
  }>({ remediatedLanguage: null, analysisInsight: null, originalTextToReplace: null, isGenerating: false });

  const generateRemediationInsight = async (clauseTitle: string, clauseContent: string, risk: string) => {
    setRemediationInsight({ remediatedLanguage: null, analysisInsight: null, originalTextToReplace: null, isGenerating: true });
    setIsRemediationOpen(true);
    
    try {
      const prompt = `You are a world-class legal AI. The user wants to remediate a high-risk clause in a contract.
      
      CLAUSE TITLE: ${clauseTitle}
      IDENTIFIED RISK: ${risk}
      SUMMARY OF ORIGINAL CONTENT: "${clauseContent}"

      CURRENT DOCUMENT CONTENT:
      """
      ${analysis.rawText || ''}
      """

      INSTRUCTIONS:
      1. Find the actual clause in the CURRENT DOCUMENT CONTENT that corresponds to the title and summary.
      2. Quote the EXACT, verbatim original text of that clause as it appears in the document in 'originalTextToReplace'. This must match the document exactly so we can do a programmatic string replacement. Do not include the title unless you intend to rewrite the title too.
      3. Rewrite the clause to mitigate the identified risk while remaining commercially reasonable. Ensure it aligns with industry standard protections.
      4. Return the specific rewritten clause text in 'remediatedLanguage'.
      5. Provide a short explanation of how the new language fixes the issue in 'analysisInsight'.
      
      Return JSON:
      {
        "originalTextToReplace": "The exact original string from the document",
        "remediatedLanguage": "The specific rewritten clause text.",
        "analysisInsight": "1-2 sentences explaining why this fixes the risk"
      }`;

      const schema = {
        type: "object",
        properties: {
          originalTextToReplace: { type: "string" },
          remediatedLanguage: { type: "string" },
          analysisInsight: { type: "string" }
        },
        required: ["originalTextToReplace", "remediatedLanguage", "analysisInsight"]
      };
      
      const result = await generateJson(prompt, schema, "AI Remediation Engine");
      setRemediationInsight({
        originalTextToReplace: result.originalTextToReplace,
        remediatedLanguage: result.remediatedLanguage,
        analysisInsight: result.analysisInsight,
        isGenerating: false
      });
    } catch (error: any) {
      console.error("Error generating remediation:", error);
      setRemediationInsight({
        remediatedLanguage: `Error generating text: ${error.message}`,
        analysisInsight: "Failed to reach AI Engine",
        originalTextToReplace: null,
        isGenerating: false
      });
    }
  };

  const scrollToFinding = (text: string, isRewrite: boolean = false) => {
    // Close any open modals and switch to the document tab
    setIntelligenceModal(null);
    setActiveTab('document');

    // Robust retry mechanism: Wait for Tiptap to fully mount and initialize
    let attempts = 0;
    const tryHighlight = () => {
      attempts++;
      
      const editor = editorRef.current;
      if (editor && editor.getEditor()) {
        // Verify the text is actually in the editor before trying to highlight it
        const currentText = editor.getText();
        // Use a substring check to handle minor formatting differences
        if (currentText.toLowerCase().includes(text.toLowerCase().substring(0, 30)) || attempts > 20) {
          editor.scrollToText(text, isRewrite);
          return;
        }
      }
      
      if (attempts < 30) { // Try for up to 3 seconds
        setTimeout(tryHighlight, 100);
      } else {
        // Final Fallback: DOM scan
        const container = docRef.current;
        if (!container) return;
        const elements = container.querySelectorAll('p, div, span');
        let foundElement: HTMLElement | null = null;
        const searchTerm = text.toLowerCase();
        for (const el of Array.from(elements)) {
          if (el.textContent?.toLowerCase().includes(searchTerm)) {
            foundElement = el as HTMLElement;
            break;
          }
        }
        if (foundElement) {
          foundElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          foundElement.style.transition = 'all 0.5s';
          if (isRewrite) {
            foundElement.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
            foundElement.style.border = '2px solid rgba(34, 197, 94, 0.5)';
            foundElement.style.padding = '16px';
            foundElement.style.borderRadius = '12px';
            setTimeout(() => { 
              if (foundElement) {
                foundElement.style.backgroundColor = ''; 
                foundElement.style.border = '';
                foundElement.style.padding = '';
                foundElement.style.borderRadius = '';
              }
            }, 4000);
          } else {
            foundElement.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
            setTimeout(() => { if (foundElement) foundElement.style.backgroundColor = ''; }, 3000);
          }
        }
      }
    };

    // Start polling slightly after the state updates have been queued
    setTimeout(tryHighlight, 50);
  };


  const handleIntelligenceClick = (title: string, value: string | number, findings?: string[]) => {
    setIntelligenceModal({ 
      isOpen: true, 
      title, 
      value: String(value), 
      findings,
      explanation: null,
      isGenerating: false 
    });
  };

  const toggleIntelligenceVoice = () => {
    if (isIntelligenceMuted) {
      window.speechSynthesis.cancel();
      setIsIntelligenceMuted(false);
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsIntelligenceMuted(true);
      return;
    }

    if (!intelligenceModal?.explanation) return;

    const utterance = new SpeechSynthesisUtterance(intelligenceModal.explanation.replace(/\*\*/g, ''));
    const voices = window.speechSynthesis.getVoices();
    const enVoices = voices.filter(v => v.lang.startsWith('en-'));
    const preferredVoice = enVoices.find(v => 
      (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural') || v.name.toLowerCase().includes('online')) && 
      (v.name.includes('Aria') || v.name.includes('Jenny'))
    ) || enVoices.find(v => 
      v.name.includes('Google US English') || v.name.includes('Samantha') || v.name.includes('Victoria')
    ) || enVoices.find(v => 
      v.name.toLowerCase().includes('female')
    ) || enVoices.find(v => v.lang === 'en-US') || enVoices[0] || voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsIntelligenceMuted(false);
    intelligenceSpeechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsIntelligenceMuted(false);
  };

  const closeIntelligenceModal = () => {
    window.speechSynthesis.cancel();
    setIsIntelligenceMuted(false);
    setIntelligenceModal(null);
  };

  const generateNeuralInsight = async () => {
    if (!intelligenceModal) return;
    setIntelligenceModal(prev => prev ? { ...prev, isGenerating: true } : null);
    try {
      const prompt = `You are a world-class legal AI. The user is reviewing a contract and has questions about "${intelligenceModal.title}" (Value: "${intelligenceModal.value}"). 
      ${intelligenceModal.findings ? `Specific findings identified: ${intelligenceModal.findings.join(', ')}.` : ''}
      
      CURRENT DOCUMENT CONTENT:
      """
      ${analysis.rawText || ''}
      """

      INSTRUCTIONS:
      1. Analyze the implications of this metadata point for legal risk.
      2. CRITICAL: Propose a SPECIFIC optimization to the document text to mitigate risks or clarify this point. 
      3. Return the FULL updated document text in 'optimizedRawText' if a change is beneficial.
      
      Return JSON:
      {
        "explanation": "2-3 paragraphs of expert analysis",
        "optimizedRawText": "The entire contract text with your improvements applied. If the current text is perfect, return the current text.",
        "changeSummary": "A short title for the optimization (e.g., 'Enhanced Liability Cap')"
      }`;

      const schema = {
        type: "object",
        properties: {
          explanation: { type: "string" },
          optimizedRawText: { type: "string" },
          changeSummary: { type: "string" }
        },
        required: ["explanation", "optimizedRawText", "changeSummary"]
      };
      
      const result = await generateJson(prompt, schema, "Neural Optimization Engine");
      setIntelligenceModal(prev => prev ? { 
        ...prev, 
        explanation: result.explanation, 
        optimizedRawText: result.optimizedRawText,
        changeSummary: result.changeSummary,
        isGenerating: false 
      } : null);
    } catch (error: any) {
      console.error("Error generating intelligence explanation:", error);
      setIntelligenceModal(prev => prev ? { ...prev, explanation: `Error: ${error?.message || 'Unknown error occurred'}`, isGenerating: false } : null);
    }
  };

  const applyNeuralFix = async () => {
    if (!intelligenceModal || !intelligenceModal.optimizedRawText || !id) return;
    
    setIntelligenceModal(prev => prev ? { ...prev, isApplyingChange: true } : null);
    
    try {
      setPreviousText(analysis.rawText || null);
      const updatedAnalysis = { 
        ...analysis, 
        rawText: intelligenceModal.optimizedRawText 
      };
      
      const newLog = {
        id: crypto.randomUUID(),
        userId: auth.currentUser?.uid || 'system',
        userName: auth.currentUser?.displayName || 'Charter AI',
        action: `Neural Optimization: ${intelligenceModal.changeSummary || intelligenceModal.title}`,
        timestamp: new Date().toISOString(),
        details: `Applied document optimization based on intelligence node ${intelligenceModal.title}. Improvements include: ${intelligenceModal.findings?.join(', ') || 'Structural refinements'}.`
      };
      
      const updatedLogs = [newLog, ...auditLogs];
      setAuditLogs(updatedLogs);
      setAnalysis(updatedAnalysis);
      setActiveTab('document');

      // Trigger the success highlight in the editor
      scrollToFinding(intelligenceModal.changeSummary || intelligenceModal.title, true);
      
      // Split rawText from analysis to prevent field size limits in Firestore
      const { rawText, ...restOfAnalysis } = updatedAnalysis;
      
      await setDoc(doc(db, 'contracts', id), {
        content: rawText || '',
        analysis: JSON.stringify(restOfAnalysis),
        auditLogs: updatedLogs,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setIntelligenceModal(null);
      window.speechSynthesis.cancel();
    } catch (err: any) {
      console.error("Optimization Apply Error:", err);
      alert(`Failed to apply optimization: ${err.message || 'Unknown error'}`);
    } finally {
      setIntelligenceModal(prev => prev ? { ...prev, isApplyingChange: false } : null);
    }
  };

  const [analysis, setAnalysis] = useState<ContractAnalysis>(initialAnalysis || {
    name: 'Loading...',
    counterparty: '-',
    value: '-',
    expiry: '-',
    riskLevel: 'Medium Risk',
    riskScore: 0,
    summary: 'Fetching analysis from secure vault...',
    jurisdiction: '-',
    governingLaw: '-',
    terminationNotice: '-',
    keyObligations: [],
    missingProtections: [],
    parties: [],
    signatories: [],
    keyClauses: [],
    directive: ''
  });

  useEffect(() => {
    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
      setIsLoading(false);
    } else if (id) {
      const fetchContract = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'contracts', id));
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.analysis) {
              const parsedAnalysis = JSON.parse(data.analysis);
              // Ensure rawText is recovered from either the content field or the legacy analysis field
              const fullAnalysis = { 
                ...parsedAnalysis, 
                rawText: data.content || parsedAnalysis.rawText 
              };
              setAnalysis(fullAnalysis);
              setPreviousText(fullAnalysis.rawText || null);
            }
            setAuditLogs(data.auditLogs || []);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `contracts/${id}`);
        } finally {
          setIsLoading(false);
        }
      };
      fetchContract();
    }
  }, [id, initialAnalysis]);

  // Check RAG indexing status when a contract ID is available
  useEffect(() => {
    if (!id) return;
    getRagStatus(id)
      .then(status => {
        if (status.indexed) {
          setRagStatus('indexed');
          setRagChunkCount(status.chunkCount);
        }
      })
      .catch(() => { /* silent – status is best-effort */ });
  }, [id]);

  const [activeTab, setActiveTab] = useState<'document' | 'overview' | 'clauses' | 'parties' | 'updates'>('document');
  const mainTabs = [
    { id: 'document', label: 'Document', icon: FileText },
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'clauses', label: 'Analysis', icon: Gavel },
    { id: 'parties', label: 'Parties', icon: User },
    { id: 'updates', label: 'Updates', icon: History },
  ] as const;

  const exportToPDF = (type: 'draft' | 'report' = 'draft') => {
    const pdf = new jsPDF();
    const margin = 25;
    let y = 35;

    if (type === 'draft') {
      // ── Clean Draft Export ──────────────────────────────────────────────────
      // Branding Header
      pdf.setFillColor(15, 23, 42); // Navy Blue / Surface Container
      pdf.rect(0, 0, 210, 25, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text("SMART CHARTER", margin, 16);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text("INSTITUTIONAL DRAFT PROTOCOL", 145, 16);

      pdf.setTextColor(15, 23, 42);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text(analysis.name.toUpperCase(), margin, y);
      y += 10;
      
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`DATE GENERATED: ${new Date().toLocaleDateString()} | JURISDICTION: ${analysis.jurisdiction.toUpperCase()}`, margin, y);
      y += 15;
      
      pdf.line(margin, y, 185, y);
      y += 15;

      // Document Content
      pdf.setFont("times", "normal"); // Standard legal font
      pdf.setFontSize(11);
      pdf.setTextColor(30, 41, 59);
      
      const contentText = analysis.rawText || '';
      const splitText = pdf.splitTextToSize(contentText, 160);
      
      // Page handling
      splitText.forEach((line: string) => {
        if (y > 270) {
          pdf.addPage();
          y = 30;
          // Add small page footer
          pdf.setFontSize(8);
          pdf.setTextColor(200, 200, 200);
          pdf.text(`Page ${pdf.getNumberOfPages()}`, 105, 285, { align: 'center' });
          pdf.setFontSize(11);
          pdf.setTextColor(30, 41, 59);
        }
        pdf.text(line, margin, y);
        y += 6;
      });

      // Signature Area (Simplified for PDF)
      if (y > 230) { pdf.addPage(); y = 30; }
      y += 20;
      pdf.setFont("helvetica", "bold");
      pdf.text("SIGNATURES", margin, y);
      y += 10;
      pdf.line(margin, y, 80, y);
      pdf.line(110, y, 185, y);
      y += 5;
      pdf.setFontSize(8);
      pdf.text("AUTHORISED SIGNATORY", margin, y);
      pdf.text("AUTHORISED SIGNATORY", 110, y);

    } else {
      // ── Intelligence Report Export ──────────────────────────────────────────
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(24);
      pdf.text("Smart Charter", margin, y);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text("Intelligence Protocol: Contract Analysis Manifest", margin, y + 8);
      
      y += 25;
      
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text("DOCUMENT PROFILE", margin, y);
      y += 6;
      pdf.line(margin, y, 190, y);
      y += 10;

      pdf.setFontSize(12);
      pdf.text(`File Name: ${analysis.name}`, margin, y);
      y += 8;
      pdf.text(`Counterparty: ${analysis.counterparty}`, margin, y);
      y += 8;
      pdf.text(`Jurisdiction: ${analysis.jurisdiction}`, margin, y);
      y += 8;
      pdf.text(`Risk Evaluation: ${analysis.riskLevel} (${analysis.riskScore}/100)`, margin, y);
      
      y += 20;
      pdf.setFont("helvetica", "bold");
      pdf.text("EXECUTIVE BRIEF", margin, y);
      y += 6;
      pdf.line(margin, y, 190, y);
      y += 10;
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      const splitSummary = pdf.splitTextToSize(analysis.summary, 170);
      pdf.text(splitSummary, margin, y);
      // Continue Intelligence Report Sections
      y += 15;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text("MISSING PROTECTIONS & REMEDIATION", margin, y);
      y += 6;
      pdf.line(margin, y, 190, y);
      y += 10;
      pdf.setFont("helvetica", "normal");
      (analysis.missingProtections || []).forEach((prot: any) => {
        const splitProt = pdf.splitTextToSize(`• ${prot.point}: ${prot.remediation}`, 165);
        pdf.text(splitProt, margin + 5, y);
        y += (splitProt.length * 5) + 2;
      });
    }

    pdf.save(`${analysis.name.split('.')[0]}_${type === 'draft' ? 'Draft' : 'Report'}.pdf`);
    setShowExportDropdown(false);
  };


  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchSources([]);
    try {
      // Use RAG query for grounded, cited answers
      const ragResult = await ragQuery(searchQuery, id || undefined);
      setSearchResult(ragResult.answer);
      setSearchSources(ragResult.sources || []);
    } catch {
      // Fallback to legacy semantic search if RAG fails
      try {
        const context = analysis.rawText || '';
        const result = await semanticSearch(searchQuery, context);
        setSearchResult(result);
      } catch (err) {
        console.error(err);
        setSearchResult('Error processing query.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleImplementAndSync = async () => {
    if (!selectedClause || !remediationInsight.remediatedLanguage) return;

    const remediatedText = remediationInsight.remediatedLanguage;

    const updatedClauses = (analysis.keyClauses || []).map(clause => {
      if (clause.title === selectedClause.title) {
        return {
          ...clause,
          content: remediatedText,
          priority: 'Standard', // Mitigate risk level
          risk: 'Risk mitigated via AI Remediation engine.',
          mitigatedAt: new Date().toISOString(),
          mitigatedBy: auth.currentUser?.displayName || 'AI Agent'
        };
      }
      return clause;
    });

    let updatedRawText = analysis.rawText || '';
    if (remediationInsight.originalTextToReplace && updatedRawText.includes(remediationInsight.originalTextToReplace)) {
      updatedRawText = updatedRawText.replace(remediationInsight.originalTextToReplace, remediatedText);
    } else {
      // Fallback if exact match fails: just replace the clause summary text if it happens to be verbatim
      updatedRawText = updatedRawText.replace(selectedClause.content, remediatedText);
    }
    
    setPreviousText(analysis.rawText || null);
    
    const updatedAnalysis = {
      ...analysis,
      keyClauses: updatedClauses,
      rawText: updatedRawText
    };

    setAnalysis(updatedAnalysis as any);
    setIsRemediationOpen(false);

    const newLog = {
      id: crypto.randomUUID(),
      userId: auth.currentUser?.uid || 'system',
      userName: auth.currentUser?.displayName || 'AI Agent',
      action: `Remediated Clause: ${selectedClause.title}`,
      timestamp: new Date().toISOString(),
      details: `Injected AI-optimized language into "${selectedClause.title}". Replaced high-risk legacy content with compliant institutional wording to mitigate liability exposure.`,
      oldText: remediationInsight.originalTextToReplace || selectedClause.content,
      newText: remediatedText
    };
    const updatedLogs = [newLog, ...auditLogs];
    setAuditLogs(updatedLogs);

    setActiveTab('document');
    scrollToFinding(remediatedText, true);

    if (id) {
      try {
        await setDoc(doc(db, 'contracts', id), {
          analysis: JSON.stringify(updatedAnalysis),
          content: updatedRawText,
          auditLogs: updatedLogs,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.error("Failed to sync remediation to Firestore:", error);
      }
    }
  };
  
  const handleSwapJurisdiction = async () => {
    if (!analysis.rawText) return;
    setIsSwapping(true);
    try {
      const prompt = `You are an expert international legal counsel. 
        Perform a high-fidelity Jurisdiction Swap analysis for this contract to ${targetJurisdiction}. 
        Specifically:
        1. Rewrite the entire contract text (rawText) to be fully compliant with ${targetJurisdiction} laws while maintaining original intent.
        2. Update Governing Law and Jurisdiction clauses in the analysis.
        3. Rewrite Limitation of Liability and Indemnity clauses to align with ${targetJurisdiction} statutory limits and case law.
        4. If the target is UK or EU, ensure strict GDPR/UK GDPR compliance in data clauses.
        5. Maintain the original commercial intent but optimize legal protections for the new region.
        6. Return the full modified contract text in the 'rawText' field.
        7. Update all other fields (riskLevel, riskScore, summary, keyClauses, etc.) to reflect the new jurisdiction.

        Original Contract Text:
        ${analysis.rawText}
      `;

      // Define a simplified schema for the agent
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          counterparty: { type: "string" },
          value: { type: "string" },
          expiry: { type: "string" },
          riskLevel: { type: "string", enum: ["Low Risk", "Medium Risk", "High Risk"] },
          riskScore: { type: "number" },
          summary: { type: "string" },
          jurisdiction: { type: "string" },
          governingLaw: { type: "string" },
          terminationNotice: { type: "string" },
          directive: { type: "string" },
          rawText: { type: "string" },
          keyClauses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                priority: { type: "string", enum: ["Critical", "Standard", "Low"] },
                implications: { type: "string" },
                risk: { type: "string" },
                citation: { type: "string" }
              }
            }
          },
          parties: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                entityType: { type: "string" },
                status: { type: "string" }
              }
            }
          }
        }
      };

      const result = await generateJson(prompt, schema, "Return full legal analysis JSON including modified contract text.");
      const updatedAnalysis = { ...result };
      
      setPreviousText(analysis.rawText || null);
      
      const newLog = {
        id: crypto.randomUUID(),
        userId: auth.currentUser?.uid || 'system',
        userName: auth.currentUser?.displayName || 'AI Agent',
        action: `Jurisdiction Swap: ${targetJurisdiction}`,
        timestamp: new Date().toISOString(),
        details: `Automatically re-mapped legal logic from ${analysis.jurisdiction} to ${targetJurisdiction}.`
      };
      const updatedLogs = [newLog, ...auditLogs];
      setAuditLogs(updatedLogs);

      setAnalysis(updatedAnalysis);
      setIsSwappingModalOpen(false);
      
      if (id) {
        await setDoc(doc(db, 'contracts', id), {
          analysis: JSON.stringify(updatedAnalysis),
          auditLogs: updatedLogs,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      
      alert(`Jurisdiction successfully swapped to ${targetJurisdiction}.`);
    } catch (err) {
      console.error(err);
      alert('Failed to swap jurisdiction. Please try again.');
    } finally {
      setIsSwapping(false);
    }
  };

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-surface">
      {/* Two-Tier Refined Header — Built for Absolute Reactivity */}
      <header className="w-full border-b border-outline/30 bg-surface/95 backdrop-blur-md z-40 sticky top-0 dark:border-outline/10 shadow-sm">
        
        {/* Tier 1: Document Metadata & Primary Actions */}
        <div className="flex h-14 w-full items-center justify-between px-6 md:px-10 border-b border-outline/5">
          <div className="flex items-center gap-4 shrink-0">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl text-on-surface/40 hover:text-on-surface hover:bg-surface-container transition-all group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-[11px] md:text-xs font-black text-on-surface tracking-tight leading-none uppercase truncate max-w-[150px] md:max-w-md">
                  {analysis.name}
                </h2>
                <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                  analysis.riskLevel === 'High Risk' ? 'bg-error/10 text-error' : analysis.riskLevel === 'Medium Risk' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                }`}>
                  {analysis.riskLevel}
                </div>
              </div>
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 mt-1">Institutional Audit Active</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 shrink-0 justify-end">
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/5 hover:bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showExportDropdown ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showExportDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-56 bg-surface dark:bg-surface-container border border-outline/20 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-2 border-b border-outline/10 bg-surface-container-low">
                      <p className="text-[8px] font-black text-on-surface/30 uppercase tracking-[0.2em] px-3 py-1">Download Options</p>
                    </div>
                    
                    <div className="p-1.5 flex flex-col gap-1">
                      {/* Word Redline */}
                      <button
                        onClick={async () => {
                          setIsDownloadingRedline(true);
                          setShowExportDropdown(false);
                          try {
                            const blob = await generateRedlineDocx(
                              previousText || analysis.rawText || '',
                              analysis.rawText || '',
                              { documentName: analysis.name }
                            );
                            downloadRedline(blob, analysis.name);
                          } catch (e) { console.error(e); } finally { setIsDownloadingRedline(false); }
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/5 text-left transition-all group"
                      >
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                          <Files className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-on-surface uppercase tracking-tight">Word Redline</span>
                          <span className="text-[8px] text-on-surface/40 font-medium">Full Tracked Changes (.docx)</span>
                        </div>
                      </button>

                      {/* Clean PDF */}
                      <button
                        onClick={() => exportToPDF('draft')}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-success/5 text-left transition-all group"
                      >
                        <div className="p-2 bg-success/10 rounded-lg group-hover:bg-success/20 transition-colors">
                          <FileText className="h-3.5 w-3.5 text-success" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-on-surface uppercase tracking-tight">Clean Draft</span>
                          <span className="text-[8px] text-on-surface/40 font-medium">Optimized Contract (.pdf)</span>
                        </div>
                      </button>

                      {/* Intelligence Report */}
                      <button
                        onClick={() => exportToPDF('report')}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/5 text-left transition-all group"
                      >
                        <div className="p-2 bg-secondary/10 rounded-lg group-hover:bg-secondary/20 transition-colors">
                          <Sparkles className="h-3.5 w-3.5 text-secondary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-on-surface uppercase tracking-tight">Audit Report</span>
                          <span className="text-[8px] text-on-surface/40 font-medium">Intelligence Summary (.pdf)</span>
                        </div>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={() => setIsSwappingModalOpen(true)}
              className="p-2 rounded-xl text-secondary hover:bg-secondary/10 transition-all"
              title="Swap Jurisdiction"
            >
              <Globe className="h-4.5 w-4.5" />
            </button>
            <div className="h-4 w-px bg-outline/50 mx-0.5 md:mx-1 hidden sm:block" />
            <button className="bg-primary text-on-primary px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 hover:shadow-lg hover:shadow-primary/20 active:scale-95 ml-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Finalize</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Navigation Control Plane */}
        <div className="w-full flex items-center justify-center h-12 px-8 overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-10 md:gap-16 relative">
            {mainTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative shrink-0 ${
                  activeTab === tab.id 
                    ? 'text-primary' 
                    : 'text-on-surface/30 hover:text-on-surface/60'
                }`}
              >
                <span className="relative z-10">{tab.label}</span>
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="activeTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full z-0"
                    initial={false}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>


      <main className="flex flex-1 overflow-hidden relative">
        <div ref={docRef} className="flex-1 overflow-y-auto custom-scrollbar bg-surface-container-lowest">
          <AnimatePresence mode="wait">
            {activeTab === 'document' && (
              <motion.section 
                key="document"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`w-full p-6 lg:p-8 flex flex-col items-center transition-all duration-500 ease-in-out ${
                  isDocumentFullScreen ? 'fixed inset-0 z-[60] bg-surface dark:bg-surface-container overflow-y-auto' : ''
                }`}
              >
                <div className="mb-6 flex justify-between w-full max-w-[720px] lg:max-w-none items-center">
                    <div className="flex items-center gap-4">
                    </div>
                    <button 
                      onClick={() => setIsDocumentFullScreen(!isDocumentFullScreen)}
                      className="p-1.5 hover:bg-primary/5 rounded-lg transition-all text-primary/60 hover:text-primary border border-outline/30"
                    >
                      {isDocumentFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </button>
                 </div>

                 <div className="max-w-none px-4 lg:px-8 w-full flex flex-col gap-12 pb-32 transition-all duration-500">
                  <header className="text-center space-y-3">
                    <span className="text-[9px] font-bold uppercase tracking-[0.35em] text-on-surface-variant/40">Ref: V-4821-HX</span>
                    <h1 className="text-xl font-bold text-primary tracking-tight leading-tight px-6">{analysis.name.replace('.pdf', '')}</h1>
                    <div className="flex justify-center items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-2.5 w-2.5 text-on-surface-variant/40" />
                        <span className="text-[9px] font-bold text-on-surface-variant/70">{analysis.expiry}</span>
                      </div>
                      <div className="w-1 h-1 rounded-full bg-outline/30" />
                      <div className="flex items-center gap-1.5">
                        <Gavel className="h-2.5 w-2.5 text-on-surface-variant/40" />
                        <span className="text-[9px] font-bold text-on-surface-variant/70">{analysis.jurisdiction}</span>
                      </div>
                    </div>
                  </header>

            <section id="walkthrough-extraction" className="relative pl-6 group">
              <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-secondary/50" />
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-2.5 w-2.5 text-secondary" />
                  <h3 className="text-[8px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/60">Executive Abstract</h3>
                </div>
                <button 
                  onClick={() => {
                    const utterance = new SpeechSynthesisUtterance(analysis.summary);
                    utterance.rate = 0.9;
                    utterance.pitch = 1.0;
                    window.speechSynthesis.speak(utterance);
                  }}
                  className="p-1.5 opacity-0 group-hover:opacity-100 bg-secondary/10 text-secondary rounded-lg transition-all hover:scale-105"
                  title="Speak"
                >
                  <MessageSquare className="h-3 w-3" />
                </button>
              </div>
              <p className="text-sm text-on-surface font-medium leading-relaxed max-w-[580px]">
                {analysis.summary}
              </p>
            </section>

                    {analysis.rawText ? (
                        /* ── Phase 3: Tiptap Interactive Editor ─────────────────── */
                        <div className="-mx-6 lg:-mx-8">
                          <LegalEditor
                            ref={editorRef}
                            initialContent={analysis.rawText || ''}
                            referenceContent={previousText || undefined}
                            showToolbar={true}
                            onChange={(text) => {
                              setAnalysis(prev => ({ ...prev, rawText: text }));
                            }}
                          />
                        </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-surface-container-low/50 rounded-[32px] border border-dashed border-outline/50">
                         <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center text-primary/40">
                            <FileText className="h-8 w-8" />
                         </div>
                         <div>
                            <h4 className="text-sm font-bold text-primary">Intelligence Analysis Pending</h4>
                            <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest mt-1">Full structural breakdown will appear here once processed</p>
                         </div>
                      </div>
                    )}
                  </div>



                  <footer className="pt-24 flex justify-center">
                    <span className="text-[8px] font-bold text-on-surface-variant/10 uppercase tracking-[0.5em]">End of Document Review</span>
                  </footer>
                </motion.section>
            )}

            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full px-8 lg:px-16 xl:px-24 py-10 space-y-16"
              >
                {/* Header - Line Style */}
                <div className="flex items-end justify-between pb-6 border-b border-outline/20">
                  <h2 className="text-2xl font-light text-primary dark:text-primary-light tracking-tight">Document Overview</h2>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${analysis.riskLevel === 'High Risk' ? 'bg-error animate-pulse' : 'bg-success'}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${analysis.riskLevel === 'High Risk' ? 'text-error' : 'text-success'}`}>
                      {analysis.riskLevel === 'High Risk' ? 'High Risk Exposure' : 'Stable Risk Profile'}
                    </span>
                  </div>
                </div>

                {/* Contextual Intelligence Grid - Line Style */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-12 gap-y-12">
                  
                  {/* Risk Score */}
                  <button 
                    onClick={() => handleIntelligenceClick('Risk Score', analysis.riskLevel)}
                    className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <div className="absolute top-0 left-0 w-6 h-[1px] bg-primary/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary mb-3 group-hover:text-primary transition-colors">Security Score</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-light text-primary dark:text-primary-light tracking-tighter">{analysis.riskScore}</span>
                      <span className="text-xs font-medium text-on-surface/30">/100</span>
                    </div>
                  </button>

                  {/* Counterparty */}
                  {analysis.counterparty && (
                    <button 
                      onClick={() => handleIntelligenceClick('Counterparty', analysis.counterparty)}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary mb-3 group-hover:text-primary transition-colors">Counterparty</p>
                      <p className="text-sm font-medium text-on-surface truncate">{analysis.counterparty}</p>
                    </button>
                  )}

                  {/* Value */}
                  {analysis.value && (
                    <button 
                      onClick={() => handleIntelligenceClick('Contract Value', analysis.value)}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary mb-3 group-hover:text-primary transition-colors">Value</p>
                      <p className="text-sm font-medium text-on-surface truncate">{analysis.value}</p>
                    </button>
                  )}

                  {/* Expiry */}
                  {analysis.expiry && (
                    <button 
                      onClick={() => handleIntelligenceClick('Expires', analysis.expiry)}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary mb-3 group-hover:text-primary transition-colors">Expires</p>
                      <p className="text-sm font-medium text-on-surface truncate">{analysis.expiry}</p>
                    </button>
                  )}

                  {/* Jurisdiction */}
                  {analysis.jurisdiction && (
                    <button 
                      onClick={() => handleIntelligenceClick('Jurisdiction', analysis.jurisdiction)}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary mb-3 group-hover:text-primary transition-colors">Jurisdiction</p>
                      <p className="text-sm font-medium text-on-surface truncate">{analysis.jurisdiction}</p>
                    </button>
                  )}

                  {/* Clauses */}
                  {(analysis.keyClauses || []).length > 0 && (
                    <button 
                      onClick={() => handleIntelligenceClick('Clauses', `${(analysis.keyClauses || []).length} total clauses`, (analysis.keyClauses || []).map(c => c.title))}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary mb-3 group-hover:text-primary transition-colors">Clauses</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-on-surface">{(analysis.keyClauses || []).length}</span>
                        {(analysis.keyClauses || []).filter(c => c.priority === 'Critical').length > 0 && (
                          <span className="text-[9px] font-black text-error bg-error/10 px-2 py-0.5 rounded-md">
                            {(analysis.keyClauses || []).filter(c => c.priority === 'Critical').length}C
                          </span>
                        )}
                      </div>
                    </button>
                  )}

                  {/* Governing Law */}
                  {analysis.governingLaw && (
                    <button 
                      onClick={() => handleIntelligenceClick('Governing Law', analysis.governingLaw)}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary mb-3 group-hover:text-primary transition-colors">Gov. Law</p>
                      <p className="text-sm font-medium text-on-surface truncate">{analysis.governingLaw}</p>
                    </button>
                  )}

                  {/* Parties */}
                  {(analysis.parties || []).length > 0 && (
                    <button 
                      onClick={() => handleIntelligenceClick('Parties', `${(analysis.parties || []).length} involved entities`, (analysis.parties || []).map(p => p.name))}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40 mb-3 group-hover:text-primary/70 transition-colors">Parties</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-on-surface">{(analysis.parties || []).length}</span>
                        <span className="text-[9px] font-black text-success bg-success/10 px-2 py-0.5 rounded-md">
                          {(analysis.parties || []).filter(p => p.status === 'Verified').length}V
                        </span>
                      </div>
                    </button>
                  )}

                  {/* Gap Vulnerabilities */}
                  {(analysis.missingProtections || []).length > 0 && (
                    <button 
                      onClick={() => handleIntelligenceClick('Gap Vulnerabilities', `${(analysis.missingProtections || []).length} unresolved gaps`, (analysis.missingProtections || []).map(m => m.title))}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40 mb-3 group-hover:text-primary/70 transition-colors">Gaps</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-on-surface">{(analysis.missingProtections || []).length}</span>
                        <span className="text-[9px] font-black text-warning bg-warning/10 px-2 py-0.5 rounded-md">open</span>
                      </div>
                    </button>
                  )}

                  {/* Last Modified */}
                  {auditLogs.length > 0 && (
                    <button 
                      onClick={() => handleIntelligenceClick('Last Modified', auditLogs[0].userName)}
                      className="relative pt-4 text-left group hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <div className="absolute top-0 left-0 w-6 h-[1px] bg-outline/40 group-hover:w-full group-hover:bg-secondary transition-all duration-500" />
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40 mb-3 group-hover:text-primary/70 transition-colors">Modified</p>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                        <span className="text-sm font-medium text-on-surface truncate">{auditLogs[0].userName.split(' ')[0]}</span>
                      </div>
                    </button>
                  )}

                </div>

                {/* 2-Column Details Layout - Line Style */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 pt-8">
                  
                  {/* Strategic Direction */}
                  <div className="relative pt-6 border-t border-outline/20">
                    <div className="flex items-center gap-3 mb-6">
                      <Gavel className="h-3 w-3 text-primary/50" />
                      <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-on-surface/50">Strategic Direction</span>
                    </div>
                    <p className="text-xl font-light leading-relaxed text-on-surface/90">
                      {analysis.directive}
                    </p>
                  </div>

                  {/* Gap Vulnerabilities Table */}
                  <div className="relative pt-6 border-t border-outline/20">
                    <div className="flex items-center gap-3 mb-6">
                      <AlertTriangle className="h-3 w-3 text-error/60" />
                      <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-error/70">Gap Vulnerabilities</span>
                    </div>
                    
                    {(!analysis.missingProtections || analysis.missingProtections.length === 0) ? (
                      <div className="py-4 border-b border-outline/10">
                        <p className="text-sm font-medium text-success/80">No significant gap vulnerabilities identified.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {(Array.isArray(analysis.missingProtections) ? analysis.missingProtections : []).map((miss, i) => (
                          <div key={`miss-${i}`} className="py-5 border-b border-outline/10 first:pt-0 last:border-0 group">
                            <div className="flex items-start gap-5">
                              <span className="text-[9px] font-light text-error/40 mt-1 font-mono tracking-widest">{String(i + 1).padStart(2, '0')}</span>
                              <div>
                                <p className="text-[11px] font-bold text-error/90 uppercase tracking-[0.1em] mb-2">{miss.title}</p>
                                <p className="text-[13px] text-on-surface/60 font-light leading-relaxed group-hover:text-on-surface/90 transition-colors">{miss.suggestion}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </motion.div>
            )}

            {activeTab === 'clauses' && (
              <motion.div 
                key="clauses"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex h-full overflow-hidden bg-surface-container-lowest dark:bg-surface"
              >
                {/* Minimalist Clause Navigation Sidebar */}
                <div className="w-[320px] h-full border-r border-outline/20 flex flex-col">
                  <div className="p-4 sm:p-6 border-b border-outline/20">
                    <h2 className="text-xl font-light text-primary dark:text-primary-light tracking-tight">Legal Nodes</h2>
                    <p className="text-[9px] font-bold text-on-surface/40 uppercase tracking-[0.2em] mt-1 mb-8">Strategic Index</p>
                    
                    <div className="flex gap-4 border-b border-outline/10">
                      {(['All', 'Critical', 'Standard', 'Low'] as const).map((risk) => (
                        <button
                          key={risk}
                          onClick={() => setSelectedRisk(risk)}
                          className={`pb-3 text-[9px] font-bold uppercase tracking-[0.15em] transition-all relative ${
                            selectedRisk === risk
                              ? 'text-primary'
                              : 'text-on-surface/30 hover:text-on-surface/60'
                          }`}
                        >
                          {risk}
                          {selectedRisk === risk && (
                            <motion.div layoutId="filter-indicator" className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    {(analysis.keyClauses || [])
                      .filter(item => selectedRisk === 'All' || item.priority === selectedRisk)
                      .map((item: any, i: number) => (
                      <button 
                        key={`nav-clause-${i}`}
                        onClick={() => setSelectedClause(item)}
                        className={`w-full text-left px-4 py-4 sm:px-6 sm:py-5 transition-all border-b border-outline/10 group relative ${
                          item.mitigatedAt ? 'opacity-50 grayscale' : ''
                        } ${
                          selectedClause?.title === item.title 
                            ? 'bg-surface/50' 
                            : 'hover:bg-surface/30'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                           <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                             item.mitigatedAt ? 'bg-success' :
                             item.priority === 'Critical' ? 'bg-error' : 
                             item.priority === 'Standard' ? 'bg-warning' : 
                             'bg-success'
                           } ${!item.mitigatedAt && item.priority === 'Critical' ? 'animate-pulse' : ''}`} />
                           <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-bold leading-snug tracking-wide ${selectedClause?.title === item.title ? 'text-primary dark:text-primary-light' : 'text-on-surface/80 group-hover:text-on-surface'}`}>
                                {item.title}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                 <span className={`text-[8px] font-bold uppercase tracking-[0.2em] ${item.mitigatedAt ? 'text-success/80' : 'text-on-surface/40'}`}>
                                    {item.mitigatedAt ? 'Verified' : item.priority}
                                 </span>
                                 {item.mitigatedAt && <Check className="h-2.5 w-2.5 text-success/80" />}
                              </div>
                           </div>
                        </div>
                        {selectedClause?.title === item.title && (
                          <motion.div layoutId="active-indicator" className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Detailed Focus Area - Line Style */}
                <div className="flex-1 overflow-y-auto p-16">
                  <AnimatePresence mode="wait">
                    {selectedClause ? (
                      <motion.div 
                        key={selectedClause.title}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="max-w-4xl mx-auto"
                      >
                        <div className={`relative pl-8 border-l-[2px] transition-all ${
                          selectedClause.mitigatedAt ? 'border-l-success opacity-70 grayscale-[0.3]' :
                          selectedClause.priority === 'Critical' ? 'border-l-error' : 
                          selectedClause.priority === 'Standard' ? 'border-l-warning' : 
                          'border-l-success'
                        }`}>
                          {/* Header */}
                          <div className="flex justify-between items-start mb-8 pb-8 border-b border-outline/10">
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${
                                   selectedClause.mitigatedAt ? 'text-success' :
                                   selectedClause.priority === 'Critical' ? 'text-error' : 
                                   selectedClause.priority === 'Standard' ? 'text-warning' : 
                                   'text-success'
                                }`}>
                                  {selectedClause.mitigatedAt ? 'Mitigated Node' : `${selectedClause.priority} Priority`}
                                </span>
                                {selectedClause.mitigatedAt && (
                                  <>
                                    <div className="w-1 h-1 rounded-full bg-outline/20" />
                                    <div className="flex items-center gap-1.5 text-success/80">
                                      <Sparkles className="h-3 w-3" />
                                      <span className="text-[9px] font-bold uppercase tracking-[0.2em]">Neural Verified</span>
                                    </div>
                                    <div className="w-1 h-1 rounded-full bg-outline/20" />
                                    <div className="flex items-center gap-1.5 text-on-surface/40">
                                      <Clock className="h-3 w-3" />
                                      <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
                                        {selectedClause.mitigatedAt}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                              <h3 className="text-3xl font-light text-primary dark:text-primary-light tracking-tight">{selectedClause.title}</h3>
                            </div>
                            <div className="flex gap-4">
                                <button 
                                onClick={() => {
                                  scrollToFinding(selectedClause.title);
                                }}
                                className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-primary hover:text-primary-light transition-colors"
                              >
                                <Search className="h-3 w-3" />
                                Find in Doc
                              </button>
                            </div>
                          </div>

                          <div className="mb-10 pl-6 border-l border-primary/20">
                            <p className="text-sm text-on-surface/80 italic font-serif leading-relaxed">
                              "{selectedClause.content}"
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 pb-12 mb-8 border-b border-outline/10">
                            <div className="relative pt-6 border-t border-outline/10">
                              <div className="flex items-center gap-3 mb-4">
                                <Info className="h-3 w-3 text-primary/40" />
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/40">Implications</span>
                              </div>
                              <p className="text-[13px] text-on-surface/80 font-light leading-relaxed">{selectedClause.implications}</p>
                            </div>
                            <div className="relative pt-6 border-t border-outline/10">
                              <div className="flex items-center gap-3 mb-4">
                                <AlertTriangle className={`h-3 w-3 ${selectedClause.mitigatedAt ? 'text-success/50' : 'text-error/50'}`} />
                                <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${selectedClause.mitigatedAt ? 'text-success/50' : 'text-error/50'}`}>
                                  {selectedClause.mitigatedAt ? 'Mitigation Strategy' : 'Identified Risk'}
                                </span>
                              </div>
                               <p className={`text-[13px] font-light leading-relaxed ${selectedClause.mitigatedAt ? 'text-success/90' : 'text-error/90'}`}>{selectedClause.risk}</p>
                            </div>
                          </div>

                          <div className="flex items-end justify-between pt-4">
                            <div className="flex flex-col gap-2">
                               <div className="flex items-center gap-2 text-[9px] text-on-surface/40 font-bold uppercase tracking-widest">
                                 <Gavel className="h-3 w-3" />
                                 Citation: {selectedClause.citation}
                               </div>
                               {selectedClause.mitigatedAt && (
                                 <div className="flex items-center gap-2 text-[9px] text-success/60 font-bold uppercase tracking-widest">
                                    <Clock className="h-3 w-3" />
                                    Synced {new Date(selectedClause.mitigatedAt).toLocaleDateString()}
                                 </div>
                               )}
                            </div>
                            
                            <button 
                              onClick={() => generateRemediationInsight(selectedClause.title, selectedClause.content, selectedClause.risk || 'General Risk')}
                              disabled={!!selectedClause.mitigatedAt}
                              className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors pb-1 border-b-2 ${
                                selectedClause.mitigatedAt 
                                  ? 'text-success border-success cursor-default' 
                                  : 'text-primary border-primary hover:text-primary-light hover:border-primary-light'
                              }`}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {selectedClause.mitigatedAt ? 'Node Mitigated' : 'Trigger AI Rewrite'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-20 space-y-6">
                         <Gavel className="h-8 w-8 text-on-surface/20 animate-pulse" />
                         <div>
                            <h3 className="text-xl font-light text-on-surface/80 tracking-tight">Select a Legal Node</h3>
                            <p className="text-[9px] font-bold text-on-surface/30 uppercase tracking-[0.2em] mt-3">Choose a clause from the sidebar to begin</p>
                         </div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
            {activeTab === 'parties' && (
              <motion.div 
                key="parties"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto p-12 space-y-12"
              >
                <div className="text-center space-y-3 mb-8">
                   <h2 className="text-3xl font-black text-primary dark:text-primary-light tracking-tighter">Engagement Matrix</h2>
                   <p className="text-[10px] font-bold text-on-surface-variant/30 dark:text-on-surface-variant/50 uppercase tracking-[0.5em]">Authority & Entity Verification</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                  {/* Entity Information - Minimalist */}
                  <div className="space-y-6">
                    <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/40 dark:text-primary-light/30 border-b border-outline/10 pb-4">Verified Entities</h3>
                    <div className="space-y-4">
                      {(analysis.parties || []).map((party, i) => (
                        <div key={`detail-party-${i}`} className="group flex items-center justify-between py-4 border-b border-outline/5 hover:border-primary/20 transition-all">
                          <div className="flex items-center gap-6">
                            <div className="relative">
                              <Shield className="h-5 w-5 text-primary/10 dark:text-primary-light/10 group-hover:text-primary/40 transition-colors" />
                              {party.status === 'Verified' && (
                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full border-2 border-surface dark:border-surface-container shadow-sm" />
                              )}
                            </div>
                            <div>
                               <p className="text-lg font-bold text-primary dark:text-primary-light tracking-tight leading-none mb-1.5">{party.name}</p>
                               <div className="flex items-center gap-3">
                                 <span className="text-[9px] font-bold text-on-surface-variant/40 dark:text-on-surface-variant/60 uppercase tracking-widest">{party.role}</span>
                                 <div className="w-1 h-1 rounded-full bg-outline/20" />
                                 <span className="text-[9px] font-bold text-on-surface-variant/40 dark:text-on-surface-variant/60 uppercase tracking-widest">{party.entityType}</span>
                               </div>
                            </div>
                          </div>
                          <div className="text-[8px] font-black uppercase tracking-widest text-primary/30 group-hover:text-primary transition-colors">
                             {party.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Authority Mapping - Minimalist */}
                  <div className="space-y-6">
                    <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/40 dark:text-primary-light/30 border-b border-outline/10 pb-4">Signatory Board</h3>
                    <div className="space-y-4">
                       {(analysis.signatories || []).map((sig, i) => (
                        <div key={`detail-sig-${i}`} className="group flex items-center gap-6 py-4 border-b border-outline/5 hover:border-primary/20 transition-all">
                           <div className="w-12 h-12 rounded-full bg-surface-container-low dark:bg-surface-container-high border border-outline/20 flex items-center justify-center shrink-0 group-hover:border-primary/30 transition-all">
                             <User className="h-5 w-5 text-on-surface-variant/30 group-hover:text-primary transition-colors" />
                           </div>
                           <div className="flex-1">
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-lg font-bold text-primary dark:text-primary-light tracking-tight leading-none">{sig.name}</p>
                                <div className="px-2.5 py-0.5 bg-primary/5 dark:bg-primary/10 rounded-full border border-primary/5">
                                   <p className="text-[7px] font-black text-primary/40 dark:text-primary-light/40 uppercase tracking-widest">{sig.party}</p>
                                </div>
                              </div>
                              <p className="text-[9px] text-on-surface-variant/40 dark:text-on-surface-variant/60 font-bold uppercase tracking-widest leading-none">{sig.title}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Neural Search — RAG-powered floating panel */}
        <div className="fixed bottom-12 right-12 z-50">
          <AnimatePresence>
            {searchResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="mb-6 bg-surface border border-outline/20 rounded-[32px] shadow-2xl w-[440px] overflow-hidden"
              >
                {/* Answer header */}
                <div className="p-6 pb-4 bg-primary">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-secondary animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary">RAG Neural Answer</span>
                    </div>
                    <button
                      onClick={() => { setSearchResult(null); setSearchSources([]); }}
                      className="p-1.5 hover:bg-white/10 rounded-xl transition-colors"
                    >
                      <X className="h-4 w-4 text-white/60" />
                    </button>
                  </div>
                  <p className="text-sm text-white/90 font-medium leading-relaxed">{searchResult}</p>
                </div>
                {/* Source citations */}
                {searchSources.length > 0 && (
                  <div className="p-4 space-y-2 border-t border-outline/10 bg-surface-container-low/50">
                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-on-surface/30 mb-3">Source Excerpts ({searchSources.length})</p>
                    {searchSources.slice(0, 3).map((src, i) => (
                      <div key={src.chunkId} className="p-3 bg-surface rounded-2xl border border-outline/10">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                          <span className="text-[8px] font-black text-primary/60 uppercase tracking-widest">Excerpt {i + 1} — {src.score}% match</span>
                        </div>
                        <p className="text-[11px] text-on-surface/60 leading-relaxed line-clamp-2">{src.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* RAG Status Badge */}
          <AnimatePresence>
            {ragStatus === 'indexing' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-3 flex items-center gap-2 px-4 py-2 bg-surface border border-outline/20 rounded-full shadow-lg w-fit ml-auto"
              >
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
                <span className="text-[9px] font-black text-primary uppercase tracking-widest">Indexing Document...</span>
              </motion.div>
            )}
            {ragStatus === 'indexed' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-3 flex items-center gap-2 px-4 py-2 bg-success/10 border border-success/20 rounded-full shadow-sm w-fit ml-auto"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-[9px] font-black text-success uppercase tracking-widest">RAG Active · {ragChunkCount} Chunks</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-[32px] blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center gap-3 bg-surface p-2 rounded-[32px] border border-outline shadow-2xl w-[440px]">
              <div className="p-3 bg-primary/5 rounded-2xl">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <input
                type="text"
                placeholder={ragStatus === 'indexed' ? 'Ask AI about this document (RAG)...' : 'Ask AI Engine about document nodes...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 bg-transparent border-none outline-none text-[11px] font-black text-primary placeholder:text-primary/20 uppercase tracking-widest disabled:opacity-50"
                disabled={isSearching}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="p-3 bg-primary text-white rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isRemediationOpen && selectedClause && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRemediationOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[540px] bg-surface rounded-3xl p-6 z-[110] shadow-2xl border border-outline overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-primary tracking-tight">AI Remediation</h2>
                    <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest leading-none">Risk Mitigation Engine</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsRemediationOpen(false)}
                  className="p-1.5 hover:bg-surface-container rounded-lg transition-colors border border-outline/30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-2">Original Clause</h3>
                  <div className="p-3 bg-error/[0.02] border border-error/10 rounded-xl">
                    <p className="text-[10px] font-bold text-primary mb-0.5">{selectedClause.title}</p>
                    <p className="text-[10px] text-on-surface-variant leading-relaxed italic">"{selectedClause.content}"</p>
                  </div>
                </div>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-dashed border-outline/40" />
                  </div>
                  <div className="relative flex justify-center">
                    <div className="px-3 bg-surface text-[8px] font-extrabold text-primary/50 uppercase tracking-[0.2em] flex items-center gap-1.5">
                       <Sparkles className="h-2.5 w-2.5 text-secondary" />
                       Proposed Amendment
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-2">Remediated Language</h3>
                  <div className="p-5 bg-primary/5 border-l-4 border-primary rounded-r-xl shadow-inner group min-h-[100px] flex flex-col justify-center">
                    <p className="text-sm text-primary font-bold leading-relaxed tracking-tight">
                      {remediationInsight.isGenerating ? (
                        <span className="flex items-center gap-3 animate-pulse text-primary/60">
                          <Loader2 className="h-4 w-4 animate-spin" /> AI generation in progress...
                        </span>
                      ) : (
                        `"${remediationInsight.remediatedLanguage || 'Generation failed.'}"`
                      )}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-surface-container/50 rounded-xl border border-outline/40 mt-4">
                   <div className="flex items-center gap-2 mb-1.5">
                     <Info className="h-3.5 w-3.5 text-primary/40" />
                     <p className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">Analysis Insight</p>
                   </div>
                   <p className="text-[10px] text-on-surface-variant/70 font-medium leading-relaxed">
                     {remediationInsight.isGenerating ? (
                        <span className="animate-pulse">Analyzing risk vectors...</span>
                     ) : (
                        remediationInsight.analysisInsight || 'Insight generation failed.'
                     )}
                   </p>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setIsRemediationOpen(false)}
                  className="flex-1 py-3 text-[10px] font-extrabold uppercase tracking-widest text-primary/40 hover:text-primary transition-all border border-outline/30 rounded-xl"
                >
                  Discard
                </button>
                <button 
                  onClick={handleImplementAndSync}
                  disabled={remediationInsight.isGenerating || !remediationInsight.remediatedLanguage}
                  className="flex-[2] py-3 bg-primary text-on-primary rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                >
                  <Sparkles className="h-4 w-4" />
                  Implement & Sync
                </button>
              </div>
            </motion.div>
          </>
        )}

        {activeTab === 'updates' && (
          <motion.div 
            key="updates"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="h-full flex flex-col p-8 overflow-hidden"
          >
            <div className="flex flex-col mb-12">
               <h2 className="text-5xl font-black text-primary tracking-tighter mb-2">Audit Flow</h2>
               <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.5em]">Compact Versioning Engine</p>
            </div>

            <div className="flex-1 relative">
              {/* Horizontal Connector Line */}
              <div className="absolute top-[50px] left-0 right-0 h-px bg-gradient-to-r from-transparent via-outline to-transparent z-0" />
              
              <div className="flex gap-4 overflow-x-auto pb-12 pt-8 px-4 no-scrollbar snap-x relative z-10 items-start">
                {(auditLogs || []).map((log, i) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <motion.div 
                      key={`audit-log-${log.id || i}`}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex-shrink-0 snap-center transition-all ${isExpanded ? 'w-[400px]' : 'w-[200px]'}`}
                    >
                      <button 
                        onClick={() => setExpandedLogId(isExpanded ? null : (log.id || i.toString()))}
                        className="w-full text-left group"
                      >
                        <div className="flex flex-col items-center mb-6">
                           <div className={`w-10 h-10 rounded-full bg-surface dark:bg-surface-container border-2 transition-all shadow-lg flex items-center justify-center relative z-20 ${
                             isExpanded ? 'border-primary dark:border-primary-light scale-110' : 'border-outline dark:border-outline/20 group-hover:border-primary/50'
                           }`}>
                              <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-secondary animate-pulse' : 'bg-primary/20'}`} />
                           </div>
                           <div className="mt-3 text-center">
                              <p className="text-[8px] font-black text-primary/40 uppercase tracking-widest">{new Date(log.timestamp).toLocaleDateString()}</p>
                           </div>
                        </div>

                        <motion.div 
                          layout
                          className={`bg-surface dark:bg-surface-container border rounded-[24px] transition-all overflow-hidden ${
                            isExpanded 
                              ? 'p-6 border-primary dark:border-primary-light shadow-2xl ring-4 ring-primary/5 dark:ring-primary/10' 
                              : 'p-4 border-outline dark:border-outline/20 shadow-sm hover:shadow-md group-hover:border-primary/30 dark:group-hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                             <span className="px-2 py-0.5 bg-primary/5 dark:bg-primary/10 text-primary dark:text-primary-light text-[6px] font-black uppercase tracking-widest rounded-full">{log.userName}</span>
                             {isExpanded && (
                               <span className="text-[6px] font-bold text-on-surface-variant/40 dark:text-on-surface-variant/60 uppercase tracking-widest">v{ (auditLogs.length - i).toFixed(1) }</span>
                             )}
                          </div>
                          
                          <h3 className={`font-black text-primary dark:text-primary-light tracking-tight leading-tight uppercase mb-1 transition-all ${isExpanded ? 'text-sm' : 'text-[10px] truncate'}`}>
                            {log.action}
                          </h3>

                          {isExpanded && (
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="mt-4"
                            >
                              <p className="text-[11px] text-on-surface-variant/70 dark:text-on-surface-variant/90 font-medium leading-relaxed mb-4 italic">"{log.details || 'No additional context provided.'}"</p>
                              
                              {log.oldText && log.newText && (
                                <div className="mt-4 p-4 bg-surface-container-low dark:bg-surface-container-high rounded-xl border border-outline/10 text-[12px] leading-relaxed font-serif">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-on-surface/30 mb-2">Version Comparison</p>
                                  {diffWords(log.oldText, log.newText).map((part, i) => (
                                    <span 
                                      key={i} 
                                      className={part.added ? 'bg-success/10 text-success' : part.removed ? 'bg-error/10 text-error line-through' : 'text-on-surface/80'}
                                    >
                                      {part.value}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-6 mt-4 border-t border-outline/30 dark:border-outline/10">
                                 <div className="flex items-center gap-1.5">
                                    <Sparkles className="h-3 w-3 text-secondary" />
                                    <span className="text-[8px] font-black text-secondary uppercase tracking-widest">Logic Node Sync</span>
                                 </div>
                                 <Clock className="h-3.5 w-3.5 text-primary/20 dark:text-on-surface/20" />
                              </div>
                            </motion.div>
                          )}
                          
                          {!isExpanded && (
                            <p className="text-[8px] text-on-surface-variant/40 dark:text-on-surface-variant/60 font-bold uppercase tracking-tighter mt-2">Click to expand</p>
                          )}
                        </motion.div>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
            
            <div className="mt-auto pt-8 border-t border-outline/30 flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/5 rounded-xl border border-primary/10">
                     <Info className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                     <p className="text-[9px] font-black text-primary uppercase tracking-widest">Node Governance</p>
                     <p className="text-[9px] text-on-surface-variant/40 font-medium italic">Interactive versioning engine active.</p>
                  </div>
               </div>
               <div className="px-4 py-2 bg-surface border border-outline rounded-xl text-[8px] font-black text-primary/40 uppercase tracking-widest">
                  Timeline Nodes: {auditLogs.length}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSwappingModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSwapping && setIsSwappingModalOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[480px] bg-surface rounded-[40px] p-8 z-[110] shadow-2xl border border-outline overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary shadow-lg shadow-secondary/5">
                    <Globe className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-primary tracking-tight">Jurisdiction Swapper</h2>
                    <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest leading-none">Agentic Legal Translation</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSwappingModalOpen(false)}
                  disabled={isSwapping}
                  className="p-2 hover:bg-surface-container rounded-xl transition-colors border border-outline/30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-5 bg-primary/5 rounded-[32px] border border-primary/10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">Current Status</span>
                  </div>
                  <p className="text-sm font-bold text-primary">Original Context: {analysis.jurisdiction}</p>
                  <p className="text-[10px] text-on-surface-variant/70 font-medium mt-1 leading-relaxed">Agent will rewrite liability, governing law, and regulatory clauses to match the target region.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 ml-2">Target Jurisdiction</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['United Kingdom', 'USA (Delaware)', 'South Africa', 'European Union'].map((region) => (
                      <button
                        key={region}
                        onClick={() => setTargetJurisdiction(region)}
                        disabled={isSwapping}
                        className={`py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
                          targetJurisdiction === region 
                            ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-[1.02]' 
                            : 'bg-surface-container-low text-on-surface/40 border-outline hover:border-primary/40'
                        }`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                </div>

                {isSwapping && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-secondary/5 rounded-2xl border border-secondary/20 flex items-center gap-4"
                  >
                    <RefreshCw className="h-4 w-4 text-secondary animate-spin" />
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-secondary uppercase tracking-widest">AI Intelligence Active</p>
                      <p className="text-[10px] text-on-surface-variant font-medium">Re-mapping legal logic for {targetJurisdiction}...</p>
                    </div>
                  </motion.div>
                )}
              </div>

              <button 
                onClick={handleSwapJurisdiction}
                disabled={isSwapping}
                className="w-full mt-8 py-4 bg-primary text-white rounded-[24px] text-xs font-black uppercase tracking-widest shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isSwapping ? 'Processing...' : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Initiate Agentic Swap
                  </>
                )}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {intelligenceModal && intelligenceModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 lg:p-8"
            onClick={closeIntelligenceModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              className="bg-surface border border-outline/10 rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 pb-6 border-b border-outline/10 flex items-start justify-between bg-surface-container-low/50">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/50">Intelligence Node</p>
                  </div>
                  <h2 className="text-3xl font-black text-on-surface tracking-tight">{intelligenceModal.title}</h2>
                  <p className="text-lg font-bold text-primary dark:text-primary-light mt-1">{intelligenceModal.value}</p>
                </div>
                <div className="flex items-center gap-2">
                  {intelligenceModal.explanation && (
                    <button 
                      onClick={toggleIntelligenceVoice}
                      className={`p-3 rounded-full transition-all flex items-center gap-2 ${
                        window.speechSynthesis.speaking && !isIntelligenceMuted 
                          ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                          : 'hover:bg-surface-container text-on-surface/50 hover:text-primary'
                      }`}
                      title={window.speechSynthesis.speaking && !isIntelligenceMuted ? "Stop Reading" : "Read Aloud"}
                    >
                      {window.speechSynthesis.speaking && !isIntelligenceMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      {window.speechSynthesis.speaking && !isIntelligenceMuted && (
                        <span className="text-[10px] font-black uppercase tracking-widest pr-1">Reading Node</span>
                      )}
                    </button>
                  )}
                  <button 
                    onClick={closeIntelligenceModal}
                    className="p-3 hover:bg-surface-container rounded-full transition-colors group"
                  >
                    <X className="h-5 w-5 text-on-surface/50 group-hover:text-on-surface transition-colors" />
                  </button>
                </div>
              </div>
              
              <div className="p-8 min-h-[200px] max-h-[60vh] overflow-y-auto custom-scrollbar">
                {!intelligenceModal.explanation ? (
                  <div className="space-y-8">
                    {/* Findings Section */}
                    <div>
                       <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/30 mb-6">Located Findings</h4>
                       {intelligenceModal.findings && intelligenceModal.findings.length > 0 ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {intelligenceModal.findings.map((f, i) => (
                             <button 
                               key={i} 
                               onClick={() => scrollToFinding(f)}
                               className="p-4 bg-surface-container-low border border-outline/20 rounded-2xl flex items-center gap-3 hover:bg-surface-container-high transition-all group text-left w-full"
                             >
                               <div className="w-1.5 h-1.5 rounded-full bg-primary group-hover:scale-150 transition-transform" />
                               <div className="flex-1">
                                 <span className="text-[11px] font-bold text-on-surface/80 block">{f}</span>
                                 <span className="text-[8px] font-bold uppercase tracking-widest text-primary/40 group-hover:text-primary transition-colors">Locate in Page</span>
                               </div>
                               <Search className="h-3 w-3 text-primary/20 group-hover:text-primary" />
                             </button>
                           ))}
                         </div>
                       ) : (
                         <div className="p-6 bg-surface-container-low border border-outline/20 rounded-2xl text-center">
                            <p className="text-[11px] font-medium text-on-surface/40 italic">System has located and verified this metric node.</p>
                         </div>
                       )}
                    </div>

                    <div className="flex flex-col items-center justify-center py-10 border-t border-outline/10">
                      {intelligenceModal.isGenerating ? (
                        <>
                          <Loader2 className="h-10 w-10 text-primary animate-spin mb-6" />
                          <p className="text-base font-black text-on-surface tracking-wide">Synthesizing AI Insight</p>
                          <p className="text-sm text-on-surface-variant mt-2 max-w-xs mx-auto text-center">The AI is analyzing the legal implications of these findings in real-time...</p>
                        </>
                      ) : (
                        <button 
                          onClick={generateNeuralInsight}
                          className="px-10 py-4 bg-primary text-on-primary rounded-2xl text-[11px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 flex items-center gap-3"
                        >
                          <Sparkles className="h-4 w-4" />
                          Find Out More
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="space-y-5 text-[15px] text-on-surface-variant leading-relaxed">
                      {intelligenceModal.explanation.split('\n\n').map((paragraph, idx) => {
                        if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                          return <h3 key={idx} className="text-lg font-black text-on-surface mt-8 mb-2">{paragraph.replace(/\*\*/g, '')}</h3>;
                        }
                        return <p key={idx} dangerouslySetInnerHTML={{ __html: paragraph.replace(/\*\*([^*]+)\*\*/g, '<span class="font-bold text-on-surface">$1</span>') }} />;
                      })}
                    </div>

                    {intelligenceModal.optimizedRawText && intelligenceModal.optimizedRawText !== analysis.rawText && (
                      <div className="pt-8 border-t border-outline/10 flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-success">
                            <CheckCircle2 className="h-4 w-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest italic opacity-60">Optimization Prepared</p>
                          </div>
                          <button 
                            onClick={() => setShowDiffInModal(!showDiffInModal)}
                            className="px-4 py-1.5 bg-surface-container-high hover:bg-surface-container-highest rounded-full text-[9px] font-black uppercase tracking-widest text-primary transition-all border border-outline/10 flex items-center gap-2"
                          >
                            <Activity className="h-3 w-3" />
                            {showDiffInModal ? 'Hide Breakdown' : 'Verify Improvements'}
                          </button>
                        </div>

                        {showDiffInModal && (
                           <div className="p-8 bg-surface-container-low border border-outline/20 rounded-[24px] max-h-[350px] overflow-y-auto custom-scrollbar space-y-4">
                              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface/30 mb-6">Structural Comparison</h4>
                              {(intelligenceModal.optimizedRawText || '').split('\n\n').map((para, i) => {
                                const prevParas = (analysis.rawText || '').split('\n\n');
                                const prevPara = prevParas[i] || '';
                                if (para === prevPara) return null; // Only show changed paragraphs in the verification window

                                return (
                                  <div key={i} className="pl-4 border-l-2 border-success/30 py-2">
                                    <p className="text-[8px] font-black text-success uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                      <Sparkles className="h-3 w-3" />
                                      Refinement {i + 1}
                                    </p>
                                    <div className="text-[13px] font-serif leading-relaxed text-on-surface">
                                      {para.split(' ').map((word, idx) => (
                                        <span key={idx} className={!prevPara.includes(word) ? 'text-success font-bold' : ''}>
                                          {word}{' '}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }).filter(Boolean).length === 0 && (
                                <p className="text-center py-10 text-[10px] font-bold text-on-surface/30 uppercase tracking-[0.2em]">Minimal structural deviation detected</p>
                              )}
                           </div>
                        )}
                        
                        <div className="flex items-center gap-4">
                          <button
                            onClick={closeIntelligenceModal}
                            className="flex-1 py-4 bg-surface-container border border-outline/10 text-on-surface rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-surface-container-high transition-all"
                          >
                            Ignore Suggestion
                          </button>
                          <button
                            onClick={applyNeuralFix}
                            disabled={intelligenceModal.isApplyingChange}
                            className="flex-[2] py-4 bg-success text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.01] active:scale-[0.99] transition-all shadow-xl shadow-success/20 flex items-center justify-center gap-3 disabled:opacity-50"
                          >
                            {intelligenceModal.isApplyingChange ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Applying Optimization...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-4 w-4" />
                                Apply: {intelligenceModal.changeSummary || 'Smart Optimization'}
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-[10px] font-bold text-on-surface/30 text-center px-10 uppercase tracking-widest leading-relaxed">
                          Applying this choice will commit the refined text to the document vault and trigger a full comparison highlight.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
