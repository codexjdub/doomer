// A level: a grid of 1 m cells (laid out in levels.js). Each character is
// either a cell preset (walls, floors at different heights, lava, doors) or
// an entity that stands on the floor of a neighbouring cell.
import { Vec3 } from './vec.js';

// Cell presets. floor/ceil are heights in metres. ftex/ctex/side name the
// materials for the floor, ceiling and the step faces this cell exposes to
// lower neighbours.
const room = (floor, ceil, ftex, ctex, side, extra = {}) => ({ floor, ceil, ftex, ctex, side, ...extra });
const sky = (floor, ftex, side = 'stone') => room(floor, 12, ftex, null, side, { sky: true });
// A secret wall: a door wearing the texture of the wall it sits in, which
// slides up when pushed. The rooms behind are marked `secret`.
const secret = (wall, floor = 0) => room(floor, floor + 3.2, 'metalFloor', 'ceiling', 'panel', { door: 'secret', wall });
const hidden = (floor = 0) => room(floor, floor + 3.2, 'metalFloor', 'ceiling', 'stone', { secret: true });

export const PRESETS = {
  '#': { solid: true, wall: 'stone' },
  'M': { solid: true, wall: 'panel' },
  'T': { solid: true, wall: 'tech' },
  'P': { solid: true, wall: 'pipes' },
  '&': { solid: true, wall: 'flesh' },
  '$': { solid: true, wall: 'bone' },
  // Start room and exit room
  '.': room(0, 4.5, 'metalFloor', 'ceiling', 'panel'),
  'N': room(1.2, 4.5, 'crate', 'ceiling', 'crate'),
  'E': room(0, 4, 'metalFloor', 'ceiling', 'panel'),
  // Corridors
  ',': room(0, 3.2, 'grate', 'ceiling', 'panel'),
  'q': room(2, 5.2, 'grate', 'ceiling', 'panel'),
  // Lava hall
  'o': room(0, 8, 'metalFloor', 'stone', 'stone'),
  'p': room(2, 8, 'metalFloor', 'stone', 'stone'),
  'a': room(.4, 8, 'metalFloor', 'stone', 'panel'),
  'b': room(.8, 8, 'metalFloor', 'stone', 'panel'),
  'c': room(1.2, 8, 'metalFloor', 'stone', 'panel'),
  'd': room(1.6, 8, 'metalFloor', 'stone', 'panel'),
  '~': room(-.6, 8, 'lava', 'stone', 'stone', { lava: true }),
  '=': room(0, 8, 'grate', 'stone', 'panel'),
  // Courtyard (open sky)
  ':': sky(0, 'rock'),
  ';': sky(1.6, 'metalFloor'),
  'f': sky(.4, 'stone'),
  'g': sky(.8, 'stone'),
  'h': sky(1.2, 'stone'),
  // Tech room
  '_': room(0, 5, 'metalFloor', 'ceiling', 'panel'),
  'n': room(1.2, 5, 'crate', 'ceiling', 'crate'),
  // Arena
  'x': room(0, 9, 'metalFloor', 'stone', 'stone'),
  '*': room(-.6, 9, 'lava', 'stone', 'stone', { lava: true }),
  'r': room(.4, 9, 'metalFloor', 'stone', 'panel'),
  // Doors: plain, red keycard, and the one that opens when the boss dies
  'D': room(0, 3.2, 'grate', 'ceiling', 'panel', { door: 'plain' }),
  'R': room(0, 3.2, 'grate', 'ceiling', 'panel', { door: 'red' }),
  'B': room(0, 3.2, 'grate', 'ceiling', 'panel', { door: 'boss' }),
  '[': room(0, 3.2, 'grate', 'ceiling', 'panel', { door: 'blue' }),
  ']': room(0, 3.2, 'grate', 'ceiling', 'panel', { door: 'yellow' }),
  // Secret walls in M, #, P, & and $ walls, and the floor of a secret area
  '%': secret('panel'),
  '^': secret('stone'),
  '|': secret('pipes'),
  '{': secret('flesh'),
  '}': secret('bone'),
  '!': hidden(),
};

// Helpers for level-specific presets in levels.js.
export { room, sky, secret, hidden };

// @ player start   I imp   Z brute   O burning skull   W warlord (boss)
// + health  H medkit  A armor  S shells  U bullets  G shotgun  C chaingun
// K red keycard  J blue keycard  V yellow keycard  L ceiling lamp  F torch  X exit
export const ENTITY_CHARS = '@IZOW+HASUGCKJVLFX';

