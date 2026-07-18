import { existsSync } from "fs";
import path from "path";

/** Resolve storage/car-documents whether cwd is the repo root or a nested Next runtime. */
export function resolveCarDocumentsDir(): string {
  const candidates = [
    path.join(process.cwd(), "storage", "car-documents"),
    path.join(process.cwd(), "..", "storage", "car-documents"),
    path.join(process.cwd(), "../..", "storage", "car-documents"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0]!;
}

export function resolveCarDocumentFile(filename: string) {
  const dir = resolveCarDocumentsDir();
  const filePath = path.join(dir, filename);
  return {
    dir,
    filePath,
    exists: existsSync(filePath),
  };
}
