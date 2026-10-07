// Monster sprites. The sculpted models from monsters.js are posed and drawn
// into pixel art once, at load time, from five angles (front, three-quarter,
// side, back three-quarter, back; the other three angles are mirror images)
// for every frame of every animation, the way Doom's sprites were made from
// models. The game then just picks a picture.
import { monsterRig } from './monsters.js';
import { OPAQUE, BRIGHT } from './renderer.js';
import { byte } from './textures.js';
import { norm, lerp } from './vec.js';

export const PPM = 32;           // sprite pixels per metre
const SS = 3;                    // supersampling while baking
const VIEWS = 5;                 // 0°, 45°, 90°, 135°, 180°
const LIGHT = norm([-.45, .65, .62]);

// How each type looks: overall scale (from the game), brightness and glow.
const LOOK = {
  imp: { scale: 1.15, gain: 4.2, glow: [1, .42, .1] },
  brute: { scale: 1, gain: 4.4, glow: [1, .25, .06] },
  boss: { scale: 2.3, gain: 4.6, glow: [1, .35, .08] },
  skull: { scale: 1, gain: 1.6, glow: [1, .5, .1] },
};

const DETAIL = { bone: [.55, .49, .39], claw: [.12, .09, .07], metal: [.32, .33, .36], tooth: [.62, .56, .43] };

// ---------------------------------------------------------------- poses

// Part rotations relative to the sculpted rest pose, mirroring the old
// procedural animation in enemies.js. Returns { rot: { part: [x, y, z] }, bodyY }.
function makePose() {
  const rot = {};
  const pose = (name, x = 0, y = 0, z = 0) => { rot[name] = [x, y, z]; };
  return { rot, pose, bodyY: 0 };
}

function walkPose(type, phase) {
  const P = makePose(), { pose } = P;
  const s = Math.sin(phase), c = Math.cos(phase), a = s * .6;
  pose('thighL', -a);
  pose('thighR', a);
  pose('shinL', Math.max(0, c) * .7);
  pose('shinR', Math.max(0, -c) * .7);
  pose('armL', a * .7);
  pose('armR', -a * .7);
  pose('foreL', -Math.max(0, s) * .3);
  pose('foreR', -Math.max(0, -s) * .3);
  pose('body', .08, 0, s * .05);
  pose('head', -.06);
  pose('jaw', .14);
  P.bodyY = Math.abs(c) * .05;
  return P;
}

function attackPose(type, kind, k) {
  const P = makePose(), { pose } = P;
  const wind = Math.min(1, k * 2), strike = Math.max(0, k * 2 - 1);
  pose('thighL', -.15 * wind);
  pose('thighR', .1 * wind);
  pose('shinL', .2 * wind);
  pose('shinR', .1 * wind);
  if (type === 'brute') {
    pose('body', lerp(0, .35, wind) - strike * .25);
    pose('head', -.25 * wind);
    pose('jaw', strike > 0 ? lerp(.8, -.1, strike) : lerp(0, .8, wind));
    pose('armL', -1.1 * wind + strike * .6);
    pose('armR', -1.1 * wind + strike * .6);
    pose('foreL', -.4 * wind);
    pose('foreR', -.4 * wind);
  } else if (type === 'imp' && kind === 'melee') {
    const arm = lerp(0, -1.6, wind) + strike * 1.9;
    pose('armL', arm, 0, .1);
    pose('armR', arm, 0, -.1);
    pose('foreL', -.3 * wind + strike * .6);
    pose('foreR', -.3 * wind + strike * .6);
    pose('body', -.1 * wind + strike * .35);
    pose('jaw', .35 * wind);
  } else if (type === 'boss') {
    P.bodyY = kind === 'melee' ? wind * .35 - strike * .45 : 0;
    const arm = lerp(0, -2.3, wind) + strike * 1.4;
    pose('armL', arm, 0, .15);
    pose('armR', arm, 0, -.15);
    pose('foreL', -.4 * wind);
    pose('foreR', -.4 * wind);
    pose('body', -.15 * wind + strike * .25);
    pose('head', .15 * wind - strike * .2);
    pose('jaw', .5 * wind);
  } else {
    // Imp throw: right arm winds back over the shoulder, then whips forward.
    pose('armR', lerp(0, 2.4, wind) - strike * 3.4, 0, -.1);
    pose('foreR', lerp(0, -1.2, wind) + strike * 1.1);
    pose('armL', -.3 * wind, 0, .1);
    pose('body', -.12 * wind + strike * .3, .2 * wind - strike * .4);
    pose('jaw', .4 * wind);
  }
  return P;
}

function painPose() {
  const P = makePose();
  P.pose('body', -.35);
  P.pose('head', -.3, 0, .15);
  P.pose('jaw', .5);
  return P;
}

