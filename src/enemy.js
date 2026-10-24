import * as THREE from 'three';
import { rand, pick } from './audio.js';
import { Creature } from './creature.js';

const EYE = 1.4;
const KILL_DIST = 1.9; // the head reaches about 1 m ahead of the hips, plus the lunge
const HALF = { x: 2, y: 1.5, z: 2 };
const STUN_SECONDS = 2.5;
const STUN_COOLDOWN = 8;
const BEAM_NEEDED = 1.2;

export const STATE = { DORMANT: 'dormant', PATROL: 'patrol', INVESTIGATE: 'investigate', CHASE: 'chase', SEARCH: 'search', STUNNED: 'stunned', KILL: 'kill' };

export class Enemy {
  constructor({ models, scene, level, query, physics, audio, player }) {
    this.level = level;
    this.query = query;
    this.physics = physics;
    this.audio = audio;
    this.player = player;

    this.root = new THREE.Group();
    this.creature = new Creature(models['enemy/wendigo']);
    this.root.add(this.creature.object);
    scene.add(this.root);
    this.mode = 'idle';
    this.moved = 0; // metres travelled since the last frame, for the gait
    this.speedNow = 0;

    this.pos = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.path = [];
    this.onKill = null;
    this.onStateChange = null;
    this.reset();
  }

  reset() {
    this.pos.copy(this.level.patientStart);
    this.yaw = 0;
    this.state = STATE.DORMANT;
    this.path = [];
    this.timer = 0;
    this.repath = 0;
    this.chaseTime = 0;
    this.loseTimer = 0;
    this.beam = 0;
    this.stunCooldown = 0;
    this.lastKnown = new THREE.Vector3();
    this.searchLeft = 0;
    this.sinceWake = 0;
    this.stepDist = 0;
    this.breathT = 2;
    this.growlT = rand(18, 30);
    this.hunt = false;
    this.huntT = 12;
    this.speedBoost = 0; // grows with keys
    this.canSeePlayer = false;
    this.killT = 0;
    this.play('idle');
    this.lastX = this.pos.x; this.lastZ = this.pos.z; this.speedNow = 0;
    this.apply();
  }

  // ------------------------------------------------------------------ helpers
  /** Animation names map to creature modes; the gait speed comes from the real movement. */
  play(name) {
    this.mode = { idle: 'idle', walk: 'walk', sprint: 'run', 'emote-no': 'stun', 'attack-melee-right': 'attack' }[name] || 'idle';
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.onStateChange?.(s);
  }

