import React, { createContext, useContext, useState, ReactNode } from 'react';
import IngestModal from '../components/IngestModal';
import { ContractAnalysis } from '../services/geminiService';
import { useNavigate } from 'react-router-dom';

interface IngestContextType {
  openIngest: () => void;
  closeIngest: () => void;
}

const IngestContext = createContext<IngestContextType | undefined>(undefined);

export function IngestProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const openIngest = () => setIsOpen(true);
  const closeIngest = () => setIsOpen(false);

  const handleSuccess = (analysis: any) => {
    navigate(`/contract/${analysis.id || 'new'}`, { state: { analysis } });
  };

  return (
    <IngestContext.Provider value={{ openIngest, closeIngest }}>
      {children}
      <IngestModal 
        isOpen={isOpen} 
        onClose={closeIngest} 
        onSuccess={handleSuccess} 
      />
    </IngestContext.Provider>
  );
}

export function useIngest() {
  const context = useContext(IngestContext);
  if (context === undefined) {
    throw new Error('useIngest must be used within an IngestProvider');
  }
  return context;
}
