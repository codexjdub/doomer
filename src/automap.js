// Automap: remembers which cells the player has seen and draws them
// top-down, as a rotating corner minimap and a full-screen map while Tab is held.
import { ITEMS } from './items.js';

const WALL = '#e0582a';
const STEP = 'rgba(255, 190, 120, .45)';
const LAVA = 'rgba(255, 115, 20, .8)';
const SLIME = 'rgba(90, 230, 60, .75)';
const DOOR = { plain: '#c8d0d8', red: '#ff3020', blue: '#3a78ff', yellow: '#ffc830', boss: '#c060ff' };
const DOOR_LABEL = { plain: 'Door', red: 'Red door', blue: 'Blue door', yellow: 'Yellow door', boss: 'Sealed door' };
const EXIT = '#40ffb0';
const LAYER_RES = 12; // pixels per metre in the cached minimap layer
const MINI_SCALE = 6.5; // CSS pixels per metre on the minimap

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export class Automap {
  constructor(game) {
    this.game = game;
    // Explored cells are painted into this canvas only when they change; the
    // minimap just draws it rotated each frame.
    this.layer = document.createElement('canvas');
    this.hud = document.getElementById('hud');
    this.mini = document.createElement('canvas');
    this.mini.id = 'minimap';
    this.full = document.createElement('canvas');
    this.full.id = 'automap';
    this.full.hidden = true;
    this.hud.append(this.mini, this.full);
    this.open = false;
    this.fullShown = false;
    this.showMini = true;
    this.miniCss = 0;
    this.timer = 0;
    this.dirty = true;
    this.doorKey = '';
    addEventListener('resize', () => { this.miniCss = 0; });
  }

  // Size everything for a new level and work out its floor colours and legend.
  setLevel(L) {
    this.seen = new Uint8Array(L.w * L.h);
    this.style = L.cells.map((c) => {
      if (c.lava) return c.slime ? SLIME : LAVA;
      const k = Math.max(0, Math.min(1, c.floor / 2.4)), b = c.sky ? [58, 26, 20] : [40, 30, 26];
      return `rgba(${b[0] + 50 * k | 0}, ${b[1] + 40 * k | 0}, ${b[2] + 30 * k | 0}, .9)`;
    });
    this.layer.width = L.w * LAYER_RES;
    this.layer.height = L.h * LAYER_RES;
    const doors = new Set(L.doors.map((d) => d.type));
    this.legend = [['You', '#fff2c0'], ['Wall', WALL]];
    for (const type of Object.keys(DOOR)) if (doors.has(type)) this.legend.push([DOOR_LABEL[type], DOOR[type]]);
    if (L.cells.some((c) => c.lava && !c.slime)) this.legend.push(['Lava', LAVA]);
    if (L.cells.some((c) => c.slime)) this.legend.push(['Slime', SLIME]);
    this.legend.push(['Exit', EXIT]);
    this.doorKey = '';
    this.reset();
  }

  reset() {
    this.seen.fill(0);
    this.dirty = true;
    this.timer = 0;
    this.open = false;
  }

  setMini(on) {
    this.showMini = on;
    this.mini.hidden = !on;
    this.miniCss = 0;
  }

  mark(x, z) {
    const L = this.game.level;
    if (x < 0 || z < 0 || x >= L.w || z >= L.h) return;
    const i = z * L.w + x;
    if (!this.seen[i]) {
      this.seen[i] = 1;
      this.dirty = true;
    }
  }

  // Cast rays around the player through the grid. A ray stops at walls, closed
  // doors, and floors or ceilings that block the view at eye height, so raised
  // platforms hide what's on top of them until you climb up.
  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = .12;
    const L = this.game.level, p = this.game.player;
    const px = p.pos.x, pz = p.pos.z, eye = p.pos.y + p.eyeHeight;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.mark(Math.floor(px) + dx, Math.floor(pz) + dz);
    for (let i = 0; i < 240; i++) {
      const a = i / 240 * Math.PI * 2, rx = Math.cos(a), rz = Math.sin(a);
      let x = Math.floor(px), z = Math.floor(pz);
      const sx = rx < 0 ? -1 : 1, sz = rz < 0 ? -1 : 1;
      const ddx = Math.abs(1 / rx), ddz = Math.abs(1 / rz);
      let tx = (rx < 0 ? px - x : x + 1 - px) * ddx, tz = (rz < 0 ? pz - z : z + 1 - pz) * ddz;
      for (let n = 0; n < 80; n++) {
        this.mark(x, z);
        const c = L.cell(x, z);
        if (L.blocked(c) || c.floor > eye - .1 || c.ceil < eye) break;
        if (tx < tz) {
          if (tx > 40) break;
          tx += ddx;
          x += sx;
        } else {
          if (tz > 40) break;
          tz += ddz;
          z += sz;
        }
      }
    }
  }

  draw() {
    const hudVisible = !this.hud.hidden, fullShown = this.open && hudVisible;
    if (fullShown !== this.fullShown) {
      this.fullShown = fullShown;
      this.full.hidden = !fullShown;
      this.mini.style.visibility = fullShown ? 'hidden' : '';
    }
    if (!hudVisible) return;
    if (fullShown) this.drawFull();
    else if (this.showMini) this.drawMini();
  }

  // Match a canvas's backing store to its CSS size; returns the pixel ratio.
  size(canvas, cssW, cssH) {
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cssW * r)), h = Math.max(1, Math.round(cssH * r));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return r;
  }

  refreshLayer() {
    const doors = this.game.level.doors.map((d) => (d.pos < d.height - .2 ? 1 : 0) + (d.target ? 2 : 0)).join('');
    if (!this.dirty && doors === this.doorKey) return;
    this.dirty = false;
    this.doorKey = doors;
    const ctx = this.layer.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.layer.width, this.layer.height);
    ctx.setTransform(LAYER_RES, 0, 0, LAYER_RES, 0, 0);
    this.drawCells(ctx, LAYER_RES);
  }

  drawMini() {
    // Measured once per resize; reading layout every frame forces a reflow.
    if (!this.miniCss) this.miniCss = this.mini.clientWidth;
    const c = this.mini, ctx = c.getContext('2d'), r = this.size(c, this.miniCss, this.miniCss);
    const W = c.width, H = c.height, p = this.game.player, L = this.game.level, s = MINI_SCALE * r;
    this.refreshLayer();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(p.yaw);
    ctx.scale(s, s);
    ctx.translate(-p.pos.x, -p.pos.z);
    ctx.drawImage(this.layer, 0, 0, L.w, L.h);
    const reach = W / s;
    this.drawMarkers(ctx, p.pos.x - reach, p.pos.z - reach, p.pos.x + reach, p.pos.z + reach, s);
    ctx.restore();
    // The player arrow always points up on the minimap.
    ctx.setTransform(1, 0, 0, 1, W / 2, H / 2);
    this.arrow(ctx, 0, 7 * r);
  }

  drawFull() {
    const c = this.full, ctx = c.getContext('2d'), r = this.size(c, innerWidth, innerHeight);
    const W = c.width, H = c.height, L = this.game.level, p = this.game.player;
    const s = Math.max(.5 * r, Math.min((W - 80 * r) / L.w, (H - 140 * r) / L.h));
    const ox = (W - L.w * s) / 2, oz = (H - L.h * s) / 2 - 16 * r;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(ox, oz);
    ctx.scale(s, s);
    this.drawCells(ctx, s);
    this.drawMarkers(ctx, 0, 0, L.w, L.h, s);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, ox + p.pos.x * s, oz + p.pos.z * s);
    this.arrow(ctx, p.yaw, Math.max(8 * r, s * .8));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `700 ${22 * r}px Oswald, Impact, sans-serif`;
    ctx.fillStyle = '#ffb0a0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('MAP', 24 * r, 20 * r);
    ctx.font = `600 ${13 * r}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const y = H - 30 * r, gap = 22 * r;
    const legend = this.legend;
    const widths = legend.map(([label]) => 16 * r + ctx.measureText(label).width);
    let x = (W - widths.reduce((a, b) => a + b, 0) - gap * (legend.length - 1)) / 2;
    legend.forEach(([label, color], i) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 5 * r, 10 * r, 10 * r);
      ctx.fillStyle = 'rgba(243, 236, 230, .8)';
      ctx.fillText(label, x + 16 * r, y);
      x += widths[i] + gap;
    });
  }

  // Paint every explored cell: floors batched by colour, then height steps,
  // walls and closed doors. The context is scaled so one unit is one metre.
  drawCells(ctx, s) {
    const L = this.game.level, seen = this.seen, w = L.w;
    // A secret wall stays a wall on the map until it has been found.
    const wall = (n) => n.solid || (n.door?.secret && !n.door.target);
    const floors = new Map(), walls = new Path2D(), steps = new Path2D();
    const doors = Object.fromEntries(Object.keys(DOOR).map((type) => [type, new Path2D()]));
    let c = null, i = 0;
    const edge = (n, ax, az, bx, bz) => {
      if (wall(n)) {
        walls.moveTo(ax, az);
        walls.lineTo(bx, bz);
        return;
      }
      if (Math.abs(n.floor - c.floor) <= .05) return;
      // Draw each shared edge once: the neighbour draws it if it comes
      // first and has been seen, otherwise this cell does.
      const j = n.z * w + n.x;
      if (j < i && seen[j]) return;
      steps.moveTo(ax, az);
      steps.lineTo(bx, bz);
    };
    for (i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      c = L.cells[i];
      if (wall(c)) continue;
      let floor = floors.get(this.style[i]);
      if (!floor) floors.set(this.style[i], (floor = new Path2D()));
      floor.rect(c.x - .01, c.z - .01, 1.02, 1.02);
      if (c.door && c.door.pos < c.door.height - .2 && doors[c.door.type]) doors[c.door.type].rect(c.x + .1, c.z + .1, .8, .8);
      L.forEachEdge(c.x, c.z, edge);
    }
    for (const [style, path] of floors) {
      ctx.fillStyle = style;
      ctx.fill(path);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2 / s;
    ctx.strokeStyle = STEP;
    ctx.stroke(steps);
    ctx.lineWidth = 2.4 / s;
    ctx.strokeStyle = WALL;
    ctx.stroke(walls);
    for (const [type, path] of Object.entries(doors)) {
      ctx.fillStyle = DOOR[type];
      ctx.fill(path);
    }
  }

  // Pickups and the exit inside the given world rectangle, once seen.
  drawMarkers(ctx, x0, z0, x1, z1, s) {
    const g = this.game, L = g.level, seen = this.seen;
    for (const it of g.items) {
      if (it.pos.x < x0 || it.pos.x > x1 || it.pos.z < z0 || it.pos.z > z1) continue;
      if (!seen[Math.floor(it.pos.z) * L.w + Math.floor(it.pos.x)]) continue;
      ctx.fillStyle = hex(ITEMS[it.type].glow);
      ctx.beginPath();
      ctx.arc(it.pos.x, it.pos.z, it.type === 'K' ? .45 : .28, 0, Math.PI * 2);
      ctx.fill();
    }
    const ex = g.exitPad;
    if (ex && seen[Math.floor(ex.pos.z) * L.w + Math.floor(ex.pos.x)]) {
      ctx.strokeStyle = EXIT;
      ctx.lineWidth = 2.5 / s;
      ctx.beginPath();
      ctx.arc(ex.pos.x, ex.pos.z, .9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Player marker pointing along the view direction.
  arrow(ctx, yaw, size) {
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * .65, size * .75);
    ctx.lineTo(0, size * .35);
    ctx.lineTo(-size * .65, size * .75);
    ctx.closePath();
    ctx.fillStyle = '#fff2c0';
    ctx.shadowColor = 'rgba(0, 0, 0, .8)';
    ctx.shadowBlur = size * .5;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
