import * as THREE from 'three';
import * as TX from './textures.js';

export const LOG_FUEL = 38; // seconds of burn one log adds
export const MAX_FUEL = 110;

/** The hearth: logs, flames, embers, sparks and the light everything in the game revolves around. */
export class Fire {
  constructor(scene, pos) {
    this.pos = pos.clone(); // floor point in front of the hearth opening
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    scene.add(this.group);

    const bark = new THREE.MeshStandardMaterial({ map: TX.barkTexture(), roughness: 1, emissive: 0x3a0e00, emissiveIntensity: 0.0 });
    this.logMat = bark;
    const logGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8);
    for (const [x, y, z, rz, ry] of [[-0.15, 0.12, 0, Math.PI / 2, 0.15], [0.2, 0.12, 0.05, Math.PI / 2, -0.25], [0, 0.3, 0, Math.PI / 2, 1.5]]) {
      const l = new THREE.Mesh(logGeo, bark);
      l.position.set(x, y, z); l.rotation.set(0, ry, rz, 'YZX');
      this.group.add(l);
    }
    this.embers = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.55), new THREE.MeshBasicMaterial({ color: 0xff5a14 }));
    this.embers.position.y = 0.04;
    this.group.add(this.embers);

    const flameMat = new THREE.MeshBasicMaterial({
      map: TX.flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.flames = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1), flameMat);
      m.rotation.y = (i / 4) * Math.PI;
      m.position.y = 0.3;
      this.group.add(m);
      this.flames.push(m);
    }

    this.light = new THREE.PointLight(0xff8a3a, 0, 20, 1.5);
    this.light.position.set(0, 0.9, 0.1);
    this.group.add(this.light);

    // sparks
    const n = 28;
    this.sparkPos = new Float32Array(n * 3);
    this.sparkLife = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ map: TX.dotTexture(), size: 0.07, color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    for (let i = 0; i < n; i++) this.sparkLife[i] = Math.random();
  }

  /** @param {number} fuel seconds of fuel left */
  update(dt, fuel, t) {
    const F = Math.min(1, fuel / 60);
    const burning = fuel > 0;
    const flick = 0.82 + 0.18 * Math.sin(t * 17.3) * Math.sin(t * 9.1 + 1) + (Math.random() - 0.5) * 0.12;
    this.flames.forEach((m, i) => {
      m.visible = burning;
      const h = (0.25 + 1.0 * F) * (0.85 + 0.3 * Math.sin(t * (9 + i * 2.3) + i));
      m.scale.set(0.5 + 0.7 * F, h, 1);
      m.position.y = 0.2 + h * 0.5;
      m.rotation.y = (i / 4) * Math.PI + Math.sin(t * 2 + i) * 0.2;
    });
    this.emberLevel = burning ? 1 : Math.max(0, (this.emberLevel ?? 1) - dt * 0.05);
    this.embers.material.color.setRGB(0.9 * this.emberLevel + 0.1, 0.25 * this.emberLevel, 0.05 * this.emberLevel);
    this.light.intensity = (burning ? 7 + 52 * F : 3.5 * this.emberLevel) * flick;
    this.light.distance = burning ? 13 + 15 * F : 7;
    this.light.color.setHSL(0.07 + 0.01 * F, 1, 0.55);
    this.logMat.emissiveIntensity = burning ? 0.6 * F : 0.15 * this.emberLevel;

    const arr = this.sparkPos;
    for (let i = 0; i < this.sparkLife.length; i++) {
      this.sparkLife[i] += dt * (0.5 + (i % 5) * 0.12);
      if (this.sparkLife[i] > 1 || !burning) {
        this.sparkLife[i] = Math.random() * (burning ? 0.2 : 1);
        arr[i * 3] = (Math.random() - 0.5) * 0.5; arr[i * 3 + 1] = 0.4; arr[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        if (!burning) arr[i * 3 + 1] = -5;
      } else {
        arr[i * 3] += Math.sin(t * 3 + i) * dt * 0.2;
        arr[i * 3 + 1] += dt * (0.5 + F);
      }
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }

  /** Radius (metres) around the hearth the creature will not cross. */
  static safeRadius(fuel) {
    if (fuel <= 0) return 0;
    return 2.6 + 8 * Math.min(1, fuel / 60);
  }
}

/** Snow falling around the camera. */
export class Snowfall {
  constructor(scene, count = 1400) {
    this.count = count;
    this.size = { x: 30, y: 14, z: 30 };
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.size.x;
      this.pos[i * 3 + 1] = Math.random() * this.size.y;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.size.z;
      this.vel[i * 2] = 0.7 + Math.random() * 1.0;
      this.vel[i * 2 + 1] = Math.random() * 6.28;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ map: TX.dotTexture(), size: 0.09, color: 0xe8f0ff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, cam, t, visible) {
    this.points.visible = visible;
    if (!visible) return;
    const { x: sx, y: sy, z: sz } = this.size;
    const out = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      this.pos[o + 1] -= this.vel[i * 2] * dt;
      this.pos[o] += (Math.sin(t * 0.7 + this.vel[i * 2 + 1]) * 0.35 + 0.5) * dt; // gentle wind
      if (this.pos[o + 1] < 0) this.pos[o + 1] += sy;
      // wrap in a box centred on the camera
      const wx = ((this.pos[o] - cam.x + sx / 2) % sx + sx) % sx - sx / 2;
      const wz = ((this.pos[o + 2] - cam.z + sz / 2) % sz + sz) % sz - sz / 2;
      out[o] = cam.x + wx; out[o + 1] = this.pos[o + 1]; out[o + 2] = cam.z + wz;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
