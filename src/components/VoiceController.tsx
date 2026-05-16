import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Command, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useVoice } from '../contexts/VoiceContext';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function VoiceController() {
  const navigate = useNavigate();
  const { isListening, setIsListening } = useVoice();
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const recognitionRef = useRef<any>(null);

  const processCommand = useCallback((transcript: string) => {
    const cmd = transcript.toLowerCase();
    setLastCommand(transcript);
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 3000);

    // Navigation Commands
    if (cmd.includes('dashboard') || cmd.includes('home')) {
      navigate('/');
    } else if (cmd.includes('projects') || cmd.includes('portfolio') || cmd.includes('library')) {
      navigate('/projects');
    } else if (cmd.includes('compare') || cmd.includes('comparison')) {
      navigate('/compare');
    } else if (cmd.includes('risk') || cmd.includes('playbook')) {
      navigate('/risk');
    } else if (cmd.includes('strategic') || cmd.includes('hub')) {
      navigate('/strategic-hub');
    }
    
    // Action Commands
    else if (cmd.includes('upload') || cmd.includes('new contract')) {
       // We'll need a global event or context to trigger the modal
       window.dispatchEvent(new CustomEvent('smart-charter-open-upload'));
    } else if (cmd.includes('walkthrough') || cmd.includes('tour') || cmd.includes('guide')) {
       window.dispatchEvent(new CustomEvent('smart-charter-start-walkthrough'));
    }
  }, [navigate]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      processCommand(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        recognition.start(); // Keep listening if it was on
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [processCommand, isListening]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error('Failed to start recognition:', e);
      }
    }
  };

  // Handle global toggle event (optional, for TopBar integration)
  useEffect(() => {
    const handler = () => toggleListening();
    window.addEventListener('toggle-voice-control', handler);
    return () => window.removeEventListener('toggle-voice-control', handler);
  }, [isListening]);

  return (
    <>
      {/* Floating Status Indicator */}
      <AnimatePresence>
        {isListening && (
          <motion.div 
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-3"
          >
            <div className="bg-surface-container/90 backdrop-blur-xl border border-primary/20 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                <div className="relative w-2 h-2 rounded-full bg-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface">Sentinel Listening</span>
                {showFeedback && lastCommand && (
                  <motion.span 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[9px] font-bold text-primary/80 truncate max-w-[150px]"
                  >
                    "{lastCommand}"
                  </motion.span>
                )}
              </div>
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ height: [4, 12, 4] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                    className="w-[2px] bg-primary rounded-full"
                  />
                ))}
              </div>
            </div>
            
            <p className="text-[8px] font-bold text-on-surface/30 uppercase tracking-widest">
              Try "Go to Dashboard" or "Go to Projects"
            </p>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
}
