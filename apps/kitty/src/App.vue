<script setup lang="ts">
import {
  KvAlert,
  KvAlertDialog,
  KvBadge,
  KvButton,
  KvCard,
  KvCheckbox,
  KvDialog,
  KvField,
  KvInput,
  KvRadioGroup,
  KvSelect,
  KvSwitch,
  useKvToast,
} from "@kinky-vibes/ui";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { ToneAudioEngine, type PerformanceState } from "./audio/engine";
import { stemsArchive } from "./audio/stems";
import { AppLink, fitTempo, type LinkPeer } from "./link";
import { planSeconds, renderPlan, renderProject, type ExportMode } from "./audio/render";
import { audibleRange, encodePcm16Wav, encodeWav, MAX_RECORDING_SECONDS, trimmedLength } from "klangwerk";
import { MidiLink, type MidiStatus } from "./midi";
import { Tour, type TourStep } from "./tour";
import { PlaybackWakeLock } from "./wake-lock";
import { versionLabel } from "./version";
import StepGrid from "./components/StepGrid.vue";
import { ARC_LABELS, ARC_LENGTHS, AUTOPILOT_PHASES, Autopilot, PHASE_LABELS, arcBars, type ArcLength, type AutopilotPlan, type AutopilotView } from "./autopilot";
import UnitSlider from "./components/UnitSlider.vue";
import { vHint } from "./hint";
import { DRUM_LABELS, DRUM_SHORT, percentLabel } from "./labels";
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
import { DRUM_VOICES, LOOP_LENGTHS, MACRO_KINDS, MAX_TEMPO, MIN_TEMPO, RATCHETS, ROOT_NOTES, SCALES, SCENE_COUNT, SCENE_REPEATS, STEP_CHANCES, TRACK_KINDS, VARIATION_AMOUNTS } from "./domain/types";
import { allowsRatchet, loopPosition, sceneSteps, stepChance, stepRatchet } from "./domain/patterns";
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

const TOUR_STEPS: readonly TourStep[] = [
  { target: ".start-button", title: "Start und Stop", text: "Mit Start oder der Leertaste läuft das Werksprojekt sofort. Alle Klänge entstehen live im Browser." },
  { target: ".auto-bar", title: "Auto-Acid", text: "Ein Klick, und Kitty spielt endlos Acid Techno: baut Spannung auf, bricht ein, droppt und fängt neu an. Du kannst jederzeit eingreifen." },
  { target: ".scene-strip", title: "Vier Szenen", text: "Aufwärmen, Druck, Break und Peak. Eine gewählte Szene übernimmt am nächsten Takt, der Groove reißt nicht ab." },
  { target: ".sequencer-panel", title: "Spuren und Steps", text: "Links wählst du eine der fünf Spuren, im Raster setzt du Steps; ein zweiter Klick schaltet sie wieder aus. V baut eine Variation, R ein typisches Pattern; ein Schloss schützt einen Takt." },
  { target: ".arrangement", title: "Vom Loop zum Track", text: "Die Szenenfolge spielt alle Szenen nacheinander. Exportiere das Ergebnis als WAV oder teile es als Link. Mit ? findest du Tastenkürzel und diese Tour wieder." },
];
const SHORTCUTS: readonly [string[], string][] = [
  [["Leertaste"], "Start und Stop"],
  [["1 – 5"], "Spur wählen: Drums, Acid, Stab, Rave, FX"],
  [["Umschalt", "1 – 4"], "Szene wählen; läuft Musik, wechselt sie am nächsten Takt"],
  [["Pfeiltasten"], "Im Step-Raster von Step zu Step"],
  [["Enter"], "Step setzen; auf dem gewählten Step schaltet es ihn aus"],
  [["Entf"], "Step im Raster ausschalten"],
  [["V"], "Variation in der gewählten Stärke"],
  [["R"], "Typisches Pattern für Spur und Profil"],
  [["A"], "Aufnahme starten und beenden"],
  [["P"], "Live-Tasten: 1 – 5 schalten Spuren am nächsten Takt stumm"],
  [["F halten"], "Filter zu (Tiefpass), mit Umschalt auf (Hochpass)"],
  [["B halten"], "Break: Kick und Acid raus; loslassen: Drop am nächsten Takt. Am Button rastet kurzes Tippen ein"],
  [["Esc"], "Dialog oder Hinweis schließen"],
  [["Strg", "Z"], "Rückgängig"],
  [["Strg", "Umschalt", "Z"], "Wiederholen"],
  [["?"], "Diese Hilfe"],
];
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
const appVersion = versionLabel();
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
const liveState = ref<PerformanceState>({ muted: [], pending: [], breakActive: false, dropPending: false });
const liveKeys = ref(false);
const recording = ref(false);
const recordingSeconds = ref(0);
const filterValue = ref(0);
let recordingTimer: ReturnType<typeof setInterval> | undefined;
let filterTarget = 0;
let filterFrame: number | null = null;
const exportStems = ref(false);
const linkOn = ref(false);
const linkPeers = ref<LinkPeer[]>([]);
/** The partner's tempo Kitty follows, or `null` while it plays its own. */
let linkTempo: number | null = null;
const link = new AppLink("kitty", {
  start: (at, bpm, from) => void followStart(at, bpm, from),
  stop: () => { if (isPlaying.value) engine.stop(); },
  tempo: (bpm, from) => followTempo(bpm, from),
  peers: (peers) => { linkPeers.value = peers; },
});
const helpDialog = ref(false);
const midiDialog = ref(false);
const midiStatus = ref<MidiStatus>({ state: MidiLink.supported() ? "off" : "unsupported", inputs: [] });
const midiRevision = ref(0);
const tour = new Tour(TOUR_STEPS, { storageKey: "kitty.tour.v1", className: "kitty-tour" });
const wakeLock = new PlaybackWakeLock();
const pendingMacros = new Map<number, number>();
let macroFrame: number | null = null;
const midi = new MidiLink("kitty.midi.v1", {
  status: (status) => { midiStatus.value = status; midiRevision.value += 1; },
  learned: () => { midiRevision.value += 1; },
  clockTempo: (bpm) => followClockTempo(bpm),
  start: () => void startFromMidi(),
  stop: () => { if (isPlaying.value) stopPlayback(); },
  control: (index, value) => queueMacro(index, value),
});
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let audioDisposed = false;
const PREVIEW_KEY = "kitty.preview.v1";
const AUTOPILOT_KEY = "kitty.autopilot.v1";
/** The autopilot changes the music every beat; it is saved this often instead of after each change. */
const AUTOPILOT_SAVE_MS = 4_000;
const autopilot = new Autopilot({ arcLength: readArcLength() });
const autopilotOn = ref(false);
const autopilotView = shallowRef<AutopilotView | null>(null);
const arcLength = ref<ArcLength>(autopilot.arcLength);
/** A hand on the filter fader: the autopilot keeps off the filter meanwhile. */
let filterHeld = false;
const FULL_UI_KEY = "kitty.full-ui.v1";
const stepGrid = ref<InstanceType<typeof StepGrid> | null>(null);
/** Plays a step once when it is set or changed while the music is stopped. */
const preview = ref(readPreference(PREVIEW_KEY) !== "off");
/** The full interface in a narrow window (a zoomed desktop, a small tablet) instead of the hint page. */
const fullUi = ref(readPreference(FULL_UI_KEY) === "on");
document.documentElement.toggleAttribute("data-full-ui", fullUi.value);
/** When the break button went down, and whether that press started the break (a short tap then latches it). */
let breakPressedAt = 0;
let breakFromIdle = false;
/** The control last pressed with a pointer: Space there is Start/Stop, not a second press. */
let pointerControl: Element | null = null;

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
const degreeOptions = DEGREE_LABELS.map((label, value) => ({ value, label: `${value + 1} · ${label}` }));
const octaveOptions = [1, 2, 3, 4, 5].map((value) => ({ value, label: `Oktave ${value}` }));
const chanceOptions = STEP_CHANCES.map((value) => ({ value, label: value === 1 ? "Immer" : `${Math.round(value * 100)} %` }));
const ratchetOptions = RATCHETS.map((value) => ({ value, label: value === 1 ? "Einmal" : `${value} × schnell` }));
const loopOptions = LOOP_LENGTHS.map((value) => ({ value, label: Number.isInteger(value / 16) ? `Länge ${value} · ${value / 16} ${value === 16 ? "Takt" : "Takte"}` : `Länge ${value} Steps` }));
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
/** Where the selected track's own loop stands, or `null` when its scene is not playing. */
const trackPlayhead = computed(() => {
  const { transport, ui } = state.value;
  if (!isPlaying.value || transport.runningScene !== ui.selectedScene) return null;
  return loopPosition(pattern.value.loopSteps, sceneSteps(transport));
});
const gridLegend = computed(() => selectedTrack.value === "drums"
  ? DRUM_VOICES.map((voice) => `${DRUM_SHORT[voice]} ${DRUM_LABELS[voice]}`).join(" · ")
  : `Zahl = Tonstufe: ${DEGREE_LABELS.map((label, index) => `${index + 1} ${label}`).join(" · ")}`);
