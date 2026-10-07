// Procedural textures. Everything is painted onto canvases at startup, then
// shrunk to low-resolution pixel art: 32 texels per metre, like the shooters
// of 1993, so the game ships without a single image file.

let seed = 7;
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

export function makeCanvas(w, draw, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function speckle(x, w, h, count, maxAlpha, rgb) {
  for (let i = 0; i < count; i++) {
    x.fillStyle = `rgba(${rgb},${(rand() * maxAlpha).toFixed(3)})`;
    const s = (1 + rand() * 3) | 0;
    x.fillRect((rand() * w) | 0, (rand() * h) | 0, s, s);
  }
}

// Repeat a draw call across the eight neighbouring tiles so shapes that cross
// an edge wrap around and the texture tiles seamlessly.
function tiled(x, w, h, fn) {
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      x.save();
      x.translate(ox, oy);
      fn();
      x.restore();
    }
  }
}

function bevel(x, px, py, w, h, size, light = .12, dark = .4) {
  x.fillStyle = `rgba(255,255,255,${light})`;
  x.fillRect(px, py, w, size);
  x.fillRect(px, py, size, h);
  x.fillStyle = `rgba(0,0,0,${dark})`;
  x.fillRect(px, py + h - size, w, size);
  x.fillRect(px + w - size, py, size, h);
}

// ---------------------------------------------------------------- surfaces

function paintStone() {
  return makeCanvas(256, (x, s) => {
    x.fillStyle = '#120d0a';
    x.fillRect(0, 0, s, s);
    for (let r = 0; r < 8; r++) {
      for (let b = 0; b < 4; b++) {
        const px = b * 64 + (r % 2 ? 32 : 0) + 2, py = r * 32 + 2;
        const col = `hsl(${18 + rand() * 14},${10 + rand() * 12}%,${22 + rand() * 14}%)`;
        tiled(x, s, s, () => {
          x.fillStyle = col;
          x.fillRect(px, py, 60, 28);
          bevel(x, px, py, 60, 28, 3, .1, .35);
        });
      }
    }
    speckle(x, s, s, 5000, .35, '0,0,0');
    speckle(x, s, s, 1800, .12, '255,230,200');
    x.strokeStyle = 'rgba(0,0,0,.55)';
    for (let i = 0; i < 16; i++) {
      x.beginPath();
      let px = rand() * s, py = rand() * s;
      x.moveTo(px, py);
      for (let k = 0; k < 6; k++) {
        px += rand() * 14 - 7;
        py += rand() * 14 - 7;
        x.lineTo(px, py);
      }
      x.stroke();
    }
  });
}

function paintMetalFloor() {
  return makeCanvas(256, (x, s) => {
    x.fillStyle = '#15171a';
    x.fillRect(0, 0, s, s);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const px = c * 64 + 2, py = r * 64 + 2;
        x.fillStyle = `hsl(210,6%,${24 + rand() * 8}%)`;
        x.fillRect(px, py, 60, 60);
        bevel(x, px, py, 60, 60, 2);
        x.fillStyle = 'rgba(255,255,255,.08)';
        for (let i = 0; i < 7; i++) {
          for (let j = 0; j < 7; j++) {
            x.save();
            x.translate(px + 7 + i * 8, py + 7 + j * 8);
            x.rotate((i + j) % 2 ? .6 : -.6);
            x.fillRect(-3, -1, 6, 2);
            x.restore();
          }
        }
        x.fillStyle = '#8a9096';
        for (const [bx, by] of [[5, 5], [53, 5], [5, 53], [53, 53]]) {
          x.beginPath();
          x.arc(px + bx + 1, py + by + 1, 2, 0, 7);
          x.fill();
        }
      }
    }
    speckle(x, s, s, 2500, .3, '0,0,0');
    speckle(x, s, s, 600, .25, '110,50,20');
    x.strokeStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 40; i++) {
      x.beginPath();
      const px = rand() * s, py = rand() * s;
      x.moveTo(px, py);
      x.lineTo(px + rand() * 30 - 15, py + rand() * 6 - 3);
      x.stroke();
    }
  });
}

