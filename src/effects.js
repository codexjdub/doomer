// Visual effects: particles, bullet-hole decals, flying gibs, and a pool of
// point lights shared between every light source in the level.
import * as THREE from 'three';

// ---------------------------------------------------------------- particles

const particleVertex = /* glsl */`
  attribute float size;
  attribute vec4 pcolor;
  uniform float scale;
  varying vec4 vColor;
  void main() {
    vColor = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(-mv.z, 0.05);
    gl_Position = projectionMatrix * mv;
  }`;

const particleFragment = /* glsl */`
  uniform sampler2D map;
  varying vec4 vColor;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
    if (gl_FragColor.a < 0.004) discard;
  }`;

export class Particles {
  constructor(scene, max, map, additive) {
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.rgba = new Float32Array(max * 4);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('pcolor', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 600 } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 2 : 1;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, size, sizeEnd, r, g, b, a = 1, gravity = 0, drag = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = size;
    this.s1[i] = sizeEnd;
    this.rgba.set([r, g, b, a], i * 4);
    this.grav[i] = gravity;
    this.drag[i] = drag;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const j = i * 3, drag = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= drag;
      this.vel[j + 1] = this.vel[j + 1] * drag - this.grav[i] * dt;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      const c = i * 4;
      this.col[c] = this.rgba[c];
      this.col[c + 1] = this.rgba[c + 1];
      this.col[c + 2] = this.rgba[c + 2];
      this.col[c + 3] = this.rgba[c + 3] * Math.min(1, k * 2.5);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.size.fill(0);
    this.sizeAttr.needsUpdate = true;
  }

  setScale(viewportHeight, fov) {
    this.material.uniforms.scale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }
}

// ---------------------------------------------------------------- decals

export class Decals {
  constructor(scene, map, max = 120) {
    this.meshes = [];
    this.next = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.meshes.push(m);
    }
  }

  add(point, normal, size = .14) {
    const m = this.meshes[this.next];
    this.next = (this.next + 1) % this.meshes.length;
    m.position.copy(point).addScaledVector(normal, .012);
    m.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size * (.8 + Math.random() * .4));
    m.visible = true;
  }

  clear() {
    for (const m of this.meshes) m.visible = false;
  }
}

// ---------------------------------------------------------------- gibs

export class Debris {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.items = [];
  }

  // Detach every mesh of a model and send the pieces flying.
  explode(root, force, dir) {
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    root.updateWorldMatrix(true, true);
    for (const m of meshes) {
      this.scene.attach(m);
      const v = new THREE.Vector3((Math.random() - .5) * force, Math.random() * force * .9 + 2, (Math.random() - .5) * force);
      if (dir) v.addScaledVector(dir, force * .5);
      this.items.push({
        mesh: m,
        vel: v,
        spin: new THREE.Vector3((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12),
        age: 0,
        rest: false,
      });
    }
    this.scene.remove(root);
    while (this.items.length > 500) this.remove(this.items.shift());
  }

  remove(it) {
    this.scene.remove(it.mesh);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i], m = it.mesh;
      it.age += dt;
      if (it.age > 30) {
        this.remove(it);
        this.items.splice(i, 1);
        continue;
      }
      if (it.age > 24) {
        m.position.y -= dt * .15;
        continue;
      }
      if (it.rest) continue;
      it.vel.y -= 18 * dt;
      const nx = m.position.x + it.vel.x * dt, nz = m.position.z + it.vel.z * dt;
      const cell = this.level.at(nx, nz);
      if (this.level.blocked(cell) || cell.floor > m.position.y + .1) {
        it.vel.x *= -.4;
        it.vel.z *= -.4;
      } else {
        m.position.x = nx;
        m.position.z = nz;
      }
      m.position.y += it.vel.y * dt;
      const here = this.level.at(m.position.x, m.position.z);
      const ground = here.floor + .06;
      if (m.position.y < ground) {
        m.position.y = ground;
        it.vel.y *= -.3;
        it.vel.x *= .55;
        it.vel.z *= .55;
        it.spin.multiplyScalar(.5);
        if (Math.abs(it.vel.y) < .6 && it.vel.lengthSq() < .5) it.rest = true;
      }
      if (m.position.y > here.ceil - .05) {
        m.position.y = here.ceil - .05;
        it.vel.y = -Math.abs(it.vel.y) * .3;
      }
      m.rotation.x += it.spin.x * dt;
      m.rotation.y += it.spin.y * dt;
      m.rotation.z += it.spin.z * dt;
    }
  }

  clear() {
    for (const it of this.items) this.remove(it);
    this.items.length = 0;
  }
}

