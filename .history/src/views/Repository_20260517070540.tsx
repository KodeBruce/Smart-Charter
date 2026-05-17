import React from 'react';
import TopBar from '../components/TopBar';

export default function Repository() {
  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      <TopBar title="Repository" />
      <main className="p-4 sm:p-6">
        <h1 className="text-xl font-bold">Repository</h1>
        <p className="mt-4 text-on-surface/60">Placeholder view while fixing responsiveness and restoring the table/modals.</p>
      </main>
    </div>
  );
}
