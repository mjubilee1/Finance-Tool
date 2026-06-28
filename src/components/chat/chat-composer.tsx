"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, MicOff, Send, X } from "lucide-react";
import { isAcceptedChatImage, readImageAsDataUrl } from "@/lib/chat-images";

type Props = {
  value: string;
  onChange: (value: string) => void;
  pendingImages: string[];
  onPendingImagesChange: (images: string[]) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
};

export function ChatComposer({
  value,
  onChange,
  pendingImages,
  onPendingImagesChange,
  onSubmit,
  disabled = false,
  isLoading = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const canSend = (value.trim().length > 0 || pendingImages.length > 0) && !disabled && !isLoading && !isTranscribing;

  const handlePickImages = async (files: FileList | null) => {
    if (!files?.length) return;

    setComposerError(null);

    try {
      const nextImages = [...pendingImages];
      for (const file of Array.from(files)) {
        if (nextImages.length >= 2) {
          setComposerError("You can attach up to 2 photos per message.");
          break;
        }
        const dataUrl = await readImageAsDataUrl(file);
        nextImages.push(dataUrl);
      }
      onPendingImagesChange(nextImages);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Could not attach photo.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const stopRecordingTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const transcribeRecording = async (blob: Blob) => {
    setIsTranscribing(true);
    setComposerError(null);

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

      onChange(value.trim() ? `${value.trim()} ${transcript}` : transcript);
      inputRef.current?.focus();
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Voice input failed.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    if (isRecording || isTranscribing || disabled || isLoading) return;

    setComposerError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    } catch {
      setComposerError("Microphone access is required for voice input.");
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

  const removeImage = (index: number) => {
    onPendingImagesChange(pendingImages.filter((_, imageIndex) => imageIndex !== index));
  };

  return (
    <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
      {pendingImages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pendingImages.map((image, index) => (
            <div key={`${image.slice(0, 24)}-${index}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt={`Attachment ${index + 1}`}
                className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200/80"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 text-white p-0.5"
                aria-label="Remove photo"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {composerError ? <p className="text-xs text-rose-600">{composerError}</p> : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSubmit();
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={["image/jpeg", "image/png", "image/webp", "image/gif"].join(",")}
          capture="environment"
          className="hidden"
          onChange={(event) => {
            void handlePickImages(event.target.files);
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isLoading || isTranscribing || pendingImages.length >= 2}
          className="shrink-0 w-10 h-10 rounded-full app-card flex items-center justify-center text-slate-600 hover:bg-white disabled:opacity-50"
          title="Upload photo"
          aria-label="Upload photo"
        >
          <ImagePlus size={18} />
        </button>

        <button
          type="button"
          onClick={toggleRecording}
          disabled={disabled || isLoading || isTranscribing}
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isRecording
              ? "bg-rose-600 text-white animate-pulse"
              : "app-card text-slate-600 hover:bg-white"
          } disabled:opacity-50`}
          title={isRecording ? "Stop recording" : "Voice input"}
          aria-label={isRecording ? "Stop recording" : "Voice input"}
        >
          {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={
              isTranscribing
                ? "Transcribing voice..."
                : isRecording
                  ? "Listening..."
                  : "Ask a question, upload a receipt, or use the mic"
            }
            disabled={disabled || isLoading || isTranscribing}
            className="w-full pl-4 pr-12 py-3 app-input rounded-full text-sm"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 bg-teal-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-teal-700 transition-colors"
            aria-label="Send message"
          >
            <Send size={14} className="ml-[-1px]" />
          </button>
        </div>
      </form>

      <p className="text-[11px] text-slate-400 text-center">
        Photos work for receipts, bills, and bank screenshots. Tap the mic, speak, then send or edit the transcript.
      </p>
    </div>
  );
}
