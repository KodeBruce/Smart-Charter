import React, { useState } from 'react';
import { Search, Bell, HelpCircle, User, X } from 'lucide-react';
import { auth } from '../lib/firebase';

interface TopBarProps {
  title?: string;
  showSearch?: boolean;
  actions?: React.ReactNode;
}

export default function TopBar({ title, showSearch = true, actions }: TopBarProps) {
  // voice feature removed
  const currentUser = auth.currentUser;
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-12 sm:h-14 w-full items-center justify-between border-b border-outline bg-surface px-3 sm:px-6 lg:px-8">
      <div className="flex flex-1 items-center gap-6">
        {title && <h2 className="text-sm font-bold text-primary tracking-tight uppercase whitespace-nowrap hidden xs:block sm:block">{title}</h2>}
        {showSearch && (
          <div className="relative w-full max-w-sm group hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant/40 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search files..."
              aria-label="Search files"
              className="w-full bg-surface-container-low border border-transparent rounded py-1.5 pl-10 pr-4 text-[11px] font-semibold focus:ring-1 focus:ring-primary focus:bg-surface focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/30"
            />
          </div>
        )}
        {/* Mobile search toggle */}
        {showSearch && (
          <button className="sm:hidden p-2 text-on-surface-variant/40 hover:text-primary" onClick={() => setMobileSearchOpen(v => !v)} aria-label="Open search">
            <Search className="h-4 w-4" />
          </button>
        )}
        {mobileSearchOpen && (
          <div className="fixed inset-0 z-50 flex items-start pt-14 sm:pt-16 justify-center sm:hidden">
            <div className="w-full px-4">
              <div className="bg-surface-container-low border border-outline rounded-lg p-3 flex items-center gap-2">
                <Search className="h-5 w-5 text-on-surface-variant/40" />
                <input autoFocus type="text" placeholder="Search files..." aria-label="Mobile search" className="w-full bg-transparent outline-none text-[13px] font-semibold placeholder:text-on-surface-variant/30" />
                <button aria-label="Close search" onClick={() => setMobileSearchOpen(false)} className="p-2 text-on-surface-variant/40">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {actions}
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleVoice}
            aria-label="Toggle voice commands"
            className={`p-2 min-w-[40px] min-h-[40px] rounded-md transition-all flex items-center justify-center ${isListening ? 'text-primary scale-110 shadow-lg shadow-primary/10' : 'text-on-surface-variant/40 hover:text-primary'}`}
          >
            {isListening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
          <button aria-label="Notifications" className="p-2 min-w-[40px] min-h-[40px] rounded-md text-on-surface-variant/40 hover:text-primary transition-all flex items-center justify-center">
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
            <div className="h-8 w-8 sm:h-8 sm:w-8 overflow-hidden rounded bg-surface-container border border-outline flex items-center justify-center">
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
