import React, { useState } from 'react';
import { Search, Bell, HelpCircle, Mic, MicOff, User } from 'lucide-react';
import { useVoice } from '../contexts/VoiceContext';
import { auth } from '../lib/firebase';

interface TopBarProps {
  title?: string;
  showSearch?: boolean;
  actions?: React.ReactNode;
}

export default function TopBar({ title, showSearch = true, actions }: TopBarProps) {
  const { isListening, toggleVoice } = useVoice();
  const currentUser = auth.currentUser;
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-12 w-full items-center justify-between border-b border-outline bg-surface px-3 sm:px-6 lg:px-8">
      <div className="flex flex-1 items-center gap-6">
        {title && <h2 className="text-sm sm:text-sm font-bold text-primary tracking-tight uppercase whitespace-nowrap">{title}</h2>}
        {showSearch && (
          <div className="relative w-full max-w-sm group hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant/40 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search files..."
              className="w-full bg-surface-container-low border border-transparent rounded py-1 pl-10 pr-3 text-[11px] font-semibold focus:ring-1 focus:ring-primary focus:bg-surface focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/30"
            />
          </div>
        )}
        {/* Mobile search toggle */}
        {showSearch && (
          <button className="sm:hidden p-1 text-on-surface-variant/40 hover:text-primary" onClick={() => setMobileSearchOpen(v => !v)} aria-label="Search">
            <Search className="h-4 w-4" />
          </button>
        )}
        {mobileSearchOpen && (
          <div className="absolute top-full left-2 right-2 mt-2 sm:hidden z-50">
            <div className="bg-surface-container-low border border-outline rounded-lg p-1 flex items-center gap-2">
              <Search className="h-4 w-4 text-on-surface-variant/40 ml-2" />
              <input autoFocus type="text" placeholder="Search files..." className="w-full bg-transparent outline-none text-[11px] font-semibold placeholder:text-on-surface-variant/30 py-1" />
              <button className="ml-2 text-on-surface-variant/40 px-2 py-1 text-[12px]" onClick={() => setMobileSearchOpen(false)}>Close</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {actions}
        <div className="flex items-center gap-1">
          <button 
            onClick={toggleVoice}
            className={`p-1 sm:p-2 transition-all ${isListening ? 'text-primary scale-110 shadow-lg shadow-primary/10' : 'text-on-surface-variant/40 hover:text-primary'}`}
            title="Toggle Voice Commands"
          >
            {isListening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
          <button className="p-1 sm:p-2 text-on-surface-variant/40 hover:text-primary transition-all">
            <Bell className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-outline mx-2 hidden sm:block" />
          <div className="flex items-center gap-3 pl-2">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-bold text-primary leading-none">
                {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Member'}
              </span>
              <span className="text-[8px] font-bold text-on-surface-variant/50 uppercase tracking-tighter">
                {currentUser?.email ? 'Authorized Agent' : 'Guest'}
              </span>
            </div>
            <div className="h-8 w-8 overflow-hidden rounded bg-surface-container border border-outline flex items-center justify-center">
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="User"
                  className="h-full w-full object-cover grayscale"
                />
              ) : (
                <User className="h-4 w-4 text-on-surface-variant/40" />
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
