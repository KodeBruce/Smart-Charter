import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Volume2, VolumeX, Sparkles, Check, Square, CheckSquare } from 'lucide-react';

interface Step {
  id: string;
  targetId?: string;
  title: string;
  content: string;
  audioText: string;
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

const steps: Step[] = [
  {
    id: 'welcome',
    title: 'Meet Smart Charter: Your Legal Intelligence Hub.',
    content: 'Smart Charter is a sophisticated legal intelligence platform designed to automate contract analysis and risk management. It uses advanced AI to identify risks, track obligations, and ensure compliance across your entire portfolio.',
    audioText: 'Welcome to Smart Charter. I am your legal intelligence hub. This platform is a sophisticated engine designed to automate contract analysis and risk management. I will identify risks, track your obligations, and ensure compliance across your entire document portfolio.',
    position: 'center'
  },
  {
    id: 'ingest',
    targetId: 'walkthrough-ingest',
    title: 'Upload. Analyze. Understand.',
    content: 'Drop in any contract — PDF, DOCX, or plain text. The AI engine extracts every clause, scores the risk level, identifies parties, and surfaces obligations in seconds.',
    audioText: 'Drop in any contract. The AI engine will extract every clause, score the risk level, identify parties, and surface all obligations in seconds. No manual reading required.',
    position: 'right'
  },
  {
    id: 'dashboard',
    targetId: 'walkthrough-dashboard',
    title: 'Your Portfolio Snapshot.',
    content: 'Your dashboard provides a high-level view of your contract health. Monitor critical risks, upcoming expiries, and overall portfolio stability at a glance.',
    audioText: 'Your dashboard gives you a live snapshot of your contract portfolio health. You can monitor critical risks, upcoming expiries, and overall portfolio stability at a glance.',
    position: 'right'
  },
  {
    id: 'projects',
    targetId: 'walkthrough-projects',
    title: 'Project Workspaces.',
    content: 'Organize work into specific Projects for each deal or client. This keeps your intelligence segmented and focused on the relevant legal context.',
    audioText: 'Organize your work into specific Projects for each deal or client. This keeps your intelligence segmented and focused on the relevant legal context.',
    position: 'right'
  },
  {
    id: 'redlining',
    targetId: 'walkthrough-compare',
    title: 'Document Comparison.',
    content: 'Compare multiple versions of a contract side-by-side. Our AI highlights key differences in jurisdiction, value, and risk, helping you spot critical changes instantly.',
    audioText: 'Use the comparison tool to view multiple versions of a contract side-by-side. Our AI highlights key differences in jurisdiction, value, and risk, helping you spot critical changes instantly.',
    position: 'right'
  },
  {
    id: 'risk-framework',
    targetId: 'walkthrough-risk',
    title: 'AI Risk Playbooks.',
    content: 'Architect custom review frameworks with AI. Define your own risk thresholds and mandatory clauses to ensure every document meets your institutional standards.',
    audioText: 'Architect custom review frameworks with AI. You can define your own risk thresholds and mandatory clauses to ensure every document meets your institutional standards.',
    position: 'right'
  },
  {
    id: 'repository',
    targetId: 'walkthrough-repository',
    title: 'Intelligence Portfolio.',
    content: 'Your signed and active contracts are indexed here. The AI watches for expiry dates, counterparty changes, and regulatory shifts that could affect each agreement.',
    audioText: 'Your signed and active contracts are indexed in the Intelligence Portfolio. The AI watches for expiry dates and regulatory shifts that could affect each of your agreements.',
    position: 'right'
  },
  {
    id: 'extraction',
    targetId: 'walkthrough-extraction',
    title: 'Deep Clause Intelligence.',
    content: 'Inside any contract, the Clauses tab shows every legal node with risk level, implications, and an AI Rewrite option to generate improved language instantly.',
    audioText: 'Inside any contract, switch to the Clauses tab to browse every legal node. Each clause shows its risk level, implications, and an AI Rewrite option to generate improved language instantly. You are now ready to use Smart Charter.',
    position: 'top'
  }
];

export default function Walkthrough() {
  const [currentStep, setCurrentStep] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [targetFound, setTargetFound] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updateCoords = () => {
    if (currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      if (step.targetId) {
        const el = document.getElementById(step.targetId);
        if (el) {
          const rect = el.getBoundingClientRect();
          setCoords({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          });
          setTargetFound(true);
        } else {
          setTargetFound(false);
          setCoords({ top: 0, left: 0, width: 0, height: 0 });
        }
      } else {
        setTargetFound(false);
        setCoords({ top: 0, left: 0, width: 0, height: 0 });
      }
    }
  };

  useEffect(() => {
    if (!isVisible) return;
    
    // Initial update
    updateCoords();

    // Resize observer for dynamic layout changes
    const observer = new ResizeObserver(() => {
      updateCoords();
    });

    observer.observe(document.body);
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [currentStep, isVisible]);

  useEffect(() => {
    const handler = () => {
      setIsVisible(true);
      setCurrentStep(0);
    };
    window.addEventListener('smart-charter-start-walkthrough', handler);

    // Prompt user to start walkthrough on first visit
    const lastSession = localStorage.getItem('walkthrough-completed');
    if (!lastSession) {
      const timer = setTimeout(handler, 2000);
      return () => clearTimeout(timer);
    }
    
    return () => {
      window.removeEventListener('smart-charter-start-walkthrough', handler);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape') {
        finish();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, currentStep, dontShowAgainChecked]); // Include state dependencies for latest handlers

  useEffect(() => {
    if (currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      
      // Handle Speech
      if (!isMuted) {
        window.speechSynthesis.cancel();
        
        // Small delay to ensure synthesis is ready
        const speakTimer = setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(step.audioText);
          
          // Get all voices
          const voices = window.speechSynthesis.getVoices();
          
          // Filter for English voices first
          const enVoices = voices.filter(v => v.lang.startsWith('en-'));
          
          // Professional Hierarchy: 
          // 1. Specific premium "Natural" voices (Microsoft, Google, Apple)
          // 2. High-quality female personas
          // 3. Fallbacks
          const preferredVoice = enVoices.find(v => 
            (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural') || v.name.toLowerCase().includes('online')) && 
            (v.name.toLowerCase().includes('female') || v.name.includes('Aria') || v.name.includes('Jenny') || v.name.includes('Google US English'))
          ) || enVoices.find(v => 
            v.name.toLowerCase().includes('female') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Moira') || v.name.includes('Victoria')
          ) || enVoices.find(v => v.lang === 'en-US') || enVoices[0] || voices[0];
          
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }

          // Professional tone adjustment
          utterance.rate = 1.09; // Fine-tuned pace for optimal balance
          utterance.pitch = 1.05; // Slightly higher for a more pleasant, helpful tone
          speechRef.current = utterance;
          window.speechSynthesis.speak(utterance);
        }, 100);

        return () => clearTimeout(speakTimer);
      } else {
        window.speechSynthesis.cancel();
      }
    }
  }, [currentStep, isMuted]);

  // Handle voices loading (they are async)
  useEffect(() => {
    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices();
    };
    
    // Initial call
    handleVoicesChanged();
    
    // Some browsers need this event
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    }

    return () => {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      if (dontShowAgainChecked) {
        localStorage.setItem('walkthrough-completed', 'true');
      }
      finish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const finish = () => {
    setIsVisible(false);
    window.speechSynthesis.cancel();
  };

  if (!isVisible || currentStep < 0) return null;

  const currentStepData = steps[currentStep];
  if (!currentStepData) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden pointer-events-none">
      {/* Dynamic Cutout Overlay */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="walkthrough-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {currentStepData?.targetId && targetFound && coords.width > 0 && (
              <motion.rect 
                animate={{
                  x: coords.left - 8,
                  y: coords.top - 8,
                  width: coords.width + 16,
                  height: coords.height + 16,
                }}
                rx="16" 
                fill="black" 
                transition={{ type: 'spring', damping: 25, stiffness: 120 }}
              />
            )}
          </mask>
        </defs>
        <rect 
          x="0" 
          y="0" 
          width="100%" 
          height="100%" 
          fill="rgba(0,0,0,0.7)" 
          mask="url(#walkthrough-mask)" 
          className="pointer-events-auto cursor-pointer"
          onClick={finish} 
        />
      </svg>

      {/* Spotlight Border & Glow */}
      {currentStepData?.targetId && targetFound && (
        <motion.div 
          animate={{
            top: coords.top - 8,
            left: coords.left - 8,
            width: coords.width + 16,
            height: coords.height + 16,
          }}
          className="absolute border-2 border-secondary shadow-[0_0_60px_rgba(226,255,111,0.4)] rounded-2xl pointer-events-none z-10"
          transition={{ type: 'spring', damping: 25, stiffness: 120 }}
        />
      )}

      {/* Tooltip Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={`absolute pointer-events-auto w-[380px] bg-[#1A1A1A] border border-white/10 rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 z-[110]
            ${currentStepData.position === 'center' || !targetFound ? 'relative' : ''}
          `}
          style={(() => {
            if (currentStepData.position === 'center' || !targetFound) return {};
            
            const gap = 24;
            const tooltipWidth = 380;
            const tooltipHeight = 310; // Approximated

            
            let top = 0;
            let left = 0;

            if (currentStepData.position === 'right') {
              top = coords.top;
              left = coords.left + coords.width + gap;
            } else if (currentStepData.position === 'left') {
              top = coords.top;
              left = coords.left - tooltipWidth - gap;
            } else if (currentStepData.position === 'bottom') {
              top = coords.top + coords.height + gap;
              left = coords.left + (coords.width / 2) - (tooltipWidth / 2);
            } else if (currentStepData.position === 'top') {
              top = coords.top - tooltipHeight - gap;
              left = coords.left + (coords.width / 2) - (tooltipWidth / 2);
            }

            // Clamping
            top = Math.max(20, Math.min(top, window.innerHeight - tooltipHeight - 20));
            left = Math.max(20, Math.min(left, window.innerWidth - tooltipWidth - 20));

            return { top, left };
          })()}
        >
          {/* Step Sequence Bar */}
          <div className="flex items-center overflow-x-auto gap-0 bg-white/[0.03] border-b border-white/5 px-4 py-3">
            {steps.map((step, i) => (
              <React.Fragment key={`seq-${i}`}>
                <button
                  onClick={() => setCurrentStep(i)}
                  className="flex flex-col items-center gap-1 flex-shrink-0 group"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all duration-200 ${
                    i < currentStep
                      ? 'bg-success/20 text-success border border-success/30'
                      : i === currentStep
                      ? 'bg-secondary text-black scale-110 shadow-lg shadow-secondary/30'
                      : 'bg-white/5 text-white/20 border border-white/10'
                  }`}>
                    {i < currentStep ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                </button>
                {i < steps.length - 1 && (
                  <div className={`h-[1px] flex-1 min-w-[6px] mx-0.5 transition-all duration-300 ${
                    i < currentStep ? 'bg-success/40' : 'bg-white/10'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              <span className="text-[10px] font-bold text-white/80 uppercase tracking-[0.2em]">Guided Tour • Step {currentStep + 1} of {steps.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button 
                onClick={finish}
                className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <h3 className="text-lg font-bold text-white mb-2 tracking-tight">{currentStepData.title}</h3>
          <p className="text-xs text-white/90 leading-relaxed font-medium mb-6">
            {currentStepData.content}
          </p>

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <div className="flex flex-col gap-2 items-start">
              <button 
                onClick={() => setDontShowAgainChecked(!dontShowAgainChecked)}
                className="flex items-center gap-2 text-[9px] font-bold text-white/40 hover:text-white/60 uppercase tracking-widest transition-colors"
              >
                {dontShowAgainChecked ? <CheckSquare className="h-3 w-3 text-secondary" /> : <Square className="h-3 w-3" />}
                Don't show again
              </button>
              <span className="text-[9px] font-bold text-white/70 uppercase tracking-widest">
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>
            <div className="flex gap-2">
              {currentStep > 0 && (
                <button 
                  onClick={handlePrev}
                  className="p-2 border border-white/10 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <button 
                onClick={handleNext}
                className="px-5 py-2 bg-secondary text-black text-[10px] font-extrabold uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
