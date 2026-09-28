// Automap: remembers which cells the player has seen and draws them
// top-down, as a rotating corner minimap and a full-screen map while Tab is held.
import { ITEMS } from './items.js';

const WALL = '#e0582a';
const STEP = 'rgba(255, 190, 120, .45)';
const DOOR = { plain: '#40c0ff', red: '#ff3020', boss: '#ff3020' };
const LEGEND = [
  ['You', '#fff2c0'],
  ['Wall', WALL],
  ['Door', DOOR.plain],
  ['Red door', DOOR.red],
  ['Lava', '#ff7a1a'],
  ['Exit', '#40ffb0'],
];

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export class Automap {
  constructor(game) {
    this.game = game;
    const L = game.level;
    this.seen = new Uint8Array(L.w * L.h);
    this.mini = document.createElement('canvas');
    this.mini.id = 'minimap';
    this.full = document.createElement('canvas');
    this.full.id = 'automap';
    this.full.hidden = true;
    document.getElementById('hud').append(this.mini, this.full);
    this.open = false;
    this.showMini = true;
    this.timer = 0;
  }

  reset() {
    this.seen.fill(0);
    this.timer = 0;
    this.open = false;
  }

  setMini(on) {
    this.showMini = on;
    this.mini.hidden = !on;
  }

  mark(x, z) {
    const L = this.game.level;
    if (x >= 0 && z >= 0 && x < L.w && z < L.h) this.seen[z * L.w + x] = 1;
  }

  // Cast rays around the player through the grid; everything they reach
  // (and the wall that stops them) counts as seen.
  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = .12;
    const L = this.game.level, p = this.game.player.pos;
    const px = p.x, pz = p.z;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.mark(Math.floor(px) + dx, Math.floor(pz) + dz);
    for (let i = 0; i < 240; i++) {
      const a = i / 240 * Math.PI * 2, rx = Math.cos(a), rz = Math.sin(a);
      let x = Math.floor(px), z = Math.floor(pz);
      const sx = rx < 0 ? -1 : 1, sz = rz < 0 ? -1 : 1;
      const ddx = Math.abs(1 / rx), ddz = Math.abs(1 / rz);
      let tx = (rx < 0 ? px - x : x + 1 - px) * ddx, tz = (rz < 0 ? pz - z : z + 1 - pz) * ddz;
      for (let n = 0; n < 80; n++) {
        this.mark(x, z);
        if (L.blocked(L.cell(x, z))) break;
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

  draw(t) {
    const hudVisible = !document.getElementById('hud').hidden;
    this.full.hidden = !(this.open && hudVisible);
    this.mini.style.visibility = this.open ? 'hidden' : '';
    if (!hudVisible) return;
    if (this.open) this.drawFull(t);
    else if (this.showMini) this.drawMini(t);
  }

  fit(canvas) {
    const r = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * r), h = Math.round(canvas.clientHeight * r);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return r;
  }

  drawMini(t) {
    const c = this.mini, ctx = c.getContext('2d'), r = this.fit(c);
    const W = c.width, H = c.height, p = this.game.player, s = 6.5 * r;
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
    const reach = W / s * .75;
    this.drawWorld(ctx, p.pos.x - reach, p.pos.z - reach, p.pos.x + reach, p.pos.z + reach, s, t);
    ctx.restore();
    // The player arrow always points up on the minimap.
    ctx.setTransform(1, 0, 0, 1, W / 2, H / 2);
    this.arrow(ctx, 0, 7 * r);
  }

  drawFull(t) {
    const c = this.full, ctx = c.getContext('2d'), r = this.fit(c);
    const W = c.width, H = c.height, L = this.game.level, p = this.game.player;
    const s = Math.min((W - 80 * r) / L.w, (H - 140 * r) / L.h);
    const ox = (W - L.w * s) / 2, oz = (H - L.h * s) / 2 - 16 * r;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(ox, oz);
    ctx.scale(s, s);
    this.drawWorld(ctx, 0, 0, L.w, L.h, s, t);
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
    let x = 0;
    const y = H - 30 * r, gap = 26 * r;
    const widths = LEGEND.map(([label]) => 16 * r + ctx.measureText(label).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (LEGEND.length - 1);
    x = (W - total) / 2;
    LEGEND.forEach(([label, color], i) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 5 * r, 10 * r, 10 * r);
      ctx.fillStyle = 'rgba(243, 236, 230, .8)';
      ctx.fillText(label, x + 16 * r, y);
      x += widths[i] + gap;
    });
  }

  // Draw the explored cells inside the given world rectangle. The context is
  // already transformed so one unit is one metre.
  drawWorld(ctx, x0, z0, x1, z1, s, t) {
    const g = this.game, L = g.level, seen = this.seen;
    const cx0 = Math.max(0, Math.floor(x0)), cz0 = Math.max(0, Math.floor(z0));
    const cx1 = Math.min(L.w - 1, Math.ceil(x1)), cz1 = Math.min(L.h - 1, Math.ceil(z1));
    const lavaGlow = .75 + .25 * Math.sin(t * 3);

    for (let z = cz0; z <= cz1; z++) {
      for (let x = cx0; x <= cx1; x++) {
        if (!seen[z * L.w + x]) continue;
        const c = L.cell(x, z);
        if (c.solid) continue;
        if (c.lava) {
          ctx.fillStyle = `rgba(255, ${Math.round(90 + 40 * lavaGlow)}, 20, ${.55 + .3 * lavaGlow})`;
        } else {
          const k = Math.max(0, Math.min(1, c.floor / 2.4));
          const base = c.sky ? [58, 26, 20] : [40, 30, 26];
          ctx.fillStyle = `rgba(${base[0] + 50 * k | 0}, ${base[1] + 40 * k | 0}, ${base[2] + 30 * k | 0}, .9)`;
        }
        ctx.fillRect(x - .01, z - .01, 1.02, 1.02);
      }
    }

    // Walls and height steps as lines along cell edges.
    const walls = new Path2D(), steps = new Path2D();
    const doors = { plain: new Path2D(), red: new Path2D(), boss: new Path2D() };
    for (let z = cz0; z <= cz1; z++) {
      for (let x = cx0; x <= cx1; x++) {
        if (!seen[z * L.w + x]) continue;
        const c = L.cell(x, z);
        if (c.solid) continue;
        if (c.door && c.door.pos < c.door.height - .2) doors[c.door.type].rect(x + .1, z + .1, .8, .8);
        const edges = [[L.cell(x - 1, z), x, z, x, z + 1], [L.cell(x + 1, z), x + 1, z, x + 1, z + 1],
          [L.cell(x, z - 1), x, z, x + 1, z], [L.cell(x, z + 1), x, z + 1, x + 1, z + 1]];
        for (const [n, ax, az, bx, bz] of edges) {
          if (n.solid) {
            walls.moveTo(ax, az);
            walls.lineTo(bx, bz);
          } else if (Math.abs(n.floor - c.floor) > .05 && (n.x > x || n.z > z)) {
            steps.moveTo(ax, az);
            steps.lineTo(bx, bz);
          }
        }
      }
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

    // Pickups and the exit, once their cells have been seen.
    for (const it of g.items) {
      const cx = Math.floor(it.pos.x), cz = Math.floor(it.pos.z);
      if (!seen[cz * L.w + cx] || it.pos.x < x0 - 1 || it.pos.x > x1 + 1 || it.pos.z < z0 - 1 || it.pos.z > z1 + 1) continue;
      ctx.fillStyle = hex(ITEMS[it.type].glow);
      ctx.beginPath();
      ctx.arc(it.pos.x, it.pos.z, it.type === 'K' ? .45 : .28, 0, Math.PI * 2);
      ctx.fill();
    }
    const ex = g.exitPad;
    if (ex && seen[Math.floor(ex.pos.z) * L.w + Math.floor(ex.pos.x)]) {
      ctx.strokeStyle = '#40ffb0';
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
