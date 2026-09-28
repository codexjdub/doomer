// Doomer: game setup, main loop and the glue between systems.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaterials, createSky } from './textures.js';
import { Level } from './level.js';
import { Particles, Decals, Debris, LightPool } from './effects.js';
import { Sound } from './audio.js';
import { Enemy, Projectile, rayCylinder } from './enemies.js';
import { prebake } from './monsters.js';
import { Arsenal } from './weapons.js';
import { Item, ITEMS, MAX, addLamp, Torch, ExitPad } from './items.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { Input } from './input.js';

const QUALITY = {
  low: { pixelRatio: .75, shadows: 0, bloom: false, smaa: false },
  medium: { pixelRatio: 1, shadows: 1, bloom: true, smaa: false },
  high: { pixelRatio: 1.5, shadows: 2, bloom: true, smaa: true },
};

const SETTINGS_KEY = 'doomer.settings';
const DEFAULTS = { quality: 'high', sensitivity: 1, volume: .7 };

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

class Game {
  constructor() {
    this.settings = loadSettings();
    this.canvas = document.getElementById('game');
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060303);
    this.scene.fog = new THREE.FogExp2(0x0a0504, .028);
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, .05, 200);
    this.camera.rotation.order = 'YXZ';

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = .12;
    this.scene.add(new THREE.HemisphereLight(0x606880, 0x281810, .45));

    this.tex = createMaterials();
    prebake();
    this.level = new Level();
    for (const m of this.level.build(this.tex.materials)) this.scene.add(m);
    this.sky = createSky();
    this.scene.add(this.sky);

    this.lights = new LightPool(this.scene, 10, 2);
    this.fire = new Particles(this.scene, 2500, this.tex.glow, true);
    this.dust = new Particles(this.scene, 1500, this.tex.smoke, false);
    this.decals = new Decals(this.scene, this.tex.hole);
    this.debris = new Debris(this.scene, this.level);
    this.fx = {
      ballGeo: new THREE.SphereGeometry(1, 14, 10),
      ballMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.4, 1.2) }),
      haloMat: new THREE.SpriteMaterial({
        map: this.tex.glow,
        color: new THREE.Color(3, 1.1, .3),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    };
    this.flashes = [];

    this.sound = new Sound();
    this.sound.setVolume(this.settings.volume);
    this.player = new Player();
    this.arsenal = new Arsenal(this);
    this.arsenal.setEnvironment(this.envMap);
    this.hud = new Hud(this);
    this.input = new Input(this);

    this.props = [];
    this.lavaCells = this.level.cells.filter((c) => c.lava);
    this.addStaticLights();
    for (const e of this.level.entities) {
      if (e.type === 'L') addLamp(this, e.x, this.level.at(e.x, e.z).ceil, e.z);
      if (e.type === 'F') this.props.push(new Torch(this, e.x, e.y, e.z));
      if (e.type === 'X') this.props.push(this.exitPad = new ExitPad(this, e.x, e.y, e.z));
    }
    this.muzzle = this.lights.add({ pos: new THREE.Vector3(), color: 0xffb060, intensity: 0, range: 10, dynamic: true });

    this.state = 'title';
    this.enemies = [];
    this.items = [];
    this.projectiles = [];
    this.time = 0;
    this.emberAcc = 0;
    this.reset();
    this.applyQuality(this.settings.quality);
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    // Compile shaders up front so the first frames don't hitch.
    this.renderer.compile(this.scene, this.camera);
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    this.hud.showScreen('title');
    this.hud.ready();
  }

  addStaticLights() {
    for (const c of this.lavaCells) {
      if (c.x % 3 === 0 && c.z % 3 === 0) {
        this.lights.add({ pos: new THREE.Vector3(c.x + .5, c.floor + 1, c.z + .5), color: 0xff4a10, intensity: 18, range: 7, flicker: .6 });
      }
    }
    // Hellfire glow over the open courtyard.
    for (const [x, z] of [[30, 10], [41, 10], [35, 19]]) {
      this.lights.add({ pos: new THREE.Vector3(x, 9, z), color: 0xff6a3a, intensity: 220, range: 24 });
    }
  }

  // ------------------------------------------------------------ settings

  setSetting(key, value) {
    this.settings[key] = value;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage can be unavailable (private mode); settings just won't persist.
    }
    if (key === 'quality') this.applyQuality(value);
    if (key === 'volume') this.sound.setVolume(value);
  }

  applyQuality(name) {
    const Q = QUALITY[name] || QUALITY.high;
    this.pixelRatio = Math.min(devicePixelRatio || 1, Q.pixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = Q.shadows > 0;
    this.lights.setShadows(Q.shadows > 0, Q.shadows);
    this.scene.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
    });

    this.composer?.dispose();
    const w = innerWidth, h = innerHeight;
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.weaponPass = new RenderPass(this.arsenal.scene, this.arsenal.camera);
    this.weaponPass.clear = false;
    this.weaponPass.clearDepth = true;
    c.addPass(this.weaponPass);
    if (Q.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), .6, .5, .9));
    c.addPass(new OutputPass());
    if (Q.smaa) c.addPass(new SMAAPass(w * this.pixelRatio, h * this.pixelRatio));
    this.composer = c;
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.arsenal.sync(this.camera);
    this.fire.setScale(h * this.pixelRatio, this.camera.fov);
    this.dust.setScale(h * this.pixelRatio, this.camera.fov);
  }

  // ------------------------------------------------------------ flow

  reset() {
    for (const e of this.enemies) e.dispose(this);
    for (const it of this.items) it.dispose(this);
    for (const p of this.projectiles) p.dispose(this);
    for (const f of this.flashes) this.lights.remove(f.light);
    this.enemies = [];
    this.items = [];
    this.projectiles = [];
    this.flashes = [];
    this.boss = null;
    this.debris.clear();
    this.decals.clear();
    this.fire.clear();
    this.dust.clear();
    this.level.resetDoors();

    let spawn = { x: 2.5, y: 0, z: 2.5, yaw: 0 };
    for (const e of this.level.entities) {
      if (e.type === '@') spawn = { x: e.x, y: e.y, z: e.z, yaw: 0 };
      else if (e.type === 'I') this.enemies.push(new Enemy(this, 'imp', e.x, e.y, e.z));
      else if (e.type === 'Z') this.enemies.push(new Enemy(this, 'brute', e.x, e.y, e.z));
      else if (e.type === 'W') this.enemies.push(this.boss = new Enemy(this, 'boss', e.x, e.y, e.z));
      else if (ITEMS[e.type]) this.items.push(new Item(this, e.type, e.x, e.y, e.z));
    }
    if (this.boss) this.boss.model.root.rotation.y = this.boss.yaw = -Math.PI / 2;
    this.player.reset(spawn);
    this.arsenal.reset();
    this.stats = { kills: 0, total: this.enemies.length, time: 0 };
    this.flowTimer = 0;
    this.lockedMsgT = 0;
    this.deathT = 0;
    this.level.updateFlow(spawn.x, spawn.z);
    this.hud.reset();
  }

  action(name) {
    if (name === 'play') this.start();
    if (name === 'resume') this.resume();
    if (name === 'restart') {
      this.reset();
      this.start();
    }
  }

  start() {
    this.sound.init();
    this.sound.resume();
    this.state = 'playing';
    this.hud.showScreen(null);
    this.input.lock();
    if (this.player.health === 100 && this.stats.time === 0) {
      this.hud.message('Find the red keycard. Kill everything.');
    }
  }

  pause() {
    this.state = 'paused';
    this.input.unlock();
    this.sound.suspend();
    this.hud.showScreen('pause');
  }

  resume() {
    this.sound.resume();
    this.state = 'playing';
    this.hud.showScreen(null);
    this.input.lock();
  }

  onLockChange(locked) {
    if (!locked && this.state === 'playing') this.pause();
  }

  onPlayerDeath() {
    this.state = 'dying';
    this.deathT = 1.8;
  }

  win() {
    this.state = 'won';
    this.sound.play('exit');
    this.input.unlock();
    this.hud.showScreen('win', this.statsText());
  }

  statsText() {
    const s = this.stats;
    return `Time <b>${fmtTime(s.time)}</b><br>Kills <b>${s.kills} / ${s.total}</b>`;
  }

  // ------------------------------------------------------------ main loop

  frame = (now) => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    if (this.state === 'playing' || this.state === 'dying') this.update(dt);
    else if (this.state === 'title') this.attract(dt);
    else this.input.consumeLook();
    this.render(dt);
  };

  update(dt) {
    const p = this.player;
    const look = this.input.consumeLook();
    look.sens = this.settings.sensitivity;
    if (this.state === 'playing') this.stats.time += dt;

    p.update(dt, this.input, look, this);

    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = .3;
      this.level.updateFlow(p.pos.x, p.pos.z);
    }
    this.updateDoors(dt);
    for (const e of this.enemies) e.update(dt, this);
    this.projectiles = this.projectiles.filter((pr) => pr.update(dt, this));
    for (const it of this.items) it.update(dt);
    this.checkPickups();
    this.arsenal.update(dt, this.input, look);
    this.input.endFrame();
    this.updateEffects(dt);

    if (this.exitPad && !p.dead && this.state === 'playing') {
      const d = Math.hypot(p.pos.x - this.exitPad.pos.x, p.pos.z - this.exitPad.pos.z);
      if (d < 1 && Math.abs(p.pos.y - this.exitPad.pos.y) < 1) this.win();
    }

    if (this.state === 'dying') {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        this.state = 'dead';
        this.input.unlock();
        this.hud.showScreen('dead', this.statsText());
      }
    }
    this.hud.update(dt);
  }

  updateEffects(dt) {
    for (const pr of this.props) pr.update(dt, this);
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 500);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      f.light.intensity = f.peak * Math.max(0, f.t / f.len);
      if (f.t <= 0) {
        this.lights.remove(f.light);
        this.flashes.splice(i, 1);
      }
    }
    // Embers drifting up from nearby lava.
    this.emberAcc += dt * 70;
    const cam = this.camera.position;
    while (this.emberAcc > 1 && this.lavaCells.length) {
      this.emberAcc--;
      const c = this.lavaCells[(Math.random() * this.lavaCells.length) | 0];
      if (Math.abs(c.x - cam.x) + Math.abs(c.z - cam.z) > 26) continue;
      this.fire.spawn(c.x + Math.random(), c.floor + .1, c.z + Math.random(),
        (Math.random() - .5) * .4, .6 + Math.random() * 1.2, (Math.random() - .5) * .4,
        2 + Math.random() * 2.5, .07, .02, 3.5, 1.1, .2, 1, -.1, .3);
    }
    this.fire.update(dt);
    this.dust.update(dt);
    this.debris.update(dt);
  }

  attract(dt) {
    this.input.consumeLook();
    const t = this.time * .12;
    this.camera.position.set(11.5 + Math.sin(t) * 3, 3.1 + Math.sin(t * .7) * .3, 21.5 + Math.cos(t * .8) * 1.2);
    this.camera.lookAt(11.5 + Math.sin(t * .5) * 2.5, 2.6, 6);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.anim += dt;
      e.idleAnim();
    }
    for (const it of this.items) it.update(dt);
    this.updateEffects(dt);
  }

  render(dt) {
    if (this.state !== 'title') this.player.applyCamera(this.camera, this.time);
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.time.value = this.time;
    this.tex.lavaTex.offset.set(this.time * .03, Math.sin(this.time * .4) * .06);
    const L = this.sound.listener;
    L.x = this.camera.position.x;
    L.z = this.camera.position.z;
    L.yaw = this.camera.rotation.y;
    this.lights.update(this.camera, this.time, dt);
    this.weaponPass.enabled = this.state !== 'title';
    this.composer.render(dt);
  }

  // ------------------------------------------------------------ world

  updateDoors(dt) {
    const p = this.player;
    this.lockedMsgT -= dt;
    for (const d of this.level.doors) {
      if (d.target > 0 || p.dead) continue;
      const dx = Math.max(d.minX - p.pos.x, 0, p.pos.x - d.maxX);
      const dz = Math.max(d.minZ - p.pos.z, 0, p.pos.z - d.maxZ);
      if (Math.hypot(dx, dz) > 1.6) continue;
      if (d.type === 'red' && !p.keys.has('red')) {
        this.locked(d, 'You need the red keycard');
        continue;
      }
      if (d.type === 'boss') {
        this.locked(d, 'Sealed. Kill the Warlord to open it.');
        continue;
      }
      d.target = d.height;
    }
    this.level.updateDoors(dt, (d) => this.sound.play('door', { x: d.cx, z: d.cz }));
  }

  locked(door, text) {
    if (this.lockedMsgT > 0) return;
    this.lockedMsgT = 2.5;
    this.hud.message(text, true);
    this.sound.play('locked', { x: door.cx, z: door.cz });
  }

  checkPickups() {
    const p = this.player;
    if (p.dead) return;
    this.items = this.items.filter((it) => {
      const dx = it.pos.x - p.pos.x, dz = it.pos.z - p.pos.z;
      if (dx * dx + dz * dz > .81 || Math.abs(it.pos.y - p.pos.y) > 1.2) return true;
      if (!this.pickup(it)) return true;
      it.dispose(this);
      return false;
    });
  }

  pickup(it) {
    const p = this.player, d = it.def;
    switch (d.kind) {
      case 'health':
        if (!p.heal(d.amount)) return false;
        break;
      case 'armor':
        if (p.armor >= MAX.armor) return false;
        p.armor = Math.min(MAX.armor, p.armor + d.amount);
        break;
      case 'ammo':
        if (p.ammo[d.ammo] >= MAX[d.ammo]) return false;
        p.ammo[d.ammo] = Math.min(MAX[d.ammo], p.ammo[d.ammo] + d.amount);
        break;
      case 'weapon': {
        const had = p.owned[d.weapon];
        if (had && p.ammo[d.ammo] >= MAX[d.ammo]) return false;
        p.owned[d.weapon] = true;
        p.ammo[d.ammo] = Math.min(MAX[d.ammo], p.ammo[d.ammo] + d.amount);
        if (!had) this.arsenal.select(d.weapon);
        break;
      }
      case 'key':
        p.keys.add(d.key);
        break;
      default:
        return false;
    }
    this.sound.play(d.kind === 'weapon' ? 'weapon' : d.kind === 'key' ? 'key' : 'item');
    this.hud.message(d.kind === 'weapon' ? `You got the ${d.label.toLowerCase()}!` : `Picked up: ${d.label}`);
    this.hud.pickupFlash();
    return true;
  }

  fireWeapon(w) {
    const cam = this.camera, origin = cam.position.clone();
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const hits = new Map();
    for (let i = 0; i < w.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * w.spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const wall = this.level.raycast(origin, dir, 90);
      let best = wall ? wall.dist : 90, target = null;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const t = rayCylinder(origin, dir, e.pos.x, e.pos.z, e.def.radius, e.pos.y, e.pos.y + e.def.height);
        if (t < best) {
          best = t;
          target = e;
        }
      }
      if (target) {
        const pt = origin.clone().addScaledVector(dir, best);
        hits.set(target, (hits.get(target) || 0) + randInt(w.dmg));
        this.blood(pt.x, pt.y, pt.z, 10, 2.4, dir);
      } else if (wall) {
        this.decals.add(wall.point, wall.normal);
        this.sparks(wall.point, wall.normal);
      }
    }
    for (const [e, dmg] of hits) e.damage(dmg, this, fwd);
    if (hits.size) this.hud.hit();
    this.muzzle.pos.copy(origin).addScaledVector(fwd, .8);
    this.muzzle.intensity = 45;
    this.alertMonsters();
  }

  // Gunfire wakes every monster within earshot along walkable paths.
  alertMonsters() {
    for (const e of this.enemies) {
      if (e.dead || e.state !== 'idle') continue;
      if (this.level.flowAt(Math.floor(e.pos.x), Math.floor(e.pos.z)) < 24) e.wake(this);
    }
  }

  spawnProjectile(origin, dir, speed, damage, owner, big) {
    this.projectiles.push(new Projectile(this, origin, dir, speed, damage, owner, big));
  }

  onEnemyDeath(e) {
    this.stats.kills++;
    if (e === this.boss) {
      for (let i = 0; i < 5; i++) {
        const p = e.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 3, 1 + Math.random() * 4, (Math.random() - .5) * 3));
        setTimeout(() => this.explosion(p, true, false), i * 180);
      }
      for (const d of this.level.doors) if (d.type === 'boss') d.target = d.height;
      this.hud.message('The Warlord is dead. The exit is open.');
      this.player.shake = .5;
    }
  }

  // ------------------------------------------------------------ effects

  flash(pos, color, peak, range, len) {
    const light = this.lights.add({ pos: pos.clone(), color, intensity: peak, range, dynamic: true });
    this.flashes.push({ light, peak, t: len, len });
  }

  blood(x, y, z, count, force, dir) {
    for (let i = 0; i < count; i++) {
      let vx = (Math.random() - .5) * force, vy = Math.random() * force * .8, vz = (Math.random() - .5) * force;
      if (dir) {
        vx += dir.x * force * .6;
        vz += dir.z * force * .6;
      }
      this.dust.spawn(x, y, z, vx, vy, vz, .4 + Math.random() * .6, .04 + Math.random() * .07, .02, .3, .01, .008, .95, 12, 1);
    }
  }

  sparks(p, n) {
    for (let i = 0; i < 7; i++) {
      this.fire.spawn(p.x, p.y, p.z,
        n.x * 2.5 + (Math.random() - .5) * 3, n.y * 2.5 + Math.random() * 2.5, n.z * 2.5 + (Math.random() - .5) * 3,
        .15 + Math.random() * .2, .07, .01, 4, 2.6, 1, 1, 9);
    }
    this.dust.spawn(p.x + n.x * .05, p.y + n.y * .05, p.z + n.z * .05, n.x * .4, .3 + n.y * .4, n.z * .4, .9, .12, .55, .45, .42, .38, .45);
  }

  explosion(pos, big, damage = true) {
    const n = big ? 42 : 26, f = big ? 5 : 3.5;
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar(f * (.3 + Math.random()));
      this.fire.spawn(pos.x, pos.y, pos.z, v.x, v.y, v.z, .3 + Math.random() * .35, (big ? 1.1 : .7) * (.6 + Math.random() * .6), .1, 4, 1.5, .35, 1, -1.5, 3);
    }
    for (let i = 0; i < (big ? 10 : 5); i++) {
      this.dust.spawn(pos.x, pos.y, pos.z, (Math.random() - .5) * 1.5, .6 + Math.random(), (Math.random() - .5) * 1.5, 1.2 + Math.random(), .5, 1.8, .12, .1, .09, .5, -.3, 1.5);
    }
    this.flash(pos, 0xff7a30, big ? 90 : 50, big ? 11 : 7, .3);
    this.sound.play('explode', pos, big ? 1 : .7);
    if (big && damage) {
      const p = this.player, d = p.eye().distanceTo(pos);
      if (d < 2.6) p.hurt(Math.round(18 * (1 - d / 2.6)), pos, this);
    }
  }

  shockwave(pos, radius) {
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      this.dust.spawn(pos.x + Math.cos(a), pos.y + .2, pos.z + Math.sin(a), Math.cos(a) * radius * 1.4, .6, Math.sin(a) * radius * 1.4, .7, .6, 1.4, .3, .22, .16, .7, 0, 2);
      this.fire.spawn(pos.x + Math.cos(a) * 1.2, pos.y + .15, pos.z + Math.sin(a) * 1.2, Math.cos(a) * radius, .4, Math.sin(a) * radius, .35, .25, .05, 3, 1.1, .3, 1, 0, 2);
    }
    const d = this.player.pos.distanceTo(pos);
    this.player.shake = Math.max(this.player.shake, Math.max(0, .5 - d * .03));
    this.flash(pos.clone().setY(pos.y + 1), 0xff5a20, 60, 9, .25);
  }
}

function boot() {
  try {
    window.game = new Game();
  } catch (err) {
    console.error(err);
    const b = document.querySelector('[data-action="play"]');
    b.textContent = 'WebGL is not available';
    document.querySelector('#screen-title .tag').textContent = 'Doomer needs a browser with WebGL 2. Try a recent Chrome, Firefox, Edge or Safari.';
  }
}

boot();
