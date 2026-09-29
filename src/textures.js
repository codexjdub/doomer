// Procedural textures and materials. Everything is painted onto canvases at
// startup, so the game ships without a single image file.
import * as THREE from 'three';

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

// Derive a tangent-space normal map from the brightness of an albedo canvas.
function normalMap(src, strength) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255;
  return makeCanvas(w, (x) => {
    const img = x.createImageData(w, h), o = img.data;
    const L = (i, j) => lum[((j + h) % h) * w + ((i + w) % w)];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const dx = (L(i + 1, j) - L(i - 1, j)) * strength;
        const dy = (L(i, j + 1) - L(i, j - 1)) * strength;
        const len = Math.hypot(dx, dy, 1), p = (j * w + i) * 4;
        o[p] = (-dx / len * .5 + .5) * 255;
        o[p + 1] = (dy / len * .5 + .5) * 255;
        o[p + 2] = (1 / len * .5 + .5) * 255;
        o[p + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }, h);
}

export function texture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

export function paintGlow(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.5)') {
  return makeCanvas(64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner);
    g.addColorStop(.3, mid);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  });
}

function paintHole() {
  return makeCanvas(64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(.25, 'rgba(8,6,5,.95)');
    g.addColorStop(.45, 'rgba(30,20,15,.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  });
}

function paintSmoke() {
  return makeCanvas(64, (x) => {
    for (let i = 0; i < 14; i++) {
      const px = 20 + rand() * 24, py = 20 + rand() * 24, r = 10 + rand() * 14;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
    }
  });
}

// ---------------------------------------------------------------- materials

function surface(albedo, strength, opts = {}, scale = 2) {
  const m = new THREE.MeshStandardMaterial({
    map: texture(albedo),
    normalMap: texture(normalMap(albedo, strength), false),
    roughness: .8,
    metalness: 0,
    ...opts,
  });
  m.userData.scale = scale;
  return m;
}

export function createMaterials() {
  const [techA, techE] = paintTech();
  const [ceilA, ceilE] = paintCeiling();
  const lavaTex = texture(paintLava());
  const door = (stripe, glow, skull) => {
    const [a, e] = paintDoor(stripe, glow, skull);
    return new THREE.MeshStandardMaterial({
      map: texture(a),
      normalMap: texture(normalMap(a, 4), false),
      emissiveMap: texture(e),
      emissive: 0xffffff,
      emissiveIntensity: 2.5,
      roughness: .45,
      metalness: .5,
    });
  };

  const lava = new THREE.MeshBasicMaterial({ map: lavaTex, color: new THREE.Color(2.4, 2.4, 2.4) });
  lava.userData.scale = 3;
  const slimeTex = texture(paintSlime());
  const slime = new THREE.MeshBasicMaterial({ map: slimeTex, color: new THREE.Color(1.8, 2.2, 1.8) });
  slime.userData.scale = 3;

  const materials = {
    stone: surface(paintStone(), 5, { roughness: .92 }),
    metalFloor: surface(paintMetalFloor(), 4, { roughness: .5, metalness: .45 }),
    panel: surface(paintPanel(), 4, { roughness: .45, metalness: .55 }),
    tech: surface(techA, 4, {
      roughness: .4,
      metalness: .55,
      emissiveMap: texture(techE),
      emissive: 0xffffff,
      emissiveIntensity: 3,
    }),
    ceiling: surface(ceilA, 3, {
      roughness: .6,
      metalness: .4,
      emissiveMap: texture(ceilE),
      emissive: 0xffffff,
      emissiveIntensity: 1.2,
    }, 4),
    rock: surface(paintRock(), 6, { roughness: .95 }, 4),
    crate: surface(paintCrate(), 4, { roughness: .75 }, 1),
    grate: surface(paintGrate(), 5, { roughness: .45, metalness: .6 }, 1),
    lava,
    slime,
    pipes: surface(paintPipes(), 5, { roughness: .42, metalness: .6 }),
    flesh: surface(paintFlesh(), 6, { roughness: .32 }),
    bone: surface(paintBone(), 6, { roughness: .6 }),
    blood: surface(paintBlood(), 3, { roughness: .22 }),
    doorPlain: door('#d8a020', '#c8d0d8', false),
    doorRed: door('#c81e14', '#ff2a18', false),
    doorBlue: door('#1e4ad8', '#3a8aff', false),
    doorYellow: door('#e0a818', '#ffd040', false),
    doorBoss: door('#6a0a06', '#ff3010', true),
  };

  return {
    materials,
    lavaTex,
    slimeTex,
    glow: texture(paintGlow()),
    softGlow: texture(paintGlow('rgba(255,255,255,.9)', 'rgba(255,255,255,.25)')),
    hole: texture(paintHole()),
    smoke: texture(paintSmoke()),
  };
}

// ---------------------------------------------------------------- sky

export function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec2 uv = d.xz / (d.y + 0.3) * 1.4;
        float c = fbm(uv + vec2(time * 0.015, time * 0.008));
        float c2 = fbm(uv * 2.3 - vec2(time * 0.025, 0.0));
        vec3 low = vec3(0.7, 0.14, 0.03), high = vec3(0.06, 0.008, 0.01);
        vec3 col = mix(low, high, pow(h, 0.55));
        col += vec3(1.2, 0.35, 0.06) * smoothstep(0.5, 0.95, c) * (1.0 - h * 0.5);
        col *= 0.55 + 0.7 * c2;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
