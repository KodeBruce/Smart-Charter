import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MicOff, Wand2, Square, Sparkles, ArrowRight, Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVoice, type VoiceLanguage } from '../contexts/VoiceContext';
import { startSpeechmaticsRealtimeSession, type SpeechmaticsSession, type SpeechmaticsSessionState } from '../lib/speechmaticsRealtime';

type PendingAction = {
  label: string;
  transcript: string;
};

const VOICE_HINTS = [
  'dashboard',
  'projects',
  'compare',
  'risk',
  'strategic hub',
  'upload document',
  'walkthrough',
  'settings',
];

type VoiceLocale = {
  label: string;
  recognitionLanguage: string;
  hint: string;
  commands: {
    dashboard: string[];
    projects: string[];
    compare: string[];
    risk: string[];
    strategic: string[];
    settings: string[];
    upload: string[];
    walkthrough: string[];
    cancel: string[];
    confirm: string[];
  };
  noMatch: string;
  cancelPrompt: string;
  confirmPrompt: string;
  readyTranscript: string;
};

const VOICE_LOCALES: Record<VoiceLanguage, VoiceLocale> = {
  en: {
    label: 'English',
    recognitionLanguage: 'en',
    hint: 'Say: go to dashboard, open projects, upload document.',
    commands: {
      dashboard: ['dashboard', 'home', 'go to dashboard'],
      projects: ['projects', 'portfolio', 'library', 'go to projects'],
      compare: ['compare', 'comparison', 'go to compare'],
      risk: ['risk', 'playbook', 'go to risk playbook'],
      strategic: ['strategic', 'hub', 'go to strategic hub'],
      settings: ['settings', 'open settings'],
      upload: ['upload', 'new contract', 'new document', 'upload document'],
      walkthrough: ['walkthrough', 'tour', 'guide', 'start walkthrough'],
      cancel: ['cancel', 'abort', 'stop', 'never mind', 'nevermind'],
      confirm: ['confirm', 'confirm it', 'proceed', 'yes', 'do it', 'execute'],
    },
    noMatch: 'I heard you. Try dashboard, projects, compare, or upload document.',
    cancelPrompt: 'Cancelled.',
    confirmPrompt: 'A confirmation is pending. Say confirm or cancel.',
    readyTranscript: 'Say dashboard, projects, compare, upload document, or walkthrough.',
  },
  es: {
    label: 'Español',
    recognitionLanguage: 'es',
    hint: 'Di: ir al panel, abrir proyectos, subir documento.',
    commands: {
      dashboard: ['panel', 'inicio', 'ir al panel', 'ir al tablero'],
      projects: ['proyectos', 'cartera', 'biblioteca', 'ir a proyectos'],
      compare: ['comparar', 'comparación', 'ir a comparar'],
      risk: ['riesgo', 'guía de riesgo', 'abrir guía de riesgo'],
      strategic: ['estratégico', 'centro', 'abrir centro estratégico'],
      settings: ['configuración', 'ajustes', 'abrir configuración'],
      upload: ['subir', 'nuevo contrato', 'nuevo documento', 'subir documento'],
      walkthrough: ['recorrido', 'tour', 'guía', 'iniciar recorrido'],
      cancel: ['cancelar', 'abortar', 'detener', 'olvida eso'],
      confirm: ['confirmar', 'continúa', 'sí', 'hazlo', 'ejecutar'],
    },
    noMatch: 'Te escuché. Prueba panel, proyectos, comparar o subir documento.',
    cancelPrompt: 'Cancelado.',
    confirmPrompt: 'Hay una confirmación pendiente. Di confirmar o cancelar.',
    readyTranscript: 'Di panel, proyectos, comparar, subir documento o recorrido.',
  },
};

function normalizeTranscript(transcript: string) {
  return transcript
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function speak(text: string, lang = 'en-US', voiceName?: string, rate = 1.02, pitch = 1.0) {
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = lang;
    if (voiceName) {
      try {
        const voices = window.speechSynthesis.getVoices() || [];
        const match = voices.find(v => v.name === voiceName || v.voiceURI === voiceName);
        if (match) utterance.voice = match;
      } catch {}
    }
    window.speechSynthesis.speak(utterance);
  } catch {}
}

