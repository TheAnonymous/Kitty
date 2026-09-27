<script setup lang="ts">
import {
  KvAlert,
  KvAlertDialog,
  KvBadge,
  KvButton,
  KvCard,
  KvDialog,
  KvField,
  KvInput,
  KvRadioGroup,
  KvSelect,
  KvSlider,
  KvTooltip,
  useKvToast,
} from "@kinky-vibes/ui";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { ToneAudioEngine } from "./audio/engine";
import { planSeconds, renderPlan, renderProject, type ExportMode } from "./audio/render";
import { encodeWav, trimmedLength } from "./audio/wav";
import StepGrid from "./components/StepGrid.vue";
import { PROFILE_DEFINITIONS } from "./domain/defaults";
import { DEGREE_LABELS, ROOT_LABELS, SCALE_LABELS } from "./domain/music";
import { SOUND_PRESET_DEFINITIONS } from "./domain/sound-presets";
import type {
  DrumVoice,
  GenreProfile,
  MacroKind,
  ProjectSummary,
  RootNote,
  Scale,
  SoundPresetId,
  TrackKind,
  VariationAmount,
} from "./domain/types";
import { DRUM_VOICES, ROOT_NOTES, SCALES, SCENE_COUNT, SCENE_REPEATS, TRACK_KINDS, VARIATION_AMOUNTS } from "./domain/types";
import { KittyProjectRepository, MAX_PROJECTS } from "./storage";
import { canAddDrumVoice, KittyStore, selectedPattern, selectedStep, type Action } from "./store/store";
import {
  decodeShareFragment,
  downloadBlob,
  downloadText,
  encodeShareFragment,
  fileSlug,
  nameFromFileName,
  parseProjectFile,
  projectFileName,
  requestPersistentStorage,
  serializeProjectFile,
  type ImportedProject,
} from "./transfer";

const TRACK_LABELS: Record<TrackKind, { name: string; short: string; description: string }> = {
  drums: { name: "Drum Machine", short: "DRUMS", description: "Kick, Snare, Clap, Hats und Tom" },
  acid: { name: "Acid Bass", short: "ACID", description: "Monophone 303-Linie mit Accent und Slide" },
  stab: { name: "Stab", short: "STAB", description: "Kurze, skalensichere Akkordschläge" },
  rave: { name: "Rave Lead", short: "RAVE", description: "Hoover-, Pulse- und Siren-Farben" },
  texture: { name: "Texture / FX", short: "FX", description: "Noise, Drone und Übergangsklänge" },
};

const MACRO_LABELS: Record<MacroKind, string> = { color: "Farbe", pressure: "Druck", space: "Raum", motion: "Bewegung", density: "Dichte" };
const MACRO_HINTS: Record<TrackKind, Record<MacroKind, string>> = {
  drums: { color: "Macht Hats und Transienten heller oder dunkler.", pressure: "Verdichtet Kick und Snare kontrolliert.", space: "Gibt dem Kit einen kurzen Raum.", motion: "Bewegt Delay und rhythmische Wiederholungen.", density: "Gewichtet aktive Treffer, ohne neue Steps zu setzen." },
  acid: { color: "Öffnet oder schließt den Acid-Filter.", pressure: "Erhöht Resonanz und kontrollierte Verdichtung.", space: "Mischt kurzes Echo und Raum hinzu.", motion: "Verstärkt Filter- und Delaybewegung.", density: "Gewichtet die Linie im Groove." },
  stab: { color: "Verschiebt den Akkord zwischen dunkel und brillant.", pressure: "Macht den Anschlag kompakter und härter.", space: "Verlängert die räumliche Fahne.", motion: "Gibt den Stabs rhythmische Echos.", density: "Gewichtet die gesetzten Akkordschläge." },
  rave: { color: "Regelt die Brillanz der Lead-Farbe.", pressure: "Verdichtet den Hoover- oder Siren-Ton.", space: "Fügt kontrolliertes Echo und Hall hinzu.", motion: "Erhöht die Bewegung im Delay.", density: "Gewichtet die Lead-Figur im Mix." },
  texture: { color: "Formt Rauschen und Drone von dunkel bis hell.", pressure: "Verdichtet den Hintergrund ohne Pegelsprung.", space: "Vergrößert die Hallfahne der Textur.", motion: "Belebt Übergänge mit Feedback.", density: "Gewichtet die gesetzten Texture-Impulse." },
};

const DRUM_LABELS: Record<DrumVoice, string> = { kick: "Kick", snare: "Snare", clap: "Clap", closedHat: "Closed Hat", openHat: "Open Hat", tom: "Tom" };
const repository = new KittyProjectRepository();
const loaded = repository.load();
const store = new KittyStore(loaded.project);
const engine = new ToneAudioEngine(loaded.project);
const toast = useKvToast();
const state = ref(structuredClone(store.getState()));
const active = ref<ProjectSummary>(loaded.active);
const projects = ref<ProjectSummary[]>(loaded.projects);
const newDialog = ref(false);
const projectsDialog = ref(false);
const deleteDialog = ref(false);
const triggeredTracks = ref<TrackKind[]>([]);
const ducking = ref(false);
const acidLegato = ref(false);
const newName = ref("Neues Set");
const newProfile = ref<GenreProfile>("hybrid");
const renameValue = ref(active.value.name);
const importInput = ref<HTMLInputElement | null>(null);
const baseUrl = import.meta.env.BASE_URL;
const shareFeedback = ref("");
const sharedOnPhone = ref(window.location.hash.startsWith("#p="));
const exportDialog = ref(false);
const exportMode = ref<"arc" | "scene">("arc");
const exporting = ref(false);
const exportStatus = ref("");
const shareDialog = ref(false);
const shareUrl = ref("");
const shareStatus = ref("");
const sharedDialog = ref(false);
const sharedOffer = shallowRef<ImportedProject | null>(null);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let audioDisposed = false;