function paintPanel() {
  return makeCanvas(256, (x, s) => {
    x.fillStyle = '#1c1f22';
    x.fillRect(0, 0, s, s);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const px = c * 128 + 3, py = r * 128 + 3, w = 122;
        x.fillStyle = `hsl(205,6%,${27 + rand() * 6}%)`;
        x.fillRect(px, py, w, w);
        bevel(x, px, py, w, w, 3, .14, .45);
        x.lineWidth = 2;
        x.strokeStyle = 'rgba(0,0,0,.35)';
        x.strokeRect(px + 14, py + 14, w - 28, w - 28);
        x.strokeStyle = 'rgba(255,255,255,.07)';
        x.strokeRect(px + 16, py + 16, w - 28, w - 28);
        if ((r + c) % 2 === 0) {
          for (let i = 0; i < 6; i++) {
            x.fillStyle = '#0d0f11';
            x.fillRect(px + 30, py + 66 + i * 7, w - 60, 3);
            x.fillStyle = 'rgba(255,255,255,.08)';
            x.fillRect(px + 30, py + 69 + i * 7, w - 60, 1);
          }
        }
        x.fillStyle = '#9aa0a6';
        for (const [bx, by] of [[7, 7], [w - 10, 7], [7, w - 10], [w - 10, w - 10]]) {
          x.beginPath();
          x.arc(px + bx + 1.5, py + by + 1.5, 2.5, 0, 7);
          x.fill();
        }
      }
    }
    speckle(x, s, s, 3000, .25, '0,0,0');
    for (let i = 0; i < 30; i++) {
      const gx = rand() * s, gy = rand() * s * .5, len = 30 + rand() * 100;
      const g = x.createLinearGradient(0, gy, 0, gy + len);
      g.addColorStop(0, 'rgba(20,10,5,.3)');
      g.addColorStop(1, 'rgba(20,10,5,0)');
      x.fillStyle = g;
      x.fillRect(gx, gy, 1 + rand() * 3, len);
    }
  });
}

function paintTech() {
  const lights = (x, glowing) => {
    for (let c = 0; c < 2; c++) {
      const px = c * 128 + 4;
      x.fillStyle = glowing ? '#5fd8ff' : '#8fe8ff';
      x.fillRect(px + 57, 28, 6, 200);
      for (let i = 0; i < 4; i++) {
        x.fillStyle = i % 2 ? '#ff3020' : '#30ff60';
        x.fillRect(px + 20, 44 + i * 50, 5, 5);
      }
    }
  };
  const albedo = makeCanvas(256, (x, s) => {
    x.fillStyle = '#101316';
    x.fillRect(0, 0, s, s);
    for (let c = 0; c < 2; c++) {
      const px = c * 128 + 4;
      x.fillStyle = `hsl(210,8%,${15 + rand() * 4}%)`;
      x.fillRect(px, 4, 120, 248);
      bevel(x, px, 4, 120, 248, 3, .1, .5);
      x.fillStyle = '#07090b';
      x.fillRect(px + 53, 24, 14, 208);
      for (let i = 0; i < 4; i++) {
        x.fillStyle = '#07090b';
        x.fillRect(px + 14, 38 + i * 50, 28, 18);
        x.fillStyle = 'rgba(255,255,255,.06)';
        x.fillRect(px + 78, 36 + i * 50, 30, 2);
        x.fillRect(px + 78, 44 + i * 50, 30, 2);
      }
    }
    lights(x, false);
    speckle(x, s, s, 2000, .25, '0,0,0');
  });
  const emissive = makeCanvas(256, (x, s) => {
    x.fillStyle = '#000';
    x.fillRect(0, 0, s, s);
    lights(x, true);
  });
  return [albedo, emissive];
}

function paintCeiling() {
  const lamp = (x) => { x.fillRect(96, 116, 64, 24); };
  const albedo = makeCanvas(256, (x, s) => {
    x.fillStyle = '#16181a';
    x.fillRect(0, 0, s, s);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        x.fillStyle = `hsl(210,5%,${15 + rand() * 5}%)`;
        x.fillRect(c * 64 + 2, r * 64 + 2, 60, 60);
        bevel(x, c * 64 + 2, r * 64 + 2, 60, 60, 2, .08, .4);
      }
    }
    x.fillStyle = '#0a0b0c';
    x.fillRect(90, 110, 76, 36);
    x.fillStyle = '#e8e2d0';
    lamp(x);
    speckle(x, s, s, 1500, .3, '0,0,0');
  });
  const emissive = makeCanvas(256, (x, s) => {
    x.fillStyle = '#000';
    x.fillRect(0, 0, s, s);
    x.fillStyle = '#ffe6c0';
    lamp(x);
  });
  return [albedo, emissive];
}

