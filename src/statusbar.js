// The status bar along the bottom of the screen, drawn straight into the
// renderer's framebuffer with a small bitmap font: ammo, health, the weapons
// you own, armor and keycards.

const FONT = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'], A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'], M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
};

const BAR_W = 320, BAR_H = 32;
const pack = ([r, g, b]) => 0xff000000 | (b << 16) | (g << 8) | r;
const textWidth = (s, k) => s.length * 6 * k - k;

export class StatusBar {
  constructor() {
    this.w = 0;
    this.buf = null;
  }

  // Background: rough metal across the whole width, with the five panels
  // centred. Rebuilt only when the width changes.
  background(w) {
    this.w = w;
    this.bg = new Uint32Array(w * BAR_H);
    const ox = (w - BAR_W) >> 1;
    for (let y = 0; y < BAR_H; y++) {
      for (let x = 0; x < w; x++) {
        const n = .8 + noise(x * .4, y * .4) * .3 - (y === 0 ? .45 : 0);
        this.bg[y * w + x] = pack([92 * n, 82 * n, 70 * n].map((v) => v | 0));
      }
    }
    this.panels = [[3, 57, 'AMMO'], [60, 126, 'HEALTH'], [129, 175, 'ARMS'], [178, 242, 'ARMOR'], [245, 316, 'KEYS']].map(([a, b, label]) => [a + ox, b + ox, label]);
    for (const [a, b, label] of this.panels) {
      for (let y = 3; y < BAR_H - 2; y++) {
        for (let x = a; x <= b; x++) {
          const n = .85 + noise(x * .5 + 40, y * .5) * .2;
          const c = x === a || y === 3 ? [30, 26, 22] : x === b || y === BAR_H - 3 ? [140, 128, 110] : [52 * n | 0, 46 * n | 0, 40 * n | 0];
          this.bg[y * w + x] = pack(c);
        }
      }
      this.text(this.bg, label, Math.round((a + b) / 2 - textWidth(label, 1) / 2), 21, 1, [196, 184, 160], false);
    }
    this.buf = new Uint32Array(w * BAR_H);
  }

  setPx(buf, x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < BAR_H) buf[y * this.w + x] = c;
  }

  text(buf, str, x, y, k, col, shadow = true) {
    for (const [d, c] of shadow ? [[1, pack([16, 8, 6])], [0, pack(col)]] : [[0, pack(col)]]) {
      let cx = x + d;
      for (const ch of str) {
        const gl = FONT[ch];
        if (gl) {
          for (let r = 0; r < 7; r++) {
            for (let q = 0; q < 5; q++) {
              if (gl[r][q] !== '1') continue;
              for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) this.setPx(buf, cx + q * k + xx, y + d + r * k + yy, c);
            }
          }
        }
        cx += 6 * k;
      }
    }
  }

  // s: { ammo, health, armor, owned: [bool×3], current, keys: Set, time }
  draw(renderer, s) {
    const scale = renderer.scale, w = renderer.W / scale;
    if (w !== this.w) this.background(w);
    const buf = this.buf;
    buf.set(this.bg);
    const P = this.panels, red = [222, 54, 30];
    const big = (str, [a, b], col = red) => this.text(buf, str, Math.round((a + b) / 2 - textWidth(str, 2) / 2), 6, 2, col);
    big(s.ammo === null ? '' : String(s.ammo), P[0], s.ammo === 0 ? [140, 60, 40] : red);
    const lowHealth = s.health <= 25 && Math.sin(s.time * 8) > 0;
    big(`${s.health}%`, P[1], lowHealth ? [255, 200, 120] : red);
    big(`${s.armor}%`, P[3]);
    ['1', '2', '3'].forEach((n, i) => {
      const col = i === s.current ? [255, 240, 200] : s.owned[i] ? [236, 200, 64] : [110, 100, 88];
      this.text(buf, n, P[2][0] + 10 + i * 12, 9, 1, col, false);
    });
    [['red', [220, 40, 30]], ['blue', [50, 110, 230]], ['yellow', [230, 190, 40]]].forEach(([key, col], i) => {
      const x0 = P[4][0] + 17 + i * 15, has = s.keys.has(key);
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 9; x++) {
          const edge = y === 0 || y === 12 || x === 0 || x === 8;
          if (has) this.setPx(buf, x0 + x, 6 + y, pack(edge ? col.map((v) => v * .6 | 0) : y === 3 && x > 2 && x < 6 ? [40, 12, 8] : col));
          else if (edge) this.setPx(buf, x0 + x, 6 + y, pack(col.map((v) => v * .4 | 0)));
        }
      }
    });
    // Copy into the framebuffer, scaled up for the fine pixel size.
    const fb = renderer.fb, W = renderer.W, top = renderer.VH;
    for (let y = 0; y < BAR_H * scale; y++) {
      const src = ((y / scale) | 0) * w, dst = (top + y) * W;
      for (let x = 0; x < W; x++) fb[dst + x] = buf[src + ((x / scale) | 0)];
    }
  }
}

function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
