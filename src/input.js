// Keyboard, mouse and pointer lock.

const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

export class Input {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.keys = new Set();
    this.fire = false;
    this.jumpPressed = false;
    this.mx = 0;
    this.my = 0;

    addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpPressed = true;
      if (e.code === 'Tab') game.automap.open = true;
      const slot = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (slot >= 0) game.arsenal.select(slot);
      if (e.code === 'KeyQ') game.arsenal.cycle(-1);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab') game.automap.open = false;
    });
    addEventListener('blur', () => this.clear());

    addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.fire = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mx += Math.max(-300, Math.min(300, e.movementX || 0));
      this.my += Math.max(-300, Math.min(300, e.movementY || 0));
    });
    addEventListener('wheel', (e) => {
      if (!this.locked || !e.deltaY) return;
      game.arsenal.cycle(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) this.clear();
      game.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => game.onLockChange(false));
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  lock() {
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => this.game.onLockChange(false));
    } catch {
      this.game.onLockChange(false);
    }
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  axis(name) {
    return BINDINGS[name].some((k) => this.keys.has(k)) ? 1 : 0;
  }

  consumeLook() {
    const look = { x: this.mx, y: this.my };
    this.mx = this.my = 0;
    return look;
  }

  endFrame() {
    this.jumpPressed = false;
  }

  clear() {
    this.keys.clear();
    this.fire = false;
    this.jumpPressed = false;
    this.mx = this.my = 0;
    if (this.game.automap) this.game.automap.open = false;
  }
}
