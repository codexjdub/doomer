// The five levels. Each is drawn as filled rectangles on a grid of 1 m cells;
// characters are cell presets (level.js PRESETS plus the level's own) or
// entities (see ENTITY_CHARS in level.js). Coordinates are (x, z), with z
// growing "south" down the grid.
import { room, sky } from './level.js';

function grid(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('#'));
  return {
    fill(x0, z0, x1, z1, ch) {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch;
    },
    set(x, z, ch) {
      g[z][x] = ch;
    },
    put(points, ch) {
      for (const [x, z] of points) {
        if ('#MTP&$Nn'.includes(g[z][x])) throw new Error(`Entity ${ch} at ${x},${z} is inside a wall`);
        g[z][x] = ch;
      }
    },
    rows: () => g.map((row) => row.join('')),
  };
}

const HELL_SKY = 0xff5a30;
const skyLava = room(-.6, 12, 'lava', null, 'stone', { sky: true, lava: true });

export const LEVELS = [
  // ---------------------------------------------------------------- 1
  {
    name: 'Hangar',
    hint: 'Find the red keycard. Kill everything.',
    theme: { fog: 0x0a0504, density: .028, hemi: [0x606880, 0x281810, .45], lamp: 0xffe0b8 },
    lights: [[30, 9, 10, HELL_SKY, 220, 24], [41, 9, 10, HELL_SKY, 220, 24], [35, 9, 19, HELL_SKY, 220, 24]],
    attract: { from: [11.5, 3.1, 21.5], to: [11.5, 2.6, 6] },
    bossYaw: -Math.PI / 2,
    build() {
      const m = grid(72, 46);
      // Start room, with a doorway north into the first corridor.
      m.fill(4, 32, 18, 44, 'M');
      m.fill(5, 33, 17, 43, '.');
      m.fill(5, 32, 9, 32, 'T');
      m.fill(13, 32, 17, 32, 'T');
      for (const [x, z] of [[5, 43], [6, 43], [5, 42], [17, 34], [16, 34], [17, 35]]) m.set(x, z, 'N');
      // Corridor with a door, up to the lava hall.
      m.fill(9, 26, 9, 31, 'M');
      m.fill(13, 26, 13, 31, 'M');
      m.fill(10, 25, 12, 32, ',');
      m.fill(10, 29, 12, 29, 'D');
      // Lava hall: floor, a lava channel with a bridge, stairs up to a platform.
      m.fill(2, 4, 20, 24, 'o');
      m.fill(2, 4, 20, 11, 'p');
      [...'dcba'].forEach((ch, i) => m.fill(8, 8 + i, 14, 8 + i, ch));
      m.fill(4, 14, 5, 15, '#');
      m.fill(17, 14, 18, 15, '#');
      m.fill(2, 17, 20, 19, '~');
      m.fill(10, 17, 12, 19, '=');
      // Upper corridor from the platform to the courtyard walkway.
      m.fill(21, 5, 25, 7, 'q');
      // Courtyard under open sky: raised walkways, stairs, the keycard pedestal.
      m.fill(26, 4, 45, 23, ':');
      m.fill(26, 4, 45, 7, ';');
      m.fill(42, 8, 45, 23, ';');
      [...'hgf'].forEach((ch, i) => m.fill(33, 8 + i, 35, 8 + i, ch));
      [...'hgf'].forEach((ch, i) => m.fill(41 - i, 20, 41 - i, 22, ch));
      m.fill(31, 14, 35, 18, 'f');
      m.fill(32, 15, 34, 17, 'g');
      m.fill(28, 19, 29, 20, '#');
      m.fill(38, 12, 39, 13, '#');
      m.fill(33, 24, 35, 24, 'R');
      m.fill(33, 25, 35, 28, ',');
      // Tech room with crates for cover.
      m.fill(26, 28, 42, 41, 'T');
      m.fill(27, 29, 41, 40, '_');
      m.fill(33, 28, 35, 28, ',');
      m.fill(28, 30, 29, 31, 'n');
      m.fill(39, 38, 40, 39, 'n');
      m.set(30, 38, 'n');
      m.set(38, 30, 'n');
      m.fill(31, 34, 32, 34, 'n');
      m.fill(36, 34, 37, 34, 'n');
      m.fill(42, 33, 42, 35, 'D');
      m.fill(43, 33, 48, 35, ',');
      // Boss arena: lava pits in the corners, pillars, a raised dais.
      m.fill(49, 27, 63, 43, 'x');
      for (const [x, z] of [[49, 27], [61, 27], [49, 41], [61, 41]]) m.fill(x, z, x + 2, z + 2, '*');
      for (const [x, z] of [[53, 30], [58, 30], [53, 39], [58, 39]]) m.fill(x, z, x + 1, z + 1, '#');
      m.fill(54, 33, 58, 37, 'r');
      m.fill(64, 33, 64, 35, 'B');
      // Exit room.
      m.fill(65, 31, 70, 39, 'M');
      m.fill(65, 32, 69, 38, 'E');

      m.put([[11, 41]], '@');
      m.put([[8, 36], [14, 36], [8, 40], [14, 40], [11, 27], [6, 21], [16, 21], [11, 14], [11, 6],
        [31, 31], [37, 31], [31, 37], [37, 37], [67, 33], [67, 37]], 'L');
      m.put([[3, 16], [19, 16], [31, 10], [37, 10], [52, 33], [60, 33], [52, 37], [60, 37]], 'F');
      m.put([[4, 6], [18, 6], [15, 13], [7, 22], [44, 12], [44, 18], [40, 5], [30, 32], [38, 32], [40, 35], [51, 32], [61, 38]], 'I');
      m.put([[30, 17], [37, 17], [33, 20], [29, 37]], 'Z');
      m.put([[56, 35]], 'W');
      m.put([[6, 35], [28, 39], [56, 28]], 'U');
      m.put([[3, 5], [44, 22], [62, 35]], 'S');
      m.put([[16, 38], [19, 22], [27, 22]], '+');
      m.put([[50, 31], [50, 39]], 'H');
      m.put([[27, 5], [40, 30]], 'A');
      m.put([[11, 5]], 'G');
      m.put([[34, 38]], 'C');
      m.put([[33, 16]], 'K');
      m.put([[68, 35]], 'X');
      return m.rows();
    },
  },

  // ---------------------------------------------------------------- 2
  {
    name: 'Toxin Refinery',
    hint: 'Find the blue keycard. Stay out of the slime.',
    theme: { fog: 0x040806, density: .03, hemi: [0x506a58, 0x0e180e, .45], lamp: 0xf0ffe8 },
    presets: {
      'v': room(0, 7, 'grate', 'ceiling', 'pipes'),
      's': room(-.6, 7, 'slime', 'ceiling', 'pipes', { lava: true, slime: true }),
      'e': room(2, 7, 'grate', 'ceiling', 'panel'),
      'a': room(.4, 7, 'metalFloor', 'ceiling', 'panel'),
      'b': room(.8, 7, 'metalFloor', 'ceiling', 'panel'),
      'c': room(1.2, 7, 'metalFloor', 'ceiling', 'panel'),
      'd': room(1.6, 7, 'metalFloor', 'ceiling', 'panel'),
      'u': room(0, 5, 'metalFloor', 'ceiling', 'panel'),
      'm': room(2.4, 5, 'metalFloor', 'ceiling', 'tech'),
      'i': room(.4, 5, 'metalFloor', 'ceiling', 'panel'),
      'j': room(.8, 5, 'metalFloor', 'ceiling', 'panel'),
      'k': room(1.2, 5, 'metalFloor', 'ceiling', 'panel'),
      't': room(1.6, 5, 'metalFloor', 'ceiling', 'panel'),
      'z': room(0, 4, 'metalFloor', 'ceiling', 'tech'),
    },
    build() {
      const m = grid(56, 46);
      // Loading bay and the corridor north.
      m.fill(3, 34, 17, 45, 'M');
      m.fill(4, 35, 16, 44, '.');
      m.fill(8, 29, 8, 33, 'M');
      m.fill(12, 29, 12, 33, 'M');
      m.fill(9, 28, 11, 34, ',');
      m.fill(9, 31, 11, 31, 'D');
      // Vat hall: grated floor between slime pits, a catwalk along the north wall.
      m.fill(1, 7, 31, 28, 'P');
      m.fill(2, 8, 30, 27, 'v');
      m.fill(9, 28, 11, 28, ',');
      m.fill(2, 8, 30, 9, 'e');
      [...'dcba'].forEach((ch, i) => m.fill(2, 10 + i, 3, 10 + i, ch));
      for (const [x, z] of [[6, 12], [15, 12], [24, 12], [6, 20], [15, 20], [24, 20]]) m.fill(x, z, x + (x === 24 ? 4 : 5), z + 4, 's');
      m.fill(31, 18, 31, 20, 'D');
      m.fill(32, 18, 35, 20, ',');
      // Pump room: machinery blocks and a raised platform holding the key.
      m.fill(35, 13, 53, 31, 'T');
      m.fill(36, 14, 52, 30, 'u');
      m.fill(35, 18, 35, 20, ',');
      m.fill(39, 17, 41, 19, 'm');
      m.fill(39, 25, 41, 27, 'm');
      m.fill(46, 25, 48, 27, 'm');
      m.fill(46, 15, 48, 16, 'm');
      m.fill(49, 19, 52, 23, 't');
      m.fill(46, 20, 46, 22, 'i');
      m.fill(47, 20, 47, 22, 'j');
      m.fill(48, 20, 48, 22, 'k');
      // Blue door north to the control room and the exit.
      m.fill(43, 13, 45, 13, '[');
      m.fill(37, 1, 51, 10, 'T');
      m.fill(38, 2, 50, 9, 'z');
      m.fill(43, 10, 45, 12, ',');

      m.put([[10, 42]], '@');
      m.put([[7, 38], [13, 38], [8, 18], [18, 18], [26, 25], [16, 10], [38, 22], [44, 22], [50, 28], [43, 16], [41, 5], [47, 5]], 'L');
      m.put([[8, 8], [20, 9], [28, 9], [13, 11], [22, 19], [38, 23], [51, 26], [39, 8], [49, 3]], 'I');
      m.put([[26, 18], [44, 28], [50, 16]], 'Z');
      m.put([[5, 36], [4, 26], [49, 8]], 'U');
      m.put([[15, 36], [13, 18], [39, 3]], '+');
      m.put([[14, 9], [44, 17]], 'S');
      m.put([[29, 8]], 'A');
      m.put([[22, 26]], 'G');
      m.put([[37, 29]], 'H');
      m.put([[51, 29]], 'C');
      m.put([[51, 21]], 'J');
      m.put([[44, 4]], 'X');
      return m.rows();
    },
  },

  // ---------------------------------------------------------------- 3
  {
    name: 'Containment Breach',
    hint: 'Get the yellow keycard from containment. Something got loose in there.',
    theme: { fog: 0x0a0303, density: .032, hemi: [0x604848, 0x200808, .4], lamp: 0xff5a40 },
    lights: [[50, 0, 30, 0xff2020, 30, 11]],
    presets: {
      'l': room(0, 4, 'metalFloor', 'ceiling', 'panel'),
      'z': room(0, 4, 'blood', 'ceiling', 'flesh'),
      'y': room(1.2, 4, 'crate', 'ceiling', 'crate'),
      'u': room(0, 7, 'metalFloor', 'stone', 'panel'),
      'k': room(-1.5, 7, 'blood', 'stone', 'flesh'),
      'e': room(-1.2, 7, 'blood', 'stone', 'flesh'),
      'i': room(-.8, 7, 'blood', 'stone', 'flesh'),
      'j': room(-.4, 7, 'blood', 'stone', 'flesh'),
      'w': room(-1.1, 7, 'stone', 'stone', 'bone'),
      't': room(0, 6, 'metalFloor', 'ceiling', 'panel'),
      's': room(-.6, 6, 'slime', 'ceiling', 'pipes', { lava: true, slime: true }),
    },
    build() {
      const m = grid(60, 44);
      // Security checkpoint.
      m.fill(1, 33, 13, 43, 'M');
      m.fill(2, 34, 12, 42, '.');
      for (const [x, z] of [[3, 35], [4, 35], [3, 36]]) m.set(x, z, 'N');
      m.fill(13, 36, 13, 38, 'D');
      // Main hallway east.
      m.fill(14, 35, 41, 39, 'T');
      m.fill(14, 36, 40, 38, 'l');
      // Lab A.
      m.fill(13, 23, 25, 35, 'T');
      m.fill(14, 24, 24, 34, 'l');
      m.fill(18, 35, 20, 35, 'l');
      for (const [x, z] of [[21, 25], [22, 25], [23, 25], [23, 26]]) m.set(x, z, 'y');
      // Lab B, overrun and bloody.
      m.fill(27, 23, 39, 35, 'T');
      m.fill(27, 23, 39, 23, '&');
      m.fill(28, 24, 38, 34, 'z');
      m.fill(32, 35, 34, 35, 'z');
      // Flesh growing through the hallway walls.
      m.fill(26, 35, 29, 35, '&');
      m.fill(18, 39, 22, 39, '&');
      m.fill(35, 39, 40, 39, '&');
      // Containment chamber: a sunken blood pit with the key on an altar.
      m.fill(41, 19, 59, 41, '&');
      m.fill(42, 20, 58, 40, 'u');
      m.fill(41, 36, 41, 38, 'u');
      m.fill(46, 24, 54, 36, 'k');
      m.fill(49, 36, 51, 36, 'j');
      m.fill(49, 35, 51, 35, 'i');
      m.fill(49, 34, 51, 34, 'e');
      m.fill(49, 29, 51, 31, 'w');
      // Yellow door north to the reactor room and the exit.
      m.fill(48, 19, 50, 19, ']');
      m.fill(42, 2, 58, 15, 'T');
      m.fill(43, 3, 57, 14, 't');
      m.fill(48, 15, 50, 18, ',');
      m.fill(47, 6, 53, 11, 's');
      m.fill(49, 8, 51, 9, 'T');

      m.put([[7, 40]], '@');
      m.put([[17, 28], [22, 28], [30, 29], [36, 29], [44, 30], [56, 30], [50, 21], [45, 8], [55, 8], [7, 37]], 'L');
      m.put([[16, 26], [22, 31], [37, 32], [43, 21], [57, 38], [44, 12], [56, 12]], 'I');
      m.put([[33, 27], [55, 5]], 'Z');
      m.put([[44, 22], [56, 22], [44, 39], [56, 39], [47, 27], [53, 27], [47, 33], [53, 33], [50, 4], [54, 13]], 'O');
      m.put([[15, 33], [57, 30]], 'U');
      m.put([[24, 34], [57, 21], [44, 13]], 'S');
      m.put([[29, 25], [56, 13]], 'H');
      m.put([[37, 25]], 'A');
      m.put([[43, 30], [11, 41]], '+');
      m.put([[50, 30]], 'V');
      m.put([[45, 4]], 'X');
      return m.rows();
    },
  },

  // ---------------------------------------------------------------- 4
  {
    name: "Hell's Gate",
    hint: 'Find the red keycard. The gate is north, across the lava.',
    theme: { fog: 0x140604, density: .022, hemi: [0x804038, 0x301008, .55], lamp: 0xffb080 },
    lights: [[16, 10, 22, HELL_SKY, 260, 26], [32, 10, 31, HELL_SKY, 260, 26], [48, 10, 22, HELL_SKY, 260, 26], [32, 10, 19, HELL_SKY, 260, 26]],
    presets: {
      'v': skyLava,
      'w': sky(0, 'stone', 'bone'),
      'e': sky(1.2, 'rock', 'stone'),
      'u': room(0, 5, 'rock', 'rock', 'flesh'),
      'z': room(0, 9, 'blood', 'bone', 'bone'),
    },
    build() {
      const m = grid(64, 48);
      // A broken outpost at the edge of hell.
      m.fill(25, 39, 39, 47, 'M');
      m.fill(26, 40, 38, 46, '.');
      m.fill(31, 39, 33, 39, 'D');
      // The hellscape: open sky, a lava river with two bridges, raised rock shelves.
      m.fill(1, 15, 62, 38, '$');
      m.fill(2, 16, 61, 38, ':');
      m.fill(2, 24, 61, 26, 'v');
      m.fill(10, 24, 12, 26, 'w');
      m.fill(51, 24, 53, 26, 'w');
      m.fill(20, 30, 26, 34, 'e');
      m.fill(27, 31, 27, 33, 'g');
      m.fill(28, 31, 28, 33, 'f');
      m.fill(38, 29, 44, 33, 'e');
      m.fill(37, 30, 37, 32, 'g');
      m.fill(36, 30, 36, 32, 'f');
      m.fill(6, 19, 7, 20, '#');
      m.fill(56, 33, 57, 34, '#');
      m.fill(30, 19, 31, 20, '#');
      m.fill(46, 18, 47, 19, '#');
      // Flesh cave in the west holding the red key.
      m.fill(2, 27, 14, 37, '&');
      m.fill(3, 28, 13, 36, 'u');
      m.fill(14, 31, 14, 33, 'u');
      // The gate fortress in the north.
      m.fill(18, 1, 46, 15, '$');
      m.fill(19, 2, 45, 14, 'z');
      m.fill(31, 15, 33, 15, 'R');
      for (const [x, z] of [[24, 5], [39, 5], [24, 10], [39, 10]]) m.fill(x, z, x + 1, z + 1, '$');

      m.put([[32, 45]], '@');
      m.put([[28, 42], [36, 42]], 'L');
      m.put([[29, 36], [35, 36], [10, 22], [54, 22], [28, 8], [36, 8], [15, 30]], 'F');
      m.put([[23, 32], [41, 31], [20, 20], [44, 21], [58, 19], [22, 4], [43, 4], [22, 13], [43, 13]], 'I');
      m.put([[32, 28], [50, 34], [8, 30], [8, 34], [32, 9]], 'Z');
      m.put([[15, 20], [35, 22], [55, 29], [11, 29], [11, 35], [28, 4], [36, 4]], 'O');
      m.put([[5, 20], [32, 13]], '+');
      m.put([[58, 36], [20, 8]], 'S');
      m.put([[20, 36], [44, 8]], 'U');
      m.put([[40, 30]], 'A');
      m.put([[4, 35]], 'H');
      m.put([[5, 32]], 'K');
      m.put([[32, 3]], 'X');
      return m.rows();
    },
  },

  // ---------------------------------------------------------------- 5
  {
    name: 'Throne of the Warlord',
    hint: 'This is his throne. End him.',
    theme: { fog: 0x180604, density: .02, hemi: [0x803830, 0x300806, .55], lamp: 0xffa070 },
    lights: [[16, 10, 12, HELL_SKY, 260, 26], [40, 10, 12, HELL_SKY, 260, 26], [16, 10, 26, HELL_SKY, 260, 26], [40, 10, 26, HELL_SKY, 260, 26]],
    bossYaw: 0,
    presets: {
      'u': room(0, 5, 'rock', 'rock', 'bone'),
      'z': room(0, 7, 'blood', 'bone', 'bone'),
      'v': skyLava,
      'w': sky(0, 'stone', 'bone'),
      'e': sky(1.2, 'bone', 'bone'),
      'y': room(0, 4, 'bone', 'bone', 'bone'),
    },
    build() {
      const m = grid(56, 56);
      // The descent tunnel.
      m.fill(23, 45, 33, 55, '$');
      m.fill(24, 46, 32, 54, 'u');
      // Antechamber: last supplies before the throne.
      m.fill(15, 33, 41, 45, '$');
      m.fill(16, 34, 40, 44, 'z');
      m.fill(26, 45, 30, 45, 'u');
      // The throne arena under the burning sky.
      m.fill(3, 5, 53, 33, '$');
      m.fill(27, 33, 29, 33, 'D');
      m.fill(4, 6, 52, 32, ':');
      m.fill(22, 7, 34, 13, 'e');
      m.fill(26, 14, 30, 14, 'g');
      m.fill(26, 15, 30, 15, 'f');
      m.fill(18, 17, 38, 18, 'v');
      m.fill(26, 17, 30, 18, 'w');
      for (const [x, z] of [[8, 9], [42, 9], [8, 22], [42, 22]]) m.fill(x, z, x + 6, z + 5, 'v');
      for (const [x, z] of [[18, 21], [37, 21], [18, 28], [37, 28]]) m.fill(x, z, x + 1, z + 1, '$');
      // Sealed exit behind the throne.
      m.fill(23, 0, 33, 5, '$');
      m.fill(24, 1, 32, 4, 'y');
      m.fill(27, 5, 29, 5, 'B');

      m.put([[28, 52]], '@');
      m.put([[18, 36], [38, 36], [18, 42], [38, 42], [21, 15], [35, 15], [6, 7], [50, 7], [26, 50], [30, 50]], 'F');
      m.put([[26, 2], [30, 2]], 'L');
      m.put([[20, 35], [36, 35], [6, 30], [50, 30], [22, 24], [34, 24]], 'I');
      m.put([[10, 19], [46, 19]], 'Z');
      m.put([[24, 38], [32, 38], [12, 6], [44, 6], [20, 31], [36, 31], [28, 26], [6, 17]], 'O');
      m.put([[28, 10]], 'W');
      m.put([[17, 43], [39, 43], [5, 7], [51, 7]], 'H');
      m.put([[28, 35]], 'A');
      m.put([[20, 39], [36, 39], [5, 31], [51, 31]], 'S');
      m.put([[28, 44], [16, 31], [40, 31]], 'U');
      m.put([[28, 40]], 'C');
      m.put([[28, 2]], 'X');
      return m.rows();
    },
  },
];