function jawPose(open) {
  const P = makePose();
  P.pose('jaw', open);
  return P;
}

// Animations per type: name → list of poses. Death frames are the pain pose
// tipping over to the side.
const ANIMS = {
  imp: {
    idle: [makePose()],
    walk: [0, 1, 2, 3].map((i) => walkPose('imp', i * Math.PI / 2)),
    ranged: [.3, .6, .85].map((k) => attackPose('imp', 'ranged', k)),
    melee: [.3, .6, .85].map((k) => attackPose('imp', 'melee', k)),
    pain: [painPose()],
  },
  brute: {
    idle: [makePose()],
    walk: [0, 1, 2, 3].map((i) => walkPose('brute', i * Math.PI / 2)),
    melee: [.3, .6, .85].map((k) => attackPose('brute', 'melee', k)),
    pain: [painPose()],
  },
  boss: {
    idle: [makePose()],
    walk: [0, 1, 2, 3].map((i) => walkPose('boss', i * Math.PI / 2)),
    melee: [.3, .6, .85].map((k) => attackPose('boss', 'melee', k)),
    ranged: [.3, .6, .85].map((k) => attackPose('boss', 'ranged', k)),
    pain: [painPose()],
  },
  skull: {
    idle: [jawPose(.2), jawPose(.5)],
    attack: [jawPose(.7)],
    pain: [jawPose(.55)],
  },
};
const DEATH = [.25, .7, 1.2, Math.PI / 2];

// ---------------------------------------------------------------- matrices
// 3×4 row-major affine transforms.

function eulerXYZ(x, y, z) {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [c * e, -c * f, d, 0, af + be * d, ae - bf * d, -b * c, 0, bf - ae * d, be + af * d, a * c, 0];
}

function mul(A, B) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      o[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c] + (c === 3 ? A[r * 4 + 3] : 0);
    }
  }
  return o;
}

const translate = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
const scaleM = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0];

// ---------------------------------------------------------------- baking

