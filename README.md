# พระอภัยมณี · PHRA APHAI MANI: RHYTHM OF LOVE

A 2D Thai-folklore rhythm-survival game. Play Phra Aphai Mani's enchanted flute in time with
**Feltwood Requiem** to keep the sea giantess Phi Suea Samut (ผีเสื้อสมุทร) mesmerized.
Every miss brings her closer. If she reaches him, she drags him into the sea.

HTML5 + Canvas + vanilla JavaScript. No build step and no dependencies.

---

## 1. Running the game

**Windows (recommended):** double-click **`Play.bat`**.
It starts a tiny local web server (PowerShell, nothing to install) and opens the game at
`http://localhost:8642/index.html`. Close the console window to stop it.

**Any OS with Node.js:** `node tools/serve.js` and open `http://localhost:8642/index.html`.

**Just double-click `index.html`:** this also works. Browsers block `fetch()` on `file://`, so the
game falls back to an `<audio>` element for the music and to the embedded beat map
(`assets/beatmaps/feltwood_requiem.beatmap.js`). Timing is still music-locked but slightly less
precise, and the underwater muffling effect is unavailable. You can also pick the music file
manually on the Song Selection screen.

Use a current Chrome, Edge or Firefox on desktop. The first click or key press unlocks audio.

### วิธีเล่นแบบย่อ (Thai quick start)
1. ดับเบิลคลิก `Play.bat` → กด **เริ่มเล่น** → เลือกความยาก → **บรรเลง**
2. กด **SPACE** (หรือ ลูกศร / คลิกเมาส์) เมื่อโน้ตเลื่อนมาถึงวงแหวนทางซ้าย
3. กดพลาด นางยักษ์จะก้าวเข้ามา · พลาดติดกัน 4 ครั้งขึ้นไป นางจะวิ่ง!
4. เล่นต่อเนื่องให้แม่น นางจะต้องมนตร์และถอยห่างออกไป · รอดจนจบเพลง = หลบหนีสำเร็จ

## 2. Controls

| Action | Keys |
|---|---|
| Play the flute (hit) | `Space`, `←` `↑` `→` `↓`, `J`, `F` (during play), or mouse click on the scene |
| Pause / resume | `P` or `Esc` (also the ❚❚ button) |
| Retry while paused | `R` |
| Fullscreen | `F` (outside gameplay) or the Fullscreen button |

Pressing when no note is near is **not** punished. Holding a key never registers twice.

## 3. Gameplay rules

* **Judgement windows** (Normal): PERFECT ±50 ms, GOOD ±100 ms, OK ±150 ms; outside that is MISS.
  Easy widens them ×1.3 and Hard narrows them ×0.8. A note can only be judged once, and
  un-hit notes become MISS automatically once their window has passed.
* **Note colours:** cyan = beat, blue = off-beat, gold = strong beat (×1.5 score),
  red = "spell" phrase note (×2). The combo multiplier rises +0.1 every 10 combo, up to ×2.
* **Pursuit** (`pursuitDistance` 1.0 → 0.0):
  * 1 miss: she takes one visible step and the combo breaks.
  * 2 misses in a row: a bigger step plus a short chase.
  * 3 misses in a row: fast walk, danger effects and a heartbeat.
  * 4+ misses in a row: she runs, footsteps get louder, the screen shakes and turns red.
  * Hits push her back slightly and fill the **spell meter**. With a combo of 4+ and a strong
    spell she drifts back on her own (recovery).
  * One or two misses never lose the game. Losing takes a sustained streak of misses.
* **Win:** survive to the end of the song → ESCAPE SUCCESSFUL. **Lose:** she reaches him, then
  the grab, carry, splash and underwater cinematic plays → GAME OVER.
* The results screen shows final score, best combo, accuracy, PERFECT/GOOD/OK/MISS counts and
  song completion %, with **Retry / Song Selection / Main Menu**. Retry rebuilds the run state
  from scratch without reloading the page.

