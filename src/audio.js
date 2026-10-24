import * as THREE from 'three';

/** Thin wrapper over three.js audio: one listener on the camera, looped beds, one-shots, positional one-shots. */
export class GameAudio {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.listener = null;
    this.buffers = {};
    this.loops = {};
    this.ready = false;
  }

  /** Call from a user gesture. Creates the AudioContext and decodes the preloaded bytes. */
  async init(bytes) {
    if (this.ready) { await this.listener.context.resume(); return; }
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    const ctx = this.listener.context;
    await ctx.resume();
    await Promise.all(Object.entries(bytes).map(async ([key, buf]) => {
      try { this.buffers[key] = await ctx.decodeAudioData(buf.slice(0)); }
      catch (e) { console.warn(`could not decode sound ${key}`, e); }
    }));
    this.ready = true;
    this.listener.setMasterVolume(0.9);
  }

  suspend() { this.listener?.context.suspend(); }
  resume() { this.listener?.context.resume(); }

  /** Start (or retune) a looping non-positional bed. */
  loop(name, key, volume = 0.3, rate = 1) {
    if (!this.ready || !this.buffers[key]) return null;
    let a = this.loops[name];
    if (!a) {
      a = new THREE.Audio(this.listener);
      a.setBuffer(this.buffers[key]);
      a.setLoop(true);
      this.loops[name] = a;
    }
    a.setVolume(volume);
    a.setPlaybackRate(rate);
    if (!a.isPlaying) a.play();
    return a;
  }

  setLoopVolume(name, v) { this.loops[name]?.setVolume(v); }
  stopLoop(name) { const a = this.loops[name]; if (a?.isPlaying) a.stop(); }
  stopAll() { for (const n of Object.keys(this.loops)) this.stopLoop(n); }

  play(key, volume = 0.6, rate = 1) {
    if (!this.ready || !this.buffers[key]) return;
    const a = new THREE.Audio(this.listener);
    a.setBuffer(this.buffers[key]);
    a.setVolume(volume);
    a.setPlaybackRate(rate);
    a.onEnded = () => { a.isPlaying = false; a.disconnect(); };
    a.play();
  }

  /** Positional one-shot. target is a THREE.Vector3 (fixed point) or an Object3D (follows it). */
  playAt(target, key, { volume = 0.8, rate = 1, ref = 2.5, max = 45, rolloff = 1.4 } = {}) {
    if (!this.ready || !this.buffers[key]) return;
    const a = new THREE.PositionalAudio(this.listener);
    a.setBuffer(this.buffers[key]);
    a.setDistanceModel('inverse');
    a.setRefDistance(ref);
    a.setMaxDistance(max);
    a.setRolloffFactor(rolloff);
    a.setVolume(volume);
    a.setPlaybackRate(rate);
    const parent = target.isObject3D ? target : this.scene;
    if (!target.isObject3D) a.position.copy(target);
    parent.add(a);
    a.onEnded = () => { a.isPlaying = false; a.disconnect(); parent.remove(a); };
    a.play();
  }
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
