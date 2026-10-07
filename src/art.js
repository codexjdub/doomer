// Hand-drawn pixel art: pickups, props and effects. Each picture is
// drawn with canvas paths at 4× size and point-sampled down, which gives hard
// pixel edges without placing pixels by hand. A second "glow" layer marks
// the parts that ignore lighting: lamps, fire, keycards.
import { OPAQUE, BRIGHT } from './renderer.js';
import { PPM } from './sprites.js';

const K = 4;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Paint a sprite `w`×`h` pixels. draw(c, g) gets the normal and glow layers,
// scaled so one unit is `unit` pixels' worth of design space.
export function paint(w, h, draw, { ax = w / 2, ay = h, ppm = PPM, unit = 1 } = {}) {
  w = Math.ceil(w);
  h = Math.ceil(h);
  const b = canvas(w * K, h * K), g = canvas(w * K, h * K);
  const bc = b.getContext('2d'), gc = g.getContext('2d');
  bc.scale(K / unit, K / unit);
  gc.scale(K / unit, K / unit);
  draw(bc, gc);
  const bd = bc.getImageData(0, 0, w * K, h * K).data, gd = gc.getImageData(0, 0, w * K, h * K).data;
  const data = new Uint32Array(w * h), m = K >> 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y * K + m) * w * K + x * K + m) * 4;
      const src = gd[i + 3] >= 128 ? gd : bd[i + 3] >= 128 ? bd : null;
      if (!src) continue;
      data[y * w + x] = OPAQUE | (src === gd ? BRIGHT : 0) | (src[i + 2] << 16) | (src[i + 1] << 8) | src[i];
    }
  }
  return { w, h, data, ax, ay, ppm };
}

// ---------------------------------------------------------------- helpers

function poly(c, pts, fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fill();
}

function ell(c, x, y, rx, ry, fill, rot = 0) {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rot, 0, Math.PI * 2);
  c.fill();
}

function rect(c, x, y, w, h, fill) {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
}

let seed = 1;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

// A ragged blob of fire: rings from dark orange out to a white-hot core.
function fireball(g, x, y, r, rings = ['#b8300a', '#f06a14', '#ffb030', '#fff0b0'], ragged = .25) {
  rings.forEach((col, k) => {
    const rr = r * (1 - k / rings.length * .85);
    g.fillStyle = col;
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, j = 1 + (rnd() - .5) * ragged * 2;
      g.lineTo(x + Math.cos(a) * rr * j, y + Math.sin(a) * rr * j);
    }
    g.fill();
  });
}

const STEEL = '#4a4e56', STEEL_L = '#7c828c', STEEL_D = '#23252a', WOOD = '#7a4a24';

// ---------------------------------------------------------------- pickups

function medkit(c, g, w, h) {
  rect(c, 0, h * .25, w, h * .75, '#d8d4cc');
  rect(c, 0, h * .78, w, h * .22, '#9c988f');
  rect(c, w * .1, h * .25, w * .8, h * .12, '#eeeae4');
  rect(c, w * .42, h * .32, w * .16, h * .52, '#c81e1e');
  rect(c, w * .3, h * .46, w * .4, h * .2, '#c81e1e');
  rect(c, w * .36, 0, w * .28, h * .25, '#45474c');
}

function armor(c, g) {
  poly(c, [[3, 4], [7, 2], [13, 2], [17, 4], [18, 18], [10, 20], [2, 18]], '#2a5ab0');
  poly(c, [[3, 4], [7, 2], [8, 6], [4, 8]], '#3a74d0');
  poly(c, [[17, 4], [13, 2], [12, 6], [16, 8]], '#3a74d0');
  rect(c, 6, 9, 8, 7, '#1e4488');
  rect(g, 9.4, 6, 1.4, 12, '#7ad8ff');
  rect(g, 5, 10, 10, 1.4, '#7ad8ff');
}

function shells(c) {
  rect(c, 0, 4, 14, 6, '#8a1a10');
  rect(c, 0, 8.5, 14, 1.5, '#5a0e08');
  for (let i = 0; i < 5; i++) {
    rect(c, 1 + i * 2.6, 0, 2, 5, '#b01c10');
    rect(c, 1 + i * 2.6, 3.4, 2, 1.4, '#d8a440');
  }
}

function bullets(c, g) {
  rect(c, 0, 1, 14, 9, '#4a5230');
  rect(c, 0, 1, 14, 1.5, '#5e6a3c');
  rect(c, 0, 8.5, 14, 1.5, '#2e3420');
  rect(g, 0, 4.4, 14, 1.6, '#ffd040');
}

function shotgunSide(c) {
  rect(c, 2, 3, 22, 1.8, STEEL_L);
  rect(c, 2, 4.8, 18, 1.6, STEEL_D);
  rect(c, 12, 4, 7, 2.6, WOOD);
  poly(c, [[22, 2.6], [36, 3.2], [37, 8], [24, 6.4]], WOOD);
  rect(c, 21, 2.2, 4, 4.4, STEEL_D);
}

function chaingunSide(c) {
  for (let i = 0; i < 3; i++) rect(c, 1, 2 + i * 1.6, 18, 1.2, i === 1 ? STEEL_L : STEEL);
  rect(c, 1, 1.4, 2, 6.4, STEEL_D);
  rect(c, 12, 1.4, 2, 6.4, STEEL_D);
  rect(c, 18, 0, 12, 9, STEEL_D);
  rect(c, 19, 1, 10, 2, STEEL);
  poly(c, [[22, 9], [26, 9], [27, 13], [23, 13]], '#1c1d20');
}

function keycard(color, light) {
  return (c, g) => {
    rect(g, 0, 0, 8, 11, color);
    rect(g, 1, 1.2, 6, 1.6, '#ffffff');
    rect(g, 1, 4, 6, 6, light);
  };
}

