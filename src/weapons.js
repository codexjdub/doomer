// First-person weapons. The view models live in their own small scene that
// is drawn on top of the world, so guns never clip into walls.
import * as THREE from 'three';

export const WEAPONS = [
  { name: 'Pistol', ammo: 'bullets', rate: .34, dmg: [12, 18], pellets: 1, spread: .008, kick: .6, sound: 'pistol', shake: .04 },
  { name: 'Shotgun', ammo: 'shells', rate: .9, dmg: [8, 13], pellets: 8, spread: .06, kick: 1.5, sound: 'shotgun', shake: .2 },
  { name: 'Chaingun', ammo: 'bullets', rate: .085, dmg: [10, 15], pellets: 1, spread: .028, kick: .35, sound: 'chaingun', shake: .05 },
];

// Where each view model rests in camera space.
const REST = [
  new THREE.Vector3(.2, -.2, -.46),
  new THREE.Vector3(.2, -.24, -.34),
  new THREE.Vector3(.2, -.25, -.4),
];

const steel = () => new THREE.MeshStandardMaterial({ color: 0x5b6068, metalness: .85, roughness: .32 });
const darkSteel = () => new THREE.MeshStandardMaterial({ color: 0x2c2f34, metalness: .8, roughness: .38 });
const polymer = () => new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: .1, roughness: .6 });
const wood = () => new THREE.MeshStandardMaterial({ color: 0x6e3e1c, roughness: .55 });

function part(parent, geo, mat, x, y, z, rx = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  parent.add(m);
  return m;
}

export function buildPistol() {
  const root = new THREE.Group(), s = steel(), d = darkSteel(), p = polymer();
  root.scale.setScalar(.85);
  const slide = part(root, new THREE.BoxGeometry(.07, .085, .34), s, 0, 0, -.13);
  part(slide, new THREE.BoxGeometry(.072, .03, .2), d, 0, .01, .05);
  for (let i = 0; i < 5; i++) part(slide, new THREE.BoxGeometry(.074, .06, .008), d, 0, 0, .1 + i * .014);
  part(root, new THREE.BoxGeometry(.012, .02, .02), d, 0, .052, -.285);
  part(root, new THREE.BoxGeometry(.04, .02, .02), d, 0, .052, .02);
  part(root, new THREE.BoxGeometry(.066, .05, .3), p, 0, -.06, -.12);
  part(root, new THREE.CylinderGeometry(.016, .016, .04, 10), d, 0, -.005, -.31, Math.PI / 2);
  part(root, new THREE.BoxGeometry(.062, .17, .085), p, 0, -.14, .02, .28);
  part(root, new THREE.TorusGeometry(.035, .007, 6, 12, Math.PI), d, 0, -.1, -.06, Math.PI / 2);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -.005, -.34);
  root.add(muzzle);
  return { root, muzzle, slide };
}

export function buildShotgun() {
  const root = new THREE.Group(), s = steel(), d = darkSteel(), w = wood();
  for (const x of [-.031, .031]) part(root, new THREE.CylinderGeometry(.03, .03, .78, 16), s, x, 0, -.46, Math.PI / 2);
  part(root, new THREE.BoxGeometry(.012, .012, .7), d, 0, .03, -.42);
  const pump = part(root, new THREE.CylinderGeometry(.046, .046, .26, 12), w, 0, -.058, -.44, Math.PI / 2);
  for (let i = 0; i < 5; i++) part(pump, new THREE.TorusGeometry(.047, .004, 4, 16), d, 0, -.1 + i * .05, 0, Math.PI / 2);
  part(root, new THREE.BoxGeometry(.12, .12, .3), d, 0, -.02, 0);
  part(root, new THREE.BoxGeometry(.125, .03, .18), s, 0, .035, -.02);
  part(root, new THREE.BoxGeometry(.09, .15, .36), w, 0, -.09, .3, -.12);
  part(root, new THREE.TorusGeometry(.04, .008, 6, 12, Math.PI), d, 0, -.1, .06, Math.PI / 2);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -.86);
  root.add(muzzle);
  return { root, muzzle, pump };
}

export function buildChaingun() {
  const root = new THREE.Group(), s = steel(), d = darkSteel(), p = polymer();
  const barrels = new THREE.Group();
  barrels.position.set(0, 0, -.38);
  root.add(barrels);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    part(barrels, new THREE.CylinderGeometry(.018, .018, .62, 10), s, Math.cos(a) * .05, Math.sin(a) * .05, -.1, Math.PI / 2);
  }
  part(barrels, new THREE.CylinderGeometry(.075, .075, .04, 16), d, 0, 0, -.36, Math.PI / 2);
  part(barrels, new THREE.CylinderGeometry(.075, .075, .04, 16), d, 0, 0, .05, Math.PI / 2);
  part(barrels, new THREE.CylinderGeometry(.02, .02, .7, 8), d, 0, 0, -.1, Math.PI / 2);
  part(root, new THREE.CylinderGeometry(.1, .1, .34, 16), d, 0, 0, .02, Math.PI / 2);
  part(root, new THREE.BoxGeometry(.16, .12, .26), p, 0, -.07, .05);
  part(root, new THREE.BoxGeometry(.06, .18, .08), p, 0, -.18, .12, .3);
  part(root, new THREE.BoxGeometry(.04, .1, .2), s, 0, .12, -.02);
  part(root, new THREE.BoxGeometry(.1, .2, .12), p, .14, -.08, .02);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -.8);
  root.add(muzzle);
  return { root, muzzle, barrels };
}

