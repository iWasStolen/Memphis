/* ============================================================
   Memphis music engine — seeded generative Web Audio synth.
   Every "station" is defined by { style, bpm, seed } and is
   rendered live in the browser: drums, bass, chords, melody.
   ============================================================ */

import { TrackDef } from "./types";

/* ---------------- seeded PRNG ---------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- theory helpers ---------------- */

const NOTE = (semisFromA4: number) => 440 * Math.pow(2, semisFromA4 / 12);

/* scale degrees (semitones from root) */
const SCALES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

/* chord progressions per style (scale degree indices) */
const PROGRESSIONS: Record<string, number[][]> = {
  lofi: [[0, 3, 5, 4], [0, 5, 3, 4], [0, 4, 5, 3]],
  ambient: [[0, 3, 4, 3], [0, 5, 0, 4]],
  synthwave: [[0, 5, 3, 4], [0, 3, 4, 4], [0, 4, 5, 3]],
  house: [[0, 3, 4, 4], [0, 5, 3, 4]],
  jazz: [[1, 4, 0, 5], [0, 3, 1, 4]],
  trap: [[0, 5, 3, 3], [0, 0, 5, 3]],
  chiptune: [[0, 4, 5, 3], [0, 5, 3, 4]],
  rock: [[0, 3, 4, 3], [0, 4, 5, 3]],
};

interface StyleConfig {
  scale: number[];
  rootSemi: number; // semitones above A2 for root
  kick: number[]; // 16-step pattern
  snare: number[];
  hat: number[];
  openHat: number[];
  bassOct: number;
  chordVoicing: number[]; // offsets from chord root
  leadOct: number;
  wave: OscillatorType;
  padWave: OscillatorType;
  swing: number;
  leadDensity: number; // 0..1 chance per 8th note
  filterBase: number;
  drive: number;
  vinyl: boolean;
  arp: boolean;
}

const STYLES: Record<TrackDef["style"], StyleConfig> = {
  lofi: {
    scale: SCALES.dorian, rootSemi: -5,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    bassOct: 0, chordVoicing: [0, 3, 7, 10], leadOct: 24,
    wave: "triangle", padWave: "sine", swing: 0.12, leadDensity: 0.35,
    filterBase: 900, drive: 0.1, vinyl: true, arp: false,
  },
  chiptune: {
    scale: SCALES.major, rootSemi: 3,
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    openHat: [0], bassOct: -12, chordVoicing: [0, 4, 7], leadOct: 24,
    wave: "square", padWave: "square", swing: 0, leadDensity: 0.6,
    filterBase: 8000, drive: 0, vinyl: false, arp: true,
  },
  ambient: {
    scale: SCALES.minor, rootSemi: -10,
    kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    snare: [0], hat: [0], openHat: [0],
    bassOct: 0, chordVoicing: [0, 7, 12, 15], leadOct: 24,
    wave: "sine", padWave: "sine", swing: 0, leadDensity: 0.12,
    filterBase: 1400, drive: 0, vinyl: false, arp: false,
  },
  synthwave: {
    scale: SCALES.minor, rootSemi: -2,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    openHat: [0, 0, 0, 0, 0, 0, 1, 0],
    bassOct: 0, chordVoicing: [0, 3, 7, 12], leadOct: 24,
    wave: "sawtooth", padWave: "sawtooth", swing: 0, leadDensity: 0.45,
    filterBase: 2400, drive: 0.15, vinyl: false, arp: true,
  },
  house: {
    scale: SCALES.minor, rootSemi: 0,
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    openHat: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    bassOct: 0, chordVoicing: [0, 3, 7, 10], leadOct: 24,
    wave: "sawtooth", padWave: "sawtooth", swing: 0, leadDensity: 0.3,
    filterBase: 3200, drive: 0.1, vinyl: false, arp: false,
  },
  jazz: {
    scale: SCALES.dorian, rootSemi: -4,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    openHat: [0, 0, 0, 0, 0, 0, 0, 1],
    bassOct: 0, chordVoicing: [0, 3, 7, 10, 14], leadOct: 24,
    wave: "triangle", padWave: "triangle", swing: 0.22, leadDensity: 0.55,
    filterBase: 2600, drive: 0, vinyl: false, arp: false,
  },
  trap: {
    scale: SCALES.minor, rootSemi: -7,
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0],
    openHat: [0],
    bassOct: -12, chordVoicing: [0, 3, 7], leadOct: 24,
    wave: "square", padWave: "sine", swing: 0, leadDensity: 0.25,
    filterBase: 1800, drive: 0.2, vinyl: false, arp: false,
  },
  rock: {
    scale: SCALES.blues, rootSemi: -3,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    bassOct: 0, chordVoicing: [0, 7, 12], leadOct: 24,
    wave: "sawtooth", padWave: "sawtooth", swing: 0, leadDensity: 0.5,
    filterBase: 3000, drive: 0.25, vinyl: false, arp: false,
  },
};

