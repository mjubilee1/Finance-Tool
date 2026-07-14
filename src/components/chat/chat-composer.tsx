"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff, Plus, X } from "lucide-react";
import { readImageAsDataUrl } from "@/lib/chat-images";
import { ContactMentionMenu } from "@/components/contact-mention-menu";
import { useContactMention } from "@/hooks/use-contact-mention";

type Props = {
  value: string;
  onChange: (value: string) => void;
  pendingImages: string[];
  onPendingImagesChange: (images: string[]) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
};

const MAX_IMAGES = 2;

export function ChatComposer({
  value,
  onChange,
  pendingImages,
  onPendingImagesChange,
  onSubmit,
  disabled = false,
  isLoading = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const mention = useContactMention({
    value,
    onChange,
    textareaRef,
  });

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value, pendingImages.length]);

  const canSend =
    (value.trim().length > 0 || pendingImages.length > 0) && !disabled && !isLoading && !isTranscribing;

  const addImages = async (files: File[]) => {
    if (!files.length) return;

    setComposerError(null);

    try {
      const nextImages = [...pendingImages];
      for (const file of files) {
        if (nextImages.length >= MAX_IMAGES) {
          setComposerError(`You can attach up to ${MAX_IMAGES} photos per message.`);
          break;
        }
        const dataUrl = await readImageAsDataUrl(file);
        nextImages.push(dataUrl);
      }
      onPendingImagesChange(nextImages);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Could not attach photo.");
    }
  };

  const handlePickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    await addImages(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (!imageFiles.length) return;

    event.preventDefault();
    void addImages(imageFiles);
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
      textareaRef.current?.focus();
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

  const placeholder = isTranscribing
    ? "Transcribing voice..."
    : isRecording
      ? "Listening..."
      : "Ask your coach, @tag a contact, paste a screenshot, or tap the mic";

  return (
    <div className="border-t border-[var(--card-border)] bg-[color-mix(in_srgb,var(--ink)_5%,var(--card-solid))] p-2 sm:p-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (mention.showMenu) return;
          if (canSend) onSubmit();
        }}
        className="relative rounded-2xl ring-1 ring-[var(--card-border)] bg-[var(--card)] shadow-sm"
      >
        {mention.showMenu ? (
          <ContactMentionMenu
            contacts={mention.suggestions}
            activeIndex={mention.activeIndex}
            onSelect={mention.applyMention}
            onHover={mention.setActiveIndex}
            emptyLabel={
              mention.isLoadingContacts ? "Loading contacts..." : "No matching contacts"
            }
          />
        ) : null}
        {pendingImages.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-b border-[var(--card-border)] px-3 py-2.5">
            {pendingImages.map((image, index) => (
              <div key={`${image.slice(0, 24)}-${index}`} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt={`Attachment ${index + 1}`}
                  className="h-14 w-14 rounded-lg object-cover ring-1 ring-[var(--card-border)]"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--ink)] text-[var(--card-solid)] p-0.5"
                  aria-label="Remove photo"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-1.5 px-2 py-2 sm:gap-2 sm:px-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={["image/jpeg", "image/png", "image/webp", "image/gif"].join(",")}
            multiple
            className="hidden"
            onChange={(event) => {
              void handlePickImages(event.target.files);
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isLoading || isTranscribing || pendingImages.length >= MAX_IMAGES}
            className="mb-0.5 shrink-0 rounded-full p-2 text-[var(--ink-soft)] transition hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] disabled:opacity-50"
            title="Add photo"
            aria-label="Add photo"
          >
            <Plus size={20} />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              mention.syncCursor(event.target.selectionStart, event.target.value);
            }}
            onClick={(event) => mention.syncCursor(event.currentTarget.selectionStart)}
            onKeyUp={(event) => mention.syncCursor(event.currentTarget.selectionStart)}
            onSelect={(event) => mention.syncCursor(event.currentTarget.selectionStart)}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (mention.onKeyDown(event)) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) onSubmit();
              }
            }}
            placeholder={placeholder}
            disabled={disabled || isLoading || isTranscribing}
            rows={1}
            className="min-h-[40px] max-h-40 flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none disabled:opacity-60"
          />

          <button
            type="button"
            onClick={toggleRecording}
            disabled={disabled || isLoading || isTranscribing}
            className={`mb-0.5 shrink-0 rounded-full p-2 transition disabled:opacity-50 ${
              isRecording
                ? "bg-rose-600 text-white animate-pulse"
                : "text-[var(--ink-soft)] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
            }`}
            title={isRecording ? "Stop recording" : "Voice input"}
            aria-label={isRecording ? "Stop recording" : "Voice input"}
          >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            type="submit"
            disabled={!canSend}
            className="mb-0.5 shrink-0 rounded-full bg-[var(--ink)] p-2 text-[var(--card-solid)] transition hover:brightness-110 disabled:opacity-40"
            aria-label="Send message"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </form>

      {composerError ? (
        <p className="mt-1.5 px-1 text-xs text-rose-600 dark:text-rose-300">{composerError}</p>
      ) : null}
    </div>
  );
}
