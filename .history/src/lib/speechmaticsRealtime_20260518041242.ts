import { auth } from './firebase';

export type SpeechmaticsSessionState = 'idle' | 'connecting' | 'listening' | 'stopping' | 'error';

export interface SpeechmaticsSessionOptions {
  region?: string;
  language?: string;
  onPartialTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onStatus?: (status: SpeechmaticsSessionState | string) => void;
  onError?: (error: Error) => void;
}

export interface SpeechmaticsSession {
  stop: () => Promise<void>;
  getState: () => SpeechmaticsSessionState;
  setMuted?: (muted: boolean) => void;
}

type TokenResponse = {
  key_value?: string;
  token?: string;
  region?: string;
};

const DEFAULT_REGION = (import.meta.env.VITE_SPEECHMATICS_REGION || 'eu').toLowerCase();
const DEFAULT_LANGUAGE = import.meta.env.VITE_SPEECHMATICS_LANGUAGE || 'en';

function resolveToken(payload: TokenResponse): string {
  return payload.key_value || payload.token || '';
}

async function fetchRealtimeToken(): Promise<TokenResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in to use Speechmatics voice commands.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/speechmatics/realtime-token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl: 300 }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Speechmatics token request failed (${response.status})`);
  }

  return response.json();
}

export async function startSpeechmaticsRealtimeSession(
  options: SpeechmaticsSessionOptions,
): Promise<SpeechmaticsSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.');
  }

  const tokenResponse = await fetchRealtimeToken();
  const region = (options.region || tokenResponse.region || DEFAULT_REGION).toLowerCase();
  const token = resolveToken(tokenResponse);

  if (!token) {
    throw new Error('Speechmatics returned an empty realtime token.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext();
  await audioContext.resume();

  const ws = new WebSocket(`wss://${region}.rt.speechmatics.com/v2?jwt=${encodeURIComponent(token)}`);
  ws.binaryType = 'arraybuffer';

  let state: SpeechmaticsSessionState = 'connecting';
  let started = false;
  let stopped = false;
  let sendEnabled = true; // controls whether audio chunks are forwarded to websocket
  let sequenceNo = 0;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let gainNode: GainNode | null = null;

  const cleanup = () => {
    processorNode?.disconnect();
    sourceNode?.disconnect();
    gainNode?.disconnect();
    stream.getTracks().forEach(track => track.stop());
    if (audioContext.state !== 'closed') {
      void audioContext.close().catch(() => {});
    }
  };

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    state = 'stopping';
    options.onStatus?.('stopping');

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: sequenceNo }));
      }
    } catch {}

    setTimeout(() => {
      try {
        ws.close();
      } catch {}
      cleanup();
    }, 120);
  };

  const startMicStream = () => {
    sourceNode = audioContext.createMediaStreamSource(stream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    gainNode = audioContext.createGain();
    gainNode.gain.value = 0;

    processorNode.onaudioprocess = (event) => {
      if (!started || ws.readyState !== WebSocket.OPEN) return;

      if (!sendEnabled) return; // drop audio while muted

      const chunk = event.inputBuffer.getChannelData(0);
      const binaryChunk = new Float32Array(chunk.length);
      binaryChunk.set(chunk);
      sequenceNo += 1;

      try {
        ws.send(binaryChunk.buffer);
      } catch (error) {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    };

    sourceNode.connect(processorNode);
    processorNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
  };

  ws.onopen = () => {
    state = 'connecting';
    options.onStatus?.('connecting');

    ws.send(JSON.stringify({
      message: 'StartRecognition',
      audio_format: {
        type: 'raw',
        encoding: 'pcm_f32le',
        sample_rate: audioContext.sampleRate,
      },
      transcription_config: {
        language: options.language || DEFAULT_LANGUAGE,
        operating_point: 'enhanced',
        max_delay: 0.7,
        max_delay_mode: 'flexible',
        enable_partials: true,
        transcript_filtering_config: {
          remove_disfluencies: true,
        },
        conversation_config: {
          end_of_utterance_silence_trigger: 0.5,
        },
      },
    }));
  };

  ws.onmessage = async (event) => {
    let payload: any;

    try {
      payload = typeof event.data === 'string'
        ? JSON.parse(event.data)
        : JSON.parse(new TextDecoder().decode(event.data));
    } catch {
      return;
    }

    switch (payload.message) {
      case 'RecognitionStarted':
        if (!started) {
          started = true;
          state = 'listening';
          options.onStatus?.('listening');
          startMicStream();
        }
        break;
      case 'AddPartialTranscript':
        options.onPartialTranscript?.(payload.metadata?.transcript?.trim() || '');
        break;
      case 'AddTranscript':
        options.onFinalTranscript?.(payload.metadata?.transcript?.trim() || '');
        break;
      case 'EndOfTranscript':
        state = 'idle';
        options.onStatus?.('idle');
        break;
      case 'Warning':
        options.onStatus?.(`warning:${payload.type || 'speechmatics'}`);
        break;
      case 'Error':
        state = 'error';
        options.onStatus?.('error');
        options.onError?.(new Error(payload.reason || payload.type || 'Speechmatics error'));
        await stop();
        break;
      default:
        break;
    }
  };

  ws.onerror = () => {
    state = 'error';
    options.onStatus?.('error');
    options.onError?.(new Error('Speechmatics websocket error'));
  };

  ws.onclose = () => {
    cleanup();
    if (!stopped) {
      state = 'idle';
      options.onStatus?.('idle');
    }
  };

  return {
    stop,
    getState: () => state,
    setMuted: (muted: boolean) => {
      sendEnabled = !muted;
    },
  };
}