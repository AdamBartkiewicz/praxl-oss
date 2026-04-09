"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseSpeechRecognitionOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
}

interface SpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  isSpeaking: boolean;
  volume: number;
  transcript: string;
  interimTranscript: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  reset: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): SpeechRecognitionReturn {
  const {
    lang = "pl-PL",
    continuous = true,
    interimResults = true,
    onResult,
    onEnd,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const langRef = useRef(lang);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  onResultRef.current = onResult;
  onEndRef.current = onEnd;
  langRef.current = lang;

  // Check support on mount (client only)
  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" &&
        !!( window.SpeechRecognition || window.webkitSpeechRecognition)
    );
  }, []);

  // Create a fresh recognition instance
  const createRecognition = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;

    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.continuous = continuous;
    rec.interimResults = interimResults;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      if (finalText) {
        setTranscript((prev) => prev + (prev ? " " : "") + finalText);
        onResultRef.current?.(finalText, true);
      }
      setInterimTranscript(interimText);
      if (interimText) {
        onResultRef.current?.(interimText, false);
      }
    };

    rec.onerror = (event) => {
      
      if (event.error === "no-speech" || event.error === "aborted") return;
      isListeningRef.current = false;
      setIsListening(false);
    };

    rec.onend = () => {
      // Auto-restart in continuous mode
      if (isListeningRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // fall through to stop
        }
      }
      isListeningRef.current = false;
      setIsListening(false);
      onEndRef.current?.();
    };

    return rec;
  }, [continuous, interimResults]);

  // Audio volume analyser
  const startAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let silenceCount = 0;

      const tick = () => {
        if (!isListeningRef.current) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const vol = Math.min(rms / 100, 1);
        setVolume(vol);

        if (rms > 12) {
          silenceCount = 0;
          setIsSpeaking(true);
        } else {
          silenceCount++;
          if (silenceCount > 10) setIsSpeaking(false);
        }

        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    } catch {
      // mic permission denied - speech recognition can still work without volume vis
    }
  }, []);

  const stopAudio = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    setVolume(0);
    setIsSpeaking(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (isListeningRef.current) return;

    // Always create a fresh instance to pick up latest lang
    const rec = createRecognition();
    if (!rec) return;

    // Stop old one if any
    try { recognitionRef.current?.stop(); } catch { /* */ }
    recognitionRef.current = rec;

    try {
      rec.start();
      isListeningRef.current = true;
      setIsListening(true);
      setInterimTranscript("");
      startAudio();
    } catch (e) {
      console.error("[SpeechRecognition] Failed to start:", e);
    }
  }, [createRecognition, startAudio]);

  const stop = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript("");
    stopAudio();
    try { recognitionRef.current?.stop(); } catch { /* */ }
  }, [stopAudio]);

  const toggle = useCallback(() => {
    if (isListeningRef.current) stop(); else start();
  }, [start, stop]);

  const reset = useCallback(() => {
    stop();
    setTranscript("");
    setInterimTranscript("");
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      cancelAnimationFrame(animRef.current);
      try { recognitionRef.current?.stop(); } catch { /* */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return {
    isListening,
    isSupported,
    isSpeaking,
    volume,
    transcript,
    interimTranscript,
    start,
    stop,
    toggle,
    reset,
  };
}
