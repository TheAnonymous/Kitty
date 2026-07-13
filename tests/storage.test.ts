import { describe, expect, it } from "vitest";
import { createFactoryProject } from "@/domain/defaults";
import { CATALOG_KEY, KittyProjectRepository, MAX_PROJECTS, PROJECT_PREFIX } from "@/storage";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  failKey: string | null = null;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { if (this.failKey === key) throw new DOMException("Quota", "QuotaExceededError"); this.values.set(key, value); }
}

const NOW = () => new Date("2026-07-13T12:00:00.000Z");

describe("versionierter lokaler Projektspeicher", () => {
  it("rotiert gültige Primärstände und fällt bei Beschädigung auf das Backup zurück", () => {
    const storage = new MemoryStorage();
    const repository = new KittyProjectRepository(storage, NOW);
    const loaded = repository.load();
    const changed = structuredClone(loaded.project);
    changed.tempo = 161;
    repository.saveActive(loaded.active, changed, loaded.projects);
    changed.tempo = 166;
    repository.saveActive(loaded.active, changed, loaded.projects);
    storage.setItem(`${PROJECT_PREFIX}${loaded.active.id}`, "{kaputt");
    const recovered = repository.load();
    expect(recovered.source).toBe("backup");
    expect(recovered.project.tempo).toBe(161);
    expect(recovered.warning).toContain("Sicherung");
  });

  it("behält bei Quota-Fehlern den letzten gültigen Primärstand", () => {
    const storage = new MemoryStorage();
    const repository = new KittyProjectRepository(storage, NOW);
    const loaded = repository.load();
    const key = `${PROJECT_PREFIX}${loaded.active.id}`;
    const old = storage.getItem(key);
    const changed = structuredClone(loaded.project);
    changed.tempo = 177;
    storage.failKey = key;
    expect(() => repository.saveActive(loaded.active, changed, loaded.projects)).toThrow();
    expect(storage.getItem(key)).toBe(old);
  });

  it("begrenzt Erstellen und Duplizieren gemeinsam auf acht Projekte", () => {
    const storage = new MemoryStorage();
    const repository = new KittyProjectRepository(storage, NOW);
    let result = repository.load();
    for (let index = 1; index < MAX_PROJECTS; index += 1) {
      const created = repository.create(`Set ${index}`, "hybrid", result.projects);
      result = { ...created, active: created.summary, source: "primary" };
    }
    expect(result.projects).toHaveLength(8);
    expect(() => repository.create("Nummer neun", "hard", result.projects)).toThrow("acht");
    expect(() => repository.duplicate(result.active, result.project, result.projects)).toThrow("acht");
  });

  it("dupliziert Musik, wechselt Projekte und verhindert das Löschen des letzten", () => {
    const storage = new MemoryStorage();
    const repository = new KittyProjectRepository(storage, NOW);
    const first = repository.load();
    const project = createFactoryProject("hard");
    project.tempo = 169;
    const duplicate = repository.duplicate(first.active, project, first.projects);
    expect(duplicate.project).toEqual(project);
    const switched = repository.switchTo(first.active.id, duplicate.projects);
    expect(switched.summary.id).toBe(first.active.id);
    const deleted = repository.delete(first.active, duplicate.projects);
    expect(deleted.projects).toHaveLength(1);
    expect(() => repository.delete(deleted.summary, deleted.projects)).toThrow("letzte");
    expect(JSON.parse(storage.getItem(CATALOG_KEY)!).projects).toHaveLength(1);
  });
});