const pattern = computed(() => selectedPattern(state.value)!);
const step = computed(() => selectedStep(state.value));
const selectedTrack = computed(() => state.value.ui.selectedTrack);
const selectedScene = computed(() => state.value.project.scenes[state.value.ui.selectedScene]!);
const selectedPresets = computed(() => SOUND_PRESET_DEFINITIONS[selectedTrack.value]);
const isPlaying = computed(() => state.value.transport.status === "playing");
const profileOptions = Object.entries(PROFILE_DEFINITIONS).map(([value, item]) => ({ value, label: `${item.label} — ${item.description}` }));
const rootOptions = ROOT_NOTES.map((value) => ({ value, label: ROOT_LABELS[value] }));
const scaleOptions = SCALES.map((value) => ({ value, label: SCALE_LABELS[value] }));
const dynamicsOptions = [{ value: "ghost", label: "Leise" }, { value: "normal", label: "Normal" }, { value: "accent", label: "Akzent" }];
const lengthOptions = [{ value: "short", label: "Kurz" }, { value: "normal", label: "Normal" }, { value: "long", label: "Lang" }];
const degreeOptions = DEGREE_LABELS.map((label, value) => ({ value, label }));
const octaveOptions = [1, 2, 3, 4, 5].map((value) => ({ value, label: `Oktave ${value}` }));
const arcSeconds = computed(() => planSeconds(state.value.project, renderPlan(state.value.project, { kind: "arc" })));
const exportOptions = computed(() => {
  const { project, ui } = state.value;
  const bars = project.sceneRepeats * 4;
  const loop = planSeconds(project, renderPlan(project, { kind: "scene", scene: ui.selectedScene }));
  return [
    { value: "arc", label: `Ganzer Bogen — alle vier Szenen nacheinander, je ${bars} Takte · ${formatDuration(arcSeconds.value)}` },
    { value: "scene", label: `Nur „${selectedScene.value.name}“ — ${bars} Takte als Loop · ${formatDuration(loop)}` },
  ];
});
const chainNextScene = computed(() => state.value.ui.sceneChain && isPlaying.value && state.value.transport.queuedScene === null ? (state.value.transport.runningScene + 1) % SCENE_COUNT : null);

const unsubscribe = store.subscribe((next, action) => {
  state.value = structuredClone(next);
  engine.setSceneChain(next.ui.sceneChain ? next.project.sceneRepeats : null);
  if (next.autosave !== "saving") return;
  engine.syncProject(next.project);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), action.type.startsWith("history/") ? 80 : 260);
});

const offStatus = engine.onStatus((event) => store.dispatch({ type: "transport/update", update: { status: event.status, message: event.message } }));
const offPlayhead = engine.onPlayhead((event) => {
  const current = store.getState();
  // With the scene chain on, the editor follows the music when it was showing the running scene.
  if (event.switched && current.ui.sceneChain && current.ui.selectedScene === current.transport.runningScene) {
    store.dispatch({ type: "ui/select-scene", scene: event.scene });
  }
  const chain = current.ui.sceneChain && event.step === 0 ? chainMessage(event.scene, event.pass, event.chainNext) : null;
  store.dispatch({ type: "transport/update", update: {
    ...(chain ? { message: chain } : {}),
    runningScene: event.scene,
    queuedScene: event.switched ? null : store.getState().transport.queuedScene,
    bar: event.bar,
    step: event.step,
    peak: event.peak,
    trackPeaks: event.trackPeaks,
  } });
});

const offTriggered = engine.onPlayhead((event) => {
  triggeredTracks.value = [...new Set([...triggeredTracks.value, ...event.triggeredTracks])];
  ducking.value ||= event.ducking;
  acidLegato.value ||= event.acidLegato;
});

function dispatch(action: Action): void { store.dispatch(action); }

function save(): void {
  try {
    projects.value = repository.saveActive(active.value, store.getState().project, projects.value);
    active.value = projects.value.find((entry) => entry.id === active.value.id) ?? active.value;
    store.dispatch({ type: "autosave/status", status: "saved" });
  } catch (error) {
    store.dispatch({ type: "autosave/status", status: "error" });
    toast.toast({ title: "Speichern fehlgeschlagen", description: errorMessage(error), status: "error", duration: 0 });
  }
}

async function toggleTransport(): Promise<void> {
  if (isPlaying.value || state.value.transport.status === "starting") engine.stop();
  else await engine.start(state.value.ui.selectedScene);
}

function selectScene(scene: number): void {
  dispatch({ type: "ui/select-scene", scene });
  if (isPlaying.value) {
    const queued = engine.queueScene(scene);
    dispatch({ type: "transport/update", update: { queuedScene: queued, message: queued === null ? "Szenenwechsel aufgehoben" : `Szene ${scene + 1} startet am nächsten Takt` } });
  }
}

