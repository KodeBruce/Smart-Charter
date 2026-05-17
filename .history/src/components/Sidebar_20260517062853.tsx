import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Files, ShieldAlert, Settings, Plus, HelpCircle, Moon, Sun, Search, FolderOpen, Mic, MicOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useFirebase } from '../lib/FirebaseProvider';
import { useTheme } from '../contexts/ThemeContext';
import { useIngest } from '../contexts/IngestContext';
import { useVoice } from '../contexts/VoiceContext';

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useFirebase();
  const { theme, toggleTheme } = useTheme();
  const { openIngest } = useIngest();
  const { isListening, toggleVoice } = useVoice();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileExtrasOpen, setMobileExtrasOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem('sidebar-collapsed');
      setCollapsed(v === 'true');
    } catch {
      setCollapsed(false);
    }
  }, []);

  const toggleCollapsed = (v?: boolean) => {
    const next = typeof v === 'boolean' ? v : !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sidebar-collapsed', next ? 'true' : 'false'); } catch {}
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FolderOpen, label: 'Projects', path: '/projects' },
    { icon: Files, label: 'Document Comparison', path: '/compare' },
    { icon: ShieldAlert, label: 'Risk Playbook', path: '/risk' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <>
      <aside className="hidden md:fixed md:left-5 md:top-5 md:bottom-5 md:w-16 md:flex md:flex-col items-center z-50">
        <div className="h-full w-full bg-surface-container border border-outline rounded-[32px] flex flex-col items-center py-6 px-3 gap-6 shadow-2xl relative overflow-hidden">
        {/* Subtle Background Glow */}
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-primary/5 to-transparent opacity-50 pointer-events-none" />

        {/* Collapse control */}
        <button
          aria-label="Collapse sidebar"
          onClick={() => toggleCollapsed(true)}
          className="absolute -right-6 top-6 bg-surface-container border border-outline rounded-full p-1 shadow-sm hover:scale-105 transition-transform"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Action Button */}
        <button 
          id="walkthrough-ingest" 
          onClick={openIngest}
          className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-secondary-content hover:scale-105 active:scale-95 transition-all shadow-lg shadow-secondary/20 relative z-10 group"
        >
          <Plus className="h-5 w-5 stroke-[2.5]" />
          <div className="absolute left-14 px-3 py-1.5 bg-surface-container-high/90 backdrop-blur text-on-surface text-[9px] font-bold uppercase tracking-widest rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-outline">
            Upload Document
          </div>
        </button>

        <div className="w-6 h-px bg-outline relative z-10" />

        {/* Navigation Items */}
        <nav id="walkthrough-nav" className="flex flex-col gap-3 flex-1 relative z-10">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const targetId = item.label === 'Dashboard' ? 'walkthrough-dashboard' :
                          item.label === 'Projects' ? 'walkthrough-projects' : 
                          item.label === 'Repository' ? 'walkthrough-repository' :
                          item.label === 'Document Comparison' ? 'walkthrough-compare' :
                          item.label === 'Risk Playbook' ? 'walkthrough-risk' :
                          item.label === 'Settings' ? 'walkthrough-settings' : undefined;
            return (
              <NavLink
                key={item.path}
                id={targetId}
                to={item.path}
                title={item.label}
                className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 relative group ${
                  isActive 
                    ? 'bg-primary text-surface shadow-xl ring-2 ring-primary/10' 
                    : 'text-on-surface/40 hover:bg-on-surface/5 hover:text-on-surface/80'
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <div className="absolute left-14 px-3 py-1.5 bg-surface-container-high/90 backdrop-blur text-on-surface text-[9px] font-bold uppercase tracking-widest rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-outline">
                  {item.label}
                </div>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="flex flex-col gap-4 mt-auto relative z-10 p-0.5">
          <button 
            onClick={toggleVoice}
            className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all group relative ${
              isListening ? 'text-secondary bg-primary shadow-[0_0_15px_rgba(226,255,111,0.2)]' : 'text-on-surface/40 hover:text-secondary'
            }`}
            title="Toggle Voice Commands"
          >
            {isListening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            <div className="absolute left-14 px-3 py-1.5 bg-[#0D0D0D]/90 backdrop-blur text-white text-[9px] font-bold uppercase tracking-widest rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-white/10">
              {isListening ? 'Stop Listening' : 'Voice Commands'}
            </div>
          </button>

          <button 
            onClick={toggleTheme}
            className="h-9 w-9 rounded-xl text-on-surface/50 hover:text-secondary flex items-center justify-center transition-all group relative"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          <button 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('smart-charter-start-walkthrough'));
            }}
            className="h-9 w-9 rounded-xl text-on-surface/50 hover:text-on-surface flex items-center justify-center transition-all group relative"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          <div className="h-px w-6 bg-outline mx-auto" />

          <button 
            onClick={logout}
            className="h-9 w-9 rounded-xl border border-outline p-0.5 hover:border-secondary transition-all overflow-hidden group relative"
          >
            <img 
              src={user?.photoURL || ""} 
              alt="User" 
              className="w-full h-full rounded-[10px] object-cover grayscale hover:grayscale-0 transition-all opacity-60 group-hover:opacity-100"
            />
          </button>
        </div>
      </div>
      </aside>

      {/* Floating opener when collapsed */}
      {collapsed && (
        <button
          aria-label="Open sidebar"
          onClick={() => toggleCollapsed(false)}
          className="fixed left-3 top-1/2 -translate-y-1/2 z-50 h-10 w-10 rounded-full bg-surface-container border border-outline flex items-center justify-center shadow-md"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {/* Mobile bottom navigation */}
      <motion.nav
        animate={{ height: mobileExtrasOpen ? 124 : 52 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 md:hidden w-[92%] max-w-lg bg-surface/95 backdrop-blur rounded-[28px] border border-outline px-2 py-1 z-50 shadow-lg overflow-hidden"
      >
        <div className="flex h-full flex-col justify-end gap-2">
          <div className="flex items-center justify-between gap-2">
            <button
              aria-label="Toggle quick actions"
              onClick={() => setMobileExtrasOpen(v => !v)}
              className="h-8 w-8 rounded-full bg-surface-container border border-outline flex items-center justify-center shadow-sm shrink-0 transition-transform"
            >
              <svg className={`h-4 w-4 transform transition-transform ${mobileExtrasOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={`flex-1 flex items-center justify-center py-1 transition-colors text-[10px] ${isActive ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
                >
                  <item.icon className={`h-4 w-4 ${isActive ? 'stroke-[2.2]' : ''}`} />
                </NavLink>
              );
            })}

            <button onClick={openIngest} className="-ml-2 mr-1 h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-secondary-content shadow-sm ring-1 ring-secondary/20 shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <motion.div
            animate={{ opacity: mobileExtrasOpen ? 1 : 0, y: mobileExtrasOpen ? 0 : 10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="grid grid-cols-3 gap-3 rounded-2xl border border-outline bg-surface-container px-3 py-2"
          >
            <button
              onClick={toggleVoice}
              aria-label="Toggle voice"
              className={`flex h-10 items-center justify-center rounded-xl transition-colors ${isListening ? 'text-secondary bg-primary/10' : 'text-on-surface-variant/60'}`}
            >
              <Mic className="h-5 w-5" />
            </button>

            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex h-10 items-center justify-center rounded-xl text-on-surface-variant/60"
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>

            <button
              onClick={() => window.dispatchEvent(new CustomEvent('smart-charter-start-walkthrough'))}
              aria-label="Open info"
              className="flex h-10 items-center justify-center rounded-xl text-on-surface-variant/60"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </motion.div>
        </div>
      </motion.nav>
    </>
  );
}
