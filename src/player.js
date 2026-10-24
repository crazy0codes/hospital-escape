import * as THREE from 'three';
import { EYE_HEIGHT } from './physics.js';

export const WALK_SPEED = 2.4;
export const RUN_SPEED = 4.0;
const STAMINA_DRAIN = 1 / 5; // full bar lasts 5 s of running
const STAMINA_REGEN = 1 / 8; // 8 s to refill
const BATTERY_DRAIN = 100 / 240; // percent per second the torch is on
export const BATTERY_PICKUP = 35;

export class Player {
  constructor(camera, physics, canvas, { requireLock = true } = {}) {
    this.camera = camera;
    this.physics = physics;
    this.canvas = canvas;
    this.requireLock = requireLock;
    this.keys = new Set();
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.battery = 100;
    this.flashlightOn = true;
    this.moving = false;
    this.running = false;
    this.speed = 0;
    this.bob = 0;
    this.stepAccum = 0;
    this.enabled = false;
    this.onStep = null;
    this.onToggleLight = null;
    this.onInteract = null;
    this.eye = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'KeyF') this.onToggleLight?.();
      if (e.code === 'KeyE') this.onInteract?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.requireLock && document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
    });
  }

  reset(pos, yaw) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.battery = 100;
    this.flashlightOn = true;
    this.stepAccum = 0;
    this.bob = 0;
    this.speed = 0;
    this.physics.spawnPlayer(pos.x, pos.z);
    this.applyCamera(0);
  }

  update(dt) {
    let ix = 0, iz = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    }
    const wants = ix !== 0 || iz !== 0;
    const wantsRun = wants && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    if (this.stamina <= 0.001) this.exhausted = true;
    if (this.exhausted && this.stamina > 0.3) this.exhausted = false;
    this.running = wantsRun && !this.exhausted && this.stamina > 0;

    const speed = this.running ? RUN_SPEED : WALK_SPEED;
    if (wants) {
      const len = Math.hypot(ix, iz);
      ix /= len; iz /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // forward is -Z rotated by yaw
      const dx = (ix * cos + iz * sin) * speed * dt;
      const dz = (-ix * sin + iz * cos) * speed * dt;
      const p = this.physics.movePlayer(dx, dz);
      const moved = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      this.pos.x = p.x; this.pos.z = p.z;
      this.speed = moved / Math.max(dt, 1e-4);
    } else {
      this.speed = 0;
      this.physics.world.step();
    }
    this.moving = this.speed > 0.3;

    this.stamina = THREE.MathUtils.clamp(this.stamina + (this.running && this.moving ? -STAMINA_DRAIN : (this.moving ? STAMINA_REGEN * 0.5 : STAMINA_REGEN)) * dt, 0, 1);

    if (this.flashlightOn && this.battery > 0) this.battery = Math.max(0, this.battery - BATTERY_DRAIN * dt);
    if (this.battery <= 0) this.flashlightOn = false;

    // footsteps and head bob
    if (this.moving) {
      const stride = this.running ? 1.9 : 1.45; // metres per step
      this.stepAccum += this.speed * dt;
      this.bob += this.speed * dt * (this.running ? 2.6 : 2.3);
      if (this.stepAccum >= stride) { this.stepAccum -= stride; this.onStep?.(this.running); }
    }
    this.applyCamera(dt);
  }

  applyCamera(dt) {
    const bobY = this.moving ? Math.sin(this.bob * 2) * (this.running ? 0.045 : 0.025) : 0;
    this.eye.set(this.pos.x, EYE_HEIGHT + bobY, this.pos.z);
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.getWorldDirection(this.forward);
  }

  addBattery(amount) { this.battery = Math.min(100, this.battery + amount); }
}
