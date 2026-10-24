import * as THREE from 'three';

/**
 * The stalker: a user-supplied rigged creature with one authored clip (an in-place idle loop).
 * Walk, run, stun and attack do not exist as clips, so they are posed here: the idle clip plays
 * underneath and named bones are rotated on top of it, in the creature's own frame
 * (forward = -Z, up = +Y, lateral = +X in the glTF scene).
 */

const LAT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

export const CREATURE_HEIGHT = 1.9; // metres, feet to antler tips
const SCALE = 0.32; // model units -> metres (5.9 units tall)

// Gait tuning, radians unless noted. Sign: +pitch swings a hanging limb toward the front.
const GAIT = {
  walk: { stride: 2.1, thigh: 0.5, knee: 0.55, arm: 0.5, elbow: 0.4, twist: 0.16, tail: 0.3, bob: 0.035, lean: 0.05 },
  run: { stride: 3.2, thigh: 0.85, knee: 0.95, arm: 0.85, elbow: 0.7, twist: 0.26, tail: 0.5, bob: 0.07, lean: 0.32 },
};

const TAIL = ['C_base_tail_J_01', 'C_tail_01_J_02', 'C_tail_02_J_03', ...Array.from({ length: 14 }, (_, i) => {
  const n = i + 1; return `C_Bone_tail_${String(n).padStart(2, '0')}_J_${n + 3}`;
})];

const _p = new THREE.Quaternion();
const _m = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _d = new THREE.Quaternion();

