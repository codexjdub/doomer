// The software renderer. The game is drawn into a small framebuffer, one
// screen column at a time like the shooters of 1993, and scaled up with hard
// pixel edges. Cells can have any floor and ceiling height, so each column
// walks the grid front to back, drawing floors, ceilings and the step faces
// between cells while the unfilled part of the column shrinks. Sprites and
// particles are then depth-tested against a per-pixel depth buffer.
import { createTextures, createSky, TEXEL, SKY_TOP, SKY_BOTTOM, rgbOf } from './textures.js';

const BAR = 32;           // status bar height at 1× pixel size
const FOCAL = .95;        // focal length as a fraction of the view height
const MAX_DIST = 72;
const LIGHT_K = .24;      // converts the old point-light intensities to this renderer
// The widest view shape; wider windows stretch it.
export const MAX_ASPECT = 2.4;

// Light level → banded multiplier. Bright light rolls off instead of clipping,
// and the result snaps to 1/14 steps like the old colour maps.
const band = (v) => (((v * 1.2 / (1 + v * .3)) * 14 + .5) | 0) / 14;
export const OPAQUE = 0x2000000, BRIGHT = 0x1000000;

const SOLID = 1, SKY = 2, DOOR = 4;
const DOOR_TEX = { plain: 'doorPlain', red: 'doorRed', blue: 'doorBlue', yellow: 'doorYellow', boss: 'doorBoss' };