function paintRock() {
  return makeCanvas(256, (x, s) => {
    x.fillStyle = '#2a211b';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const px = rand() * s, py = rand() * s, r = 5 + rand() * 20, e = .5 + rand() * .5, a = rand() * 3;
      const col = `hsl(${12 + rand() * 18},${14 + rand() * 16}%,${12 + rand() * 15}%)`;
      tiled(x, s, s, () => {
        x.fillStyle = col;
        x.beginPath();
        x.ellipse(px, py, r, r * e, a, 0, 7);
        x.fill();
      });
    }
    x.strokeStyle = 'rgba(0,0,0,.6)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 24; i++) {
      x.beginPath();
      let px = rand() * s, py = rand() * s;
      x.moveTo(px, py);
      for (let k = 0; k < 8; k++) {
        px += rand() * 20 - 10;
        py += rand() * 20 - 10;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    speckle(x, s, s, 4000, .35, '0,0,0');
    speckle(x, s, s, 1200, .15, '255,200,160');
  });
}

function paintCrate() {
  return makeCanvas(128, (x, s) => {
    x.fillStyle = '#4a321c';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = `hsl(28,${34 + rand() * 12}%,${22 + rand() * 8}%)`;
      x.fillRect(12, 12 + i * 26, 104, 24);
      x.strokeStyle = 'rgba(0,0,0,.25)';
      for (let k = 0; k < 5; k++) {
        const gy = 14 + i * 26 + rand() * 20;
        x.beginPath();
        x.moveTo(12, gy);
        x.bezierCurveTo(40, gy + rand() * 4 - 2, 80, gy + rand() * 4 - 2, 116, gy);
        x.stroke();
      }
    }
    x.save();
    x.beginPath();
    x.rect(12, 12, 104, 104);
    x.clip();
    x.strokeStyle = '#3a2412';
    x.lineWidth = 14;
    x.beginPath();
    x.moveTo(6, 6);
    x.lineTo(122, 122);
    x.stroke();
    x.restore();
    x.strokeStyle = '#3c3f44';
    x.lineWidth = 12;
    x.strokeRect(6, 6, 116, 116);
    x.strokeStyle = 'rgba(255,255,255,.12)';
    x.lineWidth = 2;
    x.strokeRect(1, 1, 126, 126);
    x.fillStyle = '#9aa0a6';
    for (const [bx, by] of [[6, 6], [122, 6], [6, 122], [122, 122], [64, 6], [64, 122]]) {
      x.beginPath();
      x.arc(bx, by, 2.5, 0, 7);
      x.fill();
    }
    speckle(x, s, s, 800, .3, '0,0,0');
  });
}

function paintGrate() {
  return makeCanvas(128, (x, s) => {
    x.fillStyle = '#26292c';
    x.fillRect(0, 0, s, s);
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 8; i++) {
        x.fillStyle = '#050606';
        x.fillRect(i * 16 + (j % 2) * 8 + 2, j * 8 + 2, 10, 4);
        x.fillStyle = 'rgba(255,255,255,.1)';
        x.fillRect(i * 16 + (j % 2) * 8 + 2, j * 8 + 6, 10, 1);
      }
    }
    bevel(x, 0, 0, s, s, 3, .1, .5);
    speckle(x, s, s, 900, .3, '0,0,0');
    speckle(x, s, s, 300, .2, '120,60,20');
  });
}

function paintLava() {
  return makeCanvas(128, (x, s) => {
    x.fillStyle = '#b82400';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      const px = rand() * s, py = rand() * s, r = 6 + rand() * 18, hot = rand() > .45;
      tiled(x, s, s, () => {
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, hot ? 'rgba(255,225,110,.95)' : 'rgba(70,6,0,.85)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(px - r, py - r, 2 * r, 2 * r);
      });
    }
  });
}