const projectsFull = computed(() => projects.value.length >= MAX_PROJECTS);
const chainNextScene = computed(() => state.value.ui.sceneChain && isPlaying.value && state.value.transport.queuedScene === null ? (state.value.transport.runningScene + 1) % SCENE_COUNT : null);

const unsubscribe = store.subscribe((next, action) => {
  state.value = structuredClone(next);
  engine.setSceneChain(next.ui.sceneChain ? next.project.sceneRepeats : null);
  if (action.type === "project/tempo" && link.enabled) {
    // Turning the tempo takes the lead: Kitty plays its own tempo and the partner follows.
    releaseLinkTempo();
    link.announceTempo(next.project.tempo);
  }
  if (next.autosave !== "saving") return;
  engine.syncProject(next.project);
  if (action.type.startsWith("auto/")) {
    saveTimer ??= setTimeout(() => save(), AUTOPILOT_SAVE_MS);
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), action.type.startsWith("history/") ? 80 : 260);
});

const offStatus = engine.onStatus((event) => store.dispatch({ type: "transport/update", update: { status: event.status, message: event.message } }));
const offPlayhead = engine.onPlayhead((event) => {
  const current = store.getState();
  // With the scene chain or the autopilot on, the editor follows the music when it was showing the running scene.
  if (event.switched && (current.ui.sceneChain || autopilotOn.value) && current.ui.selectedScene === current.transport.runningScene) {
    store.dispatch({ type: "ui/select-scene", scene: event.scene });
  }
  const chain = current.ui.sceneChain && event.step === 0 ? chainMessage(event.scene, event.pass, event.chainNext) : null;
  store.dispatch({ type: "transport/update", update: {
    ...(chain ? { message: chain } : {}),
    runningScene: event.scene,
    queuedScene: event.switched ? null : store.getState().transport.queuedScene,
    bar: event.bar,
    step: event.step,
    pass: event.pass,
    peak: event.peak,
    trackPeaks: event.trackPeaks,
  } });
});

const offPerformance = engine.onPerformance((next) => { liveState.value = next; });

const offAutopilot = engine.onPlayhead((event) => {
  if (!autopilotOn.value) return;
  applyAutopilotPlan(autopilot.step(event.step, store.getState().project));
  autopilotView.value = autopilot.view(event.step);
});

const offTriggered = engine.onPlayhead((event) => {
  triggeredTracks.value = [...new Set([...triggeredTracks.value, ...event.triggeredTracks])];
  ducking.value ||= event.ducking;
  acidLegato.value ||= event.acidLegato;
});

/** `mergeKey` makes one slider drag or knob turn a single undo step. */
function dispatch(action: Action, mergeKey?: string): void { store.dispatch(action, mergeKey === undefined ? {} : { mergeKey }); }

function save(): void {
  saveTimer = undefined;
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
  if (isPlaying.value || state.value.transport.status === "starting") stopPlayback();
  else await startPlayback();
}

/** Every local start: alone, or as the leader of a coupled app starting at the same moment. */
async function startPlayback(): Promise<void> {
  const scene = state.value.ui.selectedScene;
  if (!link.enabled || link.peers.length === 0) {
    await engine.start(scene);
    return;
  }
  releaseLinkTempo();
  await engine.start(scene, link.announceStart(state.value.project.tempo));
}

function stopPlayback(): void {
  engine.stop();
  if (link.enabled) link.announceStop();
}

function toggleLink(): void {
  if (link.enabled) {
    link.disable();
    releaseLinkTempo();
  } else {
    // The click lets this tab start audio later, when the partner starts it.
    void engine.initialize();
    link.enable();
  }
  linkOn.value = link.enabled;
  linkPeers.value = link.peers;
}

async function followStart(at: number, bpm: number, from: LinkPeer): Promise<void> {
  linkTempo = fitTempo(bpm, MIN_TEMPO, MAX_TEMPO);
  engine.setTempoOverride(linkTempo);
  if (isPlaying.value) engine.stop();
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  await engine.start(state.value.ui.selectedScene, at);
  dispatch({ type: "transport/update", update: { message: `Gleichtakt mit ${appName(from.app)} · ${Math.round(linkTempo)} BPM` } });
}

function followTempo(bpm: number, from: LinkPeer): void {
  if (linkTempo === null) return;
  linkTempo = fitTempo(bpm, MIN_TEMPO, MAX_TEMPO);
  engine.setTempoOverride(linkTempo);
  if (isPlaying.value) dispatch({ type: "transport/update", update: { message: `Gleichtakt mit ${appName(from.app)} · ${Math.round(linkTempo)} BPM` } });
}

function disableLink(): void { link.disable(); }

function releaseLinkTempo(): void {
  if (linkTempo === null) return;
  linkTempo = null;
  engine.setTempoOverride(null);
}

function appName(app: string): string {
  return app === "kitty" ? "Kitty" : app === "groovebox" ? "Groovebox" : app;
}

const linkTitle = computed(() => {
  if (!linkOn.value) return "Gleichtakt: mit der Groovebox in einem anderen Tab gemeinsam starten, stoppen und im Tempo bleiben";
  if (linkPeers.value.length === 0) return "Gleichtakt an – öffne die Groovebox in einem zweiten Tab und schalte dort Gleichtakt ein";
  return `Gleichtakt mit ${[...new Set(linkPeers.value.map((peer) => appName(peer.app)))].join(", ")}: wer startet, gibt das Tempo vor`;
});

const MIDI_STATES: Record<MidiStatus["state"], string> = { unsupported: "nicht verfügbar", off: "nicht verbunden", connecting: "verbindet …", ready: "verbunden", denied: "vom Browser abgelehnt", error: "ließ sich nicht öffnen" };
const midiHint = computed(() => {
  const { state: midiState, inputs } = midiStatus.value;
  const devices = midiState === "ready" ? (inputs.length > 0 ? `: ${inputs.join(", ")}` : ", noch kein Gerät") : "";
  return `MIDI-Controller und MIDI-Clock · ${MIDI_STATES[midiState]}${devices}`;
});

const filterText = computed(() => {
  const value = Math.round(filterValue.value * 100);
  return value === 0 ? "offen" : value < 0 ? `Tiefpass ${-value} %` : `Hochpass ${value} %`;
});

