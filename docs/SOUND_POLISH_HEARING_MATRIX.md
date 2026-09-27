# Kitty — Hörprüfung in 18 Punkten

Stand: 2026-09-28. Verbindlich für jede Veröffentlichung ist `npm run verify`:
Die Chromium-Abnahme rendert alle 15 Presets bei den Makroständen 0, 0,5 und 1,
alle Werksprofile bei 120/150/180 BPM und drei Stresstests und prüft Pegel,
Crest, DC, Mono- und Stereogrenzen sowie das Knoten-Budget der Engine. Diese
Hörprüfung ergänzt das, wenn sich der Klang ändert (Engine, Presets, Mix); für
reine Oberflächenänderungen ist sie nicht nötig.

## Vorbereitung

1. `npm run build`, dann `npm run preview --workspace=@kitty/app -- --host 127.0.0.1`.
2. Master unverändert lassen, zuerst über Kopfhörer, dann über kleine Lautsprecher.
3. Beim Vergleichen die Lautheit nach Gehör angleichen, nicht den lauteren Klang bevorzugen.
4. Nicht freigeben bei Klicks, Aussetzern, DC-artigem Druck, verschwindendem
   Kick-Body, dauerhaft hörbarem Limiter oder wanderndem Bassfundament.

## Presets (15 Punkte)

Je Preset: bei allen Makros auf Mitte hören, dann jedes Makro einmal langsam von
0 bis 1 ziehen. Ein Punkt ist erledigt, wenn beides sauber klingt.

| Spur / Preset | geprüft | Worauf achten |
| --- | --- | --- |
| Drums — Warehouse | [ ] | 909-Body, Click, dreifacher Clap, Hats |
| Drums — Stahl | [ ] | kurzer höherer Punch, harter Mittenbiss |
| Drums — Rumble | [ ] | trockener Attack, getrennte 40–110-Hz-Fahne; bei Makros auf 0 etwas leiser als vor dem Engine-Umbau (siehe unten) |
| Acid — Silverbox | [ ] | klassisch, Accent, direktes Slide |
| Acid — Venom | [ ] | schnell, scharf, kontrollierte Sättigung |
| Acid — Rubber | [ ] | tief, rund, längstes Glide |
| Stab — Beton | [ ] | kurz, dunkel, eng; Anschlag ohne Knackser |
| Stab — Chord | [ ] | offenes Root–Fifth–Third–Octave-Voicing |
| Stab — Flash | [ ] | drei FM-Stimmen, begrenzter Metall-Attack |
| Rave — Hoover | [ ] | vier Saws plus Pulse, Pitch-Attack, Chorus |
| Rave — Pulse | [ ] | präziser Kern, Suboktave, Stereo-Echo |
| Rave — Siren | [ ] | FM-Alarmkontur, begrenztes Vibrato |
| Texture — Noise | [ ] | kurzer bewegter Bandpass, sanfte Wanderung |
| Texture — Drone | [ ] | Mono-Grundton, breite Obertöne |
| Texture — Riser | [ ] | 1/2/4 Beats, Filter, Resonanz und Breite gemeinsam |

## Werksprofile (3 Punkte)

Neues Projekt im Profil anlegen, **Szenenfolge an**, 4 Takte je Szene, einen
ganzen Bogen durchhören. Auf musikalisches Kick-Pumping, mono-stabiles
Low-End, auslaufende Effektfahnen und Aussetzer beim Szenenwechsel achten.

| Profil | Tempo | geprüft | Notizen |
| --- | ---: | --- | --- |
| Hard | 155 BPM | [ ] | |
| Acid | 145 BPM | [ ] | |
| Hybrid | 150 BPM | [ ] | |

## Bekannte Unterschiede nach dem Engine-Umbau (2026-09)

Die schlanke Engine baut die Tone.js-Bausteine aus nativen Knoten exakt nach;
die Offline-Suite liegt für alle Werksprofile innerhalb von 0,1 dB RMS. Anders
klingt nur der Beginn einer Note: Die alte Tone-Kette übernahm eine neue
Tonhöhe in Chromium erst am nächsten 128-Sample-Block, Noten begannen also bis
zu 2,9 ms lang auf der vorigen Tonhöhe (eine Kick mal mit 50 Hz, mal mit
400 Hz). Jetzt stimmt die Tonhöhe ab dem ersten Sample. Messbar ist das vor
allem bei Makros auf 0: Stab-Spitzen bis −1,8 dB, Drums Rumble −0,6 dB RMS.
Beim Hören: Stab Beton, Chord und Flash sowie Drums Rumble bei Makros auf 0.

## Abschluss

- [ ] 15 Preset-Punkte abgenommen
- [ ] 3 Profil-Punkte abgenommen
- [ ] `npm run verify` auf genau diesem Stand grün

Angehört von: ____________________  Datum: ____________________
