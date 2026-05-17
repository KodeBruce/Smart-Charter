import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Upload, Filter, Search, 
  ChevronLeft, ChevronRight, MoreVertical, 
  Banknote, Files, CalendarClock, Gauge, Sparkles,
  ArrowUpRight, Download, Table, Calendar, Bell, Plus, Trash2, Edit3, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import IngestModal from '../components/IngestModal';
import TopBar from '../components/TopBar';
import ConfirmationModal from '../components/ConfirmationModal';
import { ContractAnalysis } from '../services/geminiService';
import { db, auth, OperationType, handleFirestoreError, toStandardDate, formatFirebaseDate } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, setDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';

const stats = [
  { label: 'Total Value', value: '-', icon: Banknote, color: 'text-secondary-content' },
  { label: 'Active Documents', value: '-', icon: Files, color: 'text-secondary-content' },
  { label: 'Expiring 30d', value: '-', icon: CalendarClock, color: 'text-error' },
  { label: 'Average Risk', value: '-', icon: Gauge, color: 'text-blue-500' },
];

export default function Repository() {
  const navigate = useNavigate();
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allContracts, setAllContracts] = useState<any[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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
  const [editingContract, setEditingContract] = useState<any | null>(null);
  const [editedFields, setEditedFields] = useState({
    name: '',
    counterparty: '',
    category: '',
    value: '',
    expiry: '',
    content: ''
  });

  const handleDeleteContract = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Document',
      message: 'Are you sure you want to delete this document? This action cannot be undone.',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'contracts', id));
          setActiveMenuId(null);
        } catch (error: any) {
          handleFirestoreError(error, OperationType.DELETE, `contracts/${id}`);
        }
      }
    });
  };

  const handleUpdateContract = async () => {
    if (!editingContract) return;
    try {
      await setDoc(doc(db, 'contracts', editingContract.id), {
        name: editedFields.name,
        counterparty: editedFields.counterparty,
        category: editedFields.category,
        value: editedFields.value,
        expiryDate: editedFields.expiry, // Note: it was mapped to expiryDate in onSnapshot
        content: editedFields.content,
        projectId: editingContract.projectId || null,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setIsEditModalOpen(false);
      setEditingContract(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contracts/${editingContract.id}`);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch Projects for names mapping
    const qProjects = query(
      collection(db, 'projects'),
      where('ownerId', '==', auth.currentUser.uid)
    );

    const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
      const projMap: Record<string, string> = {};
      snapshot.docs.forEach(d => projMap[d.id] = d.data().name);
      setProjects(projMap);
    });

    const q = query(
      collection(db, 'contracts'),
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contractsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          expiry: data.expiryDate, // Map for existing display logic
          risk: data.riskLevel || 'Low Risk' // Map for table display
        };
      });
      setAllContracts(contractsData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contracts');
    });

    return () => {
      unsubscribe();
      unsubscribeProjects();
    };
  }, [auth.currentUser]);

  const handleIngestSuccess = (analysis: any) => {
    navigate(`/contract/${analysis.id}`);
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => 
      (prev || []).includes(id) ? prev.filter(i => i !== id) : [...(prev || []), id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === allContracts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allContracts.map(c => c.id));
    }
  };

  const handleCompare = () => {
    const selectedContracts = allContracts.filter(c => (selectedIds || []).includes(c.id));
    navigate('/compare', { state: { contracts: selectedContracts } });
  };

  const handleBulkDelete = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Bulk Delete',
      message: `Are you sure you want to delete ${selectedIds.length} documents? This action will remove all selected files permanently.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          const promises = selectedIds.map(id => deleteDoc(doc(db, 'contracts', id)));
          await Promise.all(promises);
          setSelectedIds([]);
        } catch (error: any) {
          handleFirestoreError(error, OperationType.DELETE, `bulk_contracts`);
        }
      }
    });
  };

  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'year'>('none');
  const [expiryFilter, setExpiryFilter] = useState<'all' | '30d' | '90d' | 'expired'>('all');
  const [activeSource, setActiveSource] = useState<'all' | 'Vault' | 'Hub'>('all');

  const getDaysRemaining = (expiry: any) => {
    if (!expiry || expiry === 'Indefinite' || expiry === 'TBD') return Infinity;
    try {
      const exp = toStandardDate(expiry);
      if (!exp || isNaN(exp.getTime())) return Infinity;
      const today = new Date();
      const diffTime = exp.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return Infinity;
    }
  };

  const getYear = (expiry: any) => {
    if (!expiry || expiry === 'Indefinite' || expiry === 'TBD') return 'Indefinite';
    try {
      const date = toStandardDate(expiry);
      return !date || isNaN(date.getTime()) ? 'Indefinite' : date.getFullYear().toString();
    } catch {
      return 'Indefinite';
    }
  };

  const filteredContracts = allContracts
    .filter(item => {
      const days = getDaysRemaining(item.expiry);
      const matchesSource = activeSource === 'all' || item.source === activeSource;
      
      const matchesSearch = 
        (item.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (item.counterparty?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      if (!matchesSource || !matchesSearch) return false;
      if (expiryFilter === 'expired') return days < 0;
      if (expiryFilter === '30d') return days >= 0 && days <= 30;
      if (expiryFilter === '90d') return days >= 0 && days <= 90;
      return true;
    });

  // Calculate dynamic stats
  const totalValue = allContracts.reduce((acc, curr) => {
    const val = parseFloat(curr.value?.replace(/[^0-9.]/g, '') || '0');
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const avgRisk = allContracts.length > 0 
    ? Math.min(100, Math.round(allContracts.reduce((acc, curr) => acc + (Math.min(100, curr.overallRiskScore || 0)), 0) / allContracts.length))
    : 0;

  const currentStats = [
    { label: 'Total Value', value: `$${(totalValue / 1000000).toFixed(1)}M`, icon: Banknote, color: 'text-primary' },
    { label: 'Active Documents', value: allContracts.length.toString(), icon: Files, color: 'text-primary' },
    { label: 'Expiring 30d', value: allContracts.filter(c => getDaysRemaining(c.expiry) <= 30).length.toString(), icon: CalendarClock, color: 'text-error' },
    { label: 'Average Risk', value: `${avgRisk}%`, icon: Gauge, color: 'text-secondary' },
  ];

  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);

  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const renewing = allContracts.filter(c => {
        const days = getDaysRemaining(c.expiry);
        return days >= 0 && days <= 90;
      }).length;
      const percentage = allContracts.length > 0 ? Math.round((renewing / allContracts.length) * 100) : 0;
      setAuditResult(`Analysis suggests ${percentage}% of contracts are reaching their renewal dates within 90 days. Prepare bulk renewals.`);
      setIsAuditing(false);
    }, 2000);
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Counterparty', 'Value', 'Risk Level', 'Expiry'];
    const rows = filteredContracts.map(r => [
      r.name,
      r.counterparty || '-',
      r.value || '-',
      r.riskLevel || 'Medium',
      r.expiry || '-'
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "legal_portfolio_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const urgentTasks = [
    { 
      id: 1, 
      label: `${allContracts.filter(c => c.status === 'Review Required').length} Contracts missing signatures`, 
      color: 'bg-error' 
    },
    { 
      id: 2, 
      label: `${allContracts.filter(c => c.riskLevel === 'High Risk').length} High-risk clauses require attorney review`, 
      color: 'text-blue-500' 
    },
    { 
      id: 3, 
      label: `${allContracts.filter(c => !c.category).length} AI findings pending review`, 
      color: 'text-primary/40' 
    },
  ];

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      <TopBar 
        title="Intelligence Portfolio" 
        actions={
          <div className="flex items-center gap-3">
             {selectedIds.length > 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                <button 
                  onClick={handleBulkDelete}
                  className="px-4 py-1.5 bg-error/10 text-error border border-error/20 rounded text-[9px] font-bold uppercase tracking-widest hover:bg-error/20 transition-all"
                >
                  Delete ({selectedIds.length})
                </button>
                <button 
                  onClick={handleCompare}
                  className="px-4 py-1.5 bg-primary text-on-primary rounded text-[9px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                >
                  Compare
                </button>
              </motion.div>
            )}
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

      {/* Sub-Header Filters */}
      <div className="px-8 py-3 border-b border-outline/5 flex items-center justify-between bg-surface-container-lowest/30 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface/30">View:</span>
            <div className="flex bg-surface-container border border-outline/10 rounded p-0.5">
              {[
                { id: 'none', label: 'All' },
                { id: 'category', label: 'By Category' },
                { id: 'year', label: 'By Year' }
              ].map(opt => (
                <button 
                  key={opt.id}
                  onClick={() => setGroupBy(opt.id as any)}
                  className={`px-3 py-1 text-[8px] font-bold uppercase tracking-widest rounded transition-all ${groupBy === opt.id ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/40 hover:text-on-surface/60'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface/30">Filter:</span>
            <select
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value as any)}
              className="bg-surface-container border border-outline/10 text-[8px] font-bold uppercase tracking-widest px-3 py-1.5 rounded outline-none text-primary cursor-pointer"
            >
              <option value="all">Status: All</option>
              <option value="30d">Due 30 Days</option>
              <option value="90d">Due 90 Days</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 text-[9px] font-bold text-on-surface/40 hover:text-primary transition-all uppercase tracking-widest"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
        </div>
      </div>
      <div className="px-8 py-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-0.5">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40 leading-none mb-2">Document Management</p>
          <div className="flex items-end justify-between">
            <h1 id="walkthrough-repository-view" className="text-2xl font-black text-primary tracking-tighter leading-none">Document Library</h1>
            <div className="flex items-center gap-1.5 text-[9px] font-black text-on-surface/30 uppercase tracking-[0.2em]">
              <Calendar className="h-3 w-3" />
              <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>
            </div>
          </div>

          <div className="flex items-center gap-6 mt-6 border-b border-outline">
            {[
              { id: 'all', label: 'All Documents', count: allContracts.length },
              { id: 'Vault', label: 'Analysis Vault', icon: Upload, count: allContracts.filter(c => c.source === 'Vault').length },
              { id: 'Hub', label: 'Execution Hub', icon: Sparkles, count: allContracts.filter(c => c.source === 'Hub').length }
            ].map((tab) => (
              <button 
                key={`repo-tab-${tab.id}`}
                onClick={() => setActiveSource(tab.id as any)}
                className={`pb-3 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all relative ${activeSource === tab.id ? 'text-primary' : 'text-on-surface-variant/40 hover:text-primary'}`}
              >
                {tab.icon && <tab.icon className="h-3 w-3" />}
                {tab.label}
                <span className="text-[8px] bg-surface-container px-1.5 py-0.5 rounded-full border border-outline ml-1">
                  {tab.count}
                </span>
                {activeSource === tab.id && (
                  <motion.div layoutId="repo-tab" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>
        </header>

        {/* Mini Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {currentStats.map((stat, i) => (
            <motion.div
              key={`repo-stat-${stat.label}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="bg-surface-container-low p-4 rounded-[20px] border border-outline flex items-center justify-between hover:shadow-lg transition-all group"
            >
              <div>
                <p className="text-[7.5px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/70 leading-none">{stat.label}</p>
                <p className="text-lg font-bold text-primary mt-1.5 tracking-tighter leading-none">{stat.value}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-outline group-hover:scale-110 transition-transform">
                <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Repository table omitted while debugging */}

          {/* Pagination */}
          <div className="px-5 py-3 flex items-center justify-between border-t border-outline bg-surface-container/10">
            <p className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/40">1 - 5 of 842 total</p>
            <div className="flex gap-1.5">
              <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline hover:bg-surface-container transition-all">
                <ChevronLeft className="h-3 w-3 text-on-surface/40" />
              </button>
              <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary text-on-primary text-[8px] font-bold shadow-lg">1</button>
              <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline hover:bg-surface-container transition-all text-[8px] font-bold text-on-surface/40">2</button>
              <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline hover:bg-surface-container transition-all text-[8px] font-bold text-on-surface/40">3</button>
              <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline hover:bg-surface-container transition-all">
                <ChevronRight className="h-3 w-3 text-on-surface/40" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Heuristics Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 pb-8">
          <div className="bg-[#000000] text-white p-8 rounded-[32px] flex items-start gap-6 overflow-hidden relative shadow-2xl border border-white/5 group transition-all">
            <div className="relative z-10 flex-1">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-[#E2FF6F] rounded-lg shadow-lg shadow-[#E2FF6F]/20">
                  <Sparkles className="h-4 w-4 text-black" />
                </div>
                <h3 className="text-lg font-bold tracking-tighter">Portfolio Analysis</h3>
              </div>
              <p className="text-xs text-white/50 leading-relaxed font-medium min-h-[40px]">
                {auditResult || "Analysis suggests 14% of NDAs are reaching their renewal dates. Prepare bulk renewals with updated legal analysis."}
              </p>
              <button 
                onClick={handleRunAudit}
                disabled={isAuditing}
                className="mt-6 bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 transition-all text-white px-6 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest border border-white/10 flex items-center gap-2 disabled:opacity-50"
              >
                {isAuditing ? 'Auditing...' : 'Run Portfolio Audit'}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="border border-outline bg-surface-container-low p-8 rounded-[32px] flex flex-col justify-between shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.4em] text-primary/70">Urgent Tasks</h3>
              <div className={`text-[8px] font-bold uppercase tracking-widest ${allContracts.some(c => c.riskLevel === 'High Risk') ? 'text-error' : 'text-success'}`}>
                Priority: {allContracts.some(c => c.riskLevel === 'High Risk') ? 'Critical' : 'Stable'}
              </div>
            </div>
            <div className="space-y-5">
              {urgentTasks.map((action) => (
                <div key={`repo-urgent-task-${action.id}`} className="flex items-center gap-3 group cursor-pointer">
                  <span className={`w-1.5 h-1.5 rounded-full ${action.color.startsWith('bg-') ? action.color : 'bg-current ' + action.color} group-hover:scale-150 transition-transform`} />
                  <p className="text-xs font-bold text-on-surface tracking-tight group-hover:text-primary transition-colors">{action.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-8 border-t border-outline flex items-center gap-3">
              <button 
                onClick={handleExportCSV}
                className="flex-1 py-2.5 bg-surface dark:bg-surface-container-high border border-outline dark:border-outline/20 rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-surface-container dark:hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
              <button 
                onClick={() => navigate('/repository')}
                className="flex-1 py-2.5 bg-surface dark:bg-surface-container-high border border-outline dark:border-outline/20 rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-surface-container dark:hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2"
              >
                <Table className="h-3.5 w-3.5" />
                Table View
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals temporarily disabled while debugging syntax error */}
    </div>
  );
}
