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
  const [editingContract, setEditingContract] = useState<any | null>(null);
  const [editedFields, setEditedFields] = useState({
    name: '',
    counterparty: '',
    category: '',
    value: '',
    expiry: '',
    content: ''
  });

  const handleDeleteContract = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await deleteDoc(doc(db, 'contracts', id));
      setActiveMenuId(null);
    } catch (error: any) {
      alert("Failed to delete document. You may not have permission.");
      handleFirestoreError(error, OperationType.DELETE, `contracts/${id}`);
    }
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
    ? Math.round(allContracts.reduce((acc, curr) => acc + (curr.overallRiskScore || 0), 0) / allContracts.length)
    : 0;

  const currentStats = [
    { label: 'Total Value', value: `$${(totalValue / 1000000).toFixed(1)}M`, icon: Banknote, color: 'text-secondary-content' },
    { label: 'Active Documents', value: allContracts.length.toString(), icon: Files, color: 'text-secondary-content' },
    { label: 'Expiring 30d', value: allContracts.filter(c => getDaysRemaining(c.expiry) <= 30).length.toString(), icon: CalendarClock, color: 'text-error' },
    { label: 'Average Risk', value: `${avgRisk}%`, icon: Gauge, color: 'text-blue-500' },
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
      {/* Search & Action Bar */}
      <div className="px-5 py-2 border-b border-outline flex items-center justify-between bg-surface/50 backdrop-blur-sm z-20">
        <div className="flex items-center gap-2.5">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-on-surface/40" />
            <input 
              type="text" 
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-10 py-1 bg-surface-container border border-outline rounded-lg text-[9px] font-bold outline-none focus:ring-1 focus:ring-secondary w-64 transition-all"
            />
          </div>
          <div className="flex bg-surface-container border border-outline rounded-lg p-0.5">
            <button 
              onClick={() => setGroupBy('none')}
              className={`px-2 py-1 text-[7px] font-bold uppercase tracking-widest rounded-md transition-all ${groupBy === 'none' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/40'}`}
            >
              All
            </button>
            <button 
              onClick={() => setGroupBy('category')}
              className={`px-2 py-1 text-[7px] font-bold uppercase tracking-widest rounded-md transition-all ${groupBy === 'category' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/40'}`}
            >
              By Category
            </button>
            <button 
              onClick={() => setGroupBy('year')}
              className={`px-2 py-1 text-[7px] font-bold uppercase tracking-widest rounded-md transition-all ${groupBy === 'year' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/40'}`}
            >
              By Expiry Year
            </button>
          </div>

          <div className="flex bg-surface-container border border-outline rounded-lg p-0.5">
            <select
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value as any)}
              className="bg-transparent text-[7px] font-bold uppercase tracking-widest px-2 py-1 outline-none text-primary/60 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="30d">In 30 Days</option>
              <option value="90d">In 90 Days</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          
          {/* Compare Button */}
          {selectedIds.length > 1 && (
            <motion.button 
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              onClick={handleCompare}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Files className="h-3 w-3" />
              Compare ({selectedIds.length})
            </motion.button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsIngestOpen(true)}
            className="bg-[#E2FF6F] text-black px-4 py-1.5 rounded-lg flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all text-[8px] font-extrabold uppercase tracking-widest shadow-lg shadow-[#E2FF6F]/10"
          >
            <Plus className="h-3 w-3 stroke-[2.5]" />
            Upload Contract
          </button>
          <button className="p-2 rounded-lg border border-outline hover:bg-surface-container transition-all">
            <Bell className="h-3.5 w-3.5 text-on-surface/60" />
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-0.5">
          <p className="text-[8px] font-bold text-primary/70 tracking-[0.4em] uppercase mb-1">Document Management</p>
          <div className="flex items-end justify-between">
            <h1 className="text-xl font-bold text-primary tracking-tighter">Document Library</h1>
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-on-surface/70 uppercase tracking-widest">
              <Calendar className="h-2.5 w-2.5" />
              <span>May 13, 2026</span>
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

        {/* Repository Table */}
        <div className="bg-surface-container-low rounded-[24px] border border-outline overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container/30">
                <th className="px-5 py-3 w-10">
                  <div 
                    onClick={toggleAll}
                    className={`w-3.5 h-3.5 rounded border transition-all cursor-pointer flex items-center justify-center
                      ${selectedIds.length === allContracts.length 
                        ? 'bg-primary border-primary text-white' 
                        : 'border-outline hover:border-primary'}`}
                  >
                    {selectedIds.length === allContracts.length && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-1.5 h-1.5 bg-white rounded-full" />
                    )}
                  </div>
                </th>
                <th className="px-1 py-3 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80">Document Name</th>
                <th className="px-5 py-3 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80">Workspace</th>
                <th className="px-5 py-3 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80">Category</th>
                <th className="px-5 py-3 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80">Started</th>
                <th className="px-5 py-3 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80 text-right">Value</th>
                <th className="px-5 py-3 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80 text-right text-nowrap">Expiry</th>
                <th className="px-5 py-3 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80 text-right text-nowrap">Due In</th>
                <th className="px-5 py-3 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80">Risk Level</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline/50 text-[11px] font-medium">
              {filteredContracts.map((item) => (
                <tr 
                  key={`repo-row-${item.id}`} 
                  onClick={() => navigate('/contract/' + item.id)}
                  className={`hover:bg-surface-container transition-all group cursor-pointer ${(selectedIds || []).includes(item.id) ? 'bg-surface-container-high' : ''}`}
                >
                  <td className="px-5 py-3">
                    <div 
                      onClick={(e) => toggleSelection(item.id, e)}
                      className={`w-3.5 h-3.5 rounded border transition-all cursor-pointer flex items-center justify-center
                        ${(selectedIds || []).includes(item.id) 
                          ? 'bg-primary border-primary text-white' 
                          : 'border-outline group-hover:border-primary'}`}
                    >
                      {(selectedIds || []).includes(item.id) && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-1.5 h-1.5 bg-white rounded-full" />
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-sm ${item.source === 'Hub' ? 'bg-secondary/10 text-secondary' : 'bg-surface-container text-primary'} group-hover:bg-primary group-hover:text-white`}>
                        {item.source === 'Hub' ? <Sparkles className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                      </div>
                      <div>
                         <div className="flex items-center gap-1.5">
                           <p className="font-bold text-primary tracking-tight leading-none text-[11px] truncate max-w-[120px]">{item.name}</p>
                           {item.source === 'Hub' && (
                             <span className="text-[6px] font-bold bg-secondary/10 text-secondary px-1 py-0.5 rounded uppercase tracking-tighter border border-secondary/20">Generated</span>
                           )}
                         </div>
                        <p className="text-[8px] text-on-surface-variant/80 font-bold uppercase tracking-widest mt-1 truncate max-w-[120px]">{item.counterparty}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {item.projectId ? (
                      <span className="text-[9px] font-bold text-secondary-content bg-secondary/10 px-2 py-0.5 rounded-md border border-secondary/20">
                        {projects[item.projectId] || 'Linking...'}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-on-surface/20 uppercase tracking-[0.2em]">Personal Vault</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                     <span className={`px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest ${
                        item.source === 'Hub' ? 'bg-secondary text-primary' : 'bg-surface-container-high text-primary/60'
                     }`}>
                        {item.source === 'Hub' ? 'Execution Hub' : 'Analysis Vault'}
                     </span>
                  </td>
                  <td className="px-5 py-3">
                     <span className="px-2 py-0.5 rounded-md bg-surface border border-outline text-[8px] font-bold uppercase tracking-widest text-primary/70">
                        {item.category}
                     </span>
                  </td>
                  <td className="px-5 py-3 font-bold text-on-surface/40 tracking-tight text-[10px]">{formatFirebaseDate(item.startDate)}</td>
                  <td className="px-5 py-3 font-bold text-on-surface tracking-tight text-right">{item.value}</td>
                  <td className="px-5 py-3 font-bold text-on-surface tracking-tight text-right">{formatFirebaseDate(item.expiry)}</td>
                  <td className="px-5 py-3 font-bold text-right">
                    <span className={`text-[10px] ${getDaysRemaining(item.expiry) < 90 ? 'text-error' : 'text-primary/60'}`}>
                       {item.expiry === 'Indefinite' ? '—' : `${getDaysRemaining(item.expiry)}d`}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 text-[7px] font-bold uppercase tracking-widest
                      ${item.risk === 'High Risk' ? 'text-error' : 
                        item.risk === 'Medium Risk' ? 'text-warning' : 
                        'text-success'}`}
                    >
                      {item.risk}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="relative inline-block text-left">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === item.id ? null : item.id);
                        }}
                        className={`p-1.5 rounded-full hover:bg-surface text-on-surface-variant/30 hover:text-primary transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-outline ${activeMenuId === item.id ? 'opacity-100 border-outline bg-surface text-primary' : ''}`}
                      >
                        <MoreVertical className="h-3 w-3" />
                      </button>

                      <AnimatePresence>
                        {activeMenuId === item.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={(e) => {
                               e.stopPropagation();
                               setActiveMenuId(null);
                            }} />
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: -10 }}
                              className="absolute right-0 top-full mt-2 w-48 bg-surface border border-outline rounded-2xl shadow-2xl z-20 py-2 p-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button 
                                onClick={() => {
                                  setEditingContract(item);
                                  setEditedFields({
                                    name: item.name || '',
                                    counterparty: item.counterparty || '',
                                    category: item.category || '',
                                    value: item.value || '',
                                    expiry: item.expiryDate || item.expiry || '',
                                    content: item.content || ''
                                  });
                                  setIsEditModalOpen(true);
                                  setActiveMenuId(null);
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-primary transition-all text-left"
                              >
                                <Edit3 className="h-3.5 w-3.5 text-primary/40" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Edit Details</span>
                              </button>
                              <div className="h-px bg-outline mx-2 my-1" />
                              <button 
                                onClick={(e) => handleDeleteContract(item.id, e)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-error/10 text-error transition-all text-left"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Delete Contract</span>
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="px-5 py-3 flex items-center justify-between border-t border-outline bg-surface-container/10">
            <p className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/40">1 - 5 of 842 total</p>
            <div className="flex gap-1.5">
              <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline hover:bg-surface-container transition-all">
                <ChevronLeft className="h-3 w-3 text-on-surface/40" />
              </button>
              <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary text-white text-[8px] font-bold shadow-lg">1</button>
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
          <div className="bg-primary text-surface p-8 rounded-[32px] flex items-start gap-6 overflow-hidden relative shadow-2xl border border-outline group transition-all">
            <div className="relative z-10 flex-1">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-secondary rounded-lg shadow-lg shadow-secondary/20">
                  <Sparkles className="h-4 w-4 text-secondary-content" />
                </div>
                <h3 className="text-lg font-bold tracking-tighter">Portfolio Analysis</h3>
              </div>
              <p className="text-xs text-surface/50 leading-relaxed font-medium min-h-[40px]">
                {auditResult || "Analysis suggests 14% of NDAs are reaching their renewal dates. Prepare bulk renewals with updated legal analysis."}
              </p>
              <button 
                onClick={handleRunAudit}
                disabled={isAuditing}
                className="mt-6 bg-surface/5 hover:bg-surface/10 transition-all text-surface px-6 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest border border-surface/10 flex items-center gap-2 disabled:opacity-50"
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
                className="flex-1 py-2.5 bg-surface border border-outline rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-surface-container transition-all flex items-center justify-center gap-2"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
              <button 
                onClick={() => navigate('/repository')}
                className="flex-1 py-2.5 bg-surface border border-outline rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-surface-container transition-all flex items-center justify-center gap-2"
              >
                <Table className="h-3.5 w-3.5" />
                Table View
              </button>
            </div>
          </div>
        </div>
      </div>

      <IngestModal 
        isOpen={isIngestOpen} 
        onClose={() => setIsIngestOpen(false)} 
        onSuccess={handleIngestSuccess} 
      />

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-outline rounded-[32px] p-8 w-full max-w-lg shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-primary tracking-tight">Edit Document Details</h2>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface/40">Manually update legal metadata</p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Document Name</label>
                  <input 
                    type="text"
                    value={editedFields.name}
                    onChange={(e) => setEditedFields({...editedFields, name: e.target.value})}
                    className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Counterparty</label>
                    <input 
                      type="text"
                      value={editedFields.counterparty}
                      onChange={(e) => setEditedFields({...editedFields, counterparty: e.target.value})}
                      className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Category</label>
                    <input 
                      type="text"
                      value={editedFields.category}
                      onChange={(e) => setEditedFields({...editedFields, category: e.target.value})}
                      className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Value</label>
                    <input 
                      type="text"
                      value={editedFields.value}
                      onChange={(e) => setEditedFields({...editedFields, value: e.target.value})}
                      className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Expiry Date</label>
                    <input 
                      type="text"
                      value={editedFields.expiry}
                      onChange={(e) => setEditedFields({...editedFields, expiry: e.target.value})}
                      className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Move to Workspace</label>
                  <select 
                    value={editingContract.projectId || ''}
                    onChange={(e) => {
                      const newProjectId = e.target.value || null;
                      setEditingContract({...editingContract, projectId: newProjectId});
                    }}
                    className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none appearance-none cursor-pointer"
                  >
                    <option value="">Personal Vault (No Workspace)</option>
                    {Object.entries(projects).map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Document Content</label>
                  <textarea 
                    rows={6}
                    value={editedFields.content}
                    onChange={(e) => setEditedFields({...editedFields, content: e.target.value})}
                    placeholder="Enter document text here..."
                    className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-medium outline-none resize-none"
                  />
                </div>

                <button 
                  onClick={handleUpdateContract}
                  className="w-full py-4 bg-primary text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all mt-4"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
