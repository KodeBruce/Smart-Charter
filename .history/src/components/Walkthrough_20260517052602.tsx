import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Volume2, VolumeX, Sparkles, Check, Square, CheckSquare } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';

interface Step {
  id: string;
  targetId?: string;
  title: string;
  content: string;
  audioText: string;
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
  route?: string;
}

const steps: Step[] = [
  {
    id: 'welcome',
    title: 'Meet Smart Charter: Your Legal Intelligence Hub.',
    content: 'Smart Charter is a sophisticated legal intelligence platform designed to automate contract analysis and risk management. It uses advanced AI to identify risks, track obligations, and ensure compliance across your entire portfolio.',
    audioText: 'Welcome to Smart Charter. It’s a pleasure to assist you. I am your legal intelligence partner, a sophisticated engine designed to bring absolute clarity to your contract portfolio. Together, we will navigate risks and master your legal obligations with effortless precision.',
    position: 'center'
  },
  {
    id: 'ingest',
    targetId: 'walkthrough-ingest',
    title: 'Upload. Analyze. Understand.',
    content: 'Drop in any contract — PDF, DOCX, or plain text. The AI engine extracts every clause, scores the risk level, identifies parties, and surfaces obligations in seconds.',
    audioText: 'Simply upload any legal instrument. Our AI will instantly deconstruct the document, extracting vital clauses and scoring risks in real-time. It’s document intelligence, simplified.',
    position: 'right'
  },
  {
    id: 'dashboard',
    targetId: 'walkthrough-dashboard-view',
    title: 'Your Portfolio Snapshot.',
    content: 'Your dashboard provides a high-level view of your contract health. Monitor critical risks, upcoming expiries, and overall portfolio stability at a glance.',
    audioText: 'Your dashboard offers a refined, high-level perspective. Monitor the pulse of your portfolio, track critical expiries, and maintain perfect stability at a glance.',
    position: 'right',
    route: '/'
  },
  {
    id: 'projects',
    targetId: 'walkthrough-projects-view',
    title: 'Project Workspaces.',
    content: 'Organize work into specific Projects for each deal or client. This keeps your intelligence segmented and focused on the relevant legal context.',
    audioText: 'Workspaces allow you to segment your intelligence by client or deal. It’s your organized sanctuary for focused legal analysis and strategic decision-making.',
    position: 'right',
    route: '/projects'
  },
  {
    id: 'redlining',
    targetId: 'walkthrough-compare-library',
    title: 'Document Comparison.',
    content: 'Compare multiple versions of a contract side-by-side. Our AI highlights key differences in jurisdiction, value, and risk, helping you spot critical changes instantly.',
    audioText: 'Our comparison engine is truly transformative. View multiple iterations side-by-side as our AI elegantly highlights shifts in jurisdiction and risk, ensuring you never miss a nuance.',
    position: 'right',
    route: '/compare'
  },
  {
    id: 'risk-framework',
    targetId: 'walkthrough-risk-view',
    title: 'AI Risk Playbooks.',
    content: 'Architect custom review frameworks with AI. Define your own risk thresholds and mandatory clauses to ensure every document meets your institutional standards.',
    audioText: 'Architect your own institutional standards with our AI Risk Playbooks. Define your bespoke thresholds and let the engine enforce your standards across every single agreement.',
    position: 'right',
    route: '/risk'
  },
  {
    id: 'extraction',
    targetId: 'walkthrough-extraction',
    title: 'Deep Clause Intelligence.',
    content: 'Inside any project, you can drill down into individual contracts to see every legal node with risk level, implications, and AI Rewrite options.',
    audioText: 'Deep within each project, you\'ll find absolute clause intelligence. Review implications, assess risks, and use our AI Rewrite to perfect your language. Welcome home to Smart Charter.',
    position: 'right',
    route: '/contract/demo'
  }
];

