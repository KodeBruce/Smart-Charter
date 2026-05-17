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

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      <div className="px-8 py-6 space-y-8 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-0.5">
          <p className="text-[9px] font-bold text-primary/60 tracking-[0.4em] uppercase leading-none mb-2">System Configuration</p>
          <div className="flex items-end justify-between">
            <h1 className="text-3xl font-black text-on-surface tracking-tighter leading-none">Settings</h1>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-12 pt-4">
          <aside className="space-y-2">
            {sections.map((section) => (
              <button
                key={section.title}
                onClick={() => setActiveTab(section.title)}
                className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-300 relative group ${
                  activeTab === section.title 
                    ? 'bg-primary text-on-primary shadow-xl shadow-primary/20 scale-[1.02]' 
                    : 'text-on-surface/40 hover:bg-surface-container hover:text-on-surface/80'
                }`}
              >
                <section.icon className={`h-4 w-4 ${activeTab === section.title ? 'opacity-100' : 'opacity-50 group-hover:opacity-100'}`} />
                {section.title}
                {activeTab === section.title && (
                   <motion.div layoutId="active-tab" className="absolute left-0 w-1 h-6 bg-on-primary rounded-full" />
                )}
              </button>
            ))}
          </aside>

          <main className="space-y-10">
            {activeTab === 'Identity' && (
              <>
                <section className="bg-surface-container-low border border-outline/20 rounded-[32px] p-6 sm:p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/30">User Profile</h3>
                    <span className="px-3 py-1 bg-primary/10 text-primary text-[8px] font-bold uppercase tracking-widest rounded-full">Primary Identity</span>
                  </div>
                  <div className="flex items-center gap-6 sm:gap-8">
                    <div className="relative group">
                      <div className="absolute inset-0 bg-primary/20 rounded-[28px] blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                      <img 
                        src={user?.photoURL || ''} 
                        alt={user?.displayName || 'User'} 
                        className="w-16 h-16 sm:w-24 sm:h-24 rounded-[20px] object-cover border-2 border-outline/30 relative z-10 shadow-2xl grayscale hover:grayscale-0 transition-all duration-500"
                      />
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      <h4 className="text-lg sm:text-2xl font-black text-on-surface tracking-tight">{user?.displayName}</h4>
                      <p className="text-[12px] sm:text-[12px] text-on-surface/50 font-medium tracking-wide">{user?.email}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        <p className="text-[9px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Verified Contributor • Neural Sync Active</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-surface-container-low border border-outline/20 rounded-[32px] p-4 sm:p-8 space-y-8 shadow-sm">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/30">Interface Protocols</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 sm:p-6 bg-surface/50 backdrop-blur-sm border border-outline/20 rounded-[24px] hover:border-primary/20 transition-all group">
                      <div className="flex items-center gap-5">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-surface-container flex items-center justify-center border border-outline/10 group-hover:scale-110 transition-transform">
                          {theme === 'light' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-warning" />}
                        </div>
                        <div>
                          <p className="text-sm sm:text-sm font-bold text-on-surface">Dynamic Theme</p>
                          <p className="text-[10px] text-on-surface/40 uppercase font-bold tracking-widest mt-1">Adjust visual contrast & light levels</p>
                        </div>
                      </div>
                      <button 
                        onClick={toggleTheme}
                        className="px-4 py-2 sm:px-6 sm:py-2 bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest rounded-xl hover:translate-y-[-2px] active:translate-y-0 transition-all shadow-lg shadow-primary/20"
                      >
                        Set to {theme === 'light' ? 'Dark' : 'Light'} Mode
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 sm:p-6 bg-surface/50 backdrop-blur-sm border border-outline/20 rounded-[24px] hover:border-error/20 transition-all group">
                      <div className="flex items-center gap-5">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-surface-container flex items-center justify-center border border-outline/10 group-hover:scale-110 transition-transform">
                          <LogOut className="h-5 w-5 text-error" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Platform Exit</p>
                          <p className="text-[10px] text-on-surface/40 uppercase font-bold tracking-widest mt-1">Disconnect secure institutional session</p>
                        </div>
                      </div>
                      <button 
                        onClick={logout}
                        className="px-6 py-2 border border-error/30 text-error text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-error hover:text-white transition-all"
                      >
                        Terminate Session
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'Voice Playbook' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {/* Main Operations HUD Panel */}
                <section className="bg-surface-container-low dark:bg-[#0D0D0E]/90 border border-outline/20 dark:border-white/10 rounded-[36px] p-8 shadow-xl relative overflow-hidden">
                  
                  {/* Futuristic Tech BG Elements */}
                  <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 dark:bg-[#E2FF6F]/3 rounded-full blur-[80px] pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-60 h-60 bg-secondary/5 dark:bg-secondary/3 rounded-full blur-[60px] pointer-events-none" />

                  {/* Header: Title and Status */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-outline/10 dark:border-white/10 relative z-10">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.35em] text-primary dark:text-[#E2FF6F]">Vocal Sentinel HUD</p>
                      <h3 className="text-2xl font-black tracking-tight text-on-surface dark:text-white">Voice Command Center</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Audio Pulse Waves */}
                      <div className="flex gap-1 items-end h-5 px-3 py-1.5 bg-success/5 dark:bg-emerald-500/5 border border-success/20 rounded-full">
                        {[1.2, 0.6, 1.8, 0.9, 1.4].map((delay, idx) => (
                          <motion.div 
                            key={idx}
                            animate={{ height: [4, 14, 4] }}
                            transition={{ duration: 1, repeat: Infinity, delay: delay * 0.2 }}
                            className="w-[2.5px] bg-success dark:bg-emerald-400 rounded-full"
                          />
                        ))}
                        <span className="text-[9px] font-black uppercase tracking-wider text-success dark:text-emerald-400 ml-1">Engine Active</span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Telemetry Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-6 relative z-10">
                    <div className="p-4 bg-surface/50 dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-2xl flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-[#E2FF6F]/10 flex items-center justify-center border border-primary/20 dark:border-[#E2FF6F]/20 shrink-0">
                        <Activity className="h-5 w-5 text-primary dark:text-[#E2FF6F]" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-on-surface/40 dark:text-white/40 uppercase tracking-widest">Input Accuracy</p>
                        <p className="text-sm font-black text-on-surface dark:text-white">99.2% confidence</p>
                      </div>
                    </div>
                    <div className="p-4 bg-surface/50 dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-2xl flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-secondary/10 dark:bg-secondary/10 flex items-center justify-center border border-secondary/20 shrink-0">
                        <Zap className="h-5 w-5 text-secondary" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-on-surface/40 dark:text-white/40 uppercase tracking-widest">Parser Latency</p>
                        <p className="text-sm font-black text-on-surface dark:text-white">~12ms interim matching</p>
                      </div>
                    </div>
                    <div className="p-4 bg-surface/50 dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-2xl flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-warning/10 dark:bg-warning/10 flex items-center justify-center border border-warning/20 shrink-0">
                        <Cpu className="h-5 w-5 text-warning" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-on-surface/40 dark:text-white/40 uppercase tracking-widest">Active Models</p>
                        <p className="text-sm font-black text-on-surface dark:text-white">Gemini 2.0 Router</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-on-surface/60 dark:text-white/60 leading-relaxed mb-8 relative z-10">
                    Smart Charter integrates advanced real-time speech processing to run workflows autonomously. Click the <span className="font-bold text-primary dark:text-[#E2FF6F]">Try Command</span> button inside any trigger card below to test platform responsiveness and verbal dialogue cycles.
                  </p>

                  {/* Main Grid: Nav vs Workflows */}
                  <div className="space-y-8 relative z-10">
                    
                    {/* Navigation Block */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Compass className="h-4 w-4 text-primary dark:text-[#E2FF6F]" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface/50 dark:text-white/50">Navigation Routing Commands</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { voice: 'Go to Dashboard', shortcut: 'or "Go Home"', action: 'Redirects to primary portfolio overview', icon: Compass, link: '/' },
                          { voice: 'Go to Projects', shortcut: 'or "Open Portfolio"', action: 'Redirects to scoped client workspaces', icon: FolderOpen, link: '/projects' },
                          { voice: 'Go to Compare', shortcut: 'or "Comparison"', action: 'Opens contract comparison workbench', icon: GitCompare, link: '/compare' },
                          { voice: 'Open Playbook', shortcut: 'or "Risk Settings"', action: 'Navigates to AI compliance criteria templates', icon: BookOpen, link: '/risk' },
                        ].map((cmd, idx) => (
                          <div 
                            key={idx} 
                            className="group p-5 bg-surface-container dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-2xl hover:border-primary/30 dark:hover:border-[#E2FF6F]/30 hover:shadow-lg transition-all duration-300 flex items-start justify-between gap-4"
                          >
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-xl bg-surface dark:bg-white/5 flex items-center justify-center border border-outline/10 dark:border-white/10 group-hover:scale-105 transition-all shadow-sm">
                                <cmd.icon className="h-5 w-5 text-primary dark:text-[#E2FF6F]" />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-mono font-black text-primary dark:text-[#E2FF6F]">"{cmd.voice}"</span>
                                  <span className="text-[8px] font-bold text-on-surface/30 dark:text-white/30 uppercase tracking-widest">{cmd.shortcut}</span>
                                </div>
                                <p className="text-[10px] text-on-surface/50 dark:text-white/50 leading-relaxed font-medium">{cmd.action}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('smart-charter-voice-simulate', { detail: cmd.voice }));
                                window.location.href = cmd.link;
                              }}
                              className="px-3 py-1 bg-surface dark:bg-white/5 hover:bg-primary dark:hover:bg-[#E2FF6F] text-on-surface/60 dark:text-white/60 hover:text-on-primary dark:hover:text-black border border-outline/10 dark:border-white/10 hover:border-transparent text-[8px] font-black uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center gap-1"
                            >
                              <Play className="h-2 w-2" />
                              Try
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Workflow Block */}
                    <div className="space-y-4 pt-4 border-t border-outline/10 dark:border-white/10">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-secondary" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface/50 dark:text-white/50">Autonomous Actions & Workflows</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { voice: 'Upload Document', shortcut: 'or "New Contract"', action: 'Fires file ingestion modal instantly', icon: Upload, event: 'smart-charter-open-upload' },
                          { voice: 'Start Walkthrough', shortcut: 'or "Guided Tour"', action: 'Starts visual platform guided setup immediately', icon: Eye, event: 'smart-charter-start-walkthrough' },
                        ].map((cmd, idx) => (
                          <div 
                            key={idx} 
                            className="group p-5 bg-surface-container dark:bg-white/[0.02] border border-outline/10 dark:border-white/5 rounded-2xl hover:border-secondary/30 hover:shadow-lg transition-all duration-300 flex items-start justify-between gap-4"
                          >
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-xl bg-surface dark:bg-white/5 flex items-center justify-center border border-outline/10 dark:border-white/10 group-hover:scale-105 transition-all shadow-sm">
                                <cmd.icon className="h-5 w-5 text-secondary" />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-mono font-black text-secondary">"{cmd.voice}"</span>
                                  <span className="text-[8px] font-bold text-on-surface/30 dark:text-white/30 uppercase tracking-widest">{cmd.shortcut}</span>
                                </div>
                                <p className="text-[10px] text-on-surface/50 dark:text-white/50 leading-relaxed font-medium">{cmd.action}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent(cmd.event));
                              }}
                              className="px-3 py-1 bg-surface dark:bg-white/5 hover:bg-secondary text-on-surface/60 dark:text-white/60 hover:text-white border border-outline/10 dark:border-white/10 hover:border-transparent text-[8px] font-black uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center gap-1"
                            >
                              <Play className="h-2 w-2" />
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-outline/20 rounded-[32px] gap-4"
              >
                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center border border-outline/10">
                   <Shield className="h-8 w-8 text-on-surface/20" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/30">{activeTab} controls currently restricted</p>
              </motion.div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
