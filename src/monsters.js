// Sculpted monster models. Each body part is a signed distance field built
// from blended ellipsoids and tapered capsules, meshed with surface nets and
// painted with per-vertex colour, cavity shading and roughness/metalness.
// Glowing veins are drawn per pixel in the shader. Claws, spines and teeth are
// separate sharp cones. Parts are rigid and hang off pivots for animation.
import * as THREE from 'three';

// ---------------------------------------------------------------- noise

const perm = new Uint8Array(512);
(() => {
  let s = 90210;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();
const h3 = (i, j, k) => perm[perm[perm[i & 255] + (j & 255)] + (k & 255)] / 127.5 - 1;

function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = h3(xi, yi, zi), b = h3(xi + 1, yi, zi), c = h3(xi, yi + 1, zi), d = h3(xi + 1, yi + 1, zi);
  const e = h3(xi, yi, zi + 1), f = h3(xi + 1, yi, zi + 1), g = h3(xi, yi + 1, zi + 1), h = h3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}

const smooth = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// ---------------------------------------------------------------- primitives

function ellipsoid(c, r, m = 'skin', k = .05) {
  const [cx, cy, cz] = c, [rx, ry, rz] = r;
  const ix2 = 1 / (rx * rx), iy2 = 1 / (ry * ry), iz2 = 1 / (rz * rz);
  return {
    m, k,
    min: [cx - rx, cy - ry, cz - rz],
    max: [cx + rx, cy + ry, cz + rz],
    f(x, y, z) {
      const px = x - cx, py = y - cy, pz = z - cz;
      const k0 = Math.sqrt(px * px * ix2 + py * py * iy2 + pz * pz * iz2);
      const k1 = Math.sqrt(px * px * ix2 * ix2 + py * py * iy2 * iy2 + pz * pz * iz2 * iz2);
      return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
    },
  };
}

function sphere(c, r, m = 'skin', k = .05) {
  const [cx, cy, cz] = c;
  return {
    m, k,
    min: [cx - r, cy - r, cz - r],
    max: [cx + r, cy + r, cz + r],
    f: (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r,
  };
}

// Capsule whose radius tapers from r1 at a to r2 at b (Inigo Quilez's round cone).
function cone(a, b, r1, r2, m = 'skin', k = .05) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const R = Math.max(r1, r2);
  return {
    m, k,
    min: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R],
    max: [Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R],
    f(x, y, z) {
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const yv = pax * bax + pay * bay + paz * baz, zv = yv - l2;
      const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2;
      const kk = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yv) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
    },
  };
}

const chain = (pts, radii, m, k = .03) => pts.slice(1).map((p, i) => cone(pts[i], p, radii[i], radii[i + 1], m, k));
const cut = (prim) => Object.assign(prim, { sub: true });
const mx = (p) => [-p[0], p[1], p[2]];
const both = (make) => [...make(1), ...make(-1)];

// ---------------------------------------------------------------- meshing

const EDGES = [];
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGES.push([a, a | bit]);

function field(prims, detail) {
  const adds = prims.filter((p) => !p.sub), subs = prims.filter((p) => p.sub);
  const f = (x, y, z) => {
    let d = 1e9;
    for (const p of adds) {
      const di = p.f(x, y, z), h = Math.max(p.k - Math.abs(di - d), 0) / p.k;
      d = Math.min(d, di) - h * h * p.k * .25;
    }
    for (const p of subs) {
      const di = -p.f(x, y, z), h = Math.max(p.k - Math.abs(di - d), 0) / p.k;
      d = Math.max(d, di) + h * h * p.k * .25;
    }
    return detail ? d + detail(x, y, z) : d;
  };
  f.material = (x, y, z) => {
    let best = 1e9, m = 'skin';
    for (const p of adds) {
      const di = p.f(x, y, z);
      if (di < best) {
        best = di;
        m = p.m;
      }
    }
    return m;
  };
  return f;
}

// Naive surface nets: one vertex per surface-crossing cell, one quad per
// sign-changing grid edge.
function surfaceNet(f, min, max, step) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const [ox, oy, oz] = min;
  const F = new Float32Array(nx * ny * nz);
  let n = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[n++] = f(ox + i * step, oy + j * step, oz + k * step);
  const at = (i, j, k) => F[i + nx * (j + ny * k)];
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cell = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [], v = new Float32Array(8);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of EDGES) {
          const va = v[a], vb = v[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += (a & 1) + t * ((b & 1) - (a & 1));
          sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
          sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
          cnt++;
        }
        cell[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(ox + (i + sx / cnt) * step, oy + (j + sy / cnt) * step, oz + (k + sz / cnt) * step);
      }
    }
  }
  const ci = (i, j, k) => cell[i + cx * (j + cy * k)];
  const index = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c);
    else index.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const inside = at(i, j, k) < 0;
        if (i < cx && j > 0 && k > 0 && (at(i + 1, j, k) < 0) !== inside) quad(ci(i, j - 1, k - 1), ci(i, j, k - 1), ci(i, j, k), ci(i, j - 1, k), !inside);
        if (j < cy && i > 0 && k > 0 && (at(i, j + 1, k) < 0) !== inside) quad(ci(i - 1, j, k - 1), ci(i - 1, j, k), ci(i, j, k), ci(i, j, k - 1), !inside);
        if (k < cz && i > 0 && j > 0 && (at(i, j, k + 1) < 0) !== inside) quad(ci(i - 1, j - 1, k), ci(i, j - 1, k), ci(i, j, k), ci(i - 1, j, k), !inside);
      }
    }
  }
  return { pos, index };
}

