import React from 'react';
import { motion } from 'motion/react';
import { User, Bell, Shield, Lock, Globe, Database, Moon, Sun, Trash2, LogOut } from 'lucide-react';
import { useFirebase } from '../lib/FirebaseProvider';
import { useTheme } from '../contexts/ThemeContext';

export default function Settings() {
  const { user, logout } = useFirebase();
  const { theme, toggleTheme } = useTheme();

  const sections = [
    { title: 'Identity', icon: User, active: true },
    { title: 'Protocols', icon: Shield, active: false },
    { title: 'Notifications', icon: Bell, active: false },
    { title: 'Integration', icon: Database, active: false },
    { title: 'Security', icon: Lock, active: false },
  ];

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      <div className="px-8 py-6 space-y-8 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-0.5">
          <p className="text-[8px] font-bold text-primary/40 tracking-[0.4em] uppercase leading-none mb-1">System Configuration</p>
          <div className="flex items-end justify-between">
            <h1 className="text-xl font-bold text-primary tracking-tighter leading-none">Settings</h1>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
          <aside className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.title}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all ${
                  section.active 
                    ? 'bg-primary text-white shadow-lg' 
                    : 'text-on-surface-variant/40 hover:bg-surface-container hover:text-primary'
                }`}
              >
                <section.icon className="h-4 w-4" />
                {section.title}
              </button>
            ))}
          </aside>

          <main className="space-y-8">
            <section className="bg-surface-container-low border border-outline rounded-[24px] p-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 mb-6">UserProfile</h3>
              <div className="flex items-center gap-6">
                <img 
                  src={user?.photoURL || ''} 
                  alt={user?.displayName || 'User'} 
                  className="w-20 h-20 rounded-2xl object-cover border border-outline"
                />
                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-primary tracking-tight">{user?.displayName}</h4>
                  <p className="text-[11px] text-on-surface-variant/60 font-medium">{user?.email}</p>
                  <p className="text-[9px] font-bold text-primary/40 uppercase tracking-[0.2em]">Verified Contributor</p>
                </div>
              </div>
            </section>

            <section className="bg-surface-container-low border border-outline rounded-[24px] p-6 space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40">Interface Protocols</h3>
              <div className="flex items-center justify-between p-4 bg-surface border border-outline rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center">
                    {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-primary">Dynamic Theme</p>
                    <p className="text-[9px] text-on-surface-variant/40 uppercase font-bold tracking-widest">Adjust visual contrast</p>
                  </div>
                </div>
                <button 
                  onClick={toggleTheme}
                  className="px-4 py-1.5 bg-primary text-white text-[9px] font-extrabold uppercase tracking-widest rounded-lg hover:scale-105 transition-all shadow-md"
                >
                  Toggle to {theme === 'light' ? 'Dark' : 'Light'}
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-surface border border-outline rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center">
                    <LogOut className="h-4 w-4 text-error" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-primary">Platform Exit</p>
                    <p className="text-[9px] text-on-surface-variant/40 uppercase font-bold tracking-widest">Disconnect secure session</p>
                  </div>
                </div>
                <button 
                  onClick={logout}
                  className="px-4 py-1.5 border border-error/50 text-error text-[9px] font-extrabold uppercase tracking-widest rounded-lg hover:bg-error/10 transition-all"
                >
                  Terminate
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