function flushAutosave(): void {
  clearTimeout(saveTimer);
  if (store.getState().autosave === "saving") save();
}

function chainMessage(scene: number, pass: number, next: number | null): string {
  const { project } = store.getState();
  const name = project.scenes[scene]?.name ?? `Szene ${scene + 1}`;
  const following = next === null ? "" : ` → ${project.scenes[next]?.name ?? `Szene ${next + 1}`}`;
  return `Szenenfolge · ${name} ${Math.min(pass + 1, project.sceneRepeats)}/${project.sceneRepeats}${following}`;
}

function toggleChain(): void {
  const enabled = !state.value.ui.sceneChain;
  dispatch({ type: "ui/scene-chain", value: enabled });
  if (!isPlaying.value) return;
  const running = state.value.transport.runningScene;
  dispatch({ type: "transport/update", update: { message: enabled ? chainMessage(running, 0, (running + 1) % SCENE_COUNT) : "Wiedergabe läuft" } });
}

function currentProjectBeforeSwitch(): void {
  flushAutosave();
  engine.stop();
  triggeredTracks.value = [];
  ducking.value = false;
  acidLegato.value = false;
}

function applyProject(result: { summary: ProjectSummary; project: typeof state.value.project; projects: ProjectSummary[] }, message: string): void {
  active.value = result.summary;
  projects.value = result.projects;
  renameValue.value = result.summary.name;
  store.replaceProject(result.project);
  engine.syncProject(result.project);
  toast.toast({ title: message, description: result.summary.name, status: "success" });
}

function switchProject(id: string): void {
  if (id === active.value.id) return;
  try { currentProjectBeforeSwitch(); applyProject(repository.switchTo(id, projects.value), "Projekt gewechselt"); projectsDialog.value = false; }
  catch (error) { toast.toast({ title: "Projektwechsel fehlgeschlagen", description: errorMessage(error), status: "error" }); }
}

function createProject(): void {
  try {
    currentProjectBeforeSwitch();
    applyProject(repository.create(newName.value, newProfile.value, projects.value), `${PROFILE_DEFINITIONS[newProfile.value].label}-Projekt erstellt`);
    newDialog.value = false;
    requestPersistentStorage();
  } catch (error) { toast.toast({ title: "Projekt konnte nicht erstellt werden", description: errorMessage(error), status: "error" }); }
}

function duplicateProject(): void {
  try { currentProjectBeforeSwitch(); applyProject(repository.duplicate(active.value, store.getState().project, projects.value), "Projekt dupliziert"); projectsDialog.value = false; requestPersistentStorage(); }
  catch (error) { toast.toast({ title: "Duplizieren fehlgeschlagen", description: errorMessage(error), status: "error" }); }
}

function exportProject(): void {
  flushAutosave();
  const fileName = projectFileName(active.value.name);
  downloadText(serializeProjectFile(active.value.name, store.getState().project), fileName);
  requestPersistentStorage();
  toast.toast({ title: "Projektdatei gesichert", description: `${fileName} liegt jetzt in deinen Downloads.`, status: "success" });
}

async function importFile(file: File): Promise<void> {
  if (window.matchMedia("(max-width: 1023px)").matches) return;
  try {
    const imported = parseProjectFile(await file.text(), nameFromFileName(file.name));
    currentProjectBeforeSwitch();
    applyProject(repository.importProject(imported.name, imported.project, projects.value), "Projektdatei geöffnet");
    projectsDialog.value = false;
    requestPersistentStorage();
  } catch (error) { toast.toast({ title: "Datei nicht geöffnet", description: errorMessage(error), status: "error" }); }
}

function onImportInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void importFile(file);
}

function onDragOver(event: DragEvent): void { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); }
function onDrop(event: DragEvent): void {
  const file = event.dataTransfer?.files[0];
  if (!file) return;
  event.preventDefault();
  void importFile(file);
}

function openExport(): void {
  exportStatus.value = "";
  exportDialog.value = true;
}

async function exportAudio(): Promise<void> {
  if (exporting.value) return;
  const mode: ExportMode = exportMode.value === "scene" ? { kind: "scene", scene: state.value.ui.selectedScene } : { kind: "arc" };
  exporting.value = true;
  const estimate = Math.max(3, Math.round(planSeconds(state.value.project, renderPlan(state.value.project, mode)) * 0.7));
  exportStatus.value = `Wird gerendert … etwa ${estimate} Sekunden. Lass das Fenster dabei offen.`;
  if (isPlaying.value || state.value.transport.status === "starting") engine.stop();
  // Let the status paint before the synchronous clock pass of the offline render.
  await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  try {
    flushAutosave();
    const project = structuredClone(store.getState().project);
    const buffer = await renderProject(project, mode, (fraction) => {
      exportStatus.value = `Wird gerendert … ${Math.round(fraction * 100)} % von etwa ${estimate} Sekunden. Lass das Fenster dabei offen.`;
    });
    const musicFrames = Math.round(planSeconds(project, renderPlan(project, mode)) * buffer.sampleRate);
    const wav = encodeWav(buffer, trimmedLength(buffer, musicFrames));
    const suffix = mode.kind === "arc" ? "bogen" : fileSlug(project.scenes[mode.scene]?.name ?? "", "szene");
    const fileName = `${fileSlug(active.value.name)}-${suffix}.wav`;
    downloadBlob(new Blob([wav], { type: "audio/wav" }), fileName);
    exportStatus.value = "";
    exportDialog.value = false;
    toast.toast({ title: "WAV gespeichert", description: `${fileName} liegt jetzt in deinen Downloads.`, status: "success" });
  } catch (error) {
    exportStatus.value = `Das hat nicht geklappt: ${errorMessage(error)}`;
  } finally {
    exporting.value = false;
  }
}

