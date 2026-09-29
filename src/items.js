// Pickups and level props (lamps, torches, the exit pad).
import * as THREE from 'three';
import { buildShotgun, buildChaingun } from './weapons.js';

export const MAX = { health: 100, armor: 100, bullets: 200, shells: 50 };

export const ITEMS = {
  '+': { kind: 'health', amount: 20, label: 'Health pack', glow: 0xff3a2a },
  'H': { kind: 'health', amount: 50, label: 'Medkit', glow: 0xff3a2a },
  'A': { kind: 'armor', amount: 50, label: 'Armor', glow: 0x3a90ff },
  'S': { kind: 'ammo', ammo: 'shells', amount: 8, label: 'Shotgun shells', glow: 0xffa030 },
  'U': { kind: 'ammo', ammo: 'bullets', amount: 30, label: 'Box of bullets', glow: 0xffc040 },
  'G': { kind: 'weapon', weapon: 1, ammo: 'shells', amount: 10, label: 'Shotgun', glow: 0xff8030 },
  'C': { kind: 'weapon', weapon: 2, ammo: 'bullets', amount: 50, label: 'Chaingun', glow: 0xff8030 },
  'K': { kind: 'key', key: 'red', label: 'Red keycard', glow: 0xff2010 },
  'J': { kind: 'key', key: 'blue', label: 'Blue keycard', glow: 0x2a6aff },
  'V': { kind: 'key', key: 'yellow', label: 'Yellow keycard', glow: 0xffc020 },
};

export const KEY_COLORS = { red: [3, .25, .12], blue: [.3, .8, 3.5], yellow: [3, 2.2, .3] };

const hdr = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
const std = (color, metalness = .1, roughness = .5) => new THREE.MeshStandardMaterial({ color, metalness, roughness });

function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function buildItem(type) {
  const g = new THREE.Group();
  switch (type) {
    case '+':
    case 'H': {
      const s = type === 'H' ? 1.35 : 1, red = hdr(2.2, .15, .1);
      box(g, .44 * s, .26 * s, .3 * s, std(0xe8e4dc, 0, .4));
      box(g, .08 * s, .012, .22 * s, red, 0, .131 * s, 0);
      box(g, .22 * s, .012, .08 * s, red, 0, .131 * s, 0);
      box(g, .08 * s, .18 * s, .012, red, 0, 0, .151 * s);
      box(g, .22 * s, .06 * s, .012, red, 0, 0, .151 * s);
      break;
    }
    case 'A': {
      const blue = std(0x2a5ab0, .6, .3), glow = hdr(.3, 1.6, 3);
      box(g, .5, .56, .18, blue, 0, .1, 0);
      box(g, .16, .12, .2, blue, -.17, .42, 0);
      box(g, .16, .12, .2, blue, .17, .42, 0);
      box(g, .04, .4, .19, glow, 0, .1, 0);
      box(g, .36, .03, .19, glow, 0, .18, 0);
      break;
    }
    case 'S': {
      box(g, .42, .18, .26, std(0x8a1a10, .1, .6));
      const brass = std(0xc8a040, .9, .3), red = std(0xa01810, .1, .5);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          const shell = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .16, 8), red);
          shell.position.set(-.13 + i * .087, .15, -.05 + j * .1);
          g.add(shell);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(.031, .031, .03, 8), brass);
          cap.position.set(-.13 + i * .087, .08, -.05 + j * .1);
          g.add(cap);
        }
      }
      break;
    }
    case 'U': {
      box(g, .42, .24, .28, std(0x4a5230, .1, .7));
      box(g, .43, .06, .29, hdr(2, 1.5, .3), 0, .02, 0);
      box(g, .44, .03, .2, std(0x2a2e1a), 0, .135, 0);
      break;
    }
    case 'G': {
      const m = buildShotgun().root;
      m.scale.setScalar(1.3);
      m.rotation.y = Math.PI / 2;
      m.position.x = -.25;
      g.add(m);
      break;
    }
    case 'C': {
      const m = buildChaingun().root;
      m.scale.setScalar(1.3);
      m.rotation.y = Math.PI / 2;
      m.position.x = -.25;
      g.add(m);
      break;
    }
    case 'K':
    case 'J':
    case 'V': {
      box(g, .3, .44, .03, hdr(...KEY_COLORS[ITEMS[type].key]));
      box(g, .22, .06, .035, hdr(3, 3, 3), 0, .12, 0);
      break;
    }
    default:
      break;
  }
  return g;
}

