import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Walkthrough from './Walkthrough';
import SpeechmaticsAssistant from './SpeechmaticsAssistant';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-surface relative overflow-hidden">
      {/* Background Mesh Gradient */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[var(--mesh-gradient)] opacity-30 animate-mesh" />
      </div>

      <Sidebar />
      <Walkthrough />
      <SpeechmaticsAssistant />
      
      <main className="flex-1 flex flex-col md:ml-24 md:mr-6 my-4 md:my-5 bg-surface/80 backdrop-blur-xl border border-outline rounded-[32px] shadow-2xl shadow-black/[0.05] overflow-hidden relative z-10">
        <div className="flex-1 overflow-hidden flex flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