## 4. The music and the beat maps

Two songs are on the Song Selection screen. Each song has its own beat map and its own records:

| Song | File | Length | Pulse / felt BPM | Easy / Normal / Hard notes |
|---|---|---|---|---|
| Feltwood Requiem | `assets/music/Feltwood Requiem.wav` (48 kHz WAV) | 2:56 | 148 / 74 | 107 / 219 / 350 |
| Bionic | `assets/music/bionic.mp3` (embedded tag title: "Whispers of the Void") | 3:28 | 137.2 / 68.6 | 148 / 259 / 455 |

The audio is played unmodified: no resampling, pitch or tempo change. Bionic's map was made by the
same analyzer running in the browser, because the Node tool only reads WAV. Its tempo had the same
3:2 trap: 90.7 BPM looked plausible, and the onset check picked 137.2 (55% versus 30% of strong
onsets).

The sections below describe Feltwood Requiem in detail.

### How sync works
* The **audio hardware clock is the master clock**. Song time is
  `AudioContext output time − start time`, mapped through `getOutputTimestamp()` so output
  latency is compensated. Notes are drawn at `x = f(noteTime − songTime)`, so frame drops,
  pausing or losing focus can never drift them.
* Key presses are timed with the event's own timestamp, not the frame that processes it.
* Pause stops the music and remembers the exact position. Resume shows a 1.5 s countdown and
  restarts the audio at that position. Losing window focus pauses automatically.
* The player's calibration offset (Settings → Timing calibration, with an automatic tap test)
  shifts both judging and drawing.

### What the analysis found (`tools/analyze-song.js`)
* Spectral-flux onset envelope (2048-sample FFT, 512 hop, 3 frequency bands).
* Tempo candidates from autocorrelation: 148, 97, 73 BPM. Autocorrelation alone is fooled by the
  song's **3+3+2 syncopation** (strong onsets 620/620/410 ms apart), so each candidate is
  beat-tracked and verified against real onsets. The **148 BPM** grid lands on 56% of strong
  onsets, versus 33% for 97 BPM. The felt pulse is about 74 BPM.
* **The tempo is not constant.** It drifts between about 144 and 158 BPM by section, so beats come
  from a dynamic-programming beat tracker (Ellis 2007), not a fixed grid. Each beat is then
  snapped to the actual waveform attack (median correction −3.5 ms).
* Sections from RMS energy: intro (3–16 s), intense (16–29 s), quiet (29–42 s), build…, a
  breakdown at 94 s, intense at 107 s, **final intense section 147–160 s**, outro.

### The chart
One editable file, **`assets/beatmaps/feltwood_requiem.json`**. Each note lists the lowest
difficulty it appears in, so Normal contains Easy and Hard contains Normal:

| Difficulty | Notes | Avg density | Minimum gap |
|---|---|---|---|
| Easy | 107 | 0.63 / s | 0.78 s |
| Normal | 219 | 1.30 / s | 0.39 s |
| Hard | 350 | 2.08 / s | 0.20 s |

```json
{
  "song": "Feltwood Requiem", "bpm": 148.03, "feltBpm": 74.01, "offset": 3.208,
  "sections": [{ "start": 3.208, "end": 16.1, "energy": 0.199, "kind": "intro" }],
  "notes": [
    { "time": 4.807, "lane": 0, "type": "accent", "difficulty": 1 },
    { "time": 5.206, "lane": 0, "type": "soft",   "difficulty": 3, "window": 1.2, "fx": "sparkle" }
  ]
}
```
`time` is in seconds. `lane` is 0 because every hit key counts. `type` is normal, soft, accent or spell.
`difficulty` is 1, 2 or 3. `window` is an optional per-note timing multiplier. `fx` is an optional effect name.

After editing the JSON by hand, run `node tools/analyze-song.js` **only if you want to regenerate
from scratch**. Otherwise update the `file://` copy by downloading **.beatmap.js** from the editor.