// Append a cone (claw, spike, tooth) as triangles in part space.
function cone(out, base, tip, r, color) {
  const ax = tip[0] - base[0], ay = tip[1] - base[1], az = tip[2] - base[2];
  const len = Math.hypot(ax, ay, az) || 1, dir = [ax / len, ay / len, az / len];
  const ref = Math.abs(dir[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm([dir[1] * ref[2] - dir[2] * ref[1], dir[2] * ref[0] - dir[0] * ref[2], dir[0] * ref[1] - dir[1] * ref[0]]);
  const v = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const p = (a) => [base[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, base[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, base[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r];
    const n = (a) => norm([u[0] * Math.cos(a) + v[0] * Math.sin(a) + dir[0] * .3, u[1] * Math.cos(a) + v[1] * Math.sin(a) + dir[1] * .3, u[2] * Math.cos(a) + v[2] * Math.sin(a) + dir[2] * .3]);
    out.push([p(a0), n(a0), color, 0], [p(a1), n(a1), color, 0], [tip, dir, color, 0]);
  }
}

// Extra geometry for a part: spikes, teeth.
function detailTris(part) {
  const tris = [];
  for (const [base, tip, r, mat] of part.spikes || []) cone(tris, base, tip, r * 1.3, DETAIL[mat] || DETAIL.bone);
  if (part.teeth) {
    const t = part.teeth;
    for (let i = 0; i < t.count; i++) {
      const u = t.count === 1 ? .5 : i / (t.count - 1), x = t.from + (t.to - t.from) * u;
      const edge = Math.abs(u - .5) * 2, jag = .75 + .5 * Math.abs(Math.sin(i * 12.9898 + t.count));
      const len = t.len * jag * (1 + edge * .5), y = t.y, z = t.z - edge * edge * t.arc;
      cone(tris, [x, y, z], [x * 1.05, y + t.dir * len, z + .006], t.r * (1 + edge * .4) * 1.4, DETAIL.tooth);
    }
  }
  return tris;
}

// Bake one picture. view: angle of the camera around the monster (0 = in
// front); tilt: falling over sideways (death).
function bakeFrame(type, P, view, tilt = 0) {
  const rig = monsterRig(type), look = LOOK[type], S = PPM * SS;
  // Model → view space: scale, turn so the camera looks from +Z, tip over.
  let root = mul(eulerXYZ(0, -view, 0), scaleM(look.scale));
  if (tilt) root = mul([Math.cos(-tilt), -Math.sin(-tilt), 0, 0, Math.sin(-tilt), Math.cos(-tilt), 0, 0, 0, 0, 1, 0], root);
  const rest = rig.pose || {}, M = {};
  for (const part of rig.parts) {
    const r0 = rest[part.name] || [0, 0, 0], dr = P.rot[part.name] || [0, 0, 0];
    const piv = part.name === 'body' ? [part.pivot[0], part.pivot[1] + P.bodyY, part.pivot[2]] : part.pivot;
    let m = mul(translate(...piv), eulerXYZ(r0[0] + dr[0], r0[1] + dr[1], r0[2] + dr[2]));
    if (part.scale) m = mul(m, scaleM(part.scale));
    M[part.name] = mul(part.parent ? M[part.parent] : root, m);
  }

  // Transform every vertex into view space and shade it.
  const verts = [], tris = [], eyes = [];
  const pushVert = (m, p, n, col, glow) => {
    const x = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3];
    const y = m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7];
    const z = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11];
    let nx = m[0] * n[0] + m[1] * n[1] + m[2] * n[2], ny = m[4] * n[0] + m[5] * n[1] + m[6] * n[2], nz = m[8] * n[0] + m[9] * n[1] + m[10] * n[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const dif = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    const rim = Math.pow(1 - Math.abs(nz), 3) * .35;
    // Brighten the charred palettes for pixel art, rolling off so wounds and
    // metal don't blow out.
    const k = look.gain * (.42 + .95 * dif), tone = (v) => v * k / (1 + v * k * .7);
    verts.push(x, y, z, tone(col[0]) + rim * .25, tone(col[1]) + rim * .12, tone(col[2]) + rim * .08, glow);
    return verts.length / 7 - 1;
  };
  const tmpP = [0, 0, 0], tmpN = [0, 0, 0];
  for (const part of rig.parts) {
    const m = M[part.name], g = part.mesh, base = verts.length / 7;
    for (let i = 0; i < g.pos.length / 3; i++) {
      tmpP[0] = g.pos[i * 3]; tmpP[1] = g.pos[i * 3 + 1]; tmpP[2] = g.pos[i * 3 + 2];
      tmpN[0] = g.nrm[i * 3]; tmpN[1] = g.nrm[i * 3 + 1]; tmpN[2] = g.nrm[i * 3 + 2];
      pushVert(m, tmpP, tmpN, [g.col[i * 3], g.col[i * 3 + 1], g.col[i * 3 + 2]], g.glow[i]);
    }
    for (let i = 0; i < g.index.length; i++) tris.push(base + g.index[i]);
    for (const [p, n, col, glow] of detailTris(part)) tris.push(pushVert(m, p, n, col.map((v) => v / look.gain * 1.6), glow));
    for (const e of part.eyes || []) {
      const x = m[0] * e[0] + m[1] * e[1] + m[2] * e[2] + m[3], y = m[4] * e[0] + m[5] * e[1] + m[6] * e[2] + m[7], z = m[8] * e[0] + m[9] * e[1] + m[10] * e[2] + m[11];
      eyes.push([x, y, z, part.eyeSize * look.scale, rig.eyes]);
    }
    if (part.core) {
      const [cx, cy, cz, r] = part.core;
      const x = m[0] * cx + m[1] * cy + m[2] * cz + m[3], y = m[4] * cx + m[5] * cy + m[6] * cz + m[7], z = m[8] * cx + m[9] * cy + m[10] * cz + m[11];
      eyes.push([x, y, z, r * look.scale * .6, [7, 2.6, .8]]);
    }
  }

  // Bounds; dead monsters are dropped onto the ground.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < verts.length; i += 7) {
    minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]);
    minY = Math.min(minY, verts[i + 1]); maxY = Math.max(maxY, verts[i + 1]);
  }
  const drop = tilt ? -minY : 0;
  minY += drop; maxY += drop;
  const pad = 2 / PPM;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const w = Math.ceil((maxX - minX) * PPM), h = Math.ceil((maxY - minY) * PPM), sw = w * SS, sh = h * SS;

  const sx = new Float32Array(verts.length / 7), sy = new Float32Array(verts.length / 7);
  for (let i = 0; i < sx.length; i++) {
    sx[i] = (verts[i * 7] - minX) * S;
    sy[i] = (maxY - verts[i * 7 + 1] - drop) * S;
  }
  const { zb, cb } = rasterize(verts, 7, sx, sy, tris, sw, sh);
  const data = shrink(zb, cb, w, h, sw, look.glow);
  // Eyes and the boss's core: fullbright dots where they are not hidden.
  for (const [x, y, z, size, col] of eyes) {
    const px = (x - minX) * S, py = (maxY - y - drop) * S;
    const sx = Math.floor(px), sy = Math.floor(py);
    if (sx < 0 || sy < 0 || sx >= sw || sy >= sh || z < zb[sy * sw + sx] - .04) continue;
    const m = Math.max(col[0], col[1], col[2]), rad = Math.max(.5, size * PPM * 1.2), cx = px / SS, cy = py / SS;
    const c = OPAQUE | BRIGHT | (byte(col[2] / m * 255) << 16) | (byte(col[1] / m * 255) << 8) | byte(col[0] / m * 255);
    if (rad < .8) {
      const i = Math.floor(cx), j = Math.floor(cy);
      if (i >= 0 && j >= 0 && i < w && j < h) data[j * w + i] = c;
      continue;
    }
    for (let j = Math.floor(cy - rad); j <= Math.ceil(cy + rad); j++) {
      for (let i = Math.floor(cx - rad); i <= Math.ceil(cx + rad); i++) {
        if (i >= 0 && j >= 0 && i < w && j < h && (i + .5 - cx) ** 2 + (j + .5 - cy) ** 2 <= rad * rad) data[j * w + i] = c;
      }
    }
  }
  return { w, h, data, ax: -minX * PPM, ay: maxY * PPM, ppm: PPM };
}

