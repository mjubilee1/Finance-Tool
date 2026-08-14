const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

export function isAcceptedChatImage(file: File) {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true;
  // Mobile camera rolls sometimes omit MIME type or use a generic octet-stream.
  if (!file.type || file.type === "application/octet-stream") {
    return IMAGE_EXTENSION.test(file.name);
  }
  return file.type.startsWith("image/");
}

export async function readImageAsDataUrl(file: File): Promise<string> {
  if (!isAcceptedChatImage(file)) {
    throw new Error("Use a camera photo or JPG, PNG, WebP, HEIC, or GIF.");
  }

  if (file.size <= MAX_IMAGE_BYTES) {
    return fileToDataUrl(file);
  }

  return compressImageFile(file);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

async function compressImageFile(file: File, maxWidth = 1600, quality = 0.82): Promise<string> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, maxWidth / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not prepare image.");
    }

    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);

    if (estimateDataUrlBytes(dataUrl) > MAX_IMAGE_BYTES) {
      throw new Error("Photo is too large. Try a smaller screenshot or crop.");
    }

    return dataUrl;
  } catch {
    // HEIC/HEIF and some camera formats can't be decoded in-browser for resize.
    if (file.size <= MAX_IMAGE_BYTES) {
      return fileToDataUrl(file);
    }
    throw new Error("Photo is too large. Try a smaller screenshot or crop.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}
