import React, { useState, useEffect } from 'react';
import { 
  Zap, Clock, ShieldCheck, Target, 
  GitPullRequest, MessageSquare, AlertCircle,
  ChevronRight, ArrowRight, BarChart3,
  Calendar, Shield, Globe, Scale, Sparkles, X, RefreshCw,
  Minimize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateText, generateJson } from '../services/geminiService';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SentinelEvent {
  id: number | string;
  jurisdiction: string;
  event: string;
  impact: 'Low' | 'Medium' | 'High';
  time: string;
  agent: string;
  source?: 'live' | 'ai-generated';
  impactedContracts?: number;
}

interface RedlineSuggestion {
  id: string;
  clause: string;
  original: string;
  suggested: string;
  simulation: string;
  risk: 'High' | 'Medium' | 'Low';
  corroboratedBy: string[];
  contract: string;
}

interface Obligation {
  id: string;
  title: string;
  date: string;
  status: string;
  type: string;
  contract: string;
  verifiedSources: number;
}

interface ComplianceItem {
  id: string;
  standard: string;
  status: 'Aligned' | 'Warning' | 'Verified';
  score: number;
  detail: string;
  sources: string[];
  contract: string;
}

interface ActiveNotification {
  id: string;
  taskId: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'error';
}

interface NeuralTask {
  id: string;
  title: string;
  context: string;
  status: 'running' | 'completed' | 'failed';
  insight: any | null;
}

