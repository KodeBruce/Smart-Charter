import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Download, Share2, 
  Files, Check, AlertTriangle, ShieldCheck, 
  Calendar, Gavel, Banknote, Search, Plus, 
  X, ChevronRight, Filter, FilePlus
} from 'lucide-react';
import IngestModal from '../components/IngestModal';
import { ContractAnalysis } from '../services/geminiService';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

const comparisonFields = [
  { key: 'counterparty', label: 'Counterparty', icon: Files },
  { key: 'value', label: 'Contract Value', icon: Banknote },
  { key: 'expiry', label: 'End Date', icon: Calendar },
  { key: 'jurisdiction', label: 'Governing Law', icon: Gavel },
  { key: 'risk', label: 'Risk Category', icon: AlertTriangle },
];

export default function CompareContracts() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [selectedContracts, setSelectedContracts] = useState<any[]>([]);
  const [allContracts, setAllContracts] = useState<any[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'contracts'),
      where('ownerId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contractsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        expiry: doc.data().expiryDate,
        risk: doc.data().riskLevel
      }));
      setAllContracts(contractsData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contracts');
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  // Initialize from location state if available
  useEffect(() => {
    if (location.state?.contracts) {
      setSelectedContracts(location.state.contracts);
      // Close library automatically if coming from repository with selection
      setIsLibraryOpen(false);
    }
  }, [location.state]);

  const toggleContractSelection = (contract: any) => {
    setSelectedContracts(prev => {
      const isSelected = prev.some(c => c.id === contract.id);
      if (isSelected) {
        return prev.filter(c => c.id !== contract.id);
      } else {
        return [...prev, contract];
      }
    });
  };

  const hasDifference = (field: string) => {
    if (selectedContracts.length < 2) return false;
    const firstVal = selectedContracts[0][field];
    return selectedContracts.some(c => c[field] !== firstVal);
  };

  const filteredLibrary = allContracts.filter(c => 
    (c.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (c.counterparty?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const handleIngestSuccess = (analysis: any) => {
    navigate(`/contract/${analysis.id}`);
  };

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-surface">
      {/* Sidebar Selector */}
      <AnimatePresence mode="popLayout">
        {isLibraryOpen && (
          <motion.div 
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            className="w-80 border-r border-outline bg-surface-container-lowest flex flex-col z-30"
          >
            <div className="p-6 border-b border-outline">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-primary uppercase tracking-widest">Doc Library</h2>
                <button 
                  onClick={() => setIsLibraryOpen(false)}
                  className="p-1.5 hover:bg-surface-container rounded-lg transition-all"
                >
                  <X className="h-4 w-4 text-on-surface-variant/40" />
                </button>
              </div>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant/40" />
                <input 
                  type="text"
                  placeholder="Filter database..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-surface-container border border-outline rounded-xl text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>

              <button 
                onClick={() => setIsIngestOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                New Upload
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
              <p className="px-2 pb-2 text-[8px] font-bold text-on-surface-variant/30 uppercase tracking-[0.2em]">Available Documents</p>
              {filteredLibrary.map((contract) => {
                const isSelected = selectedContracts.some(c => c.id === contract.id);
                return (
                  <button
                    key={contract.id}
                    onClick={() => toggleContractSelection(contract)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 group
                      ${isSelected 
                        ? 'bg-primary/5 border-primary shadow-sm' 
                        : 'bg-surface border-outline hover:border-primary/40 hover:bg-surface-container-low'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all
                      ${isSelected ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant/40 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                      <Files className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-bold tracking-tight truncate ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                        {contract.name}
                      </p>
                      <p className="text-[8px] font-bold text-on-surface-variant/40 uppercase tracking-widest truncate">
                        {contract.counterparty}
                      </p>
                    </div>
                    {isSelected && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Comparison Header */}
        <header className="flex h-14 w-full items-center justify-between border-b border-outline bg-surface px-6 z-40">
          <div className="flex items-center gap-3">
            {!isLibraryOpen && (
              <button 
                onClick={() => setIsLibraryOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline rounded-lg text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-surface-container-high transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Docs
              </button>
            )}
            <div className="h-4 w-px bg-outline mx-2" />
            <div className="flex flex-col">
              <h2 className="text-[11px] font-bold text-primary tracking-tight">Side-by-Side Analysis</h2>
              <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-on-surface-variant/60">
                {selectedContracts.length} Documents Selected
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              disabled={selectedContracts.length === 0}
              className="p-2 rounded-lg text-on-surface/60 hover:bg-surface-container transition-all disabled:opacity-20"
            >
              <Download className="h-4 w-4" />
            </button>
            <button 
              disabled={selectedContracts.length === 0}
              className="p-2 rounded-lg text-on-surface/60 hover:bg-surface-container transition-all disabled:opacity-20"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto custom-scrollbar p-8">
          {selectedContracts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-surface-container rounded-[32px] flex items-center justify-center">
                <Files className="h-8 w-8 text-on-surface-variant/20" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-primary tracking-tight mb-1">Begin Your Comparison</p>
                <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">
                  Select documents from the library or upload a new one
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsLibraryOpen(true)}
                  className="px-6 py-2.5 bg-surface border border-outline rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-container transition-all"
                >
                  Open Library
                </button>
                <button 
                  onClick={() => setIsIngestOpen(true)}
                  className="px-6 py-2.5 bg-primary text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20"
                >
                  Upload New
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-[1240px] mx-auto pb-12">
              <div className="inline-flex min-w-full">
                {/* Comparison Labels */}
                <div className="w-56 flex-shrink-0 pt-32">
                  <div className="divide-y divide-outline/10 border-r border-outline/10">
                    {comparisonFields.map((field) => (
                      <div key={field.key} className="h-20 flex items-center pr-6">
                        <div className="flex items-center gap-2.5 text-on-surface-variant/60">
                          <field.icon className="h-3.5 w-3.5" />
                          <span className="text-[8px] font-extrabold uppercase tracking-[0.2em]">{field.label}</span>
                        </div>
                      </div>
                    ))}
                    <div className="h-48 flex items-start pt-8 pr-6">
                      <div className="flex items-center gap-2.5 text-on-surface-variant/60">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span className="text-[8px] font-extrabold uppercase tracking-[0.2em]">Summary Result</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Columns */}
                <div className="flex gap-4">
                  {selectedContracts.map((contract, i) => (
                    <motion.div 
                      key={contract.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-[320px] flex-shrink-0"
                    >
                      {/* Header Section */}
                      <div className="mb-12">
                        <div className="bg-surface-container-low border border-outline rounded-3xl p-6 shadow-sm group relative overflow-hidden">
                          <button 
                            onClick={() => toggleContractSelection(contract)}
                            className="absolute top-4 right-4 p-1 rounded-full bg-surface-container hover:bg-error/10 hover:text-error opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[8px] font-bold text-primary/30 uppercase tracking-[0.2em]">Document {i + 1}</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${contract.risk.includes('High') ? 'bg-error' : 'bg-secondary'}`} />
                          </div>
                          <h3 className="text-sm font-bold text-primary tracking-tight leading-snug h-10 line-clamp-2 mb-2">
                            {contract.name}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{contract.risk}</span>
                          </div>
                        </div>
                      </div>

                      {/* Attribute Rows */}
                      <div className="divide-y divide-outline/10 px-2">
                        {comparisonFields.map((field) => (
                          <div 
                            key={field.key} 
                            className={`h-20 flex flex-col justify-center transition-colors px-2 rounded-xl
                              ${hasDifference(field.key) ? 'bg-primary/[0.02]' : ''}`}
                          >
                            <p className={`text-[12px] font-bold tracking-tight ${
                              hasDifference(field.key) ? 'text-primary' : 'text-on-surface/70'
                            }`}>
                              {(contract as any)[field.key] || '—'}
                            </p>
                            {hasDifference(field.key) && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <AlertTriangle className="h-2.5 w-2.5 text-secondary-content" />
                                <span className="text-[7px] font-extrabold uppercase tracking-[0.1em] text-secondary-content">Variation detected</span>
                              </div>
                            )}
                          </div>
                        ))}

                        <div className="h-48 pt-8">
                          <div className={`p-5 rounded-2xl border transition-all h-full ${
                            contract.risk.includes('High') 
                              ? 'bg-error/[0.04] border-error/20' 
                              : 'bg-surface-container-lowest border-outline'
                          }`}>
                            <div className="flex items-center gap-2 mb-4">
                              <Check className={`h-3.5 w-3.5 ${contract.risk.includes('High') ? 'text-error/60' : 'text-secondary-content'}`} />
                              <span className="text-[7px] font-extrabold uppercase tracking-widest text-primary/50">Legal Assessment</span>
                            </div>
                            <p className={`text-[11px] font-medium leading-relaxed ${
                              contract.risk.includes('High') ? 'text-error/80' : 'text-on-surface/70'
                            }`}>
                              {contract.risk.includes('High') 
                                ? 'Critical risk vectors identified during review. Immediate attention to liability caps recommended to mitigate exposure.'
                                : 'Standard operational document with low strategic risk. Compliance profile matches current internal legal standards.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  
                  {/* Empty Slot for adding more */}
                  <button 
                    onClick={() => setIsLibraryOpen(true)}
                    className="w-[320px] h-[160px] border-2 border-dashed border-outline rounded-[32px] flex flex-col items-center justify-center gap-3 text-on-surface-variant/30 hover:bg-surface-container-low hover:border-primary/40 transition-all group"
                  >
                    <div className="w-10 h-10 bg-surface-container rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Plus className="h-5 w-5" />
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest">Add Document</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <IngestModal 
        isOpen={isIngestOpen} 
        onClose={() => setIsIngestOpen(false)} 
        onSuccess={handleIngestSuccess}
      />
    </div>
  );
}
