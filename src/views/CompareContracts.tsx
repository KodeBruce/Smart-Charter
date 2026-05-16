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
import TopBar from '../components/TopBar';

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
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

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

  const totalPages = Math.ceil(filteredLibrary.length / pageSize);
  const paginatedLibrary = filteredLibrary.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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
            id="walkthrough-compare-library"
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
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-on-primary rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                New Upload
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
              <p className="px-2 pb-2 text-[9px] font-black text-on-surface/50 uppercase tracking-[0.25em]">Available Documents</p>
              {paginatedLibrary.map((contract) => {
                const isSelected = selectedContracts.some(c => c.id === contract.id);
                return (
                  <button
                    key={contract.id}
                    onClick={() => toggleContractSelection(contract)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 group
                      ${isSelected 
                        ? 'bg-primary/5 dark:bg-primary/10 border-primary shadow-sm' 
                        : 'bg-surface dark:bg-surface-container border-outline dark:border-outline/20 hover:border-primary/40 hover:bg-surface-container-low dark:hover:bg-surface-container-high'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all
                      ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant/40 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                      <Files className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-bold tracking-tight truncate ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                        {contract.name}
                      </p>
                      <p className="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-widest truncate">
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

            {/* Sidebar Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-outline flex items-center justify-between bg-surface-container-lowest">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-outline hover:bg-surface-container disabled:opacity-30 transition-all"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <span className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-outline hover:bg-surface-container disabled:opacity-30 transition-all"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar 
          title="Comparison Engine"
          actions={
            <div className="flex items-center gap-3">
              {!isLibraryOpen && (
                <button 
                  onClick={() => setIsLibraryOpen(true)}
                  className="px-4 py-1.5 bg-surface-container border border-outline rounded text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-surface-container-high transition-all"
                >
                  <Plus className="h-3 w-3 mr-1 inline" />
                  Add Docs
                </button>
              )}
              <div className="flex items-center gap-2">
                <button 
                  disabled={selectedContracts.length === 0}
                  className="p-2 rounded-lg text-on-surface-variant/40 hover:text-primary transition-all disabled:opacity-20"
                  title="Download Analysis"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button 
                  disabled={selectedContracts.length === 0}
                  className="p-2 rounded-lg text-on-surface-variant/40 hover:text-primary transition-all disabled:opacity-20"
                  title="Share Results"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          }
        />

        <div className="px-8 py-4 border-b border-outline/5 bg-surface-container-lowest/30 backdrop-blur-md flex items-center justify-between">
           <div className="flex flex-col">
            <h2 className="text-[11px] font-black text-primary tracking-tight uppercase">Side-by-Side Analysis</h2>
            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-on-surface/30">
              {selectedContracts.length} Documents Selected
            </p>
          </div>
        </div>

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
                  className="px-6 py-2.5 bg-surface dark:bg-surface-container-high border border-outline dark:border-outline/20 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-container dark:hover:bg-surface-container-highest transition-all"
                >
                  Open Library
                </button>
                <button 
                  onClick={() => setIsIngestOpen(true)}
                  className="px-6 py-2.5 bg-primary text-on-primary rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20"
                >
                  Upload New
                </button>
              </div>
            </div>
          ) : (
            <div id="walkthrough-compare-view" className="max-w-[1240px] mx-auto pb-12">
              <div className="inline-flex min-w-full">
                {/* Comparison Labels */}
                <div className="w-56 flex-shrink-0 pt-[184px]">
                  <div className="divide-y divide-outline/10 border-r border-outline/10">
                    {comparisonFields.map((field) => (
                      <div key={field.key} className="h-20 flex items-center pr-6">
                        <div className="flex items-center gap-2.5 group">
                          <field.icon className="h-3.5 w-3.5 text-primary dark:text-secondary" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface">{field.label}</span>
                        </div>
                      </div>
                    ))}
                    <div className="h-48 flex items-start pt-8 pr-6">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary dark:text-secondary" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface">Summary Result</span>
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
                      {/* Header Section - Line Style */}
                      <div className="mb-12">
                        <div className="relative border-b border-primary/20 pb-6 group h-[136px]">
                          <button 
                            onClick={() => toggleContractSelection(contract)}
                            className="absolute top-0 right-0 p-1 rounded-full text-on-surface/30 hover:text-error opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[8px] font-bold text-primary/30 uppercase tracking-[0.2em]">Document {i + 1}</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${(contract.risk || '').includes('High') ? 'bg-error' : 'bg-success'}`} />
                          </div>
                          <h3 className="text-xl font-light text-primary tracking-tight leading-snug h-12 line-clamp-2 mb-3">
                            {contract.name}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${(contract.risk || '').includes('High') ? 'text-error' : 'text-success'}`}>{contract.risk}</span>
                          </div>
                        </div>
                      </div>

                      {/* Attribute Rows */}
                      <div className="divide-y divide-outline/10 px-2">
                        {comparisonFields.map((field) => (
                          <div 
                            key={field.key} 
                            className={`h-20 flex flex-col justify-center transition-colors px-2
                              ${hasDifference(field.key) ? 'border-l-[2px] border-l-primary/30 pl-4' : ''}`}
                          >
                            <p className={`text-[12px] font-light tracking-wide ${
                              hasDifference(field.key) ? 'text-primary dark:text-primary-light' : 'text-on-surface/70 dark:text-on-surface/90'
                            }`}>
                              {(contract as any)[field.key] || '—'}
                            </p>
                            {hasDifference(field.key) && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <AlertTriangle className="h-2.5 w-2.5 text-primary/40" />
                                <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-primary/40">Variation</span>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Legal Assessment - Line Style */}
                        <div className="h-48 pt-8 px-2">
                          <div className={`relative pt-6 border-t ${
                            (contract.risk || '').includes('High') 
                              ? 'border-error/20' 
                              : 'border-outline/10'
                          }`}>
                            <div className="flex items-center gap-2 mb-4">
                              <Check className={`h-3 w-3 ${(contract.risk || '').includes('High') ? 'text-error/60' : 'text-success/60'}`} />
                              <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-primary/40">Legal Assessment</span>
                            </div>
                            <p className={`text-[11px] font-light leading-relaxed ${
                              (contract.risk || '').includes('High') ? 'text-error/90' : 'text-on-surface/70'
                            }`}>
                              {contract.summary || 'No legal assessment available for this document.'}
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
