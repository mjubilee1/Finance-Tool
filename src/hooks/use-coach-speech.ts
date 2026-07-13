"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareSpeechText } from "@/lib/coach-speech";

type SpeakOptions = {
  messageIndex?: number;
};

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.startsWith("en") && voice.localService) ??
    voices.find((voice) => voice.lang.startsWith("en")) ??
    null
  );
}

export function useCoachSpeech() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const requestIdRef = useRef(0);

  const [isLoadingSpeech, setIsLoadingSpeech] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setIsLoadingSpeech(false);
    setIsSpeaking(false);
    setSpeakingMessageIndex(null);
  }, []);

  const speak = useCallback(
    (text: string, options: SpeakOptions = {}) => {
      const prepared = prepareSpeechText(text);
      if (!prepared) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      stop();
      requestIdRef.current = requestId;
      setSpeechError(null);
      setSpeakingMessageIndex(options.messageIndex ?? null);

      if (typeof window === "undefined" || !window.speechSynthesis) {
        setSpeechError("Read aloud isn't supported in this browser.");
        return;
      }

      setIsLoadingSpeech(true);

      const utterance = new SpeechSynthesisUtterance(prepared);
      utterance.rate = 1;
      utterance.pitch = 1;

      const voice = pickVoice();
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        if (requestIdRef.current !== requestId) return;
        setIsLoadingSpeech(false);
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        if (requestIdRef.current !== requestId) return;
        utteranceRef.current = null;
        setIsSpeaking(false);
        setSpeakingMessageIndex(null);
      };

      utterance.onerror = (event) => {
        if (requestIdRef.current !== requestId) return;
        if (event.error === "canceled") return;
        utteranceRef.current = null;
        setIsLoadingSpeech(false);
        setIsSpeaking(false);
        setSpeakingMessageIndex(null);
        setSpeechError("Playback failed. Try tapping read aloud again.");
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [stop],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const warmVoices = () => {
      window.speechSynthesis.getVoices();
    };

    warmVoices();
    window.speechSynthesis.addEventListener("voiceschanged", warmVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", warmVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    speak,
    stop,
    isLoadingSpeech,
    isSpeaking,
    speakingMessageIndex,
    speechError,
    supported,
    clearSpeechError: () => setSpeechError(null),
  };
}