export class Item {
  constructor(game, type, x, y, z) {
    this.type = type;
    this.def = ITEMS[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.phase = Math.random() * 6;
    this.root = new THREE.Group();
    this.root.position.set(x, y, z);
    this.model = buildItem(type);
    this.model.position.y = .5;
    this.root.add(this.model);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: game.tex.softGlow,
      color: new THREE.Color(this.def.glow).multiplyScalar(.9),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: .55,
    }));
    glow.position.y = .45;
    glow.scale.setScalar(1.3);
    this.root.add(glow);
    game.scene.add(this.root);
    if (this.def.kind === 'key') this.light = game.lights.add({ pos: new THREE.Vector3(x, y + 1, z), color: this.def.glow, intensity: 10, range: 5 });
  }

  update(dt) {
    this.phase += dt;
    this.model.rotation.y += dt * 1.6;
    this.model.position.y = .5 + Math.sin(this.phase * 2.4) * .07;
  }

  dispose(game) {
    game.scene.remove(this.root);
    if (this.light) game.lights.remove(this.light);
  }
}

// ---------------------------------------------------------------- props

// Props return their scene objects and light sources so a level can remove them.
export function addLamp(game, x, ceil, z, color = 0xffe0b8) {
  const g = new THREE.Group();
  g.position.set(x, ceil, z);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(1, .12, .5), std(0x2a2d31, .7, .4));
  housing.position.y = -.06;
  const tint = new THREE.Color(color);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(.86, .36), hdr(tint.r * 5, tint.g * 5, tint.b * 5));
  panel.rotation.x = Math.PI / 2;
  panel.position.y = -.125;
  for (const s of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .3, 4), std(0x333333));
    rod.position.set(s * .35, .1, 0);
    g.add(rod);
  }
  g.add(housing, panel);
  game.scene.add(g);
  const h = ceil - game.level.at(x, z).floor;
  const light = game.lights.add({
    pos: new THREE.Vector3(x, ceil - .4, z),
    color,
    intensity: 2.2 * h * h,
    range: h * 2.4 + 5,
    shadow: true,
  });
  return { root: g, light };
}

export class Torch {
  constructor(game, x, y, z) {
    this.pos = new THREE.Vector3(x, y + 1.45, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const metal = std(0x3a3632, .7, .45);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, 1.3, 8), metal);
    stand.position.y = .65;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, .1, 10), metal);
    base.position.y = .05;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.24, .1, .2, 10, 1, true), metal);
    bowl.position.y = 1.36;
    const coals = new THREE.Mesh(new THREE.CircleGeometry(.22, 10), hdr(4, 1.2, .2));
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = 1.4;
    for (const m of [stand, base, bowl]) m.castShadow = true;
    g.add(stand, base, bowl, coals);
    game.scene.add(g);
    this.root = g;
    this.light = game.lights.add({ pos: this.pos.clone().setY(y + 1.8), color: 0xff7a30, intensity: 22, range: 9, flicker: 1.4 });
    this.acc = 0;
  }

  update(dt, game) {
    this.acc += dt * 40;
    while (this.acc > 1) {
      this.acc--;
      game.fire.spawn(
        this.pos.x + (Math.random() - .5) * .25, this.pos.y, this.pos.z + (Math.random() - .5) * .25,
        (Math.random() - .5) * .3, 1 + Math.random() * 1.2, (Math.random() - .5) * .3,
        .35 + Math.random() * .3, .5 + Math.random() * .25, .05, 3.2, 1.1 + Math.random() * .4, .2, 1,
      );
    }
    if (Math.random() < dt * 3) {
      game.dust.spawn(this.pos.x, this.pos.y + .6, this.pos.z, (Math.random() - .5) * .2, .8, (Math.random() - .5) * .2, 2, .4, 1.2, .15, .12, .1, .35);
    }
  }
}

export class ExitPad {
  constructor(game, x, y, z) {
    this.pos = new THREE.Vector3(x, y, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, .12, 32), std(0x2a2e33, .8, .35));
    base.position.y = .06;
    base.receiveShadow = true;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(.9, .04, 8, 48), hdr(.4, 4, 2.4));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = .14;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(.8, 32), hdr(.1, .9, .6));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = .125;
    g.add(base, this.ring, disc);
    game.scene.add(g);
    this.root = g;
    this.light = game.lights.add({ pos: new THREE.Vector3(x, y + 1.2, z), color: 0x40ffb0, intensity: 20, range: 7 });
    this.t = 0;
  }

  update(dt, game) {
    this.t += dt;
    this.ring.scale.setScalar(1 + Math.sin(this.t * 3) * .04);
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * .8;
      game.fire.spawn(this.pos.x + Math.cos(a) * r, this.pos.y + .15, this.pos.z + Math.sin(a) * r, 0, 1 + Math.random(), 0, 1.4, .12, 0, .4, 3, 1.8, 1);
    }
  }
}
