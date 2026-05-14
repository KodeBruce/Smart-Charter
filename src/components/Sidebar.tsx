import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Files, ShieldAlert, Settings, Plus, HelpCircle, Moon, Sun, Search, FolderOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { useFirebase } from '../lib/FirebaseProvider';
import { useTheme } from '../contexts/ThemeContext';
import { useIngest } from '../contexts/IngestContext';

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useFirebase();
  const { theme, toggleTheme } = useTheme();
  const { openIngest } = useIngest();

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FolderOpen, label: 'Projects', path: '/projects' },
    { icon: FileText, label: 'Repository', path: '/repository' },
    { icon: Files, label: 'Document Comparison', path: '/compare' },
    { icon: ShieldAlert, label: 'Risk Playbook', path: '/risk' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <aside className="fixed left-5 top-5 bottom-5 w-16 flex flex-col items-center z-50">
      <div className="h-full w-full bg-[#0D0D0D] rounded-[32px] flex flex-col items-center py-6 px-3 gap-6 shadow-2xl border border-white/5 relative overflow-hidden">
        {/* Subtle Background Glow */}
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-white/[0.03] to-transparent opacity-50 pointer-events-none" />

        {/* Action Button */}
        <button 
          id="walkthrough-ingest" 
          onClick={openIngest}
          className="h-10 w-10 rounded-xl bg-[#E2FF6F] flex items-center justify-center text-black hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#E2FF6F]/20 relative z-10 group"
        >
          <Plus className="h-5 w-5 stroke-[2.5]" />
          <div className="absolute left-14 px-3 py-1.5 bg-[#0D0D0D]/90 backdrop-blur text-white text-[9px] font-bold uppercase tracking-widest rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-white/10">
            Upload Document
          </div>
        </button>

        <div className="w-6 h-px bg-white/5 relative z-10" />

        {/* Navigation Items */}
        <nav id="walkthrough-nav" className="flex flex-col gap-3 flex-1 relative z-10">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const targetId = item.label === 'Projects' ? 'walkthrough-projects' : 
                          item.label === 'Repository' ? 'walkthrough-repository' :
                          item.label === 'Risk Playbook' ? 'walkthrough-risk' : undefined;
            return (
              <NavLink
                key={item.path}
                id={targetId}
                to={item.path}
                title={item.label}
                className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 relative group ${
                  isActive 
                    ? 'bg-white text-black shadow-xl ring-2 ring-white/10' 
                    : 'text-white/40 hover:bg-white/10 hover:text-white/80'
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <div className="absolute left-14 px-3 py-1.5 bg-[#0D0D0D]/90 backdrop-blur text-white text-[9px] font-bold uppercase tracking-widest rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-white/10">
                  {item.label}
                </div>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="flex flex-col gap-4 mt-auto relative z-10 p-0.5">
          <button 
            onClick={toggleTheme}
            className="h-9 w-9 rounded-xl text-white/50 hover:text-[#E2FF6F] flex items-center justify-center transition-all group relative"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          <button 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('smart-charter-start-walkthrough'));
            }}
            className="h-9 w-9 rounded-xl text-white/50 hover:text-white flex items-center justify-center transition-all group relative"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          <div className="h-px w-6 bg-white/5 mx-auto" />

          <button 
            onClick={logout}
            className="h-9 w-9 rounded-xl border border-white/10 p-0.5 hover:border-[#E2FF6F]/50 transition-all overflow-hidden group relative"
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
  );
}
