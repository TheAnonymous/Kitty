import { createFactoryProject } from "./domain/defaults";
import { isValidProject, looksLikeProject, sanitizeProject } from "./domain/sanitize";
import type { GenreProfile, ProjectSummary, ProjectV1 } from "./domain/types";

export const CATALOG_KEY = "kitty.projects.v1";
export const CATALOG_BACKUP_KEY = "kitty.projects.v1.backup";
export const PROJECT_PREFIX = "kitty.project.v1.";
export const MAX_PROJECTS = 8;

interface CatalogV1 {
  schemaVersion: 1;
  activeId: string;
  projects: ProjectSummary[];
}

export interface LoadResult {
  project: ProjectV1;
  active: ProjectSummary;
  projects: ProjectSummary[];
  source: "primary" | "backup" | "factory";
  warning?: string | undefined;
}

export class KittyProjectRepository {
  constructor(private readonly storage: Storage = localStorage, private readonly now: () => Date = () => new Date()) {}

  load(): LoadResult {
    const primaryCatalog = this.readCatalog(CATALOG_KEY);
    const backupCatalog = this.readCatalog(CATALOG_BACKUP_KEY);
    const catalog = primaryCatalog ?? backupCatalog;
    if (catalog) {
      const active = catalog.projects.find((entry) => entry.id === catalog.activeId) ?? catalog.projects[0];
      if (active) {
        const primary = this.readProject(this.projectKey(active.id));
        if (primary) return { project: primary, active, projects: catalog.projects, source: primaryCatalog ? "primary" : "backup", warning: primaryCatalog ? undefined : "Die Projektliste wurde aus der letzten gültigen Sicherung wiederhergestellt." };
        const backup = this.readProject(this.backupKey(active.id));
        if (backup) return { project: backup, active, projects: catalog.projects, source: "backup", warning: "Der aktive Stand war beschädigt. Die letzte gültige Sicherung wurde geladen." };
      }
    }
    return this.createInitial(Boolean(this.safeGet(CATALOG_KEY) || this.safeGet(CATALOG_BACKUP_KEY)));
  }

  saveActive(summary: ProjectSummary, project: ProjectV1, projects: readonly ProjectSummary[]): ProjectSummary[] {
    const updated = { ...summary, name: cleanName(summary.name), updatedAt: this.now().toISOString() };
    const nextProjects = projects.map((entry) => entry.id === summary.id ? updated : entry).slice(0, MAX_PROJECTS);
    this.rotateProject(summary.id, project);
    this.rotateCatalog({ schemaVersion: 1, activeId: summary.id, projects: nextProjects });
    return nextProjects;
  }

  create(name: string, profile: GenreProfile, projects: readonly ProjectSummary[]): { summary: ProjectSummary; project: ProjectV1; projects: ProjectSummary[] } {
    if (projects.length >= MAX_PROJECTS) throw new Error("Maximal acht Projekte sind möglich.");
    const summary = this.summary(name);
    const project = createFactoryProject(profile);
    const next = [...projects, summary];
    this.safeSet(this.projectKey(summary.id), JSON.stringify(project));
    this.rotateCatalog({ schemaVersion: 1, activeId: summary.id, projects: next });
    return { summary, project, projects: next };
  }

  duplicate(source: ProjectSummary, project: ProjectV1, projects: readonly ProjectSummary[]): { summary: ProjectSummary; project: ProjectV1; projects: ProjectSummary[] } {
    if (projects.length >= MAX_PROJECTS) throw new Error("Maximal acht Projekte sind möglich.");
    const summary = this.summary(`${source.name} Kopie`);
    const duplicate = sanitizeProject(structuredClone(project));
    const next = [...projects, summary];
    this.safeSet(this.projectKey(summary.id), JSON.stringify(duplicate));
    this.rotateCatalog({ schemaVersion: 1, activeId: summary.id, projects: next });
    return { summary, project: duplicate, projects: next };
  }

  switchTo(id: string, projects: readonly ProjectSummary[]): { summary: ProjectSummary; project: ProjectV1; projects: ProjectSummary[] } {
    const summary = projects.find((entry) => entry.id === id);
    if (!summary) throw new Error("Projekt wurde nicht gefunden.");
    const project = this.readProject(this.projectKey(id)) ?? this.readProject(this.backupKey(id));
    if (!project) throw new Error("Projekt ist beschädigt und besitzt keine gültige Sicherung.");
    const next = [...projects];
    this.rotateCatalog({ schemaVersion: 1, activeId: id, projects: next });
    return { summary, project, projects: next };
  }

