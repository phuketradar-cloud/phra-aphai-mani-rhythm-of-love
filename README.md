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
1. ดับเบิลคลิก `Play.bat` (หรือเปิดลิงก์ GitHub Pages) → กด **เริ่มเล่น** → เลือกเพลงและความยาก → **บรรเลง**
2. มี 4 เลน: **W** บน · **A** ซ้าย · **S** ล่าง · **D** ขวา — กดปุ่มของเลนเมื่อโน้ตถึงวงแหวนทางซ้าย
3. โน้ตที่มีเส้นทองเชื่อม = กดพร้อมกัน · แถบยาว = กดค้างจนสุดแถบ
4. กดพลาด นางยักษ์จะก้าวเข้ามา · พลาดติดกัน 4 ครั้งขึ้นไป นางจะวิ่ง! · ผู้ชมจะเชียร์เมื่อเล่นดี และโห่เมื่อพลาด
5. รอดจนโน้ตสุดท้าย = **PERFORMANCE COMPLETE**

## 2. Controls

**Main menu:** a full-screen key-art title screen with only **PLAY**, **OPTIONS** and **FULLSCREEN**. Use the mouse, or **Up/Down** (or W/S) and **Enter**; **Esc** returns from Options. The interface is English only. Timing calibration is under Options → *Measure*, and the beat map editor is at `editor.html` (not linked from the menu). The background is the supplied artwork `assets/menu/menu_bg.webp`, shown unaltered, and the title is the supplied transparent logo `assets/menu/logo.webp` (object-fit: contain, with a soft gold breathing glow). Animated layers drawn over the art by `src/ui/MenuScene.js` add drifting clouds, a moonlight pulse, sea glints and wave highlights, foam spray at the rocks, and a flowing blue music trail with notes and sparks from the flute that brightens with the menu music. The characters themselves are never animated or redrawn, because no separate character layers exist. Drawing takes about 0.9 ms per frame. Menu plates (`.km-play / .km-options / .km-full`) and the logo position are set in `src/ui/style.css`. If a browser refuses fullscreen, a notice suggests F11.

| Action | Keys |
|---|---|
| Lane UP / LEFT / DOWN / RIGHT | `W` `A` `S` `D` (remappable in Settings). The arrow keys `↑` `←` `↓` `→` always work as a second set. Mouse/touch: press on a lane row. |
| Pause / resume | `P` or `Esc` (also the ❚❚ button) |
| Retry while paused | `R` |
| Fullscreen | `F` (outside gameplay) or the Fullscreen button |

* Keys are tracked with real keydown/keyup state. Browser auto-repeat is ignored, a lane that is
  already held cannot hit again, and any combination of lanes can be pressed at once (WA, SD, all
  of WASD) as far as the keyboard allows.
* A press with no note anywhere near is **not** punished. A press in an empty lane while another
  lane has a note shows **WRONG KEY**. It does not move the giantess or break the combo; set
  `Config.input.wrongLaneBreaksCombo` to make it stricter.
* **Key remapping:** Settings → Key mapping. Click a lane, then press the new key; Esc cancels.
  Assigning a key that another lane already uses swaps the two. "Reset" restores W A S D.

## 3. Gameplay rules

* **Judgement windows** (Normal): PERFECT ±50 ms, GOOD ±100 ms, OK ±150 ms; outside that is MISS.
  Easy widens them ×1.3 and Hard narrows them ×0.8. Every lane is judged on its own. A note can
  only be judged once, and an un-hit note becomes MISS once its window has passed. EARLY / LATE
  hints appear for non-PERFECT hits.
* **Note kinds** (each lane has its own colour and arrow: W cyan ▲, A gold ◀, S red ▼, D violet ▶):
  * **normal**: one key.
  * **double / chord**: 2 or 3 lanes at the same moment, joined by a gold line. A bonus of
    +100 per note is paid when every note in the group is hit.
  * **hold**: press on the head and keep holding until the end of the bar. Releasing within
    0.15 s of the end still counts. Releasing earlier shows "RELEASED" and counts as a miss.
  * **stream**: fast runs with stair / zig-zag lane patterns (Hard).
  * A thick outline marks a strong beat (×1.5 score). The combo multiplier rises +0.1 every 10
    combo, up to ×2.
