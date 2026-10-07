// Monsters: baked pixel-art sprites (see sprites.js) driven by a small state
// machine (idle → chase → attack / pain → dead). Each frame they report which
// animation and frame to show; the game picks the picture for the angle it
// is seen from.
import { Vec3, lerp, randInt } from './vec.js';

const TYPES = {
  imp: {
    hp: 60, speed: 3.4, radius: .5, height: 2.5, pain: .75, ranged: true,
    melee: [6, 12], reach: 1.4, missile: [9, 16], sight: 'impSight', scale: 1.15,
  },
  brute: {
    hp: 170, speed: 6.6, radius: .75, height: 2.1, pain: .45, ranged: false,
    melee: [14, 26], reach: 1.6, sight: 'bruteSight', scale: 1,
  },
  boss: {
    hp: 1600, speed: 2.8, radius: 1.2, height: 5.4, pain: .06, ranged: true,
    melee: [22, 36], reach: 2.8, missile: [16, 26], sight: 'bossSight', scale: 2.3,
  },
  // Flies at head height, winds up, then charges in a straight line.
  skull: {
    hp: 25, speed: 4.5, radius: .35, height: .7, pain: 1, ranged: false, fly: true,
    melee: [8, 14], reach: .5, sight: 'skullSight', scale: 1,
  },
};

const tmp = new Vec3();
const DEATH_FRAMES = 4, DEATH_TIME = .6;

// ---------------------------------------------------------------- enemy

export class Enemy {
  constructor(game, type, x, y, z) {
    this.type = type;
    this.def = TYPES[type];
    this.hp = this.def.hp;
    this.pos = new Vec3(x, y, z);
    this.vy = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.timer = 0;
    this.cooldown = 0;
    this.anim = Math.random() * 10;
    this.walkPhase = 0;
    this.swing = 0;
    this.flash = 0;
    this.sightTimer = Math.random() * .3;
    this.sees = false;
    this.stuck = 0;
    this.seed = Math.random() * 10;
    this.dead = false;
    this.gone = false;
    this.deadT = 0;
    this.jitter = new Vec3();
    this.show = { anim: 'idle', frame: 0 };
    if (type === 'boss') {
      this.glow = game.lights.add({ pos: new Vec3(), color: 0xff5020, intensity: 30, range: 9, flicker: 1 });
      this.glowHeight = 3.5;
    }
    if (this.def.fly) {
      this.hover = 1.05 + Math.random() * .3;
      this.pos.y += this.hover;
      this.glow = game.lights.add({ pos: new Vec3(), color: 0xff6a20, intensity: 5, range: 4, flicker: 1.5 });
      this.glowHeight = .36;
      this.trailAcc = 0;
    }
  }

  center() {
    return new Vec3(this.pos.x, this.pos.y + this.def.height / 2, this.pos.z);
  }

  eye() {
    return new Vec3(this.pos.x, this.pos.y + this.def.height * .85, this.pos.z);
  }

  wake(g) {
    if (this.state !== 'idle') return;
    this.state = 'chase';
    this.cooldown = .4 + Math.random() * .6;
    g.sound.play(this.def.sight, this.pos);
  }

  update(dt, g) {
    if (this.dead) {
      this.deadT += dt;
      this.show.anim = 'death';
      this.show.frame = Math.min(DEATH_FRAMES - 1, (this.deadT / DEATH_TIME * DEATH_FRAMES) | 0);
      return;
    }
    const p = g.player, T = this.def;
    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.jitter.set(0, 0, 0);
    if (this.glow) this.glow.pos.copy(this.pos).setY(this.pos.y + this.glowHeight);
    if (T.fly) this.trail(dt, g);

    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = .2 + Math.random() * .1;
      const eye = this.eye(), pe = p.eye();
      this.sees = !p.dead && eye.distanceTo(pe) < 42 && g.level.lineOfSight(eye, pe);
    }

