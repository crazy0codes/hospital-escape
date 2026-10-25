import * as THREE from 'three';
import { Player, BATTERY_PICKUP } from './player.js';
import { Enemy, STATE } from './enemy.js';
import { GameAudio, rand, pick } from './audio.js';
import { ui } from './ui.js';
import { S } from './level.js';
import { Fire, Snowfall, LOG_FUEL, MAX_FUEL } from './fire.js';
import * as TX from './textures.js';

const STEPS = ['step0', 'step1', 'step2', 'step3', 'step4'];
const MAX_CARRY = 4;
const START_FUEL = 70;
const CHAIR_FUEL = 14;
const NIGHT_DEFAULT = 540; // seconds from 22:00 to dawn
const DAWN_COLOR = new THREE.Color(0x9fb0cc);
const NIGHT_COLOR = new THREE.Color(0x111b30);
const SKY_NIGHT = new THREE.Color(0x1b2c4c);

export class Game {
  constructor({ renderer, composer, fx, world, physics, models, level, query, soundBytes, opts }) {
    this.renderer = renderer;
    this.composer = composer;
    this.fx = fx;
    this.scene = world.scene;
    this.camera = world.camera;
    this.flashlight = world.flashlight;
    this.ambient = world.ambient;
    this.physics = physics;
    this.models = models;
    this.level = level;
    this.soundBytes = soundBytes;
    this.opts = opts;
    this.canvas = renderer.domElement;
    this.nightLen = opts.night || NIGHT_DEFAULT;

    this.scene.add(level.group);
    physics.addStaticBoxes(level.colliders);

    this.audio = new GameAudio(this.scene, this.camera);
    this.player = new Player(this.camera, physics, this.canvas, { requireLock: !opts.nolock });
    this.enemy = new Enemy({ models, scene: this.scene, level, query, physics, audio: this.audio, player: this.player });
    this.enemy.safeRadius = () => Fire.safeRadius(this.fuel);
    this.fire = new Fire(this.scene, level.hearth);
    this.snow = new Snowfall(this.scene);

    this.state = 'title';
    this.time = 0;
    this.fuel = START_FUEL;
    this.logs = 0;
    this.logsBurned = 0;
    this.batteriesUsed = 0;
    this.flashT = 0;
    this.stingerT = 20;
    this.deadT = 0;
    this.dawnT = 0;
    this.phase = 0;
    this.clock = new THREE.Clock();

    this.buildPickups();
    this.bindEvents();

    this.player.onStep = (running) => {
      this.audio.play(pick(STEPS), running ? 0.5 : 0.28, rand(0.75, 0.9)); // crunchy: lower rate
      this.enemy.hear(this.player.pos, running ? 12 : 5);
    };
    this.player.onToggleLight = () => this.toggleLight();
    this.player.onInteract = () => this.interact();
    this.enemy.onKill = () => this.onCaught();
  }