* **Pursuit** (`pursuitDistance` 1.0 → 0.0), unchanged:
  * 1 miss: she takes one visible step and the combo breaks.
  * 2 misses in a row: a bigger step plus a short chase.
  * 3 misses in a row: fast walk, danger effects and a heartbeat.
  * 4+ misses in a row: she runs, footsteps get louder, the screen shakes and turns red.
  * Hits push her back slightly and fill the **spell meter**. With a combo of 4+ and a strong
    spell she drifts back on her own (recovery).
  * One or two misses never lose the game. Losing takes a sustained streak of misses.
* **Success ending:** after the final note, the note is emphasised, the scene holds still for a
  moment, then the audience erupts (celebration, applause, whistles and a vocal cheer) and
  **PERFORMANCE COMPLETE** appears, followed by the results.
* **Failure ending:** she reaches him. Gameplay stops, and you hear a roar, a dramatic impact and
  crowd gasps. Then the grab, carry, splash and underwater transition play → **GAME OVER**.
* The results screen shows final score, best combo, accuracy, completion %, difficulty,
  PERFECT/GOOD/OK/MISS counts, holds kept and broken, chords completed and wrong-key presses.
  **Retry / Song Selection / Main Menu** are offered. Retry rebuilds the run state without
  reloading the page.
* **Difficulty comes from the beat map:** Easy has no simultaneous notes and the widest spacing.
  Normal adds doubles on strong beats. Hard adds 3-note chords, streams and the densest timing.
## 4. The music and the beat maps

Seven songs are on the Song Selection screen. Each song has its own beat map and its own records:

| Song | File | Length | Pulse / felt BPM | Easy / Normal / Hard notes | Holds |
|---|---|---|---|---|---|
| Feltwood Requiem | `assets/music/Feltwood Requiem.wav` (48 kHz WAV) | 2:56 | 148 / 74 | 107 / 260 / 394 | 34 |
| Bionic | `assets/music/bionic.mp3` (embedded tag title: "Whispers of the Void") | 3:28 | 137.2 / 68.6 | 148 / 305 / 505 | 19 |
| Ethereal Requiem | `assets/music/ethereal_requiem.mp3` | 3:49 | 137.2 / 68.6 | 155 / 345 / 560 | 14 |
| Echoes Beyond Eternity | `assets/music/echoes_beyond_eternity.mp3` | 3:54 | 137.2 / 68.6 | 139 / 331 / 547 | 25 |
| Celestial Storm | `assets/music/celestial_storm.mp3` | 3:43 | 137.2 / 68.6 | 138 / 326 / 534 | 23 |
| Wings of the Forgotten | `assets/music/wings_of_the_forgotten.mp3` | 3:59 | 137.2 / 68.6 | 151 / 353 / 577 | 13 |
| The Mermaid's Lament | `assets/music/mermaids_lament.mp3` | 5:54 | 140.6 / 70.3 | 226 / 505 / 695 | 125 |

Note counts include every key press, so a 2-note double counts as 2. Minimum gaps between distinct note times in every map: Easy ≥ 0.78 s, Normal ≥ 0.38 s, Hard ≥ 0.19 s. Easy never has simultaneous notes.

The audio is played unmodified: no resampling, pitch or tempo change. The MP3 maps were made by the
same analyzer running in the browser (MP3 decoded at 48 kHz), because the Node tool only reads WAV.
Every MP3 had the same 3:2 tempo trap: about 91–94 BPM looked plausible, and the onset check picked
the faster pulse (137.2 or 140.6 BPM), which lands on 49–68% of strong onsets versus 27–33%.

Only the selected song's audio is decoded and kept in memory. Switching songs frees the previous
one, because a decoded 4-minute song takes about 80 MB.

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

### The chart (beat map format 2: four lanes)
One editable file per song, e.g. **`assets/beatmaps/feltwood_requiem.json`**. Each note lists the
lowest difficulty it appears in, so Normal contains Easy and Hard contains Normal.

