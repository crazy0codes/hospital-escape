import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export const PLAYER_RADIUS = 0.3;
export const PLAYER_HALF = 0.6; // capsule half-height (cylinder part); total height 1.8 m
export const EYE_HEIGHT = 1.6;

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.controller = this.world.createCharacterController(0.02);
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.body = null;
    this.collider = null;
    this.blockers = new Map();
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  addStaticBoxes(boxes) {
    for (const b of boxes) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z));
    }
  }

  /** A removable solid box (the locked exit). */
  addBlocker(name, b) {
    this.removeBlocker(name);
    this.blockers.set(name, this.world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z)));
  }

  removeBlocker(name) {
    const c = this.blockers.get(name);
    if (c) { this.world.removeCollider(c, false); this.blockers.delete(name); }
  }

  spawnPlayer(x, z) {
    if (this.body) this.world.removeRigidBody(this.body);
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, PLAYER_HALF + PLAYER_RADIUS, z));
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_HALF, PLAYER_RADIUS), this.body);
    this.world.step();
  }

  /** Moves the player by (dx, dz) with sliding collisions. Returns the new position. */
  movePlayer(dx, dz) {
    this.controller.computeColliderMovement(this.collider, { x: dx, y: 0, z: dz });
    const m = this.controller.computedMovement();
    const p = this.body.translation();
    this.body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y, z: p.z + m.z });
    this.world.step();
    const q = this.body.translation();
    return { x: q.x, z: q.z };
  }

  /** True if nothing solid lies between a and b (THREE.Vector3). The player body is ignored. */
  clearLine(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) return true;
    this._ray.origin = { x: a.x, y: a.y, z: a.z };
    this._ray.dir = { x: dx / dist, y: dy / dist, z: dz / dist };
    const hit = this.world.castRay(this._ray, dist, true, undefined, undefined, undefined, this.body);
    return hit === null || hit.timeOfImpact >= dist - 0.05;
  }
}

export { THREE };