const ITEM_ART = {
  '+': [14, 10, (c, g) => medkit(c, g, 14, 10)],
  H: [20, 14, (c, g) => medkit(c, g, 20, 14)],
  A: [20, 20, armor],
  S: [14, 10, shells],
  U: [14, 10, bullets],
  G: [38, 9, shotgunSide],
  C: [31, 13, chaingunSide],
  K: [8, 11, keycard('#e02818', '#ff6a50')],
  J: [8, 11, keycard('#2858e0', '#6a9aff')],
  V: [8, 11, keycard('#e0a818', '#ffe070')],
};

const itemCache = {};
export function itemSprite(type) {
  if (!itemCache[type]) {
    const [w, h, draw] = ITEM_ART[type];
    itemCache[type] = paint(w, h, draw);
  }
  return itemCache[type];
}

// ---------------------------------------------------------------- props

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export function lampSprite(color) {
  return paint(32, 6, (c, g) => {
    rect(c, 8, 0, 1, 2, '#333');
    rect(c, 23, 0, 1, 2, '#333');
    rect(c, 0, 2, 32, 3, '#2a2d31');
    rect(c, 0, 2, 32, 1, '#454950');
    rect(g, 2, 4.6, 28, 1.4, hex(color));
  }, { ay: 0 });
}

export function torchSprite() {
  return paint(14, 48, (c, g) => {
    poly(c, [[1, 48], [3, 45], [11, 45], [13, 48]], '#3a3632');
    rect(c, 6, 8, 2, 38, '#4a4440');
    rect(c, 6, 8, 1, 38, '#625a54');
    poly(c, [[0, 2], [14, 2], [10, 8], [4, 8]], '#3a3632');
    rect(c, 0, 2, 14, 1, '#625a54');
    rect(g, 2, 1, 10, 1.6, '#ff8a20');
    rect(g, 4, 0, 6, 1.2, '#ffd060');
  });
}

export function exitPadSprite() {
  return paint(72, 9, (c, g) => {
    ell(c, 36, 5, 36, 4, '#2a2e33');
    ell(c, 36, 4.4, 34, 3.4, '#3a4046');
    ell(g, 36, 4.4, 29, 2.8, '#40ffb0');
    ell(c, 36, 4.4, 26, 2.2, '#123828');
    ell(g, 36, 4.4, 20, 1.4, '#1a8a60');
  });
}

// ---------------------------------------------------------------- effects

// Fireballs: two flickering frames; big ones for the Warlord.
export function fireballSprites(big) {
  const s = big ? 22 : 14;
  return [0, 1].map((f) => {
    seed = 11 + f * 7 + (big ? 3 : 0);
    return paint(s, s, (c, g) => fireball(g, s / 2, s / 2, s / 2 - .5, undefined, .3), { ay: s / 2, ppm: PPM * .9 });
  });
}

// An explosion: a ball of fire that grows, then breaks up into smoke.
export function explosionSprites() {
  const s = 44;
  return [0, 1, 2, 3, 4].map((f) => {
    seed = 31 + f * 5;
    return paint(s, s, (c, g) => {
      const t = f / 4, r = s / 2 * (.35 + .65 * Math.min(1, t * 1.6));
      if (f < 3) fireball(g, s / 2, s / 2, r, f === 0 ? undefined : ['#a02808', '#e05a10', '#ffa028', ...(f === 1 ? ['#ffe090'] : [])], .35);
      else {
        for (let i = 0; i < 9; i++) {
          const a = rnd() * 6.28, d = rnd() * r * .6;
          ell(c, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r * (.25 + rnd() * .2), r * (.25 + rnd() * .2), f === 3 ? '#5a4a40' : '#3a3430');
        }
        if (f === 3) fireball(g, s / 2, s / 2, r * .45, ['#a02808', '#e05a10'], .5);
      }
    }, { ay: s / 2 });
  });
}

// Flames streaming off a burning skull, drawn just behind it.
export function skullFlameSprites() {
  return [0, 1, 2].map((f) => {
    seed = 51 + f * 9;
    return paint(30, 34, (c, g) => {
      for (const [col, k] of [['#c0300a', 1], ['#f07018', .75], ['#ffc040', .45]]) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(3, 30);
        const tips = 6;
        for (let i = 0; i <= tips; i++) {
          const x = 3 + i / tips * 24, top = 30 - (12 + rnd() * 18) * k;
          g.lineTo(x - 2, 30 - (30 - top) * .4);
          g.lineTo(x + (rnd() - .5) * 3, top);
        }
        g.lineTo(27, 30);
        g.closePath();
        g.fill();
      }
    }, { ay: 26 });
  });
}

// Bits of monster: meat, bone, gut, and a twitching hand.
export function gibSprites() {
  const art = [
    [7, 6, (c) => { ell(c, 3.5, 3, 3.5, 2.8, '#6a0a06'); ell(c, 3, 2.4, 2, 1.4, '#a8221a'); }],
    [9, 4, (c) => { rect(c, 1, 1.5, 7, 1.4, '#d8ccb0'); ell(c, 1.2, 2.2, 1.2, 1.4, '#e8dcc0'); ell(c, 7.8, 2.2, 1.2, 1.4, '#e8dcc0'); }],
    [8, 6, (c) => { c.strokeStyle = '#b0405a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(1, 4); c.bezierCurveTo(3, 0, 5, 6, 7, 2); c.stroke(); }],
    [6, 6, (c) => { ell(c, 3, 3, 2.8, 2.6, '#3a1a10'); ell(c, 2.4, 2.4, 1.2, 1, '#6a2a1a'); }],
  ];
  return art.map(([w, h, draw]) => paint(w, h, draw, { ay: h }));
}
