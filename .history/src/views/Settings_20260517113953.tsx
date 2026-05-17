import React from 'react';
import { motion } from 'motion/react';
import { User, Bell, Shield, Lock, Database, Moon, Sun, LogOut, Mic, Activity, Cpu, Compass, FolderOpen, GitCompare, BookOpen, Upload, Play, Eye, Zap } from 'lucide-react';
import { useFirebase } from '../lib/FirebaseProvider';
import { useTheme } from '../contexts/ThemeContext';

export default function Settings() {
  const { user, logout } = useFirebase();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = React.useState('Identity');

  const sections = [
    { title: 'Identity', icon: User },
    { title: 'Voice Playbook', icon: Mic },
    { title: 'Protocols', icon: Shield },
    { title: 'Notifications', icon: Bell },
    { title: 'Integration', icon: Database },
    { title: 'Security', icon: Lock },
  ];

  function VoiceSelector() {
    const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
    const [selected, setSelected] = React.useState<string | null>(() => {
      try { return localStorage.getItem('smartCharter.voiceName'); } catch { return null; }
    });

    React.useEffect(() => {
      const load = () => {
        const v = window.speechSynthesis.getVoices() || [];
        setVoices(v);
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
      return () => { window.speechSynthesis.onvoiceschanged = null; };
    }, []);

    const handle = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value || null;
      setSelected(name);
      try { localStorage.setItem('smartCharter.voiceName', name || ''); } catch {}
      try { window.dispatchEvent(new CustomEvent('smart-charter-voice-changed', { detail: name })); } catch {}
    };

    return (
      <div className="mt-3">
        <select value={selected ?? ''} onChange={handle} className="w-full rounded-md p-2 bg-surface border border-outline/10 text-on-surface">
          <option value="">(Browser default)</option>
          {voices.map(v => (
            <option key={v.name + '|' + v.lang} value={v.name}>{v.name} — {v.lang}</option>
          ))}
        </select>
        <p className="text-[10px] text-on-surface/50 mt-2">Choose a browser-provided voice for the Vocal Sentinel. Changes apply immediately.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-0.5">
          <p className="text-[9px] font-bold text-primary/60 tracking-[0.35em] uppercase leading-none mb-1">System Configuration</p>
          <div className="flex items-end justify-between">
            <h1 className="text-2xl sm:text-3xl font-black text-on-surface tracking-tight leading-none">Settings</h1>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 pt-3">
          <aside className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.title}
                onClick={() => setActiveTab(section.title)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[11px] font-semibold uppercase tracking-[0.12em] transition-all duration-200 relative group ${
                  activeTab === section.title 
                    ? 'bg-primary/8 text-on-primary shadow-sm' 
                    : 'text-on-surface/40 hover:bg-surface-container/60 hover:text-on-surface/90'
                }`}
              >
                <section.icon className={`h-4 w-4 ${activeTab === section.title ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`} />
                <span className="truncate">{section.title}</span>
                {activeTab === section.title && (
                   <motion.div layoutId="active-tab" className="absolute left-0 w-1 h-5 bg-on-primary rounded-full" />
                )}
              </button>
            ))}
          </aside>

          <main className="space-y-6">
            {activeTab === 'Identity' && (
              <>
                <section className="bg-surface-container-low border border-outline/10 rounded-xl p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface/30">User Profile</h3>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-[8px] font-bold uppercase tracking-widest rounded-full">Primary</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <img 
                        src={user?.photoURL || ''} 
                        alt={user?.displayName || 'User'} 
                        className="w-14 h-14 sm:w-20 sm:h-20 rounded-lg object-cover border border-outline/20 relative z-10 grayscale hover:grayscale-0 transition-all duration-300"
                      />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-lg font-black text-on-surface tracking-tight truncate max-w-[28ch]">{user?.displayName}</h4>
                      <p className="text-[12px] text-on-surface/50 font-medium truncate max-w-[36ch]">{user?.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                        <p className="text-[9px] font-black text-on-surface/30 uppercase tracking-[0.15em]">Verified Contributor • Neural Sync</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-surface-container-low border border-outline/10 rounded-xl p-3 sm:p-4 space-y-4 shadow-sm">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface/30">Interface</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-surface/30 border border-outline/10 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center border border-outline/10">
                          {theme === 'light' ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-warning" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Theme</p>
                          <p className="text-[10px] text-on-surface/40 uppercase tracking-widest">Adjust contrast</p>
                        </div>
                      </div>
                      <button 
                        onClick={toggleTheme}
                        className="px-3 py-1 bg-primary text-on-primary text-[10px] font-black uppercase rounded-lg"
                      >
                        {theme === 'light' ? 'Dark' : 'Light'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-surface/30 border border-outline/10 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center border border-outline/10">
                          <LogOut className="h-4 w-4 text-error" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Sign Out</p>
                          <p className="text-[10px] text-on-surface/40 uppercase tracking-widest">End session</p>
                        </div>
                      </div>
                      <button 
                        onClick={logout}
                        className="px-3 py-1 border border-error/30 text-error text-[10px] font-black uppercase rounded-lg"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'Voice Playbook' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <section className="bg-surface-container-low dark:bg-[#0D0D0E]/90 border border-outline/10 dark:border-white/10 rounded-lg p-4 sm:p-6 shadow relative overflow-hidden">

                  {/* Decorative blobs hidden on small screens */}
                  <div className="hidden md:block absolute top-0 right-0 w-56 h-56 bg-primary/5 dark:bg-[#E2FF6F]/4 rounded-full blur-3xl pointer-events-none" />
                  <div className="hidden md:block absolute bottom-0 left-0 w-44 h-44 bg-secondary/5 dark:bg-secondary/4 rounded-full blur-2xl pointer-events-none" />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-outline/10 dark:border-white/10 relative z-10">
                    <div className="space-y-0.5">
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary dark:text-[#E2FF6F]">Vocal Sentinel HUD</p>
                      <h3 className="text-xl sm:text-2xl font-black tracking-tight text-on-surface dark:text-white">Voice Command Center</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 items-end h-5 px-2 py-1 bg-success/5 dark:bg-emerald-500/5 border border-success/20 rounded-full">
                        {[1.2, 0.6, 1.8, 0.9, 1.4].map((delay, idx) => (
                          <motion.div
                            key={idx}
                            animate={{ height: [4, 12, 4] }}
                            transition={{ duration: 1, repeat: Infinity, delay: delay * 0.18 }}
                            className="w-[2.5px] bg-success dark:bg-emerald-400 rounded-full"
                          />
                        ))}
                        <span className="text-[9px] font-black uppercase tracking-wider text-success dark:text-emerald-400 ml-1">Engine Active</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4 relative z-10">
                    <div className="p-3 bg-surface/40 dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-lg flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 dark:bg-[#E2FF6F]/10 flex items-center justify-center border border-primary/20 dark:border-[#E2FF6F]/20 shrink-0">
                        <Activity className="h-4 w-4 text-primary dark:text-[#E2FF6F]" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-on-surface/40 dark:text-white/40 uppercase tracking-widest">Input Accuracy</p>
                        <p className="text-sm font-black text-on-surface dark:text-white">99.2% confidence</p>
                      </div>
                    </div>
                    <div className="p-3 bg-surface/40 dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-lg flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-secondary/10 dark:bg-secondary/10 flex items-center justify-center border border-secondary/20 shrink-0">
                        <Zap className="h-4 w-4 text-secondary" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-on-surface/40 dark:text-white/40 uppercase tracking-widest">Parser Latency</p>
                        <p className="text-sm font-black text-on-surface dark:text-white">~12ms interim</p>
                      </div>
                    </div>
                    <div className="p-3 bg-surface/40 dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-lg flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-warning/10 dark:bg-warning/10 flex items-center justify-center border border-warning/20 shrink-0">
                        <Cpu className="h-4 w-4 text-warning" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-on-surface/40 dark:text-white/40 uppercase tracking-widest">Active Models</p>
                        <p className="text-sm font-black text-on-surface dark:text-white">Gemini 2.0 Router</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-[12px] text-on-surface/60 dark:text-white/60 leading-relaxed mb-4 relative z-10">
                    Smart Charter integrates real-time speech processing. Use the <span className="font-bold text-primary dark:text-[#E2FF6F]">Try</span> button on any card below to simulate commands.
                  </p>

                  <div className="space-y-4 relative z-10">
                        {/* Voice selection control */}
                        <div className="p-3 bg-surface/30 dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-lg">
                          <label className="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface/50 dark:text-white/50">Preferred Browser Voice</label>
                          <VoiceSelector />
                        </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Compass className="h-4 w-4 text-primary dark:text-[#E2FF6F]" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface/50 dark:text-white/50">Navigation Commands</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          { voice: 'Go to Dashboard', shortcut: 'or "Go Home"', action: 'Redirects to primary portfolio overview', icon: Compass, link: '/' },
                          { voice: 'Go to Projects', shortcut: 'or "Open Portfolio"', action: 'Redirects to scoped client workspaces', icon: FolderOpen, link: '/projects' },
                          { voice: 'Go to Compare', shortcut: 'or "Comparison"', action: 'Opens contract comparison workbench', icon: GitCompare, link: '/compare' },
                          { voice: 'Open Playbook', shortcut: 'or "Risk Settings"', action: 'Navigates to AI compliance criteria templates', icon: BookOpen, link: '/risk' },
                        ].map((cmd, idx) => (
                          <div 
                            key={idx} 
                            className="group p-3 bg-surface-container dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-lg hover:border-primary/30 dark:hover:border-[#E2FF6F]/30 hover:shadow-sm transition-all duration-200 flex items-start justify-between gap-3"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-surface dark:bg-white/5 flex items-center justify-center border border-outline/10 dark:border-white/10 group-hover:scale-105 transition-all shadow-sm">
                                <cmd.icon className="h-4 w-4 text-primary dark:text-[#E2FF6F]" />
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[11px] font-mono font-black text-primary dark:text-[#E2FF6F]">"{cmd.voice}"</span>
                                  <span className="text-[9px] font-bold text-on-surface/30 dark:text-white/30 uppercase tracking-widest">{cmd.shortcut}</span>
                                </div>
                                <p className="text-[11px] text-on-surface/50 dark:text-white/50 leading-relaxed font-medium">{cmd.action}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('smart-charter-voice-simulate', { detail: cmd.voice }));
                                window.location.href = cmd.link;
                              }}
                              className="px-2 py-1 bg-surface dark:bg-white/5 hover:bg-primary dark:hover:bg-[#E2FF6F] text-on-surface/60 dark:text-white/60 hover:text-on-primary dark:hover:text-black border border-outline/10 dark:border-white/10 hover:border-transparent text-[9px] font-black uppercase tracking-wider rounded-md transition-all shadow-sm flex items-center gap-1"
                            >
                              <Play className="h-3 w-3" />
                              Try
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-outline/10 dark:border-white/10">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-secondary" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface/50 dark:text-white/50">Autonomous Actions</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          { voice: 'Upload Document', shortcut: 'or "New Contract"', action: 'Fires file ingestion modal instantly', icon: Upload, event: 'smart-charter-open-upload' },
                          { voice: 'Start Walkthrough', shortcut: 'or "Guided Tour"', action: 'Starts visual platform guided setup immediately', icon: Eye, event: 'smart-charter-start-walkthrough' },
                        ].map((cmd, idx) => (
                          <div 
                            key={idx} 
                            className="group p-3 bg-surface-container dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-lg hover:border-secondary/30 hover:shadow-sm transition-all duration-200 flex items-start justify-between gap-3"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-surface dark:bg-white/5 flex items-center justify-center border border-outline/10 dark:border-white/10 group-hover:scale-105 transition-all shadow-sm">
                                <cmd.icon className="h-4 w-4 text-secondary" />
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-mono font-black text-secondary">"{cmd.voice}"</span>
                                  <span className="text-[9px] font-bold text-on-surface/30 dark:text-white/30 uppercase tracking-widest">{cmd.shortcut}</span>
                                </div>
                                <p className="text-[11px] text-on-surface/50 dark:text-white/50 leading-relaxed font-medium">{cmd.action}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent(cmd.event));
                              }}
                              className="px-2 py-1 bg-surface dark:bg-white/5 hover:bg-secondary text-on-surface/60 dark:text-white/60 hover:text-white border border-outline/10 dark:border-white/10 hover:border-transparent text-[9px] font-black uppercase tracking-wider rounded-md transition-all shadow-sm flex items-center gap-1"
                            >
                              <Play className="h-3 w-3" />
                              Try
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab !== 'Identity' && activeTab !== 'Voice Playbook' && (
              <motion.div 
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-8 px-6 border-2 border-dashed border-outline/10 rounded-lg gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-outline/10">
                   <Shield className="h-6 w-6 text-on-surface/20" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface/30">{activeTab} controls currently restricted</p>
              </motion.div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
