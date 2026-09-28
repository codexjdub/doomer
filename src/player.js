// The player: movement with step-up and gravity, health and armor, and the
// camera (bob, shake, recoil, death fall).
import * as THREE from 'three';
import { MAX } from './items.js';

const STEP = .55;

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = .38;
    this.height = 1.75;
  }

  reset(spawn) {
    this.pos.set(spawn.x, spawn.y, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.yaw ?? 0;
    this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.ammo = { bullets: 50, shells: 0 };
    this.owned = [true, false, false];
    this.keys = new Set();
    this.dead = false;
    this.grounded = true;
    this.eyeHeight = 1.62;
    this.stepOffset = 0;
    this.bobPhase = 0;
    this.hurtFlash = 0;
    this.shake = 0;
    this.kick = 0;
    this.roll = 0;
    this.lavaTimer = 0;
    this.hurtSoundT = 0;
    this.inLava = false;
  }

  eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight - this.stepOffset, this.pos.z);
  }

  hurt(amount, from, g) {
    if (this.dead || g.state !== 'playing') return;
    const saved = Math.min(this.armor, Math.floor(amount / 3));
    this.armor -= saved;
    this.health -= amount - saved;
    this.hurtFlash = Math.min(1, this.hurtFlash + amount / 30);
    this.shake = Math.max(this.shake, Math.min(.35, amount / 60));
    if (this.hurtSoundT <= 0) {
      g.sound.play('hurt');
      this.hurtSoundT = .25;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      g.sound.play('playerDeath');
      g.onPlayerDeath();
    }
  }

  heal(amount) {
    if (this.health >= MAX.health) return false;
    this.health = Math.min(MAX.health, this.health + amount);
    return true;
  }

  update(dt, input, look, g) {
    const L = g.level;
    this.hurtSoundT -= dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.2);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.kick = Math.max(0, this.kick - dt * .3 - this.kick * dt * 8);
    this.stepOffset *= Math.exp(-dt * 14);

    if (this.dead) {
      this.eyeHeight = Math.max(.35, this.eyeHeight - dt * 2.2);
      this.roll = Math.min(.5, this.roll + dt * .8);
      this.vel.x *= .9;
      this.vel.z *= .9;
    } else {
      this.yaw -= look.x * look.sens * .0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * look.sens * .0022, -1.45, 1.45);
    }

    // Walk direction relative to where we're looking.
    const f = this.dead ? 0 : input.axis('forward') - input.axis('back');
    const s = this.dead ? 0 : input.axis('right') - input.axis('left');
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const speed = 7.6, accel = this.grounded ? 11 : 2.2;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;

    if (input.jumpPressed && this.grounded && !this.dead) {
      this.vel.y = 5.4;
      this.grounded = false;
      g.sound.play('jump');
    }

    // Horizontal movement, one axis at a time so we slide along walls.
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / .15));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      const nx = this.pos.x + this.vel.x * sdt;
      if (L.fits(nx, this.pos.z, this.radius, this.pos.y, STEP, this.height)) this.pos.x = nx; else this.vel.x = 0;
      const nz = this.pos.z + this.vel.z * sdt;
      if (L.fits(this.pos.x, nz, this.radius, this.pos.y, STEP, this.height)) this.pos.z = nz; else this.vel.z = 0;
    }

    // Don't walk through monsters.
    for (const e of g.enemies) {
      if (e.dead || Math.abs(e.pos.y - this.pos.y) > e.def.height) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, d = Math.hypot(dx, dz), min = this.radius + e.def.radius;
      if (d < min && d > 1e-4) {
        const px = e.pos.x + dx / d * min, pz = e.pos.z + dz / d * min;
        if (L.fits(px, pz, this.radius, this.pos.y, STEP, this.height)) {
          this.pos.x = px;
          this.pos.z = pz;
        }
      }
    }

    // Vertical: gravity, landing, stepping up and down stairs smoothly.
    const span = L.span(this.pos.x, this.pos.z, this.radius);
    const wasGrounded = this.grounded;
    if (this.grounded && this.pos.y > span.floor && this.pos.y - span.floor < STEP + .05 && this.vel.y <= 0) {
      this.stepOffset -= this.pos.y - span.floor;
      this.pos.y = span.floor;
    }
    this.vel.y -= 18 * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= span.floor) {
      if (!wasGrounded && this.vel.y < -6) {
        g.sound.play('land');
        this.shake = Math.max(this.shake, Math.min(.2, -this.vel.y / 60));
      }
      if (wasGrounded && span.floor > this.pos.y + .01) this.stepOffset += span.floor - this.pos.y;
      this.pos.y = span.floor;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (this.pos.y + this.height > span.ceil) {
      this.pos.y = span.ceil - this.height;
      this.vel.y = Math.min(0, this.vel.y);
    }
    this.stepOffset = THREE.MathUtils.clamp(this.stepOffset, -1, 1);

    // Lava burns.
    const cell = L.at(this.pos.x, this.pos.z);
    this.inLava = cell.lava && this.pos.y <= cell.floor + .05 && !this.dead;
    if (this.inLava) {
      this.lavaTimer -= dt;
      if (this.lavaTimer <= 0) {
        this.lavaTimer = .45;
        this.hurt(9, null, g);
      }
    } else {
      this.lavaTimer = 0;
    }

    const moving = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded) this.bobPhase += dt * moving * 1.45;
  }

  applyCamera(camera, t) {
    const eye = this.eye();
    const speed = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 7.6) * (this.grounded ? 1 : 0);
    eye.y += Math.sin(this.bobPhase * 2) * .035 * speed;
    const sh = this.shake * this.shake;
    eye.x += (Math.random() - .5) * sh * .6;
    eye.y += (Math.random() - .5) * sh * .6;
    eye.z += (Math.random() - .5) * sh * .6;
    camera.position.copy(eye);
    camera.rotation.set(this.pitch + this.kick, this.yaw, Math.sin(this.bobPhase) * .006 * speed + this.roll, 'YXZ');
  }
}