```json
{
  "format": 2, "lanes": ["up", "left", "down", "right"],
  "song": "Feltwood Requiem", "bpm": 148.03, "feltBpm": 74.01, "offset": 3.208,
  "sections": [{ "start": 3.208, "end": 16.1, "energy": 0.199, "kind": "intro" }],
  "notes": [
    { "time": 4.807, "lane": 2, "type": "hold",   "difficulty": 1, "duration": 0.6, "accent": true },
    { "time": 6.205, "lane": 0, "type": "double", "difficulty": 1, "chord": 3, "accent": true },
    { "time": 6.205, "lane": 3, "type": "double", "difficulty": 2, "chord": 3 },
    { "time": 9.410, "lane": 1, "type": "stream", "difficulty": 3, "window": 1.2, "fx": "sparkle" }
  ]
}
```
| Field | Meaning |
|---|---|
| `time` | seconds on the song clock |
| `lane` | 0 = W / up, 1 = A / left, 2 = S / down, 3 = D / right |
| `type` | `normal`, `double`, `chord`, `hold`, `stream` |
| `duration` | hold length in seconds (hold notes only) |
| `chord` | group id. Notes with the same id are pressed together. Each partner note can have a higher `difficulty`, so Easy shows a single, Normal a double and Hard a 3-note chord. The game recomputes the visible kind per difficulty. |
| `difficulty` | 1 easy, 2 normal, 3 hard (lowest level that contains the note) |
| `window` | optional per-note timing-window multiplier |
| `accent` | strong beat (×1.5 score, thicker outline) |
| `fx` | optional effect name (`sparkle`, `burst`) |

Old one-key maps (format 1), including an old editor override saved in the browser, are converted
to four lanes automatically when loaded. `node tools/convert-4lane.js [--force]` converts the files
on disk. Lanes, chords, holds and streams come from `BeatAnalyzer.toFourLane`, which is
deterministic per song: no jacks (same lane twice) faster than 0.3 s, and holds only where no other
note follows at any difficulty.

### Beat Map Editor (`editor.html`, or "ตัวแก้ไขโน้ต" in the menu)
* Song picker, waveform, sections, a snap grid (BPM / offset / 1/1, 1/2 or 1/4) or **snap to
  detected beats**.
* Rows are difficulties. Inside a row, lanes W/A/S/D are stacked top to bottom and coloured like
  the game. Click to **add**, drag to **move**, right-click or `Del` to **remove**.
* `W` `A` `S` `D` move the selected note to a lane. `1`/`2`/`3` set difficulty, `H` toggles a hold,
  `[` `]` change hold length, `X` toggles a strong beat. Arrow keys nudge by 5 ms (1 ms with
  Shift), and `Ctrl+Z` undoes.
* **Play** with ticks scheduled on the audio clock at every note, pitched per lane. In
  **tap-record** mode, W/A/S/D record notes in that lane at the playhead.
* **Analyze audio** / **Regenerate notes…** rebuild a 4-lane chart with your own density.
  Red outlines flag notes that are too close (chords sharing a timestamp are allowed).
* **Save to game**, **Playtest from playhead**, **Download JSON / .beatmap.js**, and
  **Revert to shipped**.

## 5. Audio: music, flute, voice and crowd

### Menu audio (`src/audio/MenuMusic.js`, menu sounds in `AudioManager.sfx`)
* **Random menu playlist** built from the game's own songs (`PAM.Config.songs`, nothing added or changed). Each time the main menu opens, a random track starts. It keeps playing in Options, and when it ends the next one crossfades in (3 s). The shuffle is fair (every song plays once before any repeats) and never plays the same song twice in a row; 700 test draws gave exactly 100 per song.
* Tracks stream through `<audio>` elements into the **Menu music** channel, so even the 34 MB WAV starts without a full decode. A missing or unplayable file is skipped, and if none can play the menu stays silent.
* Transitions: 2 s fade-in on the menu, 3 s crossfade between tracks, and a 1.2 s fade-out when PLAY is confirmed. Menu music is stopped during calibration and gameplay and comes back with a fresh random track on returning to the menu. Only one track is ever audible apart from the crossfade overlap.
* **Navigation tick** (Up/Down, W/S or mouse hover): a crisp plucked note whose pitch follows the item. Key-repeat is ignored and ticks are rate-limited to one per 45 ms.
* **Confirm** (Enter, Space or click): a low thump plus a rising gold chime, with a gold flash on the plate at the same moment. The action runs about 0.23 s later, once the flash has landed; fullscreen runs immediately because browsers require it inside the gesture.
* **Autoplay rules:** audio starts or resumes on the first click or key press. If the browser refused the menu music before that, it starts then.
* Both local servers (`Play.bat` / `tools/serve.js`) now support HTTP Range requests, so `<audio>` can seek and report durations, which the crossfade timing needs.

