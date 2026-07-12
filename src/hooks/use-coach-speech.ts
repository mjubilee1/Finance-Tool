"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareSpeechText } from "@/lib/coach-speech";

type SpeakOptions = {
  messageIndex?: number;
};

export function useCoachSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const [isLoadingSpeech, setIsLoadingSpeech] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    cleanupAudio();
    setIsLoadingSpeech(false);
    setIsSpeaking(false);
    setSpeakingMessageIndex(null);
  }, [cleanupAudio]);

  const speak = useCallback(
    async (text: string, options: SpeakOptions = {}) => {
      const prepared = prepareSpeechText(text);
      if (!prepared) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      stop();
      requestIdRef.current = requestId;
      setIsLoadingSpeech(true);
      setSpeechError(null);
      setSpeakingMessageIndex(options.messageIndex ?? null);

      try {
        const response = await fetch("/api/chat/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Could not read the response aloud.");
        }

        if (requestIdRef.current !== requestId) return;

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audioRef.current = audio;

        audio.onended = () => {
          if (requestIdRef.current !== requestId) return;
          cleanupAudio();
          setIsSpeaking(false);
          setSpeakingMessageIndex(null);
        };

        audio.onerror = () => {
          if (requestIdRef.current !== requestId) return;
          cleanupAudio();
          setIsSpeaking(false);
          setSpeakingMessageIndex(null);
          setSpeechError("Playback failed.");
        };

        await audio.play();
        if (requestIdRef.current !== requestId) return;

        setIsLoadingSpeech(false);
        setIsSpeaking(true);
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        cleanupAudio();
        setIsLoadingSpeech(false);
        setIsSpeaking(false);
        setSpeakingMessageIndex(null);
        setSpeechError(error instanceof Error ? error.message : "Read aloud failed.");
      }
    },
    [cleanupAudio, stop],
  );

  useEffect(() => stop, [stop]);

  return {
    speak,
    stop,
    isLoadingSpeech,
    isSpeaking,
    speakingMessageIndex,
    speechError,
    clearSpeechError: () => setSpeechError(null),
  };
}
