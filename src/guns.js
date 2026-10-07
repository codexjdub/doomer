// First-person guns. The old 3D view models are rebuilt from boxes and
// cylinders, shaded like metal, wood and plastic, and baked from the
// player's eye into pixel-art sprites, one per animation frame.
import { rasterize, shrink, SS, mul, eulerXYZ, translate, scaleM } from './sprites.js';
import { paint } from './art.js';

const MAT = {
  steel: { c: [.27, .29, .33], spec: 1.1, shin: 28 },
  dark: { c: [.11, .12, .14], spec: .7, shin: 24 },
  polymer: { c: [.085, .085, .095], spec: .35, shin: 12 },
  wood: { c: [.46, .25, .11], spec: .35, shin: 14 },
  glove: { c: [.2, .13, .08], spec: .15, shin: 6 },
  knuckle: { c: [.26, .17, .1], spec: .2, shin: 6 },
  sleeve: { c: [.17, .22, .11], spec: .1, shin: 4 },
  pad: { c: [.24, .31, .16], spec: .2, shin: 8 },
};
const NEAR = .06;
const OUTLINE = 0x2000000 | 0x0a0808;
const LIGHT = norm([-.45, .75, .5]);
const FOV = 58 * Math.PI / 180;

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// A mesh builder: collects shaded triangles in camera space.
class Model {
  constructor() {
    this.verts = [];
    this.tris = [];
  }

  vertex(m, p, n, mat) {
    const x = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3];
    const y = m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7];
    const z = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11];
    const N = norm([m[0] * n[0] + m[1] * n[1] + m[2] * n[2], m[4] * n[0] + m[5] * n[1] + m[6] * n[2], m[8] * n[0] + m[9] * n[1] + m[10] * n[2]]);
    const V = norm([-x, -y, -z]), d = N[0] * LIGHT[0] + N[1] * LIGHT[1] + N[2] * LIGHT[2];
    const R = [2 * d * N[0] - LIGHT[0], 2 * d * N[1] - LIGHT[1], 2 * d * N[2] - LIGHT[2]];
    const s = mat.spec * Math.pow(Math.max(0, R[0] * V[0] + R[1] * V[1] + R[2] * V[2]), mat.shin);
    const k = .34 + .95 * Math.max(0, d);
    // z is stored negated so that nearer is larger, as the rasteriser expects.
    this.verts.push(x, y, -z, mat.c[0] * k + s, mat.c[1] * k + s, mat.c[2] * k + s * .95, 0);
    return this.verts.length / 7 - 1;
  }

  quad(m, a, b, c, d, n, mat) {
    const i = [a, b, c, d].map((p) => this.vertex(m, p, n, mat));
    this.tris.push(i[0], i[1], i[2], i[0], i[2], i[3]);
  }

  box(m, w, h, d, mat) {
    const x = w / 2, y = h / 2, z = d / 2, M = MAT[mat];
    this.quad(m, [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1], M);
    this.quad(m, [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1], M);
    this.quad(m, [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0], M);
    this.quad(m, [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0], M);
    this.quad(m, [x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0], M);
    this.quad(m, [-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0], M);
  }

  // Cylinder along local Y, like three.js CylinderGeometry, with end caps.
  cyl(m, r, len, mat, seg = 12) {
    const M = MAT[mat], h = len / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const p = (a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
      const v = [p(a0, -h), p(a1, -h), p(a1, h), p(a0, h)].map((q, k) => this.vertex(m, q, [Math.cos(k === 1 || k === 2 ? a1 : a0), 0, Math.sin(k === 1 || k === 2 ? a1 : a0)], M));
      this.tris.push(v[0], v[2], v[1], v[0], v[3], v[2]);
      for (const y of [-h, h]) {
        const c = this.vertex(m, [0, y, 0], [0, Math.sign(y), 0], M), e0 = this.vertex(m, p(a0, y), [0, Math.sign(y), 0], M), e1 = this.vertex(m, p(a1, y), [0, Math.sign(y), 0], M);
        this.tris.push(c, e0, e1);
      }
    }
  }
}

// part(parent matrix, x, y, z, rotation x, y, z) → child matrix, like the
// old three.js part() helper.
const at = (parent, x, y, z, rx = 0, ry = 0, rz = 0) => mul(parent, mul(translate(x, y, z), eulerXYZ(rx, ry, rz)));