// Fill triangles into a depth buffer at supersampled resolution. verts holds
// `stride` floats per vertex: x, y, z (larger z is nearer), then r, g, b, glow;
// sx/sy are the vertices' positions on the canvas. Colours are interpolated.
export function rasterize(verts, stride, sx, sy, tris, sw, sh) {
  const zb = new Float32Array(sw * sh).fill(-1e9), cb = new Float32Array(sw * sh * 4);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ax = sx[a], ay = sy[a], bx = sx[b], by = sy[b], cx = sx[c], cy = sy[c];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-6) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(sw - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(sh - 1, Math.ceil(Math.max(ay, by, cy)));
    const ia = 1 / area;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const qx = px + .5, qy = py + .5;
        const w0 = ((bx - qx) * (cy - qy) - (by - qy) * (cx - qx)) * ia;
        const w1 = ((cx - qx) * (ay - qy) - (cy - qy) * (ax - qx)) * ia;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = verts[a * stride + 2] * w0 + verts[b * stride + 2] * w1 + verts[c * stride + 2] * w2, o = py * sw + px;
        if (z <= zb[o]) continue;
        zb[o] = z;
        for (let k = 0; k < 4; k++) cb[o * 4 + k] = verts[a * stride + 3 + k] * w0 + verts[b * stride + 3 + k] * w1 + verts[c * stride + 3 + k] * w2;
      }
    }
  }
  return { zb, cb };
}

// Shrink an SS× raster to sprite pixels: a pixel is solid when most of it
// is covered. Strongly glowing pixels become fullbright.
export function shrink(zb, cb, w, h, sw, glowColor) {
  const data = new Uint32Array(w * h), gl = glowColor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0, r = 0, g = 0, b = 0, e = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const o = (y * SS + j) * sw + x * SS + i;
          if (zb[o] === -1e9) continue;
          n++;
          r += cb[o * 4]; g += cb[o * 4 + 1]; b += cb[o * 4 + 2]; e += cb[o * 4 + 3];
        }
      }
      if (n * 2 < SS * SS) continue;
      r /= n; g /= n; b /= n; e /= n;
      r += gl[0] * e * 1.5; g += gl[1] * e * 1.5; b += gl[2] * e * 1.5;
      const bright = e > .45 ? BRIGHT : 0;
      data[y * w + x] = OPAQUE | bright | (byte(b * 255) << 16) | (byte(g * 255) << 8) | byte(r * 255);
    }
  }
  return data;
}

export { SS, mul, eulerXYZ, translate, scaleM };

// ---------------------------------------------------------------- lookup

const sheets = {};

// Bake every frame of a monster type: { anim: [frame][view] }, plus death.
export function bakeMonster(type) {
  if (sheets[type]) return sheets[type];
  const sheet = {};
  for (const [anim, poses] of Object.entries(ANIMS[type])) {
    sheet[anim] = poses.map((P) => Array.from({ length: VIEWS }, (_, v) => bakeFrame(type, P, v * Math.PI / 4)));
  }
  if (type !== 'skull') sheet.death = DEATH.map((tilt) => [bakeFrame(type, painPose(), 0, tilt)]);
  sheets[type] = sheet;
  return sheet;
}

// Pick the picture for a monster seen from angle `rel` (camera direction
// relative to where the monster faces, radians).
export function monsterSprite(type, anim, frame, rel) {
  const sheet = sheets[type] || bakeMonster(type);
  const frames = sheet[anim] || sheet.idle;
  const views = frames[Math.min(frames.length - 1, frame)];
  if (views.length === 1) return { sprite: views[0], flip: false };
  let o = Math.round((((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  const flip = o > 4;
  if (flip) o = 8 - o;
  return { sprite: views[o], flip };
}
