"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
import { ensureMicrophoneAccess } from "@/lib/media-permissions";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function VoiceToTextButton({
  value,
  onChange,
  disabled = false,
  className = "",
  "aria-label": ariaLabel = "Dictate with microphone",
}: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const valueRef = useRef(value);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopRecordingTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const transcribeRecording = async (blob: Blob) => {
    setIsTranscribing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("audio", blob, blob.type.includes("mp4") ? "voice.mp4" : "voice.webm");

      const response = await fetch("/api/chat/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not transcribe voice.");
      }

      const transcript = typeof data.text === "string" ? data.text.trim() : "";
      if (!transcript) {
        throw new Error("Could not hear anything. Try again.");
      }

      const current = valueRef.current.trim();
      onChange(current ? `${current} ${transcript}` : transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice input failed.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    if (isRecording || isTranscribing || disabled) return;

    setError(null);

    try {
      const stream = await ensureMicrophoneAccess();
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        stopRecordingTracks();

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];

        if (blob.size > 0) {
          await transcribeRecording(blob);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access is required.");
      stopRecordingTracks();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggleRecording}
        disabled={disabled || isTranscribing}
        aria-label={isRecording ? "Stop recording" : ariaLabel}
        title={isRecording ? "Tap to stop" : "Tap to speak notes"}
        className={`inline-flex items-center justify-center rounded-xl p-2 transition-colors disabled:opacity-50 ${
          isRecording
            ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200"
            : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        }`}
      >
        {isTranscribing ? (
          <Loader2 size={16} className="animate-spin" />
        ) : isRecording ? (
          <MicOff size={16} />
        ) : (
          <Mic size={16} />
        )}
      </button>
      {error ? <p className="text-[11px] text-rose-600 mt-1">{error}</p> : null}
      {isRecording ? (
        <p className="text-[11px] text-rose-600 mt-1">Listening… tap mic to stop</p>
      ) : null}
      {isTranscribing ? (
        <p className="text-[11px] text-slate-500 mt-1">Turning speech into notes…</p>
      ) : null}
    </div>
  );
}
