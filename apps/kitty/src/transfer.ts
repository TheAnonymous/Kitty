import { looksLikeProject, sanitizeProject } from "./domain/sanitize";
import type { ProjectV1 } from "./domain/types";

export const FILE_FORMAT = "kitty-project";
export const FILE_VERSION = 1;
export const FILE_EXTENSION = ".kitty.json";
const MAX_FILE_CHARACTERS = 2_000_000;

export interface ProjectFile {
  format: typeof FILE_FORMAT;
  version: typeof FILE_VERSION;
  name: string;
  exportedAt: string;
  app: string;
  project: ProjectV1;
}

export interface ImportedProject {
  name: string;
  project: ProjectV1;
}

export function cleanProjectName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  return clean || "Unbenanntes Projekt";
}

export function serializeProjectFile(name: string, project: ProjectV1, now: Date = new Date()): string {
  const file: ProjectFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name: cleanProjectName(name),
    exportedAt: now.toISOString(),
    app: "https://musik.jodie-oesterling.de/Kitty/",
    project: sanitizeProject(project),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Accepts own project files and bare project JSON; everything else is rejected with a readable reason. */
export function parseProjectFile(text: string, fallbackName = "Importiertes Projekt"): ImportedProject {
  if (text.length > MAX_FILE_CHARACTERS) throw new Error("Die Datei ist zu groß für ein Kitty-Projekt.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Die Datei ist kein lesbares JSON.");
  }
  const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  if (source.format === "groovebox-project") throw new Error("Das ist ein Groovebox-Projekt. Öffne es in der Groovebox.");
  if (source.format === FILE_FORMAT) {
    if (source.version !== FILE_VERSION) throw new Error("Diese Projektdatei stammt aus einer neueren Kitty-Version.");
    if (!looksLikeProject(source.project)) throw new Error("Die Projektdatei enthält kein vollständiges Projekt.");
    return { name: cleanProjectName(typeof source.name === "string" ? source.name : fallbackName), project: sanitizeProject(source.project) };
  }
  if (looksLikeProject(value)) return { name: cleanProjectName(fallbackName), project: sanitizeProject(value) };
  throw new Error("Das ist keine Kitty-Projektdatei.");
}

export function projectFileName(name: string): string {
  const slug = cleanProjectName(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/ß/g, "ss")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "kitty-projekt"}${FILE_EXTENSION}`;
}

export function nameFromFileName(fileName: string): string {
  return cleanProjectName(fileName.replace(/\.kitty\.json$|\.json$/i, "").replace(/[-_]+/g, " "));
}

export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Asks the browser not to evict local projects under storage pressure; only after a deliberate save-like action. */
export function requestPersistentStorage(): void {
  void navigator.storage?.persisted?.().then((persisted) => {
    if (!persisted) void navigator.storage.persist?.();
  }).catch(() => undefined);
}
