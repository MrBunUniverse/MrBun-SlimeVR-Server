import { useCallback, useEffect, useRef, useState } from 'react';

export type DictationEngine = 'local' | 'cloud';
export type DictationFormat = 'translation_only' | 'bilingual' | 'original_only';
export type DictationActivation = 'ptt' | 'toggle' | 'vad';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export interface DictationSettings {
  engine: DictationEngine;
  groqApiKey: string;
  targetLanguage: string;
  sourceLanguage: string;
  format: DictationFormat;
  activationMode: DictationActivation;
  autoSend: boolean;
  autoSticky: boolean;
  fastMode: boolean;
  stickySeconds: number; // 0 = keep until replaced
  playSound: boolean;
  inputDeviceId: string;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'none', label: 'None (Original Voice)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'en', label: 'English' },
  { code: 'th', label: 'Thai (ไทย)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'zh', label: 'Chinese (中文)' },
  { code: 'id', label: 'Indonesian (Bahasa)' },
  { code: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  { code: 'ru', label: 'Russian (Русский)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'it', label: 'Italian (Italiano)' },
] as const;

const STORAGE_KEY = 'slimevr-dictation-settings-v1';

const WORKLET_PROCESSOR_CODE = `
class SlimeDictationProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      this.port.postMessage(input[0]);
    }
    return true;
  }
}
registerProcessor('slime-dictation-processor', SlimeDictationProcessor);
`;

const WORKLET_DATA_URI =
  'data:text/javascript;base64,' +
  (typeof btoa !== 'undefined'
    ? btoa(WORKLET_PROCESSOR_CODE)
    : Buffer.from(WORKLET_PROCESSOR_CODE).toString('base64'));

export const DEFAULT_DICTATION_SETTINGS: DictationSettings = {
  engine: 'local',
  groqApiKey: '',
  targetLanguage: 'ja',
  sourceLanguage: 'auto',
  format: 'translation_only',
  activationMode: 'toggle',
  autoSend: true,
  autoSticky: false,
  fastMode: false,
  stickySeconds: 8,
  playSound: false,
  inputDeviceId: 'default',
};

export function encodeWav16kMono(
  samples: Float32Array,
  sampleRate: number
): ArrayBuffer {
  let pcmData = samples;
  if (sampleRate !== 16000) {
    const ratio = sampleRate / 16000;
    const newLength = Math.round(samples.length / ratio);
    pcmData = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      pcmData[i] = samples[Math.min(samples.length - 1, Math.round(i * ratio))];
    }
  }

  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + pcmData.length * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt sub-chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, 16000, true); // Sample rate: 16kHz
  view.setUint32(28, 32000, true); // Byte rate (16000 * 1 * 2)
  view.setUint16(32, 2, true); // Block align (1 * 2)
  view.setUint16(34, 16, true); // Bits per sample (16 bits)

  // data sub-chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, pcmData.length * 2, true);

  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

export async function convertBlobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const wavBuffer = encodeWav16kMono(channelData, audioBuffer.sampleRate);
    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } finally {
    try {
      await audioCtx.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Native macOS Apple Silicon Speech Recognition helper (reserved).
 */
export async function transcribeWithNativeSpeech(
  audioBase64: string,
  language: string = 'auto'
) {
  if (window.electronAPI?.transcribeNativeSpeech) {
    return window.electronAPI.transcribeNativeSpeech({
      audioBase64,
      language,
    });
  }
  return { success: false, error: 'Native speech not available' };
}

/**
 * Free instant translation helper using Google Translate endpoint.
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<{ translated: string; detectedSrc?: string }> {
  if (!text || !text.trim() || targetLang === 'none') {
    return { translated: text };
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sourceLang
    )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation failed with status: ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translated = data[0].map((item: any) => item[0]).join('');
      const detectedSrc = data[2] || sourceLang;
      return { translated: translated || text, detectedSrc };
    }

    return { translated: text };
  } catch (err) {
    console.warn('[Dictation] Translation error:', err);
    return { translated: text };
  }
}

/**
 * Formats transcript & translation for in-game VRChat Chatbox.
 */
export function formatDictationMessage(
  original: string,
  translated: string,
  format: DictationFormat,
  srcLang: string = 'auto',
  targetLang: string = 'ja'
): string {
  const orig = original.trim();
  const trans = translated.trim();

  if (!orig && !trans) return '';

  if (format === 'original_only' || targetLang === 'none' || !trans) {
    return orig;
  }

  if (format === 'translation_only') {
    return trans;
  }

  // Bilingual format: [EN] Hello! ➔ [JA] こんにちは！
  const srcTag = srcLang && srcLang !== 'auto' ? srcLang.toUpperCase() : 'VOICE';
  const dstTag = targetLang.toUpperCase();

  if (orig.toLowerCase() === trans.toLowerCase()) {
    return trans;
  }

  return `[${srcTag}] ${orig} ➔ [${dstTag}] ${trans}`;
}

export function useSpeechDictation(
  onSendMessage?: (msg: string) => void,
  onSticky?: (text: string) => void
) {
  const [settings, setSettings] = useState<DictationSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_DICTATION_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_DICTATION_SETTINGS;
  });

  const [availableDevices, setAvailableDevices] = useState<AudioInputDevice[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0 - 100
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [lastSentMessage, setLastSentMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const startupSeqRef = useRef(0);
  const isListeningRef = useRef(false);
  const isProcessingRef = useRef(false);
  const lastLevelUpdateRef = useRef(0);
  const lastSentMessageRef = useRef('');
  const lastSentTimeRef = useRef(0);

  // Raw PCM chunk accumulator
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const hasSpokenInCurrentChunkRef = useRef(false);
  const lastSpeechTimeRef = useRef(0);
  const isSlicingRef = useRef(false);

  const recognitionRef = useRef<any>(null);

  // Keep ref up to date
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Enumerate audio input devices
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`,
        }));
      setAvailableDevices(audioInputs);
    } catch (err) {
      console.warn('[Dictation] Device enumeration error:', err);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Dispatch message to Chatbox
  const handleFinalSpeech = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      setIsProcessing(true);
      setError(null);

      try {
        let trans = clean;
        let detected = 'auto';

        if (settings.targetLanguage !== 'none') {
          const result = await translateText(
            clean,
            settings.targetLanguage,
            settings.sourceLanguage
          );
          trans = result.translated;
          detected = result.detectedSrc || 'auto';
        }

        setFinalTranscript(clean);
        setTranslatedText(trans);

        const formatted = formatDictationMessage(
          clean,
          trans,
          settings.format,
          detected,
          settings.targetLanguage
        );

        // Filter out short Whisper silence/hallucination artifacts
        const stripped = clean.toLowerCase().replace(/[.,!?;:\s]/g, '');
        const SILENCE_HALLUCINATIONS = new Set([
          'you',
          'thankyou',
          'thanksforwatching',
          'subscribe',
          'bye',
          'yeah',
          'yes',
          'theend',
          'mbc',
        ]);
        if (SILENCE_HALLUCINATIONS.has(stripped) && clean.length < 12) {
          return;
        }

        // Deduplicate rapid repeat sends (prevents sending identical message within 4 seconds)
        const now = Date.now();
        if (
          formatted === lastSentMessageRef.current &&
          now - lastSentTimeRef.current < 4000
        ) {
          return;
        }

        if (settings.autoSticky && onSticky) {
          // original on top, translation below (single line if identical)
          const same = clean.toLowerCase() === trans.trim().toLowerCase();
          onSticky(same || settings.targetLanguage === 'none' ? clean : `${clean}\n${trans}`);
        }

        if (settings.autoSend && onSendMessage && formatted) {
          lastSentMessageRef.current = formatted;
          lastSentTimeRef.current = now;
          onSendMessage(formatted);
          setLastSentMessage(formatted);
        }
      } catch (err: any) {
        console.error('[Dictation] Processing error:', err);
        setError(err.message || 'Processing speech failed');
      } finally {
        setIsProcessing(false);
      }
    },
    [settings, onSendMessage, onSticky]
  );

  const fastModeRef = useRef(settings.fastMode);
  fastModeRef.current = settings.fastMode;
  const handleFinalSpeechRef = useRef(handleFinalSpeech);
  handleFinalSpeechRef.current = handleFinalSpeech;

  // Cloud Groq Whisper transcription
  const transcribeWithGroq = useCallback(
    async (audioBlob: Blob) => {
      if (!settings.groqApiKey) {
        setError('Groq API Key required (Click "Get Free Key" above).');
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'verbose_json');
        if (settings.sourceLanguage && settings.sourceLanguage !== 'auto') {
          formData.append('language', settings.sourceLanguage);
        }

        const response = await fetch(
          'https://api.groq.com/openai/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${settings.groqApiKey.trim()}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            errData?.error?.message || `Groq API returned ${response.status}`
          );
        }

        const data = await response.json();
        const text = data.text || '';
        if (text.trim()) {
          await handleFinalSpeech(text);
        }
      } catch (err: any) {
        console.error('[Dictation] Groq Whisper error:', err);
        setError(err.message || 'Groq Cloud transcription failed');
      } finally {
        setIsProcessing(false);
      }
    },
    [settings.groqApiKey, settings.sourceLanguage, handleFinalSpeech]
  );

  // Process and transcribe accumulated PCM audio
  const processAccumulatedAudio = useCallback(async () => {
    if (settings.engine === 'local') {
      pcmChunksRef.current = []; // Mac built-in engine listens on its own
      return;
    }
    if (pcmChunksRef.current.length === 0) return;
    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];

    let totalSamples = 0;
    for (const c of chunks) totalSamples += c.length;
    // Ignore segments shorter than 0.5s to avoid click/noise triggers
    if (totalSamples < 8000) return;

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    let sumSquares = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      for (let i = 0; i < c.length; i++) {
        sumSquares += c[i] * c[i];
      }
      offset += c.length;
    }

    // Root-mean-square audio energy check: discard silent/ambient mic background noise
    const rms = Math.sqrt(sumSquares / totalSamples);
    if (rms < 0.01) {
      return;
    }

    const sampleRate = audioContextRef.current?.sampleRate || 44100;
    const wavBuffer = encodeWav16kMono(merged, sampleRate);

    // Cloud Engine (Whisper v3 Turbo)
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    await transcribeWithGroq(wavBlob);
  }, [transcribeWithGroq, settings.engine]);

  // Audio level meter and raw PCM stream setup
  const startAudioEngine = useCallback(async () => {
    const seq = ++startupSeqRef.current;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported');
      }

      const microphoneGranted = await window.electronAPI?.requestMicrophoneAccess?.();
      if (microphoneGranted === false) {
        throw new Error(
          'Microphone access was denied. Allow SlimeVR in macOS System Settings > Privacy & Security > Microphone, then try again.'
        );
      }

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      if (settings.inputDeviceId && settings.inputDeviceId !== 'default') {
        audioConstraints.deviceId = { exact: settings.inputDeviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      if (seq !== startupSeqRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      mediaStreamRef.current = stream;

      // Update device list in case labels just became accessible after permission grant
      refreshDevices();

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      if (seq !== startupSeqRef.current || (audioCtx.state as string) === 'closed') {
        stream.getTracks().forEach((t) => t.stop());
        try {
          audioCtx.close();
        } catch {
          // ignore
        }
        return;
      }

      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Raw PCM Processor Node (AudioWorkletNode for modern Chromium, fallback to ScriptProcessor)
      let processorNode: AudioNode;
      let workletInstalled = false;

      if (audioCtx.audioWorklet) {
        try {
          await audioCtx.audioWorklet.addModule(WORKLET_DATA_URI);

          if (
            seq === startupSeqRef.current &&
            (audioCtx.state as string) !== 'closed'
          ) {
            const worklet = new AudioWorkletNode(audioCtx, 'slime-dictation-processor');
            worklet.port.onmessage = (e) => {
              if (isListeningRef.current && e.data) {
                pcmChunksRef.current.push(new Float32Array(e.data));
                // Cap at ~15 seconds of speech buffer to manage memory
                if (pcmChunksRef.current.length > 500) {
                  pcmChunksRef.current.shift();
                }
              }
            };
            workletNodeRef.current = worklet;
            processorNode = worklet;
            workletInstalled = true;
          }
        } catch (workletErr) {
          console.warn(
            '[Dictation] AudioWorklet init failed, falling back to ScriptProcessor:',
            workletErr
          );
        }
      }

      if (seq !== startupSeqRef.current || (audioCtx.state as string) === 'closed') {
        return;
      }

      if (!workletInstalled) {
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          if (isListeningRef.current) {
            pcmChunksRef.current.push(new Float32Array(input));
            if (pcmChunksRef.current.length > 180) {
              pcmChunksRef.current.shift();
            }
          }
        };
        scriptProcessorRef.current = processor;
        processorNode = processor;
      }

      source.connect(processorNode!);
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      processorNode!.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));

        // Throttle React state update to ~15 FPS to prevent UI/WebGL thrashing & WebSocket timeouts
        const now = Date.now();
        if (now - lastLevelUpdateRef.current > 75) {
          lastLevelUpdateRef.current = now;
          setAudioLevel(normalized);
        }

        // VAD Speech Detection
        if (normalized > 16) {
          hasSpokenInCurrentChunkRef.current = true;
          lastSpeechTimeRef.current = now;
        } else if (
          hasSpokenInCurrentChunkRef.current &&
          !isSlicingRef.current &&
          isListeningRef.current &&
          now - lastSpeechTimeRef.current > 1200
        ) {
          // Detected pause in speech: process accumulated PCM segment
          isSlicingRef.current = true;
          hasSpokenInCurrentChunkRef.current = false;
          processAccumulatedAudio().finally(() => {
            isSlicingRef.current = false;
          });
        }

        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      isListeningRef.current = true;
      setIsListening(true);
      setError(null);
      updateLevel();
    } catch (err: any) {
      if (seq === startupSeqRef.current) {
        console.warn('[Dictation] Microphone access error:', err);
        setError(err.message || 'Microphone access failed');
        isListeningRef.current = false;
        setIsListening(false);
      }
    }
  }, [settings.inputDeviceId, refreshDevices, processAccumulatedAudio]);

  const processAudioRef = useRef(processAccumulatedAudio);
  processAudioRef.current = processAccumulatedAudio;

  const stopAudioEngine = useCallback(() => {
    startupSeqRef.current++;
    isListeningRef.current = false;
    setIsListening(false);
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    try {
      rec?.stop(); // still delivers the final result
    } catch {
      // ignore
    }
    // Encode the final segment before closing the context loses its sample rate.
    if (hasSpokenInCurrentChunkRef.current) {
      hasSpokenInCurrentChunkRef.current = false;
      void processAudioRef.current();
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      workletNodeRef.current = null;
    }
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {
        // ignore
      }
      scriptProcessorRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);

    pcmChunksRef.current = [];
    isSlicingRef.current = false;
  }, []);

  // Mac built-in recognition (Apple Speech via the webview's Web Speech API)
  const startRecognition = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('Mac built-in speech is unavailable here. Switch Engine to Groq.');
      stopAudioEngine();
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang =
      settings.sourceLanguage && settings.sourceLanguage !== 'auto'
        ? settings.sourceLanguage
        : navigator.language;
    // Fast mode: send once the live text stops changing instead of waiting
    // for the engine's end-of-utterance (~1-2s). ponytail: may cut a sentence early.
    let fastTimer: ReturnType<typeof setTimeout> | undefined;
    let skipFinal = false;
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          clearTimeout(fastTimer);
          if (skipFinal) skipFinal = false;
          else void handleFinalSpeechRef.current(r[0].transcript);
        } else interim += r[0].transcript;
      }
      setInterimTranscript(interim);
      clearTimeout(fastTimer);
      if (fastModeRef.current && interim.trim()) {
        fastTimer = setTimeout(() => {
          skipFinal = true;
          void handleFinalSpeechRef.current(interim);
          try {
            rec.stop(); // ends the utterance; onend restarts it
          } catch {
            // ignore
          }
        }, 700);
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Speech Recognition is blocked. Allow it in System Settings > Privacy & Security > Speech Recognition, or switch Engine to Groq.'
          : `Mac speech error: ${e.error}`
      );
      stopAudioEngine();
    };
    // WebKit ends the session after a pause; keep it going while listening.
    rec.onend = () => {
      clearTimeout(fastTimer);
      skipFinal = false;
      if (recognitionRef.current === rec && isListeningRef.current) {
        try {
          rec.start();
        } catch {
          // ignore
        }
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (err: any) {
      setError(err.message || 'Mac speech failed to start');
      stopAudioEngine();
    }
  }, [settings.sourceLanguage, stopAudioEngine]);

  // Public start/stop
  const startListening = useCallback(async () => {
    setError(null);
    setInterimTranscript('');
    pcmChunksRef.current = [];
    hasSpokenInCurrentChunkRef.current = false;
    await startAudioEngine();
    if (settings.engine === 'local' && isListeningRef.current) startRecognition();
  }, [startAudioEngine, startRecognition, settings.engine]);

  const stopListening = useCallback(() => {
    stopAudioEngine();
  }, [stopAudioEngine]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAudioEngine();
    };
  }, [stopAudioEngine]);

  // Trigger manual send of current preview
  const sendCurrentPreview = useCallback(() => {
    const formatted = formatDictationMessage(
      finalTranscript || interimTranscript,
      translatedText,
      settings.format,
      settings.sourceLanguage,
      settings.targetLanguage
    );
    if (formatted && onSendMessage) {
      onSendMessage(formatted);
      setLastSentMessage(formatted);
    }
  }, [finalTranscript, interimTranscript, translatedText, settings, onSendMessage]);

  return {
    settings,
    setSettings,
    availableDevices,
    refreshDevices,
    isListening,
    isProcessing,
    audioLevel,
    interimTranscript,
    finalTranscript,
    translatedText,
    lastSentMessage,
    error,
    startListening,
    stopListening,
    toggleListening,
    sendCurrentPreview,
    setEngine: (engine: DictationEngine) => setSettings((s) => ({ ...s, engine })),
    setGroqApiKey: (groqApiKey: string) => setSettings((s) => ({ ...s, groqApiKey })),
    setInputDeviceId: (inputDeviceId: string) =>
      setSettings((s) => ({ ...s, inputDeviceId })),
    setTargetLanguage: (targetLanguage: string) =>
      setSettings((s) => ({ ...s, targetLanguage })),
    setFormat: (format: DictationFormat) => setSettings((s) => ({ ...s, format })),
    setActivationMode: (activationMode: DictationActivation) =>
      setSettings((s) => ({ ...s, activationMode })),
    setAutoSend: (autoSend: boolean) => setSettings((s) => ({ ...s, autoSend })),
    setStickySeconds: (stickySeconds: number) =>
      setSettings((s) => ({ ...s, stickySeconds })),
    setFastMode: (fastMode: boolean) => setSettings((s) => ({ ...s, fastMode })),
    setAutoSticky: (autoSticky: boolean) =>
      setSettings((s) => ({ ...s, autoSticky })),
    setPlaySound: (playSound: boolean) => setSettings((s) => ({ ...s, playSound })),
  };
}
