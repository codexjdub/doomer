// First-person weapons: firing, switching, and the baked pixel-art guns
// (see guns.js) drawn over the view with bob, sway, recoil and a muzzle flash.
import { bakeGuns } from './guns.js';
import { lerp, clamp } from './vec.js';

export const WEAPONS = [
  { name: 'Pistol', ammo: 'bullets', rate: .34, dmg: [12, 18], pellets: 1, spread: .008, kick: .6, sound: 'pistol', shake: .04 },
  { name: 'Shotgun', ammo: 'shells', rate: .9, dmg: [8, 13], pellets: 8, spread: .06, kick: 1.5, sound: 'shotgun', shake: .2 },
  { name: 'Chaingun', ammo: 'bullets', rate: .085, dmg: [10, 15], pellets: 1, spread: .028, kick: .35, sound: 'chaingun', shake: .05 },
];

export class Arsenal {
  constructor(game) {
    this.game = game;
    this.guns = null;
    this.bakedFor = null;
    this.reset();
  }

  reset() {
    this.current = 0;
    this.pending = -1;
    this.lower = 0;
    this.cool = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.spin = 0;
    this.spinSpeed = 0;
    this.pumpT = 0;
    this.swayX = 0;
    this.swayY = 0;
  }

  select(i) {
    const p = this.game.player;
    if (!p.owned[i] || i === this.current || i === this.pending) return;
    this.pending = i;
    this.game.sound.play('switch');
  }

  cycle(dir) {
    const p = this.game.player;
    for (let k = 1; k <= 3; k++) {
      const i = (this.current + dir * k + 30) % 3;
      if (p.owned[i]) {
        this.select(i);
        return;
      }
    }
  }

  bestWithAmmo() {
    const p = this.game.player;
    for (const i of [1, 2, 0]) {
      if (p.owned[i] && p.ammo[WEAPONS[i].ammo] > 0) return i;
    }
    return -1;
  }

  // The muzzle flash lights the room for a moment.
  get flashing() {
    return this.flashT > 0;
  }

  update(dt, input, mouse) {
    const g = this.game, p = g.player, w = WEAPONS[this.current];
    this.cool -= dt;

    // Weapon switch: lower the current gun, swap, raise the new one.
    if (this.pending >= 0) {
      this.lower = Math.min(1, this.lower + dt * 6);
      if (this.lower === 1) {
        this.current = this.pending;
        this.pending = -1;
        this.cool = Math.max(this.cool, .1);
      }
    } else {
      this.lower = Math.max(0, this.lower - dt * 5);
    }

    const wantsFire = input.fire && !p.dead && g.state === 'playing';
    if (wantsFire && this.cool <= 0 && this.pending < 0 && this.lower < .3) {
      if (p.ammo[w.ammo] <= 0) {
        if (!this.clicked) g.sound.play('empty');
        this.clicked = true;
        this.cool = .25;
        const best = this.bestWithAmmo();
        if (best >= 0 && best !== this.current) this.select(best);
      } else {
        p.ammo[w.ammo]--;
        this.cool = w.rate;
        this.recoil = 1;
        this.flashT = .06;
        this.pumpT = this.current === 1 ? .55 : 0;
        g.fireWeapon(w);
        g.sound.play(w.sound, null, .9);
        p.shake = Math.max(p.shake, w.shake);
        p.kick += w.kick * .012;
      }
    }
    if (!input.fire) this.clicked = false;

    // Chaingun barrels spin up while firing.
    this.spinSpeed = lerp(this.spinSpeed, wantsFire && this.current === 2 ? 28 : 0, Math.min(1, dt * 4));
    this.spin += this.spinSpeed * dt;
    this.pumpT = Math.max(0, this.pumpT - dt);
    this.recoil = Math.max(0, this.recoil - dt * (this.current === 2 ? 14 : 6));
    this.flashT -= dt;
    this.swayX = lerp(this.swayX, clamp(-mouse.x * .25, -12, 12), Math.min(1, dt * 10));
    this.swayY = lerp(this.swayY, clamp(mouse.y * .25, -8, 8), Math.min(1, dt * 10));
  }

  // Draw the gun at the bottom of the view, lit by the light at the player.
  draw(R, light) {
    if (this.bakedFor !== R.VH) {
      this.guns = bakeGuns(R.W, R.VH);
      this.bakedFor = R.VH;
    }
    const p = this.game.player, gun = this.guns[this.current], F = gun.frames, s = R.VH / 168;
    let frame = F.idle;
    if (this.current === 0 && this.recoil > .45) frame = F.back;
    if (this.current === 1 && this.pumpT > 0 && this.pumpT < .4) {
      const k = Math.sin((1 - this.pumpT / .4) * Math.PI);
      frame = k > .7 ? F.pump2 : k > .25 ? F.pump1 : F.idle;
    }
    if (this.current === 2) frame = [F.idle, F.spin1, F.spin2][(((this.spin / (Math.PI / 3)) * 3) | 0) % 3];

    const speed = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 7) * (p.grounded ? 1 : .3);
    const bx = Math.sin(p.bobPhase) * 7 * speed * s, by = Math.abs(Math.cos(p.bobPhase)) * 6 * speed * s;
    const kick = this.recoil * (this.current === 1 ? 7 : this.current === 0 ? 4 : 2) * s;
    const x = R.W / 2 + bx + this.swayX * s, y = R.VH / 2 + by + this.swayY * s + kick + this.lower * R.VH * .45 + (p.dead ? R.VH * .3 : 0);
    // Keep guns readable in dark rooms, and warm when the flash goes off.
    const L = [light[0] * 1.15 + .22, light[1] * 1.15 + .22, light[2] * 1.15 + .22];
    if (this.flashing) {
      L[0] += .9;
      L[1] += .6;
      L[2] += .25;
    }
    R.blit(frame, x + frame.ox, y + frame.oy, L.map((v) => Math.min(1.6, v)));
    if (this.flashing) {
      const f = F.flash;
      R.blit(f, x + gun.muzzle[0] - f.w / 2, y + gun.muzzle[1] - f.h / 2 - kick, [1, 1, 1]);
    }
  }
}