/* ---------------- engine ---------------- */

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private vinylNode: AudioBufferSourceNode | null = null;
  private vinylGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;
  private startedAt = 0;
  private pausedAt = 0;
  private track: TrackDef | null = null;
  private rnd: (() => number) | null = null;
  private volume = 0.8;
  playing = false;

  private ensureCtx() {
    if (this.ctx) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.ratio.value = 4;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.compressor.connect(this.master);
    this.master.connect(this.ctx.destination);

    /* noise buffer for drums + vinyl */
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    const r = mulberry32(777);
    for (let i = 0; i < len; i++) data[i] = r() * 2 - 1;
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  getVolume() {
    return this.volume;
  }

  /** current position in seconds within the track */
  get position(): number {
    if (!this.ctx || !this.playing) return this.pausedAt;
    return this.pausedAt + (this.ctx.currentTime - this.startedAt);
  }

  load(track: TrackDef, startAt = 0) {
    this.stop();
    this.track = track;
    this.rnd = mulberry32(track.seed || 1);
    this.step = Math.floor(startAt * (track.bpm / 60) * 4);
    this.pausedAt = startAt;
  }

  async play() {
    if (!this.track) return;
    this.ensureCtx();
    if (!this.ctx || !this.compressor) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.playing = true;
    this.startedAt = this.ctx.currentTime;
    this.nextTime = this.ctx.currentTime + 0.06;

    if (STYLES[this.track.style].vinyl) this.startVinyl();

    this.timer = setInterval(() => this.scheduleAhead(), 25);
  }

  pause() {
    if (!this.ctx) return;
    this.pausedAt = this.position;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopVinyl();
  }

  seek(seconds: number) {
    if (!this.track) return;
    const wasPlaying = this.playing;
    const t = Math.min(Math.max(0, seconds), this.track.dur - 0.5);
    this.load(this.track, t);
    if (wasPlaying) void this.play();
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopVinyl();
    this.pausedAt = 0;
  }

  private startVinyl() {
    if (!this.ctx || !this.compressor || !this.noiseBuffer || this.vinylNode) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3800;
    const g = this.ctx.createGain();
    g.gain.value = 0.014;
    src.connect(hp).connect(g).connect(this.compressor);
    src.start();
    this.vinylNode = src;
    this.vinylGain = g;
  }

  private stopVinyl() {
    try {
      this.vinylNode?.stop();
    } catch {
      /* already stopped */
    }
    this.vinylNode = null;
    this.vinylGain = null;
  }

  /* -------- lookahead scheduler -------- */

  private scheduleAhead() {
    if (!this.ctx || !this.track) return;
    const cfg = STYLES[this.track.style];
    const stepDur = 60 / this.track.bpm / 4; // 16th note
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const elapsed = this.pausedAt + (this.nextTime - this.startedAt);
      if (elapsed >= this.track.dur) {
        /* track finished */
        this.pause();
        this.pausedAt = this.track.dur;
        this.onEnded?.();
        return;
      }
      const swing =
        this.step % 2 === 1 ? stepDur * cfg.swing : 0;
      this.scheduleStep(this.step, this.nextTime + swing, cfg, stepDur);
      this.step = (this.step + 1) % 256;
      this.nextTime += stepDur;
    }
  }

  onEnded: (() => void) | null = null;

  private scheduleStep(step: number, time: number, cfg: StyleConfig, stepDur: number) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const t = this.track!;
    const rnd = this.rnd!;

    /* chord changes each bar following a seeded progression */
    const progressions = PROGRESSIONS[t.style] ?? PROGRESSIONS.lofi;
    const prog = progressions[Math.floor(t.seed % progressions.length)];
    const degree = prog[bar % prog.length];
    const rootFreq = NOTE(cfg.rootSemi + cfg.bassOct + t.seed % 5 - 2);
    const scale = cfg.scale;

    /* drums */
    if (cfg.kick[s]) this.kick(time, cfg.drive);
    if (cfg.snare[s]) this.snare(time);
    if (cfg.hat[s]) this.hat(time, 0.35 + rnd() * 0.1);
    if (cfg.openHat[s]) this.hat(time, 0.3, true);

    /* bass on chord changes + syncopation */
    if (s === 0 || s === 6 || s === 10) {
      const bassNote = rootFreq * Math.pow(2, scale[degree % scale.length] / 12);
      this.tone(bassNote, time, stepDur * (s === 0 ? 5 : 2.5), "triangle", 0.22, cfg.filterBase);
    }

    /* chords on chord changes */
    if (s === 0 || s === 8) {
      const chordRoot = rootFreq * 2 * Math.pow(2, scale[degree % scale.length] / 12);
      for (const v of cfg.chordVoicing) {
        const f = chordRoot * Math.pow(2, v / 12);
        this.tone(f, time + rnd() * 0.01, stepDur * 7.5, cfg.padWave, 0.055, cfg.filterBase * 0.8);
      }
    }

    /* arp (chiptune / synthwave) */
    if (cfg.arp && s % 2 === 0) {
      const arpRoot = rootFreq * 4 * Math.pow(2, scale[degree % scale.length] / 12);
      const idx = (s / 2) % cfg.chordVoicing.length;
      const f = arpRoot * Math.pow(2, cfg.chordVoicing[idx] / 12);
      this.tone(f, time, stepDur * 0.9, cfg.wave, 0.07, cfg.filterBase);
    }

    /* lead melody — seeded random walk */
    const leadChance = s % 2 === 0 ? cfg.leadDensity : cfg.leadDensity * 0.4;
    if (rnd() < leadChance && s !== 15) {
      const idx = Math.floor(rnd() * scale.length);
      const oct = rnd() < 0.3 ? 12 : 0;
      const f =
        rootFreq *
        Math.pow(2, (cfg.leadOct + oct + scale[idx]) / 12);
      this.tone(f, time, stepDur * (1 + Math.floor(rnd() * 3)), cfg.wave, 0.085, cfg.filterBase);
    }
  }

  /* -------- voices -------- */

  private tone(
    freq: number,
    time: number,
    dur: number,
    wave: OscillatorType,
    gain: number,
    filterHz: number
  ) {
    if (!this.ctx || !this.compressor) return;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = Math.min(filterHz, 12000);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    osc.connect(filt).connect(g).connect(this.compressor);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private kick(time: number, drive: number) {
    if (!this.ctx || !this.compressor) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(148, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    const g = this.ctx.createGain();
    const peak = 0.65 + drive * 0.3;
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.24);
    osc.connect(g).connect(this.compressor);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  private snare(time: number) {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.32, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    src.connect(bp).connect(g).connect(this.compressor);
    src.start(time);
    src.stop(time + 0.2);
  }

  private hat(time: number, vol: number, open = false) {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.22, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.3 : 0.05));
    src.connect(hp).connect(g).connect(this.compressor);
    src.start(time);
    src.stop(time + (open ? 0.35 : 0.08));
  }
}

