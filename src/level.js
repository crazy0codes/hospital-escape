import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 1 model unit == 1 cell == S metres. */
export const S = 2.2;
export const C = S;
export const WALL_H = 1.29 * S;
export const GRID_W = 28;
export const GRID_H = 22;
const T = 0.05 * S; // wall thickness
const EXT = T / 2; // wall end overlap so corners close
const DOOR_U0 = 0.29; // doorway opening, in cell units along the wall
const DOOR_U1 = 0.72;
const COLLIDER_T = 0.3; // collider wall thickness in metres

// id, x, y, w, h  (cells). Everything not listed is solid.
const RECTS = [
  ['C', 1, 6, 26, 1], ['C', 1, 7, 1, 8], ['C', 26, 7, 1, 8], ['C', 1, 14, 26, 1],
  ['R', 1, 1, 6, 5], ['A', 7, 1, 7, 5], ['B', 14, 1, 6, 5], ['P', 20, 1, 7, 5],
  ['W', 2, 7, 8, 7], ['L', 10, 7, 8, 7], ['Z', 18, 7, 8, 7],
  ['F', 1, 15, 8, 4], ['S', 9, 15, 7, 4], ['X', 16, 15, 11, 4],
  ['O', 19, 19, 5, 2],
];

// cell x, cell y, side
const DOORS = [
  [4, 5, 'S'], [10, 5, 'S'], [16, 5, 'S'], [22, 5, 'S'],
  [6, 3, 'E'], [13, 3, 'E'], [19, 3, 'E'],
  [2, 10, 'W'], [13, 7, 'N'], [21, 7, 'N'], [25, 10, 'E'],
  [9, 9, 'E'], [17, 9, 'E'],
  [4, 15, 'N'], [12, 15, 'N'], [20, 15, 'N'],
];
const EXIT = [21, 18, 'S'];

const LAMPS = [
  [2.5, 6.5], [7.5, 6.5], [12.5, 6.5], [17.5, 6.5], [22.5, 6.5], [26.5, 6.5],
  [1.5, 9], [1.5, 12], [26.5, 9], [26.5, 12],
  [2.5, 14.5], [7.5, 14.5], [12.5, 14.5], [17.5, 14.5], [22.5, 14.5],
  [4, 3.5], [10.5, 3.5], [17, 3.5], [23.5, 3.5], [6, 10.5], [14, 10.5], [22, 10], [5, 17], [12.5, 17], [21.5, 17],
];

const WAYPOINTS = [
  [1.5, 6.5], [7.5, 6.5], [13.5, 6.5], [19.5, 6.5], [26.5, 6.5], [26.5, 10.5], [26.5, 14.5],
  [20.5, 14.5], [13.5, 14.5], [7.5, 14.5], [1.5, 14.5], [1.5, 10.5],
  [3.8, 3.8], [10.5, 3.4], [17, 3.4], [23.5, 3.4], [6, 10.5], [14, 10.5], [22, 10.5], [5, 17], [12.5, 17], [21.5, 17],
];

const NOTES = [
  { pos: [5.0, 1.25], text: 'Night log, 01:40. Ward lights failed again. Exit shutters sealed at 02:00 by the board. Three keys open them: Ward A, the Pharmacy, the Boiler Room. Do not run. It hears you run.' },
  { pos: [16.3, 1.16], text: 'He was admitted for sleepwalking. He still walks the halls at night. Bright light makes him flinch. Keep your torch on him and he backs away. Do not count on it twice in a row.' },
  { pos: [15.4, 10.6], text: 'Spare cells are in the wards and the storage rooms. The torch dies without them. If the lights go out, find a wall and keep still. It follows noise before it follows light.' },
];

const cellToWorld = (cx, cy) => new THREE.Vector3(cx * C, 0, cy * C);

