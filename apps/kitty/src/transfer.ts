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
  return `${fileSlug(name, "kitty-projekt")}${FILE_EXTENSION}`;
}

export function fileSlug(name: string, fallback = "kitty"): string {
  const slug = cleanProjectName(name)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function nameFromFileName(fileName: string): string {
  return cleanProjectName(fileName.replace(/\.kitty\.json$|\.json$/i, "").replace(/[-_]+/g, " "));
}

export function downloadText(text: string, fileName: string): void {
  downloadBlob(new Blob([text], { type: "application/json" }), fileName);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
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

export const SHARE_PREFIX = "p=1.";
const MAX_SHARE_CHARACTERS = 60_000;

/** Packs a project into a URL fragment: deflate-compressed JSON, base64url. Fragments never reach the server. */
export async function encodeShareFragment(name: string, project: ProjectV1): Promise<string> {
  const json = JSON.stringify({ n: cleanProjectName(name), p: sanitizeProject(project) });
  const compressed = await transform(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return `${SHARE_PREFIX}${toBase64Url(compressed)}`;
}

/** Reads a fragment made by {@link encodeShareFragment}; `null` when the fragment carries no project. */
export async function decodeShareFragment(fragment: string): Promise<ImportedProject | null> {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!value.startsWith("p=")) return null;
  if (!value.startsWith(SHARE_PREFIX)) throw new Error("Dieser Link stammt aus einer neueren Kitty-Version.");
  const encoded = value.slice(SHARE_PREFIX.length);
  if (!encoded || encoded.length > MAX_SHARE_CHARACTERS || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error("Der geteilte Link ist unvollständig.");
  }
  try {
    const json = new TextDecoder().decode(await transform(fromBase64Url(encoded), new DecompressionStream("deflate-raw")));
    const source = JSON.parse(json) as Record<string, unknown>;
    if (!looksLikeProject(source.p)) throw new Error("kein Projekt");
    return { name: cleanProjectName(typeof source.n === "string" ? source.n : "Geteiltes Projekt"), project: sanitizeProject(source.p) };
  } catch {
    throw new Error("Der geteilte Link ist beschädigt oder unvollständig.");
  }
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
