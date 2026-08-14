/** Accept string for photo library + camera uploads on mobile browsers. */
export const MEDIA_IMAGE_ACCEPT =
  "image/*,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif";

/**
 * Keep one live mic stream for the page lifetime.
 * Stopping tracks after every recording makes Safari / iOS re-prompt.
 */
let sharedMicStream: MediaStream | null = null;

function streamHasLiveAudio(stream: MediaStream | null) {
  return Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live"));
}

function enableMicTracks(stream: MediaStream, enabled: boolean) {
  for (const track of stream.getAudioTracks()) {
    track.enabled = enabled;
  }
}

/**
 * Request microphone access for this single-user app.
 * Reuses a cached stream so the browser does not keep asking after the first Allow.
 */
export async function ensureMicrophoneAccess(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support microphone input.");
  }

  if (streamHasLiveAudio(sharedMicStream)) {
    enableMicTracks(sharedMicStream!, true);
    return sharedMicStream!;
  }

  sharedMicStream = null;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    sharedMicStream = stream;

    // If the user later revokes permission in browser settings, drop the cache.
    for (const track of stream.getAudioTracks()) {
      track.addEventListener("ended", () => {
        if (sharedMicStream === stream) sharedMicStream = null;
      });
    }

    return stream;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new Error(
        "Microphone is blocked. Tap Allow when prompted, or enable Microphone for this site in your browser settings.",
      );
    }

    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new Error("No microphone found on this device.");
    }

    if (name === "NotReadableError" || name === "TrackStartError") {
      throw new Error("Microphone is busy in another app. Close it and try again.");
    }

    throw new Error("Could not access the microphone.");
  }
}

/**
 * Pause capture between recordings without releasing permission (no re-prompt).
 */
export function pauseMicrophoneAccess() {
  if (sharedMicStream) enableMicTracks(sharedMicStream, false);
}

/**
 * Hard-release only on full page teardown. Prefer pauseMicrophoneAccess between takes.
 */
export function releaseMicrophoneAccess() {
  sharedMicStream?.getTracks().forEach((track) => track.stop());
  sharedMicStream = null;
}

export async function getMicrophonePermissionState(): Promise<PermissionState | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unsupported";
  }

  try {
    const result = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return result.state;
  } catch {
    return "unsupported";
  }
}
