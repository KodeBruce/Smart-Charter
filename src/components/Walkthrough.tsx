import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Volume2, VolumeX, Sparkles, AlertCircle } from 'lucide-react';

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
    title: 'Hi there! Welcome to Smart Charter.',
    content: 'Think of me as your legal AI partner. I’m here to help you scan through contracts, find those hidden risks, and keep track of everything so nothing slips through the cracks.',
    audioText: 'Hi there! Welcome to Smart Charter. Think of me as your legal AI partner. I am here to help you scan through contracts, find those hidden risks, and keep track of everything so nothing slips through the cracks. Let’s take a quick look around.',
    position: 'center'
  },
  {
    id: 'ingest',
    targetId: 'walkthrough-ingest',
    title: 'Let\'s get your documents in.',
    content: 'Just drop your contracts here. I\'ll read through them in seconds, highlighting the important bits and pointing out any potential red flags you should know about.',
    audioText: 'Getting your documents into the system is easy. Just drop your contracts here and I will read through them in seconds, highlighting the important bits and pointing out any potential red flags you should know about.',
    position: 'right'
  },
  {
    id: 'projects',
    targetId: 'walkthrough-projects',
    title: 'Keep things organized.',
    content: 'Whether it\'s a big deal or a new batch of agreements, you can group your work into Workspaces. I can even help you draft new terms tailored to your specific country.',
    audioText: 'Keep your work organized with Workspaces. Whether it is a big deal or a new batch of vendor agreements, you can group everything here. I can even help you draft new terms that are legally sound for your specific country.',
    position: 'right'
  },
  {
    id: 'repository',
    targetId: 'walkthrough-repository',
    title: 'Your bird\'s-eye view.',
    content: 'This is where all your signed documents live. I\'ll keep an eye on expiry dates and alert you when something is coming up for renewal soon.',
    audioText: 'This repository gives you a bird\'s-eye view of every signed document. I will keep an eye on expiry dates for you and send an alert when something is coming up for renewal, so you are never caught off guard.',
    position: 'right'
  },
  {
    id: 'risk',
    targetId: 'walkthrough-risk',
    title: 'Review with confidence.',
    content: 'We use playbooks to make sure every contract meets your standards. You can use our pre-built ones or I can help you build one that fits your business perfectly.',
    audioText: 'You can review every contract with confidence using our playbooks. They make sure everything meets your standards. You can use our pre-built ones, or we can work together to build a custom one that fits your business perfectly.',
    position: 'right'
  },
  {
    id: 'extraction',
    targetId: 'walkthrough-extraction',
    title: 'Explore the details.',
    content: 'When you want to get into the weeds, I’ll show you a full timeline of the contract, how it\'s performing, and specific legal citations for any high-risk clauses.',
    audioText: 'And finally, when you need to get into the weeds, I will show you a full timeline of the contract, how it is performing, and give you specific legal citations for any high-risk clauses. Ready to get started?',
    position: 'top'
  }
];

export default function Walkthrough() {
  const [currentStep, setCurrentStep] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const handler = () => {
      setIsVisible(true);
      setCurrentStep(0);
    };
    window.addEventListener('smart-charter-start-walkthrough', handler);

    // Always start walkthrough after a short delay for better UX
    const timer = setTimeout(handler, 1500);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('smart-charter-start-walkthrough', handler);
    };
  }, []);

  useEffect(() => {
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
        }
      }
      
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
          
          // Prioritize higher quality/natural voices and specifically female ones
          const preferredVoice = enVoices.find(v => 
            (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('premium') || v.name.toLowerCase().includes('enhanced')) && 
            (v.name.toLowerCase().includes('female') || v.name.includes('Google') || v.name.includes('Samantha'))
          ) || enVoices.find(v => 
            v.name.toLowerCase().includes('female') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Moira')
          ) || enVoices[0] || voices[0];
          
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }

          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          speechRef.current = utterance;
          window.speechSynthesis.speak(utterance);
        }, 100);

        return () => clearTimeout(speakTimer);
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
            {currentStepData?.targetId && coords.width > 0 && (
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
      {currentStepData?.targetId && (
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
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={`absolute pointer-events-auto w-[320px] bg-[#1A1A1A] border border-white/10 rounded-3xl shadow-2xl p-6 transition-all duration-500
            ${currentStepData.position === 'center' ? 'relative' : ''}
          `}
          style={currentStepData.position !== 'center' ? {
            top: currentStepData.position === 'bottom' ? coords.top + coords.height + 24 : 
                 currentStepData.position === 'left' || currentStepData.position === 'right' ? coords.top : undefined,
            bottom: currentStepData.position === 'top' ? window.innerHeight - coords.top + 24 : undefined,
            left: currentStepData.position === 'right' ? coords.left + coords.width + 24 : 
                  currentStepData.position === 'left' ? coords.left - 344 : 
                  currentStepData.position === 'bottom' || currentStepData.position === 'top' ? coords.left + (coords.width / 2) - 160 : coords.left
          } : {}}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-[0.2em]">Guided Tour • Step {currentStep + 1} of {steps.length}</span>
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
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div 
                  key={`step-dot-${i}`} 
                  className={`h-1 rounded-full transition-all duration-300 ${i === currentStep ? 'w-4 bg-secondary' : 'w-1 bg-white/10'}`} 
                />
              ))}
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