const OUTSIDE = { solid: true, wall: 'stone', floor: 0, ceil: 0 };
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export class Level {
  constructor(rows, extraPresets = {}) {
    const presets = { ...PRESETS, ...extraPresets };
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.cells = [];
    this.entities = [];
    this.doors = [];

    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        let ch = rows[z][x] ?? '#';
        if (ENTITY_CHARS.includes(ch)) {
          this.entities.push({ type: ch, x: x + .5, z: z + .5 });
          ch = inheritPreset(rows, x, z, presets);
        }
        const p = presets[ch] || presets['#'];
        this.cells.push({
          x, z, ch,
          solid: !!p.solid,
          wall: p.wall,
          floor: p.floor ?? 0,
          ceil: p.ceil ?? 0,
          ftex: p.ftex,
          ctex: p.ctex,
          side: p.side || 'panel',
          sky: !!p.sky,
          lava: !!p.lava,
          slime: !!p.slime,
          secret: !!p.secret,
          secretArea: -1,
          doorType: p.door || null,
          door: null,
        });
      }
    }
    for (const e of this.entities) e.y = this.at(e.x, e.z).floor;
    this.groupDoors();
    this.groupSecrets();
    this.dist = new Float32Array(this.w * this.h).fill(Infinity);
    this.queue = new Int32Array(this.w * this.h);
  }

  groupDoors() {
    for (const c of this.cells) {
      if (!c.doorType || c.door) continue;
      const door = { type: c.doorType, cells: [], pos: 0, target: 0, floor: c.floor, ceil: c.ceil };
      const stack = [c];
      c.door = door;
      while (stack.length) {
        const d = stack.pop();
        door.cells.push(d);
        for (const [dx, dz] of DIRS) {
          const n = this.cell(d.x + dx, d.z + dz);
          if (n.doorType === c.doorType && !n.door) {
            n.door = door;
            stack.push(n);
          }
        }
      }
      door.minX = Math.min(...door.cells.map((d) => d.x));
      door.maxX = Math.max(...door.cells.map((d) => d.x)) + 1;
      door.minZ = Math.min(...door.cells.map((d) => d.z));
      door.maxZ = Math.max(...door.cells.map((d) => d.z)) + 1;
      door.cx = (door.minX + door.maxX) / 2;
      door.cz = (door.minZ + door.maxZ) / 2;
      door.height = door.ceil - door.floor;
      this.doors.push(door);
    }
  }

  // Each connected patch of secret cells is one secret area; `secrets` is how
  // many there are.
  groupSecrets() {
    this.secrets = 0;
    for (const c of this.cells) {
      if (!c.secret || c.secretArea >= 0) continue;
      const area = this.secrets++, stack = [c];
      c.secretArea = area;
      while (stack.length) {
        const d = stack.pop();
        for (const [dx, dz] of DIRS) {
          const n = this.cell(d.x + dx, d.z + dz);
          if (n.secret && n.secretArea < 0) {
            n.secretArea = area;
            stack.push(n);
          }
        }
      }
    }
  }

  cell(x, z) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return OUTSIDE;
    return this.cells[z * this.w + x];
  }

  at(px, pz) {
    return this.cell(Math.floor(px), Math.floor(pz));
  }

  // Visit the four edges of cell (x, z) with the neighbour across each one.
  // Endpoints run a→b so a wall built along them faces into this cell.
  forEachEdge(x, z, fn) {
    fn(this.cell(x - 1, z), x, z + 1, x, z);
    fn(this.cell(x + 1, z), x + 1, z, x + 1, z + 1);
    fn(this.cell(x, z - 1), x, z, x + 1, z);
    fn(this.cell(x, z + 1), x + 1, z + 1, x, z + 1);
  }

  blocked(c) {
    return c.solid || (c.door !== null && c.door !== undefined && c.door.pos < Math.min(2.1, c.door.height - .05));
  }

  // ------------------------------------------------------------ doors

  updateDoors(dt, onMoveStart) {
    for (const d of this.doors) {
      if (d.pos === d.target) continue;
      if (!d.moving) {
        d.moving = true;
        onMoveStart?.(d);
      }
      d.pos = Math.min(d.target, d.pos + dt * 2.6);
      if (d.pos === d.target) d.moving = false;
    }
  }

  resetDoors() {
    for (const d of this.doors) {
      d.pos = d.target = d.push = 0;
      d.moving = false;
    }
  }

  // ------------------------------------------------------------ collision

  // Can a vertical cylinder of radius r stand at (px, pz) with its feet at
  // `feet`, given it can climb `step` and needs `height` of headroom?
  fits(px, pz, r, feet, step, height) {
    const x0 = Math.floor(px - r), x1 = Math.floor(px + r);
    const z0 = Math.floor(pz - r), z1 = Math.floor(pz + r);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const c = this.cell(x, z);
        const bad = this.blocked(c) || c.floor > feet + step || c.ceil - Math.max(c.floor, feet) < height;
        if (!bad) continue;
        const nx = Math.max(x, Math.min(px, x + 1)), nz = Math.max(z, Math.min(pz, z + 1));
        if ((px - nx) ** 2 + (pz - nz) ** 2 < r * r) return false;
      }
    }
    return true;
  }

  // Highest floor and lowest ceiling under a cylinder footprint.
  span(px, pz, r) {
    const x0 = Math.floor(px - r), x1 = Math.floor(px + r);
    const z0 = Math.floor(pz - r), z1 = Math.floor(pz + r);
    let floor = -Infinity, ceil = Infinity;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const c = this.cell(x, z);
        if (this.blocked(c)) continue;
        const nx = Math.max(x, Math.min(px, x + 1)), nz = Math.max(z, Math.min(pz, z + 1));
        if ((px - nx) ** 2 + (pz - nz) ** 2 >= r * r) continue;
        floor = Math.max(floor, c.floor);
        ceil = Math.min(ceil, c.ceil);
      }
    }
    if (floor === -Infinity) {
      const c = this.at(px, pz);
      return { floor: c.floor, ceil: c.ceil };
    }
    return { floor, ceil };
  }

  // Is point p inside open space?
  open(x, y, z) {
    const c = this.at(x, z);
    return !this.blocked(c) && y >= c.floor && y <= c.ceil;
  }

  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz), steps = Math.ceil(len / .25);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.open(a.x + dx * t, a.y + dy * t, a.z + dz * t)) return false;
    }
    return true;
  }

  // March a ray through the level. Returns distance, point and surface normal.
  raycast(o, d, maxDist = 80) {
    const step = .08;
    let px = o.x, py = o.y, pz = o.z;
    for (let t = step; t <= maxDist; t += step) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (this.open(x, y, z)) {
        px = x; py = y; pz = z;
        continue;
      }
      // Refine the boundary between the last free point and this one.
      let lo = t - step, hi = t;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (this.open(o.x + d.x * mid, o.y + d.y * mid, o.z + d.z * mid)) lo = mid; else hi = mid;
      }
      px = o.x + d.x * lo; py = o.y + d.y * lo; pz = o.z + d.z * lo;
      const hx = o.x + d.x * hi, hy = o.y + d.y * hi, hz = o.z + d.z * hi;
      const normal = new Vec3();
      const cellA = this.at(px, pz), cellB = this.at(hx, hz);
      if (cellA === cellB) {
        normal.set(0, hy < cellA.floor ? 1 : -1, 0);
      } else if (Math.floor(px) !== Math.floor(hx)) {
        normal.set(Math.sign(px - hx), 0, 0);
      } else {
        normal.set(0, 0, Math.sign(pz - hz));
      }
      return { dist: lo, point: new Vec3(px, py, pz), normal };
    }
    return null;
  }

  // ------------------------------------------------------------ pathfinding

  // Breadth-first flood from the player's cell. Monsters walk downhill on
  // this distance field to find their way around walls and up stairs.
  updateFlow(px, pz) {
    const { w, cells, dist, queue } = this;
    dist.fill(Infinity);
    const sx = Math.floor(px), sz = Math.floor(pz);
    if (sx < 0 || sz < 0 || sx >= w || sz >= this.h) return;
    let head = 0, tail = 0;
    const start = sz * w + sx;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++], c = cells[i];
      for (const [dx, dz] of DIRS) {
        const nx = c.x + dx, nz = c.z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
        const j = nz * w + nx;
        if (dist[j] !== Infinity) continue;
        const n = cells[j];
        if (this.blocked(n) || n.lava || n.ceil - n.floor < 2) continue;
        if (c.floor - n.floor > .6) continue;
        dist[j] = dist[i] + 1;
        queue[tail++] = j;
      }
    }
  }

  flowAt(x, z) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return Infinity;
    return this.dist[z * this.w + x];
  }

  // Direction to walk from (px, pz) toward the player, or null if unreachable.
  flowDir(px, pz) {
    const cx = Math.floor(px), cz = Math.floor(pz);
    let best = this.flowAt(cx, cz), bx = 0, bz = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const d = this.flowAt(cx + dx, cz + dz);
        if (d >= best) continue;
        if (dx && dz && (this.flowAt(cx + dx, cz) === Infinity || this.flowAt(cx, cz + dz) === Infinity)) continue;
        best = d;
        bx = dx;
        bz = dz;
      }
    }
    if (!bx && !bz) return null;
    const tx = cx + bx + .5 - px, tz = cz + bz + .5 - pz, l = Math.hypot(tx, tz) || 1;
    return { x: tx / l, z: tz / l };
  }
}

function inheritPreset(rows, x, z, presets) {
  for (const [dx, dz] of DIRS) {
    const c = rows[z + dz]?.[x + dx];
    if (c && presets[c] && !presets[c].solid && !presets[c].door) return c;
  }
  return '.';
}
