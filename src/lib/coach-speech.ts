const META_LINE_PREFIXES = [
  "Saved for your financial overview:",
  "I refreshed your daily brief.",
];

export function prepareSpeechText(content: string): string {
  let text = content.trim();
  if (!text) return "";

  const lines = text.split("\n");
  const spokenLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return !META_LINE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  });

  text = spokenLines.join("\n");

  text = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

export const READ_ALOUD_STORAGE_KEY = "cfo-coach-read-aloud";
