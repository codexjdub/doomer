// Every sound is synthesized with the Web Audio API: filtered noise for
// gunfire and explosions, detuned oscillators for monster voices.

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = .7;
    this.listener = { x: 0, z: 0, yaw: 0 };
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4);
    const wet = ctx.createGain();
    wet.gain.value = .4;
    this.reverb.connect(wet);
    wet.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbience();
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  impulse(seconds) {
    const rate = this.ctx.sampleRate, len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  // An output node for one sound, attenuated and panned by distance and
  // direction from the listener, with a send into the reverb.
  out(pos, vol = 1, wet = .3) {
    const ctx = this.ctx, g = ctx.createGain();
    let gain = vol, node = g;
    if (pos) {
      const L = this.listener, dx = pos.x - L.x, dz = pos.z - L.z, d = Math.hypot(dx, dz);
      gain *= 1 / (1 + d * d * .01);
      if (ctx.createStereoPanner && d > .5) {
        const p = ctx.createStereoPanner();
        const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
        p.pan.value = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * .75;
        g.connect(p);
        node = p;
      }
    }
    g.gain.value = gain;
    node.connect(this.master);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      node.connect(s);
      s.connect(this.reverb);
    }
    return g;
  }

  env(t0, attack, dur, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, .0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    return g;
  }

  noise(dest, t0, dur, { type = 'bandpass', freq = 1000, freqEnd, q = 1, gain = 1, attack = .003 } = {}) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = this.env(t0, attack, dur, gain);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + .05);
  }

  tone(dest, t0, dur, { type = 'sine', freq = 440, freqEnd, gain = .5, attack = .005, lowpass, vibrato } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = vibrato[0];
      lg.gain.value = vibrato[1];
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + .05);
    }
    let node = o;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      o.connect(f);
      node = f;
    }
    const g = this.env(t0, attack, dur, gain);
    node.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + .05);
  }

  play(name, pos = null, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, r = () => .9 + Math.random() * .2;
    switch (name) {
      case 'pistol': {
        const o = this.out(pos, vol, .35);
        this.noise(o, t, .16, { freq: 1600 * r(), q: .8, gain: .9 });
        this.tone(o, t, .12, { freq: 170, freqEnd: 50, gain: .8 });
        break;
      }
      case 'shotgun': {
        const o = this.out(pos, vol, .45);
        this.noise(o, t, .45, { type: 'lowpass', freq: 3200, freqEnd: 300, gain: 1.2 });
        this.tone(o, t, .3, { freq: 110, freqEnd: 32, gain: 1.2 });
        this.noise(o, t + .42, .05, { type: 'highpass', freq: 2500, gain: .35 });
        this.noise(o, t + .55, .06, { type: 'highpass', freq: 1800, gain: .4 });
        break;
      }
      case 'chaingun': {
        const o = this.out(pos, vol, .25);
        this.noise(o, t, .09, { freq: 1300 * r(), q: .9, gain: .8 });
        this.tone(o, t, .07, { freq: 140, freqEnd: 60, gain: .6 });
        break;
      }
      case 'empty': {
        const o = this.out(pos, vol * .6, 0);
        this.tone(o, t, .03, { type: 'square', freq: 1900, gain: .25 });
        break;
      }
      case 'switch': {
        const o = this.out(pos, vol * .5, .1);
        this.noise(o, t, .06, { type: 'highpass', freq: 2200, gain: .4 });
        this.noise(o, t + .08, .05, { type: 'highpass', freq: 1600, gain: .35 });
        break;
      }
      case 'fireball': {
        const o = this.out(pos, vol, .3);
        this.noise(o, t, .5, { freq: 350, freqEnd: 1400, q: 1.5, gain: .7, attack: .05 });
        break;
      }
      case 'explode': {
        const o = this.out(pos, vol, .5);
        this.noise(o, t, .8, { type: 'lowpass', freq: 1400, freqEnd: 120, gain: 1.1 });
        this.tone(o, t, .5, { freq: 70, freqEnd: 28, gain: .9 });
        break;
      }
      case 'impSight':
      case 'impGrowl': {
        const o = this.out(pos, vol, .35), f = 170 * r();
        this.tone(o, t, .7, { type: 'sawtooth', freq: f, freqEnd: f * .6, gain: .45, lowpass: 900, vibrato: [28, 18], attack: .04 });
        this.noise(o, t, .5, { freq: 700, q: 2, gain: .25, attack: .05 });
        break;
      }
      case 'bruteSight': {
        const o = this.out(pos, vol, .4), f = 85 * r();
        this.tone(o, t, 1, { type: 'sawtooth', freq: f, freqEnd: f * .7, gain: .6, lowpass: 600, vibrato: [22, 10], attack: .05 });
        this.tone(o, t, 1, { type: 'square', freq: f * 1.02, freqEnd: f * .72, gain: .3, lowpass: 500, attack: .05 });
        break;
      }
      case 'bossSight':
      case 'bossRoar': {
        const o = this.out(pos, vol * 1.3, .6);
        this.tone(o, t, 2, { type: 'sawtooth', freq: 58, freqEnd: 38, gain: .8, lowpass: 420, vibrato: [18, 6], attack: .1 });
        this.tone(o, t, 2, { type: 'sawtooth', freq: 59.5, freqEnd: 39, gain: .6, lowpass: 380, attack: .1 });
        this.noise(o, t, 1.6, { type: 'lowpass', freq: 500, freqEnd: 200, gain: .5, attack: .15 });
        break;
      }
      case 'skullSight': {
        const o = this.out(pos, vol, .3), f = 900 * r();
        this.tone(o, t, .45, { type: 'sawtooth', freq: f, freqEnd: f * 1.6, gain: .3, lowpass: 3000, vibrato: [35, 60], attack: .02 });
        this.noise(o, t, .4, { freq: 2400, q: 3, gain: .25, attack: .03 });
        break;
      }
      case 'skullCharge': {
        const o = this.out(pos, vol, .3);
        this.noise(o, t, .6, { freq: 500, freqEnd: 2600, q: 1.2, gain: .6, attack: .03 });
        this.tone(o, t, .5, { type: 'sawtooth', freq: 1400, freqEnd: 600, gain: .25, lowpass: 3500, vibrato: [40, 80] });
        break;
      }
      case 'pain': {
        const o = this.out(pos, vol, .2), f = 320 * r();
        this.tone(o, t, .22, { type: 'sawtooth', freq: f, freqEnd: f * .55, gain: .45, lowpass: 1400 });
        break;
      }
      case 'death': {
        const o = this.out(pos, vol, .4), f = 260 * r();
        this.tone(o, t, .8, { type: 'sawtooth', freq: f, freqEnd: 55, gain: .55, lowpass: 1100, vibrato: [20, 12] });
        this.noise(o, t, .5, { type: 'lowpass', freq: 900, freqEnd: 200, gain: .6 });
        break;
      }
      case 'gib': {
        const o = this.out(pos, vol, .3);
        this.noise(o, t, .35, { type: 'lowpass', freq: 700, freqEnd: 150, gain: .9 });
        this.noise(o, t + .05, .25, { freq: 1800, q: 3, gain: .3 });
        break;
      }
      case 'claw': {
        const o = this.out(pos, vol, .15);
        this.noise(o, t, .18, { type: 'highpass', freq: 1500, freqEnd: 4000, gain: .5, attack: .02 });
        break;
      }
      case 'bite': {
        const o = this.out(pos, vol, .15);
        this.noise(o, t, .12, { type: 'lowpass', freq: 900, gain: .8 });
        this.tone(o, t, .1, { type: 'square', freq: 90, freqEnd: 50, gain: .4 });
        break;
      }
      case 'stomp': {
        const o = this.out(pos, vol * 1.3, .5);
        this.tone(o, t, .6, { freq: 55, freqEnd: 25, gain: 1.2 });
        this.noise(o, t, .5, { type: 'lowpass', freq: 400, freqEnd: 80, gain: .8 });
        break;
      }
      case 'hurt': {
        const o = this.out(null, vol, .1), f = 150 * r();
        this.tone(o, t, .25, { type: 'sawtooth', freq: f, freqEnd: f * .7, gain: .45, lowpass: 900 });
        this.noise(o, t, .12, { type: 'lowpass', freq: 800, gain: .3 });
        break;
      }
      case 'playerDeath': {
        const o = this.out(null, vol, .3);
        this.tone(o, t, 1.2, { type: 'sawtooth', freq: 180, freqEnd: 45, gain: .6, lowpass: 900, vibrato: [8, 6] });
        break;
      }
      case 'land': {
        const o = this.out(null, vol * .5, 0);
        this.noise(o, t, .1, { type: 'lowpass', freq: 400, gain: .6 });
        break;
      }
      case 'jump': {
        const o = this.out(null, vol * .3, 0);
        this.noise(o, t, .08, { type: 'lowpass', freq: 600, gain: .4 });
        break;
      }
      case 'item': {
        const o = this.out(null, vol * .5, .15);
        this.tone(o, t, .08, { type: 'triangle', freq: 660, gain: .5 });
        this.tone(o, t + .07, .12, { type: 'triangle', freq: 990, gain: .5 });
        break;
      }
      case 'weapon': {
        const o = this.out(null, vol * .5, .25);
        [440, 554, 659, 880].forEach((f, i) => this.tone(o, t + i * .06, .18, { type: 'square', freq: f, gain: .22, lowpass: 2500 }));
        break;
      }
      case 'key': {
        const o = this.out(null, vol * .6, .4);
        this.tone(o, t, .6, { freq: 880, gain: .4 });
        this.tone(o, t + .1, .7, { freq: 1320, gain: .35 });
        break;
      }
      case 'door': {
        const o = this.out(pos, vol, .3);
        this.noise(o, t, 1.1, { type: 'lowpass', freq: 380, gain: .7, attack: .08 });
        this.tone(o, t, 1.1, { type: 'sawtooth', freq: 48, gain: .25, lowpass: 200, attack: .08 });
        this.noise(o, t + 1, .12, { type: 'lowpass', freq: 600, gain: .8 });
        break;
      }
      case 'locked': {
        const o = this.out(pos, vol * .6, .1);
        this.tone(o, t, .28, { type: 'square', freq: 110, gain: .3, lowpass: 800 });
        break;
      }
      case 'exit': {
        const o = this.out(null, vol * .6, .6);
        [262, 330, 392, 523, 659].forEach((f, i) => this.tone(o, t + i * .1, .6, { type: 'triangle', freq: f, gain: .3 }));
        break;
      }
      default:
        break;
    }
  }

  startAmbience() {
    const ctx = this.ctx, t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.value = .0001;
    bus.gain.exponentialRampToValueAtTime(1, t + 4);
    bus.connect(this.master);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    lp.connect(bus);
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = .07;
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();
    for (const [f, g] of [[43.65, .07], [43.95, .06], [65.4, .03]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      og.gain.value = g;
      o.connect(og);
      og.connect(lp);
      o.start();
    }
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 260;
    nf.Q.value = .6;
    const ng = ctx.createGain();
    ng.gain.value = .025;
    n.connect(nf);
    nf.connect(ng);
    ng.connect(bus);
    n.start();
  }
}
