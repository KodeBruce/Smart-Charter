import React, { createContext, useContext, useState, useCallback } from 'react';

interface VoiceContextType {
  isListening: boolean;
  setIsListening: (value: boolean) => void;
  toggleVoice: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [isListening, setIsListeningState] = useState(false);

  const toggleVoice = useCallback(() => {
    setIsListeningState(prev => !prev);
    // Dispatch event for components not using context (if any)
    window.dispatchEvent(new CustomEvent('toggle-voice-control-internal'));
  }, []);

  return (
    <VoiceContext.Provider value={{ isListening, setIsListening: setIsListeningState, toggleVoice }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (context === undefined) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}