### Beat Map Editor (`editor.html`, or "ตัวแก้ไขโน้ต" in the menu)
* Waveform, sections, a snap grid (BPM / offset / 1/1, 1/2 or 1/4) or **snap to detected beats**.
* Click a row to **add** a note (row = difficulty). Drag to **move**, right-click or `Del` to
  **remove**. `1`/`2`/`3` set difficulty, `T` cycles type, arrow keys nudge by 5 ms (1 ms with
  Shift), `Ctrl+Z` undoes.
* **Play** with ticks scheduled on the audio clock at every note to check timing by ear.
  Tap-record mode (`K`) adds notes live.
* **Analyze audio** runs the same analyzer in the browser (5–15 s). **Regenerate notes…** rebuilds
  the chart with your own density (minimum gaps per difficulty). Red outlines flag notes that are
  too close together.
* **Save to game** stores the map in this browser, and the game uses it right away.
  **Playtest from playhead** opens the game at that point. **Download JSON / .beatmap.js** to
  make it permanent, and **Revert to shipped** to go back.

## 5. Settings (saved in localStorage)
Music volume, SFX volume, difficulty, note speed (0.6×–1.8×), timing calibration (−200 to +200 ms,
plus the automatic tap test), screen shake, EARLY/LATE hints and fullscreen. The game also saves
high score, best combo, best accuracy, best completion and a clear flag per difficulty.

## 6. Adding or replacing songs
1. Put the file in `assets/music/` and add an entry to `PAM.Config.songs` in `src/core/Config.js`:
   `{ id, title, subtitle, audio: ['assets/music/x.mp3'], beatmap: 'assets/beatmaps/<id>.json', art: [x, y, w, h] }`.
   `art` is a crop of the concept sheet for the song card. WAV, MP3 and OGG all work.
2. Generate a beat map:
   * **WAV:** `node tools/analyze-song.js "assets/music/My Song.wav" my_song "My Song"`
   * **Any format:** run `node tools/serve.js 8642 --allow-save`, open the editor, pick the song,
     then **Analyze audio** → **Regenerate notes…** → **Download JSON / .beatmap.js** into
     `assets/beatmaps/`. The `--allow-save` flag also lets a script POST the files to `/__save/<name>`,
     which is how Bionic's map was written. It is off by default and only accepts beat-map file names.
3. Add a `<script>` tag for `<id>.beatmap.js` in `index.html` and `editor.html` (for `file://` use).

The new song appears on Song Selection automatically, with its own difficulty tabs and records.

## 7. Replacing character and background artwork
* Gameplay talks to the characters only through `setState(name)`, `update(dt)`, `draw(ctx)`,
  `react()` / `flinch()` and a few anchor points (`fluteTip`, `bodyCenter`, `headWorld`,
  `handsWorld`, `onStep`). To use sprite sheets or a Spine/DragonBones export, write a class with
  the same interface in `src/characters/` and construct it in `Game` instead of
  `PhraAphai` / `PhiSueaSamut`. No gameplay code changes are needed.
  * Prince states: `idle, play, nervous, panic, caught, pulled` (+ reactions `success`, `miss`)
  * Giantess states: `mesmerized, idle, slowWalk, fastWalk, running, attack, capture`
* Backgrounds: set `PAM.Background.images = { sky, islands, foreground }` (1920×1080 `Image`
  objects, transparent where needed) before the game boots, and each one replaces its painted
  layer. Folders `assets/characters`, `assets/backgrounds`, `assets/effects` and `assets/fonts`
  are ready for them.
* Menu, song and result artwork are crops of `assets/concept/concept_sheet.webp` (the supplied
  concept art). Change the rectangles in `src/ui/UI.js` (`crop(...)` calls) or swap the image.