function paintPipes() {
  return makeCanvas(256, (x, s) => {
    x.fillStyle = '#141618';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = `hsl(210,5%,${10 + rand() * 4}%)`;
      x.fillRect(i * 64 + 1, 0, 62, s);
    }
    for (const [px, w] of [[8, 22], [40, 14], [64, 30], [110, 18], [140, 26], [182, 12], [204, 34], [244, 10]]) {
      const rusty = rand() < .5;
      const g = x.createLinearGradient(px, 0, px + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,.8)');
      g.addColorStop(.35, rusty ? '#7a4a2a' : '#6a747c');
      g.addColorStop(.5, rusty ? '#a0683e' : '#a4aeb6');
      g.addColorStop(1, 'rgba(0,0,0,.85)');
      x.fillStyle = g;
      x.fillRect(px, 0, w, s);
      for (let y = 10 + rand() * 50; y < s - 8; y += 70 + rand() * 50) {
        x.fillStyle = '#26282a';
        x.fillRect(px - 3, y, w + 6, 8);
        x.fillStyle = 'rgba(255,255,255,.14)';
        x.fillRect(px - 3, y, w + 6, 2);
      }
    }
    speckle(x, s, s, 1800, .35, '110,50,20');
    speckle(x, s, s, 2500, .3, '0,0,0');
    for (let i = 0; i < 25; i++) {
      const gx = rand() * s, gy = rand() * s, len = 20 + rand() * 80;
      const g = x.createLinearGradient(0, gy, 0, gy + len);
      g.addColorStop(0, 'rgba(90,40,10,.4)');
      g.addColorStop(1, 'rgba(90,40,10,0)');
      x.fillStyle = g;
      x.fillRect(gx, gy, 2 + rand() * 3, len);
    }
  });
}

function paintSlime() {
  return makeCanvas(128, (x, s) => {
    x.fillStyle = '#1c7a14';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      const px = rand() * s, py = rand() * s, r = 6 + rand() * 18, hot = rand() > .45;
      tiled(x, s, s, () => {
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, hot ? 'rgba(190,255,90,.9)' : 'rgba(6,40,4,.85)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(px - r, py - r, 2 * r, 2 * r);
      });
    }
  });
}

function paintFlesh() {
  return makeCanvas(256, (x, s) => {
    x.fillStyle = '#3a0c0e';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) {
      const px = rand() * s, py = rand() * s, rx = 10 + rand() * 30, ry = 6 + rand() * 18, a = rand() * 3;
      const col = `hsl(${350 + rand() * 20},${45 + rand() * 25}%,${16 + rand() * 18}%)`;
      tiled(x, s, s, () => {
        x.fillStyle = col;
        x.beginPath();
        x.ellipse(px, py, rx, ry, a, 0, 7);
        x.fill();
        x.fillStyle = 'rgba(255,200,200,.08)';
        x.beginPath();
        x.ellipse(px - rx * .2, py - ry * .3, rx * .5, ry * .35, a, 0, 7);
        x.fill();
      });
    }
    x.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
      let px = rand() * s, py = rand() * s;
      const pts = [[px, py]];
      for (let k = 0; k < 5; k++) pts.push([px += rand() * 40 - 20, py += rand() * 40 - 20]);
      const col = rand() < .5 ? 'rgba(40,0,30,.8)' : 'rgba(120,10,30,.7)';
      tiled(x, s, s, () => {
        x.strokeStyle = col;
        x.beginPath();
        x.moveTo(...pts[0]);
        for (const p of pts.slice(1)) x.lineTo(...p);
        x.stroke();
      });
    }
    speckle(x, s, s, 2500, .3, '0,0,0');
    speckle(x, s, s, 800, .15, '255,160,160');
  });
}

function paintBone() {
  return makeCanvas(256, (x, s) => {
    x.fillStyle = '#140e0a';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const px = rand() * s, py = rand() * s, len = 18 + rand() * 30, a = rand() * Math.PI, w = 4 + rand() * 4;
      const col = `hsl(${35 + rand() * 10},${20 + rand() * 15}%,${45 + rand() * 25}%)`;
      tiled(x, s, s, () => {
        x.save();
        x.translate(px, py);
        x.rotate(a);
        x.fillStyle = col;
        x.fillRect(-len / 2, -w / 2, len, w);
        for (const e of [-1, 1]) {
          x.beginPath();
          x.arc(e * len / 2, -w * .45, w * .7, 0, 7);
          x.arc(e * len / 2, w * .45, w * .7, 0, 7);
          x.fill();
        }
        x.restore();
      });
    }
    for (let i = 0; i < 14; i++) {
      const px = rand() * s, py = rand() * s, r = 9 + rand() * 7;
      const col = `hsl(40,${20 + rand() * 10}%,${55 + rand() * 20}%)`;
      tiled(x, s, s, () => {
        x.fillStyle = col;
        x.beginPath();
        x.arc(px, py, r, 0, 7);
        x.fill();
        x.fillRect(px - r * .6, py + r * .5, r * 1.2, r * .7);
        x.fillStyle = '#0a0604';
        x.beginPath();
        x.arc(px - r * .38, py, r * .28, 0, 7);
        x.arc(px + r * .38, py, r * .28, 0, 7);
        x.fill();
      });
    }
    speckle(x, s, s, 3000, .35, '0,0,0');
    speckle(x, s, s, 600, .2, '90,20,10');
  });
}