// A gloved fist around a grip at m, with the forearm running back and down.
function hand(g, m, w = .1, fingers = 4, armRx = -.9, armRz = 0) {
  g.box(at(m, 0, 0, 0), w, .1, .11, 'glove');
  for (let i = 0; i < fingers; i++) g.box(at(m, 0, .03 - i * .026, -.06), w * 1.04, .022, .03, 'knuckle');
  g.box(at(m, -w * .45, .02, -.02, 0, 0, .3), .03, .05, .07, 'knuckle');
  const arm = at(m, 0, -.05, .1, armRx, 0, armRz);
  g.cyl(at(arm, 0, -.2, 0), .065, .4, 'sleeve', 10);
  g.cyl(at(arm, 0, -.02, 0), .07, .05, 'pad', 10);
}

function pistol(root, { slide = 0 }) {
  const g = new Model(), r = mul(root, scaleM(.85));
  const s = at(r, 0, 0, -.13 + slide);
  g.box(s, .07, .085, .34, 'dark');
  g.box(at(s, 0, .043, 0), .05, .004, .32, 'steel');
  g.box(at(s, .036, .01, .05), .002, .03, .2, 'steel');
  for (let i = 0; i < 5; i++) g.box(at(s, 0, 0, .1 + i * .014), .074, .06, .008, 'dark');
  g.box(at(r, 0, .052, -.285 + slide), .012, .02, .02, 'dark');
  g.box(at(r, 0, .052, .02 + slide), .04, .02, .02, 'dark');
  g.box(at(r, 0, -.06, -.12), .066, .05, .3, 'polymer');
  g.cyl(at(r, 0, -.005, -.31, Math.PI / 2), .016, .04, 'dark', 8);
  g.box(at(r, 0, -.14, .02, .28), .062, .17, .085, 'polymer');
  hand(g, at(r, 0, -.13, .03, .28), .09, 3, -1.1, .2);
  return { model: g, muzzle: [0, -.005 * .85, -.34 * .85] };
}

function shotgun(root, { pump = 0 }) {
  const g = new Model();
  for (const x of [-.031, .031]) g.cyl(at(root, x, 0, -.46, Math.PI / 2), .03, .78, 'steel', 14);
  g.box(at(root, 0, .03, -.42), .012, .012, .7, 'dark');
  const p = at(root, 0, -.058, -.44 + pump, Math.PI / 2);
  g.cyl(p, .046, .26, 'wood', 12);
  for (let i = 0; i < 5; i++) g.cyl(at(p, 0, -.1 + i * .05, 0), .048, .008, 'dark', 12);
  g.box(at(root, 0, -.02, 0), .12, .12, .3, 'dark');
  g.box(at(root, 0, .035, -.02), .125, .03, .18, 'steel');
  g.box(at(root, 0, -.09, .3, -.12), .09, .15, .36, 'wood');
  // Left hand under the pump, right hand on the grip.
  hand(g, at(root, -.01, -.11, -.46 + pump, .1, 0, .15), .1, 4, -1.3, -.5);
  hand(g, at(root, 0, -.13, .12, .3), .09, 3, -1.1, .25);
  return { model: g, muzzle: [0, 0, -.86] };
}

function chaingun(root, { spin = 0 }) {
  const g = new Model(), b = at(root, 0, 0, -.38);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + spin;
    g.cyl(at(b, Math.cos(a) * .05, Math.sin(a) * .05, -.1, Math.PI / 2), .018, .62, 'steel', 8);
  }
  g.cyl(at(b, 0, 0, -.36, Math.PI / 2), .075, .04, 'dark', 16);
  g.cyl(at(b, 0, 0, .05, Math.PI / 2), .075, .04, 'dark', 16);
  g.cyl(at(root, 0, 0, .02, Math.PI / 2), .1, .34, 'dark', 16);
  g.box(at(root, 0, -.07, .05), .16, .12, .26, 'polymer');
  g.box(at(root, 0, -.18, .12, .3), .06, .18, .08, 'polymer');
  g.box(at(root, 0, .1, -.12), .025, .04, .1, 'steel');
  g.box(at(root, .1, -.06, .04), .05, .12, .1, 'dark');
  hand(g, at(root, 0, -.2, .12, .3), .09, 3, -1.1, .2);
  hand(g, at(root, -.15, -.05, -.12, 0, 0, -.3), .1, 4, -1.4, -.6);
  return { model: g, muzzle: [0, 0, -.8] };
}