## 8. Project structure
```
index.html, editor.html, Play.bat
src/core      Config.js · Storage.js · GameState.js · Game.js (loop, state machine, cinematics)
src/audio     AudioManager.js (context, buses, synthesized SFX) · MusicPlayer.js (master clock)
              BeatAnalyzer.js (onsets, tempo, beat tracking, sections, chart generator)
src/rhythm    BeatMap.js · Note.js · HitDetector.js · RhythmEngine.js
src/gameplay  PursuitController.js · ScoreManager.js · DifficultyManager.js
src/characters Rig.js (pose blending, 2-bone IK) · PhraAphai.js · PhiSueaSamut.js
src/render    Background.js · Effects.js · TrackRenderer.js
src/ui        UI.js · Calibration.js · style.css
src/editor    Editor.js
tools         analyze-song.js · serve.ps1 · serve.js
assets        music/ · beatmaps/ · concept/ · characters/ · backgrounds/ · effects/ · fonts/
```
All tunable numbers (timing windows, pursuit steps and speeds, recovery, spell, difficulty scales,
scoring, lead-in) live in `src/core/Config.js`.

Testing URL options: `?autoplay=1` makes a bot hit every note, `?autoplay=miss` makes it hit none,
`?start=120` starts at 120 s, `?debug=1` shows a timing overlay, and `?autostart` begins as soon as
the music loads.

## 9. Implemented and tested
Tested in the Chromium-based browser pane, served over http, on 2026-10-30:
* Menu → Song Selection → intro → countdown → gameplay, with real music and the beat map.
* Bot run: every note judged PERFECT and in sync with the audio clock. A human tester also hit
  PERFECT/GOOD notes live.
* Pursuit escalation (step, fast walk, run, red vignette, heartbeat) and recovery while playing.
* Failure: grab, carry, splash, underwater with muffled music, GAME OVER, results, records saved.
* Success: song end, ESCAPE SUCCESSFUL, results, CLEAR saved and shown on Song Selection.
* Pause: the clock froze at the exact position. Resume continued from it, matching the expected
  time within the 47 ms output-latency compensation. Window blur auto-pauses. Retry resets score,
  combo, distance and music.
* Settings persist. Calibration tap test measured +36 ms for simulated taps 30 ms late.
* `file://` fallback (fetch blocked): embedded beat map plus `<audio>` element. The song clock
  matched `audio.currentTime` exactly.
* Editor: waveform, analysis (in-browser tempo 147.7 BPM at 44.1 kHz), add/remove/undo, and Save
  to game, which the game then loaded.
* `Play.bat`'s PowerShell server serves HTML, JS, JSON and the 34 MB WAV, and blocks path traversal.

## 10. Known limitations / placeholders (honest list)
* **Character art is procedural 2D vector art** (layered skeletal rigs drawn on canvas, with blended
  poses and IK), not painted illustrations like the concept sheet. It is animated and stylistically
  matched, but it is a placeholder for commissioned sprite or skeletal art (see §7). The painted
  concept art appears on the menu, song and result screens.
* **Sound effects are synthesized** with Web Audio (flute accent, hit, miss, footsteps, heartbeat,
  roar, grab, splash). They are mixed under the music. Swap them for recorded samples in
  `AudioManager.sfx` if you have them.
* **Audio was verified numerically, not by ear.** The developer could not listen to playback.
  Notes were checked against onset peaks and clock math. Do one human playtest and use the
  calibration test if hits feel early or late.
* The in-browser analyzer can lock onto the weaker off-beat phase in some passages. The shipped
  chart was generated from the original 48 kHz WAV and sits on the stronger onsets.
* The Bionic beat map was checked with the bot and against the waveform in the editor, but not
  playtested by ear yet.
* Not tested in Firefox or Safari. Desktop only, with no touch-screen tuning.
* Google Fonts (Charm, Cinzel, Sarabun) load from the internet. Offline, the game falls back to
  Leelawadee UI or Tahoma.
* The supplied prototype's README claimed a 207-point WAV beat map, but its code still used
  synthesized tones at a fixed 100 BPM. Its concept and Thai UI copy were kept, and the engine
  was rebuilt as the modular system above.
