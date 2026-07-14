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
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ToneAudioEngine } from "./audio/engine";
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
import { DRUM_VOICES, ROOT_NOTES, SCALES, TRACK_KINDS, VARIATION_AMOUNTS } from "./domain/types";
import { KittyProjectRepository, MAX_PROJECTS } from "./storage";
import { canAddDrumVoice, KittyStore, selectedPattern, selectedStep, type Action } from "./store/store";

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
const newName = ref("Neues Set");
const newProfile = ref<GenreProfile>("hybrid");
const renameValue = ref(active.value.name);
let saveTimer: ReturnType<typeof setTimeout> | undefined;

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

const unsubscribe = store.subscribe((next, action) => {
  state.value = structuredClone(next);
  if (next.autosave !== "saving") return;
  engine.syncProject(next.project);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), action.type.startsWith("history/") ? 80 : 260);
});

const offStatus = engine.onStatus((event) => store.dispatch({ type: "transport/update", update: { status: event.status, message: event.message } }));
const offPlayhead = engine.onPlayhead((event) => store.dispatch({ type: "transport/update", update: {
  runningScene: event.scene,
  queuedScene: event.switched ? null : state.value.transport.queuedScene,
  bar: event.bar,
  step: event.step,
  peak: event.peak,
  trackPeaks: event.trackPeaks,
} }));

const offTriggered = engine.onPlayhead((event) => {
  triggeredTracks.value = [...new Set([...triggeredTracks.value, ...event.triggeredTracks])];
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

function currentProjectBeforeSwitch(): void {
  clearTimeout(saveTimer);
  if (store.getState().autosave === "saving") save();
  engine.stop();
  triggeredTracks.value = [];
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
  } catch (error) { toast.toast({ title: "Projekt konnte nicht erstellt werden", description: errorMessage(error), status: "error" }); }
}

function duplicateProject(): void {
  try { currentProjectBeforeSwitch(); applyProject(repository.duplicate(active.value, store.getState().project, projects.value), "Projekt dupliziert"); projectsDialog.value = false; }
  catch (error) { toast.toast({ title: "Duplizieren fehlgeschlagen", description: errorMessage(error), status: "error" }); }
}

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

function percent(value: number): string { return `${Math.max(0, Math.min(100, value * 100)).toFixed(2)}%`; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unbekannter Fehler"; }

onMounted(() => {
  window.addEventListener("keydown", onShortcut);
  if (loaded.warning) toast.toast({ title: "Sicherung geladen", description: loaded.warning, status: "warning", duration: 8000 });
});

onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  unsubscribe(); offStatus(); offPlayhead(); offTriggered(); engine.dispose();
  window.removeEventListener("keydown", onShortcut);
});
</script>

<template>
  <div class="desktop-gate" role="alert">
    <strong>Kitty braucht einen Desktop.</strong>
    <span>Bitte öffne die Groovebox in einem aktuellen Chromium-Browser mit mindestens 1024 × 720 Pixeln.</span>
  </div>

  <main class="kitty-shell" :data-triggered-tracks="triggeredTracks.join(',')">
    <header class="topbar">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true">K</span>
        <div>
          <p class="eyebrow">HARD / ACID GROOVEBOX</p>
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
        <small>{{ state.transport.queuedScene === index ? "NÄCHSTER TAKT" : isPlaying && state.transport.runningScene === index ? "LÄUFT" : "UMSCHALT+" + (index + 1) }}</small>
      </button>
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

    <footer><span>Alles läuft lokal in deinem Browser.</span><span>LEERTASTE Start/Stop · 1–5 Spuren · UMSCHALT+1–4 Szenen · V Variation · R Typisch</span></footer>
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
    <template #footer>
      <KvButton variant="danger" :disabled="projects.length <= 1" @click="deleteDialog = true">Löschen</KvButton>
      <KvButton variant="secondary" @click="renameProject">Umbenennen</KvButton>
      <KvButton variant="secondary" :disabled="projects.length >= MAX_PROJECTS" @click="duplicateProject">Duplizieren</KvButton>
    </template>
  </KvDialog>

  <KvAlertDialog v-model:open="deleteDialog" title="Projekt wirklich löschen?" :description="`${active.name} und seine lokale Sicherung werden entfernt.`" cancel-label="Behalten" confirm-label="Endgültig löschen" destructive @confirm="deleteProject" />
</template>