function mixFor(track: TrackKind) {
  return state.value.project.mix.find((entry) => entry.instrument === track);
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
  saveTimer = undefined;
  if (store.getState().autosave === "saving") save();
}

function chainMessage(scene: number, pass: number, next: number | null): string {
  const { project } = store.getState();
  const name = project.scenes[scene]?.name ?? `Szene ${scene + 1}`;
  const following = next === null ? "" : ` → ${project.scenes[next]?.name ?? `Szene ${next + 1}`}`;
  return `Szenenfolge · ${name} ${Math.min(pass + 1, project.sceneRepeats)}/${project.sceneRepeats}${following}`;
}

const midiView = computed(() => {
  void midiRevision.value;
  return { mapping: [...midi.mapping], learning: midi.learningIndex, followClock: midi.followClock, clock: midi.clockBpm };
});

function followClockTempo(bpm: number | null): void {
  engine.setTempoOverride(bpm);
  midiRevision.value += 1;
  if (bpm !== null || isPlaying.value) dispatch({ type: "transport/update", update: { message: bpm === null ? "MIDI-Clock beendet – eigenes Tempo" : `MIDI-Clock · ${bpm} BPM` } });
}

async function startFromMidi(): Promise<void> {
  if (isPlaying.value || state.value.transport.status === "starting") return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    dispatch({ type: "transport/update", update: { message: "MIDI-Start: klick einmal in Kitty, damit der Browser Ton erlaubt" } });
    return;
  }
  await startPlayback();
}

function queueMacro(index: number, value: number): void {
  pendingMacros.set(index, value);
  macroFrame ??= requestAnimationFrame(() => {
    macroFrame = null;
    for (const [macroIndex, macroValue] of pendingMacros) {
      const macro = MACRO_KINDS[macroIndex];
      if (macro) dispatch({ type: "track/macro", macro, value: macroValue }, `midi-${macro}`);
    }
    pendingMacros.clear();
  });
}

function connectMidi(): void {
  // The click lets the browser start audio, so a later MIDI start can play.
  void engine.initialize();
  void midi.connect();
}

function disconnectMidi(): void {
  midi.disconnect();
  followClockTempo(null);
}

function learnMacro(index: number): void {
  midi.learn(midi.learningIndex === index ? null : index);
  midiRevision.value += 1;
}

function setFollowClock(follow: boolean): void {
  midi.setFollowClock(follow);
  midiRevision.value += 1;
}

function resetMidiMapping(): void {
  midi.resetMapping();
  midiRevision.value += 1;
}

function startTour(): void {
  helpDialog.value = false;
  requestAnimationFrame(() => tour.start());
}

watch(isPlaying, (playing) => { wakeLock.playing = playing; });
watch(isPlaying, (playing) => { if (!playing) stopAutopilot(); });

const tensionPercent = computed(() => Math.round((autopilotView.value?.tension ?? 0) * 100));
const tensionText = computed(() => {
  const view = autopilotView.value;
  if (!view) return "Auto-Acid ist aus";
  return `${tensionPercent.value} %, ${view.rising ? "steigt" : "fällt"} · ${PHASE_LABELS[view.phase]}, Takt ${view.bar} von ${view.bars}`;
});

function readArcLength(): ArcLength {
  const stored = readPreference(AUTOPILOT_KEY);
  return (ARC_LENGTHS as readonly string[]).includes(stored ?? "") ? stored as ArcLength : "medium";
}

function setArcLength(length: ArcLength): void {
  arcLength.value = length;
  autopilot.arcLength = length;
  writePreference(AUTOPILOT_KEY, length);
}

function arcHint(length: ArcLength): string {
  const bars = arcBars(length);
  return `${ARC_LABELS[length]}: ein Spannungsbogen dauert ${bars} Takte, bei ${state.value.project.tempo} BPM etwa ${formatDuration((bars * 4 * 60) / state.value.project.tempo)}`;
}

async function toggleAutopilot(): Promise<void> {
  if (autopilotOn.value) { stopAutopilot(); return; }
  const fromSilence = !isPlaying.value;
  // The autopilot chooses the scenes itself.
  if (state.value.ui.sceneChain) dispatch({ type: "ui/scene-chain", value: false });
  store.armCheckpoint();
  autopilotOn.value = true;
  const plan = autopilot.start(fromSilence, store.getState().project);
  autopilotView.value = autopilot.view();
  if (fromSilence) dispatch({ type: "ui/select-scene", scene: plan.scene ?? 0 });
  applyAutopilotPlan(plan, !fromSilence);
  if (!fromSilence) return;
  await startPlayback();
  if (!isPlaying.value) stopAutopilot(false);
}

/** Carries out what the autopilot decided for this moment. */
function applyAutopilotPlan(plan: AutopilotPlan, queueScene = true): void {
  for (const action of plan.actions) store.dispatch(action);
  if (plan.scene !== undefined && queueScene && isPlaying.value) {
    dispatch({ type: "transport/update", update: { queuedScene: engine.queueScene(plan.scene) } });
  }
  for (const [track, muted] of Object.entries(plan.mutes ?? {}) as [TrackKind, boolean][]) engine.setPerformanceMute(track, muted);
  if (plan.breakOn) engine.setBreak(true);
  if (plan.drop) releaseBreak();
  if (plan.filter !== undefined) autoFilter(plan.filter);
  if (plan.message) dispatch({ type: "transport/update", update: { message: plan.message } });
}

function stopAutopilot(announce = true): void {
  if (!autopilotOn.value) return;
  autopilotOn.value = false;
  const muted = autopilot.mutedTracks;
  const changed = !store.checkpointPending;
  autopilot.stop();
  store.disarmCheckpoint();
  autopilotView.value = null;
  // The music goes back into your hands with every track audible and the filter open.
  for (const track of muted) engine.setPerformanceMute(track, false);
  releaseBreak();
  autoFilter(0);
  if (!announce) return;
  const description = !changed ? "Alles bleibt, wie es war." : store.getState().canUndo ? "Rückgängig (Strg+Z) führt zur Musik von vor dem Auto-Modus zurück." : "Die Musik bleibt, wie Auto-Acid sie hinterlassen hat.";
  toast.toast({ title: "Auto-Acid aus", description, status: "info" });
}

/** The autopilot's master filter, unless a hand is on it (F held, fader dragged or springing back). */
function autoFilter(value: number): void {
  if (filterHeld || filterTarget !== 0 || filterFrame !== null) return;
  filterValue.value = value;
  engine.setPerformanceFilter(value);
}

function onFilterPointerDown(): void { filterHeld = true; }

function onFilterPointerUp(): void {
  filterHeld = false;
  glideFilter(0, 0.18);
}
watch(midiDialog, (open) => { if (!open && midi.learningIndex !== null) learnMacro(midi.learningIndex); });

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
  if (compactView()) return;
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
    const stems = exportStems.value;
    const buffer = await renderProject(project, mode, (fraction) => {
      exportStatus.value = `Wird gerendert … ${Math.round(fraction * 100)} % von etwa ${estimate} Sekunden. Lass das Fenster dabei offen.`;
    }, { stems });
    const musicFrames = Math.round(planSeconds(project, renderPlan(project, mode)) * buffer.sampleRate);
    const suffix = mode.kind === "arc" ? "bogen" : fileSlug(project.scenes[mode.scene]?.name ?? "", "szene");
    const base = `${fileSlug(active.value.name)}-${suffix}`;
    if (stems) {
      const { archive, included, silent } = stemsArchive(buffer, TRACK_KINDS, musicFrames);
      if (included.length === 0) throw new Error("Alle Spuren sind stumm.");
      downloadBlob(archive, `${base}-stems.zip`);
      exportStatus.value = "";
      exportDialog.value = false;
      const skipped = silent.length > 0 ? ` Stumm und deshalb nicht dabei: ${silent.map((track) => TRACK_LABELS[track as TrackKind].name).join(", ")}.` : "";
      toast.toast({ title: "Stems gespeichert", description: `${base}-stems.zip mit ${included.length} Spuren liegt jetzt in deinen Downloads.${skipped}`, status: "success" });
      return;
    }
    const wav = encodeWav(buffer, trimmedLength(buffer, musicFrames));
    const fileName = `${base}.wav`;
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
  if (compactView()) { sharedOnPhone.value = true; return; }
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

function readPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writePreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* Kept for this visit only. */ }
}

watch(preview, (on) => writePreference(PREVIEW_KEY, on ? "on" : "off"));
watch(fullUi, (on) => {
  writePreference(FULL_UI_KEY, on ? "on" : "off");
  document.documentElement.toggleAttribute("data-full-ui", on);
});

/** Narrow windows get the hint page, unless someone chose the full interface there. */
function compactView(): boolean {
  return !fullUi.value && window.matchMedia("(max-width: 1023px)").matches;
}

function openFullUi(): void {
  fullUi.value = true;
  void offerSharedFragment();
}

function pressStep(bar: number, index: number): void {
  dispatch({ type: "step/press", bar, step: index });
  auditionSelected();
}

function clearStep(bar: number, index: number): void {
  dispatch({ type: "step/clear", bar, step: index });
}

/** A change to the selected step, which is then heard once while the music is stopped. */
function editStep(action: Action): void {
  dispatch(action);
  auditionSelected();
}

function auditionSelected(): void {
  const { ui, transport } = store.getState();
  if (!preview.value || ui.selectedStep === null || transport.status === "playing" || transport.status === "starting") return;
  void engine.audition(ui.selectedScene, ui.selectedTrack, ui.selectedBar, ui.selectedStep);
}

function focusStepGrid(): void {
  stepGrid.value?.focusGrid();
}

function openNewDialog(): void {
  // With every place taken, the project list says what to do instead.
  if (projectsFull.value) projectsDialog.value = true;
  else newDialog.value = true;
}

function drumDisabled(voice: DrumVoice): boolean {
  return Boolean(step.value?.enabled && !step.value.drumVoices.includes(voice) && !canAddDrumVoice(step.value.drumVoices, voice));
}

function onShortcut(event: KeyboardEvent): void {
  // The step grid and other controls handle their own keys first.
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("[role='dialog'], .kitty-tour")) return;
  // Fields that take letters and digits keep them; sliders, buttons and the page pass them on.
  if (target?.matches("select, textarea, [contenteditable='true'], input:not([type='range'])")) return;
  const key = event.key.toLowerCase();
  if (event.key === "?") { event.preventDefault(); helpDialog.value = true; return; }
  if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "history/redo" : "history/undo" }); return; }
  if ((event.ctrlKey || event.metaKey) && key === "y") { event.preventDefault(); dispatch({ type: "history/redo" }); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === "Space") {
    // A control reached with the keyboard keeps its own Space; after a click, Space is Start/Stop.
    if (target?.matches("button, a, [role='button'], [role='switch']") && target !== pointerControl) return;
    event.preventDefault();
    if (!event.repeat) void toggleTransport();
    return;
  }
  if (key === "a") { event.preventDefault(); if (!event.repeat) void toggleRecording(); return; }
  if (key === "p") { event.preventDefault(); if (!event.repeat) liveKeys.value = !liveKeys.value; return; }
  if (key === "b") { event.preventDefault(); if (!event.repeat) engine.setBreak(true); return; }
  if (key === "f") { event.preventDefault(); if (!event.repeat) glideFilter(event.shiftKey ? 0.85 : -0.85, 1.4); return; }
  // Shift turns the digits into symbols on most layouts; the physical key still names the number.
  const digit = /^[1-9]$/.test(event.key) ? Number(event.key) : Number(/^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1] ?? Number.NaN);
  if (liveKeys.value && !event.shiftKey && digit >= 1 && digit <= 5) { event.preventDefault(); togglePerformanceMute(TRACK_KINDS[digit - 1]!); return; }
  if (event.shiftKey && digit >= 1 && digit <= 4) { event.preventDefault(); selectScene(digit - 1); return; }
  if (!event.shiftKey && digit >= 1 && digit <= 5) { event.preventDefault(); dispatch({ type: "ui/select-track", track: TRACK_KINDS[digit - 1]! }); return; }
  if (key === "v") { event.preventDefault(); dispatch({ type: "track/vary" }); return; }
  if (key === "r") { event.preventDefault(); dispatch({ type: "track/typical" }); }
}

function onPointerDownCapture(event: PointerEvent): void {
  pointerControl = (event.target as Element | null)?.closest("button, a, input, [role='button'], [role='switch']") ?? null;
}

/** B and F are held; their release belongs to the key-up. */
function onLiveKeyUp(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if (key === "b") releaseBreak();
  if (key === "f" && filterTarget !== 0) glideFilter(0, 0.2);
}

function onWindowBlur(): void {
  releaseBreak();
  if (filterTarget !== 0 || filterValue.value !== 0) glideFilter(0, 0.18);
}

function releaseBreak(): void {
  if (liveState.value.breakActive && !liveState.value.dropPending) engine.setBreak(false);
}

function onBreakDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  breakPressedAt = performance.now();
  breakFromIdle = !liveState.value.breakActive;
  if (breakFromIdle) engine.setBreak(true);
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

/** Holding plays break and drop; a short tap latches the break until the next tap. */
function onBreakUp(): void {
  const tapped = breakFromIdle && performance.now() - breakPressedAt < 300;
  breakFromIdle = false;
  if (!tapped) releaseBreak();
}

/** Enter or Space on the focused button: break on, and on the next press the drop. */
function onBreakClick(event: MouseEvent): void {
  if (event.detail !== 0) return;
  if (liveState.value.breakActive) releaseBreak();
  else engine.setBreak(true);
}

function togglePerformanceMute(track: TrackKind): void {
  const muted = liveState.value.muted.includes(track);
  // A second press before the bar line takes the change back.
  engine.setPerformanceMute(track, liveState.value.pending.includes(track) ? muted : !muted);
}

function onFilterInput(event: Event): void {
  cancelFilterGlide();
  filterValue.value = Number((event.target as HTMLInputElement).value) / 100;
  engine.setPerformanceFilter(filterValue.value);
}

/** Moves the filter to `target` over `seconds`, as holding F or releasing the fader does. */
function glideFilter(target: number, seconds: number): void {
  cancelFilterGlide();
  filterTarget = target;
  const from = filterValue.value;
  const started = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - started) / (seconds * 1000));
    filterValue.value = from + (target - from) * progress;
    engine.setPerformanceFilter(filterValue.value);
    filterFrame = progress < 1 ? requestAnimationFrame(step) : null;
  };
  filterFrame = requestAnimationFrame(step);
}

function cancelFilterGlide(): void {
  if (filterFrame !== null) cancelAnimationFrame(filterFrame);
  filterFrame = null;
}

async function toggleRecording(): Promise<void> {
  if (recording.value) { await finishRecording(); return; }
  try {
    if (!isPlaying.value) await startPlayback();
    await engine.startRecording();
  } catch (error) {
    toast.toast({ title: "Aufnahme nicht gestartet", description: errorMessage(error), status: "error" });
    return;
  }
  recording.value = true;
  recordingSeconds.value = 0;
  recordingTimer = setInterval(() => {
    recordingSeconds.value = engine.recordingSeconds;
    if (recordingSeconds.value >= MAX_RECORDING_SECONDS) void finishRecording("Nach 15 Minuten automatisch beendet.");
  }, 250);
}