export default function StrategicHub() {
  const [activeView, setActiveView] = useState<'all' | 'negotiation' | 'obligations' | 'compliance'>('all');

  // ─── Real Firestore Data ───────────────────────────────────────────────────
  const [redlineSuggestions, setRedlineSuggestions] = useState<RedlineSuggestion[]>([]);
  const [obligations, setObligations]               = useState<Obligation[]>([]);
  const [complianceRadar, setComplianceRadar]       = useState<ComplianceItem[]>([]);
  const [isLoadingData, setIsLoadingData]           = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'contracts'),
      where('ownerId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contracts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

      // ── Redline Suggestions from real critical clauses ──────────────────
      const redlines: RedlineSuggestion[] = contracts.flatMap(contract => {
        const analysis = (() => {
          try { return JSON.parse(contract.analysis || '{}'); } catch { return {}; }
        })();
        const clauses: any[] = analysis.keyClauses || contract.keyClauses || [];
        return clauses
          .filter((c: any) => c.priority === 'Critical' || c.risk === 'High')
          .slice(0, 2)
          .map((c: any) => ({
            id: `${contract.id}-${c.title}`,
            clause: c.title,
            original: (c.content || 'See original document.').slice(0, 140),
            suggested: c.citation
              ? `Align with ${c.citation}. Consider revising scope of obligation.`
              : 'Narrow scope, add mutual obligation caps, and reference governing standards.',
            simulation: c.implications || 'High-risk clause. Review with legal counsel before signing.',
            risk: (c.priority === 'Critical' ? 'High' : 'Medium') as 'High' | 'Medium' | 'Low',
            corroboratedBy: [c.citation || 'AI Analysis', 'International Legal Norms', contract.governingLaw || 'General Law'].filter(Boolean),
            contract: analysis.name || contract.name || 'Untitled'
          }));
      });
      setRedlineSuggestions(redlines.slice(0, 4));

      // ── Obligations from real keyObligations ────────────────────────────
      const obs: Obligation[] = contracts.flatMap(contract => {
        const analysis = (() => {
          try { return JSON.parse(contract.analysis || '{}'); } catch { return {}; }
        })();
        const raw: string[] = analysis.keyObligations || contract.keyObligations || [];
        return raw.slice(0, 2).map((ob: string, i: number) => ({
          id: `${contract.id}-ob-${i}`,
          title: ob,
          date: analysis.expiry || contract.expiry || 'No date set',
          status: (analysis.riskLevel || contract.riskLevel) === 'High Risk' ? 'Urgent' : 'Pending',
          type: 'Contractual',
          contract: analysis.name || contract.name || 'Untitled',
          verifiedSources: 3
        }));
      });
      setObligations(obs.slice(0, 6));

      // ── Compliance Radar from real missingProtections ───────────────────
      const radar: ComplianceItem[] = contracts.flatMap(contract => {
        const analysis = (() => {
          try { return JSON.parse(contract.analysis || '{}'); } catch { return {}; }
        })();
        const gaps: any[] = analysis.missingProtections || contract.missingProtections || [];
        const riskScore: number = analysis.riskScore || contract.riskScore || 50;
        return gaps.slice(0, 2).map((gap: any, i: number) => ({
          id: `${contract.id}-gap-${i}`,
          standard: gap.title || 'Unknown Standard',
          status: ((analysis.riskLevel || contract.riskLevel) === 'High Risk' ? 'Warning' : 'Aligned') as 'Aligned' | 'Warning' | 'Verified',
          score: Math.max(10, 100 - riskScore),
          detail: gap.suggestion || 'Review recommended.',
          sources: [gap.reference || 'Internal Analysis', 'AI Legal Review'],
          contract: analysis.name || contract.name || 'Untitled'
        }));
      });
      setComplianceRadar(radar.slice(0, 4));

      setIsLoadingData(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contracts');
      setIsLoadingData(false);
    });

    return () => unsubscribe();
  }, []);

  // ─── Sentinel Feed (real news API) ────────────────────────────────────────
  const [liveAgentFeed, setLiveAgentFeed] = useState<SentinelEvent[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [feedSource, setFeedSource] = useState<'live' | 'ai-generated'>('ai-generated');

  // Background Neural Task Queue state
  const [neuralTasks, setNeuralTasks] = useState<NeuralTask[]>([]);
  const [notifications, setNotifications] = useState<ActiveNotification[]>([]);

  const [intelligenceModal, setIntelligenceModal] = useState<{
    isOpen: boolean;
    title: string;
    context: string;
    insight: any | null;
    taskId: string;
  } | null>(null);

  const playSuccessSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12); // E6
      
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.error("Audio Context blocked or not supported", e);
    }
  };

  const fetchNeuralInsight = async (title: string, context: string, existingTaskId?: string) => {
    let taskId = existingTaskId;
    
    // Find if task already exists
    let existingTask = neuralTasks.find(t => t.id === taskId);
    
    if (!existingTask) {
      taskId = `${title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
      const newTask: NeuralTask = {
        id: taskId,
        title,
        context,
        status: 'running',
        insight: null
      };
      setNeuralTasks(prev => [newTask, ...prev]);
      
      // Open the modal immediately in loading status
      setIntelligenceModal({ isOpen: true, title, context, insight: null, taskId });
      
      // Run generation task in background
      runBackgroundCorroboration(newTask);
    } else {
      // Open the modal with task's current status (could be completed or running)
      setIntelligenceModal({ 
        isOpen: true, 
        title: existingTask.title, 
        context: existingTask.context, 
        insight: existingTask.insight,
        taskId: existingTask.id 
      });
      
      if (existingTask.status === 'failed') {
        // Auto-retry if previously failed
        setNeuralTasks(prev => prev.map(t => t.id === existingTask.id ? { ...t, status: 'running', insight: null } : t));
        runBackgroundCorroboration({ ...existingTask, status: 'running', insight: null });
      }
    }
  };

  const runBackgroundCorroboration = async (task: NeuralTask) => {
    try {
      const prompt = `Perform an expert, multi-jurisdictional legal corroboration and alignment analysis for: "${task.title}".
      CONTEXT: ${task.context}.
      
      You must evaluate and detail the risk profile, key governing statutes across multiple jurisdictions (US, EU, UK, RSA, etc.), relevant legal case precedents, and clear step-by-step remediation suggestions.`;

      const schema = {
        type: "object",
        properties: {
          summary: { type: "string" },
          strategicImplication: { type: "string" },
          jurisdictions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                law: { type: "string" },
                status: { type: "string" }, // "Aligned" | "Warning" | "Critical"
                detail: { type: "string" }
              },
              required: ["name", "law", "status", "detail"]
            }
          },
          precedents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                case: { type: "string" },
                impact: { type: "string" }
              },
              required: ["case", "impact"]
            }
          },
          remediations: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["summary", "strategicImplication", "jurisdictions", "precedents", "remediations"]
      };

      const systemInstruction = "You are the Smart Charter Jurisdictional Sentinel. Your goal is to provide corroborated, structural legal intelligence in JSON format with specific references to global laws, precedents, and step-by-step remediations.";
      
      const result = await generateJson(prompt, schema, systemInstruction);
      
      // Update task in tracker queue
      setNeuralTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed', insight: result } : t));
      
      // Live update active modal if currently showing this task
      let modalIsOpenForThisTask = false;
      setIntelligenceModal(prev => {
        if (prev && prev.taskId === task.id) {
          modalIsOpenForThisTask = true;
          return { ...prev, insight: result };
        }
        return prev;
      });

      // Play success chirp
      playSuccessSound();

      // If they minimized it, throw a gorgeous glassmorphic notification toast
      if (!modalIsOpenForThisTask) {
        const notifId = `notif-${Date.now()}`;
        const newNotif: ActiveNotification = {
          id: notifId,
          taskId: task.id,
          title: "Corroboration Completed",
          message: `Sentinel Agent completed background legal analysis for "${task.title}".`,
          type: 'success'
        };
        setNotifications(prev => [newNotif, ...prev]);

        // Auto-dismiss after 6.5 seconds
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notifId));
        }, 6500);
      }

    } catch (err) {
      console.error(err);
      const fallbackInsight = {
        summary: "Analysis connection interrupted.",
        strategicImplication: "Please check your network and attempt synchronization again.",
        jurisdictions: [
          { name: "Global Standard", law: "General Law", status: "Warning", detail: "Fallback context activated due to synchronization failure." }
        ],
        precedents: [],
        remediations: ["Retry the neural corroboration request."]
      };
      
      setNeuralTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed', insight: fallbackInsight } : t));
      
      setIntelligenceModal(prev => {
        if (prev && prev.taskId === task.id) {
          return { ...prev, insight: fallbackInsight };
        }
        return prev;
      });
    }
  };

  const discoverNewEvent = async () => {
    setIsDiscovering(true);
    try {
      // Use the real backend news endpoint
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();

      const resp = await fetch('/api/news/legal', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('News API failed');
      const data = await resp.json();

      const source = data.source || 'ai-generated';
      setFeedSource(source);

      const newEvents: SentinelEvent[] = (data.items || []).map((item: any, i: number) => ({
        id: Date.now() + i,
        jurisdiction: item.jurisdiction,
        event: item.event,
        impact: item.impact as 'Low' | 'Medium' | 'High',
        agent: item.agent,
        time: 'Just now',
        source,
        impactedContracts: item.impactedContracts
      }));

      if (newEvents.length > 0) {
        setLiveAgentFeed(prev => [...newEvents, ...prev].slice(0, 8));
      }
    } catch (err) {
      console.error("Discovery failed", err);
    } finally {
      setIsDiscovering(false);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        discoverNewEvent();
      }
    });
    return () => unsubscribe();
  }, []);


  return (
    <div className="flex h-full bg-surface overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header id="walkthrough-strategic-view" className="px-3 md:px-4 lg:px-6 py-4 md:py-5 lg:py-6 border-b border-outline/10 flex flex-col md:flex-row md:justify-between md:items-end gap-3 md:gap-4 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/5 rounded-xl">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-2xl font-black tracking-tighter text-on-surface">Strategic Intelligence Hub</h1>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface/40">Multi-Agent Corroborated Analysis</p>
          </div>

          <div className="flex bg-surface-container/50 rounded-xl p-1">
            {['all', 'negotiation', 'obligations', 'compliance'].map((v) => (
              <button
                key={v}
                onClick={() => setActiveView(v as any)}
                className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                  activeView === v ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface/40 hover:text-on-surface'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 space-y-6 md:space-y-10 lg:space-y-16">
          
          {/* Section 1: AI Redlining Simulator */}
          {(activeView === 'all' || activeView === 'negotiation') && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex items-center justify-between mb-6 md:mb-8 flex-col sm:flex-row gap-3 sm:gap-0">
                <div className="flex items-center gap-3">
                  <GitPullRequest className="h-3 w-3 text-primary/40" />
                  <h2 className="text-xs sm:text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface/50">Negotiation Simulator</h2>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[8px] sm:text-[9px] font-bold text-success uppercase tracking-widest">Live From Portfolio</span>
                </div>
              </div>
              
              {isLoadingData ? (
                <div className="flex items-center justify-center py-20 gap-3">
                  <div className="h-5 w-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Scanning Portfolio...</span>
                </div>
              ) : redlineSuggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 border border-dashed border-outline/20 rounded-2xl">
                  <GitPullRequest className="h-8 w-8 text-on-surface/10" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-on-surface/40">No critical clauses detected yet</p>
                    <p className="text-[10px] text-on-surface/20 mt-1">Upload a contract and run AI analysis to populate redline suggestions</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 md:gap-8 lg:gap-12">
                {redlineSuggestions.map((item) => (
                  <div key={item.id} className="relative pt-6 group">
                    <div className="absolute top-0 left-0 w-8 h-[1px] bg-primary/40 group-hover:w-full transition-all duration-700" />
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-sm font-semibold text-on-surface">{item.clause}</h3>
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                        item.risk === 'High' ? 'bg-error/10 text-error' : item.risk === 'Medium' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                      }`}>
                        {item.risk} Risk
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                      <div className="space-y-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30">Original</p>
                        <p className="text-[11px] text-on-surface/60 italic leading-relaxed line-clamp-3">"{item.original}"</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-primary/60">AI Suggestion</p>
                        <p className="text-[11px] text-primary font-medium leading-relaxed">"{item.suggested}"</p>
                      </div>
                    </div>
                    <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="h-3 w-3 text-primary" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-primary">Simulation Result</span>
                      </div>
                      <p className="text-[11px] text-on-surface/80 leading-relaxed">{item.simulation}</p>
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap gap-2">
                        {item.corroboratedBy.map((source, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-surface-container rounded-md border border-outline/10 text-[8px] font-bold text-on-surface/40 uppercase tracking-wider">
                            <ShieldCheck className="h-2.5 w-2.5 text-success/50" />
                            {source}
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => fetchNeuralInsight(item.clause, `Suggestion: ${item.suggested}. Simulation: ${item.simulation}`)}
                        className="w-full py-2.5 md:py-2 bg-surface-container border border-outline/20 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[44px]"
                      >
                        <Sparkles className="h-3 w-3" />
                        Request Neural Corroboration
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>
          )}

          {/* Section 2: Obligation Tracker */}
          {(activeView === 'all' || activeView === 'obligations') && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
              <div className="flex items-center justify-between mb-6 md:mb-8">
                <div className="flex items-center gap-3">
                  <Calendar className="h-3 w-3 text-on-surface/30" />
                  <h2 className="text-xs sm:text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface/50">Obligation Extraction Tracker</h2>
                </div>
              </div>
              
              {isLoadingData ? (
                <div className="flex items-center justify-center py-20 gap-3">
                  <div className="h-5 w-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Loading Obligations...</span>
                </div>
              ) : obligations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 border border-dashed border-outline/20 rounded-2xl">
                  <Calendar className="h-8 w-8 text-on-surface/10" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-on-surface/40">No obligations extracted yet</p>
                    <p className="text-[10px] text-on-surface/20 mt-1">Upload contracts to extract real deadlines and obligations</p>
                  </div>
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                {obligations.map((item) => (
                  <div key={item.id} className="relative pt-6 group">
                    <div className="absolute top-0 left-0 w-8 h-[1px] bg-outline/40 group-hover:w-full transition-all duration-700" />
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/40">{item.type}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[8px] font-bold text-success/60 bg-success/5 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {item.verifiedSources} SOURCES
                      </div>
                    </div>
                    <p className="text-xl font-light text-on-surface tracking-tight mb-2">{item.title}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] font-medium text-on-surface/60">
                        <Clock className="h-3 w-3" />
                        {item.date}
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-widest text-on-surface/30 border border-outline/20 px-2 py-0.5 rounded">
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>
          )}

          {/* Section 3: Compliance Radar */}
          {(activeView === 'all' || activeView === 'compliance') && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <div className="flex items-center gap-3 mb-6 md:mb-8">
                <Shield className="h-3 w-3 text-on-surface/30" />
                <h2 className="text-xs sm:text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface/50">Compliance & Regulatory Radar</h2>
              </div>
              
              {isLoadingData ? (
                <div className="flex items-center justify-center py-20 gap-3">
                  <div className="h-5 w-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Running Compliance Scan...</span>
                </div>
              ) : complianceRadar.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 border border-dashed border-outline/20 rounded-2xl">
                  <Shield className="h-8 w-8 text-on-surface/10" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-on-surface/40">No compliance gaps detected yet</p>
                    <p className="text-[10px] text-on-surface/20 mt-1">Upload a contract to surface missing protections and standards gaps</p>
                  </div>
                </div>
              ) : (
              <div className="space-y-4">
                {complianceRadar.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => fetchNeuralInsight(item.standard, item.detail)}
                    className="relative py-6 flex items-center justify-between group border-b border-outline/5 hover:bg-on-surface/[0.03] active:scale-[0.99] cursor-pointer transition-all px-4 -mx-4 rounded-xl"
                  >
                    <div className="flex items-center gap-6 min-w-0 flex-1 mr-4">
                      <div className="relative w-12 h-12 shrink-0">
                        <svg className="w-12 h-12 -rotate-90">
                          <circle cx="24" cy="24" r="20" fill="none" strokeWidth="2" className="stroke-outline/10" />
                          <circle cx="24" cy="24" r="20" fill="none" strokeWidth="2" 
                            strokeDasharray={`${(item.score / 100) * 125.6} 125.6`}
                            className={item.status === 'Aligned' ? 'stroke-success' : item.status === 'Warning' ? 'stroke-warning' : 'stroke-primary'}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black">{item.score}%</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-on-surface mb-1 truncate">{item.standard}</h4>
                        <p className="text-[11px] text-on-surface/50 mb-2 break-words line-clamp-2">{item.detail}</p>
                        <div className="flex gap-3">
                          {item.sources.map((s, i) => (
                            <span key={i} className="text-[8px] font-bold text-primary/60 uppercase tracking-widest border-b border-primary/20 pb-0.5">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-surface-container rounded-lg border border-outline/20 text-primary/40 group-hover:text-primary group-hover:bg-primary/5 transition-all">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <span className={`text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                        item.status === 'Aligned' ? 'bg-success/10 text-success' : item.status === 'Warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
                      }`}>
                        {item.status}
                      </span>
                      <ArrowRight className="h-4 w-4 text-on-surface/20 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>
          )}

        </main>

        {/* Action Bar */}
        <footer className="p-8 border-t border-outline/10 bg-surface/80 backdrop-blur-md">
          <div className="max-w-[800px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface">Intelligence Agent Cluster</p>
                <p className="text-[10px] text-on-surface/40 font-medium">Synchronizing cross-jurisdictional data nodes...</p>
              </div>
            </div>
            <button className="px-8 py-3 bg-primary text-on-primary rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-primary/20">
              Verify Global Compliance
            </button>
          </div>
        </footer>
      </div>

      {/* Jurisdictional Sentinel Panel */}
      <aside className="w-[320px] bg-surface-container-low border-l border-outline/10 flex flex-col animate-in slide-in-from-right duration-1000">
        <div className="p-8 border-b border-outline/10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface">Jurisdictional Sentinel</h3>
            <button 
              onClick={discoverNewEvent}
              disabled={isDiscovering}
              className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 rounded-full hover:bg-primary/20 transition-all"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${feedSource === 'live' ? 'bg-success' : 'bg-primary'} ${isDiscovering ? 'animate-ping' : 'animate-pulse'}`} />
              <span className="text-[8px] font-black text-primary uppercase">
                {isDiscovering ? 'Scanning...' : feedSource === 'live' ? 'Live ⚡' : 'Live'}
              </span>
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Globe className="h-3.5 w-3.5 text-on-surface/30" />
              <span className="text-[10px] font-bold text-on-surface/60">Scanning 42 Jurisdictions</span>
            </div>
            <div className="flex items-center gap-3">
              <Scale className="h-3.5 w-3.5 text-on-surface/30" />
              <span className="text-[10px] font-bold text-on-surface/60">Verifying Against 1.2M Records</span>
            </div>
          </div>
        </div>

        {/* Background Neural Tasks Tracker */}
        {neuralTasks.length > 0 && (
          <div className="px-8 py-6 border-b border-outline/10 bg-primary/[0.01]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-on-surface/50">Agent Task Tracker</span>
              <span className="text-[8px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">
                {neuralTasks.filter(t => t.status === 'running').length} ACTIVE
              </span>
            </div>
            <div className="space-y-3 max-h-[180px] overflow-y-auto custom-scrollbar">
              {neuralTasks.map((task) => (
                <div 
                  key={task.id} 
                  onClick={() => fetchNeuralInsight(task.title, task.context, task.id)}
                  className="p-3.5 bg-surface border border-outline/10 hover:border-primary/25 hover:bg-primary/[0.01] cursor-pointer rounded-2xl transition-all flex items-center justify-between gap-3 active:scale-[0.98] group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors truncate">{task.title}</p>
                    <p className="text-[8px] font-bold text-on-surface/40 uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
                      {task.status === 'running' ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          <span>Running in background</span>
                        </>
                      ) : task.status === 'completed' ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-success" />
                          <span className="text-success">Insight ready • view report</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-error" />
                          <span className="text-error">sync failed • retry</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center shrink-0">
                    {task.status === 'running' ? (
                      <div className="relative flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                      </div>
                    ) : task.status === 'completed' ? (
                      <div className="w-5 h-5 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-[9px] text-success font-black group-hover:scale-105 active:scale-95 transition-all">
                        ✓
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-[9px] text-error font-black">
                        !
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface/30 mb-6">Active Intelligence Feed</p>
          <div className="space-y-8">
            {liveAgentFeed.map((event) => (
              <div key={event.id} className="relative pl-6 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-outline/20">
                <div className={`absolute left-[-2px] top-0 w-1 h-1 rounded-full ${event.impact === 'High' ? 'bg-error' : event.impact === 'Medium' ? 'bg-warning' : 'bg-success'}`} />
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-black text-on-surface/40 uppercase tracking-tighter">{event.jurisdiction}</span>
                  <div className="flex items-center gap-1">
                    {event.source === 'live' && <span className="text-[7px] font-black text-success bg-success/10 px-1 rounded">LIVE</span>}
                    <span className="text-[8px] font-medium text-on-surface/30">{event.time}</span>
                  </div>
                </div>
                <p className="text-[11px] font-bold text-on-surface/80 leading-tight mb-2">{event.event}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase tracking-widest text-primary/60">{event.agent}</span>
                  <span className="text-[8px] text-on-surface/20">|</span>
                  <span className={`text-[8px] font-bold uppercase ${event.impact === 'High' ? 'text-error' : 'text-on-surface/40'}`}>Impact: {event.impact}</span>
                  <button onClick={() => fetchNeuralInsight(event.event, `Jurisdiction: ${event.jurisdiction}. Impact: ${event.impact}`)} className="ml-auto p-1 rounded hover:bg-white/5 text-primary/30 hover:text-primary transition-all">
                    <Sparkles className="h-2.5 w-2.5" />
                  </button>
                </div>
                {event.impactedContracts && event.impactedContracts > 0 ? (
                  <div className="mt-2 flex items-center gap-2 p-1.5 bg-error/10 border border-error/20 rounded-md">
                    <AlertCircle className="h-3 w-3 text-error" />
                    <span className="text-[9px] font-bold text-error uppercase tracking-widest">
                      {event.impactedContracts} Contract{event.impactedContracts > 1 ? 's' : ''} Impacted
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 bg-on-surface/[0.02] border-t border-outline/10">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 className="h-3 w-3 text-primary" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface/60">Agent Reliability Score</span>
          </div>
          <div className="w-full bg-outline/10 h-1 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-primary w-[94%]" />
          </div>
          <div className="flex justify-between text-[8px] font-bold text-on-surface/30 uppercase">
            <span>Aggregated Confidence</span>
            <span>94.2%</span>
          </div>
        </div>
      </aside>

      {/* Neural Insight Modal */}
      <AnimatePresence>
        {intelligenceModal?.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`w-full ${!intelligenceModal.insight ? 'max-w-md' : 'max-w-4xl'} bg-surface border border-outline/20 rounded-[32px] overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh] min-h-0 transition-all duration-300 ease-out`}
            >
              {/* Header */}
              <div className={`border-b border-outline/10 flex items-center justify-between bg-surface-container-low shrink-0 ${!intelligenceModal.insight ? 'p-6' : 'p-8'}`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/5 rounded-xl border border-primary/10">
                    <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                  </div>
                  <div>
                    <h2 className={`font-black tracking-tight text-on-surface leading-tight ${!intelligenceModal.insight ? 'text-sm sm:text-base' : 'text-lg sm:text-xl'}`}>{intelligenceModal.title}</h2>
                    <p className="text-[8px] font-black text-primary uppercase tracking-[0.2em] mt-0.5">Sentinel Corroboration</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIntelligenceModal(null)} 
                    title="Minimize to Sidebar Tracker"
                    className="p-1.5 hover:bg-surface-container text-on-surface/45 hover:text-primary rounded-xl transition-all flex items-center justify-center gap-1 active:scale-95 border border-transparent hover:border-primary/10 hover:bg-primary/5"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span className="text-[8px] font-black uppercase tracking-wider hidden sm:inline">Minimize</span>
                  </button>
                  <button 
                    onClick={() => setIntelligenceModal(null)} 
                    className="p-1.5 hover:bg-surface-container text-on-surface/40 hover:text-on-surface rounded-full transition-colors active:scale-95"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className={`overflow-y-auto custom-scrollbar flex-1 min-h-0 bg-surface-container-lowest/20 ${!intelligenceModal.insight ? 'p-6' : 'p-8 space-y-8'}`}>
                {!intelligenceModal.insight ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="h-6 w-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-[10px] font-black text-primary/50 uppercase tracking-[0.2em] animate-pulse">Synchronizing with Global Nodes...</p>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8 min-h-0"
                  >
                    {/* Executive Insights Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 rounded-2xl bg-primary/[0.03] border border-primary/10 hover:border-primary/20 transition-all">
                        <div className="flex items-center gap-2 mb-3">
                          <Target className="h-4 w-4 text-primary" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Executive Summary</span>
                        </div>
                        <p className="text-xs text-on-surface/80 leading-relaxed font-semibold break-words whitespace-pre-wrap">
                          {intelligenceModal.insight.summary}
                        </p>
                      </div>
                      <div className="p-6 rounded-2xl bg-error/[0.02] border border-error/10 hover:border-error/20 transition-all">
                        <div className="flex items-center gap-2 mb-3">
                          <AlertCircle className="h-4 w-4 text-error" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-error">Strategic Risk Exposure</span>
                        </div>
                        <p className="text-xs text-on-surface/80 leading-relaxed font-semibold break-words whitespace-pre-wrap">
                          {intelligenceModal.insight.strategicImplication}
                        </p>
                      </div>
                    </div>

                    {/* Jurisdictional Alignment Map */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-on-surface/40" />
                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-on-surface/40">Jurisdictional Compliance Alignment</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {intelligenceModal.insight.jurisdictions.map((j: any, idx: number) => (
                          <div key={idx} className="p-5 rounded-2xl bg-surface-container border border-outline/10 hover:border-outline/20 hover:bg-surface-container/80 transition-all">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-xs font-bold text-on-surface">{j.name}</span>
                              <span className={`text-[8px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                                j.status === 'Aligned' ? 'bg-success/10 text-success' :
                                j.status === 'Warning' ? 'bg-warning/10 text-warning' :
                                'bg-error/10 text-error'
                              }`}>
                                {j.status}
                              </span>
                            </div>
                            <div className="mb-3">
                              <span className="text-[8px] font-mono font-bold bg-primary/5 text-primary/80 border border-primary/10 px-2 py-0.5 rounded uppercase">
                                {j.law}
                              </span>
                            </div>
                            <p className="text-[11px] text-on-surface/60 leading-relaxed break-words whitespace-pre-wrap">{j.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Precedents Section */}
                    {intelligenceModal.insight.precedents && intelligenceModal.insight.precedents.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Scale className="h-3.5 w-3.5 text-on-surface/40" />
                          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-on-surface/40">Landmark Legal Precedents</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          {intelligenceModal.insight.precedents.map((p: any, idx: number) => (
                            <div key={idx} className="p-5 rounded-2xl bg-surface-container-low border border-outline/5 hover:border-outline/15 transition-all">
                              <h4 className="text-xs font-bold text-on-surface/90 mb-2 break-words">{p.case}</h4>
                              <p className="text-[11px] text-on-surface/60 leading-relaxed break-words whitespace-pre-wrap">{p.impact}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Remediations Checklist */}
                    {intelligenceModal.insight.remediations && intelligenceModal.insight.remediations.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-3.5 w-3.5 text-success" />
                          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-on-surface/40">Strategic Alignment checklist</span>
                        </div>
                        <div className="p-6 rounded-2xl bg-success/[0.01] border border-success/10 space-y-4">
                          {intelligenceModal.insight.remediations.map((r: string, idx: number) => (
                            <div key={idx} className="flex items-start gap-3.5 group">
                              <div className="mt-0.5 w-4 h-4 rounded-lg bg-success/15 border border-success/30 flex items-center justify-center text-[8px] font-black text-success group-hover:scale-105 active:scale-95 transition-all shrink-0">
                                ✓
                              </div>
                              <p className="text-xs text-on-surface/70 leading-relaxed font-semibold break-words whitespace-pre-wrap">{r}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              {intelligenceModal.insight && (
                <div className="p-8 bg-surface-container-low border-t border-outline/10 flex justify-between items-center shrink-0">
                  <span className="text-[8px] font-bold text-on-surface/30 uppercase tracking-[0.2em]">Verified by Smart Charter Sentinel Agent Cluster</span>
                  <button 
                    onClick={() => setIntelligenceModal(null)}
                    className="px-6 py-2 bg-primary text-on-primary hover:bg-primary-hover active:scale-95 transition-all rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/10"
                  >
                    Dismiss Insight
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notifications Stack */}
      <div className="fixed bottom-6 right-6 z-[120] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 50, scale: 0.9, x: 50 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 100, transition: { duration: 0.2 } }}
              className="pointer-events-auto w-full bg-surface-container-high/90 border border-success/20 shadow-2xl p-4 rounded-2xl backdrop-blur-md flex items-start gap-3.5 relative overflow-hidden"
            >
              {/* Green Glow Bar on side */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-success" />
              
              <div className="p-2 bg-success/10 rounded-xl text-success shrink-0 mt-0.5">
                <Sparkles className="h-4 w-4 text-success animate-pulse" />
              </div>
              
              <div className="flex-1 min-w-0 pr-6">
                <h4 className="text-xs font-black text-on-surface uppercase tracking-wider">{n.title}</h4>
                <p className="text-[11px] text-on-surface/65 mt-1 leading-relaxed">{n.message}</p>
                <button
                  onClick={() => {
                    const task = neuralTasks.find(t => t.id === n.taskId);
                    if (task) {
                      fetchNeuralInsight(task.title, task.context, task.id);
                    }
                    setNotifications(prev => prev.filter(notif => notif.id !== n.id));
                  }}
                  className="mt-3 text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary-hover active:scale-95 transition-all flex items-center gap-1 group/btn"
                >
                  View Report
                  <ArrowRight className="h-3 w-3 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
              </div>
              
              <button
                onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))}
                className="absolute top-3 right-3 text-on-surface/30 hover:text-on-surface/65 transition-colors p-1"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
