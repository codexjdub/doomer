// Doomer: game setup, main loop and the glue between systems.
import { Renderer } from './renderer.js';
import { Level } from './level.js';
import { LEVELS } from './levels.js';
import { Particles, Gibs, Blasts, Lights } from './effects.js';
import { Sound } from './audio.js';
import { Music } from './music.js';
import { Enemy, Projectile, rayCylinder } from './enemies.js';
import { bakeMonster, bakeMonsterSoon, addSheet, monsterSprite, nextTask } from './sprites.js';
import { loadSheets, saveSheet } from './spritecache.js';
import { gibSprites, explosionSprites, fireballSprites, skullFlameSprites } from './art.js';
import { Arsenal } from './weapons.js';
import { Item, ITEMS, MAX, Lamp, Torch, ExitPad } from './items.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Automap } from './automap.js';
import { Vec3, randInt, clamp } from './vec.js';

// Menus stay light: the title flythrough draws at 30 fps, the pause, death
// and win screens hold their last frame, and nothing draws once the window
// loses focus or sits a minute without input.
const MENU_FPS = 30;
const IDLE_MS = 60000;
const FROZEN = new Set(['paused', 'dead', 'won']);
// The death and win screens let the sound play out, then go quiet.
const QUIET_MS = 3000;

const SETTINGS_KEY = 'doomer.settings';
const PROGRESS_KEY = 'doomer.progress';
const DEFAULTS = { pixels: 1, sensitivity: 1, volume: .7, music: .5, minimap: true, skill: 'normal' };

// Difficulty, applied when a level starts. damage scales what the player
// takes, ammo what pickups give; every `thin`th monster stays away; attack
// speeds up monsters' cooldowns and missile their fireballs.
const SKILLS = {
  easy: { label: 'Easy', damage: .5, ammo: 2, thin: 4, attack: 1, missile: 1, note: 'You take half damage, ammo counts double, and fewer monsters show up.' },
  normal: { label: 'Normal', damage: 1, ammo: 1, thin: 0, attack: 1, missile: 1, note: 'Monsters as intended. Ammo and health as placed.' },
  hard: { label: 'Hard', damage: 1.5, ammo: 1, thin: 0, attack: 1.3, missile: 1.2, note: 'You take 1.5× damage. Monsters attack more often and throw faster.' },
};

function loadSettings() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    if (s.pixels !== 1 && s.pixels !== 2) s.pixels = 1;
    if (!SKILLS[s.skill]) s.skill = DEFAULTS.skill;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

// Which levels are unlocked, and the loadout carried into each one.
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    return { unlocked: Math.max(1, Math.min(LEVELS.length, p.unlocked | 0)), loadouts: p.loadouts || {} };
  } catch {
    return { unlocked: 1, loadouts: {} };
  }
}

const HAZARD = {
  lava: { light: 0xff4a10, ember: [3.5, 1.1, .2], damage: 9, every: .45 },
  slime: { light: 0x50ff30, ember: [.8, 3, .4], damage: 5, every: .6 },
};

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Monster characters in the level layouts, and the types they spawn.
const MONSTERS = { I: 'imp', Z: 'brute', O: 'skull', W: 'boss' };
const monstersIn = (rows) => [...new Set([...rows.join('')].map((ch) => MONSTERS[ch]).filter(Boolean))];

