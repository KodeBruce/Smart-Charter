import React from 'react';
import { motion } from 'motion/react';
import { User, Bell, Shield, Lock, Database, Moon, Sun, LogOut } from 'lucide-react';
import { useFirebase } from '../lib/FirebaseProvider';
import { useTheme } from '../contexts/ThemeContext';

export default function Settings() {
  const { user, logout } = useFirebase();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = React.useState('Identity');

  const sections = [
    { title: 'Identity', icon: User },
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
            <section className="bg-surface-container-low border border-outline/20 rounded-[32px] p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/30">User Profile</h3>
                <span className="px-3 py-1 bg-primary/10 text-primary text-[8px] font-bold uppercase tracking-widest rounded-full">Primary Identity</span>
              </div>
              <div className="flex items-center gap-8">
                <div className="relative group">
                  <div className="absolute inset-0 bg-primary/20 rounded-[28px] blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <img 
                    src={user?.photoURL || ''} 
                    alt={user?.displayName || 'User'} 
                    className="w-24 h-24 rounded-[28px] object-cover border-2 border-outline/30 relative z-10 shadow-2xl grayscale hover:grayscale-0 transition-all duration-500"
                  />
                </div>
                <div className="space-y-3">
                  <h4 className="text-2xl font-black text-on-surface tracking-tight">{user?.displayName}</h4>
                  <p className="text-[12px] text-on-surface/50 font-medium tracking-wide">{user?.email}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    <p className="text-[9px] font-black text-on-surface/30 uppercase tracking-[0.2em]">Verified Contributor • Neural Sync Active</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-surface-container-low border border-outline/20 rounded-[32px] p-8 space-y-8 shadow-sm">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/30">Interface Protocols</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 bg-surface/50 backdrop-blur-sm border border-outline/20 rounded-[24px] hover:border-primary/20 transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center border border-outline/10 group-hover:scale-110 transition-transform">
                      {theme === 'light' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-warning" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Dynamic Theme</p>
                      <p className="text-[10px] text-on-surface/40 uppercase font-bold tracking-widest mt-1">Adjust visual contrast & light levels</p>
                    </div>
                  </div>
                  <button 
                    onClick={toggleTheme}
                    className="px-6 py-2 bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest rounded-xl hover:translate-y-[-2px] active:translate-y-0 transition-all shadow-lg shadow-primary/20"
                  >
                    Set to {theme === 'light' ? 'Dark' : 'Light'} Mode
                  </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-surface/50 backdrop-blur-sm border border-outline/20 rounded-[24px] hover:border-error/20 transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center border border-outline/10 group-hover:scale-110 transition-transform">
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

            {activeTab !== 'Identity' && (
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