export function buildLevel(models) {
  const group = new THREE.Group();
  const grid = new Array(GRID_W * GRID_H).fill(null);
  for (const [id, x, y, w, h] of RECTS) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * GRID_W + i] = id;
  }
  const idAt = (x, y) => (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H ? null : grid[y * GRID_W + x]);

  // Edge keys: h:x,y is the line z=y*C between cells (x,y-1),(x,y); v:x,y is the line x=x*C between (x-1,y),(x,y).
  const doorKey = ([x, y, side]) => ({ N: `h:${x},${y}`, S: `h:${x},${y + 1}`, W: `v:${x},${y}`, E: `v:${x + 1},${y}` }[side]);
  const doorEdges = new Set(DOORS.map(doorKey));
  const exitEdge = doorKey(EXIT);

  const inst = new Instancer(models);
  const colliders = []; // metres: {x,y,z,hx,hy,hz}
  const furnitureBoxes = []; // cell units, dev placement checks
  const addCollider = (cx, cz, hx, hz, h = WALL_H) => colliders.push({ x: cx, y: h / 2, z: cz, hx, hy: h / 2, hz });

  // ---- floors and ceilings ----
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const q0 = new THREE.Quaternion();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const id = idAt(x, y);
      if (!id) continue;
      inst.add('furniture/floorFull', new THREE.Matrix4().compose(new THREE.Vector3(x * C, -0.05 * S, (y + 1) * C), q0, new THREE.Vector3(S, S, S)), 'floor');
      if (id !== 'O') {
        inst.add('furniture/floorFull', new THREE.Matrix4().compose(new THREE.Vector3(x * C, WALL_H + 0.05 * S, y * C), flip, new THREE.Vector3(S, S, S)), 'ceiling');
      }
    }
  }

  // ---- walls ----
  const doorways = []; // for dev checks and nav: {horizontal, x, y}
  const edgeWall = (horizontal, x, y) => {
    const a = horizontal ? idAt(x, y - 1) : idAt(x - 1, y);
    const b = idAt(x, y);
    if (a === b || (!a && !b)) return;
    const key = `${horizontal ? 'h' : 'v'}:${x},${y}`;
    const isDoor = doorEdges.has(key) || key === exitEdge;
    const name = isDoor ? 'furniture/wallDoorway' : 'furniture/wall';
    const len = C + 2 * EXT;
    if (horizontal) {
      inst.add(name, new THREE.Matrix4().compose(new THREE.Vector3(x * C - EXT, 0, y * C + T / 2), q0, new THREE.Vector3(len, S, S)), 'wall');
    } else {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      inst.add(name, new THREE.Matrix4().compose(new THREE.Vector3(x * C + T / 2, 0, (y + 1) * C + EXT), q, new THREE.Vector3(len, S, S)), 'wall');
    }
    // colliders
    const u0 = DOOR_U0 * C, u1 = DOOR_U1 * C;
    const segs = isDoor ? [[0, u0], [u1, C]] : [[0, C]];
    for (const [s0, s1] of segs) {
      const mid = (s0 + s1) / 2, half = (s1 - s0) / 2;
      if (horizontal) addCollider(x * C + mid, y * C, half, COLLIDER_T / 2);
      else addCollider(x * C, y * C + mid, COLLIDER_T / 2, half);
    }
    if (isDoor) doorways.push({ horizontal, x, y, exit: key === exitEdge });
  };
  for (let y = 0; y <= GRID_H; y++) for (let x = 0; x < GRID_W; x++) edgeWall(true, x, y);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x <= GRID_W; x++) edgeWall(false, x, y);

  // ---- furniture ----
  const room = (id) => RECTS.find((r) => r[0] === id);
  const P = (name, cx, cy, rot = 0, { collide = true, y = 0, room: roomId = null } = {}) => {
    const info = models[name];
    const c = info.box.getCenter(new THREE.Vector3());
    const m = new THREE.Matrix4()
      .makeTranslation(cx * C, y, cy * C)
      .multiply(new THREE.Matrix4().makeRotationY(rot))
      .multiply(new THREE.Matrix4().makeScale(S, S, S))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, 0, -c.z));
    inst.add(name, m, 'furniture');
    const wb = info.box.clone().applyMatrix4(m); // metres
    if (collide) {
      addCollider((wb.min.x + wb.max.x) / 2, (wb.min.z + wb.max.z) / 2, (wb.max.x - wb.min.x) / 2, (wb.max.z - wb.min.z) / 2, Math.max(wb.max.y, 0.4));
      furnitureBoxes.push({ name, roomId, min: [wb.min.x / C, wb.min.z / C], max: [wb.max.x / C, wb.max.z / C] });
    }
    return wb;
  };
  const PI = Math.PI;
  const rug = (cx, cy, rot = 0) => P('furniture/rugRectangle', cx, cy, rot, { collide: false });

  // Reception (spawn)
  P('furniture/bedSingle', 1.62, 2.3, PI / 2, { room: 'R' });
  P('furniture/sideTable', 1.17, 1.55, PI / 2, { room: 'R' });
  P('furniture/desk', 5.0, 1.25, 0, { room: 'R' });
  P('furniture/chairDesk', 5.0, 1.78, PI, { room: 'R' });
  P('furniture/bookcaseClosed', 3.4, 1.17, 0, { room: 'R' });
  P('furniture/bookcaseClosed', 3.9, 1.17, 0, { room: 'R' });
  P('furniture/trashcan', 6.7, 1.3, 0, { room: 'R' });
  for (const x of [1.5, 2.0, 2.5]) P('furniture/kitchenCabinet', x, 5.725, PI, { room: 'R' });
  P('furniture/chair', 6.5, 4.6, -PI / 2, { room: 'R' });
  P('furniture/chair', 6.5, 5.1, -PI / 2, { room: 'R' });
  rug(3.8, 3.6);

  // Ward A (key 1)
  for (const x of [8.0, 9.1, 10.2, 11.3]) P('furniture/bedSingle', x, 1.62, 0, { room: 'A' });
  for (const x of [8.55, 10.75]) P('furniture/sideTable', x, 1.17, 0, { room: 'A' });
  for (const x of [8.0, 12.2]) P('furniture/bedSingle', x, 5.39, PI, { room: 'A' });
  P('furniture/sideTableDrawers', 13.0, 1.17, 0, { room: 'A' });
  P('furniture/trashcan', 13.5, 5.6, 0, { room: 'A' });
  rug(10.5, 3.5);

  // Ward B (dormant patient, battery, note)
  P('furniture/bedDouble', 15.1, 1.62, 0, { room: 'B' });
  P('furniture/bedDouble', 18.9, 1.62, 0, { room: 'B' });
  P('furniture/sideTable', 16.3, 1.17, 0, { room: 'B' });
  P('furniture/bookcaseOpen', 17.5, 1.17, 0, { room: 'B' });
  P('furniture/cardboardBoxClosed', 19.5, 5.6, 0, { room: 'B' });
  P('furniture/cardboardBoxClosed', 14.5, 5.6, 0, { room: 'B' });
  rug(17, 3.4);

  // Pharmacy (key 2)
  for (const x of [21.0, 21.7, 22.4, 23.1, 23.8]) P('furniture/bookcaseClosed', x, 1.17, 0, { room: 'P' });
  P('furniture/desk', 25.6, 1.25, 0, { room: 'P' });
  P('furniture/chairDesk', 25.6, 1.78, PI, { room: 'P' });
  for (const y of [3.0, 3.5, 4.0, 4.5]) P('furniture/kitchenCabinet', 26.725, y, -PI / 2, { room: 'P' });
  P('furniture/trashcan', 20.5, 5.6, 0, { room: 'P' });
  rug(23.5, 3.2);

  // Ward C / ICU
  for (const x of [3.0, 4.2, 5.4, 6.6, 7.8]) P('furniture/bedSingle', x, 7.61, 0, { room: 'W' });
  for (const x of [3.0, 4.2, 5.4, 6.6, 7.8]) P('furniture/bedSingle', x, 13.39, PI, { room: 'W' });
  for (const x of [3.6, 6.0]) P('furniture/sideTable', x, 7.17, 0, { room: 'W' });
  P('furniture/trashcan', 9.5, 11.6, 0, { room: 'W' });
  P('furniture/cardboardBoxClosed', 2.4, 12.0, 0, { room: 'W' });
  rug(5.5, 10.4);

  // Lab / office (note 3)
  for (const x of [11.9, 13.7, 15.4]) {
    P('furniture/desk', x, 10.6, 0, { room: 'L' });
    P('furniture/chairDesk', x, 11.12, PI, { room: 'L' });
  }
  for (const x of [10.8, 11.5, 12.2]) P('furniture/bookcaseClosed', x, 13.825, PI, { room: 'L' });
  for (const y of [7.6, 8.1, 11.2, 11.7, 12.2]) P('furniture/kitchenCabinet', 17.725, y, -PI / 2, { room: 'L' });
  rug(14, 8.6);

  // Morgue
  for (const x of [20.4, 22.4]) P('furniture/bedDouble', x, 9.4, 0, { room: 'Z' });
  for (const x of [19.4, 21.4, 23.4]) P('furniture/bedDouble', x, 12.0, 0, { room: 'Z' });
  P('furniture/trashcan', 25.4, 7.5, 0, { room: 'Z' });

  // Boiler room (key 3)
  P('furniture/desk', 1.25, 16.6, PI / 2, { room: 'F' });
  for (const x of [3.0, 3.35]) P('furniture/cardboardBoxClosed', x, 18.6, 0, { room: 'F' });
  P('furniture/cardboardBoxClosed', 3.18, 18.25, 0, { room: 'F' });
  for (const x of [5.5, 6.0, 6.5]) P('furniture/bookcaseClosed', x, 18.825, PI, { room: 'F' });
  for (const y of [16.3, 16.8, 17.3]) P('furniture/kitchenCabinet', 8.725, y, -PI / 2, { room: 'F' });
  P('furniture/trashcan', 7.5, 15.4, 0, { room: 'F' });

  // Storage
  for (const x of [10.0, 10.7, 11.4, 13.0, 13.7]) P('furniture/bookcaseClosed', x, 18.825, PI, { room: 'S' });
  for (const [x, y] of [[10.0, 17.0], [10.3, 17.0], [10.15, 16.7], [14.5, 17.5], [14.8, 17.5], [14.65, 17.2]]) P('furniture/cardboardBoxClosed', x, y, 0, { room: 'S' });

  // Exit lobby
  P('furniture/desk', 25.0, 16.0, 0, { room: 'X' });
  P('furniture/chairDesk', 25.0, 16.52, PI, { room: 'X' });
  for (const x of [17.0, 17.5, 18.0]) P('furniture/chair', x, 18.5, PI, { room: 'X' });
  for (const y of [16.0, 16.5, 17.0]) P('furniture/bookcaseClosed', 26.775, y, -PI / 2, { room: 'X' });
  rug(21.5, 16.7);

  // ---- ceiling lamps (non-instanced so they can switch on/off) ----
  const lampModel = models['furniture/lampSquareCeiling'];
  const lampOn = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa24a, emissiveIntensity: 1.7, roughness: 0.6 });
  const lampOff = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.9 });
  const lamps = LAMPS.map(([cx, cy], i) => {
    const holder = new THREE.Group();
    const meshes = [];
    lampModel.scene.traverse((o) => {
      if (o.isMesh) {
        const m = new THREE.Mesh(o.geometry, lampOn);
        m.applyMatrix4(o.matrixWorld);
        holder.add(m);
        meshes.push(m);
      }
    });
    holder.scale.setScalar(S);
    holder.position.set(cx * C, WALL_H - lampModel.box.max.y * S, cy * C);
    group.add(holder);
    return { id: i, pos: new THREE.Vector3(cx * C, WALL_H - 0.35, cy * C), meshes, on: true, flicker: 0, dead: false, matOn: lampOn, matOff: lampOff };
  });

  // ---- build instanced meshes ----
  inst.build(group);

  // ---- nav geometry: floor slabs + all colliders as boxes (not rendered) ----
  const navGeos = [];
  for (const [, x, y, w, h] of RECTS) {
    const g = new THREE.BoxGeometry(w * C, 0.4, h * C);
    g.translate((x + w / 2) * C, -0.2, (y + h / 2) * C);
    navGeos.push(g);
  }
  for (const c of colliders) {
    const g = new THREE.BoxGeometry(c.hx * 2, c.hy * 2, c.hz * 2);
    g.translate(c.x, c.y, c.z);
    navGeos.push(g);
  }
  const navMeshSource = new THREE.Mesh(mergeGeometries(navGeos), new THREE.MeshBasicMaterial());
  navMeshSource.updateMatrixWorld(true);
  navGeos.forEach((g) => g.dispose());

  // ---- exit door (visual; behaviour in game.js) ----
  const exitDoorway = doorways.find((d) => d.exit);
  const exitPos = new THREE.Vector3(exitDoorway.x * C + C / 2, 0, exitDoorway.y * C);

  // ---- dev placement checks ----
  if (import.meta.env.DEV) {
    for (const f of furnitureBoxes) {
      const pts = [[f.min[0], f.min[1]], [f.max[0], f.min[1]], [f.min[0], f.max[1]], [f.max[0], f.max[1]]];
      for (const [px, pz] of pts) {
        const id = idAt(Math.floor(px - 1e-4), Math.floor(pz - 1e-4)) || idAt(Math.floor(px + 1e-4), Math.floor(pz + 1e-4));
        const idIn = idAt(Math.floor((f.min[0] + f.max[0]) / 2), Math.floor((f.min[1] + f.max[1]) / 2));
        if (f.roomId && idIn !== f.roomId) { console.warn(`[level] ${f.name} centre not in room ${f.roomId} (is ${idIn})`); break; }
        void id;
      }
      // door clearance
      for (const d of doorways) {
        const cx0 = d.horizontal ? d.x : d.x - 1.0, cx1 = d.horizontal ? d.x + 1 : d.x + 1.0;
        const cz0 = d.horizontal ? d.y - 1.0 : d.y, cz1 = d.horizontal ? d.y + 1.0 : d.y + 1;
        if (f.min[0] < cx1 && f.max[0] > cx0 && f.min[1] < cz1 && f.max[1] > cz0) {
          console.warn(`[level] ${f.name} in ${f.roomId} blocks doorway ${d.horizontal ? 'h' : 'v'}:${d.x},${d.y}`);
        }
      }
    }
  }

  const pickups = {
    keys: [
      { index: 1, pos: new THREE.Vector3(13.0 * C, 0.384 * S + 0.22, 1.17 * C), room: 'A' },
      { index: 2, pos: new THREE.Vector3(25.6 * C, 0.384 * S + 0.22, 1.25 * C), room: 'P' },
      { index: 3, pos: new THREE.Vector3(1.25 * C, 0.384 * S + 0.22, 16.6 * C), room: 'F' },
    ],
    batteries: [[15.3, 4.4], [8.8, 12.3], [14.4, 12.8], [11.0, 17.8]].map(([x, y]) => ({ pos: new THREE.Vector3(x * C, 0.25, y * C) })),
    notes: NOTES.map((n) => ({ pos: new THREE.Vector3(n.pos[0] * C, 0.384 * S + 0.08, n.pos[1] * C), text: n.text })),
  };

  return {
    group, grid, idAt, colliders, navMeshSource, lamps, doorways, exitPos, pickups,
    spawn: { pos: new THREE.Vector3(2.8 * C, 0, 2.3 * C), yaw: -Math.PI / 2 },
    patientStart: cellToWorld(18.6, 5.0),
    waypoints: WAYPOINTS.map(([x, y]) => cellToWorld(x, y)),
    cellToWorld,
    worldToCell: (p) => ({ x: Math.floor(p.x / C), y: Math.floor(p.z / C) }),
    bounds: { w: GRID_W * C, h: GRID_H * C },
  };
}

/** Collects matrices per model and builds one InstancedMesh per sub-mesh. */
class Instancer {
  constructor(models) {
    this.models = models;
    this.items = {}; // name -> {kind, mats[]}
  }

  add(name, matrix, kind) {
    const key = `${name}|${kind}`;
    (this.items[key] ||= { name, kind, mats: [] }).mats.push(matrix.clone());
  }

  build(group) {
    const tmp = new THREE.Matrix4();
    for (const { name, kind, mats } of Object.values(this.items)) {
      const root = this.models[name].scene;
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh) return;
        const material = o.material.clone();
        material.color.multiplyScalar(kind === 'wall' ? 0.7 : 0.8);
        material.roughness = Math.max(material.roughness ?? 0.8, 0.85);
        material.metalness = 0;
        const im = new THREE.InstancedMesh(o.geometry, material, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, o.matrixWorld)));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = kind === 'wall' || kind === 'furniture';
        im.receiveShadow = kind !== 'ceiling';
        im.computeBoundingSphere();
        im.computeBoundingBox();
        group.add(im);
      });
    }
  }
}
