// Pickups and level props (lamps, torches, the exit pad), drawn as pixel-art
// sprites. Props also say what light they give off, which the renderer
// bakes into the level.
import { Vec3 } from './vec.js';
import { itemSprite, lampSprite, torchSprite, exitPadSprite } from './art.js';

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

export class Item {
  constructor(game, type, x, y, z) {
    this.type = type;
    this.def = ITEMS[type];
    this.pos = new Vec3(x, y, z);
    this.phase = Math.random() * 6;
    this.sprite = itemSprite(type);
    this.lift = 0;
    // Keycards glow; the light goes when the card is picked up.
    if (this.def.kind === 'key') this.light = game.lights.add({ pos: new Vec3(x, y + 1, z), color: this.def.glow, intensity: 10, range: 5 });
  }

  update(dt) {
    this.phase += dt;
    this.lift = this.def.kind === 'key' || this.def.kind === 'armor' ? .12 + Math.sin(this.phase * 2.4) * .06 : 0;
  }

  draw(R) {
    R.drawSprite(this.sprite, this.pos.x, this.pos.y + this.lift, this.pos.z);
  }

  dispose(game) {
    if (this.light) game.lights.remove(this.light);
  }
}

// ---------------------------------------------------------------- props

const lampCache = {};

// A ceiling lamp; its light is baked into the level.
export class Lamp {
  constructor(game, x, ceil, z, color = 0xffe0b8) {
    this.pos = new Vec3(x, ceil, z);
    this.sprite = lampCache[color] || (lampCache[color] = lampSprite(color));
    const h = ceil - game.level.at(x, z).floor;
    this.light = { x, y: ceil - .4, z, color, intensity: 2.2 * h * h, range: h * 2.4 + 5 };
  }

  update() {}

  draw(R) {
    R.drawSprite(this.sprite, this.pos.x, this.pos.y, this.pos.z);
  }
}

let torchArt = null;

export class Torch {
  constructor(game, x, y, z) {
    this.base = new Vec3(x, y, z);
    this.pos = new Vec3(x, y + 1.45, z);
    this.sprite = torchArt || (torchArt = torchSprite());
    this.light = { x, y: y + 1.8, z, color: 0xff7a30, intensity: 22, range: 9, flicker: true };
    this.acc = 0;
  }

  update(dt, game) {
    this.acc += dt * 40;
    while (this.acc > 1) {
      this.acc--;
      game.fire.spawn(
        this.pos.x + (Math.random() - .5) * .25, this.pos.y + .05, this.pos.z + (Math.random() - .5) * .25,
        (Math.random() - .5) * .3, 1 + Math.random() * 1.2, (Math.random() - .5) * .3,
        .35 + Math.random() * .3, .5 + Math.random() * .25, .05, 3.2, 1.1 + Math.random() * .4, .2, 1,
      );
    }
    if (Math.random() < dt * 3) {
      game.dust.spawn(this.pos.x, this.pos.y + .6, this.pos.z, (Math.random() - .5) * .2, .8, (Math.random() - .5) * .2, 2, .4, 1.2, .15, .12, .1, .35);
    }
  }

  draw(R) {
    R.drawSprite(this.sprite, this.base.x, this.base.y, this.base.z);
  }
}

let padArt = null;

export class ExitPad {
  constructor(game, x, y, z) {
    this.pos = new Vec3(x, y, z);
    this.sprite = padArt || (padArt = exitPadSprite());
    this.light = { x, y: y + 1.2, z, color: 0x40ffb0, intensity: 20, range: 7 };
    this.t = 0;
  }

  update(dt, game) {
    this.t += dt;
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * .8;
      game.fire.spawn(this.pos.x + Math.cos(a) * r, this.pos.y + .15, this.pos.z + Math.sin(a) * r, 0, 1 + Math.random(), 0, 1.4, .12, 0, .4, 3, 1.8, 1);
    }
  }

  draw(R) {
    R.drawSprite(this.sprite, this.pos.x, this.pos.y, this.pos.z);
  }
}