### Mixer (Settings → Audio mixer, all saved)
| Channel | What plays there |
|---|---|
| Master | everything (followed by a limiter so stacked layers never clip) |
| Game music | the song during gameplay, unmodified (pitch and tempo untouched) |
| Menu music | the random menu playlist |
| Menu sound effects | menu navigation ticks, confirm chime, button clicks |
| Flute & musical FX | hit accents (pitch follows combo and lane), chord and hold chimes, misses, countdown |
| Vocal feedback | the English announcer reactions |
| Crowd ambience | murmur loops and the worried murmur |
| Crowd reactions | applause, cheers, whistles, gasps, groans, boos, celebration |
| Giantess footsteps | steps, synced to her walk cycle (faster when she runs) |
| Danger effects | heartbeat, roar, impact, grab, splash |

Voice and crowd can also be switched off with the checkboxes. All level changes use smooth ramps.
**Ducking:** while a voice line plays, the music dips to 84% (about −1.5 dB) and the crowd
ambience to 55%. Big celebrations dip the music a little more. The music always stays in front.

### Voice Feedback Manager (`src/audio/VoiceFeedback.js`)
* Categories (all in `assets/audio/voice/<category>/`): **perfect** (เย้! สุดยอด! วู้ววว! เก่งมาก! แจ๋วเลย!),
  **good** (เยี่ยม! ดีมาก! ใช่เลย! ดีๆ!), **miss** (อ้าว! โธ่! เฮ้ย! พลาดแล้ว! อุ๊ย!), **streak**
  (สุดยอดไปเลย! ไฟลุกแล้ว! หยุดไม่อยู่แล้ว! เทพมาก!), **celebrate** (ไชโย! เก่งที่สุดเลย! สุดยอดการแสดง!) and
  **worried** (ระวัง! นางมาแล้ว! ใกล้แล้ว!). Each phrase has 3 deliveries, 72 clips in total.
* Not every note gets a voice: a PERFECT has a 16% chance once the PERFECT streak is 3+. A GOOD
  has 5%. The first miss after a combo has 45%, and a 3-miss streak always gets a line. A PERFECT
  streak of 8, 16, 24, 32, 48, 64, 96 or 128 always triggers a streak line. Lines play faster and
  louder as the streak grows. A worried line plays when danger passes 75%.
* Shuffle bags (no immediate repeats), a 2.4 s global cooldown, and one voice at a time: a
  higher-priority line may cut a lower one with a short fade, otherwise the new line is skipped.