async function finishRecording(note?: string): Promise<void> {
  if (!recording.value) return;
  recording.value = false;
  clearInterval(recordingTimer);
  const pcm = await engine.stopRecording();
  recordingSeconds.value = 0;
  const range = audibleRange(pcm);
  if (!range) { toast.toast({ title: "Aufnahme war still", description: "Es wurde nichts Hörbares aufgenommen.", status: "warning" }); return; }
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const fileName = `${fileSlug(active.value.name)}-live-${stamp}.wav`;
  downloadBlob(new Blob([encodePcm16Wav(pcm, range.start, range.end)], { type: "audio/wav" }), fileName);
  toast.toast({ title: "Aufnahme gespeichert", description: `${fileName} (${formatClock((range.end - range.start) / pcm.sampleRate)} min) liegt in deinen Downloads.${note ? ` ${note}` : ""}`, status: "success" });
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
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
  window.addEventListener("pointerdown", onPointerDownCapture, true);
  window.addEventListener("keyup", onLiveKeyUp);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("pagehide", disposeAudio);
  window.addEventListener("pagehide", disableLink);
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("drop", onDrop);
  window.addEventListener("hashchange", onHashChange);
  void offerSharedFragment();
  void midi.restore();
  if (!compactView() && tour.pending && !window.location.hash.startsWith("#p=")) requestAnimationFrame(() => tour.start());
  if (loaded.warning) toast.toast({ title: "Sicherung geladen", description: loaded.warning, status: "warning", duration: 8000 });
});

onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  unsubscribe(); offStatus(); offPlayhead(); offTriggered(); offPerformance(); offAutopilot(); disposeAudio();
  clearInterval(recordingTimer);
  cancelFilterGlide();
  window.removeEventListener("keydown", onShortcut);
  window.removeEventListener("pointerdown", onPointerDownCapture, true);
  window.removeEventListener("keyup", onLiveKeyUp);
  window.removeEventListener("blur", onWindowBlur);
  window.removeEventListener("pagehide", disposeAudio);
  window.removeEventListener("pagehide", disableLink);
  link.disable();
  window.removeEventListener("dragover", onDragOver);
  window.removeEventListener("drop", onDrop);
  window.removeEventListener("hashchange", onHashChange);
  tour.close(false);
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
    <div class="desktop-gate__full">
      <p>Hast du die Seite am Laptop nur vergrößert, oder willst du es trotzdem probieren? Die volle Oberfläche lässt sich dann seitlich scrollen.</p>
      <KvButton variant="secondary" data-open-full-ui @click="openFullUi">Volle Oberfläche trotzdem öffnen</KvButton>
    </div>
  </section>

  <div class="kitty-shell" :data-triggered-tracks="triggeredTracks.join(',')" :data-audio-ducking="ducking ? 'active' : 'idle'" :data-acid-legato="acidLegato ? 'active' : 'idle'">
    <a class="skip-link" href="#step-grid" @click.prevent="focusStepGrid">Zum Step-Raster springen</a>
    <header class="topbar">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true">K</span>
        <div>
          <p class="eyebrow"><a v-hint="'Zurück zur Übersicht der Musik-Werkstatt'" class="home-link" href="/"><span aria-hidden="true">← </span>Musik-Werkstatt</a> · HARD / ACID GROOVEBOX</p>
          <h1>KITTY</h1>
        </div>
      </div>
      <div class="project-head">
        <span class="project-name">{{ active.name }}</span>
        <KvBadge status="info">{{ PROFILE_DEFINITIONS[state.project.profile].label }}</KvBadge>
        <span class="save-state" data-save-status>
          {{ state.autosave === "saving" ? (autopilotOn ? "sichert laufend" : "speichert …") : state.autosave === "saved" ? "gespeichert" : state.autosave === "error" ? "Speicherfehler" : "lokal" }}
        </span>
        <KvButton variant="secondary" size="sm" @click="projectsDialog = true">Projekte</KvButton>
        <KvButton v-hint="projectsFull ? `Alle ${MAX_PROJECTS} Plätze belegt – unter Projekte kannst du eines löschen` : 'Neues Projekt aus einem Werkprofil anlegen'" size="sm" @click="openNewDialog">Neu</KvButton>
        <button v-if="AppLink.supported()" v-hint="linkTitle" type="button" class="head-button" :aria-pressed="linkOn" @click="toggleLink"><i class="link-led" :data-state="!linkOn ? 'off' : linkPeers.length > 0 ? 'linked' : 'waiting'" aria-hidden="true" />GLEICHTAKT</button>
        <button v-if="midiStatus.state !== 'unsupported'" v-hint="midiHint" type="button" class="head-button" @click="midiDialog = true"><i class="midi-led" :data-state="midiStatus.state" aria-hidden="true" />MIDI</button>
        <button v-hint="'Hilfe, Tastenkürzel und Tour (?)'" type="button" class="head-button" aria-label="Hilfe und Tastenkürzel" @click="helpDialog = true">?</button>
      </div>
    </header>

    <main id="kitty-main" class="kitty-main">
      <KvAlert v-if="state.transport.status === 'error' || state.transport.status === 'suspended'" :status="state.transport.status === 'error' ? 'error' : 'warning'" title="Audio braucht deine Hilfe">
        {{ state.transport.message }} — klicke erneut auf Start.
      </KvAlert>

      <section class="transport-panel" aria-labelledby="transport-heading">
        <h2 id="transport-heading" class="kv-visually-hidden">Transport und Grundeinstellungen</h2>
        <KvButton v-hint="'Start und Stop (Leertaste)'" class="start-button" size="lg" :loading="state.transport.status === 'starting'" @click="toggleTransport">
          <span aria-hidden="true">{{ isPlaying ? "■" : "▶" }}</span> {{ isPlaying ? "STOP" : state.transport.status === "error" || state.transport.status === "suspended" ? "ERNEUT" : "START" }}
        </KvButton>
        <div class="transport-readout">
          <span aria-live="polite">{{ state.transport.message }}</span>
          <strong>{{ state.project.tempo }} BPM</strong>
        </div>
        <KvField label="Tempo">
          <UnitSlider :model-value="state.project.tempo" :min="MIN_TEMPO" :max="MAX_TEMPO" :step="1" :format="(value) => `${value} BPM`" :display="(value) => String(value)" @update:model-value="dispatch({ type: 'project/tempo', value: $event }, 'tempo')" />
        </KvField>
        <KvField label="Grundton">
          <KvSelect :model-value="state.project.root" :options="rootOptions" @update:model-value="dispatch({ type: 'project/root', value: $event as RootNote })" />
        </KvField>
        <KvField label="Skala">
          <KvSelect :model-value="state.project.scale" :options="scaleOptions" @update:model-value="dispatch({ type: 'project/scale', value: $event as Scale })" />
        </KvField>
        <KvField label="Swing">
          <UnitSlider :model-value="state.project.swing" :min="0" :max="0.35" :step="0.01" :format="percentLabel" @update:model-value="dispatch({ type: 'project/swing', value: $event }, 'swing')" />
        </KvField>
        <div class="history-buttons">
          <KvButton v-hint="'Rückgängig (Strg+Z)'" class="history-button" variant="ghost" size="sm" aria-label="Rückgängig" :disabled="!state.canUndo" @click="dispatch({ type: 'history/undo' })"><span aria-hidden="true">↶</span></KvButton>
          <KvButton v-hint="'Wiederholen (Strg+Umschalt+Z)'" class="history-button" variant="ghost" size="sm" aria-label="Wiederholen" :disabled="!state.canRedo" @click="dispatch({ type: 'history/redo' })"><span aria-hidden="true">↷</span></KvButton>
        </div>
      </section>

      <section class="auto-bar" aria-labelledby="auto-heading" :data-active="autopilotOn ? '' : undefined">
        <h2 id="auto-heading" class="kv-visually-hidden">Auto-Acid</h2>
        <button
          v-hint="'Spielt endlos Acid Techno und regelt alles selbst: Szenen, Filter und Resonanz der 303, Variationen, Riser, Break und Drop – in Spannungsbögen. Du kannst jederzeit eingreifen; Rückgängig holt danach die Musik von vorher zurück.'"
          type="button"
          class="auto-toggle"
          role="switch"
          :aria-checked="autopilotOn"
          data-autopilot
          @click="toggleAutopilot"
        ><i aria-hidden="true" />AUTO-ACID {{ autopilotOn ? "AN" : "AUS" }}</button>
        <div class="repeat-group" role="group" aria-label="Länge eines Spannungsbogens">
          <button v-for="length in ARC_LENGTHS" :key="length" v-hint="arcHint(length)" type="button" class="repeat-button" :aria-pressed="arcLength === length" @click="setArcLength(length)">{{ ARC_LABELS[length].toUpperCase() }}</button>
        </div>
        <ol class="auto-phases" aria-label="Phasen eines Spannungsbogens">
          <li v-for="phase in AUTOPILOT_PHASES" :key="phase" :data-phase="phase" :aria-current="autopilotView?.phase === phase ? 'step' : undefined">{{ PHASE_LABELS[phase] }}</li>
        </ol>
        <div class="auto-tension">
          <span id="tension-label">SPANNUNG</span>
          <div class="tension-meter" role="meter" aria-labelledby="tension-label" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="tensionPercent" :aria-valuetext="tensionText"><i :style="{ width: `${tensionPercent}%` }" /></div>
          <output aria-hidden="true">{{ autopilotView ? `${tensionPercent} %` : "–" }}</output>
        </div>
        <span v-if="autopilotView" class="auto-progress" data-autopilot-progress>TAKT {{ autopilotView.bar }}/{{ autopilotView.bars }} · BOGEN {{ autopilotView.arc }}</span>
      </section>

      <section class="scene-strip" aria-labelledby="scenes-heading">
        <h2 id="scenes-heading" class="kv-visually-hidden">Szenen</h2>
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

      <section class="arrangement" aria-labelledby="arrangement-heading">
        <h2 id="arrangement-heading" class="kv-visually-hidden">Szenenfolge, Export und Teilen</h2>
        <button v-hint="'Spielt alle vier Szenen automatisch nacheinander und beginnt dann von vorn'" type="button" class="chain-toggle" role="switch" aria-label="Szenenfolge" :aria-checked="state.ui.sceneChain" @click="toggleChain">
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

      <section class="live-bar" aria-labelledby="live-heading">
        <h2 id="live-heading" class="kv-visually-hidden">Live spielen und aufnehmen</h2>
        <button v-hint="'Nimmt auf, was du hörst, und speichert es als WAV (A)'" type="button" class="live-record" :aria-pressed="recording" @click="toggleRecording">
          <i aria-hidden="true" />{{ recording ? "AUFNAHME STOPPEN" : "AUFNAHME" }} <output data-record-time>{{ formatClock(recordingSeconds) }}</output>
        </button>
        <button v-hint="'Mit Live-Tasten schalten 1–5 die Spuren am nächsten Takt stumm (P)'" type="button" class="live-keys" :aria-pressed="liveKeys" @click="liveKeys = !liveKeys">LIVE-TASTEN <kbd>P</kbd></button>
        <div class="live-mutes" role="group" aria-label="Spuren am nächsten Takt stumm schalten">
          <button
            v-for="(track, index) in TRACK_KINDS"
            :key="track"
            type="button"
            class="live-mute"
            :data-track="track"
            :aria-pressed="liveState.muted.includes(track)"
            :data-pending="liveState.pending.includes(track) ? '' : undefined"
            :aria-label="`${TRACK_LABELS[track].short} – ${TRACK_LABELS[track].name} am nächsten Takt stumm schalten`"
            @click="togglePerformanceMute(track)"
          >{{ TRACK_LABELS[track].short }}<kbd v-if="liveKeys">{{ index + 1 }}</kbd></button>
        </div>
        <label v-hint="'F halten: Tiefpass · Umschalt+F halten: Hochpass · federt beim Loslassen zurück'" class="live-filter">
          <span>FILTER</span>
          <input type="range" min="-100" max="100" step="1" :value="Math.round(filterValue * 100)" data-perf-filter aria-label="Filter, links Tiefpass, rechts Hochpass" :aria-valuetext="filterText" @input="onFilterInput" @pointerdown="onFilterPointerDown" @pointerup="onFilterPointerUp" @pointercancel="onFilterPointerUp" @keyup="glideFilter(0, 0.18)">
        </label>
        <button
          v-hint="'Halten: Kick und Acid raus, der Hochpass steigt; loslassen bringt den Drop am nächsten Takt. Kurz tippen rastet den Break ein, nochmal tippen bringt den Drop (B)'"
          type="button"
          class="live-break"
          data-perf-break
          :data-state="liveState.dropPending ? 'drop' : liveState.breakActive ? 'break' : 'idle'"
          :aria-pressed="liveState.breakActive"
          @pointerdown="onBreakDown"
          @pointerup="onBreakUp"
          @pointercancel="onBreakUp"
          @click="onBreakClick"
        >BREAK → DROP <kbd>B</kbd></button>
      </section>

      <div class="workspace">
        <div class="track-rail" role="group" aria-label="Spur wählen">
          <button
            v-for="(track, index) in TRACK_KINDS"
            :key="track"
            v-hint="`${TRACK_LABELS[track].name}: ${TRACK_LABELS[track].description} (${index + 1})`"
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
        </div>

        <section class="sequencer-panel" aria-labelledby="track-heading">
          <div class="section-head">
            <div>
              <p class="eyebrow">{{ selectedScene.name }} · 4 TAKTE</p>
              <h2 id="track-heading">{{ TRACK_LABELS[selectedTrack].name }}</h2>
              <p>{{ TRACK_LABELS[selectedTrack].description }}</p>
            </div>
            <div class="pattern-actions">
              <KvSelect v-hint="'Wie stark V die Spur verändert'" :model-value="state.ui.variationAmount" :options="VARIATION_AMOUNTS.map((value: VariationAmount) => ({ value, label: value === 'subtle' ? 'Dezent' : value === 'lively' ? 'Lebendig' : 'Mutig' }))" aria-label="Stärke der Variation" @update:model-value="dispatch({ type: 'ui/variation-amount', amount: $event as VariationAmount })" />
              <KvButton v-hint="'Verändert die Spur in der gewählten Stärke; geschützte Takte bleiben (V)'" variant="secondary" size="sm" @click="dispatch({ type: 'track/vary' })">V · Variation</KvButton>
              <KvButton v-hint="'Ersetzt die Spur durch ein typisches Pattern für Profil und Szene; geschützte Takte bleiben (R)'" variant="secondary" size="sm" @click="dispatch({ type: 'track/typical' })">R · Typisch</KvButton>
              <KvSelect v-hint="'Kürzere Spuren laufen gegen die vier Takte der Szene weiter und verschieben sich dabei'" class="loop-select" :model-value="pattern.loopSteps ?? 64" :options="loopOptions" aria-label="Spurlänge" @update:model-value="dispatch({ type: 'track/loop', value: Number($event) })" />
            </div>
          </div>
          <StepGrid
            id="step-grid"
            ref="stepGrid"
            :pattern="pattern"
            :track-name="TRACK_LABELS[selectedTrack].name"
            :selected-bar="state.ui.selectedBar"
            :selected-step="state.ui.selectedStep"
            :locks="state.ui.locks[selectedTrack]"
            :playhead-bar="trackPlayhead?.bar ?? 0"
            :playhead-step="trackPlayhead?.step ?? 0"
            :playing="trackPlayhead !== null"
            @press="pressStep"
            @clear="clearStep"
            @toggle-lock="(bar) => dispatch({ type: 'ui/toggle-lock', bar })"
          />
          <p class="grid-help">Klick oder Enter setzt einen Step; ein zweiter Klick auf den gewählten Step oder Entf schaltet ihn aus · Pfeiltasten wandern durchs Raster · das Schloss schützt einen Takt vor V und R</p>
          <p class="grid-legend" data-grid-legend>{{ gridLegend }}</p>

          <KvCard class="step-editor" padding="sm">
            <template #header>
              <h3>Step-Details</h3>
              <div class="step-editor-actions">
                <KvBadge v-if="step?.enabled" status="success">Takt {{ state.ui.selectedBar + 1 }} · Step {{ (state.ui.selectedStep ?? 0) + 1 }}</KvBadge>
                <KvButton v-if="step?.enabled" variant="ghost" size="sm" @click="dispatch({ type: 'step/disable' })">Step ausschalten</KvButton>
                <button v-hint="'Spielt einen Step einmal an, wenn du ihn setzt oder änderst, solange die Musik steht'" type="button" class="preview-toggle" role="switch" :aria-checked="preview" data-preview @click="preview = !preview"><i aria-hidden="true" />VORHÖREN</button>
              </div>
            </template>
            <p v-if="!step?.enabled" class="empty-step">Wähle oder aktiviere einen Step im Raster.</p>
            <div v-else-if="selectedTrack === 'drums'" class="drum-voices" role="group" aria-label="Drum-Stimmen, höchstens zwei pro Step">
              <button
                v-for="voice in DRUM_VOICES"
                :key="voice"
                type="button"
                class="voice-button"
                :class="{ 'is-active': step.drumVoices.includes(voice) }"
                :aria-pressed="step.drumVoices.includes(voice)"
                :disabled="drumDisabled(voice)"
                @click="editStep({ type: 'step/drum-voice', voice })"
              ><b aria-hidden="true">{{ DRUM_SHORT[voice] }}</b>{{ DRUM_LABELS[voice] }}</button>
              <span class="voice-count">{{ step.drumVoices.length }} von 2</span>
            </div>
            <div v-else class="step-fields">
              <KvField label="Tonstufe"><KvSelect :model-value="step.degree" :options="degreeOptions" @update:model-value="editStep({ type: 'step/degree', value: Number($event) })" /></KvField>
              <KvField label="Lage"><KvSelect :model-value="step.octave" :options="octaveOptions" @update:model-value="editStep({ type: 'step/octave', value: Number($event) })" /></KvField>
              <KvField label="Dynamik"><KvSelect :model-value="step.dynamics" :options="dynamicsOptions" @update:model-value="editStep({ type: 'step/dynamics', value: $event as 'ghost' | 'normal' | 'accent' })" /></KvField>
              <KvField label="Länge"><KvSelect :model-value="step.length" :options="lengthOptions" @update:model-value="editStep({ type: 'step/length', value: $event as 'short' | 'normal' | 'long' })" /></KvField>
              <button v-if="selectedTrack === 'acid'" v-hint="'Gleitet ohne neuen Anschlag in diesen Ton'" type="button" class="slide-button" role="switch" :aria-checked="step.slide" @click="editStep({ type: 'step/slide', value: !step.slide })">SLIDE {{ step.slide ? "AN" : "AUS" }}</button>
            </div>
            <div v-if="step?.enabled" class="step-extras">
              <KvField label="Chance"><KvSelect :model-value="stepChance(step)" :options="chanceOptions" @update:model-value="dispatch({ type: 'step/probability', value: Number($event) })" /></KvField>
              <KvField v-if="allowsRatchet(selectedTrack)" label="Wiederholung"><KvSelect :model-value="stepRatchet(step)" :options="ratchetOptions" @update:model-value="editStep({ type: 'step/ratchet', value: Number($event) })" /></KvField>
              <p>Chance würfelt bei jedem Durchlauf neu, Wiederholungen teilen den Step in schnelle Schläge.</p>
            </div>
          </KvCard>
        </section>

        <aside class="sound-panel" aria-label="Klang der Spur">
          <KvCard padding="sm">
            <template #header><h3>Klangfarbe</h3><span>gilt für alle Szenen</span></template>
            <div class="preset-list" role="group" aria-label="Klangfarbe">
              <button v-for="preset in selectedPresets" :key="preset.id" type="button" class="preset-button" :class="{ 'is-active': state.project.soundPresets[selectedTrack] === preset.id }" :aria-pressed="state.project.soundPresets[selectedTrack] === preset.id" @click="dispatch({ type: 'project/preset', track: selectedTrack, value: preset.id as SoundPresetId })">
                <strong>{{ preset.label }}</strong><small>{{ preset.hint }}</small>
              </button>
            </div>
          </KvCard>
          <KvCard padding="sm">
            <template #header><h3>Makros</h3><span>sicher begrenzt</span></template>
            <KvField v-for="macro in MACRO_KINDS" :key="macro" :label="MACRO_LABELS[macro]" :description="MACRO_HINTS[selectedTrack][macro]">
              <UnitSlider :model-value="pattern.macros[macro]" :min="0" :max="1" :step="0.01" :format="percentLabel" @update:model-value="dispatch({ type: 'track/macro', macro, value: $event }, `macro-${macro}`)" />
            </KvField>
          </KvCard>
        </aside>
      </div>

      <section class="mixer" aria-labelledby="mixer-heading">
        <div class="mixer-title"><p class="eyebrow">ECHTE SPURPEGEL</p><h2 id="mixer-heading">Mixer</h2></div>
        <div v-for="track in TRACK_KINDS" :key="track" class="mixer-channel" role="group" :aria-label="TRACK_LABELS[track].name" :data-track="track">
          <strong aria-hidden="true">{{ TRACK_LABELS[track].short }}</strong>
          <div class="level-meter" :aria-label="`Pegel ${TRACK_LABELS[track].name}`" role="meter" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(state.transport.trackPeaks[track] * 100)"><i :style="{ height: percent(state.transport.trackPeaks[track]) }" /></div>
          <UnitSlider :model-value="mixFor(track)?.volume ?? 0" :min="0" :max="1" :step="0.01" :format="percentLabel" :aria-label="`Lautstärke ${TRACK_LABELS[track].name}`" @update:model-value="dispatch({ type: 'mix/volume', track, value: $event }, `volume-${track}`)" />
          <div class="mix-buttons">
            <button v-hint="'Stumm – wird im Projekt gespeichert'" type="button" class="mix-mute" :class="{ active: mixFor(track)?.muted }" :aria-pressed="mixFor(track)?.muted" :aria-label="`M – ${TRACK_LABELS[track].name} stumm`" @click="dispatch({ type: 'mix/mute', track })">M</button>
            <button v-hint="'Solo – dann sind nur Spuren mit Solo zu hören'" type="button" class="mix-solo" :class="{ active: mixFor(track)?.solo }" :aria-pressed="mixFor(track)?.solo" :aria-label="`S – ${TRACK_LABELS[track].name} solo`" @click="dispatch({ type: 'mix/solo', track })">S</button>
          </div>
        </div>
        <div class="master-channel" role="group" aria-label="Master">
          <strong aria-hidden="true">MASTER</strong>
          <div class="level-meter master" role="meter" aria-label="Masterpegel" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(state.transport.peak * 100)"><i :style="{ height: percent(state.transport.peak) }" /></div>
          <UnitSlider :model-value="state.project.masterVolume" :min="0" :max="1" :step="0.01" :format="percentLabel" aria-label="Masterlautstärke" @update:model-value="dispatch({ type: 'project/master', value: $event }, 'master')" />
        </div>
      </section>
    </main>

    <footer>
      <span>Alles läuft lokal in deinem Browser · Projekte sicherst du unter Projekte → Als Datei sichern · <span data-app-version>{{ appVersion }}</span></span>
      <span>LEERTASTE Start/Stop · 1–5 Spuren · UMSCHALT+1–4 Szenen · V Variation · R Typisch · A Aufnahme · B Break · ? Hilfe</span>
      <button v-if="fullUi" type="button" class="compact-return" @click="fullUi = false">Hinweisseite statt Oberfläche zeigen</button>
    </footer>
  </div>

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

  <KvDialog v-model:open="projectsDialog" title="Lokale Projekte" :description="`${projects.length} von ${MAX_PROJECTS} Plätzen belegt · alles bleibt in diesem Browser`" close-label="Schließen" size="lg">
    <KvAlert v-if="projectsFull" class="projects-full" status="info" title="Alle Plätze belegt">Lösche ein Projekt, um ein neues anzulegen, eines zu duplizieren oder eine Datei zu öffnen.</KvAlert>
    <h3 id="project-open-heading" class="dialog-heading">Projekt öffnen</h3>
    <div class="project-list" role="group" aria-labelledby="project-open-heading">
      <button v-for="project in projects" :key="project.id" type="button" :class="{ active: project.id === active.id }" :aria-current="project.id === active.id ? 'true' : undefined" @click="switchProject(project.id)">
        <strong>{{ project.name }}</strong><span>{{ project.id === active.id ? "geöffnet · " : "" }}{{ new Date(project.updatedAt).toLocaleString('de-DE') }}</span>
      </button>
    </div>
    <section class="project-active" aria-labelledby="project-active-heading">
      <h3 id="project-active-heading" class="dialog-heading">Geöffnet: {{ active.name }}</h3>
      <form class="rename-row" @submit.prevent="renameProject">
        <KvField label="Neuer Name"><KvInput v-model="renameValue" maxlength="40" /></KvField>
        <KvButton type="submit" variant="secondary">Umbenennen</KvButton>
      </form>
      <div class="project-file-actions">
        <KvButton variant="secondary" size="sm" @click="exportProject">Als Datei sichern</KvButton>
        <KvButton variant="secondary" size="sm" :disabled="projectsFull" @click="duplicateProject">Duplizieren</KvButton>
        <KvButton variant="danger" size="sm" :disabled="projects.length <= 1" @click="deleteDialog = true">Löschen</KvButton>
        <span v-if="projects.length <= 1">Das einzige Projekt bleibt immer erhalten.</span>
      </div>
    </section>
    <div class="project-file-actions project-import">
      <KvButton variant="secondary" size="sm" :disabled="projectsFull" @click="importInput?.click()">Datei öffnen …</KvButton>
      <input ref="importInput" type="file" accept=".json,application/json" data-import-input hidden @change="onImportInput">
      <span>Projektdateien kannst du auch einfach ins Fenster ziehen.</span>
    </div>
    <template #footer>
      <KvButton @click="projectsDialog = false">Fertig</KvButton>
    </template>
  </KvDialog>

  <KvDialog v-model:open="exportDialog" title="Als WAV exportieren" description="Klingt wie die Wiedergabe und entsteht schneller als in Echtzeit. Läuft gerade Musik, wird sie dafür angehalten." close-label="Schließen">
    <div class="dialog-stack">
      <KvRadioGroup v-model="exportMode" label="Was soll in die Datei?" :options="exportOptions" />
      <KvCheckbox v-model="exportStems" label="Spuren einzeln (Stems)" description="Jede Spur als eigene WAV-Datei in einem ZIP, vor dem Master-Bus – zum Weitermischen in einer DAW." data-export-stems />
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

  <KvDialog v-model:open="helpDialog" title="Hilfe und Tastenkürzel" description="Die Kürzel wirken überall außer in Eingabefeldern und Auswahllisten. Hat ein Button per Tastatur den Fokus, löst die Leertaste ihn aus." close-label="Schließen">
    <dl class="shortcut-list">
      <div v-for="[keys, meaning] in SHORTCUTS" :key="meaning">
        <dt><template v-for="(key, index) in keys" :key="key"><template v-if="index > 0"> + </template><kbd>{{ key }}</kbd></template></dt>
        <dd>{{ meaning }}</dd>
      </div>
    </dl>
    <template #footer>
      <KvButton variant="secondary" @click="startTour">Tour starten</KvButton>
      <KvButton @click="helpDialog = false">Fertig</KvButton>
    </template>
  </KvDialog>

  <KvDialog v-model:open="midiDialog" title="MIDI" description="Ein Controller dreht an den Makros, eine andere App oder ein Gerät gibt mit seiner MIDI-Clock Tempo, Start und Stop vor." close-label="Schließen">
    <div class="midi-panel" data-midi-body>
      <template v-if="midiStatus.state === 'connecting'">
        <p role="status">Verbinde … Bestätige die Nachfrage des Browsers.</p>
      </template>
      <template v-else-if="midiStatus.state !== 'ready'">
        <p>Kitty hört nur zu: Clock und Regler werden gelesen, gesendet wird nichts.</p>
        <KvAlert v-if="midiStatus.state === 'denied'" status="warning" title="MIDI abgelehnt">Erlaube MIDI in den Website-Einstellungen und versuche es noch einmal.</KvAlert>
        <KvAlert v-if="midiStatus.state === 'error'" status="error" title="MIDI ließ sich nicht öffnen">Steck das Gerät neu ein und versuche es noch einmal.</KvAlert>
        <KvButton @click="connectMidi">MIDI verbinden</KvButton>
      </template>
      <template v-else>
        <p><strong>Eingänge:</strong> {{ midiStatus.inputs.length > 0 ? midiStatus.inputs.join(", ") : "Noch kein Gerät. Steck einen Controller an, er erscheint hier von selbst." }}</p>
        <KvSwitch :model-value="midiView.followClock" label="Tempo, Start und Stop folgen der MIDI-Clock" @update:model-value="setFollowClock(Boolean($event))" />
        <p class="midi-clock" role="status">{{ !midiView.followClock ? "Die Clock wird ignoriert." : midiView.clock === null ? "Keine Clock – Kitty spielt im eigenen Tempo." : `Clock: ${midiView.clock} BPM` }}</p>
        <h3>Regler → Makros der gewählten Spur</h3>
        <ul class="midi-map">
          <li v-for="(macro, index) in MACRO_KINDS" :key="macro">
            <span>{{ MACRO_LABELS[macro] }}</span>
            <output>{{ midiView.learning === index ? "Dreh jetzt einen Regler …" : (midiView.mapping[index] ?? -1) >= 0 ? `CC ${midiView.mapping[index]}` : "nicht zugewiesen" }}</output>
            <KvButton variant="secondary" size="sm" :aria-pressed="midiView.learning === index" @click="learnMacro(index)">{{ midiView.learning === index ? "Abbrechen" : "Zuweisen" }}</KvButton>
          </li>
        </ul>
        <div class="midi-actions">
          <KvButton variant="ghost" size="sm" @click="resetMidiMapping">CC 70–74 wiederherstellen</KvButton>
          <KvButton variant="ghost" size="sm" @click="disconnectMidi">MIDI trennen</KvButton>
        </div>
      </template>
    </div>
    <template #footer>
      <KvButton @click="midiDialog = false">Fertig</KvButton>
    </template>
  </KvDialog>

  <KvAlertDialog v-model:open="deleteDialog" title="Projekt wirklich löschen?" :description="`${active.name} und seine lokale Sicherung werden entfernt.`" cancel-label="Behalten" confirm-label="Endgültig löschen" destructive @confirm="deleteProject" />
</template>
