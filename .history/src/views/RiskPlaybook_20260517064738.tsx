import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, AlertTriangle, CheckCircle2, 
  ChevronRight, BookOpen, Clock, X, Maximize2, Minimize2,
  Search, Info, Zap, Scale, FileWarning,
  Sparkles, Loader2, Calendar
} from 'lucide-react';
import { generateJson } from '../services/geminiService';
import { SchemaType } from "@google/generative-ai";
import TopBar from '../components/TopBar';

interface AuditLog {
  id: string;
  userName: string;
  action: string;
  timestamp: string;
}

interface PlaybookDetail {
  id: string;
  title: string;
  risk: 'Low' | 'Medium' | 'High';
  count: number;
  status: string;
  description: string;
  jurisdiction?: string;
  referencedFrameworks?: string[];
  jurisdictionalAlert?: string;
  guidelines: {
    title: string;
    description: string;
    mandatory: boolean;
    standard_language?: string;
  }[];
  riskThresholds: {
    category: string;
    limit: string;
    indicator: string;
  }[];
  auditLogs: AuditLog[];
}

const PLAYBOOKS: PlaybookDetail[] = [
  { 
    id: '1',
    title: 'Standard Service Agreement', 
    risk: 'Low', 
    count: 124, 
    status: 'Optimized',
    jurisdiction: 'Global',
    description: 'General services engagement for non-critical vendors and operational support.',
    guidelines: [
      { title: 'Payment Terms', description: 'Net 30 or Net 45 is standard. Always avoid Upfront payments without milestones.', mandatory: true, standard_language: 'Payment shall be made within thirty (30) days of receipt of a valid invoice.' },
      { title: 'Intellectual Property', description: 'Work-for-hire clauses must be present for any custom deliverables.', mandatory: true },
      { title: 'Termination for Convenience', description: 'Ensure at least a 30-day notice period for the company to exits without cause.', mandatory: false }
    ],
    riskThresholds: [
      { category: 'Liability Cap', limit: '1x Annual Fees', indicator: 'Financial Exposure' },
      { category: 'Notice Period', limit: '30 Days', indicator: 'Operational Continuity' }
    ],
    auditLogs: [{ id: 'al1', userName: 'System', action: 'Framework initialized', timestamp: 'Initial Release' }]
  },
  { 
    id: '2',
    title: 'Master Services Agreement (MSA)', 
    risk: 'Medium', 
    count: 45, 
    status: 'Review Required',
    jurisdiction: 'EU (GDPR)',
    referencedFrameworks: ['GDPR', 'EU Standard Contractual Clauses'],
    jurisdictionalAlert: 'Strict alignment with EU Data Protection Board (EDPB) guidelines is mandatory for cross-border data flows.',
    description: 'Framework agreements for long-term strategic partnerships and high-value sourcing.',
    guidelines: [
      { title: 'Indemnification Scope', description: 'Limit indemnification to 3rd party IP claims and data breaches only.', mandatory: true },
      { title: 'Data Privacy (DPA)', description: 'Must reference the current Standard Contractual Clauses (SCCs) for cross-border transfers.', mandatory: true, standard_language: 'Data processing shall be governed by the Data Processing Addendum attached as Exhibit B.' }
    ],
    riskThresholds: [
      { category: 'Insurance Limit', limit: '$5,000,000', indicator: 'Compliance' },
      { category: 'Audit Rights', limit: 'Annual', indicator: 'Security Governance' }
    ],
    auditLogs: [{ id: 'al2', userName: 'System', action: 'Framework initialized', timestamp: 'Initial Release' }]
  },
  { 
    id: '3',
    title: 'Non-Disclosure Agreement (NDA)', 
    risk: 'Low', 
    count: 210, 
    status: 'Automated',
    jurisdiction: 'United States',
    description: 'Standard confidentiality protections for early-stage discussions and data sharing.',
    guidelines: [
      { title: 'Term of Confidentiality', description: '3 years post-termination is standard. Avoid "perpetual" for non-trade secrets.', mandatory: true },
      { title: 'Residuals Clause', description: 'Always include to protect developers from unintentional knowledge reuse.', mandatory: false }
    ],
    riskThresholds: [
      { category: 'Survival Period', limit: '3 Years', indicator: 'Information Longevity' }
    ],
    auditLogs: [{ id: 'al3', userName: 'System', action: 'Framework initialized', timestamp: 'Initial Release' }]
  }
];