* **No text-to-speech at runtime.** The clips are audio files. They were generated offline with
  the Microsoft neural voice en-US-GuyNeural (edge-tts) by `tools/render-voices-en.py`, then
  trimmed and given an arena-announcer treatment (presence boost, drive, stadium slap-back echo)
  by `tools/build-audio.js`. While a line plays the music is ducked to 60 % so the announcer cuts
  through. (`tools/render-voices.ps1` still renders the older Thai lines with Windows' Pattara voice.)

### Crowd Manager (`src/audio/CrowdManager.js`)
* **Song start:** louder anticipation chatter with a few claps and a whistle. When the music
  starts, the crowd settles to a low ambience.
* **Combo milestones:** 5 = small applause · 10 = applause + cheer · 25 = large applause, whistles
  and cheer · 50 = big crowd cheer, applause and whistles · 100 (and every 50 after) = full
  stadium-style celebration with whistles.
* **Good performance:** excitement (combo and accuracy) slowly raises the ambience and the chance
  of spontaneous cheers and whistles. A PERFECT streak adds shouts every 12 PERFECTs.
* **Misses:** 2 in a row brings a groan, 3 a louder groan, and 4+ occasional booing.
* **Danger:** positive reactions are suppressed, a worried murmur fades in, and the crowd gasps
  when she starts to charge.
* **Endings:** success brings a massive celebration with applause, whistles and a vocal cheer.
  Capture brings gasps and a worried crowd.
* Per-category cooldowns, shuffle bags, at most 4 reactions at once, random panning and Haas
  widening so the mono layers sound wide.
* The crowd sounds are **synthesized by `tools/build-audio.js`**: formant-filtered voices for
  chatter, cheers, gasps, groans and boos, noise-burst clappers for applause, and pitch-glide
  whistles. They are not recordings.

### Replacing voice and crowd samples with real recordings
Put `.wav`, `.mp3` or `.ogg` files into the matching `assets/audio/voice/<category>/` or
`assets/audio/crowd/<category>/` folder (delete the generated ones if you want only yours). Then
run `node tools/build-audio.js --manifest-only` to rescan the folders and rewrite
`assets/audio/manifest.json` / `manifest.js`. No code changes are needed. Category names:
voice `perfect, good, miss, streak, celebrate, worried`; crowd `murmur, worried, applause_small,
applause_medium, applause_large, cheer_small, cheer_large, whistle, gasp, groan, boo, celebration`.

## 5b. Settings (saved in localStorage)
Difficulty, note speed (0.6×–1.8×), timing calibration (−200 to +200 ms, plus the automatic tap
test), screen shake, EARLY/LATE hints, fullscreen, the 4 lane keys, and the 8 mixer levels plus
the voice/crowd switches. The game also saves high score, best combo, best accuracy, best completion
and a clear flag per song and difficulty. Records restarted with the four-lane version
(`pam.records.v2`), and the old one-key volume settings carry over.
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
src/audio     AudioManager.js (mixer, ducking, sample player, synthesized SFX) · MusicPlayer.js (master clock)
              VoiceFeedback.js · CrowdManager.js
              BeatAnalyzer.js (onsets, tempo, beat tracking, sections, chart generator, 4-lane conversion)
src/rhythm    BeatMap.js · Note.js · HitDetector.js · RhythmEngine.js
src/gameplay  PursuitController.js · ScoreManager.js · DifficultyManager.js
src/characters Rig.js (pose blending, 2-bone IK) · PhraAphai.js · PhiSueaSamut.js
src/render    Background.js · Effects.js · TrackRenderer.js
src/ui        UI.js · Calibration.js · style.css
src/editor    Editor.js
tools         analyze-song.js · convert-4lane.js · render-voices-en.py · render-voices.ps1 · build-audio.js · serve.ps1 · serve.js
assets        music/ · beatmaps/ · audio/voice/ · audio/crowd/ · concept/ · characters/ · backgrounds/ · effects/ · fonts/
```
All tunable numbers (timing windows, pursuit, difficulty scales, scoring, lane colours, hold
release tolerance, wrong-lane rule, voice chances and cooldowns, crowd levels and milestones) live
in `src/core/Config.js`.

Testing URL options: `?autoplay=1` makes a bot hit every note (it also holds the hold notes), `?autoplay=miss` makes it hit none,
`?start=120` starts at 120 s, `?debug=1` shows a timing, keys, crowd and voice overlay, and `?autostart` begins as soon as
the music loads.

## 9. Implemented and tested
Tested in the Chromium-based browser pane, served over http, on 2026-10-30, with the real songs.

**Four-lane upgrade (WASD, voice, crowd):**
* Engine tests with a scripted chart: PERFECT / GOOD / early OK (−0.14 s, EARLY hint), a second
  press in the same lane scores nothing, both halves of a double, a 3-note chord, hold kept to the
  end (`holdDone`), hold released 0.6 s early (`holdBreak`), wrong-lane press (S while the note is
  in W) reported as WRONG KEY, and no event while a hold is still held.
* Key events through the real handlers: W+S together and all four WASD at once each registered.
  Auto-repeat keydown and a second keydown of an already held key were both ignored. keyup
  released the right lanes, and the arrow keys work as the second set.
* Key remapping: I → UP, then I → LEFT swapped A into UP, saved, and used by the input. Reset
  restores W A S D.
* Bot run (Feltwood Requiem): doubles with gold connectors, hold bars, the streak counter, chord
  bonus pop-ups, and crowd milestones at combo 5 (small applause), 10 (applause + cheer) and 25
  (large applause + whistles + cheer). Varied voice lines played with no immediate repeats, spaced
  by the cooldown, plus a streak line at 8 PERFECTs.
* Combo 50 and 100 reactions fired (big cheer, and celebration + applause + 7 whistles + cheer).
* Ducking measured on the mixer: during a voice line the music was at 0.84 and the crowd ambience
  at 0.55; both returned to 1.00 afterwards.
* Success: final-note emphasis, a 0.7 s visual hold, celebration + applause + whistles +
  celebrate voice, **PERFORMANCE COMPLETE**, then results with the hold/chord/wrong stats. The
  music was stopped.
* Failure (miss bot): groans at 2 and 3 misses, a boo at 4+, a gasp when she charged, a miss voice
  and a worried voice, then impact + gasps at the capture, underwater, GAME OVER and results.
* Pause froze the song clock; resume matched the expected time within 46 ms (output-latency
  compensation) and the bot kept hitting with no misses. Retry reset score, combo, hold/chord/wrong
  counters and the crowd.
* Editor: loads the 4-lane maps (lane colours, letters, hold bars, chord outlines) with no
  spacing warnings.

**Earlier features (re-checked where touched):** menu → song select → intro → countdown →
gameplay; pursuit escalation and recovery; underwater capture cinematic; settings persistence;
calibration (+36 ms measured for taps 30 ms late); `file://` fallback for music and beat maps;
`Play.bat` server; GitHub Pages build.
## 10. Known limitations / placeholders (honest list)
* **Character art is procedural 2D vector art** (layered skeletal rigs drawn on canvas, with blended
  poses and IK), not painted illustrations like the concept sheet. It is animated and stylistically
  matched, but it is a placeholder for commissioned sprite or skeletal art (see §7). The painted
  concept art appears on the menu, song and result screens.
* **Sound effects are synthesized** with Web Audio (flute accent, hit, miss, footsteps, heartbeat,
  roar, impact, grab, splash). They are mixed under the music. Swap them for recorded samples in
  `AudioManager.sfx` if you have them.
* **Voice reactions are generated, not recorded:** pre-rendered offline with a Microsoft neural
  English voice (en-US-GuyNeural) at excited pitch and speed settings, plus announcer processing. They are proper audio files
  (no TTS at runtime), but they sound synthetic next to a real person shouting. Replace them with
  real recordings when you have them (see §5); the system needs no changes.
* **The crowd is synthesized**, not recorded: applause and whistles are fairly convincing,
  while chatter, cheers, groans and boos are stylised formant voices. Real crowd recordings
  dropped into `assets/audio/crowd/` will sound much more like a live concert.
* In `file://` mode the voice and crowd samples play through plain `<audio>` elements: no ducking,
  panning or loop cross-fades. Use `Play.bat` or the GitHub Pages link for the full mix.
* **Audio was verified numerically, not by ear.** The developer could not listen to playback.
  Notes were checked against onset peaks and clock math, and the mixer levels and ducking were
  measured, but the sound of the voice and crowd layers and their balance against each song have
  not been judged by ear. Do one human playtest and use the mixer and calibration if needed.
* The in-browser analyzer can lock onto the weaker off-beat phase in some passages. The shipped
  chart was generated from the original 48 kHz WAV and sits on the stronger onsets.
* The MP3 beat maps were checked with the bot (Bionic and Celestial Storm played in the browser),
  but none of them has been playtested by ear yet.
* Not tested in Firefox or Safari. Desktop keyboard first. Mouse/touch can press lanes, but playing
  chords that way is impractical.
* Lanes for every song were assigned automatically (`toFourLane`), not hand-charted. Patterns
  follow the rhythm and avoid fast same-lane repeats, but a human chart designer would shape
  phrases better. Use the editor to refine them.
* Google Fonts (Charm, Cinzel, Sarabun) load from the internet. Offline, the game falls back to
  Leelawadee UI or Tahoma.
* The supplied prototype's README claimed a 207-point WAV beat map, but its code still used
  synthesized tones at a fixed 100 BPM. Its concept and Thai UI copy were kept, and the engine
  was rebuilt as the modular system above.
