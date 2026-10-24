import * as THREE from 'three';
import { Player, BATTERY_PICKUP } from './player.js';
import { Enemy, STATE } from './enemy.js';
import { GameAudio, rand, pick } from './audio.js';
import { ui } from './ui.js';
import { C, S } from './level.js';

const STEPS = ['step0', 'step1', 'step2', 'step3', 'step4'];
const DOOR_T = 0.05 * S;

export class Game {
  constructor({ renderer, composer, fx, world, physics, models, level, query, soundBytes, opts }) {
    this.renderer = renderer;
    this.composer = composer;
    this.fx = fx;
    this.scene = world.scene;
    this.camera = world.camera;
    this.flashlight = world.flashlight;
    this.lampLights = world.lampLights;
    this.ambient = world.ambient;
    this.physics = physics;
    this.models = models;
    this.level = level;
    this.soundBytes = soundBytes;
    this.opts = opts;
    this.canvas = renderer.domElement;

    this.scene.add(level.group);
    physics.addStaticBoxes(level.colliders);

    this.audio = new GameAudio(this.scene, this.camera);
    this.player = new Player(this.camera, physics, this.canvas, { requireLock: !opts.nolock });
    this.enemy = new Enemy({ models, scene: this.scene, level, query, physics, audio: this.audio, player: this.player });

    this.state = 'title';
    this.time = 0;
    this.keysFound = 0;
    this.batteriesUsed = 0;
    this.flashT = 0;
    this.stingerT = 20;
    this.alarm = false;
    this.deadT = 0;
    this.clock = new THREE.Clock();
    this.mixers = [];

    this.buildPickups();
    this.buildExit();
    this.setupLamps();
    this.bindEvents();

    this.player.onStep = (running) => {
      this.audio.play(pick(STEPS), running ? 0.5 : 0.28, rand(0.9, 1.1));
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
    const { keys, batteries, notes } = this.level.pickups;
    this.pickups = [];
    const make = (name, scale, emissive, intensity) => {
      const o = this.models[name].scene.clone(true);
      const box = this.models[name].box;
      const c = box.getCenter(new THREE.Vector3());
      o.position.set(-c.x, -box.min.y, -c.z);
      const holder = new THREE.Group();
      holder.add(o);
      holder.scale.setScalar(scale);
      this.tint(o, emissive, intensity);
      this.scene.add(holder);
      return holder;
    };
    for (const k of keys) {
      const obj = make('platformer/key', 1.3, 0xffc040, 1.1);
      this.pickups.push({ type: 'key', index: k.index, pos: k.pos.clone(), obj, taken: false, baseY: k.pos.y, spin: true });
    }
    for (const b of batteries) {
      const obj = make('food/can-small', 1.0, 0x40ff80, 1.4);
      this.pickups.push({ type: 'battery', pos: b.pos.clone().setY(0.2), obj, taken: false, baseY: 0.12, spin: true });
    }
    for (const n of notes) {
      const obj = make('furniture/books', 1.6, 0xfff0c0, 0.35);
      this.pickups.push({ type: 'note', text: n.text, pos: n.pos.clone(), obj, taken: false, baseY: n.pos.y - 0.08, spin: false });
    }
    for (const p of this.pickups) p.obj.position.set(p.pos.x, p.baseY, p.pos.z);
  }

  buildExit() {
    const exit = this.level.exitPos;
    const wallZ = exit.z + DOOR_T / 2;
    const doorX = exit.x + 0.005 * C;
    this.exit = { x: doorX, z: wallZ, open: false, opening: 0 };

    const door = this.models['prototype/door-sliding-double-wide'].scene.clone(true);
    const holder = new THREE.Group();
    holder.add(door);
    holder.scale.set(0.34, 2.7, 0.75);
    holder.rotation.y = Math.PI / 2;
    holder.position.set(doorX, 0, wallZ);
    door.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.6); o.castShadow = true; } });
    this.scene.add(holder);
    this.doorMixer = new THREE.AnimationMixer(door);
    const clip = this.models['prototype/door-sliding-double-wide'].animations.find((a) => a.name === 'open');
    this.doorAction = this.doorMixer.clipAction(clip);
    this.doorAction.setLoop(THREE.LoopOnce, 1);
    this.doorAction.clampWhenFinished = true;

    const lock = this.models['platformer/lock'].scene.clone(true);
    const lb = this.models['platformer/lock'].box;
    const lholder = new THREE.Group();
    lock.position.set(-lb.getCenter(new THREE.Vector3()).x, -lb.min.y, -lb.getCenter(new THREE.Vector3()).z);
    lholder.add(lock);
    lholder.scale.setScalar(1.3);
    lholder.position.set(exit.x + 0.95 * C * 0.55, 1.15, exit.z - 0.1);
    lholder.rotation.y = Math.PI;
    this.tint(lock, 0xff2a1a, 0.8);
    this.scene.add(lholder);
    this.lockModel = lock;

    this.blocker = { x: doorX, y: 1.1, z: wallZ, hx: 0.55, hy: 1.1, hz: 0.18 };
    this.physics.addBlocker('exit', this.blocker);
  }

  setupLamps() {
    this.lamps = this.level.lamps;
    this.lampMatOn = this.lamps[0].matOn;
    this.lampMatOff = this.lamps[0].matOff;
  }

  resetLamps() {
    this.lampMatOn.emissive.set(0xffa24a);
    this.lampMatOn.color.set(0xffd9a0);
    this.lamps.forEach((l, i) => {
      l.dead = i !== 15 && Math.random() < 0.22;
      l.flicker = 0;
      l.on = !l.dead;
      l.next = rand(3, 12);
      this.setLampVisual(l, l.on);
    });
  }

  setLampVisual(l, on) {
    for (const m of l.meshes) m.material = on ? this.lampMatOn : this.lampMatOff;
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
    this.keysFound = 0;
    this.batteriesUsed = 0;
    this.time = 0;
    this.alarm = false;
    this.deadT = 0;
    this.stingerT = rand(18, 28);
    this.exit.open = false;
    this.doorAction.stop();
    this.doorMixer.update(0);
    this.physics.addBlocker('exit', this.blocker);
    this.audio.stopAll();
    for (const p of this.pickups) { p.taken = false; p.obj.visible = true; }
    this.player.reset(this.level.spawn.pos, this.level.spawn.yaw);
    this.enemy.reset();
    this.resetLamps();
    this.lampMatOn.emissiveIntensity = 1.7;
    this.audio.resume();
    this.audio.loop('amb1', 'ambient1', 0.26);
    this.audio.loop('amb3', 'ambient3', 0.16, 0.8);
    this.audio.loop('noise', 'noise1', 0.05);
    this.audio.loop('drone', 'ambient2', 0.0, 0.5);
    this.player.enabled = true;
    this.state = 'playing';
    ui.screen(null);
    ui.setPrompt(null);
    this.updateObjective();
    ui.toast('You wake up. The lights are out. Find a way out.', 5000);
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

  restart() {
    this.lock();
    this.newRun();
  }

  onCaught() {
    this.state = 'dying';
    this.player.enabled = false;
    this.deadT = 0;
    ui.setPrompt(null);
    ui.note(null);
    this.audio.stopLoop('alarm');
  }

  win() {
    this.state = 'won';
    this.player.enabled = false;
    this.unlock();
    this.audio.stopAll();
    this.audio.play('doorOpen', 0.5, 0.8);
    const t = Math.round(this.time);
    ui.el.winText.textContent = `Out in ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}. Spare torch cells used: ${this.batteriesUsed}.`;
    ui.screen('win');
  }

  die() {
    this.state = 'dead';
    this.unlock();
    this.audio.stopAll();
    const t = Math.round(this.time);
    ui.el.deadText.textContent = `Keys found: ${this.keysFound} of 3. You lasted ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}.`;
    ui.screen('dead');
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
    if (this.exit.open) ui.objective('Get out.');
    else if (this.keysFound < 3) ui.objective(`Find the 3 keys: ${this.keysFound} / 3`);
    else ui.objective('All keys found. Unlock the exit at the south end of the hospital.');
  }

  findTarget() {
    const p = this.player;
    let best = null, bestScore = 0;
    const to = new THREE.Vector3();
    const consider = (pos, kind, ref) => {
      to.subVectors(pos, p.eye);
      const d = to.length();
      if (d > 2.4) return;
      const dot = to.normalize().dot(p.forward);
      if (dot < 0.8) return;
      const score = dot - d * 0.05;
      if (score > bestScore && this.physics.clearLine(p.eye, pos)) { best = { kind, ref }; bestScore = score; }
    };
    for (const k of this.pickups) if (!k.taken) consider(k.pos, 'pickup', k);
    consider(new THREE.Vector3(this.exit.x, 1.2, this.exit.z - 0.2), 'exit', null);
    return best;
  }

  interact() {
    if (this.state === 'note') { this.closeNote(); return; }
    if (this.state !== 'playing') return;
    const t = this.findTarget();
    if (!t) return;
    if (t.kind === 'exit') { this.tryExit(); return; }
    const k = t.ref;
    if (k.type === 'note') {
      this.audio.play('paper', 0.5);
      this.state = 'note';
      this.player.enabled = false;
      ui.setPrompt(null);
      ui.note(k.text);
      return;
    }
    k.taken = true;
    k.obj.visible = false;
    if (k.type === 'battery') {
      this.player.addBattery(BATTERY_PICKUP);
      this.batteriesUsed++;
      this.audio.play('key2', 0.5, 1.4);
      ui.toast('Torch cell +35%', 2200);
    } else {
      this.keysFound++;
      this.audio.play('key1', 0.7);
      this.enemy.hear(k.pos, 10);
      this.onKey(k.index);
      this.updateObjective();
    }
  }

  closeNote() {
    this.state = 'playing';
    this.player.enabled = true;
    ui.note(null);
    ui.screen(null);
  }

  onKey(index) {
    const e = this.enemy;
    e.speedBoost = index;
    this.flashT = 3;
    if (index === 1) {
      ui.toast('A door slams somewhere in the dark. Something is awake.', 5000);
      this.farSound(pick(['slam1', 'slam2']), 0.9);
      e.wake();
    } else if (index === 2) {
      ui.toast('The corridor lights are dying.', 4500);
      this.lamps.forEach((l, i) => { if (i < 15 && Math.random() < 0.7) { l.dead = true; l.on = false; this.setLampVisual(l, false); } });
      this.farSound('howl', 0.9);
    } else {
      ui.toast('An alarm starts. It knows where you are.', 5000);
      this.alarm = true;
      e.hunt = true;
      e.huntT = 4;
      this.audio.loop('alarm', 'alarm', 0.2);
      this.lampMatOn.emissive.set(0xff1a10);
      this.lampMatOn.color.set(0xff8a80);
    }
  }

  tryExit() {
    if (this.exit.open) return;
    if (this.keysFound < 3) {
      ui.toast(`Locked. ${3 - this.keysFound} key${3 - this.keysFound > 1 ? 's' : ''} missing.`, 2500);
      this.audio.play('metal2', 0.4, 0.8);
      return;
    }
    this.exit.open = true;
    this.audio.play('key2', 0.7, 0.9);
    this.enemy.hear(this.player.pos, 20);
    setTimeout(() => {
      this.audio.play('doorOpen', 0.9, 0.7);
      this.doorAction.reset().play();
      this.physics.removeBlocker('exit');
      this.tint(this.lockModel, 0x30ff60, 0.9);
    }, 700);
    this.updateObjective();
    ui.toast('The shutters grind open. Run!', 4000);
  }

  farSound(key, volume) {
    const wp = this.level.waypoints.filter((w) => w.distanceTo(this.player.pos) > 12);
    if (!wp.length) return;
    this.audio.playAt(pick(wp).clone().setY(1.4), key, { volume, ref: 3, max: 70, rolloff: 1 });
  }

  // ------------------------------------------------------------------ per-frame
  updateLamps(dt) {
    const eye = this.player.eye;
    for (const l of this.lamps) {
      if (l.dead) continue;
      l.next -= dt;
      if (l.next <= 0 && l.flicker <= 0) {
        const stress = 1 + this.keysFound * 0.6;
        if (Math.random() < 0.18 * stress) l.flicker = rand(0.25, 0.9);
        l.next = rand(2, 9) / stress;
      }
      if (this.flashT > 0 && Math.random() < dt * 4) l.flicker = Math.max(l.flicker, rand(0.2, 0.5));
      let on = true;
      if (l.flicker > 0) { l.flicker -= dt; on = Math.random() > 0.45; }
      if (on !== l.on) { l.on = on; this.setLampVisual(l, on); }
    }
    this.flashT = Math.max(0, this.flashT - dt);

    const alive = this.lamps.filter((l) => !l.dead && l.on).sort((a, b) => a.pos.distanceToSquared(eye) - b.pos.distanceToSquared(eye));
    const pulse = this.alarm ? 0.55 + 0.45 * Math.sin(this.time * 6) : 1;
    const color = this.alarm ? 0xff2a1a : 0xffb96b;
    this.lampLights.forEach((light, i) => {
      const l = alive[i];
      if (l && l.pos.distanceTo(eye) < 16) { light.position.copy(l.pos); light.intensity = 14 * pulse; light.color.setHex(color); }
      else light.intensity = 0;
    });
    this.lampMatOn.emissiveIntensity = this.alarm ? 1.0 + 1.0 * pulse : 1.7;
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
    if (e.state !== STATE.DORMANT) {
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
    this.stingerT = rand(14, 32) * (1 - this.keysFound * 0.15);
    if (Math.random() < 0.45) this.farSound(pick(['slam1', 'slam2', 'slam3', 'metal1', 'glass']), 0.8);
    else this.farSound(pick(['weird5', 'weird9', 'weird12', 'weird17', 'weird21', 'weird26']), 0.7);
  }

  updatePickups(dt) {
    const t = this.time;
    for (const k of this.pickups) {
      if (k.taken) continue;
      if (k.spin) { k.obj.rotation.y += dt * 1.4; k.obj.position.y = k.baseY + Math.sin(t * 2 + k.pos.x) * 0.04; }
    }
    const target = this.state === 'playing' ? this.findTarget() : null;
    let text = null;
    if (target) {
      if (target.kind === 'exit') text = this.keysFound >= 3 && !this.exit.open ? '[E] Unlock exit' : this.exit.open ? null : '[E] Try the lock';
      else text = { key: '[E] Take key', battery: '[E] Take torch cell', note: '[E] Read note' }[target.ref.type];
    }
    ui.setPrompt(text);
  }

  step() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.doorMixer.update(dt);
    if (this.state === 'playing' || this.state === 'note' || this.state === 'dying') {
      this.time += dt;
      this.player.update(dt);
      this.enemy.update(dt);
      this.updateLamps(dt);
      this.updateFlashlight();
      this.updateFx(dt);
      this.updatePickups(dt);
      this.updateAmbientScares(dt);
      ui.hud({ battery: this.player.battery, stamina: this.player.stamina, keys: this.keysFound });
      if (this.state === 'playing' && this.exit.open && this.player.pos.z > this.exit.z + 1.0) this.win();
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
      // keep the scene alive behind the menu
      if (this.state === 'title') this.camera.position.set(this.level.spawn.pos.x, 1.6, this.level.spawn.pos.z);
    }
    this.composer.render(dt);
  }

  run() {
    this.renderer.setAnimationLoop(() => this.step());
  }
}