class Game {
  constructor() {
    this.settings = loadSettings();
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.renderer.setScale(this.settings.pixels);
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

    this.lights = new Lights();
    this.fire = new Particles(2500, true);
    this.dust = new Particles(1500, false);
    this.flashes = [];
    this.later = [];

    this.sound = new Sound();
    this.sound.setVolume(this.settings.volume);
    this.music = new Music(this.sound);
    this.music.setVolume(this.settings.music);
    this.player = new Player();
    this.arsenal = new Arsenal(this);
    this.hud = new Hud(this);
    this.input = new Input(this);
    this.automap = new Automap(this);
    this.automap.setMini(this.settings.minimap);
    this.progress = loadProgress();

    this.state = 'loading';
    this.running = false;
    this.enemies = [];
    this.items = [];
    this.projectiles = [];
    this.props = [];
    this.time = 0;
    this.emberAcc = 0;
    addEventListener('resize', () => {
      this.renderer.resize();
      this.wake(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
      if (!document.hidden) this.wake();
    });
    for (const type of ['mousemove', 'mousedown', 'keydown', 'wheel', 'focus']) addEventListener(type, () => this.wake(), { passive: true });
    addEventListener('blur', () => { this.lastInput = -Infinity; });
  }

  // Show the title over the first level as soon as its monsters are ready:
  // from the browser's saved copy, or baked now. The rest bake afterwards.
  async init() {
    const all = [...new Set(LEVELS.flatMap((def) => monstersIn(def.build())))];
    const saved = await loadSheets(all);
    for (const [type, sheet] of Object.entries(saved)) addSheet(type, sheet);
    const first = monstersIn(LEVELS[0].build());
    for (let i = 0; i < first.length; i++) {
      this.hud.loading(i / first.length);
      await bakeMonsterSoon(first[i]);
    }
    this.gibs = new Gibs(gibSprites());
    this.blasts = new Blasts(explosionSprites());
    this.ballArt = { small: fireballSprites(false), big: fireballSprites(true) };
    this.flameArt = skullFlameSprites();
    this.arsenal.bake(this.renderer);
    this.loadLevel(0);
    this.state = 'title';
    this.wake();
    this.hud.showScreen('title');
    this.hud.ready();
    this.hud.buildLevels(LEVELS, this.progress.unlocked);
    this.hud.buildSkills(SKILLS, this.settings.skill);
    this.bakeRest(all, saved);
  }

  // Bake the remaining monsters in small slices, in the order the levels
  // need them, pausing while a level is being played. Each one is saved for
  // the next visit.
  async bakeRest(types, saved) {
    const between = async () => {
      await nextTask();
      while (this.state === 'playing' || this.state === 'dying') await sleep(250);
    };
    for (const type of types) {
      if (saved[type]) continue;
      saveSheet(type, await bakeMonsterSoon(type, between));
    }
  }

  // Swap in a level: build its cells and props, bake its lighting, then
  // spawn everything. `loadout` is what the player carries in.
  loadLevel(index, loadout = null) {
    const def = LEVELS[index], t = def.theme, rows = def.build();
    // Finish any monster the background baking hasn't reached yet.
    for (const type of monstersIn(rows)) bakeMonster(type);
    this.lights.clear();
    this.levelIndex = index;
    this.def = def;
    this.level = new Level(rows, def.presets);
    this.gibs.level = this.level;
    this.renderer.setLevel(this.level, t);

    const baked = [];
    this.hazardCells = this.level.cells.filter((c) => c.lava);
    for (const c of this.hazardCells) {
      if (c.x % 3 === 0 && c.z % 3 === 0) {
        baked.push({ x: c.x + .5, y: c.floor + 1, z: c.z + .5, color: HAZARD[c.slime ? 'slime' : 'lava'].light, intensity: 18, range: 7, flicker: true });
      }
    }
    for (const [x, y, z, color, intensity, range] of def.lights || []) baked.push({ x, y, z, color, intensity, range });
    this.props = [];
    this.exitPad = null;
    for (const e of this.level.entities) {
      let prop = null;
      if (e.type === 'L') prop = new Lamp(this, e.x, this.level.at(e.x, e.z).ceil, e.z, t.lamp);
      if (e.type === 'F') prop = new Torch(this, e.x, e.y, e.z);
      if (e.type === 'X') prop = this.exitPad = new ExitPad(this, e.x, e.y, e.z);
      if (prop) {
        this.props.push(prop);
        baked.push(prop.light);
      }
    }
    this.renderer.bakeLights(baked);
    this.muzzle = this.lights.add({ pos: new Vec3(), color: 0xffb060, intensity: 0, range: 10 });
    this.automap.setLevel(this.level);
    this.startLoadout = loadout;
    this.reset();
  }

  // What the player carries into the next level (keys stay behind).
  loadout() {
    const p = this.player;
    return { health: Math.max(1, Math.ceil(p.health)), armor: p.armor, ammo: { ...p.ammo }, owned: [...p.owned] };
  }

  saveProgress() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.progress));
    } catch {
      // Storage can be unavailable (private mode); progress just won't persist.
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
    if (key === 'pixels') {
      this.renderer.setScale(value);
      this.arsenal.bake(this.renderer);
    }
    if (key === 'volume') this.sound.setVolume(value);
    if (key === 'music') this.music.setVolume(value);
    if (key === 'minimap') this.automap.setMini(value);
    if (key === 'pixels' || key === 'minimap') this.wake(true);
  }

  // ------------------------------------------------------------ flow

  reset() {
    this.skill = SKILLS[this.settings.skill];
    for (const e of this.enemies) e.dispose(this);
    for (const it of this.items) it.dispose(this);
    for (const p of this.projectiles) p.dispose(this);
    for (const f of this.flashes) this.lights.remove(f.light);
    this.enemies = [];
    this.items = [];
    this.projectiles = [];
    this.flashes = [];
    this.later = [];
    this.boss = null;
    this.gibs.clear();
    this.blasts.clear();
    this.fire.clear();
    this.dust.clear();
    this.level.resetDoors();

    let spawn = { x: 2.5, y: 0, z: 2.5, yaw: 0 }, n = 0;
    const thin = this.skill.thin;
    for (const e of this.level.entities) {
      if (e.type === '@') spawn = { x: e.x, y: e.y, z: e.z, yaw: 0 };
      else if (MONSTERS[e.type]) {
        if (thin && e.type !== 'W' && ++n % thin === 0) continue;
        const m = new Enemy(this, MONSTERS[e.type], e.x, e.y, e.z);
        this.enemies.push(m);
        if (e.type === 'W') this.boss = m;
      } else if (ITEMS[e.type]) this.items.push(new Item(this, e.type, e.x, e.y, e.z));
    }
    if (this.boss) this.boss.yaw = this.def.bossYaw ?? -Math.PI / 2;
    this.player.reset(spawn, this.startLoadout);
    this.arsenal.reset();
    this.stats = { kills: 0, total: this.enemies.length, time: 0, secrets: 0 };
    this.found = new Set();
    this.flowTimer = 0;
    this.lockedMsgT = 0;
    this.deathT = 0;
    this.combatHold = 0;
    this.music.setMode('explore');
    this.spawn = spawn;
    this.level.updateFlow(spawn.x, spawn.z);
    this.automap.reset();
    this.hud.reset();
  }

  action(name) {
    if (this.state === 'loading') return;
    if (name === 'play') this.startLevel(this.progress.unlocked - 1);
    if (name.startsWith('level:')) this.startLevel(parseInt(name.slice(6), 10));
    if (name === 'resume') this.resume();
    if (name === 'restart') {
      this.reset();
      this.start();
    }
    if (name === 'next') {
      this.loadLevel(this.levelIndex + 1, this.progress.loadouts[this.levelIndex + 1] || this.loadout());
      this.start();
    }
    if (name === 'newgame') {
      this.loadLevel(0);
      this.start();
    }
  }

  // Start a level from the title screen, carrying in its saved loadout. The
  // level behind the title is respawned rather than rebuilt, so the chosen
  // difficulty applies.
  startLevel(index) {
    if (index >= this.progress.unlocked) return;
    const loadout = this.progress.loadouts[index] || null;
    if (index !== this.levelIndex) this.loadLevel(index, loadout);
    else {
      this.startLoadout = loadout;
      this.reset();
    }
    this.start();
  }

  start() {
    this.sound.init();
    this.sound.resume();
    this.music.start();
    this.state = 'playing';
    this.hud.showScreen(null);
    this.input.lock();
    this.wake();
    if (this.stats.time === 0) {
      this.hud.message(`Level ${this.levelIndex + 1}: ${this.def.name}`);
      this.hud.message(this.def.hint);
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
    this.wake();
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
    this.music.setMode('explore');
    this.sound.play('exit');
    this.quietSoon();
    this.input.unlock();
    const next = this.levelIndex + 1;
    if (next < LEVELS.length) {
      this.progress.unlocked = Math.max(this.progress.unlocked, next + 1);
      this.progress.loadouts[next] = this.loadout();
      this.saveProgress();
      this.hud.buildLevels(LEVELS, this.progress.unlocked);
    }
    this.hud.showWin(this.statsText(), this.def.name, next < LEVELS.length ? LEVELS[next].name : null);
  }

  // Suspend the sound a few seconds into the death or win screen, so an idle
  // menu costs nothing; start() resumes it.
  quietSoon() {
    clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      if (this.state === 'dead' || this.state === 'won') this.sound.suspend();
    }, QUIET_MS);
  }

  // Run fn after `delay` seconds of game time. Pending calls stop while the
  // game is paused and are dropped when the level resets.
  after(delay, fn) {
    this.later.push({ t: delay, fn });
  }

  statsText() {
    const s = this.stats;
    return `Difficulty <b>${this.skill.label}</b><br>Time <b>${fmtTime(s.time)}</b><br>Kills <b>${s.kills} / ${s.total}</b>`
      + (this.level.secrets ? `<br>Secrets <b>${s.secrets} / ${this.level.secrets}</b>` : '');
  }

  // ------------------------------------------------------------ main loop

  // Restart the loop after a menu stopped it. Input only restarts the title
  // flythrough; the frozen screens redraw one frame when `redraw` is set.
  wake(redraw = false) {
    this.lastInput = performance.now();
    if (this.state === 'loading' || this.running || (!redraw && FROZEN.has(this.state))) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  frame = (now) => {
    const menu = this.state !== 'playing' && this.state !== 'dying';
    const hold = FROZEN.has(this.state) || (menu && now - this.lastInput > IDLE_MS);
    if (hold) this.running = false;
    else requestAnimationFrame(this.frame);
    if (menu && !hold && now - this.last < 1000 / MENU_FPS - 2) return;
    const dt = Math.min(.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    if (!menu) this.update(dt);
    else if (this.state === 'title') this.attract(dt);
    else this.input.consumeLook();
    this.render();
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
    this.checkSecrets();
    for (const e of this.enemies) e.update(dt, this);
    this.projectiles = this.projectiles.filter((pr) => pr.update(dt, this));
    for (const it of this.items) it.update(dt);
    this.checkPickups();
    this.updateMusic(dt);
    this.automap.update(dt);
    this.arsenal.update(dt, this.input, look);
    this.input.endFrame();
    this.updateEffects(dt);
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      l.t -= dt;
      if (l.t > 0) continue;
      this.later.splice(i, 1);
      l.fn();
    }

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
        this.quietSoon();
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
    // Embers drifting up from nearby lava, bubbles off the slime.
    this.emberAcc += dt * 70;
    const cam = this.cam;
    while (this.emberAcc > 1 && this.hazardCells.length) {
      this.emberAcc--;
      const c = this.hazardCells[(Math.random() * this.hazardCells.length) | 0];
      if (Math.abs(c.x - cam.x) + Math.abs(c.z - cam.z) > 26) continue;
      const [r, g, b] = HAZARD[c.slime ? 'slime' : 'lava'].ember;
      this.fire.spawn(c.x + Math.random(), c.floor + .1, c.z + Math.random(),
        (Math.random() - .5) * .4, .6 + Math.random() * 1.2, (Math.random() - .5) * .4,
        2 + Math.random() * 2.5, .07, .02, r, g, b, 1, -.1, .3);
    }
    this.fire.update(dt);
    this.dust.update(dt);
    this.gibs.update(dt);
    this.blasts.update(dt);
  }

  // The title screen: drift slowly through the first level.
  attract(dt) {
    this.input.consumeLook();
    const t = this.time * .12, a = this.def.attract, cam = this.cam;
    if (a) {
      cam.x = a.from[0] + Math.sin(t) * 3;
      cam.y = a.from[1] + Math.sin(t * .7) * .3;
      cam.z = a.from[2] + Math.cos(t * .8) * 1.2;
      const tx = a.to[0] + Math.sin(t * .5) * 2.5 - cam.x, ty = a.to[1] - cam.y, tz = a.to[2] - cam.z;
      cam.yaw = Math.atan2(-tx, -tz);
      cam.pitch = Math.atan2(ty, Math.hypot(tx, tz));
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.anim += dt;
      e.idleAnim();
    }
    for (const it of this.items) it.update(dt);
    this.updateEffects(dt);
  }

  render() {
    const R = this.renderer, cam = this.cam, playing = this.state !== 'title';
    if (playing) this.player.applyCamera(cam);
    R.updateLightmap(this.time);
    R.setDynamicLights(this.lights.active(cam, this.time));
    R.begin(cam, this.time, !playing);
    R.drawWorld();
    for (const pr of this.props) pr.draw(R);
    for (const it of this.items) it.draw(R);
    for (const e of this.enemies) this.drawEnemy(e);
    for (const pr of this.projectiles) {
      const art = pr.big ? this.ballArt.big : this.ballArt.small;
      R.drawSprite(art[((pr.age * 14) | 0) % art.length], pr.pos.x, pr.pos.y, pr.pos.z);
    }
    this.gibs.draw(R);
    this.blasts.draw(R);
    this.dust.draw(R);
    this.fire.draw(R);
    if (playing) {
      const L = R.light(cam.x, cam.y, cam.z);
      this.arsenal.draw(R, [L[0], L[1], L[2]]);
      this.hud.draw(R);
    }
    R.present();
    const listener = this.sound.listener;
    listener.x = cam.x;
    listener.z = cam.z;
    listener.yaw = cam.yaw;
    this.automap.draw();
  }

  // A monster's picture for the angle it is seen from; burning skulls get
  // their flames drawn just behind them.
  drawEnemy(e) {
    if (e.gone) return;
    const R = this.renderer, cam = this.cam;
    const rel = Math.atan2(cam.x - e.pos.x, cam.z - e.pos.z) - e.yaw;
    const { sprite, flip } = monsterSprite(e.type, e.show.anim, e.show.frame, rel);
    const x = e.pos.x + e.jitter.x, y = e.pos.y + e.jitter.y, z = e.pos.z;
    R.drawSprite(sprite, x, y, z, flip, e.flash > 0 ? .6 : 0);
    if (e.def.fly && !e.dead) {
      const vx = x - cam.x, vz = z - cam.z, l = Math.hypot(vx, vz) || 1;
      const art = this.flameArt[((this.time * 12 + e.seed) | 0) % this.flameArt.length];
      R.drawSprite(art, x + vx / l * .14, y + .12, z + vz / l * .14);
    }
  }

  // Explore music by default; combat while awake monsters are near (held for a
  // few seconds after the last one); the boss theme once the Warlord is up.
  updateMusic(dt) {
    const p = this.player;
    let hunting = false, boss = false;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'idle') continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (e === this.boss) boss = boss || d < 32;
      else if (d < 28) hunting = true;
    }
    this.combatHold = hunting ? 5 : Math.max(0, this.combatHold - dt);
    this.music.setMode(p.dead ? 'explore' : boss ? 'boss' : this.combatHold > 0 ? 'combat' : 'explore');
  }

  // ------------------------------------------------------------ world

  updateDoors(dt) {
    const p = this.player;
    this.lockedMsgT -= dt;
    for (const d of this.level.doors) {
      if (d.target > 0 || p.dead) continue;
      if (d.type === 'secret') {
        // Secret walls slide open after half a second of walking straight into
        // them (within about 30°, so running along a wall doesn't open them).
        const vx = clamp(p.pos.x, d.minX, d.maxX) - p.pos.x, vz = clamp(p.pos.z, d.minZ, d.maxZ) - p.pos.z, dist = Math.hypot(vx, vz);
        const pushing = dist < p.radius + .1 && p.wishX * vx + p.wishZ * vz > .85 * dist;
        d.push = pushing ? d.push + dt : 0;
        if (d.push >= .5) d.target = d.height;
        continue;
      }
      const dx = Math.max(d.minX - p.pos.x, 0, p.pos.x - d.maxX);
      const dz = Math.max(d.minZ - p.pos.z, 0, p.pos.z - d.maxZ);
      if (Math.hypot(dx, dz) > 1.6) continue;
      if (['red', 'blue', 'yellow'].includes(d.type) && !p.keys.has(d.type)) {
        this.locked(d, `You need the ${d.type} keycard`);
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

  // Stepping into a secret area for the first time counts it.
  checkSecrets() {
    const p = this.player, area = this.level.at(p.pos.x, p.pos.z).secretArea ?? -1;
    if (area < 0 || p.dead || this.found.has(area)) return;
    this.found.add(area);
    this.stats.secrets++;
    this.hud.message('You found a secret area!');
    this.sound.play('secret');
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
        p.ammo[d.ammo] = Math.min(MAX[d.ammo], p.ammo[d.ammo] + d.amount * this.skill.ammo);
        break;
      case 'weapon': {
        const had = p.owned[d.weapon];
        if (had && p.ammo[d.ammo] >= MAX[d.ammo]) return false;
        p.owned[d.weapon] = true;
        p.ammo[d.ammo] = Math.min(MAX[d.ammo], p.ammo[d.ammo] + d.amount * this.skill.ammo);
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

  // Hitscan along the crosshair: pellets spread around it, hit the nearest
  // monster or wall.
  fireWeapon(w) {
    const p = this.player, origin = p.eye(), fwd = p.aim();
    const right = new Vec3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const up = new Vec3(right.y * fwd.z - right.z * fwd.y, right.z * fwd.x - right.x * fwd.z, right.x * fwd.y - right.y * fwd.x);
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
    this.projectiles.push(new Projectile(this, origin, dir, speed * this.skill.missile, damage, owner, big));
  }

  onEnemyDeath(e) {
    this.stats.kills++;
    if (e === this.boss) {
      for (let i = 0; i < 5; i++) {
        const p = e.pos.clone().add(new Vec3((Math.random() - .5) * 3, 1 + Math.random() * 4, (Math.random() - .5) * 3));
        this.after(i * .18, () => this.explosion(p, true, false));
      }
      for (const d of this.level.doors) if (d.type === 'boss') d.target = d.height;
      this.hud.message('The Warlord is dead. The exit is open.');
      this.player.shake = .5;
    }
  }

  // ------------------------------------------------------------ effects

  flash(pos, color, peak, range, len) {
    const light = this.lights.add({ pos: pos.clone(), color, intensity: peak, range });
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
    this.blasts.add(pos, big);
    for (let i = 0; i < n; i++) {
      const v = new Vec3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar(f * (.3 + Math.random()));
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
  const fail = (err) => {
    console.error(err);
    const b = document.querySelector('[data-action="play"]');
    b.textContent = 'Failed to start';
    document.querySelector('#screen-title .tag').textContent = 'Something went wrong while loading. Reload the page to try again.';
  };
  try {
    window.game = new Game();
    window.game.init().catch(fail);
  } catch (err) {
    fail(err);
  }
}

boot();