  // ------------------------------------------------------------------ world objects
  tint(obj, emissive, intensity, colorScale = 1) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(emissive);
      o.material.emissiveIntensity = intensity;
      o.material.color.multiplyScalar(colorScale);
      o.castShadow = false;
    });
  }

  buildPickups() {
    const { logPiles, chairs, batteries, notes } = this.level.pickups;
    this.pickups = [];
    const make = (name, scale, emissive, intensity) => {
      const o = this.models[name].scene.clone(true);
      const box = this.models[name].box;
      const c = box.getCenter(new THREE.Vector3());
      o.position.set(-c.x, -box.min.y, -c.z);
      const holder = new THREE.Group();
      holder.add(o);
      holder.scale.setScalar(scale);
      if (emissive != null) this.tint(o, emissive, intensity);
      this.scene.add(holder);
      return holder;
    };

    const bark = new THREE.MeshStandardMaterial({ map: TX.barkTexture(), roughness: 1 });
    const logGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.78, 7);
    logGeo.rotateZ(Math.PI / 2);
    const slots = [[-0.11, 0.09], [0.11, 0.09], [0, 0.26], [0, 0.43]];
    for (const p of logPiles) {
      const holder = new THREE.Group();
      holder.position.copy(p.pos);
      holder.rotation.y = p.rot;
      const meshes = [];
      for (let i = 0; i < p.n; i++) {
        const m = new THREE.Mesh(logGeo, bark);
        m.position.set(0, slots[i][1], slots[i][0] * 1.4);
        m.rotation.y = (Math.random() - 0.5) * 0.25;
        m.castShadow = true;
        holder.add(m); meshes.push(m);
      }
      this.scene.add(holder);
      this.pickups.push({ type: 'pile', pos: p.pos.clone().setY(0.3), obj: holder, meshes, n0: p.n, n: p.n, taken: false });
    }
    chairs.forEach((c, i) => {
      const obj = make('furniture/chair', S * 0.95, null);
      obj.position.copy(c.pos);
      obj.rotation.y = c.rot;
      obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.6); o.castShadow = true; } });
      const blocker = { x: c.pos.x, y: 0.45, z: c.pos.z, hx: 0.3, hy: 0.45, hz: 0.3 };
      this.pickups.push({ type: 'chair', id: `chair${i}`, pos: c.pos.clone().setY(0.5), obj, blocker, taken: false });
    });
    for (const b of batteries) {
      const obj = make('food/can-small', 1.0, 0x40ff80, 1.4);
      this.pickups.push({ type: 'battery', pos: b.pos.clone().setY(0.2), obj, taken: false, baseY: 0.12, spin: true });
    }
    for (const n of notes) {
      const obj = make('furniture/books', 1.6, 0xfff0c0, 0.35);
      this.pickups.push({ type: 'note', text: n.text, pos: n.pos.clone(), obj, taken: false, baseY: 0.384 * S - 0.05 + 0.0, onTable: true });
    }
    // notes lie on the floor or a surface: put them on the floor if no furniture is meant
    for (const p of this.pickups) {
      if (p.type === 'battery') p.obj.position.set(p.pos.x, p.baseY, p.pos.z);
      if (p.type === 'note') { p.baseY = 0; p.obj.position.set(p.pos.x, 0.01, p.pos.z); p.pos.y = 0.25; }
    }
  }

  resetPickups() {
    for (const p of this.pickups) {
      p.taken = false;
      p.obj.visible = true;
      if (p.type === 'pile') { p.n = p.n0; p.meshes.forEach((m) => { m.visible = true; }); }
      if (p.type === 'chair') this.physics.addBlocker(p.id, p.blocker);
    }
  }

  // ------------------------------------------------------------------ input and flow
  bindEvents() {
    document.getElementById('startBtn').addEventListener('click', () => this.start());
    document.getElementById('resumeBtn').addEventListener('click', () => this.resume());
    document.getElementById('restartBtn').addEventListener('click', () => this.restart());
    document.getElementById('restartBtn2').addEventListener('click', () => this.restart());
    document.getElementById('winBtn').addEventListener('click', () => this.restart());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && (this.state === 'dead' || this.state === 'won')) this.restart();
      if (e.code === 'Escape' && this.opts.nolock && this.state === 'playing') this.pause();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && (this.state === 'playing' || this.state === 'note') && !this.opts.nolock) this.pause();
    });
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.opts.nolock && document.pointerLockElement !== this.canvas) this.lock();
    });
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.composer.setSize(window.innerWidth, window.innerHeight, false);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
  }

  lock() {
    if (this.opts.nolock) return;
    try { const p = this.canvas.requestPointerLock(); p?.catch?.(() => {}); } catch { /* browser refused; click the canvas to retry */ }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  async start() {
    await this.audio.init(this.soundBytes);
    this.lock();
    this.newRun();
  }

  newRun() {
    this.time = 0;
    this.fuel = START_FUEL;
    this.logs = 0;
    this.logsBurned = 0;
    this.batteriesUsed = 0;
    this.deadT = 0;
    this.dawnT = 0;
    this.phase = 0;
    this.dawnStarted = false;
    this.outageToast = false;
    this.stingerT = rand(18, 28);
    this.audio.stopAll();
    this.resetPickups();
    this.player.reset(this.level.spawn.pos, this.level.spawn.yaw);
    this.enemy.reset();
    this.enemy.speedBoost = 0;
    this.audio.resume();
    this.audio.loop('wind', 'wind', 0.2);
    this.audio.loop('fire', 'crackle', 0.4);
    this.audio.loop('amb1', 'ambient1', 0.12, 0.7);
    this.audio.loop('drone', 'ambient2', 0.0, 0.5);
    this.player.enabled = true;
    this.state = 'playing';
    ui.screen(null);
    ui.setPrompt(null);
    this.updateObjective();
    ui.toast('Snowed in. The hunger moon is up. Keep the fire alive until dawn.', 6500);
    this.clock.getDelta();
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'note') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.player.enabled = false;
    this.audio.suspend();
    ui.screen('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.lock();
    this.audio.resume();
    this.state = this.prevState === 'note' ? 'note' : 'playing';
    this.player.enabled = this.state === 'playing';
    ui.screen(this.state === 'note' ? 'note' : null);
    this.clock.getDelta();
  }

  restart() { this.lock(); this.newRun(); }

  onCaught() {
    this.state = 'dying';
    this.player.enabled = false;
    this.deadT = 0;
    ui.setPrompt(null);
    ui.note(null);
  }

  win() {
    this.state = 'won';
    this.player.enabled = false;
    this.unlock();
    this.audio.stopAll();
    this.audio.play('doorOpen', 0.4, 0.7);
    ui.el.winText.textContent = `You kept the fire through the night. Logs burned: ${this.logsBurned}. Torch cells used: ${this.batteriesUsed}.`;
    ui.screen('win');
  }

  die() {
    this.state = 'dead';
    this.unlock();
    this.audio.stopAll();
    const left = Math.max(0, Math.round(this.nightLen - this.time));
    ui.el.deadText.textContent = `${this.clockText()}. Dawn was ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} away. The fire was ${this.fuel > 0 ? 'still burning' : 'out'}.`;
    ui.screen('dead');
  }

  // ------------------------------------------------------------------ helpers
  clockText(p = this.time / this.nightLen) {
    const minutes = 22 * 60 + Math.min(1, p) * 8 * 60;
    const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  fireLevel() { return Math.min(1, this.fuel / 60); }

  insideLodge() {
    const l = this.level.lodge, p = this.player.pos;
    return p.x > l.x0 && p.x < l.x1 && p.z > l.z0 && p.z < l.z1;
  }

  // ------------------------------------------------------------------ actions
  toggleLight() {
    if (this.state !== 'playing') return;
    const p = this.player;
    if (p.battery <= 0) { ui.toast('The torch is dead.', 2000); return; }
    p.flashlightOn = !p.flashlightOn;
    this.audio.play('metal3', 0.18, 2.2);
  }

  updateObjective() {
    const left = Math.max(0, Math.ceil(this.nightLen - this.time));
    ui.objective(`Keep the fire alive until dawn. ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} to go.`);
  }

  findTarget() {
    const p = this.player;
    let best = null, bestScore = 0;
    const to = new THREE.Vector3();
    const consider = (pos, kind, ref, range = 2.4, minDot = 0.8) => {
      to.subVectors(pos, p.eye);
      const d = to.length();
      if (d > range) return;
      const dot = to.normalize().dot(p.forward);
      if (dot < minDot) return;
      const score = dot - d * 0.05;
      const probe = to.set(0, 0, 0).copy(pos).lerp(p.eye, Math.min(0.5, 0.45 / d));
      if (score > bestScore && this.physics.clearLine(p.eye, probe)) { best = { kind, ref }; bestScore = score; }
    };
    for (const k of this.pickups) if (!k.taken) consider(k.pos, 'pickup', k);
    consider(new THREE.Vector3(this.level.hearth.x, 0.7, this.level.hearth.z - 0.2), 'hearth', null, 3.0, 0.72);
    return best;
  }

  interact() {
    if (this.state === 'note') { this.closeNote(); return; }
    if (this.state !== 'playing') return;
    const t = this.findTarget();
    if (!t) return;
    if (t.kind === 'hearth') { this.feedFire(); return; }
    const k = t.ref;
    if (k.type === 'note') {
      this.audio.play('paper', 0.5);
      this.state = 'note';
      this.player.enabled = false;
      ui.setPrompt(null);
      ui.note(k.text);
      return;
    }
    if (k.type === 'pile') {
      if (this.logs >= MAX_CARRY) { ui.toast('Your arms are full.', 1600); return; }
      this.logs++;
      k.n--;
      k.meshes[k.n].visible = false;
      if (k.n === 0) k.taken = true;
      this.audio.play('slam3', 0.22, 1.7);
      this.enemy.hear(k.pos, 5);
      return;
    }
    if (k.type === 'chair') {
      k.taken = true;
      k.obj.visible = false;
      this.physics.removeBlocker(k.id);
      this.fuel = Math.min(MAX_FUEL, this.fuel + CHAIR_FUEL);
      this.audio.play('glass', 0.35, 0.55);
      this.audio.play('slam2', 0.5, 1.2);
      this.enemy.hear(this.player.pos, 15);
      ui.toast('You smash the chair into the fire. It will hear that.', 3200);
      return;
    }
    k.taken = true;
    k.obj.visible = false;
    if (k.type === 'battery') {
      this.player.addBattery(BATTERY_PICKUP);
      this.batteriesUsed++;
      this.audio.play('key2', 0.5, 1.4);
      ui.toast('Torch cell +35%', 2200);
    }
  }

  feedFire() {
    if (this.logs <= 0) {
      ui.toast(this.fuel > 0 ? 'The fire needs wood. Bring logs from the sheds.' : 'Cold ashes. You need wood.', 2200);
      return;
    }
    if (this.fuel >= MAX_FUEL - 5) { ui.toast('The fire is roaring already.', 1500); return; }
    this.logs--;
    this.logsBurned++;
    const wasOut = this.fuel <= 0;
    this.fuel = Math.min(MAX_FUEL, this.fuel + LOG_FUEL);
    this.audio.play('slam3', 0.3, 1.1);
    this.outageToast = false;
    if (wasOut) ui.toast('The embers catch. Light returns.', 2500);
  }

  closeNote() {
    this.state = 'playing';
    this.player.enabled = true;
    ui.note(null);
    ui.screen(null);
  }

  farSound(key, volume) {
    const wp = this.level.waypoints.filter((w) => w.distanceTo(this.player.pos) > 12);
    if (!wp.length) return;
    this.audio.playAt(pick(wp).clone().setY(1.4), key, { volume, ref: 3, max: 70, rolloff: 1 });
  }

  // ------------------------------------------------------------------ per-frame
  updateNight(dt) {
    const p = this.time / this.nightLen;
    this.phase = p;
    // fuel burns faster as the cold deepens
    if (this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - dt * (1 + 0.5 * Math.min(p, 1)));
      if (this.fuel <= 0 && !this.outageToast) {
        this.outageToast = true;
        ui.toast('The fire is out. The dark is closing in.', 4000);
        this.farSound('howl', 0.8);
      }
    }
    const e = this.enemy;
    if (p > 0.33 && e.speedBoost < 1) { e.speedBoost = 1; ui.toast('The cold deepens. Something circles closer.', 4000); this.farSound('monster2', 0.9); }
    if (p > 0.55 && e.speedBoost < 2) { e.speedBoost = 2; e.hunt = true; e.huntT = 3; ui.toast('It has your scent now.', 4000); this.farSound('howl', 0.9); }
    if (p > 0.8 && e.speedBoost < 3) { e.speedBoost = 3; ui.toast('The sky is paling in the east. Hold on.', 4500); }
    if (p >= 1 && !this.dawnStarted) {
      this.dawnStarted = true;
      e.flee();
      ui.toast('Dawn. It screams and runs for the trees.', 5000);
    }
    if (this.dawnStarted) { this.dawnT += dt; if (this.dawnT > 7 && this.state === 'playing') this.win(); }
    this.updateObjective();
  }

  updateAtmosphere(dt) {
    // sky and fog drift toward dawn over the last 15% of the night
    const k = THREE.MathUtils.smoothstep(this.phase, 0.82, 1.02);
    const col = NIGHT_COLOR.clone().lerp(DAWN_COLOR, k);
    this.scene.background.copy(SKY_NIGHT).lerp(DAWN_COLOR, k);
    this.scene.fog.color.copy(col);
    this.scene.fog.density = THREE.MathUtils.lerp(0.027, 0.018, k);
    this.ambient.intensity = 0.5 + 0.9 * k;
    this.fire.update(dt, this.fuel, this.time);
    const inside = this.insideLodge();
    this.snow.update(dt, this.camera.position, this.time, !inside);
    // sounds
    const d = this.player.pos.distanceTo(this.level.hearth);
    this.audio.setLoopVolume('fire', this.fuel > 0 ? 0.55 * this.fireLevel() * Math.max(0, 1 - d / 24) + 0.04 : 0.0);
    this.audio.setLoopVolume('wind', inside ? 0.07 : 0.22);
  }

  updateFlashlight() {
    const p = this.player;
    let k = 1;
    if (p.battery < 20) k = Math.random() < (p.battery < 6 ? 0.5 : 0.12) ? rand(0.1, 0.5) : 1;
    this.flashlight.intensity = p.flashlightOn ? 34 * k : 0;
  }

  updateFx(dt) {
    const e = this.enemy;
    let fear = 0;
    if (e.state !== STATE.DORMANT && e.state !== STATE.FLEE) {
      const d = e.distToPlayer();
      fear = THREE.MathUtils.clamp(1 - d / 16, 0, 1);
      if (e.state === STATE.CHASE) fear = Math.max(fear, 0.55);
    }
    this.fear = THREE.MathUtils.lerp(this.fear ?? 0, fear, Math.min(1, dt * 3));
    const f = this.fear;
    this.fx.vignette.darkness = 0.75 + f * 0.25;
    this.fx.vignette.offset = 0.28 - f * 0.12;
    this.fx.noise.blendMode.opacity.value = 0.32 + f * 0.3;
    this.audio.setLoopVolume('drone', Math.min(0.7, f * 0.9));
    this.camera.fov = 72 + f * 4;
    this.camera.updateProjectionMatrix();
  }

  updateAmbientScares(dt) {
    this.stingerT -= dt;
    if (this.stingerT > 0) return;
    this.stingerT = rand(14, 30) * (1 - this.phase * 0.4);
    if (Math.random() < 0.4) this.farSound(pick(['slam1', 'slam2', 'slam3', 'metal1', 'glass']), 0.7);
    else this.farSound(pick(['weird5', 'weird9', 'weird12', 'weird17', 'weird21', 'weird26']), 0.7);
  }

  updatePickups(dt) {
    const t = this.time;
    for (const k of this.pickups) {
      if (k.taken || !k.spin) continue;
      k.obj.rotation.y += dt * 1.4; k.obj.position.y = k.baseY + Math.sin(t * 2 + k.pos.x) * 0.04;
    }
    const target = this.state === 'playing' ? this.findTarget() : null;
    let text = null;
    if (target) {
      if (target.kind === 'hearth') text = this.logs > 0 ? `[E] Feed the fire (${this.logs} log${this.logs > 1 ? 's' : ''})` : '[E] Check the fire';
      else {
        const r = target.ref;
        text = { pile: `[E] Take a log (${r.n} left here)`, chair: '[E] Smash the chair for fuel (loud)', battery: '[E] Take torch cell', note: '[E] Read note' }[r.type];
      }
    }
    ui.setPrompt(text);
  }

  step() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing' || this.state === 'note' || this.state === 'dying') {
      this.time += dt;
      this.player.update(dt);
      this.enemy.update(dt);
      if (this.state !== 'dying') this.updateNight(dt);
      this.updateAtmosphere(dt);
      this.updateFlashlight();
      this.updateFx(dt);
      this.updatePickups(dt);
      this.updateAmbientScares(dt);
      ui.hud({ battery: this.player.battery, stamina: this.player.stamina, fire: this.fireLevel(), fuel: this.fuel, logs: this.logs, max: MAX_CARRY, clock: this.clockText() });
      if (this.state === 'dying') {
        this.deadT += dt;
        const e = this.enemy;
        const want = Math.atan2(-(e.pos.x - this.player.pos.x), -(e.pos.z - this.player.pos.z));
        let dy = want - this.player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.player.yaw += dy * Math.min(1, dt * 10);
        this.player.pitch += (0.15 - this.player.pitch) * Math.min(1, dt * 6);
        this.player.applyCamera(dt);
        if (this.deadT > 1.4) this.die();
      }
    } else if (this.state === 'title' || this.state === 'paused' || this.state === 'dead' || this.state === 'won') {
      if (this.state === 'title') {
        this.camera.position.set(this.level.spawn.pos.x, 1.6, this.level.spawn.pos.z);
        this.fire.update(dt, this.fuel, performance.now() / 1000);
      }
    }
    this.composer.render(dt);
  }

  run() {
    this.renderer.setAnimationLoop(() => this.step());
  }
}
