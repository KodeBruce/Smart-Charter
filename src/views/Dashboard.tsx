import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Activity, Clock, Shield, 
  ArrowUpRight, Download, Table, Calendar,
  Search, Bell, Filter, AlertTriangle, CheckCircle2,
  Plus, Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import IngestModal from '../components/IngestModal';
import { ContractAnalysis } from '../services/geminiService';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';

export default function Dashboard() {
  const navigate = useNavigate();
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [recentReviews, setRecentReviews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);

  const handleIngestSuccess = (analysis: any) => {
    navigate(`/contract/${analysis.id}`);
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'contracts'),
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contractsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRecentReviews(contractsData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contracts');
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const highRisk = recentReviews.filter(r => r.riskLevel === 'High Risk').length;
      setAuditResult(`Analysis complete. ${highRisk} high-priority risks identified across ${recentReviews.length} documents.`);
      setIsAuditing(false);
    }, 2000);
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Counterparty', 'Value', 'Risk Level', 'Status'];
    const rows = recentReviews.map(r => [
      r.name,
      r.counterparty || '-',
      r.value || '-',
      r.riskLevel || 'Medium',
      r.status || 'Active'
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "contract_portfolio.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = [
    { 
      label: 'Review Capacity', 
      value: `${Math.min(100, Math.round((recentReviews.length / 50) * 100))}%`, 
      trend: 'Portfolio utilization',
      icon: Activity,
      color: 'text-secondary-content',
      bgIcon: 'bg-secondary/10'
    },
    { 
      label: 'Critical Risks', 
      value: recentReviews.filter(r => r.riskLevel === 'High Risk').length.toString(), 
      trend: 'Requiring immediate action',
      icon: Shield,
      color: 'text-error',
      bgIcon: 'bg-error/10'
    },
    { 
      label: 'Portfolio Coverage', 
      value: recentReviews.length.toString(), 
      trend: 'Active documents',
      icon: Clock,
      color: 'text-blue-500',
      bgIcon: 'bg-blue-500/10'
    }
  ];

  // Calculate Urgent Tasks correctly
  const urgentTasks = [
    { 
      id: 1, 
      label: `${recentReviews.filter(r => r.status === 'Review Required').length} Contracts pending review`, 
      color: 'text-error' 
    },
    { 
      id: 2, 
      label: `${recentReviews.filter(r => r.riskLevel === 'High Risk').length} High-risk anomalies found`, 
      color: 'text-blue-500' 
    },
    { 
      id: 3, 
      label: `${recentReviews.filter(r => !r.projectId).length} Uncategorized documents`, 
      color: 'text-on-surface-variant/40' 
    },
  ];

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      {/* Refined Top Bar from Image Reference */}
      <div className="px-5 py-2 border-b border-outline flex items-center justify-between bg-surface/50 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-container rounded-lg border border-outline text-[8px] font-bold uppercase tracking-widest text-on-surface">
            <Activity className="h-2.5 w-2.5 text-secondary-content" />
            <span>Active: 6/10</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-container rounded-lg border border-outline text-[8px] font-bold uppercase tracking-widest text-on-surface">
            <Shield className="h-2.5 w-2.5 text-error" />
            <span>Risk: Minimal</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsIngestOpen(true)}
            className="bg-[#E2FF6F] text-black px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all text-[8px] font-extrabold uppercase tracking-widest shadow-lg shadow-[#E2FF6F]/10 mr-1"
          >
            <Plus className="h-3 w-3 stroke-[2.5]" />
            Upload Contract
          </button>
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-on-surface/40" />
            <input 
              type="text" 
              placeholder="Search documents..."
              className="pl-8 pr-10 py-1 bg-surface-container border border-outline rounded-lg text-[9px] font-bold outline-none focus:ring-1 focus:ring-secondary w-52 transition-all"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1 py-0.5 rounded border border-outline text-[7px] font-bold text-on-surface/30">
              ⌘K
            </div>
          </div>
          <button className="p-2 rounded-lg border border-outline hover:bg-surface-container transition-all relative">
            <Bell className="h-3.5 w-3.5 text-on-surface/60" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-error rounded-full border border-surface shadow-[0_0_8px_rgba(189,38,38,0.3)]" />
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-0.5">
          <p className="text-[8px] font-bold text-primary/70 tracking-[0.4em] uppercase leading-none mb-1">Business Insights</p>
          <div className="flex items-end justify-between">
            <h1 className="text-xl font-bold text-primary tracking-tighter leading-none">Contract Activity</h1>
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-on-surface/70 uppercase tracking-widest leading-none">
              <Calendar className="h-2.5 w-2.5" />
              <span>May 13, 2026</span>
            </div>
          </div>
        </header>

        <section id="walkthrough-stats" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={`dash-stat-${stat.label}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-surface-container-low border border-outline rounded-[20px] p-4 flex flex-col justify-between hover:shadow-lg hover:shadow-black/5 transition-all group cursor-default relative overflow-hidden"
            >
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <p className="text-[8px] font-bold tracking-[0.2em] text-on-surface-variant/70 uppercase leading-none">{stat.label}</p>
                  <p className="text-3xl font-bold mt-2 tracking-tighter text-primary leading-none">{stat.value}</p>
                </div>
                <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-outline relative z-10">
                <p className="text-[8px] text-on-surface-variant/60 font-bold uppercase tracking-widest leading-none">
                  {stat.trend}
                </p>
              </div>
            </motion.div>
          ))}
        </section>

        {/* Recent Activity */}
        <section className="bg-surface-container-low border border-outline rounded-[24px] overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between border-b border-outline">
            <h3 className="text-[9px] font-bold uppercase tracking-[0.3em] text-primary/70">Recent History</h3>
            <button 
              onClick={() => navigate('/repository')}
              className="text-primary text-[8px] font-bold uppercase tracking-widest hover:bg-surface-container px-3 py-1 rounded-lg transition-all border border-outline"
            >
              View All Documents
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container/30">
                  <th className="px-5 py-2.5 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80">Document Name</th>
                  <th className="px-5 py-2.5 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80 text-center">Risk Level</th>
                  <th className="px-5 py-2.5 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80">Reviewer</th>
                  <th className="px-5 py-2.5 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/80 text-right">Last Modified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline/50">
                {recentReviews.map((item) => (
                  <tr 
                    key={`dash-review-${item.id}`} 
                    onClick={() => navigate(`/contract/${item.id}`)}
                    className="hover:bg-surface-container transition-all group cursor-pointer"
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-surface-container rounded-lg flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                          <FileText className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[11px] font-bold text-primary tracking-tight">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      <span className={`inline-flex items-center text-[7px] font-bold uppercase tracking-widest
                        ${item.riskLevel === 'High Risk' ? 'text-error' : 
                          item.riskLevel === 'Medium Risk' ? 'text-warning' : 
                          'text-success'}`}
                      >
                        {item.riskLevel || 'Reviewing'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-primary text-white text-[8px] flex items-center justify-center font-bold">
                          {auth.currentUser?.displayName?.charAt(0) || 'U'}
                        </div>
                        <span className="text-[10px] text-on-surface font-bold tracking-tight">{auth.currentUser?.displayName || 'Owner'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right text-[8px] text-on-surface-variant/70 font-bold uppercase tracking-widest">
                      {item.updatedAt?.toDate?.() ? item.updatedAt.toDate().toLocaleDateString() : 'Recently'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6">
          <div className="bg-[#000000] text-white p-6 rounded-[24px] flex items-start gap-4 overflow-hidden relative shadow-2xl border border-white/5 group transition-all">
            <div className="relative z-10 flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-1.5 bg-[#E2FF6F] rounded-lg shadow-lg shadow-[#E2FF6F]/20">
                  <Sparkles className="h-3.5 w-3.5 text-black" />
                </div>
                <h4 className="text-md font-bold tracking-tighter">Portfolio Analysis</h4>
              </div>
              <p className="text-[10px] text-white/50 leading-relaxed font-medium min-h-[30px]">
                {auditResult || "Automated analysis suggested 14% of your NDAs are reaching renewal. Run an audit to refresh your risk profile."}
              </p>
              <button 
                onClick={handleRunAudit}
                disabled={isAuditing}
                className="mt-5 bg-white/5 hover:bg-white/10 transition-all text-white px-5 py-2 rounded-xl text-[8px] font-bold uppercase tracking-widest border border-white/10 flex items-center gap-2 disabled:opacity-50"
              >
                {isAuditing ? 'Auditing...' : 'Run Portfolio Audit'}
                <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-5">
               <Activity className="h-24 w-24" />
            </div>
          </div>

          <div className="p-6 border border-outline bg-surface-container-low rounded-[24px] flex flex-col justify-between shadow-sm hover:shadow-lg transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[9px] font-bold uppercase tracking-[0.3em] text-primary/70">Urgent Tasks</h4>
              </div>
              <div className="space-y-4">
                {urgentTasks.map((task) => (
                  <div key={`dash-urgent-task-${task.id}`} className="flex items-center gap-2.5 group cursor-pointer">
                    <span className={`w-1 h-1 rounded-full ${task.color.startsWith('bg-') ? task.color : 'bg-current ' + task.color}`} />
                    <p className="text-[10px] font-bold text-on-surface tracking-tight group-hover:text-primary transition-colors">{task.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <button 
                onClick={handleExportCSV}
                className="flex-1 px-3 py-2 border border-outline bg-surface text-on-surface text-[8px] font-bold uppercase tracking-widest rounded-lg hover:bg-surface-container transition-all flex items-center justify-center gap-1.5"
              >
                <Download className="h-3 w-3" />
                Export CSV
              </button>
              <button 
                onClick={() => navigate('/repository')}
                className="flex-1 px-3 py-2 border border-outline bg-surface text-on-surface text-[8px] font-bold uppercase tracking-widest rounded-lg hover:bg-surface-container transition-all flex items-center justify-center gap-1.5"
              >
                <Table className="h-3 w-3" />
                Table View
              </button>
            </div>
          </div>
        </section>
      </div>

      <IngestModal 
        isOpen={isIngestOpen} 
        onClose={() => setIsIngestOpen(false)} 
        onSuccess={handleIngestSuccess} 
      />
    </div>
  );
}