  apply() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.eye.set(this.pos.x, EYE, this.pos.z);
  }

  snap(p) {
    const r = this.query.findClosestPoint({ x: p.x, y: 0, z: p.z }, { halfExtents: HALF });
    return r.success ? new THREE.Vector3(r.point.x, 0, r.point.z) : null;
  }

  goTo(target) {
    const t = this.snap(target);
    if (!t) return false;
    const from = this.snap(this.pos) || this.pos;
    const r = this.query.computePath({ x: from.x, y: 0, z: from.z }, { x: t.x, y: 0, z: t.z }, { halfExtents: HALF });
    if (!r.success || r.path.length === 0) { this.path = []; return false; }
    this.path = r.path.slice(1).map((p) => new THREE.Vector3(p.x, 0, p.z));
    return true;
  }

  /** Walk along the current path. Returns true while there is still somewhere to go. */
  follow(dt, speed, turn = 6) {
    if (this.path.length === 0) return false;
    const next = this.path[0];
    const dx = next.x - this.pos.x, dz = next.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) { this.path.shift(); return this.path.length > 0; }
    this.face(Math.atan2(dx, dz), dt, turn);
    const step = Math.min(speed * dt, d);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.stepDist += step;
    return true;
  }

  face(target, dt, turn) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += THREE.MathUtils.clamp(d, -turn * dt, turn * dt);
  }

  distToPlayer() { return Math.hypot(this.player.pos.x - this.pos.x, this.player.pos.z - this.pos.z); }

  // ------------------------------------------------------------------ senses
  sees() {
    const p = this.player.eye;
    const dx = p.x - this.eye.x, dz = p.z - this.eye.z;
    const dist = Math.hypot(dx, dz);
    const alert = this.player.flashlightOn || this.player.moving;
    const range = alert ? 14 : 8;
    if (dist > range) return false;
    if (dist > 2.5) {
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - this.yaw), Math.cos(Math.atan2(dx, dz) - this.yaw)));
      if (ang > 0.96) return false; // 110 degree field of view
    }
    return this.physics.clearLine(this.eye, p);
  }

  /** A noise at pos that can be heard within radius metres. */
  hear(pos, radius) {
    if (this.state === STATE.KILL || this.state === STATE.CHASE || this.state === STATE.STUNNED) return;
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    if (d > radius) return;
    if (this.state === STATE.DORMANT) { if (d < 4) this.wake(); return; }
    this.lastKnown.copy(pos);
    if (this.goTo(pos)) {
      if (this.state !== STATE.INVESTIGATE) this.audio.playAt(this.root, 'monster2', { volume: 0.9, rate: 0.75 });
      this.timer = 0;
      this.setState(STATE.INVESTIGATE);
    }
  }

  wake() {
    if (this.state !== STATE.DORMANT) return;
    this.audio.playAt(this.root, 'monster3', { volume: 1, rate: 0.7, ref: 4 });
    this.timer = 0;
    this.setState(STATE.PATROL);
    this.nextPatrol();
  }

  nextPatrol() {
    const wps = this.level.waypoints;
    for (let tries = 0; tries < 8; tries++) {
      const w = pick(wps);
      const dp = Math.hypot(w.x - this.player.pos.x, w.z - this.player.pos.z);
      const dm = Math.hypot(w.x - this.pos.x, w.z - this.pos.z);
      if (dp > 7 && dm > 5 && this.goTo(w)) return;
    }
    this.goTo(pick(wps));
  }

  startChase() {
    this.chaseTime = 0;
    this.loseTimer = 0;
    this.repath = 0;
    this.audio.playAt(this.root, pick(['roar', 'howl']), { volume: 1, rate: 0.8, ref: 5 });
    this.setState(STATE.CHASE);
  }

  animate(dt) {
    const d = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ);
    this.lastX = this.pos.x; this.lastZ = this.pos.z;
    this.speedNow += ((dt > 0 ? d / dt : 0) - this.speedNow) * Math.min(1, dt * 8);
    this.creature.update(dt, { mode: this.mode, speed: this.speedNow });
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.animate(dt);
    const speedKeys = this.speedBoost;
    this.stunCooldown = Math.max(0, this.stunCooldown - dt);
    const dist = this.distToPlayer();

    if (this.state === STATE.KILL) { this.killT += dt; this.apply(); return; }

    if (this.state === STATE.DORMANT) {
      this.sinceWake += dt;
      this.play('idle');
      if (this.sinceWake > 90) this.wake();
      else if (dist < 4 && this.sees()) this.wake();
      this.apply();
      return;
    }

    this.canSeePlayer = this.sees();

    // ---- flashlight stun
    if (this.player.flashlightOn && this.state !== STATE.STUNNED && this.stunCooldown <= 0) {
      const to = new THREE.Vector3(this.pos.x, 1.0, this.pos.z).sub(this.player.eye);
      const d = to.length();
      const lit = d < 8 && to.normalize().dot(this.player.forward) > Math.cos(0.33) && this.physics.clearLine(this.player.eye, new THREE.Vector3(this.pos.x, 1.0, this.pos.z));
      this.beam = lit ? this.beam + dt : Math.max(0, this.beam - dt * 1.5);
      if (this.beam >= BEAM_NEEDED) this.stun();
    } else if (this.state !== STATE.STUNNED) {
      this.beam = Math.max(0, this.beam - dt);
    }

    // ---- kill
    if (this.state !== STATE.STUNNED && dist < KILL_DIST && this.physics.clearLine(this.eye, this.player.eye)) {
      this.kill();
      return;
    }

    switch (this.state) {
      case STATE.PATROL: this.updatePatrol(dt); break;
      case STATE.INVESTIGATE: this.updateInvestigate(dt); break;
      case STATE.CHASE: this.updateChase(dt); break;
      case STATE.SEARCH: this.updateSearch(dt); break;
      case STATE.STUNNED: this.updateStunned(dt); break;
      default: break;
    }

    this.sound(dt, dist);
    this.apply();
  }

  patrolSpeed() { return 1.6 + 0.4 * Math.min(this.speedBoost, 2) * 0.5 + (this.speedBoost >= 2 ? 0.2 : 0); }
  chaseSpeed() { return 3.3 + 0.15 * this.speedBoost; }

  spotPlayerCheck() {
    if (this.canSeePlayer) { this.lastKnown.copy(this.player.pos); this.startChase(); return true; }
    return false;
  }

  updatePatrol(dt) {
    if (this.spotPlayerCheck()) return;
    if (this.hunt) {
      this.huntT -= dt;
      if (this.huntT <= 0) {
        this.huntT = 10;
        const jitter = new THREE.Vector3(this.player.pos.x + rand(-4, 4), 0, this.player.pos.z + rand(-4, 4));
        this.lastKnown.copy(jitter);
        if (this.goTo(jitter)) { this.timer = 0; this.setState(STATE.INVESTIGATE); return; }
      }
    }
    if (this.timer > 0) {
      this.timer -= dt;
      this.play('idle');
      if (this.timer <= 0) this.nextPatrol();
      return;
    }
    const moving = this.follow(dt, this.patrolSpeed(), 3.5);
    if (moving) this.play('walk');
    else { this.timer = rand(1.2, 3.0); this.play('idle'); }
  }

  updateInvestigate(dt) {
    if (this.spotPlayerCheck()) return;
    if (this.timer > 0) {
      this.timer -= dt;
      this.play('idle');
      this.face(this.yaw + Math.sin(performance.now() / 700) * 1.2, dt, 1.2);
      if (this.timer <= 0) { this.setState(STATE.PATROL); this.timer = 0; this.nextPatrol(); }
      return;
    }
    const moving = this.follow(dt, this.patrolSpeed() + 0.3, 4);
    if (moving) this.play('walk');
    else this.timer = 3;
  }

  updateChase(dt) {
    this.chaseTime += dt;
    if (this.canSeePlayer) { this.loseTimer = 0; this.lastKnown.copy(this.player.pos); }
    else this.loseTimer += dt;

    this.repath -= dt;
    if (this.repath <= 0) {
      this.repath = 0.3;
      this.goTo(this.canSeePlayer ? this.player.pos : this.lastKnown);
    }
    const speed = THREE.MathUtils.lerp(2.0, this.chaseSpeed(), Math.min(this.chaseTime / 2, 1));
    const moving = this.follow(dt, speed, 9);
    this.play('sprint');
    if (!moving && !this.canSeePlayer) { this.beginSearch(); return; }
    if (this.loseTimer > 6 || this.distToPlayer() > 25) this.beginSearch();
  }

  beginSearch() {
    this.searchLeft = 2;
    this.timer = 0;
    this.setState(STATE.SEARCH);
    this.goTo(this.lastKnown);
  }

  updateSearch(dt) {
    if (this.spotPlayerCheck()) return;
    if (this.timer > 0) {
      this.timer -= dt;
      this.play('idle');
      this.face(this.yaw + 1.5 * dt * (this.searchLeft % 2 ? 1 : -1), dt, 2);
      if (this.timer <= 0) {
        if (this.searchLeft > 0) {
          this.searchLeft--;
          const r = this.query.findRandomPointAroundCircle({ x: this.lastKnown.x, y: 0, z: this.lastKnown.z }, 8, { halfExtents: HALF });
          if (r.success) this.goTo(new THREE.Vector3(r.randomPoint.x, 0, r.randomPoint.z));
        } else { this.setState(STATE.PATROL); this.nextPatrol(); }
      }
      return;
    }
    const moving = this.follow(dt, this.patrolSpeed() + 0.5, 5);
    if (moving) this.play('walk');
    else this.timer = 2.5;
  }

  stun() {
    this.beam = 0;
    this.stunCooldown = STUN_COOLDOWN;
    this.timer = STUN_SECONDS;
    this.audio.playAt(this.root, 'howl', { volume: 1, rate: 1.15, ref: 5 });
    // back away from the player
    const away = new THREE.Vector3(this.pos.x - this.player.pos.x, 0, this.pos.z - this.player.pos.z).normalize().multiplyScalar(3);
    this.goTo(this.pos.clone().add(away));
    this.setState(STATE.STUNNED);
  }

  updateStunned(dt) {
    this.timer -= dt;
    this.play('emote-no');
    this.follow(dt, 1.3, 2);
    // keep looking at the player while recoiling
    this.face(Math.atan2(this.player.pos.x - this.pos.x, this.player.pos.z - this.pos.z), dt, 4);
    if (this.timer <= 0) {
      this.lastKnown.copy(this.player.pos);
      if (this.canSeePlayer) this.startChase(); else this.beginSearch();
    }
  }

  kill() {
    this.killT = 0;
    this.path = [];
    this.face(Math.atan2(this.player.pos.x - this.pos.x, this.player.pos.z - this.pos.z), 1, 100);
    this.play('attack-melee-right');
    this.audio.playAt(this.root, 'scream', { volume: 1, rate: 0.75, ref: 6 });
    this.setState(STATE.KILL);
    this.apply();
    this.onKill?.();
  }

  sound(dt, dist) {
    const speed = this.state === STATE.CHASE ? 3.3 : this.patrolSpeed();
    const stride = this.state === STATE.CHASE ? 1.7 : 1.15;
    if (this.stepDist >= stride) {
      this.stepDist = 0;
      this.audio.playAt(this.root, pick(['step0', 'step1', 'step2', 'step3', 'step4']), { volume: this.state === STATE.CHASE ? 1.0 : 0.8, rate: rand(0.62, 0.78), ref: 3, max: 40 });
    }
    void speed;
    this.breathT -= dt;
    if (this.breathT <= 0 && dist < 8) {
      this.breathT = rand(1.4, 2.4);
      this.audio.playAt(this.root, 'breath', { volume: 0.9, rate: rand(0.72, 0.85), ref: 1.5, max: 14 });
    }
    this.growlT -= dt;
    if (this.growlT <= 0) {
      this.growlT = rand(18, 34);
      if (this.state !== STATE.CHASE) this.audio.playAt(this.root, pick(['monster1', 'monster2']), { volume: 0.8, rate: rand(0.6, 0.8), ref: 4, max: 60 });
    }
  }
}