const JURISDICTIONS = [
  'Global',
  'United States',
  'United Kingdom',
  'European Union',
  'South Africa',
  'Australia',
  'Singapore',
  'UAE'
];

export default function RiskPlaybook() {
  const [playbooks, setPlaybooks] = useState<PlaybookDetail[]>(PLAYBOOKS);
  const [selectedPlaybook, setSelectedPlaybook] = useState<PlaybookDetail | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<PlaybookDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // AI Generator States
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [newPlaybookName, setNewPlaybookName] = useState('');
  const [selectedJurisdiction, setSelectedJurisdiction] = useState(JURISDICTIONS[0]);

  const handleCreateManual = () => {
    if (!newPlaybookName) return;
    const newPlaybook: PlaybookDetail = {
      id: crypto.randomUUID(),
      title: newPlaybookName,
      risk: 'Medium',
      count: 0,
      status: 'Custom Draft',
      jurisdiction: selectedJurisdiction,
      description: 'Custom review framework for ' + newPlaybookName + ' (' + selectedJurisdiction + ')',
      guidelines: [
        { title: 'Standard Clause Review', description: 'Begin by defining your internal review standards for this framework.', mandatory: true }
      ],
      riskThresholds: [
        { category: 'Financial Limit', limit: 'Set Threshold', indicator: 'Exposure' }
      ],
      auditLogs: [{ id: crypto.randomUUID(), userName: 'User', action: 'Manually created framework for ' + selectedJurisdiction, timestamp: 'Just now' }]
    };
    setPlaybooks([newPlaybook, ...playbooks]);
    setSelectedPlaybook(newPlaybook);
    setIsManualModalOpen(false);
    setNewPlaybookName('');
    setIsEditing(true);
    setEditForm(newPlaybook);
  };

  const filteredPlaybooks = playbooks.filter(p => 
    (p.title?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const startEditing = () => {
    setEditForm(selectedPlaybook);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const saveChanges = () => {
    if (!editForm) return;
    const log: AuditLog = {
      id: crypto.randomUUID(),
      userName: 'User',
      action: 'Updated framework configurations',
      timestamp: 'Just now'
    };
    const updatedPlaybooks = playbooks.map(p => p.id === editForm.id ? { ...editForm, auditLogs: [log, ...p.auditLogs] } : p);
    setPlaybooks(updatedPlaybooks);
    setSelectedPlaybook({ ...editForm, auditLogs: [log, ...selectedPlaybook!.auditLogs] });
    setIsEditing(false);
    setEditForm(null);
  };

  const updateField = (field: keyof PlaybookDetail, value: any) => {
    if (!editForm) return;
    setEditForm({ ...editForm, [field]: value });
  };

  const updateGuideline = (index: number, value: Partial<PlaybookDetail['guidelines'][0]>) => {
    if (!editForm) return;
    const newGuidelines = [...editForm.guidelines];
    newGuidelines[index] = { ...newGuidelines[index], ...value };
    setEditForm({ ...editForm, guidelines: newGuidelines });
  };

  const generateWithAi = async () => {
    if (!aiPrompt.trim()) return;
    
    setIsGenerating(true);
    setAiError(null);
    
    try {
      const prompt = `Generate a professional contract review playbook for: ${aiPrompt}. 
        JURISDICTION: ${selectedJurisdiction}
        
        The playbook MUST reference specific legal frameworks relevant to ${selectedJurisdiction} (e.g. GDPR for EU, Companies Act for UK/SA, UCC for US) AND relevant international frameworks (e.g. UNIDROIT, ICC).
        
        It MUST also include a "jurisdictionalAlert" field that provides a high-level warning about specific local legal nuances (e.g., "South African contracts must comply with POPIA for data processing").

        Return a single JSON object matching this structure:
        {
          "title": "Short Descriptive Title",
          "risk": "Low" | "Medium" | "High",
          "description": "Very brief summary of the contract purpose",
          "jurisdiction": "${selectedJurisdiction}",
          "referencedFrameworks": ["Framework Name 1", "Framework Name 2"],
          "jurisdictionalAlert": "Brief alert about local laws",
          "guidelines": [{ "title": "Clause Name", "description": "Specific internal guideline for reviewing this clause, referencing ${selectedJurisdiction} legal requirements where applicable", "mandatory": boolean, "standard_language": "Optional company-preferred wording" }],
          "riskThresholds": [{ "category": "Category Name", "limit": "Max/Min Acceptable value", "indicator": "Why this matters" }]
        }`;

      const schema = {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          risk: { type: SchemaType.STRING, enum: ["Low", "Medium", "High"], format: "enum" },
          description: { type: SchemaType.STRING },
          jurisdiction: { type: SchemaType.STRING },
          referencedFrameworks: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          jurisdictionalAlert: { type: SchemaType.STRING },
          guidelines: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING },
                description: { type: SchemaType.STRING },
                mandatory: { type: SchemaType.BOOLEAN },
                standard_language: { type: SchemaType.STRING }
              },
              required: ["title", "description", "mandatory"]
            }
          },
          riskThresholds: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                category: { type: SchemaType.STRING },
                limit: { type: SchemaType.STRING },
                indicator: { type: SchemaType.STRING }
              },
              required: ["category", "limit", "indicator"]
            }
          }
        },
        required: ["title", "risk", "description", "jurisdiction", "referencedFrameworks", "guidelines", "riskThresholds"]
      };

      const result = await generateJson(prompt, schema);
      const newPlaybook: PlaybookDetail = {
        ...result,
        id: crypto.randomUUID(),
        count: 0,
        status: 'AI Generated',
        auditLogs: [{ id: crypto.randomUUID(), userName: 'AI Engine', action: 'Generated from prompt', timestamp: 'Just now' }]
      };

      setPlaybooks([newPlaybook, ...playbooks]);
      setSelectedPlaybook(newPlaybook);
      setIsAiModalOpen(false);
      setAiPrompt('');
    } catch (err) {
      console.error('AI Generation error:', err);
      setAiError('Failed to generate playbook. Please check your prompt or try again later.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden relative">
      <TopBar 
        title="Review Framework"
        actions={
          <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsAiModalOpen(true)}
                className="px-4 py-1.5 bg-primary text-on-primary rounded text-[9px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Sparkles className="h-3 w-3 mr-1 inline" />
                AI Generate
              </button>
          </div>
        }
      />

      <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-0.5">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40 leading-none mb-2">Review Framework</p>
          <div className="flex items-end justify-between">
            <h1 className="text-2xl font-black text-primary tracking-tighter leading-none">Review Playbooks</h1>
            <div className="flex items-center gap-1.5 text-[9px] font-black text-on-surface/30 uppercase tracking-[0.2em]">
              <Calendar className="h-3 w-3" />
              <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>
            </div>
          </div>
        </header>

        <section id="walkthrough-risk-view" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlaybooks.map((playbook, i) => (
            <motion.div
              key={playbook.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => {
                setSelectedPlaybook(playbook);
                setIsEditing(false);
              }}
              className="bg-surface-container-low border border-outline rounded-xl sm:rounded-[24px] p-4 sm:p-6 flex flex-col justify-between sm:hover:shadow-xl transition-all group cursor-pointer"
            >
              <div className="mb-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-xl bg-surface border border-outline flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-all shadow-sm">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className={`text-[8px] font-extrabold uppercase tracking-widest ${
                    playbook.risk === 'High' ? 'text-error' : 
                    playbook.risk === 'Medium' ? 'text-warning' : 
                    'text-success'
                  }`}>
                    {playbook.risk}
                  </div>
                </div>
                <h3 className="font-bold text-primary tracking-tight leading-snug">{playbook.title}</h3>
                <div className="flex items-center gap-2 mt-1 mb-2">
                  <span className="text-[7px] font-bold px-2 py-0.5 bg-primary/5 text-primary/60 rounded-full border border-primary/10 uppercase tracking-widest">
                    {playbook.jurisdiction || 'Global'}
                  </span>
                </div>
                <p className="text-[10px] text-on-surface-variant/70 line-clamp-2 leading-relaxed">
                  {playbook.description}
                </p>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-outline">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-secondary-content" />
                  <span className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">{playbook.status}</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] font-extrabold text-primary uppercase tracking-widest group-hover:gap-2 transition-all">
                  Open Guide <ChevronRight className="h-3 w-3" />
                </div>
              </div>
            </motion.div>
          ))}
        </section>

        {/* Global Action */}
        <section className="p-4 sm:p-8 bg-[#0D0D0D] rounded-xl sm:rounded-[40px] text-white border border-white/5 relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-secondary fill-secondary" />
              <p className="text-[9px] font-extrabold uppercase tracking-[0.4em] text-white/50">Intelligence Engine</p>
            </div>
            <h4 className="text-2xl font-bold mb-3 tracking-tighter">Architect Custom Framework</h4>
            <p className="text-xs text-white/40 max-w-[440px] leading-relaxed font-medium mb-8">
              Don't see a playbook that matches your specific transaction volume? Use the builder to define automated risk vectors, mandatory clauses, and signature workflows.
            </p>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsAiModalOpen(true)}
                className="px-4 sm:px-8 py-3 bg-primary text-on-primary text-[11px] font-extrabold uppercase tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-sm sm:shadow-xl flex items-center gap-2"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate with AI
              </button>
              <button 
                onClick={() => setIsManualModalOpen(true)}
                className="px-8 py-3 bg-white/5 border border-white/10 text-white text-[11px] font-extrabold uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all font-bold"
              >
                Create Manually
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Manual Creation Modal */}
      <AnimatePresence>
        {isManualModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManualModalOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[400px] bg-surface rounded-xl sm:rounded-[32px] p-4 sm:p-6 z-[70] shadow-sm sm:shadow-2xl border border-outline"
            >
               <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-on-primary">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-primary tracking-tight">Manual Playbook</h2>
                  <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Review Framework</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-2">Framework Title</p>
                  <input 
                    value={newPlaybookName}
                    onChange={(e) => setNewPlaybookName(e.target.value)}
                    placeholder="e.g. Master Services Agreement"
                    className="w-full bg-surface-container-low border border-outline rounded-xl p-3 text-sm font-medium outline-none focus:ring-1 focus:ring-secondary/40"
                  />
                </div>

                <div>
                  <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-2">Primary Jurisdiction</p>
                  <div className="grid grid-cols-2 gap-2">
                    {JURISDICTIONS.map(j => (
                      <button
                        key={j}
                        onClick={() => setSelectedJurisdiction(j)}
                        className={`py-2 px-3 rounded-xl border text-[10px] font-bold transition-all ${
                          selectedJurisdiction === j 
                            ? 'bg-primary text-on-primary border-primary shadow-lg shadow-primary/20' 
                            : 'bg-surface-container-low border-outline text-on-surface-variant/60 hover:border-primary/40'
                        }`}
                      >
                        {j}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setIsManualModalOpen(false)}
                  className="flex-1 py-3 text-[11px] font-extrabold uppercase tracking-widest text-primary/40 hover:text-primary transition-all"
                >
                  Cancel
                </button>
                <button 
                  disabled={!newPlaybookName}
                  onClick={handleCreateManual}
                  className="flex-[2] py-3 bg-primary text-on-primary rounded-2xl text-[11px] font-extrabold uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-50"
                >
                  Create Framework
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* AI Generator Modal */}
      <AnimatePresence>
        {isAiModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isGenerating && setIsAiModalOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[500px] bg-surface rounded-[32px] p-8 z-[70] shadow-2xl border border-outline overflow-hidden"
            >
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-primary tracking-tight">AI Framework Builder</h2>
                    <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Powered by Gemini Intelligence</p>
                  </div>
                </div>

                <p className="text-xs text-on-surface/60 mb-6 leading-relaxed">
                  Describe the contract type or the specific transaction you need a playbook for. Our AI will architect risk thresholds and clause guidelines based on industry standards.
                </p>

                <div className="mb-6">
                  <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-3">Target Jurisdiction</p>
                  <div className="flex flex-wrap gap-2">
                    {JURISDICTIONS.map(j => (
                      <button
                        key={j}
                        onClick={() => setSelectedJurisdiction(j)}
                        className={`py-2 px-3 rounded-xl border text-[9px] font-bold transition-all ${
                          selectedJurisdiction === j 
                            ? 'bg-secondary text-primary border-secondary shadow-lg shadow-secondary/20' 
                            : 'bg-surface-container-low border-outline text-on-surface-variant/60 hover:border-secondary/40'
                        }`}
                      >
                        {j}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., Software Licensing Agreement for a Fortune 500 enterprise client..."
                  className="w-full h-32 bg-surface-container-low border border-outline rounded-2xl p-4 text-[13px] font-medium outline-none focus:ring-1 focus:ring-secondary/40 mb-4 resize-none"
                />

                {aiError && (
                  <p className="text-[10px] text-error font-bold mb-4 flex items-center gap-1.5 uppercase">
                    <AlertTriangle className="h-3 w-3" />
                    {aiError}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <button 
                    disabled={isGenerating}
                    onClick={() => setIsAiModalOpen(false)}
                    className="flex-1 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-primary/40 hover:text-primary transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={isGenerating || !aiPrompt.trim()}
                    onClick={generateWithAi}
                    className="flex-[2] py-3.5 bg-secondary text-primary rounded-2xl text-[11px] font-extrabold uppercase tracking-widest shadow-xl shadow-secondary/20 disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Architecting...
                      </>
                    ) : (
                      <>
                        Construct Playbook
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Playbook Detail Slide-over */}
      <AnimatePresence>
        {selectedPlaybook && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isEditing) setSelectedPlaybook(null);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`absolute right-0 top-0 bottom-0 ${isFullScreen ? 'w-full' : 'w-full max-w-[500px]'} bg-surface flex flex-col z-50 shadow-2xl border-l border-outline transition-all duration-300`}
            >
              <div className="p-8 border-b border-outline flex items-center justify-between bg-surface-container-low">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-primary text-on-primary flex items-center justify-center shrink-0">
                    <Scale className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    {isEditing && editForm ? (
                      <input 
                        value={editForm.title}
                        onChange={(e) => updateField('title', e.target.value)}
                        className="bg-transparent border-b border-primary text-lg font-bold text-primary tracking-tight outline-none w-full"
                      />
                    ) : (
                      <h2 className="text-lg font-bold text-primary tracking-tight">{selectedPlaybook.title}</h2>
                    )}
                    <p className="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Official Legal Review Framework</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className="p-2 hover:bg-surface-container rounded-xl transition-all text-on-surface-variant/40 hover:text-primary"
                    title={isFullScreen ? "Exit Full Screen" : "Expand to Full Screen"}
                  >
                    {isFullScreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedPlaybook(null);
                      setIsFullScreen(false);
                    }}
                    className="p-2 hover:bg-surface-container rounded-xl transition-all"
                  >
                    <X className="h-5 w-5 text-on-surface-variant/40" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
                {/* Jurisdictional Alert */}
                {(isEditing ? editForm?.jurisdictionalAlert : selectedPlaybook.jurisdictionalAlert) && (
                  <section className="p-5 bg-error/[0.03] border border-error/10 rounded-[32px] flex gap-4 items-start relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                      <Scale className="h-16 w-16 text-error" />
                    </div>
                    <div className="p-3 bg-error/10 rounded-2xl text-error shrink-0">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-error">Jurisdictional Alert: {isEditing && editForm ? editForm.jurisdiction : selectedPlaybook.jurisdiction}</h4>
                      <p className="text-[11px] font-bold text-primary/70 leading-relaxed uppercase tracking-tight">
                        {isEditing && editForm ? editForm.jurisdictionalAlert : selectedPlaybook.jurisdictionalAlert}
                      </p>
                    </div>
                  </section>
                )}

                {/* Jurisdiction & Frameworks Section */}
                <section className="flex flex-wrap gap-6 p-4 bg-surface-container rounded-2xl border border-outline/50 relative overflow-hidden">
                  <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
                  <div>
                    <p className="text-[8px] font-extrabold text-primary/40 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                      <Scale className="h-2.5 w-2.5" />
                      Legal Jurisdiction
                    </p>
                    {isEditing && editForm ? (
                      <select 
                        value={editForm.jurisdiction}
                        onChange={(e) => updateField('jurisdiction', e.target.value)}
                        className="bg-transparent border-b border-primary/20 text-xs font-bold text-primary outline-none"
                      >
                        {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                      </select>
                    ) : (
                      <p className="text-xs font-bold text-primary">{selectedPlaybook.jurisdiction || 'Global'}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[8px] font-extrabold text-primary/40 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                      <Info className="h-2.5 w-2.5" />
                      Legal References
                    </p>
                    {isEditing && editForm ? (
                      <input 
                        value={editForm.referencedFrameworks?.join(', ')}
                        onChange={(e) => updateField('referencedFrameworks', e.target.value.split(',').map(s => s.trim()))}
                        placeholder="e.g. GDPR, POPIA"
                        className="bg-transparent border-b border-primary/20 text-xs font-bold text-primary outline-none min-w-[200px]"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedPlaybook.referencedFrameworks?.map((f, i) => (
                          <span key={`framework-${i}`} className="text-[9px] font-bold px-2 py-0.5 bg-secondary/10 text-secondary rounded-lg border border-secondary/10">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                {/* Jurisdictional Alert Input in Edit Mode */}
                {isEditing && editForm && (
                  <section className="space-y-3">
                    <p className="text-[8px] font-extrabold text-error/60 uppercase tracking-[0.3em] ml-4">Jurisdictional Alert Language</p>
                    <textarea 
                      value={editForm.jurisdictionalAlert}
                      onChange={(e) => updateField('jurisdictionalAlert', e.target.value)}
                      placeholder="Special legal nuances for this region..."
                      className="w-full h-20 bg-error/[0.02] border border-error/10 rounded-2xl p-4 text-[11px] font-medium outline-none focus:ring-1 focus:ring-error/20"
                    />
                  </section>
                )}

                {/* Intro Section */}
                <section>
                  {isEditing && editForm ? (
                    <textarea 
                      value={editForm.description}
                      onChange={(e) => updateField('description', e.target.value)}
                      className="w-full h-24 bg-surface-container-low border border-outline rounded-xl p-3 text-[14px] font-medium outline-none focus:ring-1 focus:ring-primary/20"
                    />
                  ) : (
                    <p className="text-[14px] text-on-surface font-medium leading-relaxed">
                      {selectedPlaybook.description}
                    </p>
                  )}
                </section>

                {/* Risk Vectors */}
                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface-variant/60 mb-6 flex items-center gap-2">
                    <FileWarning className="h-3 w-3" />
                    Critical Risk Thresholds
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {(isEditing ? editForm?.riskThresholds : selectedPlaybook.riskThresholds)?.map((t, idx) => (
                      <div key={`threshold-${idx}`} className="p-4 bg-surface-container rounded-2xl border border-outline">
                        <p className="text-[8px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-1.5">{t.category}</p>
                        {isEditing && editForm ? (
                          <input 
                            value={editForm.riskThresholds[idx].limit}
                            onChange={(e) => {
                              const newThresholds = [...editForm.riskThresholds];
                              newThresholds[idx] = { ...newThresholds[idx], limit: e.target.value };
                              updateField('riskThresholds', newThresholds);
                            }}
                            className="bg-transparent border-b border-primary/20 text-sm font-bold text-primary w-full outline-none"
                          />
                        ) : (
                          <p className="text-sm font-bold text-primary mb-1">{t.limit}</p>
                        )}
                        <p className="text-[9px] text-secondary-content font-bold">{t.indicator}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Clause Guidelines */}
                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface-variant/60 mb-6 flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    Internal Clause Guidance
                  </h4>
                  <div className="space-y-4">
                    {(isEditing ? editForm?.guidelines : selectedPlaybook.guidelines)?.map((g, idx) => (
                      <div key={`guideline-${idx}`} className="p-6 bg-surface-container-low border border-outline rounded-2xl group/item">
                        <div className="flex items-center justify-between mb-2">
                          {isEditing && editForm ? (
                            <input 
                              value={editForm.guidelines[idx].title}
                              onChange={(e) => updateGuideline(idx, { title: e.target.value })}
                              className="bg-transparent border-b border-primary/20 text-[12px] font-bold text-primary tracking-tight outline-none"
                            />
                          ) : (
                            <h5 className="text-[12px] font-bold text-primary tracking-tight">{g.title}</h5>
                          )}
                          <button 
                            onClick={() => isEditing && updateGuideline(idx, { mandatory: !editForm?.guidelines[idx].mandatory })}
                            disabled={!isEditing}
                            className={`text-[8px] font-extrabold uppercase tracking-widest transition-colors
                              ${(isEditing ? editForm?.guidelines[idx].mandatory : g.mandatory) 
                                ? 'text-error' 
                                : 'text-on-surface-variant/40'}`}
                          >
                            Mandatory
                          </button>
                        </div>
                        
                        {isEditing && editForm ? (
                          <textarea 
                            value={editForm.guidelines[idx].description}
                            onChange={(e) => updateGuideline(idx, { description: e.target.value })}
                            className="w-full mt-2 bg-surface-container border border-outline rounded-lg p-2 text-[11px] font-medium outline-none focus:ring-1 focus:ring-primary/20"
                          />
                        ) : (
                          <p className="text-[11px] text-on-surface/70 leading-relaxed font-medium mb-4">
                            {g.description}
                          </p>
                        )}
                        
                        {(isEditing ? editForm?.guidelines[idx].standard_language : g.standard_language) && (
                          <div className="bg-surface-container p-4 rounded-xl border-l-2 border-primary/20 mt-4">
                            {isEditing && editForm ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-[7px] font-bold text-primary/30 uppercase">Standard Language</span>
                                <textarea 
                                  value={editForm.guidelines[idx].standard_language}
                                  onChange={(e) => updateGuideline(idx, { standard_language: e.target.value })}
                                  className="w-full bg-transparent p-0 text-[10px] font-serif italic text-on-surface-variant/80 outline-none"
                                />
                              </div>
                            ) : (
                              <p className="text-[10px] font-serif italic text-on-surface-variant/80">
                                "{g.standard_language}"
                              </p>
                            )}
                          </div>
                        )}
                        {isEditing && editForm && !editForm.guidelines[idx].standard_language && (
                           <button 
                            onClick={() => updateGuideline(idx, { standard_language: 'Insert standard language here...' })}
                            className="mt-3 text-[8px] font-bold text-primary/40 uppercase tracking-widest hover:text-primary transition-colors"
                           >
                            + Add Recommended Language
                           </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface-variant/60 mb-6 flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Framework Audit Trail
                  </h4>
                  <div className="space-y-2">
                    {selectedPlaybook.auditLogs?.map((log) => (
                      <div key={log.id} className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline/50">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                          <div>
                            <p className="text-[10px] font-bold text-primary leading-tight">{log.userName}</p>
                            <p className="text-[9px] text-on-surface-variant/70 font-medium">{log.action}</p>
                          </div>
                        </div>
                        <span className="text-[8px] font-bold text-primary/30 uppercase tracking-widest">{log.timestamp}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="p-8 border-t border-outline flex items-center gap-3 bg-surface">
                {isEditing ? (
                  <>
                    <button 
                      onClick={cancelEditing}
                      className="flex-1 py-3 bg-surface border border-outline rounded-2xl text-[11px] font-extrabold uppercase tracking-widest hover:bg-surface-container transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveChanges}
                      className="flex-1 py-3 bg-primary text-on-primary rounded-2xl text-[11px] font-extrabold uppercase tracking-widest shadow-xl shadow-primary/20"
                    >
                      Save Framework
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={startEditing}
                      className="flex-1 py-3 bg-surface border border-outline rounded-2xl text-[11px] font-extrabold uppercase tracking-widest hover:bg-surface-container transition-all"
                    >
                      Edit Guide
                    </button>
                    <button className="flex-1 py-3 bg-[#0D0D0D] text-white rounded-2xl text-[11px] font-extrabold uppercase tracking-widest shadow-xl shadow-black/10">
                      Update All Docs
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