// Where each gun rests in camera space: right of centre, turned in so its
// side shows.
const REST = [[.09, -.15, -.4, .2], [.11, -.21, -.34, .17], [.12, -.25, -.46, .15]];
const BUILD = [pistol, shotgun, chaingun];
const FRAMES = [
  { idle: {}, back: { slide: .05 } },
  { idle: {}, pump1: { pump: .07 }, pump2: { pump: .13 } },
  { idle: {}, spin1: { spin: .35 }, spin2: { spin: .7 } },
];

// Bake every frame for a view of W×VH pixels. Each sprite carries ox/oy, its
// top-left offset from the view centre; each gun its muzzle position.
export function bakeGuns(W, VH) {
  const F = (VH / 2) / Math.tan(FOV / 2);
  return BUILD.map((build, gi) => {
    const [rx, ry, rz, yaw] = REST[gi], root = mul(translate(rx, ry, rz), eulerXYZ(.05, yaw, -.06));
    const frames = {};
    let muzzle = null;
    for (const [name, opts] of Object.entries(FRAMES[gi])) {
      const { model, muzzle: mz } = build(root, opts);
      const v = model.verts, n = v.length / 7;
      const px = new Float32Array(n), py = new Float32Array(n);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const depth = Math.max(NEAR, v[i * 7 + 2]);
        px[i] = v[i * 7] / depth * F;
        py[i] = -v[i * 7 + 1] / depth * F;
        if (v[i * 7 + 2] < NEAR) continue;
        x0 = Math.min(x0, px[i]); x1 = Math.max(x1, px[i]);
        y0 = Math.min(y0, py[i]); y1 = Math.max(y1, py[i]);
      }
      x0 = Math.max(x0, -W / 2 - 2);
      x1 = Math.min(x1, W / 2 + 2);
      y1 = Math.min(y1, VH / 2 + 2);
      const ox = Math.floor(x0) - 1, oy = Math.floor(y0) - 1;
      const w = Math.ceil(x1) + 1 - ox, h = Math.ceil(y1) + 1 - oy;
      for (let i = 0; i < n; i++) {
        px[i] = (px[i] - ox) * SS;
        py[i] = (py[i] - oy) * SS;
        // Depth for the z-test: nearer must be larger.
        v[i * 7 + 2] = -v[i * 7 + 2];
      }
      // Drop triangles that reach behind the near plane (the stock, mostly).
      const tris = [];
      for (let t = 0; t < model.tris.length; t += 3) {
        const a = model.tris[t], b = model.tris[t + 1], c = model.tris[t + 2];
        if (-v[a * 7 + 2] < NEAR || -v[b * 7 + 2] < NEAR || -v[c * 7 + 2] < NEAR) continue;
        tris.push(a, b, c);
      }
      const { zb, cb } = rasterize(v, 7, px, py, tris, w * SS, h * SS);
      frames[name] = { w, h, data: outline(shrink(zb, cb, w, h, w * SS, [0, 0, 0]), w, h), ox, oy, ppm: 1, ax: 0, ay: 0 };
      if (!muzzle) {
        const m = mul(root, translate(...mz));
        muzzle = [m[3] / -m[11] * F, -m[7] / -m[11] * F];
      }
    }
    const size = [.16, .24, .2][gi] * VH;
    frames.flash = flashSprite(size);
    return { frames, muzzle };
  });
}

// A one-pixel dark outline around the gun, so it reads against any wall.
function outline(data, w, h) {
  const out = data.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x]) continue;
      const solid = (i, j) => i >= 0 && j >= 0 && i < w && j < h && data[j * w + i];
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out[y * w + x] = OUTLINE;
    }
  }
  return out;
}

// A muzzle flash: a jagged star with a white-hot centre, fullbright.
function flashSprite(size) {
  const s = Math.max(8, Math.round(size));
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return paint(s, s, (c, g) => {
    for (const [k, col] of [[1, '#ff8a20'], [.7, '#ffc848'], [.38, '#fff6d0']]) {
      g.fillStyle = col;
      g.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2 + .2, r = (i % 2 ? .42 : 1) * s / 2 * k * (.8 + rnd() * .4);
        g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r * .85);
      }
      g.fill();
    }
  }, { ax: s / 2, ay: s / 2 });
}