async function shareLink(): Promise<void> {
  try {
    flushAutosave();
    const fragment = await encodeShareFragment(active.value.name, store.getState().project);
    shareUrl.value = `${window.location.origin}${window.location.pathname}#${fragment}`;
    shareStatus.value = "";
    shareDialog.value = true;
    await copyShareUrl();
  } catch (error) { toast.toast({ title: "Link nicht erstellt", description: errorMessage(error), status: "error" }); }
}

async function copyShareUrl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    shareStatus.value = "Link kopiert – schick ihn einfach weiter.";
  } catch {
    document.querySelector<HTMLInputElement>("[data-share-url] input, input[data-share-url]")?.select();
    shareStatus.value = "Kopieren war nicht möglich. Markiere den Link und kopiere ihn mit Strg+C.";
  }
}

async function offerSharedFragment(): Promise<void> {
  if (!window.location.hash.startsWith("#p=")) return;
  if (window.matchMedia("(max-width: 1023px)").matches) { sharedOnPhone.value = true; return; }
  try {
    const imported = await decodeShareFragment(window.location.hash);
    if (!imported) return;
    sharedOffer.value = imported;
    sharedDialog.value = true;
  } catch (error) {
    clearShareFragment();
    toast.toast({ title: "Geteilter Link nicht lesbar", description: errorMessage(error), status: "error" });
  }
}

function acceptShared(): void {
  const offer = sharedOffer.value;
  if (!offer) return;
  sharedOffer.value = null;
  sharedDialog.value = false;
  clearShareFragment();
  try {
    currentProjectBeforeSwitch();
    applyProject(repository.importProject(offer.name, offer.project, projects.value), "Geteiltes Projekt übernommen");
    requestPersistentStorage();
  } catch (error) { toast.toast({ title: "Projekt nicht übernommen", description: errorMessage(error), status: "error" }); }
}

watch(sharedDialog, (open) => {
  if (open || !sharedOffer.value) return;
  sharedOffer.value = null;
  clearShareFragment();
});

function onHashChange(): void { void offerSharedFragment(); }

function renameProject(): void {
  try {
    const result = repository.rename(active.value, renameValue.value, projects.value);
    active.value = result.summary;
    projects.value = result.projects;
    toast.toast({ title: "Projekt umbenannt", description: active.value.name, status: "success" });
  } catch (error) { toast.toast({ title: "Umbenennen fehlgeschlagen", description: errorMessage(error), status: "error" }); }
}

function deleteProject(): void {
  try { currentProjectBeforeSwitch(); applyProject(repository.delete(active.value, projects.value), "Projekt gelöscht"); deleteDialog.value = false; projectsDialog.value = false; }
  catch (error) { toast.toast({ title: "Löschen fehlgeschlagen", description: errorMessage(error), status: "error" }); }
}

function drumDisabled(voice: DrumVoice): boolean {
  return Boolean(step.value?.enabled && !step.value.drumVoices.includes(voice) && !canAddDrumVoice(step.value.drumVoices, voice));
}

function onShortcut(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, select, textarea, button, [contenteditable='true']")) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "history/redo" : "history/undo" }); return; }
  if ((event.ctrlKey || event.metaKey) && key === "y") { event.preventDefault(); dispatch({ type: "history/redo" }); return; }
  if (event.code === "Space") { event.preventDefault(); void toggleTransport(); return; }
  const number = Number(event.key);
  if (event.shiftKey && number >= 1 && number <= 4) { event.preventDefault(); selectScene(number - 1); return; }
  if (!event.shiftKey && number >= 1 && number <= 5) { event.preventDefault(); dispatch({ type: "ui/select-track", track: TRACK_KINDS[number - 1]! }); return; }
  if (key === "v") { event.preventDefault(); dispatch({ type: "track/vary" }); }
  if (key === "r") { event.preventDefault(); dispatch({ type: "track/typical" }); }
}

async function rememberLink(): Promise<void> {
  const url = window.location.href;
  if (typeof navigator.share === "function") {
    try { await navigator.share({ title: document.title, url }); return; }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    shareFeedback.value = "Link kopiert – öffne ihn später am Laptop oder Desktop.";
  } catch {
    shareFeedback.value = `Dieser Link führt später wieder hierher: ${url}`;
  }
}