/* ---------------- station catalog ---------------- */

interface StationSeed {
  title: string;
  artist: string;
  genre: string;
  style: TrackDef["style"];
  bpm: number;
  dur: number;
}

const STATION_SEEDS: StationSeed[] = [
  { title: "2 A.M. Study Session", artist: "Lofi Cube", genre: "Lofi", style: "lofi", bpm: 78, dur: 180 },
  { title: "Rainy Window Desk", artist: "Lofi Cube", genre: "Lofi", style: "lofi", bpm: 72, dur: 180 },
  { title: "Cassette Homework Club", artist: "Tape Hiss", genre: "Lofi", style: "lofi", bpm: 84, dur: 180 },
  { title: "Midnight Chai", artist: "Slow Spin", genre: "Lofi", style: "lofi", bpm: 66, dur: 180 },
  { title: "8-Bit Victory Lap", artist: "Pixel Quartet", genre: "Chiptune", style: "chiptune", bpm: 140, dur: 150 },
  { title: "Boss Rush Study Break", artist: "Pixel Quartet", genre: "Chiptune", style: "chiptune", bpm: 155, dur: 150 },
  { title: "Overworld Theme No. 9", artist: "Hexadecimal", genre: "Chiptune", style: "chiptune", bpm: 128, dur: 150 },
  { title: "Deep Focus Drift", artist: "Slow Fields", genre: "Ambient", style: "ambient", bpm: 60, dur: 240 },
  { title: "Library Fog", artist: "Slow Fields", genre: "Ambient", style: "ambient", bpm: 52, dur: 240 },
  { title: "Neon Hallway", artist: "Nightdrive Model", genre: "Synthwave", style: "synthwave", bpm: 108, dur: 180 },
  { title: "Chrome Sunset", artist: "Nightdrive Model", genre: "Synthwave", style: "synthwave", bpm: 116, dur: 180 },
  { title: "Retro Grade Grid", artist: "Vector Heart", genre: "Synthwave", style: "synthwave", bpm: 122, dur: 180 },
  { title: "Study Hall House", artist: "Room 303", genre: "House", style: "house", bpm: 124, dur: 200 },
  { title: "Backpack Groove", artist: "Room 303", genre: "House", style: "house", bpm: 120, dur: 200 },
  { title: "Late Practice Loop", artist: "Room 303", genre: "House", style: "house", bpm: 126, dur: 200 },
  { title: "Homework Jazz Trio", artist: "The Practice Rooms", genre: "Jazz", style: "jazz", bpm: 96, dur: 200 },
  { title: "Blue Note Notebook", artist: "The Practice Rooms", genre: "Jazz", style: "jazz", bpm: 88, dur: 200 },
  { title: "Standards After Hours", artist: "Chalk Dust Club", genre: "Jazz", style: "jazz", bpm: 104, dur: 200 },
  { title: "Beat Block Trap", artist: "Subwoofer Math", genre: "Trap", style: "trap", bpm: 140, dur: 160 },
  { title: "808 Study Hall", artist: "Subwoofer Math", genre: "Trap", style: "trap", bpm: 132, dur: 160 },
  { title: "Gym Class Rock", artist: "The Detentions", genre: "Rock", style: "rock", bpm: 132, dur: 170 },
  { title: "Recess Anthem", artist: "The Detentions", genre: "Rock", style: "rock", bpm: 144, dur: 170 },
  { title: "Chalkboard Riff", artist: "The Detentions", genre: "Rock", style: "rock", bpm: 126, dur: 170 },
];

export const STATIONS: TrackDef[] = STATION_SEEDS.map((s, i) => ({
  id: `${s.style}-${i}`,
  title: s.title,
  artist: s.artist,
  genre: s.genre,
  bpm: s.bpm,
  dur: s.dur,
  seed: 1000 + i * 137,
  style: s.style,
}));

export const GENRES = [
  "All",
  "Lofi",
  "Chiptune",
  "Ambient",
  "Synthwave",
  "House",
  "Jazz",
  "Trap",
  "Rock",
];

export function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
