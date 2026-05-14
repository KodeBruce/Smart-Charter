import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, Bell, HelpCircle, AlertTriangle, 
  ArrowRight, Info, Gavel, Search, Send, 
  MessageSquare, Sparkles, ChevronRight, User,
  ArrowLeft, Download, Share2, Calendar, Loader2, X,
  Maximize2, Minimize2, Shield, FileText
} from 'lucide-react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { semanticSearch, ContractAnalysis } from '../services/geminiService';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function ContractDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(!!id);

  const initialAnalysis = location.state?.analysis as ContractAnalysis | undefined;

  const [isRemediationOpen, setIsRemediationOpen] = useState(false);
  const [selectedClause, setSelectedClause] = useState<any>(null);
  const [isDocumentFullScreen, setIsDocumentFullScreen] = useState(false);

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
              setAnalysis(JSON.parse(data.analysis));
            }
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

  const [activeTab, setActiveTab] = useState<'document' | 'overview' | 'clauses' | 'parties'>('document');
  const mainTabs = [
    { id: 'document', label: 'Document', icon: FileText },
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'clauses', label: 'Analysis', icon: Gavel },
    { id: 'parties', label: 'Parties', icon: User },
  ] as const;

  const exportToPDF = () => {
    const doc = new jsPDF();
    const margin = 20;
    let y = 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("Smart Charter", margin, y);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Intelligence Protocol: Contract Analysis Manifest", margin, y + 8);
    
    y += 25;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DOCUMENT PROFILE", margin, y);
    y += 6;
    doc.line(margin, y, 190, y);
    y += 10;

    doc.setFontSize(12);
    doc.text(`File Name: ${analysis.name}`, margin, y);
    y += 8;
    doc.text(`Counterparty: ${analysis.counterparty}`, margin, y);
    y += 8;
    doc.text(`Jurisdiction: ${analysis.jurisdiction}`, margin, y);
    y += 8;
    doc.text(`Governing Law: ${analysis.governingLaw}`, margin, y);
    y += 8;
    doc.text(`Notice Period: ${analysis.terminationNotice}`, margin, y);
    y += 8;
    doc.text(`Effective Expiry: ${analysis.expiry}`, margin, y);
    y += 8;
    doc.text(`Risk Evaluation: ${analysis.riskLevel} (${analysis.riskScore}/100)`, margin, y);
    
    y += 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("VERIFICATION PROFILE", margin, y);
    y += 6;
    doc.line(margin, y, 190, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.text("PARTIES", margin, y);
    y += 6;
    analysis.parties.forEach((party) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${party.name} (${party.role})`, margin + 5, y);
      doc.setFont("helvetica", "normal");
      doc.text(`Type: ${party.entityType} | Status: ${party.status}`, margin + 5, y + 5);
      y += 12;
    });

    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("SIGNATORIES", margin, y);
    y += 6;
    analysis.signatories.forEach((sig) => {
      doc.setFont("helvetica", "normal");
      doc.text(`• ${sig.name} - ${sig.title} (${sig.party})`, margin + 5, y);
      y += 7;
    });

    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("EXECUTIVE BRIEF", margin, y);
    y += 6;
    doc.line(margin, y, 190, y);
    y += 10;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const splitSummary = doc.splitTextToSize(analysis.summary, 170);
    doc.text(splitSummary, margin, y);
    y += (splitSummary.length * 6) + 15;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("KEY OBLIGATIONS", margin, y);
    y += 6;
    doc.line(margin, y, 190, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    analysis.keyObligations.forEach((obl) => {
      const splitObl = doc.splitTextToSize(`• ${obl}`, 165);
      doc.text(splitObl, margin + 5, y);
      y += (splitObl.length * 5) + 2;
    });

    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("MISSING PROTECTIONS & REMEDIATION", margin, y);
    y += 6;
    doc.line(margin, y, 190, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    analysis.missingProtections.forEach((miss) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`• ${miss.title}`, margin + 5, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const splitSeg = doc.splitTextToSize(`Suggestion: ${miss.suggestion}`, 160);
      doc.text(splitSeg, margin + 10, y);
      y += (splitSeg.length * 5) + 2;
      doc.setFont("helvetica", "italic");
      doc.text(`Reference: ${miss.reference}`, margin + 10, y);
      y += 8;
    });

    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("CRITICAL CLAUSE EXTRACTION", margin, y);
    y += 6;
    doc.line(margin, y, 190, y);
    y += 10;

    analysis.keyClauses.forEach((clause, index) => {
      if (y > 250) {
        doc.addPage();
        y = 30;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`${index + 1}. ${clause.title} [${clause.priority}]`, margin, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const splitContent = doc.splitTextToSize(clause.content, 170);
      doc.text(splitContent, margin + 5, y);
      y += (splitContent.length * 5) + 10;
    });

    if (y > 250) {
      doc.addPage();
      y = 30;
    }
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("SYSTEM DIRECTIVE", margin, y);
    y += 6;
    doc.line(margin, y, 190, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.text(analysis.directive, margin, y);

    doc.save(`${analysis.name.replace('.pdf', '')}_analysis.pdf`);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const context = analysis.rawText || document.querySelector('section.flex-1')?.textContent || '';
      const result = await semanticSearch(searchQuery, context);
      setSearchResult(result);
    } catch (err) {
      console.error(err);
      setSearchResult('Error processing query.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-surface">
      {/* Refined Header */}
      <header className="flex h-14 w-full items-center justify-between border-b border-outline bg-surface px-6 z-40">
        <div className="flex items-center gap-3 min-w-[200px]">
          <button 
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-on-surface/30 hover:text-on-surface hover:bg-surface-container transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-[10px] font-bold text-primary tracking-tight">{analysis.name}</h2>
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-on-surface-variant/80">Intelligent Legal Review</p>
          </div>
        </div>

        {/* Centered Navigation */}
        <nav className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-outline">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-[0.15em] transition-all relative ${
                activeTab === tab.id 
                  ? 'bg-primary text-white shadow-lg scale-105' 
                  : 'text-on-surface/40 hover:text-primary hover:bg-surface-container'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTabIndicator"
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-secondary rounded-full"
                />
              )}
            </button>
          ))}
        </nav>
        
        <div className="flex items-center gap-2 min-w-[200px] justify-end">
          <button 
            onClick={exportToPDF}
            className="p-1.5 rounded-lg text-on-surface/60 hover:bg-surface-container-low transition-all"
            title="Export"
          >
            <Download className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-outline mx-1" />
          <button className="bg-primary text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-primary/10 hover:scale-105">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Finalize
          </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-surface-container-lowest">
          <AnimatePresence mode="wait">
            {activeTab === 'document' && (
              <motion.section 
                key="document"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`w-full p-6 lg:p-8 flex flex-col items-center transition-all duration-500 ease-in-out ${
                  isDocumentFullScreen ? 'fixed inset-0 z-[60] bg-white overflow-y-auto' : ''
                }`}
              >
                <div className="mb-6 flex justify-end w-full max-w-[720px]">
                   <button 
                    onClick={() => setIsDocumentFullScreen(!isDocumentFullScreen)}
                    className="p-1.5 hover:bg-primary/5 rounded-lg transition-all text-primary/60 hover:text-primary border border-outline/30"
                  >
                    {isDocumentFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div className={`${isDocumentFullScreen ? 'max-w-[1000px]' : 'max-w-[720px]'} w-full flex flex-col gap-12 pb-32 transition-all duration-500`}>
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

                  <div className="space-y-10 font-serif text-[14px] leading-relaxed text-on-surface/80">
                    <section className="space-y-4">
                      <p>This Master Services Agreement ("Agreement") is formally entered into by and between <span className="font-sans font-bold text-primary/70 border-b border-primary/10">Acme Corp</span> ("Client") and <span className="font-sans font-bold text-primary/70 border-b border-primary/10">Global Services Inc</span> ("Provider").</p>
                    </section>
                    
                    <section id="liability" className="space-y-5 pt-10 border-t border-outline/20">
                      <h4 className="font-sans text-[8px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50">Sec 08: Allocation of Liability</h4>
                      <div className="space-y-4">
                        <p>8.1 Each Party shall indemnify and hold harmless the other from and against any third-party claims arising out of the indemnifying party's gross negligence or willful misconduct.</p>
                        
                        <div className="p-5 bg-surface-container-low border-l-2 border-outline-variant font-serif italic text-on-surface-variant/80 text-sm">
                          8.2 Limitation of Liability. EXCEPT FOR OBLIGATIONS UNDER SECTION 8.3, IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES.
                        </div>
                        
                        <div className="p-6 border-l-2 border-error/20 space-y-3 bg-error/[0.01]">
                          <div className="flex items-center gap-1.5">
                             <AlertTriangle className="h-2.5 w-2.5 text-error/40" />
                             <span className="text-[7px] font-bold uppercase tracking-widest text-error/60">Risk Anomaly Detected</span>
                          </div>
                          <p className="text-base font-bold text-primary font-sans leading-relaxed tracking-tight">
                            8.3 Uncapped Liability. Provider's liability for data breaches, intellectual property infringement, and confidentiality violations shall be <span className="text-error">UNLIMITED</span> and not subject to any caps.
                          </p>
                        </div>
                      </div>
                    </section>

                    <section id="temporal" className="space-y-6 pt-12 border-t border-outline/30">
                      <h4 className="font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface-variant/60">Sec 09: Temporal Integrity</h4>
                      <div className="space-y-6">
                        <p>9.1 This Agreement shall commence on the Effective Date and remain in effect for a period of three (3) years unless terminated earlier as provided herein.</p>
                        <div className="p-6 bg-surface-container-low border-l-2 border-primary/20 text-on-surface-variant/80 font-sans text-xs">
                          9.2 Termination for Convenience. Client may terminate this Agreement at any time upon thirty (30) days prior written notice. Provider shall have no right to terminate for convenience.
                        </div>
                      </div>
                    </section>
                  </div>

                  <footer className="pt-24 flex justify-center">
                    <span className="text-[8px] font-bold text-on-surface-variant/10 uppercase tracking-[0.5em]">End of Document Review</span>
                  </footer>
                </div>
              </motion.section>
            )}

            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="max-w-5xl mx-auto p-6 space-y-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Risk Score */}
                  <div className="lg:col-span-5 p-6 bg-surface border border-outline rounded-3xl shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/60">Risk Posture</h3>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-bold uppercase tracking-widest ${analysis.riskLevel === 'High Risk' ? 'text-error' : 'text-success'}`}>
                          {analysis.riskLevel === 'High Risk' ? 'Exposed' : 'Stable'}
                        </span>
                        <div className={`w-1.5 h-1.5 rounded-full ${analysis.riskLevel === 'High Risk' ? 'bg-error animate-pulse' : 'bg-success'}`} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-black text-primary tracking-tighter">{analysis.riskScore}</span>
                        <span className="text-sm font-bold text-on-surface-variant/40">/100</span>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="h-1.5 bg-outline/30 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${analysis.riskScore}%` }}
                            transition={{ duration: 1.5, ease: "circOut" }}
                            className={`${analysis.riskLevel === 'High Risk' ? 'bg-error' : analysis.riskScore > 50 ? 'bg-warning' : 'bg-success'} h-full`} 
                          />
                        </div>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/50">Overall Security Rating</p>
                      </div>
                    </div>
                  </div>

                  {/* Primary Advice */}
                  <div className="lg:col-span-7 p-6 bg-primary rounded-3xl text-white shadow-lg shadow-primary/5 flex flex-col justify-center">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-white/10 rounded-xl">
                        <Gavel className="h-4 w-4 text-secondary" />
                      </div>
                      <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/50">Strategic Direction</span>
                    </div>
                    <p className="text-base font-bold leading-relaxed tracking-tight">
                      {analysis.directive}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Timeline Visualization */}
                  <div className="lg:col-span-7 p-6 bg-surface border border-outline rounded-3xl shadow-sm">
                    <h3 className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/60 mb-6">Execution Lifecycle</h3>
                    <div className="relative pt-4 px-2">
                       <div className="absolute top-[32px] left-0 right-0 h-px bg-outline/40" />
                       <div className="flex justify-between relative mt-6">
                          {[
                            { label: 'Start', id: 'start', date: 'Oct 24, 2023', color: 'bg-primary' },
                            { label: 'Current', id: 'current', date: 'May 14, 2026', color: 'bg-secondary' },
                            { label: 'Expiry', id: 'expiry', date: analysis.expiry, color: 'bg-outline' }
                          ].map((node) => (
                            <div key={`timeline-node-${node.id}`} className="flex flex-col items-center">
                               <div className={`w-2.5 h-2.5 rounded-full ${node.color} border-2 border-surface -mt-[33px] z-10 shadow-sm`} />
                               <p className={`text-[7px] font-black uppercase tracking-widest ${node.color === 'bg-primary' ? 'text-primary' : 'text-on-surface-variant/60'} mb-0.5 mt-2`}>{node.label}</p>
                               <p className="text-[10px] font-bold text-on-surface">{node.date}</p>
                            </div>
                          ))}
                       </div>
                       <div className="mt-8 flex items-center justify-between p-4 bg-surface-container/50 rounded-2xl border border-outline/50">
                          <div className="flex flex-col">
                             <span className="text-[8px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-1">Time to Exit</span>
                             <span className="text-lg font-black text-primary">184 DAYS</span>
                          </div>
                          <div className="flex flex-col text-right">
                             <span className="text-[8px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-1">Duration Active</span>
                             <span className="text-lg font-black text-primary/40">932 DAYS</span>
                          </div>
                       </div>
                    </div>
                  </div>

                  {/* Governance & Gaps */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-5 bg-surface border border-outline rounded-2xl">
                        <p className="text-[7px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1.5">Governing Law</p>
                        <p className="text-xs font-bold text-primary truncate">{analysis.governingLaw}</p>
                      </div>
                      <div className="p-5 bg-surface border border-outline rounded-2xl">
                        <p className="text-[7px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1.5">Notice Period</p>
                        <p className="text-xs font-bold text-primary truncate">{analysis.terminationNotice}</p>
                      </div>
                    </div>

                    <div className="p-6 bg-error/[0.02] border border-error/10 rounded-3xl space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-3 w-3 text-error" />
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-error">Gap Vulnerabilities</h3>
                      </div>
                      <div className="space-y-3">
                        {analysis.missingProtections.slice(0, 2).map((miss, i) => (
                          <div key={`miss-${i}`} className="p-3 bg-white/40 rounded-xl border border-error/5 group hover:bg-white transition-all shadow-sm">
                            <p className="text-[9px] font-black text-error uppercase tracking-tight mb-1">{miss.title}</p>
                            <p className="text-[10px] text-on-surface-variant font-medium leading-relaxed">{miss.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
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
                className="max-w-5xl mx-auto p-6 space-y-6"
              >
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <h2 className="text-3xl font-black text-primary tracking-tighter">Strategic Analysis</h2>
                    <p className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-[0.3em]">Clause-by-clause intelligence mapping</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 bg-surface border border-outline rounded-lg text-[8px] font-bold uppercase tracking-widest hover:bg-surface-container transition-colors">All Categories</button>
                    <button className="px-3 py-1.5 bg-primary text-white rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-lg shadow-primary/5 hover:scale-105 transition-all">Access Audit</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {analysis.keyClauses.map((item, i) => (
                    <motion.div 
                      key={`detail-clause-${i}`}
                      whileHover={{ y: -2 }}
                      className={`p-6 bg-white border border-outline rounded-2xl border-l-4 ${
                        item.priority === 'Critical' ? 'border-l-error' : 
                        item.priority === 'Standard' ? 'border-l-warning' : 
                        'border-l-success'
                      } shadow-sm group hover:shadow-md transition-all`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                             item.priority === 'Critical' ? 'bg-error text-white' : 
                             item.priority === 'Standard' ? 'bg-warning text-primary' : 
                             'bg-success text-white'
                          }`}>{item.priority}</span>
                          <h3 className="text-lg font-bold text-primary tracking-tight mt-1">{item.title}</h3>
                        </div>
                        <button className="p-1.5 hover:bg-surface-container rounded-lg text-primary/20 group-hover:text-primary transition-all">
                          <Maximize2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="bg-surface-container-low p-4 rounded-xl border border-outline/30 italic text-xs text-primary/80 mb-6 font-serif leading-relaxed">
                        "{item.content}"
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 mb-6 border-b border-outline/30">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Info className="h-3 w-3 text-primary/40" />
                            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-primary/50">Implications</span>
                          </div>
                          <p className="text-[11px] text-on-surface-variant font-medium leading-relaxed">{item.implications}</p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3 text-error/40" />
                            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-error/50">Risk Findings</span>
                          </div>
                           <p className="text-[11px] text-error/70 font-bold leading-relaxed">{item.risk}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[9px] text-primary/50 font-bold italic">
                          <Gavel className="h-3 w-3" />
                          {item.citation}
                        </div>
                        <button 
                          onClick={() => {
                            setSelectedClause(item);
                            setIsRemediationOpen(true);
                          }}
                          className="px-5 py-2 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/5 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 group"
                        >
                          <Sparkles className="h-3.5 w-3.5 group-hover:rotate-12 transition-transform" />
                          Remediate
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'parties' && (
              <motion.div 
                key="parties"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="max-w-5xl mx-auto p-6 space-y-8"
              >
                <div className="text-center space-y-2 mb-4">
                   <h2 className="text-4xl font-black text-primary tracking-tighter">Engagement Matrix</h2>
                   <p className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-[0.4em]">Signatory Authority Mapping</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Entity Information */}
                  <div className="space-y-4">
                    <h3 className="text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40 ml-4">Verified Entities</h3>
                    <div className="grid grid-cols-1 gap-3">
                      {analysis.parties.map((party, i) => (
                        <div key={`detail-party-${i}`} className="p-5 bg-white border border-outline rounded-2xl flex items-center justify-between hover:shadow-md transition-all group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center border border-outline-variant group-hover:bg-primary/5 transition-all">
                              <Shield className="h-5 w-5 text-on-surface-variant/30 group-hover:text-primary transition-colors" />
                            </div>
                            <div>
                               <p className="text-base font-black text-primary tracking-tight leading-none mb-1">{party.name}</p>
                               <div className="flex items-center gap-2">
                                 <span className="text-[8px] font-bold text-primary/40 uppercase tracking-widest">{party.role}</span>
                                 <div className="w-1 h-1 rounded-full bg-outline/40" />
                                 <span className="text-[8px] font-bold text-primary/40 uppercase tracking-widest">{party.entityType}</span>
                               </div>
                            </div>
                          </div>
                          <div className={`px-2.5 py-1 rounded-full text-[7px] font-black uppercase tracking-widest ${
                             party.status === 'Verified' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'
                          }`}>
                             {party.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Authority Mapping */}
                  <div className="space-y-4">
                    <h3 className="text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40 ml-4">Signatory Board</h3>
                    <div className="grid grid-cols-1 gap-3">
                       {analysis.signatories.map((sig, i) => (
                        <div key={`detail-sig-${i}`} className="flex items-center gap-4 p-5 bg-white border border-outline rounded-2xl transition-all hover:bg-surface-container-low group">
                           <div className="w-12 h-12 rounded-xl bg-primary shadow-lg shadow-primary/10 flex items-center justify-center shrink-0">
                             <User className="h-6 w-6 text-secondary" />
                           </div>
                           <div className="flex-1">
                              <p className="text-base font-black text-primary tracking-tight mb-0.5 leading-none">{sig.name}</p>
                              <p className="text-[8px] text-on-surface-variant/50 font-bold uppercase tracking-widest mb-2 leading-none">{sig.title}</p>
                              <div className="flex items-center gap-1.5 p-1 px-2 bg-primary/5 rounded-lg w-fit border border-primary/5">
                                 <Gavel className="h-2.5 w-2.5 text-primary/30" />
                                 <p className="text-[7px] font-black text-primary/30 uppercase tracking-widest">{sig.party}</p>
                              </div>
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

        {/* Neural Search - Always visible footer logic */}
        <div className="fixed bottom-12 right-12 z-50">
           <AnimatePresence>
              {searchResult && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="mb-6 p-8 bg-primary text-white rounded-[40px] text-sm font-medium leading-relaxed shadow-2xl border border-white/10 w-[420px] relative group"
                >
                  <button 
                    onClick={() => setSearchResult(null)}
                    className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <X className="h-5 w-5 text-white/40" />
                  </button>
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles className="h-5 w-5 text-secondary animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary">Neural Insight Extraction</span>
                  </div>
                  {searchResult}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="group relative">
               <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-[32px] blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
               <div className="relative flex items-center gap-3 bg-surface p-2 rounded-[32px] border border-outline shadow-2xl w-[420px]">
                  <div className="p-3 bg-primary/5 rounded-2xl">
                     <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <input
                    type="text"
                    placeholder="Ask Neural Engine about document nodes..."
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
                  <div className="p-4 bg-secondary/[0.02] border border-secondary/20 rounded-xl shadow-inner group">
                    <p className="text-[11px] text-on-surface font-semibold leading-relaxed tracking-tight group-hover:text-primary transition-colors">
                      {(selectedClause.title || '').includes('Liability') ? (
                        `"Notwithstanding any other provision, the Provider's total aggregate liability arising out of or related to this Agreement (including data breach) shall not exceed two (2) times the total fees paid by Client in the twelve (12) months preceding the claim."`
                      ) : (
                        `"The parties agree that ${selectedClause.title} shall be modified to align with industry standard protections and Delaware governing law, ensuring mutual liability caps and proportional risk allocation."`
                      )}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-surface-container/50 rounded-xl border border-outline/40">
                   <div className="flex items-center gap-2 mb-1.5">
                     <Info className="h-3.5 w-3.5 text-primary/40" />
                     <p className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">Analysis Insight</p>
                   </div>
                   <p className="text-[10px] text-on-surface-variant/70 font-medium leading-relaxed">This amendment introduces a liability cap based on annual contract value, protecting the entity from catastrophic loss while remaining commercially reasonable.</p>
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
                  onClick={() => {
                    setIsRemediationOpen(false);
                  }}
                  className="flex-[2] py-3 bg-secondary text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest shadow-lg shadow-secondary/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Implement & Sync
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
