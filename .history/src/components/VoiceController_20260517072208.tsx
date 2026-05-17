import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Command, Sparkles, CheckCircle2, Circle, ChevronRight, HelpCircle, MessageSquare, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useVoice } from '../contexts/VoiceContext';
import { auth } from '../lib/firebase';

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
  const [rawDebugTranscript, setRawDebugTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // High-fidelity speech guards
  const isSpeakingRef = useRef(false);
  const lastCommandTimeRef = useRef(0);

  // Conversational States
  const [isThinking, setIsThinking] = useState(false);
  const [sentinelResponse, setSentinelResponse] = useState<string | null>(null);

  // Gamified Verification State
  const [verifiedCommands, setVerifiedCommands] = useState<{
    dashboard: boolean;
    projects: boolean;
    compare: boolean;
    upload: boolean;
    walkthrough: boolean;
  }>({
    dashboard: false,
    projects: false,
    compare: false,
    upload: false,
    walkthrough: false,
  });

  const [activeTab, setActiveTab] = useState<'navigation' | 'workflows' | 'chat'>('navigation');

  // Trigger quick calibration sound on checkoff
  const playCheckoffSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.warn('Audio checkoff feedback blocked or unsupported');
    }
  };

  // Speaks response with Web Speech Synthesis
  // Improved speaking: split into short utterances for natural pauses,
  // vary pitch/rate slightly, and prefer high-quality 'neural' voices when available.
  const speakText = (text: string) => {
    try {
      window.speechSynthesis.cancel(); // Stop active voices
    } catch {}

    // Normalize text: trim and ensure punctuation for splitting
    const normalized = text.trim().replace(/\s+/g, ' ');

    // Split into sentences while keeping delimiters
    const parts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);

    // Prefer premium voices (WaveNet / Neural / Google labels)
    const voices = window.speechSynthesis.getVoices() || [];
    const preferred = voices.find(v => /(neural|wav[e]?net|google|amazon|acapela|azure)/i.test(v.name))
      || voices.find(v => v.lang?.startsWith('en'))
      || voices[0];

    // Stop recognition while speaking
    try { recognitionRef.current?.stop(); } catch {}
    isSpeakingRef.current = true;

    let index = 0;
    const speakNext = () => {
      if (index >= parts.length) {
        isSpeakingRef.current = false;
        // resume recognition if still listening
        if (isListening) {
          try { recognitionRef.current?.start(); } catch {}
        }
        return;
      }

      const sentence = parts[index++];
      const utt = new SpeechSynthesisUtterance(sentence);
      // Force language to English (US) to avoid German or other defaults
      utt.lang = 'en-US';
      if (preferred) utt.voice = preferred;

      // Slight prosody variation for more natural rhythm
      utt.rate = Math.max(0.9, Math.min(1.15, 1.02 + (Math.random() - 0.5) * 0.14));
      utt.pitch = Math.max(0.9, Math.min(1.12, 1.03 + (Math.random() - 0.5) * 0.08));
      utt.volume = 1;

      // Small pre-breath: very short silent gap simulated by delaying the speak call
      utt.onend = () => {
        // Insert a short pause between sentences (human-like breathing)
        setTimeout(speakNext, 120 + Math.floor(Math.random() * 80));
      };
      utt.onerror = () => {
        // Continue to next piece on error
        setTimeout(speakNext, 80);
      };

      window.speechSynthesis.speak(utt);
    };

    // Start speaking chain
    setTimeout(speakNext, 60);
  };

  const processCommand = useCallback(async (transcript: string) => {
    const cmd = transcript.toLowerCase();
    setLastCommand(transcript);
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 3000);

    let matched = false;

    // Navigation Commands
    if (cmd.includes('dashboard') || cmd.includes('home')) {
      speakText("Confirmed. Redirecting to your portfolio dashboard.");
      navigate('/');
      if (!verifiedCommands.dashboard) {
        setVerifiedCommands(p => ({ ...p, dashboard: true }));
        playCheckoffSound();
      }
      matched = true;
    } else if (cmd.includes('projects') || cmd.includes('portfolio') || cmd.includes('library')) {
      speakText("Opening your client workspaces.");
      navigate('/projects');
      if (!verifiedCommands.projects) {
        setVerifiedCommands(p => ({ ...p, projects: true }));
        playCheckoffSound();
      }
      matched = true;
    } else if (cmd.includes('compare') || cmd.includes('comparison')) {
      speakText("Opening comparison grid. Analyzing variations.");
      navigate('/compare');
      if (!verifiedCommands.compare) {
        setVerifiedCommands(p => ({ ...p, compare: true }));
        playCheckoffSound();
      }
      matched = true;
    } else if (cmd.includes('risk') || cmd.includes('playbook')) {
      speakText("Opening playbook and legal risk guidelines.");
      navigate('/risk');
      matched = true;
    } else if (cmd.includes('strategic') || cmd.includes('hub')) {
      speakText("Navigating to the strategic hub analytics.");
      navigate('/strategic-hub');
      matched = true;
    }
    
    // Action Commands
    else if (cmd.includes('upload') || cmd.includes('new contract')) {
       speakText("Ingestion modal activated. Select a contract to parse.");
       window.dispatchEvent(new CustomEvent('smart-charter-open-upload'));
       if (!verifiedCommands.upload) {
         setVerifiedCommands(p => ({ ...p, upload: true }));
         playCheckoffSound();
       }
       matched = true;
    } else if (cmd.includes('walkthrough') || cmd.includes('tour') || cmd.includes('guide')) {
       speakText("Welcome! Initiating guided walkthrough tour.");
       window.dispatchEvent(new CustomEvent('smart-charter-start-walkthrough'));
       if (!verifiedCommands.walkthrough) {
         setVerifiedCommands(p => ({ ...p, walkthrough: true }));
         playCheckoffSound();
       }
       matched = true;
    }

    // IF NOT MATCHED: Trigger Intelligent Conversation Mode!
    if (!matched && transcript.trim().length > 3) {
      setActiveTab('chat');
      setIsThinking(true);
      setSentinelResponse("Sentinel is thinking...");
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: JSON.stringify({
            prompt: transcript,
            systemInstruction: "You are the voice-interactive Vocal Sentinel inside the Smart Charter contract intelligence platform. Answer this question in a warm, expert, legal analyst persona. Keep your response extremely concise (maximum 30 words) so it is perfect for rapid voice read-aloud."
          })
        });
        const data = await response.json();
        if (data.text) {
          setSentinelResponse(data.text);
          speakText(data.text);
        } else {
          setSentinelResponse("I understood your voice but could not process a response.");
        }
      } catch (err) {
        console.error('Conversational response failed:', err);
        setSentinelResponse("System connection issue. Please check network protocols.");
      } finally {
        setIsThinking(false);
      }
    }
  }, [navigate, verifiedCommands, isListening]);

  // Cancel synthesis on close/disable
  useEffect(() => {
    if (!isListening) {
      window.speechSynthesis.cancel();
      setSentinelResponse(null);
    }
  }, [isListening]);

  // Auto transition tab when a section is completed
  useEffect(() => {
    if (verifiedCommands.dashboard && verifiedCommands.projects && verifiedCommands.compare && activeTab === 'navigation') {
      const timer = setTimeout(() => {
        setActiveTab('workflows');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [verifiedCommands, activeTab]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Set to true for near-instant responsiveness
    recognition.lang = 'en-US';

    let lastProcessedText = '';

    recognition.onresult = (event: any) => {
      // Debug: surface transcripts for easier debugging in console
      try {
        const dbgAll: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          dbgAll.push(event.results[i][0].transcript + (event.results[i].isFinal ? ' (final)' : ''));
        }
        console.debug('[VoiceController] onresult transcripts:', dbgAll.join(' | '));
      } catch (e) {}
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const activeText = (finalTranscript || interimTranscript).trim();
      // update raw debug transcript for UI visibility when diagnosing
      setRawDebugTranscript(activeText || null);
      const activeTextLower = activeText.toLowerCase();
      if (!activeText || activeTextLower === lastProcessedText.toLowerCase()) return;

      // Strict Voice Command Throttle: If we just triggered a command within the last 2.5 seconds, ignore duplicate interim frames!
      const now = Date.now();
      if (now - lastCommandTimeRef.current < 2500) {
        return;
      }

      // Scan interim or final text immediately for faster responsiveness
      const commands = [
        'dashboard', 'home', 'projects', 'portfolio', 'library', 
        'compare', 'comparison', 'risk', 'playbook', 'strategic', 'hub',
        'upload', 'new contract', 'walkthrough', 'tour', 'guide'
      ];

      const matchedCommand = commands.find(c => activeTextLower.includes(c));
      if (matchedCommand) {
        lastCommandTimeRef.current = now;
        lastProcessedText = activeText;
        processCommand(activeText);
        setTimeout(() => { lastProcessedText = ''; }, 3000);
      } else if (event.results[event.results.length - 1].isFinal) {
        // Only trigger voice chat on final transcript to prevent spamming Gemini
        lastCommandTimeRef.current = now;
        lastProcessedText = activeText;
        processCommand(activeText);
        setTimeout(() => { lastProcessedText = ''; }, 3000);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      console.debug('[VoiceController] recognition event:', event);
      setIsListening(false);
    };

    recognition.onstart = () => {
      console.debug('[VoiceController] recognition started');
      setRawDebugTranscript('(listening...)');
    };

    recognition.onend = () => {
      console.debug('[VoiceController] recognition ended');
      // only clear if not speaking; keep last transcript otherwise
      if (!isSpeakingRef.current) setRawDebugTranscript(null);
      // restart logic is handled elsewhere
    };

    recognition.onend = () => {
      // ONLY restart the recognition engine if the user hasn't explicitly muted it,
      // AND the system is not currently speaking back to the user!
      if (isListening && !isSpeakingRef.current) {
        try {
          recognition.start(); // Keep listening snappy
        } catch {}
      }
    };

    recognitionRef.current = recognition;

    // Expose simple debug helpers to the browser console for testing.
    try {
      (window as any).smartCharterVoice = {
        simulate: (text: string) => window.dispatchEvent(new CustomEvent('smart-charter-voice-simulate', { detail: text })),
        start: () => { try { recognitionRef.current?.start(); } catch (e) { console.warn('start failed', e); } },
        stop: () => { try { recognitionRef.current?.stop(); } catch (e) { console.warn('stop failed', e); } },
        isSupported: !!SpeechRecognition,
        checkPermissions: async () => {
          try {
            // @ts-ignore
            const p = await navigator.permissions.query({ name: 'microphone' });
            console.debug('[VoiceController] microphone permission state:', p.state);
            return p.state;
          } catch (e) {
            console.warn('Permission query not supported', e);
            return null;
          }
        }
      };
      console.debug('[VoiceController] smartCharterVoice helper installed (open console).');
    } catch (e) {}

    return () => {
      recognition.stop();
    };
  }, [processCommand, isListening, setIsListening]);

  // Premium synthetic audio chimes using Web Audio API
  const playActivationChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      // Futuristic ascending clean chord (C5 -> E5 -> G5)
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      
      osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.04); // G5
      osc2.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.18); // C6
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      osc1.start();
      osc2.start(ctx.currentTime + 0.04);
      
      osc1.stop(ctx.currentTime + 0.3);
      osc2.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn('Audio activation chime blocked');
    }
  };

  const playDeactivationChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      // Descending mechanical powering-down sweep
      osc.frequency.setValueAtTime(392.00, ctx.currentTime); // G4
      osc.frequency.exponentialRampToValueAtTime(196.00, ctx.currentTime + 0.18); // G3
      
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      console.warn('Audio deactivation chime blocked');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      playDeactivationChime();
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        playActivationChime();
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error('Failed to start recognition:', e);
      }
    }
  };

  // Explicit controls for UI-driven testing
  const startRecognition = () => {
    try {
      playActivationChime();
      recognitionRef.current?.start();
      setIsListening(true);
    } catch (e) {
      console.error('startRecognition failed', e);
    }
  };

  const stopRecognition = () => {
    try {
      playDeactivationChime();
      recognitionRef.current?.stop();
      setIsListening(false);
    } catch (e) {
      console.error('stopRecognition failed', e);
    }
  };

  const simulateCommandNow = (text: string) => {
    window.dispatchEvent(new CustomEvent('smart-charter-voice-simulate', { detail: text }));
  };

  useEffect(() => {
    const handler = () => toggleListening();
    const simulateHandler = (e: any) => {
      if (e.detail) {
        setIsListening(true);
        // Force bypass any active speaking throttle for UI-simulated command previews
        lastCommandTimeRef.current = 0;
        processCommand(e.detail);
      }
    };
    window.addEventListener('toggle-voice-control', handler);
    window.addEventListener('smart-charter-voice-simulate', simulateHandler);
    return () => {
      window.removeEventListener('toggle-voice-control', handler);
      window.removeEventListener('smart-charter-voice-simulate', simulateHandler);
    };
  }, [isListening, processCommand]);

  // Calculate overall calibration progress
  const totalVerified = Object.values(verifiedCommands).filter(Boolean).length;
  const progressPercent = (totalVerified / 5) * 100;

  return (
    <>
      <AnimatePresence>
        {isListening && (
          <motion.div 
            initial={{ opacity: 0, y: 30, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 30, x: 20 }}
            className="fixed left-1/2 top-1/2 z-[60] w-[min(92vw,350px)] -translate-x-1/2 -translate-y-1/2 sm:left-auto sm:top-auto sm:right-6 sm:bottom-6 sm:w-[350px] sm:translate-x-0 sm:translate-y-0 bg-[#0D0D0E]/95 backdrop-blur-2xl border border-white/10 p-4 sm:p-5 rounded-[24px] sm:rounded-[28px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] flex flex-col gap-4 overflow-hidden text-white max-h-[calc(100vh-6rem)]"
          >
            {/* Header: Listening status */}
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#E2FF6F]/20 rounded-full animate-ping" />
                  <div className="relative w-2.5 h-2.5 rounded-full bg-[#E2FF6F]" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#E2FF6F]">Vocal Sentinel</h4>
                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Calibration Guide</p>
                </div>
              </div>
              <div className="flex gap-1.5 items-end">
                {[1, 2, 3, 4].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ height: [4, 16, 4] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                    className="w-[2.5px] bg-[#E2FF6F] rounded-full"
                  />
                ))}
              </div>
            </div>

            {/* Microfeedback text output */}
            <div className="min-h-[22px] flex items-center justify-center bg-white/[0.03] border border-white/5 rounded-xl py-1 px-3">
              {showFeedback && lastCommand ? (
                <p className="text-[10px] font-mono font-bold text-[#E2FF6F] truncate">
                  Matched: "{lastCommand}"
                </p>
              ) : (
                <div className="w-full">
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                    Speak a command to verify responsiveness
                  </p>
                  {rawDebugTranscript && (
                    <p className="text-[10px] font-mono text-white/50 truncate mt-1">Debug: {rawDebugTranscript}</p>
                  )}
                </div>
              )}
            </div>

            {/* Tab Swapper */}
            <div className="flex bg-white/[0.03] border border-white/5 p-0.5 rounded-xl gap-0.5">
              <button 
                onClick={() => setActiveTab('navigation')}
                className={`flex-1 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  activeTab === 'navigation' 
                    ? 'bg-white/10 text-[#E2FF6F] shadow-sm' 
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Nav
              </button>
              <button 
                onClick={() => setActiveTab('workflows')}
                className={`flex-1 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  activeTab === 'workflows' 
                    ? 'bg-white/10 text-secondary shadow-sm' 
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Actions
              </button>
              <button 
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 ${
                  activeTab === 'chat' 
                    ? 'bg-white/10 text-primary shadow-sm' 
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                <MessageSquare className="h-2.5 w-2.5" />
                Chat
              </button>
            </div>

            {/* Sliding Command List & Chat Bubble */}
            <div className="min-h-[140px]">
              <AnimatePresence mode="wait">
                {activeTab === 'navigation' && (
                  <motion.div 
                    key="nav"
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 10, opacity: 0 }}
                    className="space-y-3"
                  >
                    {[
                      { key: 'dashboard', voice: 'Go to Dashboard', desc: 'Goes to main portfolio list' },
                      { key: 'projects', voice: 'Go to Projects', desc: 'Goes to client workspaces' },
                      { key: 'compare', voice: 'Go to Compare', desc: 'Opens clause comparative grid' },
                    ].map(cmd => (
                      <div 
                        key={cmd.key} 
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          (verifiedCommands as any)[cmd.key] 
                            ? 'bg-white/[0.06] border-white/20 text-white' 
                            : 'bg-white/[0.02] border-transparent text-white/60 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-bold tracking-wide">"{cmd.voice}"</span>
                          <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{cmd.desc}</span>
                        </div>
                        {(verifiedCommands as any)[cmd.key] ? (
                          <CheckCircle2 className="h-4 w-4 text-[#E2FF6F] shrink-0 animate-scale" />
                        ) : (
                          <Circle className="h-4 w-4 text-white/10 shrink-0" />
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}

                {activeTab === 'workflows' && (
                  <motion.div 
                    key="action"
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 10, opacity: 0 }}
                    className="space-y-3"
                  >
                    {[
                      { key: 'upload', voice: 'Upload Document', desc: 'Opens agreement ingestion modal' },
                      { key: 'walkthrough', voice: 'Start Walkthrough', desc: 'Launches visual guided tour' },
                    ].map(cmd => (
                      <div 
                        key={cmd.key} 
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          (verifiedCommands as any)[cmd.key] 
                            ? 'bg-white/[0.06] border-white/20 text-white' 
                            : 'bg-white/[0.02] border-transparent text-white/60 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-bold tracking-wide">"{cmd.voice}"</span>
                          <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{cmd.desc}</span>
                        </div>
                        {(verifiedCommands as any)[cmd.key] ? (
                          <CheckCircle2 className="h-4 w-4 text-secondary shrink-0 animate-scale" />
                        ) : (
                          <Circle className="h-4 w-4 text-white/10 shrink-0" />
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}

                {activeTab === 'chat' && (
                  <motion.div 
                    key="chat"
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 10, opacity: 0 }}
                    className="flex flex-col h-[140px] justify-between p-3 bg-white/[0.03] border border-white/5 rounded-2xl"
                  >
                    <div className="overflow-y-auto flex-1 custom-scrollbar flex flex-col justify-center items-center gap-3">
                      {isThinking ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 text-primary animate-spin" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#E2FF6F]">Consulting Sentinel</span>
                        </div>
                      ) : sentinelResponse ? (
                        <div className="text-center px-2">
                          <p className="text-[11px] leading-relaxed font-semibold italic text-white/90">
                            "{sentinelResponse}"
                          </p>
                        </div>
                      ) : (
                        <div className="text-center px-4 py-2">
                          <Sparkles className="h-5 w-5 text-primary mx-auto mb-2 opacity-50 animate-pulse" />
                          <p className="text-[10px] font-bold text-white/70">Intelligent Voice Companion</p>
                          <p className="text-[8px] text-white/30 uppercase tracking-widest mt-1">
                            Ask me any contract or general legal questions aloud!
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom Progress Tracker */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <div className="flex flex-col gap-1 w-[70%]">
                <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-white/40">
                  <span>Calibration Progress</span>
                  <span>{totalVerified}/5 Verified</span>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-[#E2FF6F] to-secondary rounded-full"
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ type: 'spring', stiffness: 80 }}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={startRecognition}
                    className="px-3 py-1 border border-white/10 text-white/60 hover:text-white text-[8px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
                  >
                    Start Mic
                  </button>
                  <button
                    onClick={stopRecognition}
                    className="px-3 py-1 border border-white/10 text-white/60 hover:text-white text-[8px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
                  >
                    Stop Mic
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => simulateCommandNow('upload document')}
                    className="px-3 py-1 border border-white/10 text-white/60 hover:text-white text-[8px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
                  >
                    Simulate Upload
                  </button>
                  <button
                    onClick={() => simulateCommandNow('go to projects')}
                    className="px-3 py-1 border border-white/10 text-white/60 hover:text-white text-[8px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
                  >
                    Simulate Projects
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