export default function SpeechmaticsAssistant() {
  const navigate = useNavigate();
  const { isListening, setIsListening, toggleVoice, voiceLanguage, setVoiceLanguage } = useVoice();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [status, setStatus] = useState<SpeechmaticsSessionState>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [lastAction, setLastAction] = useState<string>('Ready for voice commands');
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const sessionRef = useRef<SpeechmaticsSession | null>(null);
  const pendingTimeoutRef = useRef<number | null>(null);
  const lastFinalAtRef = useRef(0);

  const region = useMemo(() => (import.meta.env.VITE_SPEECHMATICS_REGION || 'eu').toLowerCase(), []);
  const locale = VOICE_LOCALES[voiceLanguage];

  // Prevent audio TTS from echoing into the mic while a live session is active.
  const pendingTTSRef = useRef<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(() => {
    try { return localStorage.getItem('speechVoice'); } catch { return null; }
  });
  const [speechRate, setSpeechRate] = useState<number>(() => {
    try { return Number(localStorage.getItem('speechVoiceRate') || '1.02'); } catch { return 1.02; }
  });
  const [speechPitch, setSpeechPitch] = useState<number>(() => {
    try { return Number(localStorage.getItem('speechVoicePitch') || '1.0'); } catch { return 1.0; }
  });

  useEffect(() => {
    const load = () => {
      try {
        const v = window.speechSynthesis.getVoices() || [];
        setAvailableVoices(v);
        if (!selectedVoice && v.length) {
          // auto-select a preferred natural voice when possible
          const prefer = v.find(x => /neural|google|premium|samantha|alloy|zira|microsoft|amazon|elastic/i.test(x.name));
          setSelectedVoice(prefer ? prefer.name : v[0].name);
        }
      } catch {
        setAvailableVoices([]);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { try { if (selectedVoice) localStorage.setItem('speechVoice', selectedVoice); } catch {} }, [selectedVoice]);
  useEffect(() => { try { localStorage.setItem('speechVoiceRate', String(speechRate)); } catch {} }, [speechRate]);
  useEffect(() => { try { localStorage.setItem('speechVoicePitch', String(speechPitch)); } catch {} }, [speechPitch]);
  const safeSpeak = (text: string, lang = locale.recognitionLanguage) => {
    // If we have a live session with mute control, mute the session while speaking
    const sess = sessionRef.current as (SpeechmaticsSession & { setMuted?: (m: boolean) => void }) | null;
    if (sess?.setMuted && (isListening || status === 'listening')) {
      try {
        sess.setMuted(true);
      } catch {}
      // create utterance and unmute on end
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;
        utterance.lang = lang;
        if (selectedVoice) {
          const match = window.speechSynthesis.getVoices().find(v => v.name === selectedVoice || v.voiceURI === selectedVoice);
          if (match) utterance.voice = match;
        }
        utterance.onend = () => {
          try { sess.setMuted(false); } catch {}
        };
        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        try { sess.setMuted(false); } catch {}
      }
    }

    // Fallback: queue the utterance if no mute control is available
    if (isListening || status === 'listening') {
      pendingTTSRef.current = text;
      return;
    }
    speak(text, lang);
  };

  useEffect(() => {
    if (status === 'idle' && pendingTTSRef.current) {
      // play queued TTS once session is finished using selected voice settings
      speak(pendingTTSRef.current, locale.recognitionLanguage, selectedVoice ?? undefined, speechRate, speechPitch);
      pendingTTSRef.current = null;
    }
  }, [status, locale.recognitionLanguage, selectedVoice, speechRate, speechPitch]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem('speechmaticsAssistantPos');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const resetLauncherPosition = () => {
    setPosition(null);
    try {
      localStorage.removeItem('speechmaticsAssistantPos');
    } catch {}
  };

  useEffect(() => {
    return () => {
      // cleanup any global listeners
      window.removeEventListener('pointermove', onPointerMove as any);
      window.removeEventListener('pointerup', onPointerUp as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clampPosition = (x: number, y: number, rect: DOMRect) => {
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
  };

  function onPointerMove(e: PointerEvent) {
    if (!draggingRef.current) return;
    const last = lastPointerRef.current;
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const prevX = position?.x ?? rect.left;
    const prevY = position?.y ?? rect.top;
    const next = clampPosition(prevX + dx, prevY + dy, rect);
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setPosition(next);
  }

  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    lastPointerRef.current = null;
    window.removeEventListener('pointermove', onPointerMove as any);
    window.removeEventListener('pointerup', onPointerUp as any);
    if (position) {
      try {
        localStorage.setItem('speechmaticsAssistantPos', JSON.stringify(position));
      } catch {}
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // only left mouse or touch
    if (e.button && e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // initialize position if not set
    if (!position) {
      setPosition({ x: rect.left, y: rect.top });
    }
    draggingRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    window.addEventListener('pointermove', onPointerMove as any);
    window.addEventListener('pointerup', onPointerUp as any);
    (e.target as Element).setPointerCapture?.((e as any).pointerId);
  };

  const clearPendingAction = () => {
    if (pendingTimeoutRef.current) {
      window.clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
    setPendingAction(null);
  };

  const stopSession = async () => {
    if (pendingTimeoutRef.current) {
      window.clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }

    await sessionRef.current?.stop();
    sessionRef.current = null;
    setPartialTranscript('');
    setStatus('idle');
  };

  const executeCommand = (transcript: string) => {
    const cmd = transcript.toLowerCase().trim();
    const normalizedCmd = normalizeTranscript(transcript);
    if (!cmd) return;

    setFinalTranscript(transcript);
    setLastAction(`Heard: ${transcript}`);

    const isCancel = locale.commands.cancel.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase))) || /\b(cancel|abort|stop)\b/i.test(cmd);
    const isConfirm = locale.commands.confirm.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase))) || /\b(confirm|proceed|yes|execute)\b/i.test(cmd);

    if (isCancel) {
      clearPendingAction();
      safeSpeak(locale.cancelPrompt, locale.recognitionLanguage);
      setLastAction('Command cancelled');
      return;
    }

    if (pendingAction) {
      if (isConfirm) {
        setLastAction(`Confirmed: ${pendingAction.label}`);
        safeSpeak(
          voiceLanguage === 'es'
            ? `Confirmado. ${pendingAction.label} continuará.`
            : `Confirmed. ${pendingAction.label} will proceed.`,
          locale.recognitionLanguage,
        );
        window.dispatchEvent(new CustomEvent('smart-charter-voice-action-confirmed', {
          detail: { transcript: pendingAction.transcript },
        }));
        clearPendingAction();
        return;
      }

      speak(locale.confirmPrompt, locale.recognitionLanguage);
      return;
    }

    if (locale.commands.dashboard.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase)))) {
      safeSpeak(voiceLanguage === 'es' ? 'Abriendo tu panel.' : 'Opening your dashboard.', locale.recognitionLanguage);
      navigate('/');
      setLastAction('Navigated to dashboard');
      return;
    }

    if (locale.commands.projects.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase)))) {
      safeSpeak(voiceLanguage === 'es' ? 'Abriendo tus proyectos.' : 'Opening your projects workspace.', locale.recognitionLanguage);
      navigate('/projects');
      setLastAction('Navigated to projects');
      return;
    }

    if (locale.commands.compare.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase)))) {
      safeSpeak(voiceLanguage === 'es' ? 'Abriendo comparación.' : 'Opening comparison mode.', locale.recognitionLanguage);
      navigate('/compare');
      setLastAction('Navigated to compare');
      return;
    }

    if (locale.commands.risk.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase)))) {
      safeSpeak(voiceLanguage === 'es' ? 'Abriendo la guía de riesgo.' : 'Opening the risk playbook.', locale.recognitionLanguage);
      navigate('/risk');
      setLastAction('Navigated to risk playbook');
      return;
    }

    if (locale.commands.strategic.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase)))) {
      safeSpeak(voiceLanguage === 'es' ? 'Abriendo el centro estratégico.' : 'Opening the strategic hub.', locale.recognitionLanguage);
      navigate('/strategic-hub');
      setLastAction('Navigated to strategic hub');
      return;
    }

    if (locale.commands.settings.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase)))) {
      safeSpeak(voiceLanguage === 'es' ? 'Abriendo configuración.' : 'Opening settings.', locale.recognitionLanguage);
      navigate('/settings');
      setLastAction('Navigated to settings');
      return;
    }

    if (locale.commands.upload.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase)))) {
      safeSpeak(voiceLanguage === 'es' ? 'Abriendo carga de documentos.' : 'Opening upload.', locale.recognitionLanguage);
      window.dispatchEvent(new CustomEvent('smart-charter-open-upload'));
      setLastAction('Opened upload modal');
      return;
    }

    if (locale.commands.walkthrough.some(phrase => normalizedCmd.includes(normalizeTranscript(phrase)))) {
      safeSpeak(voiceLanguage === 'es' ? 'Iniciando el recorrido.' : 'Starting the walkthrough.', locale.recognitionLanguage);
      window.dispatchEvent(new CustomEvent('smart-charter-start-walkthrough'));
      setLastAction('Started walkthrough');
      return;
    }

    if (/(delete|remove|clear|reset|wipe|purge|erase|borrar|eliminar|limpiar|reiniciar)\b/i.test(cmd)) {
      setPendingAction({ label: 'Destructive action detected', transcript });
      setLastAction('Awaiting confirmation');
      safeSpeak(
        voiceLanguage === 'es'
          ? 'Acción destructiva detectada. Di confirmar o cancelar.'
          : 'Destructive action detected. Say confirm or cancel.',
        locale.recognitionLanguage,
      );

      pendingTimeoutRef.current = window.setTimeout(() => {
        clearPendingAction();
        safeSpeak(
          voiceLanguage === 'es'
            ? 'El tiempo de confirmación expiró. Comando cancelado.'
            : 'Confirmation timed out. Command cancelled.',
          locale.recognitionLanguage,
        );
      }, 12000);
      return;
    }

    setLastAction('No matching command');
    safeSpeak(locale.noMatch, locale.recognitionLanguage);
  };

  const startSession = async () => {
    if (sessionRef.current) return;

    setError(null);
    setPartialTranscript('');
    setLastAction('Connecting to Speechmatics...');
    setStatus('connecting');

    try {
      sessionRef.current = await startSpeechmaticsRealtimeSession({
        region,
        language: locale.recognitionLanguage,
        onStatus: (nextStatus) => {
          if (nextStatus === 'error') {
            setStatus('error');
          } else if (nextStatus === 'listening') {
            setStatus('listening');
          } else if (nextStatus === 'idle') {
            setStatus('idle');
          } else if (nextStatus === 'stopping') {
            setStatus('stopping');
          }
        },
        onPartialTranscript: (transcript) => {
          setPartialTranscript(transcript);
          setStatus('listening');
        },
        onFinalTranscript: (transcript) => {
          const now = Date.now();
          if (now - lastFinalAtRef.current < 600 && transcript === finalTranscript) return;
          lastFinalAtRef.current = now;
          setPartialTranscript('');
          executeCommand(transcript);
        },
        onError: (err) => {
          setError(err.message);
          setStatus('error');
          setIsListening(false);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start Speechmatics';
      setError(message);
      setStatus('error');
      setIsListening(false);
    }
  };

  useEffect(() => {
    if (isListening) {
      setIsPanelOpen(true);
    }

    if (isListening) {
      void startSession();
      return;
    }

    void stopSession();
  }, [isListening, voiceLanguage, locale.recognitionLanguage]);

  useEffect(() => {
    const toggleHandler = () => toggleVoice();
    const simulateHandler = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      if (!text) return;
      executeCommand(text);
    };

    window.addEventListener('toggle-voice-control', toggleHandler);
    window.addEventListener('smart-charter-voice-simulate', simulateHandler);

    return () => {
      window.removeEventListener('toggle-voice-control', toggleHandler);
      window.removeEventListener('smart-charter-voice-simulate', simulateHandler);
    };
  }, [toggleVoice, pendingAction, finalTranscript]);

  useEffect(() => {
    return () => {
      void stopSession();
    };
  }, []);

  const statusLabel =
    status === 'connecting' ? 'Connecting Speechmatics' :
    status === 'listening' ? 'Listening with Speechmatics' :
    status === 'stopping' ? 'Stopping' :
    status === 'error' ? 'Voice error' :
    'Voice idle';

  const hasPosition = position !== null;
  const wrapperStyle: React.CSSProperties | undefined = hasPosition
    ? { left: position!.x, top: position!.y }
    : undefined;

  return (
    <div
      ref={containerRef}
      style={wrapperStyle}
      className={hasPosition ? 'fixed z-[60] pointer-events-auto max-w-[92vw]' : 'fixed bottom-6 right-6 z-[60] pointer-events-auto max-w-[92vw]'}
    >
      <button
        type="button"
        onClick={() => setIsPanelOpen(true)}
        className="pointer-events-auto mb-3 inline-flex w-full items-center justify-between gap-3 rounded-full border border-secondary/25 bg-surface/95 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface/80 shadow-xl shadow-black/10 hover:bg-surface transition-colors"
        aria-label="Open Speechmatics voice assistant"
      >
        <span className="flex items-center gap-2 truncate">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary/12 text-secondary">
            <MicOff className="h-3.5 w-3.5" />
          </span>
          Speechmatics
        </span>
        <span className="shrink-0 rounded-full border border-outline/40 px-2 py-1 text-[9px] tracking-[0.2em] text-on-surface/45">
          Open
        </span>
      </button>

      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="pointer-events-auto w-[360px] max-w-[92vw] rounded-[28px] border border-white/10 bg-[#0B0B0D]/90 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden"
          >
              <div
                className="flex items-center justify-between px-4 py-3 border-b border-white/10"
                onPointerDown={onPointerDown}
                style={{ touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
              >
              <div>
                <div className="flex items-center gap-2 text-white">
                  <Sparkles className="h-3.5 w-3.5 text-secondary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.28em]">Speechmatics Live</span>
                </div>
                <p className="text-[10px] text-white/45 mt-1">{statusLabel} · {locale.label}</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-full border border-white/10 overflow-hidden">
                  <button
                    onClick={() => setVoiceLanguage('en')}
                    className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${voiceLanguage === 'en' ? 'bg-white/10 text-secondary' : 'text-white/50 hover:text-white'}`}
                    aria-label="Switch voice language to English"
                  >
                    EN
                  </button>
                  <button
                    onClick={() => setVoiceLanguage('es')}
                    className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] transition-colors border-l border-white/10 ${voiceLanguage === 'es' ? 'bg-white/10 text-secondary' : 'text-white/50 hover:text-white'}`}
                    aria-label="Switch voice language to Spanish"
                  >
                    ES
                  </button>
                </div>

                <button
                  onClick={() => {
                    setIsListening(false);
                    setIsPanelOpen(false);
                  }}
                  className="h-8 w-8 rounded-full border border-white/10 text-white/70 hover:text-white hover:border-secondary/40 hover:bg-secondary/10 flex items-center justify-center transition-colors"
                  aria-label="Close voice assistant"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="px-4 py-4 space-y-3">
              {!isListening && (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Mic is off</p>
                    <p className="text-[10px] text-white/35 mt-1 truncate">Open the panel, then start microphone access.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsListening(true)}
                    className="shrink-0 rounded-full border border-secondary/25 bg-secondary/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-secondary hover:bg-secondary/15 transition-colors"
                  >
                    Start Mic
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.25em] text-white/35">
                <Wand2 className="h-3 w-3 text-secondary" />
                Speechmatics is shaping the transcript in real time
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2">
                <label className="text-[10px] text-white/45">Voice</label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedVoice ?? ''}
                    onChange={(e) => setSelectedVoice(e.target.value || null)}
                    className="flex-1 rounded px-2 py-1 bg-surface/90 border border-white/10 text-white/90"
                  >
                    {availableVoices.length === 0 && <option value="">(No voices available)</option>}
                    {availableVoices.map(v => (
                      <option key={v.name} value={v.name}>{v.name} — {v.lang}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      // preview
                      speak('This is a voice preview.', locale.recognitionLanguage, selectedVoice ?? undefined, speechRate, speechPitch);
                    }}
                    className="rounded px-2 py-1 bg-secondary/10 border border-secondary/20 text-secondary text-[10px]"
                  >Preview</button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-white/45">Rate</label>
                  <input type="range" min="0.5" max="1.6" step="0.05" value={speechRate} onChange={e => setSpeechRate(Number(e.target.value))} />
                  <span className="text-[10px] text-white/40">{speechRate.toFixed(2)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-white/45">Pitch</label>
                  <input type="range" min="0.6" max="1.6" step="0.05" value={speechPitch} onChange={e => setSpeechPitch(Number(e.target.value))} />
                  <span className="text-[10px] text-white/40">{speechPitch.toFixed(2)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 min-h-[76px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2">Live Transcript</p>
                <p className="text-[13px] leading-relaxed text-white/90">
                  {partialTranscript || locale.readyTranscript}
                </p>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-white/45">
                <ArrowRight className="h-3 w-3 text-secondary" />
                <span className="truncate">{lastAction}</span>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-200">
                  {error}
                </div>
              )}

              {pendingAction && (
                <div className="rounded-2xl border border-secondary/20 bg-secondary/10 px-3 py-2 text-[10px] text-secondary-content">
                  Confirmation pending. Say confirm or cancel.
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {VOICE_HINTS.map((hint) => (
                  <span
                    key={hint}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/45"
                  >
                    {hint}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[9px] uppercase tracking-[0.22em] text-on-surface/35">Drag the header to move</p>
        <button
          type="button"
          onClick={resetLauncherPosition}
          className="rounded-full border border-outline/30 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-on-surface/45 hover:text-on-surface/70 hover:border-outline/50 transition-colors"
          aria-label="Reset Speechmatics position"
        >
          Reset
        </button>
      </div>
    </div>
  );
}