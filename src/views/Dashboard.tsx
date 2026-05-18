import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Activity, Clock, Shield, 
  ArrowUpRight, ArrowRight, Download, Calendar,
  Search, Bell, AlertTriangle, AlertCircle, CheckCircle2,
  Plus, Sparkles, Filter, DollarSign, 
  TrendingUp, Eye, MoreHorizontal, X, Trash2, CheckSquare, Square,
  Loader2, ChevronRight, FilePlus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import IngestModal from '../components/IngestModal';
import TopBar from '../components/TopBar';
import ConfirmationModal from '../components/ConfirmationModal';
import { ContractAnalysis } from '../services/geminiService';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { buildPortfolioAuditSummary, countExpiringSoonContracts } from '../lib/dashboardAudit';
import { collection, onSnapshot, query, where, orderBy, deleteDoc, doc, writeBatch } from 'firebase/firestore';

type FilterType = 'all' | 'High Risk' | 'Medium Risk' | 'Low Risk' | 'Review Required' | 'Unassigned';

/**
 * Truncates a value string to a clean, short summary.
 * Avoids full sentences like "Monetary value is not explicitly stated..."
 */
function smartValueSummary(raw: string | undefined): string {
  if (!raw || raw === '-' || raw === '—') return '—';
  // If it looks like a proper value (has $, USD, number), return it directly
  if (/\$|USD|EUR|ZAR|GBP|\d+[,\.\d]*\s*(million|k|m|bn)?/i.test(raw)) {
    return raw.length > 20 ? raw.slice(0, 20) + '…' : raw;
  }
  // For long prose, strip it to max 28 chars with ellipsis
  if (raw.length > 28) return raw.slice(0, 28).trimEnd() + '…';
  return raw;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const pageSize = 10;

  const handleIngestSuccess = (analysis: any) => {
    navigate(`/contract/${analysis.id}`);
  };

  useEffect(() => {
    const handler = () => setIsIngestOpen(true);
    window.addEventListener('smart-charter-open-upload', handler);
    return () => window.removeEventListener('smart-charter-open-upload', handler);
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'contracts'),
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setContracts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contracts');
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [auth.currentUser]);

  useEffect(() => {
    setAuditResult(buildPortfolioAuditSummary(contracts));
  }, [contracts]);

  const handleRunAudit = () => {
    setAuditResult(buildPortfolioAuditSummary(contracts));
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Counterparty', 'Value', 'Risk Level', 'Expiry'];
    const rows = contracts.map(r => [r.name, r.counterparty || '-', r.value || '-', r.riskLevel || 'Medium', r.expiry || '-']);
    const csv = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "contract_portfolio.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredContracts = contracts
    .filter(c => {
      const matchesSearch = !searchQuery || c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.counterparty?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === 'all' 
        || (activeFilter === 'Review Required' ? c.status === 'Review Required' : 
            activeFilter === 'Unassigned' ? !c.projectId : 
            c.riskLevel === activeFilter);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

  const totalPages = Math.ceil(filteredContracts.length / pageSize);
  const paginatedContracts = filteredContracts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedDocs(new Set());
  }, [activeFilter, searchQuery]);

  const toggleSelectDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDocs(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedDocs.size === paginatedContracts.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(paginatedContracts.map(c => c.id)));
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Document',
      message: 'Are you sure you want to delete this document? This action cannot be undone.',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'contracts', id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `contracts/${id}`);
        }
      }
    });
  };

  const handleBulkDelete = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Bulk Delete',
      message: `Are you sure you want to delete ${selectedDocs.size} documents? This action will remove all selected files permanently.`,
      isDestructive: true,
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          const batch = writeBatch(db);
          selectedDocs.forEach(id => {
            batch.delete(doc(db, 'contracts', id));
          });
          await batch.commit();
          setSelectedDocs(new Set());
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'contracts/bulk');
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  const stats = [
    { 
      label: 'Total Portfolio', value: contracts.length.toString(),
      sub: 'Active documents', icon: FileText, color: 'text-primary dark:text-primary-light', bg: 'bg-primary/8'
    },
    { 
      label: 'Critical Risks', value: contracts.filter(r => r.riskLevel === 'High Risk').length.toString(),
      sub: 'Require action', icon: Shield, color: 'text-error', bg: 'bg-error/8'
    },
    { 
      label: 'Expiring Soon', value: countExpiringSoonContracts(contracts).toString(),
      sub: 'Within 30 days', icon: Clock, color: 'text-warning', bg: 'bg-warning/8'
    },
    { 
      label: 'Avg. Risk Score', 
      value: contracts.length ? `${Math.min(100, Math.round(contracts.reduce((s, c) => s + (Math.min(100, c.riskScore || 50)), 0) / contracts.length))}%` : '—',
      sub: 'Portfolio health', icon: TrendingUp, color: 'text-success', bg: 'bg-success/8'
    },
  ];

  const handleUrgentTaskClick = (filter: FilterType) => {
    setActiveFilter(filter);
    document.getElementById('document-library')?.scrollIntoView({ behavior: 'smooth' });
  };

  const urgentTasks = [
    { label: `${contracts.filter(r => r.status === 'Review Required').length} contracts pending review`, color: 'bg-error', filter: 'Review Required' as FilterType },
    { label: `${contracts.filter(r => r.riskLevel === 'High Risk').length} high-risk clauses need review`, color: 'bg-warning', filter: 'High Risk' as FilterType },
    { label: `${contracts.filter(r => !r.projectId).length} AI findings pending review`, color: 'bg-on-surface-variant/50', filter: 'Unassigned' as FilterType },
  ];

  const riskLabel = (level: string) =>
    level === 'High Risk' ? 'High' : level === 'Medium Risk' ? 'Med' : 'Low';

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      <TopBar 
        title="Intelligence Dashboard"
        actions={
          <div className="flex items-center gap-3">
             <div className="flex bg-surface-container border border-outline/20 rounded p-0.5">
              {[
                { id: 'All', label: 'All' },
                { id: 'High Risk', label: 'High' },
                { id: 'Medium Risk', label: 'Med' },
                { id: 'Unassigned', label: 'Unassigned' }
              ].map(opt => (
                <button 
                  key={opt.id}
                  onClick={() => setActiveFilter(opt.id as any)}
                  className={`px-3 py-1 text-[8px] font-bold uppercase tracking-widest rounded transition-all ${activeFilter === opt.id ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/40 hover:text-on-surface/60'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setIsIngestOpen(true)}
              className="px-4 py-1.5 bg-[#E2FF6F] text-black rounded text-[9px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
            >
              <Plus className="h-3 w-3 mr-1 inline" />
              Upload
            </button>
          </div>
        }
      />



      <div className="px-4 py-6 sm:px-6 sm:py-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
        
        {/* Page Header */}
        <header className="flex items-end justify-between">
          <div>
            <p className="text-[9px] font-bold text-on-surface/50 tracking-[0.4em] uppercase mb-1.5">Business Insights</p>
            <h1 className="text-2xl font-black text-on-surface tracking-tighter leading-none">Contract Intelligence</h1>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-medium text-on-surface/50">
            <Calendar className="h-3.5 w-3.5" />
            <span>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </header>

        {/* Stats Strip - Line Style */}
        <section id="walkthrough-dashboard-view" className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6 pt-4 pb-8 border-b border-outline/10">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
              className="relative pt-4 group"
            >
              <div className="absolute top-0 left-0 w-8 h-[1px] bg-primary/40 group-hover:w-full transition-all duration-700" />
              <div className="flex items-start justify-between mb-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40">{stat.label}</p>
                <stat.icon className={`h-3 w-3 ${stat.color} opacity-70`} />
              </div>
              <p className="text-4xl font-light text-on-surface tracking-tighter leading-none mb-2">{stat.value}</p>
              <p className="text-[9px] font-medium text-on-surface/40">{stat.sub}</p>
            </motion.div>
          ))}
        </section>

        {/* Document Library - Line Style */}
        <section id="document-library" className="pt-8">
          <div className="flex items-center justify-between pb-6 mb-2 border-b border-outline/10">
            <h3 className="text-sm font-light text-on-surface/80 tracking-tight">Intelligence Portfolio</h3>
            <div className="flex items-center gap-6">
              <div className="flex gap-4">
                {(['all', 'High Risk', 'Medium Risk', 'Low Risk'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={`pb-2 text-[9px] font-bold uppercase tracking-[0.15em] transition-all relative ${
                      activeFilter === f 
                        ? f === 'High Risk' ? 'text-error' : f === 'Medium Risk' ? 'text-warning' : f === 'Low Risk' ? 'text-success' : 'text-primary'
                        : 'text-on-surface/30 hover:text-on-surface/60'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'High Risk' ? 'High' : f === 'Medium Risk' ? 'Med' : 'Low'}
                    {activeFilter === f && (
                      <motion.div layoutId="dash-filter" className={`absolute bottom-0 left-0 right-0 h-[1px] ${f === 'High Risk' ? 'bg-error' : f === 'Medium Risk' ? 'bg-warning' : f === 'Low Risk' ? 'bg-success' : 'bg-primary'}`} />
                    )}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-outline/20 mx-2" />
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-bold text-on-surface/30 tracking-[0.1em]">{filteredContracts.length} docs</span>
                <button onClick={handleExportCSV} className="text-on-surface/40 hover:text-on-surface transition-colors" title="Export CSV">
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filteredContracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <FileText className="h-10 w-10 text-on-surface/20" />
                <p className="text-[11px] font-medium text-on-surface/40">
                  {searchQuery ? 'No documents match your search' : 'No documents yet — upload one to begin'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <table className="min-w-[720px] w-full">
                  <thead>
                    <tr>
                      <th className="py-4 text-left w-10">
                        <button 
                          onClick={toggleSelectAll}
                          className="p-1 hover:bg-surface-container rounded transition-all text-on-surface/20 hover:text-primary"
                        >
                          {selectedDocs.size === paginatedContracts.length && paginatedContracts.length > 0 ? (
                            <CheckSquare className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Square className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </th>
                      <th className="py-4 text-left text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40">Document</th>
                      <th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40">Counterparty</th>
                      <th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40">Value</th>
                      <th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40">Risk</th>
                      <th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40">Expiry</th>
                      <th className="px-4 py-4 text-left text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface/40">
                        Modified
                        <div className="flex items-center gap-2 mt-1.5 opacity-50">
                          <span>Date</span>
                          <span className="text-[6px] opacity-30">|</span>
                          <span>Time</span>
                        </div>
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline/5">
                    {paginatedContracts.map((item) => {
                      const isIngesting = item.status === 'Analyzing';
                      
                      return (
                        <tr 
                          key={item.id}
                          onClick={() => !isIngesting && navigate(`/contract/${item.id}`)}
                          className={`transition-all group ${isIngesting ? 'bg-secondary/[0.02] cursor-wait border-l-2 border-secondary/20' : 'hover:bg-surface/30 cursor-pointer'}`}
                        >
                          <td className="py-5">
                            <button 
                              onClick={(e) => !isIngesting && toggleSelectDoc(item.id, e)}
                              disabled={isIngesting}
                              className={`p-1 rounded transition-all ${selectedDocs.has(item.id) ? 'text-primary' : 'text-on-surface/10 hover:text-on-surface/30'} ${isIngesting ? 'opacity-20 cursor-not-allowed' : ''}`}
                            >
                              {selectedDocs.has(item.id) ? (
                                <CheckSquare className="h-3.5 w-3.5" />
                              ) : (
                                <Square className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>
                          <td className="py-5">
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <FileText className={`h-3.5 w-3.5 transition-colors shrink-0 ${isIngesting ? 'text-secondary animate-pulse' : 'text-on-surface/30 group-hover:text-primary'}`} />
                                {isIngesting && (
                                  <motion.div 
                                    className="absolute -top-1 -right-1 w-2 h-2 bg-secondary rounded-full"
                                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                  />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className={`text-[11px] font-bold tracking-wide max-w-[200px] truncate ${isIngesting ? 'text-on-surface/40 italic' : 'text-on-surface/90'}`}>
                                  {item.name}
                                </span>
                                {isIngesting && (
                                  <span className="text-[7px] font-black uppercase tracking-widest text-secondary/60">Indexing…</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <span className="text-[10px] font-medium text-on-surface/60 max-w-[140px] truncate block">
                              {isIngesting ? '---' : (item.counterparty || '—')}
                            </span>
                          </td>
                          <td className="px-4 py-5 max-w-[160px]">
                            <span className="text-[10px] font-medium text-on-surface/80 block truncate" title={item.value}>
                              {isIngesting ? '---' : smartValueSummary(item.value)}
                            </span>
                          </td>
                          <td className="px-4 py-5">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                isIngesting ? 'bg-secondary animate-pulse' :
                                item.riskLevel === 'High Risk' ? 'bg-error' : 
                                item.riskLevel === 'Medium Risk' ? 'bg-warning' : 'bg-success'
                              }`} />
                              <span className={`text-[9px] font-bold uppercase tracking-widest ${
                                isIngesting ? 'text-secondary' :
                                item.riskLevel === 'High Risk' ? 'text-error' : 
                                item.riskLevel === 'Medium Risk' ? 'text-warning' : 'text-success'
                              }`}>
                                {isIngesting ? 'Processing' : riskLabel(item.riskLevel || 'Low Risk')}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-5">
                            <span className="text-[10px] font-medium text-on-surface/50">{isIngesting ? '---' : (item.expiry || '—')}</span>
                          </td>
                          <td className="px-4 py-5">
                            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.1em] text-on-surface/40">
                              {item.updatedAt?.toDate?.() ? (
                                <>
                                  <span>{item.updatedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                                  <span className="text-[6px] opacity-30">|</span>
                                  <span>{item.updatedAt.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                </>
                              ) : (
                                'Recent'
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-5 text-right">
                            <button 
                              onClick={(e) => handleDelete(item.id, e)}
                              className="p-1.5 rounded-lg text-on-surface/20 hover:text-error hover:bg-error/5 opacity-0 group-hover:opacity-100 transition-all"
                              title="Delete Document"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-8 pb-4 border-t border-outline/10">
                    <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">
                      Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredContracts.length)} of {filteredContracts.length} entries
                    </p>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 border border-outline/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-on-surface/60 hover:bg-surface-container disabled:opacity-30 transition-all"
                      >
                        Previous
                      </button>
                      <div className="flex items-center gap-1 px-3">
                        {Array.from({ length: totalPages }).map((_, i) => (
                          <div 
                            key={i} 
                            className={`h-1 rounded-full transition-all duration-500 ${i + 1 === currentPage ? 'w-4 bg-primary' : 'w-1 bg-outline/30'}`} 
                          />
                        ))}
                      </div>
                      <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 border border-outline/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-on-surface/60 hover:bg-surface-container disabled:opacity-30 transition-all"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <AnimatePresence>
              {selectedDocs.size > 0 && (
                <motion.div 
                  initial={{ y: 50, opacity: 0, x: '-50%' }}
                  animate={{ y: 0, opacity: 1, x: '-50%' }}
                  exit={{ y: 50, opacity: 0, x: '-50%' }}
                  className="fixed bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 bg-surface/90 dark:bg-[#0D0D0D]/90 backdrop-blur-xl px-1.5 sm:px-2 py-1.5 sm:py-2 rounded-full border border-outline/20 dark:border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] z-50 flex items-center gap-1 sm:gap-1.5 w-[94%] sm:w-auto sm:min-w-[480px]"
                >
                  {/* Left Section: Context */}
                  <div className="flex items-center gap-2 sm:gap-3 pl-3 sm:pl-4 pr-2 sm:pr-3 py-1">
                    <div className="w-8 h-8 bg-on-surface/5 dark:bg-white/5 rounded-full flex items-center justify-center border border-outline/20 dark:border-white/5 shrink-0">
                      <FileText className="h-3.5 w-3.5 text-on-surface/40 dark:text-white/40" />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-[10px] font-black text-on-surface dark:text-white uppercase tracking-[0.2em] leading-none">
                        {selectedDocs.size} <span className="hidden xs:inline">Selected</span>
                      </p>
                      <p className="hidden sm:block text-[7px] font-bold text-on-surface/20 dark:text-white/20 uppercase tracking-[0.3em] mt-1">Bulk Operations</p>
                    </div>
                  </div>
                  
                  {/* Action Section */}
                  <div className="flex-1 flex items-center gap-1 sm:gap-1.5 justify-end">
                    <button 
                      onClick={handleBulkDelete}
                      disabled={isDeleting}
                      className="h-10 px-4 sm:px-8 bg-error text-white rounded-full text-[9px] font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-error/10 group whitespace-nowrap"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 transition-transform group-hover:-rotate-12" />
                      )}
                      <span>Delete <span className="hidden xs:inline">Selection</span></span>
                    </button>
                    
                    <button 
                      onClick={() => setSelectedDocs(new Set())}
                      className="h-10 px-3 sm:px-6 text-[9px] font-black uppercase tracking-[0.25em] text-on-surface/30 dark:text-white/30 hover:text-on-surface dark:hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Bottom Row - Line Style */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-16 pt-12 pb-8 border-t border-outline/10">
          <div className="relative pt-6 border-t border-outline/20">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="h-3 w-3 text-primary/50" />
              <h4 className="text-[9px] font-bold text-on-surface/50 uppercase tracking-[0.25em]">Portfolio Analysis</h4>
            </div>
            <p className="text-xl font-light text-on-surface/90 leading-relaxed mb-8">
              {auditResult}
            </p>
            <button 
              onClick={handleRunAudit}
              className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-primary hover:text-primary-light transition-colors"
            >
              Run Portfolio Audit
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="relative pt-6 border-t border-outline/20">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-3 w-3 text-error/50" />
                <h4 className="text-[9px] font-bold uppercase tracking-[0.25em] text-on-surface/50">Urgent Tasks</h4>
              </div>
              <span className={`text-[8px] font-bold uppercase tracking-widest ${urgentTasks[0].label.startsWith('0') ? 'text-success' : 'text-error'}`}>
                {urgentTasks[0].label.startsWith('0') ? 'Stable' : 'Review Required'}
              </span>
            </div>
            <div className="space-y-0">
              {urgentTasks.map((task, i) => (
                <div 
                  key={i} 
                  onClick={() => handleUrgentTaskClick(task.filter)}
                  className="flex items-center gap-4 py-4 border-b border-outline/5 last:border-0 group cursor-pointer"
                >
                  <div className={`w-1 h-1 rounded-full shrink-0 ${task.color}`} />
                  <p className="text-[12px] font-light text-on-surface/70 tracking-wide group-hover:text-on-surface transition-colors">{task.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <IngestModal 
        isOpen={isIngestOpen} 
        onClose={() => setIsIngestOpen(false)} 
        onSuccess={handleIngestSuccess} 
      />

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
        confirmLabel="Confirm Delete"
      />
    </div>
  );
}