// Roughness and metalness per material.
const SURFACE = { skin: [.78, 0], dark: [.75, 0], bone: [.42, 0], metal: [.32, .9], gum: [.28, 0] };

function buildPart(spec, rig) {
  const W = spec.world;
  const wound = rig.wound ? (x, y, z) => rig.wound(x + W[0], y + W[1], z + W[2], spec.name) : null;
  const detail = (x, y, z) => (spec.detail ? spec.detail(x, y, z) : 0) + (wound ? .009 * wound(x, y, z) : 0);
  const f = field(spec.prims, detail);
  const step = spec.step || rig.step, pad = .05;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of spec.prims) {
    if (p.sub) continue;
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p.min[a] - pad);
      max[a] = Math.max(max[a], p.max[a] + pad);
    }
  }
  const { pos, index } = surfaceNet(f, min, max, step);
  const count = pos.length / 3;
  const nrm = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const surf = new Float32Array(count * 3), rest = new Float32Array(count * 3);
  const e = step * .5, c = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    nrm.set([gx, gy, gz], i * 3);
    // Cavity shading: how open the space just above the surface is.
    const ao = Math.min(1, Math.max(0, f(x + gx * .025, y + gy * .025, z + gz * .025) / .025)) * .5
      + Math.min(1, Math.max(0, f(x + gx * .08, y + gy * .08, z + gz * .08) / .08)) * .5;
    const m = f.material(x, y, z);
    const wx = x + W[0], wy = y + W[1], wz = z + W[2];
    rest.set([wx, wy, wz], i * 3);
    c.copy(rig.palette[m] || rig.palette.skin);
    const mottled = .72 + .42 * noise3(wx * 6, wy * 6, wz * 6) + .16 * noise3(wx * 23, wy * 23, wz * 23);
    c.multiplyScalar(mottled);
    let wet = 0, veinMask = 0;
    if (m === 'skin') {
      if (rig.palette.ash) c.lerp(rig.palette.ash, smooth(.3, .75, noise3(wx * 9 + 7, wy * 9, wz * 9)) * .45);
      if (rig.extremity) c.lerp(rig.palette.dark, rig.extremity(wx, wy, wz, spec.name));
      const w = wound ? wound(x, y, z) : 0;
      if (w > 0) {
        // Torn skin: wet striated muscle, and bare ribs on the imp's chest.
        tmp.copy(rig.palette.flesh).multiplyScalar(.55 + .45 * Math.abs(Math.sin((wx * .6 + wy) * 150 + noise3(wx * 20, wy * 20, wz * 20) * 3)));
        if (rig.ribs && spec.name === 'body' && y > .36 && y < .62 && Math.sin(y * 58) > .3 && w > .5) tmp.copy(rig.palette.bone);
        c.lerp(tmp, smooth(.05, .45, w));
        wet = w;
      }
      if (wound) {
        // Blood running down from wounds above.
        let drip = 0;
        for (let k = 1; k <= 6; k++) drip = Math.max(drip, wound(x, y + k * .035, z) * (1 - k / 7));
        drip *= smooth(.05, .35, noise3(wx * 38, 3.7, wz * 38));
        c.lerp(rig.palette.blood, Math.min(1, drip * 1.6) * (1 - w));
        wet = Math.max(wet, drip);
      }
      veinMask = rig.veinMask ? rig.veinMask(wx, wy, wz, spec.name) * (.35 + .65 * ao) * (1 - smooth(0, .3, wet)) : 0;
    }
    c.multiplyScalar(.3 + .7 * Math.pow(ao, .9));
    col.set([c.r, c.g, c.b], i * 3);
    const [rough, metal] = SURFACE[m] || SURFACE.skin;
    const r = rough * (.85 + .3 * noise3(wx * 11, wy * 11, wz * 11));
    surf.set([r + (.22 - r) * Math.min(1, wet * 1.5), metal, veinMask], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('surf', new THREE.BufferAttribute(surf, 3));
  geo.setAttribute('rest', new THREE.BufferAttribute(rest, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------- material

const veinGLSL = /* glsl */`
  varying vec3 vSurf;
  varying vec3 vRest;
  uniform vec3 glowColor;
  uniform float glowStrength;
  uniform float flash;
  uniform float veinFreq;
  uniform float veinWidth;
  float vhash(vec3 p) {
    p = fract(p * .3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(vhash(i), vhash(i + vec3(1, 0, 0)), f.x), mix(vhash(i + vec3(0, 1, 0)), vhash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(vhash(i + vec3(0, 0, 1)), vhash(i + vec3(1, 0, 1)), f.x), mix(vhash(i + vec3(0, 1, 1)), vhash(i + vec3(1, 1, 1)), f.x), f.y), f.z) * 2.0 - 1.0;
  }`;

export function monsterMaterial(rig) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  const uniforms = {
    glowColor: { value: new THREE.Color(rig.glow || 0xff5a14) },
    glowStrength: { value: rig.glowStrength || 3 },
    flash: { value: 0 },
    veinFreq: { value: rig.veinFreq || 8 },
    veinWidth: { value: rig.veinWidth || .06 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nattribute vec3 rest;\nvarying vec3 vSurf;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;\nvRest = rest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${veinGLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float veinN = abs(vnoise(vRest * veinFreq) + .4 * vnoise(vRest * veinFreq * 2.7));
        float vein = (1.0 - smoothstep(veinWidth * .35, veinWidth, veinN)) * vSurf.z;
        float veinRim = (1.0 - smoothstep(veinWidth, veinWidth * 2.2, veinN)) * vSurf.z;
        diffuseColor.rgb *= 1.0 - .7 * veinRim;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowColor * vein * glowStrength + vec3(flash);');
  };
  return m;
}

// ---------------------------------------------------------------- rigs
//
// Parts: { name, parent, pivot, prims, detail?, step?, scale?, eyes?, teeth?,
//          spikes?: [[base, tip, radius, material], ...], core? }
// Coordinates are metres in the part's own frame (origin at its pivot).

const bumps = (amp, freq) => (x, y, z) => amp * noise3(x * freq, y * freq, z * freq);

function impRig() {
  const skin = bumps(.0035, 22);
  const arm = (s) => ({
    upper: [
      cone([0, 0, 0], [-.02 * s, -.34, .02], .06, .044),
      ellipsoid([-.01 * s, -.13, .03], [.05, .1, .05], 'skin', .06),
      ellipsoid([-.02 * s, .01, 0], [.072, .07, .072], 'skin', .06),
    ],
    fore: [
      cone([0, 0, 0], [0, -.34, .04], .044, .032),
      ellipsoid([0, -.07, 0], [.045, .09, .045], 'skin', .05),
      ellipsoid([0, -.385, .045], [.045, .05, .028], 'skin', .03),
      ...[0, 1, 2, 3].flatMap((i) => {
        const fx = (-.03 + i * .02) * s;
        return chain([[fx, -.41, .05], [fx * 1.15, -.49, .08], [fx * 1.3, -.57, .075]], [.014, .012, .009], 'skin', .014);
      }),
    ],
    claws: [0, 1, 2, 3].map((i) => {
      const fx = (-.03 + i * .02) * s;
      return [[fx * 1.3, -.565, .075], [fx * 1.38, -.67, .105], .009, 'claw'];
    }),
  });
  const leg = () => ({
    thigh: [
      cone([0, 0, 0], [0, -.4, .12], .088, .062),
      ellipsoid([0, -.16, .06], [.07, .13, .07], 'skin', .06),
    ],
    shin: [
      cone([0, 0, 0], [0, -.36, -.12], .06, .038),
      ellipsoid([0, -.1, -.06], [.05, .09, .05], 'skin', .05),
      cone([0, -.36, -.12], [0, -.56, -.02], .038, .032, 'skin', .04),
      ellipsoid([0, -.575, .04], [.05, .026, .085], 'skin', .04),
      ...[-1, 0, 1].flatMap((t) => chain([[t * .026, -.578, .08], [t * .036, -.585, .15]], [.017, .012], 'skin', .015)),
    ],
    claws: [
      ...[-1, 0, 1].map((t) => [[t * .036, -.585, .15], [t * .042, -.6, .22], .011, 'claw']),
      [[0, -.34, -.13], [0, -.28, -.26], .02, 'bone'],
    ],
  });
  const A = arm(1), B = arm(-1), L = leg(), R = leg();
  const horn = (s) => chain([[.06 * s, .1, .05], [.11 * s, .17, -.02], [.14 * s, .2, -.13]], [.03, .024, .016], 'bone', .025);
  return {
    step: .017,
    palette: { skin: 0x1e0e0a, dark: 0x060202, bone: 0x5e5244, metal: 0x3a3c40, ash: 0x3a3230, flesh: 0x7a0e0a, blood: 0x2a0202, gum: 0x4a0a0a },
    ribs: true,
    wound: (x, y, z, part) => (part === 'head' || part === 'jaw' ? 0 : smooth(.4, .6, noise3(x * 4.5 + 11, y * 4.5, z * 4.5))),
    glow: 0xff5a14,
    eyes: [4.5, .9, .12],
    veinFreq: 7,
    veinWidth: .07,
    veinMask: (x, y, z, part) => (part === 'body' ? smooth(.95, 1.2, y) * (1 - smooth(1.55, 1.7, y)) : part.startsWith('fore') ? .8 : 0),
    extremity: (x, y, z, part) => (part.startsWith('fore') ? smooth(.2, .02, y) * .6 : part.startsWith('shin') ? smooth(.35, .05, y) * .6 : 0),
    parts: [
      {
        name: 'body', parent: null, pivot: [0, .98, 0],
        prims: [
          ellipsoid([0, .02, -.01], [.16, .11, .12], 'skin', .06),
          cone([0, .05, 0], [0, .32, .03], .11, .13, 'skin', .07),
          ellipsoid([0, .5, .04], [.21, .21, .16], 'skin', .08),
          ellipsoid([.09, .56, .11], [.1, .08, .06], 'skin', .05),
          ellipsoid([-.09, .56, .11], [.1, .08, .06], 'skin', .05),
          ellipsoid([0, .66, -.01], [.28, .08, .12], 'skin', .08),
          ellipsoid([0, .6, -.08], [.23, .13, .13], 'skin', .08),
          ellipsoid([.29, .64, 0], [.085, .1, .085], 'skin', .06),
          ellipsoid([-.29, .64, 0], [.085, .1, .085], 'skin', .06),
          cone([0, .64, .02], [0, .8, .12], .068, .052, 'skin', .06),
          cone([0, .15, -.09], [0, .62, -.13], .03, .032, 'skin', .06),
          cut(ellipsoid([0, .24, .19], [.11, .09, .06], 'skin', .06)),
        ],
        detail(x, y, z) {
          const ribs = y > .36 && y < .62 && z > -.05 ? .0055 * Math.sin(y * 58) * smooth(.36, .42, y) * (1 - smooth(.56, .62, y)) : 0;
          return skin(x, y, z) + ribs;
        },
        spikes: [.2, .3, .4, .5, .6, .7].map((y) => [[0, y, -.13 - y * .05], [0, y + .09, -.32 - y * .05], .026 - y * .012, 'bone']),
      },
      {
        name: 'head', parent: 'body', pivot: [0, .8, .13], scale: 1.15, step: .011,
        prims: [
          ellipsoid([0, .06, -.03], [.1, .1, .13], 'skin', .05),
          ellipsoid([0, .135, -.03], [.07, .03, .09], 'bone', .03),
          ellipsoid([0, .06, .08], [.12, .038, .06], 'skin', .03),
          ellipsoid([.072, .0, .06], [.036, .032, .06], 'bone', .03),
          ellipsoid([-.072, .0, .06], [.036, .032, .06], 'bone', .03),
          ellipsoid([0, -.025, .1], [.058, .05, .085], 'skin', .04),
          ellipsoid([0, .03, .02], [.08, .05, .09], 'skin', .05),
          ellipsoid([0, -.058, .12], [.047, .018, .05], 'gum', .015),
          ellipsoid([0, -.05, .07], [.05, .02, .06], 'dark', .02),
          ...horn(1), ...horn(-1),
          cut(ellipsoid([.058, -.045, .08], [.028, .03, .04], 'skin', .03)),
          cut(ellipsoid([-.058, -.045, .08], [.028, .03, .04], 'skin', .03)),
          cut(ellipsoid([0, -.07, .16], [.055, .028, .05], 'skin', .02)),
          cut(sphere([.045, .03, .118], .032, 'skin', .015)),
          cut(sphere([-.045, .03, .118], .032, 'skin', .015)),
          cut(ellipsoid([.012, .0, .215], [.008, .012, .02], 'skin', .01)),
          cut(ellipsoid([-.012, .0, .215], [.008, .012, .02], 'skin', .01)),
        ],
        detail: (x, y, z) => .0025 * noise3(x * 30, y * 30, z * 30) + (y > -.02 && z > .09 && Math.abs(x) < .045 ? .0022 * Math.sin(z * 150) : 0),
        eyes: [[.045, .03, .1], [-.045, .03, .1]], eyeSize: .01,
        spikes: [
          [[.14, .2, -.13], [.1, .26, -.3], .016, 'bone'],
          [[-.14, .2, -.13], [-.1, .26, -.3], .016, 'bone'],
          ...[-.05, 0, .05].map((x) => [[x, .12, -.1], [x * 1.3, .17, -.2], .012, 'bone']),
        ],
        teeth: { from: -.046, to: .046, count: 9, y: -.062, z: .158, len: .055, r: .0065, dir: -1, arc: .04 },
      },
      {
        name: 'jaw', parent: 'head', pivot: [0, -.05, .04],
        prims: [
          ellipsoid([0, -.035, .07], [.052, .022, .08], 'skin', .025),
          ellipsoid([0, -.045, .125], [.03, .02, .025], 'skin', .02),
          ellipsoid([0, -.022, .09], [.04, .01, .06], 'gum', .01),
        ],
        step: .011,
        detail: bumps(.0025, 30),
        teeth: { from: -.038, to: .038, count: 7, y: -.018, z: .125, len: .05, r: .0065, dir: 1, arc: .045 },
      },
      { name: 'armL', parent: 'body', pivot: [-.31, .64, 0], prims: B.upper, detail: skin },
      { name: 'foreL', parent: 'armL', pivot: [.02, -.34, .02], prims: B.fore, detail: skin, step: .01, spikes: B.claws },
      { name: 'armR', parent: 'body', pivot: [.31, .64, 0], prims: A.upper, detail: skin },
      { name: 'foreR', parent: 'armR', pivot: [-.02, -.34, .02], prims: A.fore, detail: skin, step: .01, spikes: A.claws },
      { name: 'thighL', parent: null, pivot: [-.12, .98, 0], prims: L.thigh, detail: skin },
      { name: 'shinL', parent: 'thighL', pivot: [0, -.4, .12], prims: L.shin, detail: skin, step: .013, spikes: L.claws },
      { name: 'thighR', parent: null, pivot: [.12, .98, 0], prims: R.thigh, detail: skin },
      { name: 'shinR', parent: 'thighR', pivot: [0, -.4, .12], prims: R.shin, detail: skin, step: .013, spikes: R.claws },
    ],
    pose: {
      body: [.5, 0, 0], head: [-.6, 0, 0], jaw: [.22, 0, 0],
      armL: [-.45, .2, .18], armR: [-.45, -.2, -.18], foreL: [-.95, 0, 0], foreR: [-.95, 0, 0],
      thighL: [-.15, 0, .04], thighR: [-.15, 0, -.04], shinL: [.12, 0, 0], shinR: [.12, 0, 0],
    },
  };
}

function bruteRig() {
  const skin = (x, y, z) => .007 * noise3(x * 14, y * 14, z * 14) + .003 * noise3(x * 31, y * 31, z * 31)
    + .003 * Math.sin(x * 38 + y * 22 + noise3(x * 5, y * 5, z * 5) * 6);
  const arm = (s) => ({
    upper: [
      sphere([0, 0, 0], .17, 'skin', .08),
      cone([0, 0, 0], [.04 * s, -.36, .06], .16, .13, 'skin', .08),
      ellipsoid([.02 * s, -.16, .1], [.12, .16, .11], 'skin', .07),
      ellipsoid([.02 * s, .07, 0], [.24, .1, .22], 'metal', .015),
      ellipsoid([.08 * s, .01, 0], [.18, .12, .19], 'metal', .015),
    ],
    plateSpikes: [-1, 1].map((t) => [[.08 * s, .14, t * .08], [.2 * s, .34, t * .12], .035, 'metal']),
    fore: [
      cone([0, 0, 0], [0, -.34, .1], .13, .15, 'skin', .07),
      ellipsoid([0, -.12, .04], [.14, .15, .13], 'skin', .07),
      ellipsoid([0, -.44, .13], [.13, .12, .14], 'skin', .06),
      ...[-1, 0, 1].flatMap((t) => chain([[t * .07, -.5, .2], [t * .085, -.55, .27]], [.04, .032], 'skin', .03)),
    ],
    claws: [-1, 0, 1].map((t) => [[t * .085, -.55, .27], [t * .1, -.64, .36], .03, 'claw']),
  });
  const leg = () => ({
    thigh: [
      cone([0, 0, 0], [0, -.42, .06], .19, .15, 'skin', .08),
      ellipsoid([0, -.16, .08], [.16, .18, .14], 'skin', .07),
    ],
    shin: [
      cone([0, 0, 0], [0, -.4, -.02], .15, .12, 'skin', .07),
      ellipsoid([0, -.46, .08], [.14, .06, .2], 'skin', .05),
    ],
    claws: [-1, 0, 1].map((t) => [[t * .07, -.47, .24], [t * .09, -.5, .34], .03, 'claw']),
  });
  const A = arm(1), B = arm(-1), L = leg(), R = leg();
  return {
    step: .024,
    palette: { skin: 0x2a1012, dark: 0x0a0203, bone: 0x8a7a5e, metal: 0x4a4d52, ash: 0x3a302e, flesh: 0x8a1410, blood: 0x2a0202, gum: 0x4a0a0a },
    glow: 0xff2a08,
    glowStrength: 2.2,
    eyes: [9, .5, .15],
    veinFreq: 6,
    veinWidth: .05,
    veinMask: (x, y, z, part) => (part === 'head' || part === 'jaw' ? .3 : .8),
    wound: (x, y, z, part) => (part === 'head' || part === 'jaw' ? 0 : smooth(.42, .62, noise3(x * 3.5 + 5, y * 3.5, z * 3.5))),
    extremity: (x, y, z, part) => (part.startsWith('fore') ? smooth(.35, .15, y) * .5 : part.startsWith('shin') ? smooth(.25, .05, y) * .5 : 0),
    parts: [
      {
        name: 'body', parent: null, pivot: [0, .92, 0],
        prims: [
          ellipsoid([0, 0, -.05], [.32, .22, .26], 'skin', .1),
          ellipsoid([0, .28, .08], [.4, .32, .34], 'skin', .12),
          ellipsoid([0, .62, .1], [.5, .3, .4], 'skin', .12),
          ellipsoid([0, .8, -.12], [.42, .28, .32], 'skin', .12),
          ellipsoid([.52, .72, .06], [.28, .26, .28], 'skin', .1),
          ellipsoid([-.52, .72, .06], [.28, .26, .28], 'skin', .1),
          cone([0, .7, .2], [0, .72, .44], .25, .22, 'skin', .1),
          ellipsoid([0, .92, -.2], [.3, .18, .22], 'metal', .015),
          cut(ellipsoid([0, .6, .52], [.035, .18, .06], 'skin', .06)),
        ],
        detail: skin,
        spikes: [...[-.18, 0, .18].map((x) => [[x, 1.02, -.18], [x * 1.4, 1.26, -.34], .05, 'bone']),
          ...[-.12, .12].map((x) => [[x, .95, -.35], [x * 1.3, 1.08, -.55], .04, 'bone'])],
      },
      {
        name: 'head', parent: 'body', pivot: [0, .72, .5], step: .016,
        prims: [
          ellipsoid([0, .05, .05], [.26, .2, .26], 'skin', .08),
          ellipsoid([0, .1, .24], [.27, .075, .09], 'skin', .05),
          ellipsoid([0, -.03, .3], [.15, .1, .13], 'skin', .06),
          ellipsoid([.12, -.02, .24], [.08, .09, .08], 'skin', .05),
          ellipsoid([-.12, -.02, .24], [.08, .09, .08], 'skin', .05),
          ellipsoid([0, .2, .1], [.15, .06, .15], 'bone', .04),
          ellipsoid([0, -.08, .35], [.12, .03, .06], 'gum', .02),
          ellipsoid([0, -.09, .25], [.13, .03, .1], 'dark', .03),
          ...both((s) => chain([[.2 * s, .12, .05], [.36 * s, .14, .12], [.44 * s, .25, .26]], [.07, .05, .032], 'bone', .04)),
          cut(sphere([.05, .02, .43], .022, 'skin', .015)),
          cut(sphere([-.05, .02, .43], .022, 'skin', .015)),
          cut(sphere([.11, .05, .31], .038, 'skin', .02)),
          cut(sphere([-.11, .05, .31], .038, 'skin', .02)),
          cut(ellipsoid([0, .1, .33], [.018, .05, .04], 'skin', .02)),
          cut(ellipsoid([0, -.11, .41], [.13, .045, .06], 'skin', .02)),
        ],
        detail: skin,
        eyes: [[.11, .05, .285], [-.11, .05, .285]], eyeSize: .015,
        spikes: [[[.44, .25, .26], [.4, .44, .4], .032, 'bone'], [[-.44, .25, .26], [-.4, .44, .4], .032, 'bone']],
        teeth: { from: -.1, to: .1, count: 6, y: -.1, z: .38, len: .08, r: .014, dir: -1, arc: .05 },
      },
      {
        name: 'jaw', parent: 'head', pivot: [0, -.1, .08], step: .016,
        prims: [
          ellipsoid([0, -.06, .2], [.2, .08, .24], 'skin', .06),
          ellipsoid([.15, -.02, .12], [.07, .08, .1], 'skin', .05),
          ellipsoid([-.15, -.02, .12], [.07, .08, .1], 'skin', .05),
        ],
        detail: skin,
        spikes: [[[.15, -.02, .33], [.18, .16, .38], .03, 'bone'], [[-.15, -.02, .33], [-.18, .16, .38], .03, 'bone']],
        teeth: { from: -.09, to: .09, count: 5, y: .0, z: .38, len: .06, r: .012, dir: 1, arc: .05 },
      },
      { name: 'armL', parent: 'body', pivot: [-.74, .66, .08], prims: B.upper, detail: skin, spikes: B.plateSpikes },
      { name: 'foreL', parent: 'armL', pivot: [-.04, -.36, .06], prims: B.fore, detail: skin, spikes: B.claws },
      { name: 'armR', parent: 'body', pivot: [.74, .66, .08], prims: A.upper, detail: skin, spikes: A.plateSpikes },
      { name: 'foreR', parent: 'armR', pivot: [.04, -.36, .06], prims: A.fore, detail: skin, spikes: A.claws },
      { name: 'thighL', parent: null, pivot: [-.3, .9, -.02], prims: L.thigh, detail: skin },
      { name: 'shinL', parent: 'thighL', pivot: [0, -.42, .06], prims: L.shin, detail: skin, spikes: L.claws },
      { name: 'thighR', parent: null, pivot: [.3, .9, -.02], prims: R.thigh, detail: skin },
      { name: 'shinR', parent: 'thighR', pivot: [0, -.42, .06], prims: R.shin, detail: skin, spikes: R.claws },
    ],
    pose: {
      body: [.3, 0, 0], head: [-.2, 0, 0], jaw: [.3, 0, 0],
      armL: [-.15, 0, .12], armR: [-.15, 0, -.12], foreL: [-.5, 0, 0], foreR: [-.5, 0, 0],
    },
  };
}

function bossRig() {
  const skin = (x, y, z) => .004 * noise3(x * 18, y * 18, z * 18) + .0015 * noise3(x * 40, y * 40, z * 40);
  const arm = (s) => ({
    upper: [
      sphere([0, 0, 0], .11, 'skin', .06),
      cone([0, 0, 0], [.02 * s, -.42, .02], .11, .085, 'skin', .07),
      ellipsoid([.01 * s, -.16, .05], [.09, .14, .08], 'skin', .06),
      ellipsoid([.04 * s, .07, 0], [.23, .08, .2], 'metal', .012),
      ellipsoid([.11 * s, .01, 0], [.15, .12, .17], 'metal', .012),
      ellipsoid([.16 * s, -.06, 0], [.1, .09, .14], 'metal', .012),
    ],
    plateSpikes: [-1, 0, 1].map((t) => [[.07 * s, .12, t * .09], [.2 * s, .5, t * .16], .038, 'metal']),
    fore: [
      cone([0, 0, 0], [0, -.4, .04], .085, .07, 'skin', .06),
      ellipsoid([0, -.1, .02], [.085, .13, .08], 'skin', .06),
      ellipsoid([0, -.26, .01], [.08, .1, .08], 'metal', .012),
      ellipsoid([0, -.47, .05], [.07, .075, .04], 'skin', .04),
      ...[0, 1, 2, 3].flatMap((i) => {
        const fx = (-.045 + i * .03) * s;
        return chain([[fx, -.5, .06], [fx * 1.1, -.62, .1], [fx * 1.2, -.72, .09]], [.02, .016, .013], 'skin', .02);
      }),
    ],
    claws: [0, 1, 2, 3].map((i) => {
      const fx = (-.045 + i * .03) * s;
      return [[fx * 1.2, -.715, .09], [fx * 1.25, -.84, .13], .013, 'claw'];
    }),
  });
  const leg = () => ({
    thigh: [
      cone([0, 0, 0], [0, -.42, .13], .13, .095, 'skin', .07),
      ellipsoid([0, -.17, .08], [.11, .16, .1], 'skin', .07),
    ],
    shin: [
      cone([0, 0, 0], [0, -.38, -.13], .085, .06, 'skin', .06),
      ellipsoid([0, -.1, -.07], [.075, .11, .07], 'skin', .06),
      cone([0, -.38, -.13], [0, -.6, -.02], .06, .05, 'skin', .05),
      ellipsoid([0, -.62, .03], [.075, .045, .1], 'metal', .02),
    ],
    claws: [[[0, -.36, -.14], [0, -.28, -.32], .035, 'bone']],
  });
  const A = arm(1), B = arm(-1), L = leg(), R = leg();
  const horn = (s) => chain(
    [[.1, .15, .01], [.22, .22, -.02], [.33, .34, -.05], [.37, .5, -.02], [.35, .62, .05]].map((p) => [p[0] * s, p[1], p[2]]),
    [.058, .05, .04, .03, .02], 'bone', .03,
  );
  return {
    step: .016,
    palette: { skin: 0x140a08, dark: 0x050202, bone: 0x7a6e5c, metal: 0x3a3c42, ash: 0x3a3230, flesh: 0x7a0e0a, blood: 0x2a0202, gum: 0x4a0a0a },
    wound: (x, y, z, part) => (part === 'head' || part === 'jaw' ? 0 : smooth(.5, .68, noise3(x * 3 + 2, y * 3, z * 3))),
    glow: 0xff4a0c,
    eyes: [7, 4, 1],
    veinFreq: 5.5,
    veinWidth: .065,
    veinMask: (x, y, z) => .6 + .4 * (1 - smooth(.1, .6, Math.hypot(x, y - 1.52, z - .25))),
    extremity: (x, y, z, part) => (part.startsWith('fore') ? smooth(.45, .25, y) * .5 : 0),
    parts: [
      {
        name: 'body', parent: null, pivot: [0, 1.02, 0],
        prims: [
          ellipsoid([0, 0, 0], [.21, .14, .15], 'skin', .07),
          cone([0, .05, .02], [0, .36, .05], .16, .2, 'skin', .08),
          ellipsoid([0, .56, .05], [.32, .22, .22], 'skin', .1),
          ellipsoid([.13, .58, .15], [.13, .1, .08], 'skin', .06),
          ellipsoid([-.13, .58, .15], [.13, .1, .08], 'skin', .06),
          cone([.08, .72, -.03], [.3, .7, -.02], .1, .09, 'skin', .08),
          cone([-.08, .72, -.03], [-.3, .7, -.02], .1, .09, 'skin', .08),
          cone([0, .7, .02], [0, .87, .1], .1, .08, 'skin', .07),
          ellipsoid([0, .03, 0], [.235, .06, .17], 'metal', .01),
          ellipsoid([0, -.06, .12], [.1, .1, .03], 'metal', .01),
          cut(sphere([0, .5, .27], .075, 'skin', .02)),
        ],
        detail(x, y, z) {
          const abs = z > .1 && y > .08 && y < .38 ? .0045 * Math.sin(y * 42) * smooth(.1, .16, z) : 0;
          return skin(x, y, z) + abs;
        },
        spikes: [.2, .32, .44, .56, .68].map((y) => [[0, y, -.15], [0, y + .12, -.42], .045, 'bone']),
        core: [0, .5, .235, .065],
      },
      {
        name: 'head', parent: 'body', pivot: [0, .86, .12], step: .011,
        prims: [
          ellipsoid([0, .08, 0], [.125, .13, .15], 'skin', .06),
          ellipsoid([0, -.02, .08], [.1, .09, .1], 'skin', .05),
          ellipsoid([0, .02, .12], [.085, .085, .06], 'bone', .03),
          ellipsoid([0, .1, .1], [.135, .045, .06], 'bone', .03),
          ellipsoid([0, -.075, .13], [.06, .018, .04], 'gum', .015),
          cut(ellipsoid([0, .0, .185], [.016, .028, .03], 'skin', .015)),
          ...horn(1), ...horn(-1),
          cut(sphere([.05, .055, .15], .036, 'skin', .02)),
          cut(sphere([-.05, .055, .15], .036, 'skin', .02)),
          cut(ellipsoid([.06, -.04, .12], [.03, .03, .04], 'skin', .03)),
          cut(ellipsoid([-.06, -.04, .12], [.03, .03, .04], 'skin', .03)),
        ],
        detail: skin,
        eyes: [[.05, .055, .122], [-.05, .055, .122]], eyeSize: .015,
        spikes: [
          [[.35, .62, .05], [.28, .76, .18], .02, 'bone'],
          [[-.35, .62, .05], [-.28, .76, .18], .02, 'bone'],
          ...[-.06, 0, .06].map((x) => [[x, .19, -.02], [x * 1.4, .32, -.1], .02, 'bone']),
        ],
        teeth: { from: -.05, to: .05, count: 8, y: -.08, z: .165, len: .05, r: .008, dir: -1, arc: .03 },
      },
      {
        name: 'jaw', parent: 'head', pivot: [0, -.06, .06], step: .011,
        prims: [ellipsoid([0, -.04, .07], [.085, .04, .085], 'skin', .04)],
        detail: skin,
        teeth: { from: -.045, to: .045, count: 7, y: -.01, z: .135, len: .045, r: .007, dir: 1, arc: .03 },
      },
      { name: 'armL', parent: 'body', pivot: [-.4, .68, 0], prims: B.upper, detail: skin, spikes: B.plateSpikes },
      { name: 'foreL', parent: 'armL', pivot: [-.02, -.42, .02], prims: B.fore, detail: skin, step: .012, spikes: B.claws },
      { name: 'armR', parent: 'body', pivot: [.4, .68, 0], prims: A.upper, detail: skin, spikes: A.plateSpikes },
      { name: 'foreR', parent: 'armR', pivot: [.02, -.42, .02], prims: A.fore, detail: skin, step: .012, spikes: A.claws },
      { name: 'thighL', parent: null, pivot: [-.15, 1.02, 0], prims: L.thigh, detail: skin },
      { name: 'shinL', parent: 'thighL', pivot: [0, -.42, .13], prims: L.shin, detail: skin, spikes: L.claws },
      { name: 'thighR', parent: null, pivot: [.15, 1.02, 0], prims: R.thigh, detail: skin },
      { name: 'shinR', parent: 'thighR', pivot: [0, -.42, .13], prims: R.shin, detail: skin, spikes: R.claws },
    ],
    pose: {
      body: [.18, 0, 0], head: [-.25, 0, 0], jaw: [.25, 0, 0],
      armL: [-.1, 0, .22], armR: [-.1, 0, -.22], foreL: [-.5, 0, 0], foreR: [-.5, 0, 0],
    },
  };
}

const RIGS = { imp: impRig, brute: bruteRig, boss: bossRig };

// ---------------------------------------------------------------- assembly

const cache = {};

function bake(type) {
  if (cache[type]) return cache[type];
  const rig = RIGS[type]();
  rig.palette = Object.fromEntries(Object.entries(rig.palette).map(([k, v]) => [k, new THREE.Color(v)]));
  const world = {};
  for (const part of rig.parts) {
    const parent = part.parent ? world[part.parent] : [0, 0, 0];
    world[part.name] = [parent[0] + part.pivot[0], parent[1] + part.pivot[1], parent[2] + part.pivot[2]];
    part.world = world[part.name];
    part.geometry = buildPart(part, rig);
  }
  cache[type] = rig;
  return rig;
}

export function prebake(types = Object.keys(RIGS)) {
  for (const t of types) bake(t);
}

const DETAIL = {
  bone: new THREE.MeshStandardMaterial({ color: 0x8c7c62, roughness: .45 }),
  claw: new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: .22 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x4a4c52, roughness: .3, metalness: .9 }),
  tooth: new THREE.MeshStandardMaterial({ color: 0x9a8c6c, roughness: .4 }),
};
const spikeGeo = new THREE.ConeGeometry(1, 1, 8);
spikeGeo.translate(0, .5, 0);
const UP = new THREE.Vector3(0, 1, 0);

function spike(parent, base, tip, r, mat) {
  const dir = new THREE.Vector3().fromArray(tip).sub(new THREE.Vector3().fromArray(base));
  const len = dir.length();
  const m = new THREE.Mesh(spikeGeo, DETAIL[mat] || DETAIL.bone);
  m.position.fromArray(base);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  m.scale.set(r, len, r);
  m.castShadow = true;
  parent.add(m);
}

// Build an animatable monster: the root group plus named part groups.
export function createMonster(type) {
  const rig = bake(type);
  const material = monsterMaterial(rig);
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...rig.eyes) });
  const root = new THREE.Group();
  const parts = {};
  for (const part of rig.parts) {
    const g = new THREE.Group();
    g.position.fromArray(part.pivot);
    if (part.scale) g.scale.setScalar(part.scale);
    (part.parent ? parts[part.parent] : root).add(g);
    parts[part.name] = g;
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.castShadow = true;
    g.add(mesh);
    for (const e of part.eyes || []) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(part.eyeSize, 10, 8), eyeMat);
      eye.position.fromArray(e);
      g.add(eye);
    }
    for (const [base, tip, r, mat] of part.spikes || []) spike(g, base, tip, r, mat);
    if (part.teeth) {
      const t = part.teeth;
      for (let i = 0; i < t.count; i++) {
        const u = t.count === 1 ? .5 : i / (t.count - 1), x = t.from + (t.to - t.from) * u;
        const edge = Math.abs(u - .5) * 2, jag = .75 + .5 * Math.abs(Math.sin(i * 12.9898 + t.count));
        const len = t.len * jag * (1 + edge * .5), y = t.y, z = t.z - edge * edge * t.arc;
        spike(g, [x, y, z], [x * 1.05, y + t.dir * len, z + .006], t.r * (1 + edge * .4), 'tooth');
      }
    }
    if (part.core) {
      const [x, y, z, r] = part.core;
      const core = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 1.8, .4) }));
      core.position.set(x, y, z);
      g.add(core);
      parts.core = core;
    }
  }
  for (const [name, r] of Object.entries(rig.pose || {})) parts[name]?.rotation.set(...r);
  return { root, parts, material, rest: rig.pose || {} };
}