export default function Walkthrough() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [targetFound, setTargetFound] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Dynamic demo contract resolver
  const [demoContractId, setDemoContractId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDemoContract = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'contracts'),
          where('ownerId', '==', auth.currentUser.uid),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setDemoContractId(snap.docs[0].id);
        } else {
          // Fallback to absolute first contract in db if none owned by user
          const qAll = query(collection(db, 'contracts'), limit(1));
          const snapAll = await getDocs(qAll);
          if (!snapAll.empty) {
            setDemoContractId(snapAll.docs[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load demo contract:", err);
      }
    };
    if (isVisible) {
      fetchDemoContract();
    }
  }, [isVisible]);

  const updateCoordsWithRetries = (retries = 5) => {
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
        } else if (retries > 0) {
          setTimeout(() => updateCoordsWithRetries(retries - 1), 200);
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

  // wrapper so it can be used as an event listener (which passes an Event)
  const updateCoords = (_ev?: Event) => updateCoordsWithRetries();

  useEffect(() => {
    if (!isVisible) return;
    
    updateCoords();

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
    if (isVisible && currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      let targetRoute = step.route;
      
      // Dynamic fallback routing for the extraction step to direct to a real contract!
      if (step.id === 'extraction' && demoContractId) {
        targetRoute = `/contract/${demoContractId}`;
      }

      if (targetRoute && location.pathname !== targetRoute) {
        navigate(targetRoute);
        setTimeout(updateCoords, 500);
      }
    }
  }, [currentStep, isVisible, location.pathname, navigate, demoContractId]);

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
  }, [isVisible, currentStep, dontShowAgainChecked]);

  useEffect(() => {
    if (currentStep >= 0 && currentStep < steps.length) {
      const step = steps[currentStep];
      
      if (!isMuted) {
        window.speechSynthesis.cancel();
        
        const speakTimer = setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(step.audioText);
          const voices = window.speechSynthesis.getVoices();
          const enVoices = voices.filter(v => v.lang.startsWith('en-'));
          const preferredVoice = enVoices.find(v => 
            (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural') || v.name.toLowerCase().includes('online')) && 
            (v.name.includes('Aria') || v.name.includes('Jenny'))
          ) || enVoices.find(v => 
            v.name.includes('Google US English') || v.name.includes('Samantha') || v.name.includes('Victoria')
          ) || enVoices.find(v => 
            v.name.toLowerCase().includes('female')
          ) || enVoices.find(v => v.lang === 'en-US') || enVoices[0] || voices[0];
          
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }

          utterance.rate = 1.02;
          utterance.pitch = 1.0;
          speechRef.current = utterance;
          window.speechSynthesis.speak(utterance);
        }, 100);

        return () => clearTimeout(speakTimer);
      } else {
        window.speechSynthesis.cancel();
      }
    }
  }, [currentStep, isMuted]);

  useEffect(() => {
    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices();
    };
    handleVoicesChanged();
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

  const getTooltipStyle = () => {
    if (currentStepData.position === 'center' || !targetFound) return { style: {}, isCentered: true };
    const gap = 32;
    const tooltipWidth = 380;
    const tooltipHeight = 310;

    const spaceRight = window.innerWidth - (coords.left + coords.width);
    const spaceLeft = coords.left;
    const spaceBottom = window.innerHeight - (coords.top + coords.height);
    const spaceTop = coords.top;

    let preferred = currentStepData.position;
    const isTargetHuge = coords.width > window.innerWidth * 0.8 || coords.height > window.innerHeight * 0.8;
    let preferred: Step['position'] = currentStepData.position;
    if (isTargetHuge) preferred = 'center';
    
    if (preferred === 'right' && spaceRight < tooltipWidth + gap && spaceLeft > spaceRight) preferred = 'left';
    else if (preferred === 'left' && spaceLeft < tooltipWidth + gap && spaceRight > spaceLeft) preferred = 'right';
    else if (preferred === 'bottom' && spaceBottom < tooltipHeight + gap && spaceTop > spaceBottom) preferred = 'top';
    else if (preferred === 'top' && spaceTop < tooltipHeight + gap && spaceBottom > spaceTop) preferred = 'bottom';

    if (preferred === 'center') return { style: {}, isCentered: true };

    let top = 0;
    let left = 0;

    if (preferred === 'right') {
      top = coords.top + (coords.height / 2) - (tooltipHeight / 2);
      left = coords.left + coords.width + gap;
    } else if (preferred === 'left') {
      top = coords.top + (coords.height / 2) - (tooltipHeight / 2);
      left = coords.left - tooltipWidth - gap;
    } else if (preferred === 'bottom') {
      top = coords.top + coords.height + gap;
      left = coords.left + (coords.width / 2) - (tooltipWidth / 2);
    } else if (preferred === 'top') {
      top = coords.top - tooltipHeight - gap;
      left = coords.left + (coords.width / 2) - (tooltipWidth / 2);
    }

    top = Math.max(20, Math.min(top, window.innerHeight - tooltipHeight - 20));
    left = Math.max(20, Math.min(left, window.innerWidth - tooltipWidth - 20));
    return { style: { top, left }, isCentered: false };
  };

  const { style: tooltipStyle, isCentered } = getTooltipStyle();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden pointer-events-none">
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

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={`absolute pointer-events-auto w-[380px] bg-[#1A1A1A] border border-white/10 rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 z-[110]
            ${isCentered ? 'relative' : ''}
          `}
          style={tooltipStyle}
        >
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