function clearShareFragment(): void {
  if (window.location.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} min`;
}

function percent(value: number): string { return `${Math.max(0, Math.min(100, value * 100)).toFixed(2)}%`; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unbekannter Fehler"; }
function disposeAudio(): void {
  if (audioDisposed) return;
  audioDisposed = true;
  engine.dispose();
}

onMounted(() => {
  window.addEventListener("keydown", onShortcut);
  window.addEventListener("pagehide", disposeAudio);
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("drop", onDrop);
  window.addEventListener("hashchange", onHashChange);
  void offerSharedFragment();
  if (loaded.warning) toast.toast({ title: "Sicherung geladen", description: loaded.warning, status: "warning", duration: 8000 });
});

onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  unsubscribe(); offStatus(); offPlayhead(); offTriggered(); disposeAudio();
  window.removeEventListener("keydown", onShortcut);
  window.removeEventListener("pagehide", disposeAudio);
  window.removeEventListener("dragover", onDragOver);
  window.removeEventListener("drop", onDrop);
  window.removeEventListener("hashchange", onHashChange);
});
</script>

<template>
  <section class="desktop-gate" aria-labelledby="desktop-gate-title">
    <img class="desktop-gate__art" :src="`${baseUrl}kitty-social.jpg`" alt="" width="1200" height="630" loading="lazy" decoding="async">
    <p class="eyebrow"><a href="/">Musik-Werkstatt</a> / Kitty</p>
    <h2 id="desktop-gate-title">Kitty</h2>
    <p>Hard- und Acid-Techno mit Drum Machine, 303-Linie, Stabs, Rave-Leads und Texturen. Alle Klänge entstehen live im Browser.</p>
    <p class="desktop-gate__hint">Zum Bauen braucht Kitty ein Fenster ab 1024 Pixel Breite, also einen Laptop oder Desktop.</p>
    <figure class="desktop-gate__demo">
      <figcaption>Hörprobe · das Hybrid-Werksprojekt, alle vier Szenen mit je vier Takten</figcaption>
      <audio controls preload="none">
        <source :src="`${baseUrl}hoerprobe.webm`" type="audio/webm; codecs=opus">
        <source :src="`${baseUrl}hoerprobe.mp3`" type="audio/mpeg">
      </audio>
    </figure>
    <p v-if="sharedOnPhone" class="desktop-gate__shared">Jemand hat dir ein Kitty-Projekt geschickt. Öffne diesen Link am Laptop oder Desktop, dort kannst du es übernehmen.</p>
    <div class="desktop-gate__actions">
      <KvButton @click="rememberLink">Link für später merken</KvButton>
      <a class="desktop-gate__link" href="/">Zur Musik-Werkstatt</a>
    </div>
    <p v-if="shareFeedback" class="desktop-gate__feedback" role="status">{{ shareFeedback }}</p>
  </section>

  <main class="kitty-shell" :data-triggered-tracks="triggeredTracks.join(',')" :data-audio-ducking="ducking ? 'active' : 'idle'" :data-acid-legato="acidLegato ? 'active' : 'idle'">
    <header class="topbar">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true">K</span>
        <div>
          <p class="eyebrow"><a class="home-link" href="/" title="Zurück zur Musik-Werkstatt">← Musik-Werkstatt</a> · HARD / ACID GROOVEBOX</p>
          <h1>KITTY</h1>
        </div>
      </div>
      <div class="project-head">
        <span class="project-name">{{ active.name }}</span>
        <KvBadge status="info">{{ PROFILE_DEFINITIONS[state.project.profile].label }}</KvBadge>
        <span class="save-state" data-save-status role="status">
          {{ state.autosave === "saving" ? "speichert …" : state.autosave === "saved" ? "gespeichert" : state.autosave === "error" ? "Speicherfehler" : "lokal" }}
        </span>
        <KvButton variant="secondary" size="sm" @click="projectsDialog = true">Projekte</KvButton>
        <KvButton size="sm" :disabled="projects.length >= MAX_PROJECTS" @click="newDialog = true">Neu</KvButton>
      </div>
    </header>

    <KvAlert v-if="state.transport.status === 'error' || state.transport.status === 'suspended'" :status="state.transport.status === 'error' ? 'error' : 'warning'" title="Audio braucht deine Hilfe">
      {{ state.transport.message }} — klicke erneut auf Start.
    </KvAlert>

    <section class="transport-panel" aria-label="Transport und musikalische Einstellungen">
      <KvButton class="start-button" size="lg" :loading="state.transport.status === 'starting'" @click="toggleTransport">
        {{ isPlaying ? "■ STOP" : state.transport.status === "error" || state.transport.status === "suspended" ? "▶ ERNEUT" : "▶ START" }}
      </KvButton>
      <div class="transport-readout" aria-live="polite">
        <span>{{ state.transport.message }}</span>
        <strong>{{ state.project.tempo }} BPM</strong>
      </div>
      <KvField label="Tempo" description="120–180 BPM">
        <KvSlider :model-value="state.project.tempo" :min="120" :max="180" :step="1" @update:model-value="dispatch({ type: 'project/tempo', value: Number($event) })" />
      </KvField>
      <KvField label="Grundton">
        <KvSelect :model-value="state.project.root" :options="rootOptions" @update:model-value="dispatch({ type: 'project/root', value: $event as RootNote })" />
      </KvField>
      <KvField label="Skala">
        <KvSelect :model-value="state.project.scale" :options="scaleOptions" @update:model-value="dispatch({ type: 'project/scale', value: $event as Scale })" />
      </KvField>
      <KvField label="Swing">
        <KvSlider :model-value="state.project.swing" :min="0" :max="0.35" :step="0.01" @update:model-value="dispatch({ type: 'project/swing', value: Number($event) })" />
      </KvField>
      <div class="history-buttons">
        <KvButton variant="ghost" size="sm" :disabled="!state.canUndo" @click="dispatch({ type: 'history/undo' })">↶ Undo</KvButton>
        <KvButton variant="ghost" size="sm" :disabled="!state.canRedo" @click="dispatch({ type: 'history/redo' })">↷ Redo</KvButton>
      </div>
    </section>

    <section class="scene-strip" aria-label="Szenen">
      <button
        v-for="(scene, index) in state.project.scenes"
        :key="scene.role"
        type="button"
        class="scene-pad"
        :class="{ 'is-selected': state.ui.selectedScene === index, 'is-running': isPlaying && state.transport.runningScene === index, 'is-queued': state.transport.queuedScene === index }"
        :aria-pressed="state.ui.selectedScene === index"
        :data-scene="index"
        @click="selectScene(index)"
      >
        <span>0{{ index + 1 }} · {{ scene.role.toUpperCase() }}</span>
        <strong>{{ scene.name }}</strong>
        <small>{{ state.transport.queuedScene === index ? "NÄCHSTER TAKT" : isPlaying && state.transport.runningScene === index ? "LÄUFT" : chainNextScene === index ? "DANACH" : "UMSCHALT+" + (index + 1) }}</small>
      </button>
    </section>

    <section class="arrangement" aria-label="Szenenfolge, Export und Teilen">
      <button type="button" class="chain-toggle" role="switch" aria-label="Szenenfolge" :aria-checked="state.ui.sceneChain" title="Spielt alle vier Szenen automatisch nacheinander" @click="toggleChain">
        <i aria-hidden="true" />SZENENFOLGE {{ state.ui.sceneChain ? "AN" : "AUS" }}
      </button>
      <div class="repeat-group" role="group" aria-label="Länge jeder Szene in der Szenenfolge">
        <button v-for="value in SCENE_REPEATS" :key="value" type="button" class="repeat-button" :aria-pressed="state.project.sceneRepeats === value" @click="dispatch({ type: 'project/scene-repeats', value })">{{ value * 4 }} TAKTE</button>
      </div>
      <span class="arrangement-hint">je Szene · ganzer Bogen {{ formatDuration(arcSeconds) }}</span>
      <div class="arrangement-actions">
        <KvButton variant="secondary" size="sm" @click="openExport">Als WAV exportieren</KvButton>
        <KvButton variant="secondary" size="sm" @click="shareLink">Link teilen</KvButton>
      </div>
    </section>

    <div class="workspace">
      <aside class="track-rail" aria-label="Spuren">
        <button
          v-for="(track, index) in TRACK_KINDS"
          :key="track"
          type="button"
          class="track-button"
          :class="{ 'is-selected': selectedTrack === track }"
          :aria-pressed="selectedTrack === track"
          :data-track="track"
          @click="dispatch({ type: 'ui/select-track', track })"
        >
          <span>0{{ index + 1 }}</span>
          <strong>{{ TRACK_LABELS[track].short }}</strong>
          <div class="mini-meter" aria-hidden="true"><i :style="{ width: percent(state.transport.trackPeaks[track]) }" /></div>
        </button>
      </aside>

      <section class="sequencer-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">{{ selectedScene.name }} · 4 TAKTE</p>
            <h2>{{ TRACK_LABELS[selectedTrack].name }}</h2>
            <p>{{ TRACK_LABELS[selectedTrack].description }}</p>
          </div>
          <div class="pattern-actions">
            <KvSelect :model-value="state.ui.variationAmount" :options="VARIATION_AMOUNTS.map((value: VariationAmount) => ({ value, label: value === 'subtle' ? 'Dezent' : value === 'lively' ? 'Lebendig' : 'Mutig' }))" aria-label="Stärke der Variation" @update:model-value="dispatch({ type: 'ui/variation-amount', amount: $event as VariationAmount })" />
            <KvButton variant="secondary" size="sm" @click="dispatch({ type: 'track/vary' })">V · Variation</KvButton>
            <KvButton variant="secondary" size="sm" @click="dispatch({ type: 'track/typical' })">R · Typisch</KvButton>
          </div>
        </div>
        <StepGrid
          :pattern="pattern"
          :selected-bar="state.ui.selectedBar"
          :selected-step="state.ui.selectedStep"
          :locks="state.ui.locks[selectedTrack]"
          :playhead-bar="state.transport.bar"
          :playhead-step="state.transport.step"
          :playing="isPlaying && state.transport.runningScene === state.ui.selectedScene"
          @press="(bar, stepIndex) => dispatch({ type: 'step/press', bar, step: stepIndex })"
          @select-bar="(bar) => dispatch({ type: 'ui/select-bar', bar })"
          @toggle-lock="(bar) => dispatch({ type: 'ui/toggle-lock', bar })"
        />
        <p class="grid-help">Klick oder Enter wählt einen Step; freie Steps werden aktiviert · Ausschalten erfolgt in den Step-Details · Schloss schützt den Takt vor Generatoren</p>

        <KvCard class="step-editor" padding="sm">
          <template #header>
            <h3>Step-Details</h3>
            <div v-if="step?.enabled" class="step-editor-actions">
              <KvBadge status="success">Takt {{ state.ui.selectedBar + 1 }} · Step {{ (state.ui.selectedStep ?? 0) + 1 }}</KvBadge>
              <KvButton variant="ghost" size="sm" @click="dispatch({ type: 'step/disable' })">Step ausschalten</KvButton>
            </div>
          </template>
          <p v-if="!step?.enabled" class="empty-step">Wähle oder aktiviere einen Step im Raster.</p>
          <div v-else-if="selectedTrack === 'drums'" class="drum-voices" role="group" aria-label="Drum-Stimmen">
            <button
              v-for="voice in DRUM_VOICES"
              :key="voice"
              type="button"
              class="voice-button"
              :class="{ 'is-active': step.drumVoices.includes(voice) }"
              :aria-pressed="step.drumVoices.includes(voice)"
              :disabled="drumDisabled(voice)"
              @click="dispatch({ type: 'step/drum-voice', voice })"
            >{{ DRUM_LABELS[voice] }}</button>
            <KvBadge>{{ step.drumVoices.length }}/2</KvBadge>
          </div>
          <div v-else class="step-fields">
            <KvField label="Tonrolle"><KvSelect :model-value="step.degree" :options="degreeOptions" @update:model-value="dispatch({ type: 'step/degree', value: Number($event) })" /></KvField>
            <KvField label="Lage"><KvSelect :model-value="step.octave" :options="octaveOptions" @update:model-value="dispatch({ type: 'step/octave', value: Number($event) })" /></KvField>
            <KvField label="Dynamik"><KvSelect :model-value="step.dynamics" :options="dynamicsOptions" @update:model-value="dispatch({ type: 'step/dynamics', value: $event as 'ghost' | 'normal' | 'accent' })" /></KvField>
            <KvField label="Länge"><KvSelect :model-value="step.length" :options="lengthOptions" @update:model-value="dispatch({ type: 'step/length', value: $event as 'short' | 'normal' | 'long' })" /></KvField>
            <button v-if="selectedTrack === 'acid'" type="button" class="slide-button" role="switch" :aria-checked="step.slide" @click="dispatch({ type: 'step/slide', value: !step.slide })">SLIDE {{ step.slide ? "AN" : "AUS" }}</button>
          </div>
        </KvCard>
      </section>

      <aside class="sound-panel">
        <KvCard padding="sm">
          <template #header><h3>Klangfarbe</h3><span>gilt für alle Szenen</span></template>
          <div class="preset-list">
            <KvTooltip v-for="preset in selectedPresets" :key="preset.id" :text="preset.hint" placement="left">
              <button type="button" class="preset-button" :class="{ 'is-active': state.project.soundPresets[selectedTrack] === preset.id }" :aria-pressed="state.project.soundPresets[selectedTrack] === preset.id" @click="dispatch({ type: 'project/preset', track: selectedTrack, value: preset.id as SoundPresetId })">
                <strong>{{ preset.label }}</strong><small>{{ preset.hint }}</small>
              </button>
            </KvTooltip>
          </div>
        </KvCard>
        <KvCard padding="sm">
          <template #header><h3>Makros</h3><span>sicher begrenzt</span></template>
          <KvField v-for="macro in (['color', 'pressure', 'space', 'motion', 'density'] as MacroKind[])" :key="macro" :label="MACRO_LABELS[macro]" :description="MACRO_HINTS[selectedTrack][macro]">
            <KvSlider :model-value="pattern.macros[macro]" :min="0" :max="1" :step="0.01" @update:model-value="dispatch({ type: 'track/macro', macro, value: Number($event) })" />
          </KvField>
        </KvCard>
      </aside>
    </div>

    <section class="mixer" aria-labelledby="mixer-heading">
      <div class="mixer-title"><p class="eyebrow">ECHTE SPURPEGEL</p><h2 id="mixer-heading">Mixer</h2></div>
      <div v-for="track in TRACK_KINDS" :key="track" class="mixer-channel" :data-track="track">
        <strong>{{ TRACK_LABELS[track].short }}</strong>
        <div class="level-meter" :aria-label="`Pegel ${TRACK_LABELS[track].name}`" role="meter" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(state.transport.trackPeaks[track] * 100)"><i :style="{ height: percent(state.transport.trackPeaks[track]) }" /></div>
        <KvSlider :model-value="state.project.mix.find((entry) => entry.instrument === track)?.volume ?? 0" :min="0" :max="1" :step="0.01" :aria-label="`Lautstärke ${TRACK_LABELS[track].name}`" @update:model-value="dispatch({ type: 'mix/volume', track, value: Number($event) })" />
        <div class="mix-buttons">
          <button type="button" :class="{ active: state.project.mix.find((entry) => entry.instrument === track)?.muted }" :aria-pressed="state.project.mix.find((entry) => entry.instrument === track)?.muted" @click="dispatch({ type: 'mix/mute', track })">M</button>
          <button type="button" :class="{ active: state.project.mix.find((entry) => entry.instrument === track)?.solo }" :aria-pressed="state.project.mix.find((entry) => entry.instrument === track)?.solo" @click="dispatch({ type: 'mix/solo', track })">S</button>
        </div>
      </div>
      <div class="master-channel">
        <strong>MASTER</strong>
        <div class="level-meter master" role="meter" aria-label="Masterpegel" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(state.transport.peak * 100)"><i :style="{ height: percent(state.transport.peak) }" /></div>
        <KvSlider :model-value="state.project.masterVolume" :min="0" :max="1" :step="0.01" aria-label="Masterlautstärke" @update:model-value="dispatch({ type: 'project/master', value: Number($event) })" />
      </div>
    </section>

    <footer><span>Alles läuft lokal in deinem Browser · Projekte sicherst du unter Projekte → Als Datei sichern.</span><span>LEERTASTE Start/Stop · 1–5 Spuren · UMSCHALT+1–4 Szenen · V Variation · R Typisch</span></footer>
  </main>

  <KvDialog v-model:open="newDialog" title="Neues Werkprojekt" description="Das Profil setzt nur dieses neue Projekt auf. Bestehende Musik bleibt unverändert." close-label="Schließen">
    <div class="dialog-stack">
      <KvField label="Projektname"><KvInput v-model="newName" maxlength="40" /></KvField>
      <KvRadioGroup v-model="newProfile" label="Profil bestätigen" :options="profileOptions" />
      <KvAlert status="info" title="Bewusste Auswahl">{{ PROFILE_DEFINITIONS[newProfile].description }}</KvAlert>
    </div>
    <template #footer>
      <KvButton variant="secondary" @click="newDialog = false">Abbrechen</KvButton>
      <KvButton @click="createProject">{{ PROFILE_DEFINITIONS[newProfile].label }} erstellen</KvButton>
    </template>
  </KvDialog>

  <KvDialog v-model:open="projectsDialog" title="Lokale Projekte" :description="`${projects.length} von ${MAX_PROJECTS} belegt`" close-label="Schließen" size="lg">
    <div class="project-list">
      <button v-for="project in projects" :key="project.id" type="button" :class="{ active: project.id === active.id }" @click="switchProject(project.id)">
        <strong>{{ project.name }}</strong><span>{{ new Date(project.updatedAt).toLocaleString('de-DE') }}</span>
      </button>
    </div>
    <KvField label="Aktives Projekt umbenennen"><KvInput v-model="renameValue" maxlength="40" /></KvField>
    <div class="project-file-actions">
      <KvButton variant="secondary" size="sm" @click="exportProject">Als Datei sichern</KvButton>
      <KvButton variant="secondary" size="sm" :disabled="projects.length >= MAX_PROJECTS" @click="importInput?.click()">Datei öffnen …</KvButton>
      <input ref="importInput" type="file" accept=".json,application/json" data-import-input hidden @change="onImportInput">
      <span>Projektdateien kannst du auch einfach ins Fenster ziehen.</span>
    </div>
    <template #footer>
      <KvButton variant="danger" :disabled="projects.length <= 1" @click="deleteDialog = true">Löschen</KvButton>
      <KvButton variant="secondary" @click="renameProject">Umbenennen</KvButton>
      <KvButton variant="secondary" :disabled="projects.length >= MAX_PROJECTS" @click="duplicateProject">Duplizieren</KvButton>
    </template>
  </KvDialog>

  <KvDialog v-model:open="exportDialog" title="Als WAV exportieren" description="Klingt wie die Wiedergabe und entsteht schneller als in Echtzeit. Läuft gerade Musik, wird sie dafür angehalten." close-label="Schließen">
    <div class="dialog-stack">
      <KvRadioGroup v-model="exportMode" label="Was soll in die Datei?" :options="exportOptions" />
      <p class="dialog-status" data-export-status role="status">{{ exportStatus }}</p>
    </div>
    <template #footer>
      <KvButton variant="secondary" :disabled="exporting" @click="exportDialog = false">Abbrechen</KvButton>
      <KvButton :loading="exporting" data-confirm-export @click="exportAudio">WAV erstellen</KvButton>
    </template>
  </KvDialog>

  <KvDialog v-model:open="shareDialog" title="Link teilen" :description="`Der Link enthält das ganze Projekt „${active.name}“. Er wird nirgends hochgeladen: Wer ihn öffnet, bekommt eine eigene Kopie.`" close-label="Schließen">
    <div class="share-row">
      <KvField label="Link"><KvInput :model-value="shareUrl" readonly data-share-url /></KvField>
      <KvButton variant="secondary" @click="copyShareUrl">Kopieren</KvButton>
    </div>
    <p class="dialog-status" data-share-status role="status">{{ shareStatus }}</p>
    <template #footer>
      <KvButton @click="shareDialog = false">Fertig</KvButton>
    </template>
  </KvDialog>

  <KvDialog v-model:open="sharedDialog" title="Geteiltes Projekt öffnen?" :description="sharedOffer ? `„${sharedOffer.name}“ · ${Math.round(sharedOffer.project.tempo)} BPM · ${ROOT_LABELS[sharedOffer.project.root]} ${SCALE_LABELS[sharedOffer.project.scale]}` : ''" close-label="Schließen">
    <p class="dialog-copy">Jemand hat dir dieses Projekt geschickt. Es wird als neues Projekt in deiner Liste angelegt; deine eigenen Projekte bleiben unverändert.</p>
    <KvAlert v-if="projects.length >= MAX_PROJECTS" status="warning" title="Alle Plätze belegt">Lösche zuerst ein Projekt und öffne den Link dann noch einmal.</KvAlert>
    <template #footer>
      <KvButton variant="secondary" @click="sharedDialog = false">Nicht übernehmen</KvButton>
      <KvButton :disabled="projects.length >= MAX_PROJECTS" @click="acceptShared">Als neues Projekt übernehmen</KvButton>
    </template>
  </KvDialog>

  <KvAlertDialog v-model:open="deleteDialog" title="Projekt wirklich löschen?" :description="`${active.name} und seine lokale Sicherung werden entfernt.`" cancel-label="Behalten" confirm-label="Endgültig löschen" destructive @confirm="deleteProject" />
</template>
