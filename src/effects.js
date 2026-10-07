// Visual effects for the pixel renderer: particles (fire, sparks, blood,
// smoke), gibs that fly and come to rest on the floor, animated explosions,
// and the lights that move or flash (static ones are baked into the level).

// ---------------------------------------------------------------- particles

export class Particles {
  // Additive particles glow (fire, sparks); the others are blended (blood, smoke).
  constructor(max, additive) {
    this.max = max;
    this.additive = additive;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.rgba = new Float32Array(max * 4);
  }

  // Colours may go above 1 for glowing particles.
  spawn(x, y, z, vx, vy, vz, life, size, sizeEnd, r, g, b, a = 1, gravity = 0, drag = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = size;
    this.s1[i] = sizeEnd;
    this.rgba[i * 4] = r;
    this.rgba[i * 4 + 1] = g;
    this.rgba[i * 4 + 2] = b;
    this.rgba[i * 4 + 3] = a;
    this.grav[i] = gravity;
    this.drag[i] = drag;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3, drag = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= drag;
      this.vel[j + 1] = this.vel[j + 1] * drag - this.grav[i] * dt;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
    }
  }

  draw(R) {
    const scale = this.additive ? 80 : 255, sizeK = this.additive ? .45 : .55;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const k = this.life[i] / this.maxLife[i], c = i * 4;
      const size = (this.s1[i] + (this.s0[i] - this.s1[i]) * k) * sizeK;
      const a = this.rgba[c + 3] * Math.min(1, k * 2.5);
      R.drawParticle(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], size,
        this.rgba[c] * scale, this.rgba[c + 1] * scale, this.rgba[c + 2] * scale, a, this.additive);
    }
  }

  clear() {
    this.life.fill(0);
  }
}

// ---------------------------------------------------------------- gibs

export class Gibs {
  constructor(sprites) {
    this.sprites = sprites;
    this.level = null;
    this.items = [];
  }

  // Throw `count` bits of monster from (x, y, z), pushed along dir.
  burst(x, y, z, count, force, dir) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - .5) * force + (dir ? dir.x * force * .5 : 0);
      const vz = (Math.random() - .5) * force + (dir ? dir.z * force * .5 : 0);
      this.items.push({
        x, y: y + (Math.random() - .5) * .6, z, vx, vy: Math.random() * force * .9 + 2, vz,
        kind: (Math.random() * this.sprites.length) | 0, flip: Math.random() < .5, age: 0, rest: false,
      });
    }
    while (this.items.length > 400) this.items.shift();
  }

  update(dt) {
    const L = this.level;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age > 40) {
        this.items.splice(i, 1);
        continue;
      }
      if (it.rest) continue;
      it.vy -= 18 * dt;
      const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt, cell = L.at(nx, nz);
      if (L.blocked(cell) || cell.floor > it.y + .1) {
        it.vx *= -.4;
        it.vz *= -.4;
      } else {
        it.x = nx;
        it.z = nz;
      }
      it.y += it.vy * dt;
      const here = L.at(it.x, it.z);
      if (it.y < here.floor) {
        it.y = here.floor;
        it.vy *= -.3;
        it.vx *= .55;
        it.vz *= .55;
        if (Math.abs(it.vy) < .6 && it.vx * it.vx + it.vz * it.vz < .5) it.rest = true;
      }
      if (it.y > here.ceil - .1) {
        it.y = here.ceil - .1;
        it.vy = -Math.abs(it.vy) * .3;
      }
    }
  }

  draw(R) {
    for (const it of this.items) R.drawSprite(this.sprites[it.kind], it.x, it.y, it.z, it.flip);
  }

  clear() {
    this.items.length = 0;
  }
}

// ---------------------------------------------------------------- explosions

export class Blasts {
  constructor(sprites) {
    this.small = sprites;
    // The same pictures drawn half as large again for big blasts.
    this.big = sprites.map((s) => ({ ...s, ppm: s.ppm / 1.6 }));
    this.items = [];
  }

  add(pos, big) {
    this.items.push({ x: pos.x, y: pos.y, z: pos.z, big, t: 0 });
  }

  update(dt) {
    for (const b of this.items) b.t += dt;
    this.items = this.items.filter((b) => b.t < .5);
  }

  draw(R) {
    for (const b of this.items) {
      const set = b.big ? this.big : this.small, f = Math.min(set.length - 1, (b.t / .5 * set.length) | 0);
      R.drawSprite(set[f], b.x, b.y, b.z);
    }
  }

  clear() {
    this.items.length = 0;
  }
}

// ---------------------------------------------------------------- lights

// Lights that move, flash or come and go: the muzzle, fireballs, explosions,
// burning skulls, keycards. src: { pos, color, intensity, range, flicker? }.
export class Lights {
  constructor() {
    this.sources = [];
  }

  add(src) {
    src.current = src.intensity;
    this.sources.push(src);
    return src;
  }

  remove(src) {
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
  }

  clear() {
    this.sources.length = 0;
  }

  // The brightest lights near the camera this frame.
  active(cam, t) {
    const out = [];
    for (const s of this.sources) {
      let k = s.intensity;
      if (s.flicker) k *= 1 + Math.sin(t * 13 + s.pos.x * 7) * .08 * s.flicker + Math.sin(t * 29 + s.pos.z * 3) * .06 * s.flicker;
      s.current = k;
      if (k <= .05) continue;
      const d = Math.hypot(s.pos.x - cam.x, s.pos.z - cam.z);
      if (d > 30 + s.range) continue;
      out.push(s);
    }
    if (out.length > 12) out.sort((a, b) => b.current * b.range - a.current * a.range).length = 12;
    return out;
  }
}
