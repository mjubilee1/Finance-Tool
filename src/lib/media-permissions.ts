/** Accept string for photo library + camera uploads on mobile browsers. */
export const MEDIA_IMAGE_ACCEPT =
  "image/*,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif";

/**
 * Request microphone access for this single-user app.
 * Browsers remember Allow for the origin after the first grant.
 */
export async function ensureMicrophoneAccess(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support microphone input.");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
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
