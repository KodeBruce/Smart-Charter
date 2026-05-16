/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import Repository from './views/Repository';
import ContractDetail from './views/ContractDetail';
import RiskPlaybook from './views/RiskPlaybook';
import CompareContracts from './views/CompareContracts';
import Projects from './views/Projects';
import ProjectWorkspace from './views/ProjectWorkspace';
import StrategicHub from './views/StrategicHub';
import Settings from './views/Settings';
import Login from './views/Login';
import { useFirebase } from './lib/FirebaseProvider';

import { ThemeProvider } from './contexts/ThemeContext';
import { IngestProvider } from './contexts/IngestContext';
import { VoiceProvider } from './contexts/VoiceContext';

export default function App() {
  const { user, loading } = useFirebase();

  if (loading) {
    return (
      <ThemeProvider>
        <div className="flex h-screen items-center justify-center bg-surface">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>
      </ThemeProvider>
    );
  }

  if (!user) {
    return (
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <IngestProvider>
          <VoiceProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/repository" element={<Repository />} />
                <Route path="/contract/:id" element={<ContractDetail />} />
                <Route path="/compare" element={<CompareContracts />} />
                <Route path="/strategic-hub" element={<StrategicHub />} />
                <Route path="/risk" element={<RiskPlaybook />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/project/:id" element={<ProjectWorkspace />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </VoiceProvider>
        </IngestProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
