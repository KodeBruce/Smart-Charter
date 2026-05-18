import React, { createContext, useContext, useState, useCallback } from 'react';

export type VoiceLanguage = 'en' | 'es';

interface VoiceContextType {
  isListening: boolean;
  setIsListening: (value: boolean) => void;
  toggleVoice: () => void;
  voiceLanguage: VoiceLanguage;
  setVoiceLanguage: (value: VoiceLanguage) => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [isListening, setIsListeningState] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('en');

  const toggleVoice = useCallback(() => {
    setIsListeningState(prev => !prev);
    // Dispatch event for components not using context (if any)
    // Keep event name consistent across components
    window.dispatchEvent(new CustomEvent('toggle-voice-control'));
  }, []);

  return (
    <VoiceContext.Provider value={{
      isListening,
      setIsListening: setIsListeningState,
      toggleVoice,
      voiceLanguage,
      setVoiceLanguage,
    }}>
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
