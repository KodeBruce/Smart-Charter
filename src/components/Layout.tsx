import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Walkthrough from './Walkthrough';
import VoiceController from './VoiceController';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <Walkthrough />
      <VoiceController />
      <main className="flex-1 flex flex-col md:ml-24 md:mr-6 my-4 md:my-5 bg-surface border border-outline rounded-[32px] shadow-2xl shadow-black/[0.03] overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
}
