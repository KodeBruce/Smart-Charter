import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, Activity } from 'lucide-react';
import { analyzeContract, ContractAnalysis } from '../services/geminiService';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, setDoc, deleteDoc, serverTimestamp, collection } from 'firebase/firestore';
import { PlaybookSelector, PLAYBOOKS, type Playbook } from './PlaybookSelector';


const LOADING_STAGES = [
  { label: 'Initializing Neural Node', detail: 'Establishing secure ingestion channel...' },
  { label: 'Extracting Legal Clauses', detail: 'Parsing text and identifying structural nodes...' },
  { label: 'Analyzing Risk Vectors', detail: 'Scoring implications and missing protections...' },
  { label: 'Corroborating Findings', detail: 'Validating against global legal standards...' },
  { label: 'Finalizing Smart Record', detail: 'Indexing document in your secure vault...' }
];

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (analysis: ContractAnalysis) => void;
  projectId?: string;
}

export default function IngestModal({ isOpen, onClose, onSuccess, projectId }: IngestModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isUploading) return;
    
    setLoadingStage(0);
    setProgress(0);
    
    const interval = setInterval(() => {
      setLoadingStage(prev => {
        return prev < LOADING_STAGES.length - 1 ? prev + 1 : prev;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isUploading]);

  useEffect(() => {
    if (!isUploading) return;

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const target = ((loadingStage + 1) / LOADING_STAGES.length) * 100;
        if (prev < target) return prev + 1;
        if (prev < 99) return prev + 0.1; // Slower near the end of a stage
        return prev;
      });
    }, 50);

    return () => clearInterval(progressInterval);
  }, [isUploading, loadingStage]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!auth.currentUser) {
      setError('Error: Not signed in. Please sign out and sign back in, then try again.');
      return;
    }

    setIsUploading(true);
    setError(null);
    const contractId = `doc_${Date.now()}`;

    try {
      const initialData = {
        id: contractId,
        name: file.name,
        description: 'Analyzing document structure and legal implications...',
        ownerId: auth.currentUser.uid,
        projectId: projectId || null,
        counterparty: 'Analyzing...',
        value: '---',
        expiry: '---',
        riskLevel: 'Processing',
        overallRiskScore: 0,
        source: 'Vault',
        status: 'Analyzing',
        content: '',
        analysis: '{}',
        playbookId: selectedPlaybook?.id || null,
        playbookName: selectedPlaybook?.name || null,
        auditLogs: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(doc(db, 'contracts', contractId), initialData);

      const analysis = await analyzeContract(file);
      
      const { rawText, ...restOfAnalysis } = analysis;
      const finalData = {
        id: contractId,
        name: analysis.name || file.name,
        description: analysis.summary || 'No summary available.',
        ownerId: auth.currentUser.uid,
        projectId: projectId || null,
        counterparty: analysis.counterparty || 'Unknown',
        value: analysis.value || 'Not specified',
        expiry: analysis.expiry || 'No date found',
        riskLevel: analysis.riskLevel || 'Medium Risk',
        overallRiskScore: analysis.riskScore || 0,
        source: 'Vault',
        status: 'Review Required',
        content: rawText || '',
        analysis: JSON.stringify(restOfAnalysis),
        playbookId: selectedPlaybook?.id || null,
        playbookName: selectedPlaybook?.name || null,
        auditLogs: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await deleteDoc(doc(db, 'contracts', contractId));
      await setDoc(doc(db, 'contracts', contractId), finalData);

      if (Array.isArray(analysis.missingProtections)) {
        for (const miss of analysis.missingProtections) {
          const insightId = `insight_${Math.random().toString(36).substr(2, 9)}`;
          await setDoc(doc(db, 'contracts', contractId, 'insights', insightId), {
            id: insightId,
            contractId,
            title: miss.title || 'Missing Protection',
            description: miss.suggestion || 'Remediation required.',
            type: 'warning',
            createdAt: serverTimestamp()
          });
        }
      }

      setProgress(100);
      setIsUploading(false);
      setShowSuccess(true);
      
      setTimeout(() => {
        onSuccess({ ...analysis, id: contractId } as any);
        onClose();
        setTimeout(() => setShowSuccess(false), 500);
      }, 2000);

    } catch (err) {
      console.error(err);
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsUploading(false);
      if (contractId) {
        await setDoc(doc(db, 'contracts', contractId), { status: 'Failed', updatedAt: serverTimestamp() }, { merge: true });
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface border border-outline rounded-[32px] p-8 z-[101] shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            
            <div className="flex justify-between items-center mb-8">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.4em] text-on-surface/30 mb-1">Document Analysis</p>
                <h3 className="text-xl font-bold text-primary tracking-tight leading-none flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-secondary" />
                  Upload Contract
                </h3>
              </div>
              <button 
                onClick={onClose}
                className="p-2 rounded-xl text-on-surface/20 hover:text-primary hover:bg-surface-container transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isUploading ? (
              <div className="py-12 flex flex-col items-center gap-10">
                <div className="w-full space-y-4">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black text-[#E2FF6F] uppercase tracking-[0.3em]">Processing Ingestion</p>
                  </div>
                  
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                    <motion.div 
                      className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-[#E2FF6F] to-transparent shadow-[0_0_15px_rgba(226,255,111,0.3)] rounded-full"
                      animate={{ left: ['-50%', '150%'] }}
                      transition={{ repeat: Infinity, ease: "linear", duration: 1.5 }}
                    />
                  </div>
                </div>

                <div className="text-center space-y-4 w-full">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={loadingStage}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-1"
                    >
                      <p className="text-white text-[11px] font-bold uppercase tracking-[0.2em] italic">
                        {LOADING_STAGES[loadingStage].label}
                      </p>
                      <p className="text-white/30 text-[9px] font-medium uppercase tracking-widest leading-relaxed max-w-[280px] mx-auto">
                        {LOADING_STAGES[loadingStage].detail}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            ) : showSuccess ? (
              <div className="py-12 flex flex-col items-center gap-6">
                <motion.div 
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center text-success border border-success/30 shadow-2xl shadow-success/20"
                >
                  <CheckCircle2 className="h-10 w-10" />
                </motion.div>
                <div className="text-center space-y-2">
                  <motion.h4 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-white text-base font-black uppercase tracking-widest"
                  >
                    Neural Indexing Complete
                  </motion.h4>
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]"
                  >
                    Document successfully secured in your vault
                  </motion.p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-white/30 mb-3">Step 1 — Choose Analysis Mode</p>
                  <PlaybookSelector
                    selectedId={selectedPlaybook?.id || null}
                    onSelect={setSelectedPlaybook}
                    compact
                  />
                </div>

                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-white/30 mb-3">Step 2 — Upload Document</p>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center gap-4 hover:border-[#E2FF6F]/30 hover:bg-[#E2FF6F]/5 transition-all cursor-pointer group"
                  >
                    <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-[#E2FF6F] group-hover:text-black transition-all">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div className="text-center">
                      <p className="text-white text-[11px] font-bold uppercase tracking-widest mb-1">Upload Document</p>
                      <p className="text-white/30 text-[9px] font-medium uppercase tracking-[0.2em]">PDF, Word, or Text</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.txt"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex items-center gap-3">
                    <AlertCircle className="h-4 w-4 text-error" />
                    <p className="text-[10px] font-bold text-error uppercase tracking-widest leading-relaxed">
                      {error}
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t border-outline flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-on-surface/20">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="text-[7.5px] font-bold uppercase tracking-widest">Automated Clause Identification</span>
                  </div>
                  <div className="flex items-center gap-2 text-on-surface/20">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="text-[7.5px] font-bold uppercase tracking-widest">Legal Review Validation</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
