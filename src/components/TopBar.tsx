import React from 'react';
import { Search, Bell, HelpCircle } from 'lucide-react';

interface TopBarProps {
  title?: string;
  showSearch?: boolean;
  actions?: React.ReactNode;
}

export default function TopBar({ title, showSearch = true, actions }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-outline bg-white px-8">
      <div className="flex flex-1 items-center gap-6">
        {title && <h2 className="text-sm font-bold text-primary tracking-tight uppercase whitespace-nowrap">{title}</h2>}
        {showSearch && (
          <div className="relative w-full max-w-sm group">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant/40 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search files..."
              className="w-full bg-surface-container-low border border-transparent rounded py-1.5 pl-10 pr-4 text-[11px] font-semibold focus:ring-1 focus:ring-primary focus:bg-white focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/30"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {actions}
        <div className="flex items-center gap-2">
          <button className="p-2 text-on-surface-variant/40 hover:text-primary transition-all">
            <Bell className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-outline mx-2" />
          <div className="flex items-center gap-3 pl-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-primary leading-none">Lisa Nguyen</span>
              <span className="text-[8px] font-bold text-on-surface-variant/50 uppercase tracking-tighter">Manager</span>
            </div>
            <div className="h-8 w-8 overflow-hidden rounded bg-surface-container border border-outline">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDEkvBMTYMPskEqU10YWFLq61onAuLcx7ZuxVftHdNfVF7e_6RDttC9KeBnXycpzRE_IO-oyC7njlLvuGjr2T6OOV8AmUd-UqTVxmbx_J4xiCvygcRJz6ymt2cqPuTISL3NRhqMzCfNhcOvTEPLjLNczVjL2nrauYFdKOt-On5wnFSTbH47Ms9BSz9FLU2CK5J3pWLkvni1a2A4B9VmGce4xq8tcLkt5M-ypuJz69i4TZ-1Quj8nSJrtYtYTVt4IiwQPAtugT1Zo8uQ"
                alt="User"
                className="h-full w-full object-cover grayscale"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