function paintBlood() {
  return makeCanvas(128, (x, s) => {
    x.fillStyle = '#1e1614';
    x.fillRect(0, 0, s, s);
    speckle(x, s, s, 1500, .4, '0,0,0');
    for (let i = 0; i < 18; i++) {
      const px = rand() * s, py = rand() * s, r = 6 + rand() * 22, e = .5 + rand() * .5, a = rand() * 3;
      const col = `rgba(${70 + rand() * 40 | 0},4,4,.85)`;
      tiled(x, s, s, () => {
        x.fillStyle = col;
        x.beginPath();
        x.ellipse(px, py, r, r * e, a, 0, 7);
        x.fill();
      });
    }
    speckle(x, s, s, 400, .3, '120,10,10');
  });
}

function paintDoor(stripe, glow, skull) {
  const hazard = (x, y0, h) => {
    x.save();
    x.beginPath();
    x.rect(0, y0, 256, h);
    x.clip();
    for (let k = -4; k < 16; k++) {
      x.fillStyle = k % 2 ? '#111' : stripe;
      x.beginPath();
      x.moveTo(k * 24, y0 + h);
      x.lineTo(k * 24 + 24, y0 + h);
      x.lineTo(k * 24 + 24 + h, y0);
      x.lineTo(k * 24 + h, y0);
      x.fill();
    }
    x.restore();
  };
  const glowShapes = (x) => {
    x.fillStyle = glow;
    x.fillRect(100, 92, 56, 14);
    if (skull) {
      x.beginPath();
      x.arc(128, 150, 26, 0, 7);
      x.fill();
      x.fillRect(110, 162, 36, 22);
      x.fillStyle = '#000';
      x.beginPath();
      x.arc(118, 148, 7, 0, 7);
      x.arc(138, 148, 7, 0, 7);
      x.fill();
      x.fillRect(116, 174, 4, 10);
      x.fillRect(126, 174, 4, 10);
      x.fillRect(136, 174, 4, 10);
    }
  };
  const albedo = makeCanvas(256, (x, s) => {
    x.fillStyle = '#34383d';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = `hsl(210,6%,${24 + rand() * 6}%)`;
      x.fillRect(8 + (i % 2) * 124, 48 + ((i / 2) | 0) * 80, 116, 72);
      bevel(x, 8 + (i % 2) * 124, 48 + ((i / 2) | 0) * 80, 116, 72, 3);
    }
    hazard(x, 4, 36);
    hazard(x, 214, 38);
    x.fillStyle = '#0b0c0d';
    x.fillRect(126, 40, 4, 174);
    x.fillStyle = '#0b0c0d';
    x.fillRect(96, 88, 64, 22);
    glowShapes(x);
    speckle(x, s, s, 2500, .3, '0,0,0');
  });
  const emissive = makeCanvas(256, (x, s) => {
    x.fillStyle = '#000';
    x.fillRect(0, 0, s, s);
    glowShapes(x);
  });
  return [albedo, emissive];
}

// ---------------------------------------------------------------- pixel art

// Texels per metre. Textures tile every `size / TEXEL` metres.
export const TEXEL = 32;

const byte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : v | 0);

// Average `factor`×`factor` blocks of a canvas. Exact box filtering keeps the
// tiles seamless, which canvas scaling does not.
function shrink(canvas, size) {
  const n = canvas.width, f = n / size;
  const src = canvas.getContext('2d').getImageData(0, 0, n, n).data, out = new Float32Array(size * size * 3);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const s = (y * n + x) * 4, o = (((y / f) | 0) * size + ((x / f) | 0)) * 3;
      out[o] += src[s];
      out[o + 1] += src[s + 1];
      out[o + 2] += src[s + 2];
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= f * f;
  return out;
}

