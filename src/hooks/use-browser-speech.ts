"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareSpeechText } from "@/lib/coach-speech";

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.startsWith("en") && voice.localService) ??
    voices.find((voice) => voice.lang.startsWith("en")) ??
    null
  );
}

export function useBrowserSpeech() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      const prepared = prepareSpeechText(text);
      if (!prepared) return;

      if (typeof window === "undefined" || !window.speechSynthesis) {
        setSpeechError("Read aloud isn't supported in this browser.");
        return;
      }

      stop();
      setSpeechError(null);

      const utterance = new SpeechSynthesisUtterance(prepared);
      utterance.rate = 1;
      utterance.pitch = 1;

      const voice = pickVoice();
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (event.error === "canceled") return;
        utteranceRef.current = null;
        setIsSpeaking(false);
        setSpeechError("Playback failed.");
      };

      utteranceRef.current = utterance;
      setIsSpeaking(true);
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
    isSpeaking,
    speechError,
    supported,
    clearSpeechError: () => setSpeechError(null),
  };
}