  rename(summary: ProjectSummary, name: string, projects: readonly ProjectSummary[]): { summary: ProjectSummary; projects: ProjectSummary[] } {
    const renamed = { ...summary, name: cleanName(name), updatedAt: this.now().toISOString() };
    const next = projects.map((entry) => entry.id === summary.id ? renamed : entry);
    this.rotateCatalog({ schemaVersion: 1, activeId: summary.id, projects: next });
    return { summary: renamed, projects: next };
  }

  delete(summary: ProjectSummary, projects: readonly ProjectSummary[]): { summary: ProjectSummary; project: ProjectV1; projects: ProjectSummary[] } {
    if (projects.length <= 1) throw new Error("Das letzte Projekt kann nicht gelöscht werden.");
    const next = projects.filter((entry) => entry.id !== summary.id);
    const replacement = next[0]!;
    const project = this.readProject(this.projectKey(replacement.id)) ?? this.readProject(this.backupKey(replacement.id));
    if (!project) throw new Error("Das Ersatzprojekt ist beschädigt.");
    this.rotateCatalog({ schemaVersion: 1, activeId: replacement.id, projects: next });
    this.storage.removeItem(this.projectKey(summary.id));
    this.storage.removeItem(this.backupKey(summary.id));
    return { summary: replacement, project, projects: next };
  }

  private createInitial(hadData: boolean): LoadResult {
    const active = this.summary("Kitty Hybrid");
    const project = createFactoryProject("hybrid");
    try {
      this.safeSet(this.projectKey(active.id), JSON.stringify(project));
      this.safeSet(CATALOG_KEY, JSON.stringify({ schemaVersion: 1, activeId: active.id, projects: [active] }));
    } catch {
      // The app remains usable in memory and reports errors on its next autosave.
    }
    return { project, active, projects: [active], source: "factory", warning: hadData ? "Gespeicherte Daten waren nicht lesbar. Das Werkprojekt wurde geladen." : undefined };
  }

  private rotateProject(id: string, project: ProjectV1): void {
    const key = this.projectKey(id);
    const current = this.safeGet(key);
    if (current) {
      try { if (isValidProject(JSON.parse(current) as unknown)) this.safeSet(this.backupKey(id), current); } catch { /* damaged primary never replaces the backup */ }
    }
    this.safeSet(key, JSON.stringify(sanitizeProject(project)));
  }

  private rotateCatalog(catalog: CatalogV1): void {
    const current = this.readCatalog(CATALOG_KEY);
    if (current) this.safeSet(CATALOG_BACKUP_KEY, JSON.stringify(current));
    this.safeSet(CATALOG_KEY, JSON.stringify(catalog));
  }

  private readProject(key: string): ProjectV1 | null {
    const raw = this.safeGet(key);
    if (!raw) return null;
    try { const value = JSON.parse(raw) as unknown; return looksLikeProject(value) ? sanitizeProject(value) : null; } catch { return null; }
  }

  private readCatalog(key: string): CatalogV1 | null {
    const raw = this.safeGet(key);
    if (!raw) return null;
    try {
      const source = JSON.parse(raw) as Record<string, unknown>;
      if (source.schemaVersion !== 1 || typeof source.activeId !== "string" || !Array.isArray(source.projects)) return null;
      const projects = source.projects.flatMap((entry) => {
        const value = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
        return typeof value.id === "string" && typeof value.name === "string" && typeof value.updatedAt === "string"
          ? [{ id: value.id.slice(0, 80), name: cleanName(value.name), updatedAt: value.updatedAt }]
          : [];
      }).filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index).slice(0, MAX_PROJECTS);
      return projects.length ? { schemaVersion: 1, activeId: source.activeId, projects } : null;
    } catch { return null; }
  }

  private summary(name: string): ProjectSummary {
    const id = globalThis.crypto?.randomUUID?.() ?? `kitty-${this.now().getTime()}-${Math.random().toString(16).slice(2)}`;
    return { id, name: cleanName(name), updatedAt: this.now().toISOString() };
  }

  private projectKey(id: string): string { return `${PROJECT_PREFIX}${id}`; }
  private backupKey(id: string): string { return `${PROJECT_PREFIX}${id}.backup`; }
  private safeGet(key: string): string | null { try { return this.storage.getItem(key); } catch { return null; } }
  private safeSet(key: string, value: string): void { this.storage.setItem(key, value); }
}

function cleanName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  return clean || "Unbenanntes Projekt";
}