// Clamp a colour, posterize it to 5 bits per channel and pack it for the
// framebuffer.
const pack = (r, g, b) => 0xff000000 | ((b > 255 ? 255 : b) & 0xf8) << 16 | ((g > 255 ? 255 : g) & 0xf8) << 8 | ((r > 255 ? 255 : r) & 0xf8);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.tex = createTextures();
    this.sky = createSky();
    this.dyn = [];
    this.L = new Float32Array(3);
    this.scale = 1;
    this.resize();
  }

  setScale(s) {
    this.scale = s;
    this.resize();
  }

  // Internal resolution: 200 rows (400 at the fine pixel size), as wide as the
  // window's shape needs, so widescreen gets a wider view instead of bars.
  resize(shape = innerWidth / Math.max(1, innerHeight)) {
    const s = this.scale, H = 200 * s;
    // Narrower windows stretch 320×200, like Doom on a 4:3 monitor.
    const aspect = Math.min(MAX_ASPECT, Math.max(1.6, shape));
    const W = Math.round(H * aspect / 2) * 2;
    this.W = W;
    this.H = H;
    this.bar = BAR * s;
    this.VH = H - this.bar;
    this.F = this.VH * FOCAL;
    this.canvas.width = W;
    this.canvas.height = H;
    this.image = this.ctx.createImageData(W, H);
    this.fb = new Uint32Array(this.image.data.buffer);
    this.depth = new Float32Array(W * H);
    this.skyRow = new Int32Array(H);
    this.vh = this.VH;
  }

  // ------------------------------------------------------------ level

  setLevel(level, theme) {
    this.level = level;
    const { w, h } = level, n = w * h, T = this.tex;
    this.lw = w;
    this.lh = h;
    this.floorH = new Float32Array(n);
    this.ceilH = new Float32Array(n);
    this.ceilNow = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.wallT = new Array(n);
    this.sideT = new Array(n);
    this.floorT = new Array(n);
    this.ceilT = new Array(n);
    this.doorAt = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const c = level.cells[i];
      this.floorH[i] = c.floor;
      this.ceilH[i] = c.ceil;
      this.kind[i] = (c.solid ? SOLID : 0) | (c.sky ? SKY : 0) | (c.door ? DOOR : 0);
      this.wallT[i] = T[c.wall] || T.stone;
      this.sideT[i] = T[c.side] || T.panel;
      this.floorT[i] = T[c.ftex] || T.metalFloor;
      this.ceilT[i] = T[c.ctex] || T.ceiling;
      if (c.door) this.doorAt[i] = c.door;
    }
    this.fog = rgbOf(theme.fog).map((v) => v * 255);
    this.density = theme.density;
    const [sky, ground, k] = theme.hemi.map((v, i) => (i < 2 ? rgbOf(v) : v));
    this.ambient = sky.map((v, i) => (v * .55 + ground[i] * .45) * k * .9);
    this.skyAmbient = sky.map((v) => v * k * .7);
    // Fog by distance, in 1/8 m steps.
    this.fogTable = new Float32Array(MAX_DIST * 8 + 1);
    for (let i = 0; i < this.fogTable.length; i++) {
      const d = i / 8 * this.density;
      this.fogTable[i] = 1 - Math.exp(-d * d);
    }
  }

  // Bake static lights into a light map on the cell corners. Each corner is
  // lit from sample points inside its open neighbour cells, with line of sight
  // to the light, so walls cast hard shadows. Flickering lights (fire, lava)
  // go in a separate layer that is modulated every frame.
  bakeLights(lights) {
    const L = this.level, W1 = L.w + 1, H1 = L.h + 1, n = W1 * H1;
    const base = new Float32Array(n * 3), fire = new Float32Array(n * 3), phase = new Float32Array(n);
    const pts = [];
    for (let j = 0; j < H1; j++) {
      for (let i = 0; i < W1; i++) {
        const k = j * W1 + i;
        phase[k] = ((i * 7 + j * 13) % 17) * .37;
        pts.length = 0;
        let sky = 0;
        for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const c = L.cell(i + ox, j + oz);
          // Doors are lit from both sides; secret walls like the walls they hide in.
          if (L.blocked(c) && (!c.door || c.door.secret)) continue;
          if (c.sky) sky++;
          pts.push({ x: i + (ox ? -.3 : .3), y: c.floor + Math.min(1, (c.ceil - c.floor) * .5), z: j + (oz ? -.3 : .3) });
        }
        const a = sky ? this.skyAmbient : this.ambient, f = sky ? Math.min(1, .5 + sky * .25) : 1;
        base[k * 3] = this.ambient[0] + (a[0] - this.ambient[0]) * f;
        base[k * 3 + 1] = this.ambient[1] + (a[1] - this.ambient[1]) * f;
        base[k * 3 + 2] = this.ambient[2] + (a[2] - this.ambient[2]) * f;
        if (!pts.length) continue;
        for (const l of lights) {
          if (Math.abs(l.x - i) > l.range || Math.abs(l.z - j) > l.range) continue;
          let sum = 0;
          for (const p of pts) {
            const d2 = (p.x - l.x) ** 2 + (p.y - l.y) ** 2 + (p.z - l.z) ** 2;
            if (d2 >= l.range * l.range) continue;
            if (!L.lineOfSight(p, l)) continue;
            const win = 1 - d2 / (l.range * l.range);
            sum += LIGHT_K * l.intensity / (d2 + 1) * win * win;
          }
          if (!sum) continue;
          sum /= pts.length;
          const out = l.flicker ? fire : base, c = l.rgb || (l.rgb = rgbOf(l.color));
          out[k * 3] += sum * c[0];
          out[k * 3 + 1] += sum * c[1];
          out[k * 3 + 2] += sum * c[2];
        }
      }
    }
    this.lmBase = base;
    this.lmFire = fire;
    this.lmPhase = phase;
    this.lm = new Float32Array(n * 3);
    this.lmW = W1;
    this.updateLightmap(0);
  }

  updateLightmap(t) {
    const { lm, lmBase, lmFire, lmPhase } = this;
    for (let k = 0, n = lmPhase.length; k < n; k++) {
      const p = lmPhase[k], f = 1 + Math.sin(t * 11 + p) * .09 + Math.sin(t * 23 + p * 2.3) * .06, j = k * 3;
      lm[j] = lmBase[j] + lmFire[j] * f;
      lm[j + 1] = lmBase[j + 1] + lmFire[j + 1] * f;
      lm[j + 2] = lmBase[j + 2] + lmFire[j + 2] * f;
    }
  }

  // Light at a world point: light map plus this frame's dynamic lights.
  light(x, y, z) {
    const L = this.L, lm = this.lm, W1 = this.lmW;
    let i = Math.floor(x), j = Math.floor(z);
    let fx = x - i, fz = z - j;
    if (i < 0) { i = 0; fx = 0; } else if (i >= this.lw) { i = this.lw - 1; fx = 1; }
    if (j < 0) { j = 0; fz = 0; } else if (j >= this.lh) { j = this.lh - 1; fz = 1; }
    const a = (j * W1 + i) * 3, b = a + 3, c = a + W1 * 3, d = c + 3;
    const w0 = (1 - fx) * (1 - fz), w1 = fx * (1 - fz), w2 = (1 - fx) * fz, w3 = fx * fz;
    let r = lm[a] * w0 + lm[b] * w1 + lm[c] * w2 + lm[d] * w3;
    let g = lm[a + 1] * w0 + lm[b + 1] * w1 + lm[c + 1] * w2 + lm[d + 1] * w3;
    let bl = lm[a + 2] * w0 + lm[b + 2] * w1 + lm[c + 2] * w2 + lm[d + 2] * w3;
    const dyn = this.dyn;
    for (let k = 0; k < dyn.length; k++) {
      const l = dyn[k], ex = x - l.x, ey = y - l.y, ez = z - l.z, d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= l.r2) continue;
      const win = 1 - d2 / l.r2, s = l.k / (d2 + 1) * win * win;
      r += s * l.cr;
      g += s * l.cg;
      bl += s * l.cb;
    }
    L[0] = r;
    L[1] = g;
    L[2] = bl;
    return L;
  }

  // Dynamic lights for this frame: [{ pos, color, intensity (or current), range }].
  setDynamicLights(list) {
    this.dyn = list.map((l) => {
      const c = l.rgb || (l.rgb = rgbOf(l.color)), k = l.current ?? l.intensity;
      return { x: l.pos.x, y: l.pos.y, z: l.pos.z, r2: l.range * l.range, k: LIGHT_K * k, cr: c[0], cg: c[1], cb: c[2] };
    }).filter((l) => l.k > .01);
  }

  // ------------------------------------------------------------ world

  // cam: { x, y (eye), z, yaw, pitch }. `full` uses the whole screen height
  // (menus, which have no status bar).
  begin(cam, time, full = false) {
    const VH = this.vh = full ? this.H : this.VH, F = this.F;
    this.time = time;
    this.ex = cam.x;
    this.ey = cam.y;
    this.ez = cam.z;
    this.yaw = cam.yaw;
    this.dx = -Math.sin(cam.yaw);
    this.dz = -Math.cos(cam.yaw);
    this.rx = Math.cos(cam.yaw);
    this.rz = -Math.sin(cam.yaw);
    this.HZ = VH / 2 + Math.tan(cam.pitch) * F;
    const sky = this.sky;
    for (let y = 0; y < VH; y++) {
      const el = Math.atan2(this.HZ - y - .5, F);
      this.skyRow[y] = Math.max(0, Math.min(sky.h - 1, ((SKY_TOP - el) / (SKY_TOP - SKY_BOTTOM) * sky.h) | 0));
    }
    // Doors are cells whose ceiling rises as they open, like Doom's.
    this.ceilNow.set(this.ceilH);
    for (const d of this.level.doors) {
      for (const c of d.cells) this.ceilNow[c.z * this.lw + c.x] = d.floor + d.pos;
    }
  }

  // Shade one texel and write it. `dim` darkens walls by orientation.
  put(i, di, p, x, y, z, d, dim) {
    let r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
    const fog = this.fogTable[Math.min(this.fogTable.length - 1, (d * 8) | 0)];
    if (!(p & BRIGHT)) {
      const L = this.light(x, y, z);
      // Light falls off in visible bands, like the old colour maps.
      const lr = band(L[0] * dim), lg = band(L[1] * dim), lb = band(L[2] * dim);
      r *= lr;
      g *= lg;
      b *= lb;
    }
    const f = this.fog;
    r += (f[0] - r) * fog;
    g += (f[1] - g) * fog;
    b += (f[2] - b) * fog;
    this.fb[i] = pack(r, g, b);
    this.depth[di] = d;
  }

  drawWorld() {
    const { W, vh: VH, F, HZ, ex, ey, ez, dx, dz, rx, rz, lw, lh, kind, floorH, ceilNow, sky } = this;
    const yOf = (hgt, t) => HZ - (hgt - ey) * F / t;
    const lavaShift = this.time * 3.8;
    let cx0 = Math.floor(ex), cz0 = Math.floor(ez);
    const inside = cx0 >= 0 && cz0 >= 0 && cx0 < lw && cz0 < lh;

    for (let x = 0; x < W; x++) {
      const camX = (x + .5 - W / 2) / F, rdx = dx + rx * camX, rdz = dz + rz * camX;
      const skyX = ((((Math.atan2(rdx, rdz) + Math.PI) / (Math.PI * 2)) * sky.w) | 0) % sky.w;
      const ddx = Math.abs(1 / rdx), ddz = Math.abs(1 / rdz), stepX = rdx < 0 ? -1 : 1, stepZ = rdz < 0 ? -1 : 1;
      let mx = cx0, mz = cz0;
      let sx = (rdx < 0 ? ex - mx : mx + 1 - ex) * ddx, sz = (rdz < 0 ? ez - mz : mz + 1 - ez) * ddz;
      let top = 0, bot = VH, t0 = .02, ci = inside ? mz * lw + mx : -1;

      for (let n = 0; n < 300 && top < bot && ci >= 0; n++) {
        const side = sx < sz ? 0 : 1, t1 = side ? sz : sx;
        const cf = floorH[ci], cc = ceilNow[ci], ck = kind[ci];

        // Floor of this cell between t0 and t1.
        if (cf < ey) {
          const yFar = Math.ceil(yOf(cf, t1) - .5), yNear = Math.ceil(yOf(cf, t0) - .5);
          const ys = Math.max(top, yFar), ye = Math.min(bot, yNear);
          if (ys < ye) {
            const tex = this.floorT[ci], data = tex.data, m = tex.mask, lava = data[0] & BRIGHT ? lavaShift : 0;
            for (let y = ys; y < ye; y++) {
              const d = (ey - cf) * F / (y + .5 - HZ), wx = ex + rdx * d, wz = ez + rdz * d;
              const p = data[((((wz * TEXEL + lava * .5) | 0) & m) * tex.size) + (((wx * TEXEL + lava) | 0) & m)];
              this.put(y * W + x, y * W + x, p, wx, cf + .1, wz, d, 1);
            }
          }
          if (yFar < bot) bot = Math.max(top, yFar);
        }
        // Ceiling (or sky) between t0 and t1.
        if (cc > ey && top < bot) {
          const yNear = Math.ceil(yOf(cc, t0) - .5), yFar = Math.ceil(yOf(cc, t1) - .5);
          const ys = Math.max(top, yNear), ye = Math.min(bot, yFar);
          if (ys < ye) {
            if (ck & SKY) {
              for (let y = ys; y < ye; y++) {
                const i = y * W + x;
                this.fb[i] = 0xff000000 | sky.data[this.skyRow[y] * sky.w + skyX];
                this.depth[i] = 1e9;
              }
            } else {
              const tex = this.ceilT[ci], data = tex.data, m = tex.mask;
              for (let y = ys; y < ye; y++) {
                const d = (cc - ey) * F / (HZ - y - .5), wx = ex + rdx * d, wz = ez + rdz * d;
                const p = data[((((wz * TEXEL) | 0) & m) * tex.size) + (((wx * TEXEL) | 0) & m)];
                this.put(y * W + x, y * W + x, p, wx, cc - .1, wz, d, .85);
              }
            }
          }
          if (yFar > top) top = Math.min(bot, yFar);
        }
        if (top >= bot || t1 > MAX_DIST) break;

        // Cross into the next cell.
        if (side) {
          sz += ddz;
          mz += stepZ;
        } else {
          sx += ddx;
          mx += stepX;
        }
        const ni = mx >= 0 && mz >= 0 && mx < lw && mz < lh ? mz * lw + mx : -1;
        const hx = ex + rdx * t1, hz = ez + rdz * t1, along = side ? hx : hz, dim = side ? .82 : 1;
        const nk = ni < 0 ? SOLID : kind[ni];

        if (nk & SOLID) {
          this.wall(x, top, bot, cc, cf, t1, this.wallT[ni] || this.tex.stone, along, hx, hz, dim);
          top = bot;
          break;
        }
        const nf = floorH[ni], nc = ceilNow[ni];
        // A step up: its face hides everything below its top edge.
        if (nf > cf) {
          const hi = Math.min(nf, cc);
          this.wall(x, top, bot, hi, cf, t1, this.sideT[ni], along, hx, hz, dim);
          bot = Math.max(top, Math.min(bot, Math.ceil(yOf(hi, t1) - .5)));
        }
        // A lower ceiling (or a door): its face hides everything above its bottom edge.
        if (nc < cc && top < bot) {
          const lo = Math.max(nc, cf);
          if (nk & DOOR) {
            // The wall above the doorway, then the door slab itself. Secret
            // doors wear the texture of the wall they hide in.
            const door = this.doorAt[ni], lintel = Math.max(lo, this.ceilH[ni]), hi = Math.min(cc, lintel);
            if (lintel < cc) this.wall(x, top, bot, cc, lintel, t1, door.secret ? this.wallT[ni] : this.sideT[ni], along, hx, hz, dim);
            // A secret door's texture sits a few texels out of line with the
            // wall around it (the tell; off every brick and panel size), and
            // rises with it.
            if (door.secret) this.wall(x, top, bot, hi, lo, t1, this.wallT[ni], along, hx, hz, dim, 5, door.pos + 3 / TEXEL);
            else this.doorSlab(x, top, bot, hi, lo, t1, this.tex[DOOR_TEX[door.type]], along, hx, hz, dim, door, side);
          } else {
            this.wall(x, top, bot, cc, lo, t1, this.sideT[ni], along, hx, hz, dim);
          }
          top = Math.min(bot, Math.max(top, Math.ceil(yOf(lo, t1) - .5)));
        }
        ci = ni;
        t0 = t1;
      }
      // Whatever is left is beyond the draw distance: fog.
      if (top < bot) {
        const f = this.fog, col = 0xff000000 | ((f[2] | 0) << 16) | ((f[1] | 0) << 8) | (f[0] | 0);
        for (let y = top; y < bot; y++) {
          this.fb[y * W + x] = col;
          this.depth[y * W + x] = 1e9;
        }
      }
    }
  }

  // A wall face between heights lo..hi at distance t, clipped to the open rows
  // top..bot of column x. The texture is world-aligned; `shift` (texels) and
  // `lift` (metres) move it along and up.
  wall(x, top, bot, hi, lo, t, tex, along, hx, hz, dim, shift = 0, lift = 0) {
    this.face(x, top, bot, hi, lo, t, tex, ((along * TEXEL + shift) | 0) & tex.mask, (lift - this.ey) * TEXEL, TEXEL, false, hx, hz, dim);
  }

  // A door slab: the door texture spread once across the door's width (`side`
  // is 1 when the door runs along x) and height, riding up as it opens.
  doorSlab(x, top, bot, hi, lo, t, tex, along, hx, hz, dim, door, side) {
    const size = tex.size, k = size / door.height;
    const a0 = side ? door.minX : door.minZ, len = side ? door.maxX - door.minX : door.maxZ - door.minZ;
    const u = Math.min(size - 1, Math.max(0, ((along - a0) / len * size) | 0));
    // texel row = (bottom + height - worldY) * k
    this.face(x, top, bot, hi, lo, t, tex, u, (door.floor + door.pos + door.height - this.ey) * k, k, true, hx, hz, dim);
  }

  // Draw texel column u of a face: row v0 at eye height, `scale` texels per
  // metre, wrapping (or clamped, for door slabs) vertically.
  face(x, top, bot, hi, lo, t, tex, u, v0, scale, clamp, hx, hz, dim) {
    const { W, F, HZ, ey } = this;
    const ys = Math.max(top, Math.ceil(HZ - (hi - ey) * F / t - .5)), ye = Math.min(bot, Math.ceil(HZ - (lo - ey) * F / t - .5));
    if (ys >= ye) return;
    const data = tex.data, m = tex.mask, size = tex.size, dv = scale * t / F;
    for (let y = ys; y < ye; y++) {
      const off = y + .5 - HZ, wy = ey - off * t / F;
      let vi = (v0 + off * dv) | 0;
      vi = clamp ? Math.min(size - 1, Math.max(0, vi)) : vi & m;
      this.put(y * W + x, y * W + x, data[vi * size + u], hx, wy, hz, t, dim);
    }
  }

  // ------------------------------------------------------------ sprites

  // A sprite: { w, h, data (packed, OPAQUE/BRIGHT flags), ax, ay, ppm }.
  // (ax, ay) is the pixel that sits on the world point; ppm is pixels per metre.
  drawSprite(s, wx, wy, wz, flip = false, flash = 0) {
    const vx = wx - this.ex, vz = wz - this.ez;
    const d = vx * this.dx + vz * this.dz;
    if (d < .15) return;
    const lat = vx * this.rx + vz * this.rz, F = this.F, W = this.W;
    const k = F / d / s.ppm;
    const left = W / 2 + lat * F / d - s.ax * k, top = this.HZ - (wy - this.ey) * F / d - s.ay * k;
    const x0 = Math.max(0, Math.ceil(left - .5)), x1 = Math.min(W, Math.ceil(left + s.w * k - .5));
    const y0 = Math.max(0, Math.ceil(top - .5)), y1 = Math.min(this.vh, Math.ceil(top + s.h * k - .5));
    if (x0 >= x1 || y0 >= y1) return;
    const L = this.light(wx, wy + .8, wz), fog = this.fogTable[Math.min(this.fogTable.length - 1, (d * 8) | 0)];
    const f = this.fog, inv = 1 / k, data = s.data, sw = s.w, depth = this.depth, fb = this.fb;
    const lr = band(L[0]), lg = band(L[1]), lb = band(L[2]);
    const add = flash * 200;
    for (let x = x0; x < x1; x++) {
      let u = ((x + .5 - left) * inv) | 0;
      if (u >= sw) u = sw - 1;
      if (flip) u = sw - 1 - u;
      for (let y = y0; y < y1; y++) {
        const i = y * W + x;
        if (depth[i] <= d) continue;
        let v = ((y + .5 - top) * inv) | 0;
        if (v >= s.h) v = s.h - 1;
        const p = data[v * sw + u];
        if (!(p & OPAQUE)) continue;
        let r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
        if (!(p & BRIGHT)) {
          r *= lr;
          g *= lg;
          b *= lb;
        }
        r += (f[0] - r) * fog + add;
        g += (f[1] - g) * fog + add;
        b += (f[2] - b) * fog + add;
        fb[i] = pack(r, g, b);
        depth[i] = d;
      }
    }
  }

  // A square blob of colour: additive for fire and sparks, blended for blood
  // and smoke. size is in metres.
  drawParticle(wx, wy, wz, size, r, g, b, a, additive) {
    const vx = wx - this.ex, vz = wz - this.ez;
    const d = vx * this.dx + vz * this.dz;
    if (d < .15 || a <= 0) return;
    const F = this.F, W = this.W;
    const cx = W / 2 + (vx * this.rx + vz * this.rz) * F / d, cy = this.HZ - (wy - this.ey) * F / d;
    // At least one pixel, then clipped to the view; skip it if nothing is left.
    const half = Math.max(.5, size * F / d * .5);
    let x0 = Math.round(cx - half), x1 = Math.max(x0 + 1, Math.round(cx + half));
    let y0 = Math.round(cy - half), y1 = Math.max(y0 + 1, Math.round(cy + half));
    x0 = Math.max(0, x0);
    x1 = Math.min(W, x1);
    y0 = Math.max(0, y0);
    y1 = Math.min(this.vh, y1);
    if (x0 >= x1 || y0 >= y1) return;
    const depth = this.depth, fb = this.fb;
    let L = null;
    if (!additive) L = this.light(wx, wy, wz);
    const fr = additive ? r * a : r * Math.min(1.6, L[0]), fg = additive ? g * a : g * Math.min(1.6, L[1]), fbl = additive ? b * a : b * Math.min(1.6, L[2]);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        if (depth[i] <= d) continue;
        const p = fb[i];
        let pr = p & 255, pg = (p >> 8) & 255, pb = (p >> 16) & 255;
        if (additive) {
          pr += fr;
          pg += fg;
          pb += fbl;
        } else {
          pr += (fr - pr) * a;
          pg += (fg - pg) * a;
          pb += (fbl - pb) * a;
        }
        fb[i] = pack(pr, pg, pb);
      }
    }
  }

  // Draw a screen-space sprite (the weapon) at 1:1, lit by `L`.
  blit(s, left, top, L, flip = false) {
    const W = this.W, fb = this.fb, data = s.data;
    left = Math.round(left);
    top = Math.round(top);
    const lr = L[0], lg = L[1], lb = L[2];
    for (let v = 0; v < s.h; v++) {
      const y = top + v;
      if (y < 0 || y >= this.VH) continue;
      for (let u = 0; u < s.w; u++) {
        const x = left + u;
        if (x < 0 || x >= W) continue;
        const p = data[v * s.w + (flip ? s.w - 1 - u : u)];
        if (!(p & OPAQUE)) continue;
        let r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
        if (!(p & BRIGHT)) {
          r *= lr;
          g *= lg;
          b *= lb;
        }
        fb[y * W + x] = pack(r, g, b);
      }
    }
  }

  // Wash the view toward a colour, like the old palette flashes for pain and
  // pickups. a is 0..1.
  tint(r, g, b, a) {
    if (a <= .01) return;
    const fb = this.fb, n = this.W * this.VH;
    for (let i = 0; i < n; i++) {
      const p = fb[i];
      let pr = p & 255, pg = (p >> 8) & 255, pb = (p >> 16) & 255;
      pr += (r - pr) * a;
      pg += (g - pg) * a;
      pb += (b - pb) * a;
      fb[i] = pack(pr, pg, pb);
    }
  }

  // A small cross in the middle of the view; it turns red on a hit.
  crosshair(hit) {
    const cx = this.W >> 1, cy = this.VH >> 1, s = this.scale, col = hit ? 0xff2030ff : 0xffd8e0e8;
    for (const [dx, dy] of [[-4, 0], [-3, 0], [3, 0], [4, 0], [0, -4], [0, -3], [0, 3], [0, 4]]) {
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.fb[(cy + dy * s + j) * this.W + cx + dx * s + i] = col;
    }
  }

  present() {
    this.ctx.putImageData(this.image, 0, 0);
  }
}
