// HUD, menus and settings. Plain DOM on top of the canvas.
import { WEAPONS } from './weapons.js';

const $ = (sel) => document.querySelector(sel);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('#hud'),
      hp: $('#hp'),
      ar: $('#ar'),
      ammo: $('#ammo'),
      ammoType: $('#ammo-type'),
      slots: [...document.querySelectorAll('#slots span')],
      keys: $('#keys'),
      messages: $('#messages'),
      crosshair: $('#crosshair'),
      boss: $('#boss'),
      bossFill: $('.boss-fill'),
      vignette: $('#vignette'),
      flash: $('#flash'),
      health: $('.stat.health'),
    };
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

  ready() {
    const b = $('[data-action="play"]');
    b.disabled = false;
    b.textContent = 'Click to play';
  }

  buildSettings(container) {
    container.innerHTML = `
      <label>Graphics
        <select data-set="quality">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
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
        const v = box ? input.checked : input.tagName === 'SELECT' ? input.value : parseFloat(input.value);
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
    this.el.crosshair.classList.add('hit');
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
    const g = this.game, p = g.player, w = WEAPONS[g.arsenal.pending >= 0 ? g.arsenal.pending : g.arsenal.current];
    this.set('hp', Math.ceil(p.health), (v) => {
      this.el.hp.textContent = v;
      this.el.health.classList.toggle('low', v <= 25);
    });
    this.set('ar', p.armor, (v) => { this.el.ar.textContent = v; });
    const ammo = p.ammo[w.ammo];
    this.set('ammo', ammo, (v) => {
      this.el.ammo.textContent = v;
      this.el.ammo.classList.toggle('empty', v === 0);
    });
    this.set('ammoType', w.ammo, (v) => { this.el.ammoType.textContent = v; });
    const slotKey = p.owned.join() + g.arsenal.current;
    this.set('slots', slotKey, () => {
      this.el.slots.forEach((s, i) => {
        s.classList.toggle('owned', p.owned[i]);
        s.classList.toggle('active', i === g.arsenal.current);
      });
    });
    this.set('keys', [...p.keys].join(), () => {
      this.el.keys.innerHTML = [...p.keys].map(() => '<div class="key"></div>').join('');
    });

    const boss = g.boss;
    const showBoss = boss && !boss.dead && boss.state !== 'idle';
    this.set('bossShow', !!showBoss, (v) => { this.el.boss.hidden = !v; });
    if (showBoss) this.set('bossHp', Math.max(0, boss.hp), (v) => { this.el.bossFill.style.width = `${(v / boss.def.hp) * 100}%`; });

    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.el.crosshair.classList.remove('hit');
    }

    const low = p.health <= 25 && !p.dead ? .25 + Math.sin(g.time * 6) * .1 : 0;
    const lava = p.inLava ? .45 : 0;
    const v = Math.min(1, Math.max(p.hurtFlash * .9, low, lava, p.dead ? .7 : 0));
    this.el.vignette.style.opacity = v.toFixed(3);
    this.flashLevel = Math.max(0, this.flashLevel - dt * 2.5);
    this.el.flash.style.opacity = this.flashLevel.toFixed(3);
  }
}
