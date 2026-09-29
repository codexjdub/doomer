// Adaptive soundtrack, synthesized live with Web Audio. Three layers share one
// clock (140 BPM, 16th-note steps): a dark ambient bed while exploring, a heavy
// riff with drums while monsters are hunting you, and a crushing half-time
// theme for the boss fight. Switching layers crossfades on the next bar.

const BPM = 140;
const STEP = 60 / BPM / 4;
const LOOKAHEAD = .15;
const E1 = 41.2, E2 = 82.41, E3 = 164.81;
const note = (base, semis) => base * Math.pow(2, semis / 12);

// Combat riff over two bars: [step, semitones above E2, length in steps, palm-muted].
const RIFF = [
  [0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [3, 0, 1, 1], [4, 3, 2, 0], [6, 0, 1, 1], [7, 0, 1, 1],
  [8, 0, 1, 1], [9, 0, 1, 1], [10, 6, 2, 0], [12, 5, 2, 0], [14, 3, 2, 0],
  [16, 0, 1, 1], [17, 0, 1, 1], [18, 0, 1, 1], [19, 0, 1, 1], [20, 3, 2, 0], [22, 0, 1, 1], [23, 0, 1, 1],
  [24, 1, 4, 0], [28, 0, 1, 1], [29, 0, 1, 1], [30, 12, 2, 0],
];
const KICK = '1010101110101110';

// Boss chords over two bars: [step, semitones above E2, length in steps].
const BOSS = [[0, 0, 8], [8, 1, 8], [16, 0, 8], [24, 6, 4], [28, 5, 4]];

// Explore pads, two bars each: [root semitones above E2, chord intervals]. Em, F, Em, C.
const PADS = [[0, [0, 7, 12, 15]], [1, [0, 7, 12, 16]], [0, [0, 7, 12, 15]], [-4, [0, 7, 12, 16]]];
const BELLS = [0, 3, 7, 10, 12, 15];
// Layer levels, balanced so the music sits about 12 dB under the gunfire.
const LEVEL = { explore: .55, combat: .22, boss: .28 };

function driveCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh((i / (n - 1) * 2 - 1) * 3);
  return c;
}

export class Music {
  constructor(sound) {
    this.sound = sound;
    this.volume = .5;
    this.mode = 'explore';
    this.want = 'explore';
    this.running = false;
  }

