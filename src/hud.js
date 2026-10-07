// HUD, menus and settings. The status bar, crosshair and screen flashes are
// drawn into the game's pixels; messages, the boss bar and menus are DOM.
import { WEAPONS } from './weapons.js';
import { StatusBar } from './statusbar.js';

const $ = (sel) => document.querySelector(sel);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('#hud'),
      messages: $('#messages'),
      boss: $('#boss'),
      bossFill: $('.boss-fill'),
    };
    this.bar = new StatusBar();
    this.screens = {
      title: $('#screen-title'),
      pause: $('#screen-pause'),
      dead: $('#screen-dead'),
      win: $('#screen-win'),
    };
    this.flashLevel = 0;
    this.hitT = 0;
    this.last = {};

    document.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => game.action(b.dataset.action));
    });
    document.querySelectorAll('.settings').forEach((c) => this.buildSettings(c));

    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
      $('#screen-title .tag').textContent = 'Doomer needs a keyboard and mouse. Open it on a computer to play.';
    }
  }

  loading(fraction) {
    $('[data-action="play"]').textContent = `Loading… ${Math.round(fraction * 100)}%`;
  }

  ready() {
    const b = $('[data-action="play"]');
    b.disabled = false;
    b.textContent = 'Click to play';
  }

  // Level select on the title screen; locked levels are shown but disabled.
  buildLevels(levels, unlocked) {
    const box = $('#screen-title .levels');
    box.innerHTML = '';
    levels.forEach((level, i) => {
      const b = document.createElement('button');
      b.className = 'level';
      b.disabled = i >= unlocked;
      b.title = i >= unlocked ? 'Locked' : `Play ${level.name}`;
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;
      const name = document.createElement('span');
      name.textContent = i >= unlocked ? 'Locked' : level.name;
      b.append(num, name);
      b.addEventListener('click', () => this.game.action(`level:${i}`));
      box.appendChild(b);
    });
    const play = $('[data-action="play"]');
    if (!play.disabled) play.textContent = unlocked > 1 ? `Continue: ${levels[unlocked - 1].name}` : 'Click to play';
  }

  showWin(stats, name, next) {
    const w = this.screens.win;
    w.querySelector('[data-win-title]').textContent = next ? 'Level complete' : 'You beat Doomer';
    w.querySelector('[data-win-level]').textContent = next ? name : 'All five levels cleared. Hell is quiet, for now.';
    const nextButton = w.querySelector('[data-next]');
    nextButton.hidden = !next;
    if (next) nextButton.textContent = `Next: ${next}`;
    w.querySelector('[data-newgame]').hidden = !!next;
    this.showScreen('win', stats);
  }

  buildSettings(container) {
    container.innerHTML = `
      <label>Pixel size
        <select data-set="pixels">
          <option value="1">Chunky</option>
          <option value="2">Fine</option>
        </select>
      </label>
      <label>Mouse sensitivity <input type="range" min="0.2" max="3" step="0.05" data-set="sensitivity"></label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" data-set="volume"></label>
      <label>Music <input type="range" min="0" max="1" step="0.05" data-set="music"></label>
      <label>Minimap <input type="checkbox" data-set="minimap"></label>`;
    container.querySelectorAll('[data-set]').forEach((input) => {
      const key = input.dataset.set, box = input.type === 'checkbox';
      if (box) input.checked = !!this.game.settings[key]; else input.value = this.game.settings[key];
      input.addEventListener(input.tagName === 'SELECT' || box ? 'change' : 'input', () => {
        const v = box ? input.checked : input.tagName === 'SELECT' && input.dataset.set !== 'pixels' ? input.value : parseFloat(input.value);
        this.game.setSetting(key, v);
        document.querySelectorAll(`[data-set="${key}"]`).forEach((o) => {
          if (o === input) return;
          if (box) o.checked = v; else o.value = v;
        });
      });
    });
  }

  showScreen(name, stats) {
    for (const [k, s] of Object.entries(this.screens)) s.hidden = k !== name;
    this.el.hud.hidden = name === 'title';
    if (stats && this.screens[name]) {
      const p = this.screens[name].querySelector('[data-stats]');
      if (p) p.innerHTML = stats;
    }
  }

  reset() {
    this.el.messages.innerHTML = '';
    this.flashLevel = 0;
    this.last = {};
  }

  message(text, warn = false) {
    const d = document.createElement('div');
    d.textContent = text;
    if (warn) d.className = 'warn';
    this.el.messages.appendChild(d);
    while (this.el.messages.children.length > 4) this.el.messages.firstChild.remove();
    setTimeout(() => d.remove(), 3300);
  }

  hit() {
    this.hitT = .12;
  }

  pickupFlash() {
    this.flashLevel = .6;
  }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  update(dt) {
    const g = this.game, boss = g.boss;
    const showBoss = boss && !boss.dead && boss.state !== 'idle';
    this.set('bossShow', !!showBoss, (v) => { this.el.boss.hidden = !v; });
    if (showBoss) this.set('bossHp', Math.max(0, boss.hp), (v) => { this.el.bossFill.style.width = `${(v / boss.def.hp) * 100}%`; });
    this.hitT = Math.max(0, this.hitT - dt);
    this.flashLevel = Math.max(0, this.flashLevel - dt * 2.5);
  }

  // Pain washes the view red and pickups flash it gold, like Doom's palette
  // shifts; then the crosshair and the status bar.
  draw(R) {
    const g = this.game, p = g.player, a = g.arsenal, w = WEAPONS[a.pending >= 0 ? a.pending : a.current];
    const low = p.health <= 25 && !p.dead ? .1 + Math.sin(g.time * 6) * .05 : 0;
    R.tint(190, 8, 0, Math.min(.7, Math.max(p.hurtFlash * .55, low, p.inLava ? .3 : 0, p.dead ? .45 : 0)));
    R.tint(255, 225, 110, this.flashLevel * .4);
    if (!p.dead) R.crosshair(this.hitT > 0);
    this.bar.draw(R, {
      ammo: p.ammo[w.ammo], health: Math.ceil(p.health), armor: p.armor,
      owned: p.owned, current: a.pending >= 0 ? a.pending : a.current, keys: p.keys, time: g.time,
    });
  }
}
