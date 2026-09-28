// The level layout, drawn as rectangles onto a 72 × 46 grid of 1 m cells.
// Each character is a cell preset from level.js (walls, floors, lava, doors)
// or an entity (monsters, pickups, lights). Coordinates are (x, z), with z
// growing "south" (down the grid).

const W = 72, H = 46;

export function buildMap() {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  const fill = (x0, z0, x1, z1, ch) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch;
  };
  const put = (points, ch) => {
    for (const [x, z] of points) {
      if ('#MTNn'.includes(g[z][x])) throw new Error(`Entity ${ch} at ${x},${z} is inside a wall`);
      g[z][x] = ch;
    }
  };

  // Start room, with a doorway north into the first corridor.
  fill(4, 32, 18, 44, 'M');
  fill(5, 33, 17, 43, '.');
  fill(5, 32, 9, 32, 'T');
  fill(13, 32, 17, 32, 'T');
  for (const [x, z] of [[5, 43], [6, 43], [5, 42], [17, 34], [16, 34], [17, 35]]) g[z][x] = 'N';

  // Corridor with a door, up to the lava hall.
  fill(9, 26, 9, 31, 'M');
  fill(13, 26, 13, 31, 'M');
  fill(10, 25, 12, 32, ',');
  fill(10, 29, 12, 29, 'D');

  // Lava hall: floor, a lava channel with a bridge, stairs up to a platform.
  fill(2, 4, 20, 24, 'o');
  fill(2, 4, 20, 11, 'p');
  [...'dcba'].forEach((ch, i) => fill(8, 8 + i, 14, 8 + i, ch));
  fill(4, 14, 5, 15, '#');
  fill(17, 14, 18, 15, '#');
  fill(2, 17, 20, 19, '~');
  fill(10, 17, 12, 19, '=');

  // Upper corridor from the platform to the courtyard walkway.
  fill(21, 5, 25, 7, 'q');

  // Courtyard under open sky: raised walkways, stairs, the keycard pedestal.
  fill(26, 4, 45, 23, ':');
  fill(26, 4, 45, 7, ';');
  fill(42, 8, 45, 23, ';');
  [...'hgf'].forEach((ch, i) => fill(33, 8 + i, 35, 8 + i, ch));
  [...'hgf'].forEach((ch, i) => fill(41 - i, 20, 41 - i, 22, ch));
  fill(31, 14, 35, 18, 'f');
  fill(32, 15, 34, 17, 'g');
  fill(28, 19, 29, 20, '#');
  fill(38, 12, 39, 13, '#');
  fill(33, 24, 35, 24, 'R');
  fill(33, 25, 35, 28, ',');

  // Tech room with crates for cover.
  fill(26, 28, 42, 41, 'T');
  fill(27, 29, 41, 40, '_');
  fill(33, 28, 35, 28, ',');
  fill(28, 30, 29, 31, 'n');
  fill(39, 38, 40, 39, 'n');
  g[38][30] = 'n';
  g[30][38] = 'n';
  fill(31, 34, 32, 34, 'n');
  fill(36, 34, 37, 34, 'n');
  fill(42, 33, 42, 35, 'D');
  fill(43, 33, 48, 35, ',');

  // Boss arena: lava pits in the corners, pillars, a raised dais.
  fill(49, 27, 63, 43, 'x');
  for (const [x, z] of [[49, 27], [61, 27], [49, 41], [61, 41]]) fill(x, z, x + 2, z + 2, '*');
  for (const [x, z] of [[53, 30], [58, 30], [53, 39], [58, 39]]) fill(x, z, x + 1, z + 1, '#');
  fill(54, 33, 58, 37, 'r');
  fill(64, 33, 64, 35, 'B');

  // Exit room.
  fill(65, 31, 70, 39, 'M');
  fill(65, 32, 69, 38, 'E');

  put([[11, 41]], '@');
  put([[8, 36], [14, 36], [8, 40], [14, 40], [11, 27], [6, 21], [16, 21], [11, 14], [11, 6],
    [31, 31], [37, 31], [31, 37], [37, 37], [67, 33], [67, 37]], 'L');
  put([[3, 16], [19, 16], [31, 10], [37, 10], [52, 33], [60, 33], [52, 37], [60, 37]], 'F');
  put([[4, 6], [18, 6], [15, 13], [7, 22], [44, 12], [44, 18], [40, 5], [30, 32], [38, 32], [40, 35], [51, 32], [61, 38]], 'I');
  put([[30, 17], [37, 17], [33, 20], [29, 37]], 'Z');
  put([[56, 35]], 'W');
  put([[6, 35], [28, 39], [56, 28]], 'U');
  put([[3, 5], [44, 22], [62, 35]], 'S');
  put([[16, 38], [19, 22], [27, 22]], '+');
  put([[50, 31], [50, 39]], 'H');
  put([[27, 5], [40, 30]], 'A');
  put([[11, 5]], 'G');
  put([[34, 38]], 'C');
  put([[33, 16]], 'K');
  put([[68, 35]], 'X');

  return g.map((row) => row.join(''));
}