  start() {
    const ctx = this.sound.ctx;
    if (this.running || !ctx) return;
    this.running = true;
    this.build(this.sound.master, this.sound.reverb);
    this.step = 0;
    this.phase = 0;
    this.nextTime = ctx.currentTime + .1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  // Wire the layer buses and the two guitar amps into the given outputs.
  build(master, reverb) {
    const ctx = this.sound.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(master);
    this.wet = ctx.createGain();
    this.wet.gain.value = .5;
    this.wet.connect(reverb);
    this.layers = {};
    for (const name of ['explore', 'combat', 'boss']) {
      const g = ctx.createGain();
      g.gain.value = name === this.mode ? LEVEL[name] : 0;
      g.connect(this.out);
      g.connect(this.wet);
      this.layers[name] = g;
    }
    this.curve = driveCurve();
    this.amps = { combat: this.amp(this.layers.combat), boss: this.amp(this.layers.boss) };
    this.fading = null;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.setTargetAtTime(v, this.sound.ctx.currentTime, .05);
  }

  setMode(mode) {
    this.want = mode;
  }

  schedule() {
    const ctx = this.sound.ctx;
    if (ctx.state !== 'running') return;
    // After a stall (background tab, pause) jump ahead instead of catching up.
    if (this.nextTime < ctx.currentTime - .25) this.nextTime = ctx.currentTime + .05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  playStep(step, t) {
    if (step % 16 === 0 && this.want !== this.mode) this.switchTo(this.want, step, t);
    const pos = step - this.phase;
    this[this.mode](pos, t);
    if (this.fading && t < this.fading.until) this[this.fading.name](pos + this.fading.offset, t);
  }

  switchTo(mode, step, t) {
    const from = this.mode;
    this.layers[from].gain.setTargetAtTime(0, t, .4);
    this.layers[mode].gain.cancelScheduledValues(t);
    this.layers[mode].gain.setTargetAtTime(LEVEL[mode], t, .04);
    // The outgoing layer keeps playing from where it was for one more bar.
    this.fading = { name: from, until: t + STEP * 16, offset: step - this.phase };
    this.mode = mode;
    this.phase = step;
    if (mode !== 'explore') this.crash(this.layers[mode], t, .7);
  }

  // ------------------------------------------------------------ layers

  explore(pos, t) {
    const L = this.layers.explore, cycle = pos % 128;
    if (cycle % 32 === 0) {
      const [root, chord] = PADS[cycle / 32];
      this.pad(L, t, chord.map((i) => note(E2, root + i + 12)), STEP * 34);
      this.bass(L, t, note(E1, root), STEP * 30, .16, 180);
    }
    const beat = pos % 16;
    if (beat === 0) this.kick(L, t, .3, 90);
    if (beat === 3) this.kick(L, t, .2, 80);
    if (cycle % 32 === 20 && Math.random() < .65) {
      this.bell(L, t, note(E3, 12 + BELLS[(Math.random() * BELLS.length) | 0]));
    }
  }

  combat(pos, t) {
    const L = this.layers.combat, p = pos % 32, beat = pos % 16;
    if (KICK[beat] === '1') this.kick(L, t, .85);
    if (beat === 4 || beat === 12) this.snare(L, t, .55);
    if (beat % 2 === 0) this.hat(L, t, beat % 4 === 0 ? .12 : .08, beat === 14 && p === 30);
    if (pos % 128 === 0) this.crash(L, t, .5);
    for (const [s, semis, len, muted] of RIFF) {
      if (s !== p) continue;
      this.guitar(this.amps.combat, t, note(E2, semis), STEP * len, muted);
      this.bass(L, t, note(E1, semis), STEP * len * (muted ? .8 : 1), .22, 700);
    }
  }

  boss(pos, t) {
    const L = this.layers.boss, p = pos % 32, beat = pos % 16;
    if (beat === 0 || beat === 6 || beat === 10) this.kick(L, t, 1, 130);
    if (beat === 8) this.snare(L, t, .8);
    if (beat % 4 === 0) this.hat(L, t, .1, false);
    if (pos % 64 >= 60) this.tom(L, t, [180, 150, 120, 95][pos % 4]);
    if (pos % 64 === 0) {
      this.choir(L, t, [note(E3, 0), note(E3, 7), note(E3, 12), note(E3, 15)], STEP * 66);
      this.crash(L, t, .6);
    }
    for (const [s, semis, len] of BOSS) {
      if (s !== p) continue;
      this.guitar(this.amps.boss, t, note(E2, semis - 12), STEP * len, false);
      this.bass(L, t, note(E1, semis - 12), STEP * len, .3, 300);
    }
  }

  // ------------------------------------------------------------ instruments

  // Distortion amp shared by all guitar notes on a layer: drive, a tanh
  // waveshaper, then filters standing in for a speaker cabinet.
  amp(dest) {
    const ctx = this.sound.ctx;
    const drive = ctx.createGain();
    drive.gain.value = 6;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.curve;
    shaper.oversample = '4x';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 80;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 750;
    mid.Q.value = 1;
    mid.gain.value = -6;
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 3400;
    const out = ctx.createGain();
    out.gain.value = .085;
    drive.connect(shaper);
    shaper.connect(hp);
    hp.connect(mid);
    mid.connect(cab);
    cab.connect(out);
    out.connect(dest);
    return drive;
  }

  env(dest, t, attack, peak, releaseAt, release) {
    const g = this.sound.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, releaseAt, release);
    g.connect(dest);
    return g;
  }

  osc(dest, t, stop, type, freq, detune = 0) {
    const o = this.sound.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  noise(dest, t, stop) {
    const s = this.sound.ctx.createBufferSource();
    s.buffer = this.sound.noiseBuf;
    s.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(stop);
  }

  filter(dest, type, freq, q = .7) {
    const f = this.sound.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  // Power chord: root, fifth and octave from detuned saws. Palm-muted notes are
  // short and darker, which is what makes the chug.
  guitar(amp, t, f, dur, muted) {
    const len = muted ? STEP * .85 : dur;
    const g = this.env(amp, t, .004, .5, t + len * (muted ? .5 : .9), muted ? .02 : .08);
    const dest = muted ? this.filter(g, 'lowpass', 900) : g;
    const stop = t + len + .5;
    this.osc(dest, t, stop, 'sawtooth', f, -7);
    this.osc(dest, t, stop, 'sawtooth', f, 7);
    this.osc(dest, t, stop, 'sawtooth', f * 1.5, 0);
    if (!muted) this.osc(dest, t, stop, 'sawtooth', f * 2, 4);
  }

  bass(dest, t, f, dur, vol, cutoff) {
    const g = this.env(this.filter(dest, 'lowpass', cutoff), t, .006, vol, t + dur * .9, .05);
    this.osc(g, t, t + dur + .4, 'sawtooth', f);
    this.osc(g, t, t + dur + .4, 'sine', f / 2);
  }

  kick(dest, t, vol, start = 150) {
    const ctx = this.sound.ctx;
    const g = this.env(dest, t, .002, vol, t + .08, .09);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(start, t);
    o.frequency.exponentialRampToValueAtTime(40, t + .12);
    o.connect(g);
    o.start(t);
    o.stop(t + .5);
    this.noise(this.env(this.filter(dest, 'highpass', 3000), t, .001, vol * .15, t + .005, .01), t, t + .05);
  }

  snare(dest, t, vol) {
    this.noise(this.env(this.filter(dest, 'bandpass', 1900, .8), t, .001, vol, t + .03, .06), t, t + .35);
    this.osc(this.env(dest, t, .001, vol * .5, t + .02, .04), t, t + .2, 'triangle', 185);
  }

  hat(dest, t, vol, open) {
    this.noise(this.env(this.filter(dest, 'highpass', 7500), t, .001, vol, t + .01, open ? .12 : .015), t, t + (open ? .6 : .1));
  }

  crash(dest, t, vol) {
    this.noise(this.env(this.filter(dest, 'highpass', 4200), t, .002, vol * .35, t + .05, .6), t, t + 3);
  }

  tom(dest, t, f) {
    const ctx = this.sound.ctx;
    const g = this.env(dest, t, .002, .5, t + .06, .1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * .6, t + .25);
    o.connect(g);
    o.start(t);
    o.stop(t + .6);
  }

  pad(dest, t, freqs, dur) {
    const g = this.env(this.filter(dest, 'lowpass', 750), t, 1.4, .05, t + dur, 1.2);
    for (const f of freqs) {
      this.osc(g, t, t + dur + 5, 'sawtooth', f, -9);
      this.osc(g, t, t + dur + 5, 'sawtooth', f, 9);
    }
  }

  bell(dest, t, f) {
    const g = this.env(dest, t, .003, .1, t + .02, .9);
    this.osc(g, t, t + 5, 'sine', f);
    this.osc(this.env(g, t, .003, .5, t + .01, .25), t, t + 2, 'sine', f * 2.76);
  }

  // A wordless choir: detuned saws through two vowel formants.
  choir(dest, t, freqs, dur) {
    const g = this.env(dest, t, 2, .045, t + dur, 1.5);
    const a = this.filter(g, 'bandpass', 700, 4), b = this.filter(g, 'bandpass', 1150, 5);
    for (const f of freqs) {
      for (const d of [-12, 0, 12]) {
        this.osc(a, t, t + dur + 6, 'sawtooth', f, d);
        this.osc(b, t, t + dur + 6, 'sawtooth', f, d);
      }
    }
  }
}