// A texture is `size`² texels packed as 0xBBGGRR; bit 24 marks a fullbright
// texel that ignores lighting (lamps, glowing trim, lava).
function pixels(albedo, size, { emissive = null, gain = 1, bright = false } = {}) {
  const a = shrink(albedo, size), e = emissive ? shrink(emissive, size) : null;
  const data = new Uint32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    let r = a[i * 3] * gain, g = a[i * 3 + 1] * gain, b = a[i * 3 + 2] * gain, full = bright;
    if (e && e[i * 3] + e[i * 3 + 1] + e[i * 3 + 2] > 160) {
      r = Math.max(r, e[i * 3]);
      g = Math.max(g, e[i * 3 + 1]);
      b = Math.max(b, e[i * 3 + 2]);
      full = true;
    }
    data[i] = (full ? 0x1000000 : 0) | (byte(b) << 16) | (byte(g) << 8) | byte(r);
  }
  return { size, mask: size - 1, data };
}

export function createTextures() {
  const [techA, techE] = paintTech();
  const [ceilA, ceilE] = paintCeiling();
  const door = (stripe, glow, skull) => {
    const [a, e] = paintDoor(stripe, glow, skull);
    return pixels(a, 64, { emissive: e, gain: 1.2 });
  };
  return {
    stone: pixels(paintStone(), 64, { gain: 1.25 }),
    metalFloor: pixels(paintMetalFloor(), 64, { gain: 1.2 }),
    panel: pixels(paintPanel(), 64, { gain: 1.2 }),
    tech: pixels(techA, 64, { emissive: techE, gain: 1.2 }),
    ceiling: pixels(ceilA, 128, { emissive: ceilE, gain: 1.2 }),
    rock: pixels(paintRock(), 128, { gain: 1.3 }),
    crate: pixels(paintCrate(), 32, { gain: 1.2 }),
    grate: pixels(paintGrate(), 32, { gain: 1.25 }),
    lava: pixels(paintLava(), 128, { gain: 1.25, bright: true }),
    slime: pixels(paintSlime(), 128, { gain: 1.15, bright: true }),
    pipes: pixels(paintPipes(), 64, { gain: 1.2 }),
    // Bigger shapes for the organic walls: at 64 texels they turn to noise.
    flesh: pixels(paintFlesh(), 128, { gain: 1.3 }),
    bone: pixels(paintBone(), 128, { gain: 1.1 }),
    blood: pixels(paintBlood(), 64, { gain: 1.3 }),
    doorPlain: door('#d8a020', '#c8d0d8', false),
    doorRed: door('#c81e14', '#ff2a18', false),
    doorBlue: door('#1e4ad8', '#3a8aff', false),
    doorYellow: door('#e0a818', '#ffd040', false),
    doorBoss: door('#6a0a06', '#ff3010', true),
  };
}

// ---------------------------------------------------------------- sky

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2(x, y) {
  let v = 0, a = .5;
  for (let i = 0; i < 5; i++) {
    v += a * noise2(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 3.7;
    a *= .5;
  }
  return v;
}

const smoothstep = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// A burning hell sky wrapped around the horizon. Row 0 is SKY_TOP above the
// horizon and the last row SKY_BOTTOM below it; columns run once around.
export const SKY_TOP = 1.25, SKY_BOTTOM = -.2;

export function createSky() {
  const w = 1024, h = 192, data = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    const el = SKY_TOP + (SKY_BOTTOM - SKY_TOP) * (y / (h - 1)), dy = Math.sin(el), ch = Math.cos(el);
    const up = Math.max(0, dy);
    for (let x = 0; x < w; x++) {
      const az = x / w * Math.PI * 2, dx = Math.sin(az) * ch, dz = Math.cos(az) * ch;
      const k = 1.4 / (Math.max(dy, 0) + .3);
      const c = fbm2(dx * k, dz * k), c2 = fbm2(dx * k * 2.3 + 40, dz * k * 2.3);
      const m = Math.pow(up, .55), cloud = smoothstep(.42, .8, c) * (1 - up * .4), shade = .35 + 1.1 * c2;
      let r = (.7 + (.06 - .7) * m + 1.2 * cloud) * shade;
      let g = (.14 + (.008 - .14) * m + .35 * cloud) * shade;
      let b = (.03 + (.01 - .03) * m + .06 * cloud) * shade;
      // Rough filmic curve and gamma, to match the old tone-mapped sky.
      r = Math.sqrt(r / (1 + r * .45));
      g = Math.sqrt(g / (1 + g * .45));
      b = Math.sqrt(b / (1 + b * .45));
      data[y * w + x] = (byte(b * 255) << 16) | (byte(g * 255) << 8) | byte(r * 255);
    }
  }
  return { w, h, data };
}
