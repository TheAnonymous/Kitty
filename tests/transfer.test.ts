import { describe, expect, it } from "vitest";
import { createFactoryProject } from "@/domain/defaults";
import { KittyProjectRepository, MAX_PROJECTS } from "@/storage";
import { decodeShareFragment, encodeShareFragment, FILE_FORMAT, fileSlug, nameFromFileName, parseProjectFile, projectFileName, serializeProjectFile } from "@/transfer";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("Projektdateien", () => {
  it("schreibt und liest eine Projektdatei ohne Verlust", () => {
    const project = createFactoryProject("acid");
    project.tempo = 172;
    const text = serializeProjectFile("Warehouse", project, new Date("2026-09-27T20:00:00Z"));
    expect(JSON.parse(text).format).toBe(FILE_FORMAT);
    const imported = parseProjectFile(text);
    expect(imported.name).toBe("Warehouse");
    expect(imported.project).toEqual(project);
  });

  it("akzeptiert nacktes Projekt-JSON und leitet den Namen vom Dateinamen ab", () => {
    const imported = parseProjectFile(JSON.stringify(createFactoryProject("hard")), nameFromFileName("peak-time.kitty.json"));
    expect(imported.name).toBe("peak time");
    expect(imported.project.profile).toBe("hard");
  });

  it("klemmt manipulierte Werte über den Sanitizer", () => {
    const project = createFactoryProject() as unknown as Record<string, unknown>;
    project.tempo = 999;
    expect(parseProjectFile(JSON.stringify({ format: FILE_FORMAT, version: 1, name: "x", project })).project.tempo).toBe(180);
  });

  it("lehnt fremde und kaputte Dateien verständlich ab", () => {
    expect(() => parseProjectFile("nope")).toThrow("kein lesbares JSON");
    expect(() => parseProjectFile(JSON.stringify({ format: "groovebox-project" }))).toThrow("Groovebox");
    expect(() => parseProjectFile(JSON.stringify({ format: FILE_FORMAT, version: 9 }))).toThrow("neueren");
    expect(() => parseProjectFile("[]")).toThrow("keine Kitty-Projektdatei");
  });

  it("bildet sichere Dateinamen", () => {
    expect(projectFileName("Säure & Stahl")).toBe("saeure-stahl.kitty.json");
  });

  it("importiert als neues Projekt und respektiert die Obergrenze", () => {
    const repository = new KittyProjectRepository(new MemoryStorage(), () => new Date("2026-09-27T20:00:00Z"));
    const loaded = repository.load();
    const result = repository.importProject("Von Freundin", createFactoryProject("acid"), loaded.projects);
    expect(result.projects).toHaveLength(2);
    expect(result.summary.name).toBe("Von Freundin");
    expect(repository.load().active.id).toBe(result.summary.id);
    const full = Array.from({ length: MAX_PROJECTS }, (_, index) => ({ id: `p${index}`, name: `P${index}`, updatedAt: "2026-09-27T20:00:00Z" }));
    expect(() => repository.importProject("Zu viel", createFactoryProject(), full)).toThrow("acht");
  });
});

describe("Teilen-Link", () => {
  it("packt ein Projekt verlustfrei in ein kompaktes Fragment", async () => {
    const project = createFactoryProject("hard");
    project.tempo = 171;
    project.sceneRepeats = 4;
    const fragment = await encodeShareFragment("Für Mo", project);
    expect(fragment.startsWith("p=1.")).toBe(true);
    expect(fragment.length).toBeLessThan(12_000);
    expect(/^p=1\.[A-Za-z0-9_-]+$/.test(fragment)).toBe(true);
    const shared = await decodeShareFragment(`#${fragment}`);
    expect(shared?.name).toBe("Für Mo");
    expect(shared?.project).toEqual(project);
  });

  it("ignoriert fremde Fragmente und meldet beschädigte Links", async () => {
    expect(await decodeShareFragment("#oben")).toBeNull();
    await expect(decodeShareFragment("#p=1.abc")).rejects.toThrow("beschädigt");
    await expect(decodeShareFragment("#p=2.abc")).rejects.toThrow("neueren");
    await expect(decodeShareFragment("#p=1.$$$")).rejects.toThrow("unvollständig");
  });

  it("baut lesbare Dateinamen mit deutschen Umlauten", () => {
    expect(fileSlug("Aufwärmen")).toBe("aufwaermen");
    expect(fileSlug("Größte Übung")).toBe("groesste-uebung");
    expect(fileSlug("   ", "szene")).toBe("unbenanntes-projekt");
  });
});