    if (this.state === 'idle') {
      this.idleAnim();
      if (this.sees) this.wake(g);
      this.physics(dt, g, 0, 0);
      return;
    }

    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz) || .001;
    const toPlayer = Math.atan2(dx, dz);

    if (this.state === 'pain') {
      this.timer -= dt;
      this.setShow('pain', 0);
      if (this.timer <= 0) this.state = 'chase';
      this.physics(dt, g, 0, 0);
      return;
    }

    if (T.fly) {
      this.flyerUpdate(dt, g, dx, dz, dist);
      return;
    }

    if (this.state === 'attack') {
      this.timer -= dt;
      this.turnTo(toPlayer, dt, 9);
      this.attackPose();
      if (!this.fired && this.timer <= this.fireAt) {
        this.fired = true;
        if (this.kind === 'melee') this.strike(g, dist); else this.shoot(g);
      }
      if (this.timer <= 0) {
        this.state = 'chase';
        this.cooldown = this.type === 'boss' ? 1.2 + Math.random() * 1.4
          : this.type === 'brute' ? .5 + Math.random() * .4
            : .9 + Math.random() * 1.6;
      }
      this.physics(dt, g, 0, 0);
      return;
    }

    // chase
    this.cooldown -= dt * g.skill.attack;
    const reach = T.reach + T.radius + p.radius;
    const level = Math.abs(p.pos.y - this.pos.y) < 1.5;
    if (this.cooldown <= 0 && !p.dead) {
      if (dist < reach && level) {
        this.startAttack('melee', g);
      } else if (T.ranged && this.sees && dist < 34 && Math.random() < (this.type === 'boss' ? .85 : .5)) {
        this.startAttack('ranged', g);
      } else {
        this.cooldown = .3 + Math.random() * .4;
      }
      if (this.state === 'attack') return;
    }

    let mx = 0, mz = 0;
    if (!(dist < reach * .8 && level) && !p.dead) {
      let dir = null;
      if (this.sees && dist < 10 && level) dir = { x: dx / dist, z: dz / dist };
      else dir = g.level.flowDir(this.pos.x, this.pos.z) || (this.sees ? { x: dx / dist, z: dz / dist } : null);
      if (dir) {
        mx = dir.x;
        mz = dir.z;
        if (this.type === 'imp' && this.sees && dist > 4) {
          const s = Math.sin(this.anim * 1.4 + this.seed) * .7;
          mx += -dir.z * s;
          mz += dir.x * s;
        }
      }
      if (this.stuck > 0) {
        this.stuck -= dt;
        mx = this.sideX;
        mz = this.sideZ;
      }
    }
    const moving = mx !== 0 || mz !== 0;
    const speed = T.speed * (this.type === 'boss' && this.hp < T.hp / 2 ? 1.4 : 1);
    if (moving) {
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
      this.turnTo(this.sees && dist < 12 ? toPlayer : Math.atan2(mx, mz), dt, 7);
    } else {
      this.turnTo(toPlayer, dt, 7);
    }
    const moved = this.physics(dt, g, mx * speed, mz * speed);
    if (moving && !moved && this.stuck <= 0) {
      this.stuck = .4 + Math.random() * .4;
      const side = Math.random() < .5 ? 1 : -1;
      this.sideX = -mz * side;
      this.sideZ = mx * side;
    }
    this.walkAnim(dt, moving ? speed : 0);
  }

  turnTo(target, dt, rate) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * rate);
  }

  physics(dt, g, vx, vz) {
    if (this.def.fly) return this.flyPhysics(dt, g, vx, vz);
    const L = g.level, T = this.def, r = T.radius, step = .65;
    let moved = false;
    const here = L.at(this.pos.x, this.pos.z);
    const safe = (x, z) => here.lava || !L.at(x, z).lava;
    if (vx) {
      const nx = this.pos.x + vx * dt;
      if (safe(nx, this.pos.z) && L.fits(nx, this.pos.z, r, this.pos.y, step, T.height)) {
        this.pos.x = nx;
        moved = true;
      }
    }
    if (vz) {
      const nz = this.pos.z + vz * dt;
      if (safe(this.pos.x, nz) && L.fits(this.pos.x, nz, r, this.pos.y, step, T.height)) {
        this.pos.z = nz;
        moved = true;
      }
    }
    // Keep monsters from stacking inside each other.
    for (const o of g.enemies) {
      if (o === this || o.dead) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, d = Math.hypot(ox, oz), min = r + o.def.radius;
      if (d >= min || d < 1e-4 || Math.abs(o.pos.y - this.pos.y) > 2) continue;
      const push = Math.min(.1, (min - d) * .5), px = this.pos.x + ox / d * push, pz = this.pos.z + oz / d * push;
      if (L.fits(px, pz, r, this.pos.y, step, T.height)) {
        this.pos.x = px;
        this.pos.z = pz;
      }
    }
    const span = L.span(this.pos.x, this.pos.z, r);
    this.vy -= 20 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= span.floor) {
      this.pos.y = span.floor;
      this.vy = 0;
    }
    return moved;
  }

  // ------------------------------------------------------------ flying

  // Hover above whatever floor is below, drifting over ledges and lava.
  flyPhysics(dt, g, vx, vz) {
    const L = g.level, T = this.def, r = T.radius;
    let moved = false;
    if (vx) {
      const nx = this.pos.x + vx * dt;
      if (L.fits(nx, this.pos.z, r, this.pos.y, 3, T.height)) {
        this.pos.x = nx;
        moved = true;
      }
    }
    if (vz) {
      const nz = this.pos.z + vz * dt;
      if (L.fits(this.pos.x, nz, r, this.pos.y, 3, T.height)) {
        this.pos.z = nz;
        moved = true;
      }
    }
    for (const o of g.enemies) {
      if (o === this || o.dead || !o.def.fly) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, d = Math.hypot(ox, oz), min = r + o.def.radius;
      if (d >= min || d < 1e-4 || Math.abs(o.pos.y - this.pos.y) > .8) continue;
      const push = Math.min(.08, (min - d) * .5), px = this.pos.x + ox / d * push, pz = this.pos.z + oz / d * push;
      if (L.fits(px, pz, r, this.pos.y, 3, T.height)) {
        this.pos.x = px;
        this.pos.z = pz;
      }
    }
    const span = L.span(this.pos.x, this.pos.z, r);
    const target = Math.min(span.floor + this.hover + Math.sin(this.anim * 2.2 + this.seed) * .12, span.ceil - T.height - .1);
    this.pos.y += (target - this.pos.y) * Math.min(1, dt * 3);
    return moved;
  }

  // Circle in, wind up with a shudder and a scream, then charge.
  flyerUpdate(dt, g, dx, dz, dist) {
    const p = g.player, L = g.level, T = this.def, toPlayer = Math.atan2(dx, dz);
    if (this.state === 'attack') {
      this.timer -= dt;
      this.setShow('attack', 0);
      if (!this.dash) {
        this.turnTo(toPlayer, dt, 12);
        this.flyPhysics(dt, g, 0, 0);
        this.jitter.set((Math.random() - .5) * .06, (Math.random() - .5) * .06, 0);
        if (this.timer <= 0) {
          this.dash = p.eye().sub(this.center()).normalize().multiplyScalar(15);
          this.timer = 1.1;
          g.sound.play('skullCharge', this.pos);
        }
        return;
      }
      const next = this.pos.clone().addScaledVector(this.dash, dt);
      const mid = next.y + T.height / 2;
      const hitWall = !L.open(next.x, mid, next.z) || !L.fits(next.x, next.z, T.radius, next.y, 3, T.height)
        || next.y < L.at(next.x, next.z).floor;
      if (!hitWall) this.pos.copy(next);
      this.yaw = Math.atan2(this.dash.x, this.dash.z);
      const c = this.center();
      const horiz = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      if (!p.dead && horiz < T.radius + p.radius + .15 && c.y > p.pos.y - .2 && c.y < p.pos.y + p.height + .2) {
        p.hurt(randInt(T.melee), c, g);
        g.sound.play('bite', c);
        // Bounce back off the player.
        const back = new Vec3(-dx, 0, -dz).normalize().multiplyScalar(.6);
        this.endCharge();
        this.retreat = 1.2;
        this.cooldown = 2 + Math.random() * 1.5;
        if (L.fits(this.pos.x + back.x, this.pos.z + back.z, T.radius, this.pos.y, 3, T.height)) this.pos.add(back);
        return;
      }
      if (hitWall || this.timer <= 0) this.endCharge();
      return;
    }

    this.cooldown -= dt * g.skill.attack;
    this.retreat = Math.max(0, (this.retreat || 0) - dt);
    // Only two skulls wind up or charge at once; the rest circle and wait.
    const charging = g.enemies.filter((e) => e.def.fly && !e.dead && e.state === 'attack').length;
    if (this.cooldown <= 0 && this.sees && dist > 3.5 && dist < 14 && !p.dead && !this.retreat) {
      if (charging < 2) {
        this.state = 'attack';
        this.dash = null;
        this.timer = .5;
        g.sound.play('skullSight', this.pos, .7);
        return;
      }
      this.cooldown = .4 + Math.random() * .5;
    }
    let dir = null;
    if (this.sees) {
      // Back off after a hit or when too close to charge, circling as it goes.
      const side = Math.sin(this.seed * 7) > 0 ? 1 : -1;
      const toward = this.retreat || dist < 3.5 ? -1 : dist < 6 ? 0 : 1;
      dir = { x: toward * dx / dist - side * dz / dist, z: toward * dz / dist + side * dx / dist };
    } else {
      dir = L.flowDir(this.pos.x, this.pos.z);
    }
    let vx = 0, vz = 0;
    if (dir && !p.dead) {
      const l = Math.hypot(dir.x, dir.z) || 1;
      vx = dir.x / l * T.speed;
      vz = dir.z / l * T.speed;
    }
    this.turnTo(this.sees ? toPlayer : Math.atan2(vx, vz || 1e-6), dt, 6);
    this.flyPhysics(dt, g, vx, vz);
    this.idleAnim();
  }

  endCharge() {
    this.state = 'chase';
    this.dash = null;
    this.cooldown = 1.5 + Math.random() * 1.5;
  }

  // Flames streaming off the skull.
  trail(dt, g) {
    this.trailAcc += dt * (this.dash ? 90 : 35);
    const c = this.center();
    while (this.trailAcc > 1) {
      this.trailAcc--;
      g.fire.spawn(
        c.x + (Math.random() - .5) * .3, c.y + (Math.random() - .3) * .3, c.z + (Math.random() - .5) * .3,
        (Math.random() - .5) * .4, .6 + Math.random() * .8, (Math.random() - .5) * .4,
        .25 + Math.random() * .25, .3 + Math.random() * .2, .02, 3.4, 1.2, .25, 1, -1, 1,
      );
    }
  }

  // ------------------------------------------------------------ attacks

  startAttack(kind, g) {
    this.state = 'attack';
    this.kind = kind;
    this.fired = false;
    if (kind === 'melee') {
      this.timer = this.type === 'boss' ? 1 : this.type === 'brute' ? .55 : .6;
    } else {
      this.timer = this.type === 'boss' ? 1.1 : .85;
      if (this.type === 'boss' && Math.random() < .5) g.sound.play('bossRoar', this.pos, .7);
    }
    this.attackLen = this.timer;
    this.fireAt = this.timer * .5;
  }

  strike(g, dist) {
    const p = g.player, T = this.def;
    g.sound.play(this.type === 'brute' ? 'bite' : this.type === 'boss' ? 'stomp' : 'claw', this.pos);
    if (this.type === 'boss') {
      g.shockwave(this.pos, 5);
      if (dist < 5.5 && Math.abs(p.pos.y - this.pos.y) < 2) p.hurt(randInt(T.melee), this.pos, g);
      return;
    }
    if (dist < T.reach + T.radius + p.radius + .4 && Math.abs(p.pos.y - this.pos.y) < 1.6) {
      p.hurt(randInt(T.melee), this.pos, g);
    }
  }

  shoot(g) {
    const T = this.def, p = g.player;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const origin = new Vec3(
      this.pos.x + fx * (T.radius + .35),
      this.pos.y + T.height * (this.type === 'boss' ? .75 : .7),
      this.pos.z + fz * (T.radius + .35),
    );
    const target = p.eye();
    target.y -= .35;
    const base = target.sub(origin).normalize();
    const count = this.type === 'boss' ? (this.hp < T.hp / 2 ? 5 : 3) : 1;
    const spread = .13;
    for (let i = 0; i < count; i++) {
      const a = (i - (count - 1) / 2) * spread;
      const dir = base.clone().rotateY(a);
      g.spawnProjectile(origin, dir, this.type === 'boss' ? 15 : 13, randInt(T.missile), this, this.type === 'boss');
    }
    g.sound.play('fireball', origin);
  }

  damage(amount, g, dir) {
    if (this.dead) return;
    this.hp -= amount;
    this.flash = .07;
    if (this.state === 'idle') this.wake(g);
    if (this.hp <= 0) {
      this.die(g, dir, amount);
      return;
    }
    if (Math.random() < this.def.pain * Math.min(1, amount / 14)) {
      this.state = 'pain';
      this.dash = null;
      this.timer = .22;
      g.sound.play('pain', this.pos, .8);
    }
  }

  // Skulls burst into flame; anything else either falls down dead or, if the
  // last hit took it well past zero, comes apart in a shower of gibs.
  die(g, dir, amount) {
    this.dead = true;
    this.state = 'dead';
    this.deadT = 0;
    this.flash = 0;
    g.sound.play('death', this.pos);
    if (this.glow) g.lights.remove(this.glow);
    const h = this.def.height, s = this.def.scale;
    if (this.def.fly) {
      g.explosion(this.center(), false, false);
      this.gone = true;
    } else if (this.type !== 'boss' && this.hp < -this.def.hp * .3) {
      g.sound.play('gib', this.pos);
      g.blood(this.pos.x, this.pos.y + h * .55, this.pos.z, 60, 3 + s);
      g.gibs.burst(this.pos.x, this.pos.y + h * .5, this.pos.z, 7 + Math.min(5, amount / 15) | 0, 4 + s, dir);
      this.gone = true;
    } else {
      g.blood(this.pos.x, this.pos.y + h * .55, this.pos.z, this.type === 'boss' ? 120 : 30, 2 + s);
      g.gibs.burst(this.pos.x, this.pos.y + h * .5, this.pos.z, this.type === 'boss' ? 10 : 2, 3 + s, dir);
    }
    g.onEnemyDeath(this);
  }

  // ------------------------------------------------------------ animation

  setShow(anim, frame) {
    this.show.anim = anim;
    this.show.frame = frame;
  }

  idleAnim() {
    // Skulls chatter their jaws; everything else stands still.
    this.setShow('idle', this.def.fly ? ((this.anim * 6 + this.seed) | 0) % 2 : 0);
  }

  walkAnim(dt, speed) {
    const rate = this.type === 'boss' ? 1.1 : this.type === 'brute' ? 1.6 : 2.4;
    this.walkPhase += dt * speed * rate;
    this.swing = lerp(this.swing, speed > 0 ? 1 : 0, Math.min(1, dt * 8));
    if (this.swing < .3) this.setShow('idle', 0);
    else this.setShow('walk', ((this.walkPhase / (Math.PI / 2)) | 0) % 4);
  }

  attackPose() {
    const k = 1 - this.timer / this.attackLen;
    const anim = this.type === 'brute' || this.kind === 'melee' ? 'melee' : 'ranged';
    this.setShow(anim, k < .35 ? 0 : k < .6 ? 1 : 2);
  }

  dispose(g) {
    if (this.glow) g.lights.remove(this.glow);
  }
}

