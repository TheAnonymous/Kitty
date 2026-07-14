# Kitty Sound-Polish V2 — Hörabnahme

Stand: 2026-07-14. Diese Matrix ist der letzte lokale Gate vor Push oder GitHub-Pages-Deploy. Die automatische Chromium-Abnahme muss unmittelbar davor grün sein; die Kästchen bleiben bis zur menschlichen Hörfreigabe offen.

## Vorbereitung

1. `npm run build`
2. `npm run preview --workspace=@kitty/app -- --host 127.0.0.1`
3. Factory-Projekt beziehungsweise Preset wählen und den Master unverändert lassen.
4. Für Presets nacheinander drei Makrostände hören: **Mitte** = alle fünf Makros 0,5; **Minimum** = alle 0; **Maximum** = alle 1. Die Lautheit beim Vergleichen nach Gehör angleichen, nicht den lauteren Klang bevorzugen.
5. Jeden Eintrag zuerst über Kopfhörer, danach über kleine Lautsprecher abhören. Keine Freigabe bei Klicks, DC-artigem Druck, verschwindendem Kick-Body, scharfem Dauer-Limiter oder instabilem Basszentrum.

Kürzel in der Preset-Matrix: `M` = Mitte, `0` = Minimum, `1` = Maximum; `KH` = Kopfhörer, `LS` = kleine Lautsprecher.

## Presets

| Spur / Preset | M KH | M LS | 0 KH | 0 LS | 1 KH | 1 LS | Notizen |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Drums — Warehouse | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | 909-Body, Click, dreifacher Clap, Hats |
| Drums — Stahl | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | kurzer höherer Punch, harter Mittenbiss |
| Drums — Rumble | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | trockener Attack, getrennte 40–110-Hz-Fahne |
| Acid — Silverbox | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | klassisch, Accent, direktes Slide |
| Acid — Venom | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | schnell, scharf, kontrollierte Sättigung |
| Acid — Rubber | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | tief, rund, längstes Glide |
| Stab — Beton | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | kurz, dunkel, eng |
| Stab — Chord | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | offenes Root–Fifth–Third–Octave-Voicing |
| Stab — Flash | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | drei FM-Stimmen, begrenzter Metall-Attack |
| Rave — Hoover | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | vier Saws plus Pulse, Pitch-Attack, Chorus |
| Rave — Pulse | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | präziser Kern, Suboktave, Stereo-Echo |
| Rave — Siren | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | FM-Alarmkontur, begrenztes Vibrato |
| Texture — Noise | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | kurzer bewegter Bandpass, sanfte Wanderung |
| Texture — Drone | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | Mono-Grundton, breite Obertöne |
| Texture — Riser | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | 1/2/4 Beats, Filter/Resonanz/Breite gemeinsam |

## Factory-Mixe

Für jeden Durchlauf alle vier Szenen mindestens einmal hören. Besonders auf hörbares, musikalisches Kick-Pumping, mono-stabiles Low-End, auslaufende Effektfahnen und den Master-Crest achten.

| Profil | Tempo | Kopfhörer | Kleine Lautsprecher | Notizen |
| --- | ---: | --- | --- | --- |
| Hard | 120 BPM | [ ] | [ ] | |
| Hard | 150 BPM | [ ] | [ ] | |
| Hard | 180 BPM | [ ] | [ ] | |
| Acid | 120 BPM | [ ] | [ ] | |
| Acid | 150 BPM | [ ] | [ ] | |
| Acid | 180 BPM | [ ] | [ ] | |
| Hybrid | 120 BPM | [ ] | [ ] | |
| Hybrid | 150 BPM | [ ] | [ ] | |
| Hybrid | 180 BPM | [ ] | [ ] | |

## Freigabe

- [ ] Alle 90 Preset-Hörpunkte sind abgenommen.
- [ ] Alle 18 Factory-Hörpunkte sind abgenommen.
- [ ] `npm run verify` ist auf genau diesem Stand grün.
- [ ] Keine lokalen Audio-, Seiten- oder Konsolenfehler.
- [ ] Freigabe für Push auf `main` wurde ausdrücklich erteilt.

Freigegeben von: ____________________  Datum: ____________________
