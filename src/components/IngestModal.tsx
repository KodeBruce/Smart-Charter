import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { analyzeContract, ContractAnalysis } from '../services/geminiService';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore';

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (analysis: ContractAnalysis) => void;
  projectId?: string;
}

export default function IngestModal({ isOpen, onClose, onSuccess, projectId }: IngestModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setIsUploading(true);
    setError(null);

    try {
      const analysis = await analyzeContract(file);
      
      const contractId = `doc_${Date.now()}`;
      const contractData = {
        id: contractId,
        name: analysis.name,
        description: analysis.summary,
        ownerId: auth.currentUser.uid,
        projectId: projectId || null,
        counterparty: analysis.counterparty,
        value: analysis.value,
        expiryDate: analysis.expiry,
        riskLevel: analysis.riskLevel,
        overallRiskScore: analysis.riskScore,
        source: 'Vault',
        status: 'Review Required',
        content: analysis.rawText || '',
        analysis: JSON.stringify(analysis), // Store full analysis for detail view
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'contracts', contractId), contractData);

      // Add insights as sub-collection
      if (analysis.missingProtections) {
        for (const miss of analysis.missingProtections) {
          const insightId = `insight_${Math.random().toString(36).substr(2, 9)}`;
          await setDoc(doc(db, 'contracts', contractId, 'insights', insightId), {
            id: insightId,
            contractId,
            title: miss.title,
            description: miss.suggestion,
            type: 'warning',
            createdAt: serverTimestamp()
          });
        }
      }

      onSuccess({ ...analysis, id: contractId } as any); // Pass ID back
      onClose();
    } catch (err) {
      console.error(err);
      setError('Error processing document. Please check the file and try again.');
    } finally {
      setIsUploading(false);
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#0D0D0D] border border-white/10 rounded-[32px] p-8 z-[101] shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#E2FF6F] to-transparent opacity-50" />
            
            <div className="flex justify-between items-center mb-8">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.4em] text-white/30 mb-1">Document Analysis</p>
                <h3 className="text-xl font-bold text-white tracking-tight leading-none flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#E2FF6F]" />
                  Upload Contract
                </h3>
              </div>
              <button 
                onClick={onClose}
                className="p-2 rounded-xl text-white/20 hover:text-white hover:bg-white/5 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isUploading ? (
              <div className="py-12 flex flex-col items-center gap-4">
                <div className="relative">
                  <Loader2 className="h-12 w-12 text-[#E2FF6F] animate-spin stroke-[1.5]" />
                  <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-[#E2FF6F] animate-pulse" />
                </div>
                <div className="text-center">
                  <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 italic">Charter AI Processing</p>
                  <p className="text-white/40 text-[10px] font-medium max-w-[200px]">Scanning clauses and identifying key legal points...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/10 rounded-2xl p-10 flex flex-col items-center gap-4 hover:border-[#E2FF6F]/30 hover:bg-[#E2FF6F]/5 transition-all cursor-pointer group"
                >
                  <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-[#E2FF6F] group-hover:text-black transition-all">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-white text-[11px] font-bold uppercase tracking-widest mb-1">Upload Document</p>
                    <p className="text-white/30 text-[9px] font-medium uppercase tracking-[0.2em]">PDF, Word, or Text (Drag or Click)</p>
                  </div>
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    className="hidden" 
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.txt"
                  />
                </div>

                {error && (
                  <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex items-center gap-3">
                    <AlertCircle className="h-4 w-4 text-error" />
                    <p className="text-[10px] font-bold text-error uppercase tracking-widest leading-relaxed">
                      {error}
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t border-white/5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-white/20">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="text-[7.5px] font-bold uppercase tracking-widest">Automated Clause Identification</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/20">
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