export class Creature {
  /** @param {{scene: THREE.Group, animations: THREE.AnimationClip[]}} gltf */
  constructor(gltf) {
    this.model = gltf.scene;
    this.model.scale.setScalar(SCALE);
    this.model.rotation.y = Math.PI; // creature faces -Z; the game moves toward +Z for yaw 0
    this.object = new THREE.Group();
    this.object.add(this.model);

    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false;
        const m = o.material;
        if (m) {
          m.envMapIntensity = 0;
          if (m.name === 'Deer_head1') { m.transparent = false; m.alphaTest = 0; m.depthWrite = true; }
        }
      }
    });

    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });

    this.mixer = new THREE.AnimationMixer(this.model);
    this.idle = this.mixer.clipAction(gltf.animations[0]);
    this.idle.play();

    this.phase = 0;
    this.w = { walk: 0, run: 0, stun: 0, attack: 0 };
    this.mode = 'idle';
    this.attackT = 0;
    this.t = 0;
    this.baseY = 0;
    this.setGround();
  }

  /** Put the lowest foot on y = 0 using the idle pose at time 0. */
  setGround() {
    this.idle.time = 0;
    this.mixer.update(0);
    this.model.position.set(0, 0, 0);
    this.object.updateMatrixWorld(true);
    let minY = Infinity;
    const v = new THREE.Vector3();
    const hip = this.bones['C_Hip_J_00'];
    if (hip) { hip.getWorldPosition(v); this.baseX = -v.x; this.baseZ = -v.z; } else { this.baseX = 0; this.baseZ = 0; }
    for (const n of ['L_toe_J_077', 'R_toe_J_083', 'L_feet_J_076', 'R_feet_J_082']) {
      const b = this.bones[n]; if (!b) continue;
      b.getWorldPosition(v); minY = Math.min(minY, v.y);
    }
    this.baseY = -minY + 0.02;
    this.model.position.set(this.baseX, this.baseY, this.baseZ);
  }

  // ------------------------------------------------------------------ posing helpers
  /** Rotate a bone about an axis given in the creature's own (glTF scene) frame. */
  rot(name, axis, angle) {
    const bone = this.bones[name];
    if (!bone || !angle) return;
    bone.parent.getWorldQuaternion(_p);
    this.model.getWorldQuaternion(_m);
    _p.premultiply(_m.invert()); // parent rotation in creature space
    _r.setFromAxisAngle(axis, angle);
    _d.copy(_p).invert().multiply(_r).multiply(_p);
    bone.quaternion.premultiply(_d);
  }

  pitch(name, a) { this.rot(name, LAT, a); }
  yaw(name, a) { this.rot(name, UP, a); }

  // ------------------------------------------------------------------ per frame
  /**
   * @param {number} dt seconds
   * @param {{mode: 'idle'|'walk'|'run'|'stun'|'attack', speed: number}} s speed in m/s along the ground
   */
  update(dt, { mode = 'idle', speed = 0 } = {}) {
    if (mode !== this.mode) { if (mode === 'attack') this.attackT = 0; this.mode = mode; }
    this.t += dt;
    const k = Math.min(1, dt * 7);
    const target = { walk: mode === 'walk' ? 1 : 0, run: mode === 'run' ? 1 : 0, stun: mode === 'stun' ? 1 : 0, attack: mode === 'attack' ? 1 : 0 };
    for (const key of Object.keys(this.w)) this.w[key] += (target[key] - this.w[key]) * k;
    if (mode === 'attack') this.attackT += dt;

    const stride = mode === 'run' ? GAIT.run.stride : GAIT.walk.stride;
    if (mode === 'walk' || mode === 'run') this.phase += (speed * dt / stride) * Math.PI * 2;

    this.idle.timeScale = mode === 'run' ? 1.8 : mode === 'walk' ? 1.2 : mode === 'stun' ? 2.5 : 0.8;
    this.mixer.update(dt);
    this.pose();
  }

  pose() {
    const { walk, run, stun, attack } = this.w;
    const mv = walk + run;
    const ph = this.phase;
    const s = Math.sin(ph);
    const g = (key) => walk * GAIT.walk[key] + run * GAIT.run[key];
    const sm = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

    // Attack: wind up (rear back, jaw open), then strike (lunge forward, arms thrust out).
    const wind = attack * sm(this.attackT / 0.25);
    const strike = attack * sm((this.attackT - 0.22) / 0.18);

    // Positive angles on the lateral axis: hanging limbs swing forward, upright spine leans BACK.
    // `lean` below is forward lean (positive = forward).
    const lean = g('lean') + 0.3 * strike - 0.35 * wind - 0.4 * stun;

    // ---- body bob and lunge
    this.model.position.y = this.baseY + g('bob') * Math.abs(Math.sin(ph)) * mv;
    this.object.position.z = 0.5 * strike; // object frame: +Z is the creature's forward

    // ---- spine: lean, counter-twist
    this.pitch('C_spine_01_J_018', -lean * 0.4);
    this.pitch('C_spine_02_J_019', -lean * 0.3);
    this.pitch('C_spine_03_J_020', -lean * 0.2);
    this.yaw('C_spine_02_J_019', g('twist') * s);
    this.yaw('C_spine_04_J_021', -g('twist') * 0.7 * s);

    // ---- neck and head: stay level against the lean, rise to roar, shake when blinded
    this.pitch('C_Neck_J_022', lean * 0.5 + run * 0.1 * Math.sin(ph * 2) + 0.5 * wind + 0.2 * stun);
    this.pitch('C_Head_J_023', lean * 0.4 + 0.5 * wind - 0.5 * strike + 0.3 * stun);
    this.yaw('C_Head_J_023', stun * 0.5 * Math.sin(this.t * 38) - g('twist') * 0.5 * s);
    this.pitch('C_jaw__J_026', 1.0 * wind + 0.8 * stun + 0.18 * run + 0.03 * Math.sin(this.t * 3));

    // ---- legs, opposite phase; the knee folds while the foot swings forward
    for (const [side, off, ids] of [['L', 0, ['072', '073', '074']], ['R', Math.PI, ['078', '079', '080']]]) {
      const swing = g('thigh') * Math.sin(ph + off);
      const flex = g('knee') * Math.max(0, Math.cos(ph + off));
      this.pitch(`${side}_upper_leg_J_${ids[0]}`, swing);
      this.pitch(`${side}_knee_J_${ids[1]}`, -flex);
      this.pitch(`${side}_ankle_J_${ids[2]}`, -swing * 0.3 + flex * 0.5);
    }

    // ---- arms swing against the leg on the same side; stun shields the face, strike thrusts forward
    for (const [side, off, ids] of [['L', Math.PI, ['034', '035']], ['R', 0, ['053', '054']]]) {
      const sp = Math.sin(ph + off), cp = Math.cos(ph + off);
      this.pitch(`${side}_shoulder_J_${ids[0]}`, g('arm') * sp + 1.9 * stun + 1.4 * strike - 0.5 * wind);
      this.pitch(`${side}_elbow_J_${ids[1]}`, g('elbow') * Math.max(0, cp) + 1.1 * stun + 0.3 * strike);
    }

    // ---- tail whips side to side, travelling down its length
    for (let i = 0; i < TAIL.length; i++) {
      this.yaw(TAIL[i], g('tail') * 0.28 * Math.sin(ph - i * 0.35) + stun * 0.25 * Math.sin(this.t * 20 - i));
    }
  }
}