// ---------------------------------------------------------------- fireballs

export class Projectile {
  constructor(g, origin, dir, speed, damage, owner, big) {
    this.pos = origin.clone();
    this.vel = dir.clone().multiplyScalar(speed);
    this.damage = damage;
    this.owner = owner;
    this.big = big;
    this.radius = big ? .32 : .2;
    this.life = 6;
    this.age = 0;
    this.light = g.lights.add({ pos: this.pos, color: 0xff6a20, intensity: big ? 30 : 16, range: big ? 8 : 6 });
  }

  update(dt, g) {
    this.life -= dt;
    this.age += dt;
    this.pos.addScaledVector(this.vel, dt);
    for (let i = 0; i < (this.big ? 3 : 2); i++) {
      g.fire.spawn(
        this.pos.x + (Math.random() - .5) * this.radius, this.pos.y + (Math.random() - .5) * this.radius, this.pos.z + (Math.random() - .5) * this.radius,
        (Math.random() - .5) * .6, Math.random() * .6, (Math.random() - .5) * .6,
        .25 + Math.random() * .2, this.radius * 2.2, 0, 3, 1.1, .25, 1,
      );
    }

    const p = g.player;
    if (!p.dead) {
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d < p.radius + this.radius && this.pos.y > p.pos.y - this.radius && this.pos.y < p.pos.y + p.height + this.radius) {
        p.hurt(this.damage, this.pos, g);
        this.explode(g);
        return false;
      }
    }
    for (const e of g.enemies) {
      if (e.dead || e === this.owner) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < e.def.radius + this.radius && this.pos.y > e.pos.y && this.pos.y < e.pos.y + e.def.height) {
        tmp.copy(this.vel).normalize();
        e.damage(this.damage, g, tmp);
        this.explode(g);
        return false;
      }
    }
    if (this.life <= 0 || !g.level.open(this.pos.x, this.pos.y, this.pos.z)) {
      this.pos.addScaledVector(this.vel, -dt);
      this.explode(g);
      return false;
    }
    return true;
  }

  explode(g) {
    this.dispose(g);
    g.explosion(this.pos, this.big);
  }

  dispose(g) {
    g.lights.remove(this.light);
  }
}

// Ray against an upright cylinder; returns the hit distance or Infinity.
export function rayCylinder(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return Infinity;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return Infinity;
  const y = o.y + d.y * t;
  return y >= y0 && y <= y1 ? t : Infinity;
}