export class Arsenal {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, .01, 10);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0x9aa0b0, 0x2a1a12, 1.4);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe8d0, 2.2);
    this.key.position.set(-1, 2, 1);
    this.scene.add(this.key);
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.camera.add(this.muzzleLight);

    this.holder = new THREE.Group();
    this.camera.add(this.holder);
    this.models = [buildPistol(), buildShotgun(), buildChaingun()];
    for (const m of this.models) {
      m.root.visible = false;
      this.holder.add(m.root);
    }
    const flashMat = new THREE.SpriteMaterial({
      map: game.tex.glow,
      color: new THREE.Color(6, 3.6, 1.4),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.tint = new THREE.Color();
    this.reset();
  }

  setEnvironment(env) {
    this.scene.environment = env;
    this.scene.environmentIntensity = .6;
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
    this.sway = new THREE.Vector2();
    this.models.forEach((m, i) => { m.root.visible = i === 0; });
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

  update(dt, input, mouse) {
    const g = this.game, p = g.player, w = WEAPONS[this.current];
    this.cool -= dt;

    // Weapon switch: lower the current gun, swap, raise the new one.
    if (this.pending >= 0) {
      this.lower = Math.min(1, this.lower + dt * 6);
      if (this.lower === 1) {
        this.models[this.current].root.visible = false;
        this.current = this.pending;
        this.pending = -1;
        this.models[this.current].root.visible = true;
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
        this.flashT = .05;
        this.pumpT = this.current === 1 ? .55 : 0;
        g.fireWeapon(w);
        g.sound.play(w.sound, null, .9);
        p.shake = Math.max(p.shake, w.shake);
        p.kick += w.kick * .012;
      }
    }
    if (!input.fire) this.clicked = false;

    // Chaingun barrels spin up while firing.
    this.spinSpeed = THREE.MathUtils.lerp(this.spinSpeed, wantsFire && this.current === 2 ? 28 : 0, Math.min(1, dt * 4));
    this.spin += this.spinSpeed * dt;
    this.models[2].barrels.rotation.z = this.spin;

    // Shotgun pump after each shot.
    this.pumpT = Math.max(0, this.pumpT - dt);
    const pumpK = this.pumpT > 0 && this.pumpT < .4 ? Math.sin((1 - this.pumpT / .4) * Math.PI) : 0;
    this.models[1].pump.position.z = -.44 + pumpK * .12;

    // Pistol slide kick.
    this.models[0].slide.position.z = -.13 + this.recoil * .05;

    // Bob, sway and recoil.
    const m = this.models[this.current];
    this.sway.x = THREE.MathUtils.lerp(this.sway.x, THREE.MathUtils.clamp(-mouse.x * .0008, -.05, .05), Math.min(1, dt * 10));
    this.sway.y = THREE.MathUtils.lerp(this.sway.y, THREE.MathUtils.clamp(mouse.y * .0008, -.05, .05), Math.min(1, dt * 10));
    const speed = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 7) * (p.grounded ? 1 : .3);
    const bx = Math.sin(p.bobPhase) * .014 * speed, by = -Math.abs(Math.cos(p.bobPhase)) * .012 * speed;
    const rest = REST[this.current];
    this.recoil = Math.max(0, this.recoil - dt * (this.current === 2 ? 14 : 6));
    const r = this.recoil * (this.current === 1 ? 1 : this.current === 0 ? .6 : .35);
    m.root.position.set(rest.x + bx + this.sway.x, rest.y + by + this.sway.y - this.lower * .35 - (p.dead ? .5 : 0), rest.z + r * .08);
    m.root.rotation.set(r * .22 + this.lower * .6, this.sway.x * 2, 0);

    // Muzzle flash sprite and light.
    this.flashT -= dt;
    const flashing = this.flashT > 0;
    this.flash.visible = flashing;
    if (flashing) {
      m.muzzle.getWorldPosition(this.flash.position);
      const s = this.current === 1 ? .55 : this.current === 2 ? .35 : .3;
      this.flash.scale.setScalar(s * (.8 + Math.random() * .4));
      this.flash.material.rotation = Math.random() * Math.PI;
    }
    this.muzzleLight.intensity = flashing ? 3 : 0;
    this.muzzleLight.position.set(.2, -.1, -.6);

    // Tint the gun with the colour of the strongest nearby light.
    const s = g.lights.strongest;
    this.tint.setRGB(1, 1, 1);
    if (s) this.tint.lerp(s.color, .55);
    this.key.color.lerp(this.tint, Math.min(1, dt * 3));
  }

  sync(mainCamera) {
    this.camera.aspect = mainCamera.aspect;
    this.camera.updateProjectionMatrix();
  }
}
