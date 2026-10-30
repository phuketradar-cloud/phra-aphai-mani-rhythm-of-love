/*
 * Config — every tunable number in one place. Gameplay code never hard-codes these.
 * Difficulty presets override/scale the base values (see DIFFICULTIES).
 */
window.PAM = window.PAM || {};
PAM.Config = {
  // Design resolution. Everything is drawn in this space and scaled to the window (16:9).
  WIDTH: 1920,
  HEIGHT: 1080,

  songs: [
    {
      id: 'feltwood_requiem',
      title: 'Feltwood Requiem',
      subtitle: 'บทเพลงสะกดนางผีเสื้อสมุทร',
      audio: ['assets/music/Feltwood Requiem.wav'],
      beatmap: 'assets/beatmaps/feltwood_requiem.json',
      art: [300, 0, 860, 345]          // crop of assets/concept/concept_sheet.webp for the song card
    },
    {
      id: 'bionic',
      title: 'Bionic',
      subtitle: 'ท่วงทำนองจากห้วงทะเลลึก',
      audio: ['assets/music/bionic.mp3'],
      beatmap: 'assets/beatmaps/bionic.json',
      art: [418, 768, 340, 198]
    },
    {
      id: 'ethereal_requiem',
      title: 'Ethereal Requiem',
      subtitle: 'บทเพลงไว้อาลัยแห่งวิญญาณ',
      audio: ['assets/music/ethereal_requiem.mp3'],
      beatmap: 'assets/beatmaps/ethereal_requiem.json',
      art: [196, 752, 192, 198]
    },
    {
      id: 'echoes_beyond_eternity',
      title: 'Echoes Beyond Eternity',
      subtitle: 'เสียงสะท้อนเหนือนิรันดร์',
      audio: ['assets/music/echoes_beyond_eternity.mp3'],
      beatmap: 'assets/beatmaps/echoes_beyond_eternity.json',
      art: [18, 752, 174, 198]
    },
    {
      id: 'celestial_storm',
      title: 'Celestial Storm',
      subtitle: 'พายุแห่งสรวงสวรรค์',
      audio: ['assets/music/celestial_storm.mp3'],
      beatmap: 'assets/beatmaps/celestial_storm.json',
      art: [24, 395, 870, 320]
    },
    {
      id: 'wings_of_the_forgotten',
      title: 'Wings of the Forgotten',
      subtitle: 'ปีกแห่งผู้ถูกลืม',
      audio: ['assets/music/wings_of_the_forgotten.mp3'],
      beatmap: 'assets/beatmaps/wings_of_the_forgotten.json',
      art: [1022, 797, 188, 150]
    }
  ],

  // Judgement windows in seconds (± around the note time). Scaled per difficulty.
  timing: {
    perfect: 0.050,
    good: 0.100,
    ok: 0.150
  },

  // Seconds of countdown before the music starts (song time runs negative during it).
  leadIn: 3.0,
  // Seconds of countdown when resuming from pause (music resumes exactly where it stopped).
  resumeLeadIn: 1.5,

  // How long a note is visible on the track before it reaches the hit zone, at note speed 1.0.
  baseApproachTime: 1.9,

  scoring: {
    perfect: 300, good: 200, ok: 100,
    typeMultiplier: { normal: 1, soft: 1, accent: 1.5, spell: 2 },
    comboStep: 10,          // every N combo adds…
    comboBonus: 0.1,        // …this much to the multiplier
    maxComboMultiplier: 2.0
  },

  // Pursuit system. Distance 1.0 = giantess at her starting point, 0 = she catches the prince.
  pursuit: {
    startDistance: 1.0,
    maxDistance: 1.0,
    attackDistance: 0.10,          // she starts reaching for him below this
    // instant step taken on a miss, indexed by consecutive-miss count (last value repeats)
    stepOnMiss: [0, 0.050, 0.060, 0.070, 0.085],
    // extra continuous approach speed (distance/sec) while chasing, by consecutive-miss count
    chaseSpeed: [0, 0, 0.020, 0.045, 0.090],
    chaseMomentum: 1.2,            // seconds she keeps chasing after each miss
    stepDuration: 0.45,            // seconds over which a step is animated
    hitRecover: { perfect: 0.010, good: 0.007, ok: 0.003 },
    // passive retreat while mesmerized (distance/sec) once the combo is at least recoverComboMin
    mesmerizedRetreat: 0.012,
    recoverComboMin: 4,
    // spell meter 0..1 — how enchanted she is
    spellGain: { perfect: 0.07, good: 0.05, ok: 0.02 },
    spellLossOnMiss: 0.35,
    spellDecay: 0.03,              // per second
    mesmerizedThreshold: 0.45
  },

  DIFFICULTIES: {
    easy: {
      label: 'EASY', thai: 'ง่าย', level: 1, timingScale: 1.3,
      stepScale: 0.7, chaseScale: 0.65, recoverScale: 1.6, spellLossScale: 0.7,
      description: 'โน้ตน้อย หน้าต่างจังหวะกว้าง ฟื้นตัวง่าย'
    },
    normal: {
      label: 'NORMAL', thai: 'ปกติ', level: 2, timingScale: 1.0,
      stepScale: 1.0, chaseScale: 1.0, recoverScale: 1.0, spellLossScale: 1.0,
      description: 'ความหนาแน่นโน้ตปานกลาง สมดุล'
    },
    hard: {
      label: 'HARD', thai: 'ยาก', level: 3, timingScale: 0.8,
      stepScale: 1.25, chaseScale: 1.35, recoverScale: 0.6, spellLossScale: 1.3,
      description: 'โน้ตถี่ หน้าต่างแคบ นางยักษ์เร่งเร็ว'
    }
  },

  defaults: {
    musicVolume: 0.85,
    sfxVolume: 0.7,
    difficulty: 'normal',
    songId: 'feltwood_requiem',
    calibrationMs: 0,       // + means the player hits late (input is shifted earlier)
    noteSpeed: 1.0,
    screenShake: true,
    showEarlyLate: true
  },

  keys: {
    hit: ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyJ', 'KeyF'],
    pause: ['KeyP', 'Escape'],
    fullscreen: ['KeyF11']
  }
};