// ---------------------------------------------------------------- lights

// The level has far more light sources than a forward renderer can afford,
// so each frame the most important ones near the camera borrow a light from
// a fixed pool. Keeping the pool size constant avoids shader recompiles.
export class LightPool {
  constructor(scene, size = 10, shadowSlots = 2) {
    this.lights = [];
    this.sources = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l);
      this.lights.push(l);
    }
    // Shadow-casting spot lights that follow the nearest ceiling lamps.
    this.spots = [];
    for (let i = 0; i < shadowSlots; i++) {
      const s = new THREE.SpotLight(0xffe2b8, 0, 16, 1.05, .6, 2);
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.bias = -.0004;
      s.shadow.normalBias = .02;
      s.shadow.camera.near = .2;
      scene.add(s, s.target);
      this.spots.push({ light: s, source: null, level: 0 });
    }
    this.tmp = new THREE.Vector3();
  }

  // src: { pos, color, intensity, range, flicker?, dynamic?, shadow?, life? }
  add(src) {
    src.color = new THREE.Color(src.color);
    src.current = src.intensity;
    this.sources.push(src);
    return src;
  }

  remove(src) {
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
  }

  clearDynamic() {
    this.sources = this.sources.filter((s) => !s.dynamic);
  }

  setShadows(enabled, count) {
    this.spots.forEach((s, i) => {
      s.light.castShadow = enabled && i < count;
      s.enabled = i < count;
    });
  }

  update(camera, t, dt) {
    const cam = camera.position;
    for (const s of this.sources) {
      let k = s.intensity;
      if (s.flicker) k *= 1 + Math.sin(t * 13 + s.pos.x * 7) * .08 * s.flicker + Math.sin(t * 29 + s.pos.z * 3) * .06 * s.flicker;
      s.current = k;
      const d2 = s.pos.distanceToSquared(cam);
      if (s.dynamic) s.score = k > .05 ? 1e6 + k : 0;
      else s.score = d2 > 45 * 45 ? 0 : (k * s.range * s.range) / (d2 + 4);
    }

    // Shadow lamps: the nearest shadow-capable sources in front of the camera.
    const shadowCandidates = this.sources
      .filter((s) => s.shadow)
      .map((s) => {
        this.tmp.copy(s.pos).sub(cam);
        const d = this.tmp.length();
        return { s, d };
      })
      .filter((c) => c.d < 22)
      .sort((a, b) => a.d - b.d);
    const wanted = shadowCandidates.slice(0, this.spots.filter((s) => s.enabled).length).map((c) => c.s);
    for (const slot of this.spots) {
      if (!slot.enabled) {
        slot.light.intensity = 0;
        continue;
      }
      const keep = slot.source && wanted.includes(slot.source);
      if (keep) {
        slot.level = Math.min(1, slot.level + dt * 3);
      } else {
        slot.level = Math.max(0, slot.level - dt * 4);
        if (slot.level === 0) {
          const free = wanted.find((w) => !this.spots.some((o) => o.source === w));
          slot.source = free || null;
          if (free) {
            slot.light.position.copy(free.pos);
            slot.light.target.position.set(free.pos.x, free.pos.y - 5, free.pos.z);
            slot.light.color.copy(free.color);
          }
        }
      }
      slot.light.intensity = slot.source ? slot.source.current * 1.6 * slot.level : 0;
    }

    const ranked = this.sources.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    this.strongest = ranked.find((s) => !s.dynamic) || null;
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], s = ranked[i];
      if (!s) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(s.pos);
      l.color.copy(s.color);
      l.distance = s.range;
      l.intensity = s.current;
    }
  }
}
