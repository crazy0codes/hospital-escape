import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

/** 1 grid cell == C metres. The lodge sits in the middle of a snowy yard ringed by pines. */
export const S = 2.2;
export const C = S;
export const WALL_H = 2.8;
export const GRID_W = 26;
export const GRID_H = 20;
const T = 0.22; // wall thickness (m)
const DOOR_U0 = 0.2, DOOR_U1 = 0.8; // doorway opening along a cell edge, fraction of C
const LINTEL = 2.15;

// id, x, y, w, h  (cells). Later entries overwrite earlier ones.
const RECTS = [
  ['Y', 0, 0, 26, 20], // snowy yard
  ['G', 9, 5, 8, 6], // great room (hearth on its north wall)
  ['D', 6, 5, 3, 5], // bedroom
  ['K', 6, 10, 3, 5], // kitchen
  ['T', 17, 5, 3, 5], // study
  ['N', 17, 10, 3, 5], // pantry
  ['H', 9, 11, 8, 4], // entrance hall
  ['W', 1, 2, 3, 3], // woodshed
  ['B', 21, 1, 3, 3], // barn
  ['R', 21, 15, 3, 3], // garage
];
const LODGE = new Set(['G', 'D', 'K', 'T', 'N', 'H']);
const SHEDS = new Set(['W', 'B', 'R']);

// cell x, cell y, side of that cell
const DOORS = [
  [12, 10, 'S'], [13, 10, 'S'], // great room <-> hall (wide)
  [9, 7, 'W'], [16, 7, 'E'], [9, 12, 'W'], [16, 12, 'E'], [7, 9, 'S'], [18, 9, 'S'],
  [13, 14, 'S'], // front door
  [6, 12, 'W'], // back door (kitchen)
  [19, 7, 'E'], // study side door
  [3, 3, 'E'], [21, 2, 'W'], [22, 15, 'N'], // sheds
];

// [cell x, cell y, side] windows on lodge outer walls (cell coordinates along the wall line)
const WINDOWS = [
  [7.5, 5, 'h'], [10.6, 5, 'h'], [15.4, 5, 'h'], [18.5, 5, 'h'],
  [7.5, 15, 'h'], [10.6, 15, 'h'], [15.4, 15, 'h'], [18.5, 15, 'h'],
  [6, 6.5, 'v'], [6, 8.5, 'v'], [6, 10.8, 'v'], [20, 5.8, 'v'], [20, 9.6, 'v'], [20, 12.5, 'v'],
];

export const HEARTH_CELL = [13, 5.35];
const cellToWorld = (cx, cy) => new THREE.Vector3(cx * C, 0, cy * C);

const WAYPOINTS = [
  // yard loop around the lodge
  [4.5, 7], [4.5, 12], [4.5, 17], [10, 17.5], [16, 17.5], [21, 13.5], [22, 8], [22, 4.5], [16, 3], [10, 3], [5, 3.5],
  // sheds and corners
  [2.5, 3.5], [22.5, 2.5], [22.5, 16.5], [2, 17.5], [24, 10],
  // lodge
  [12, 8], [14.5, 7], [12.5, 12.5], [7, 7], [7.3, 12.5], [18.2, 7], [18.2, 12],
];

const NOTES = [
  { room: 'D', pos: [8.4, 5.7], text: 'Feb. 9. The radio says the road will not open for a week. We have the stove, a woodpile, and each other. Do not go out after dark. I mean it this time.' },
  { room: 'T', pos: [18.3, 5.7], text: 'My grandmother called it the hunger that walks. Not for meat. For warmth. It circles a house and counts the chimney smoke. When the smoke thins, it comes in.' },
  { room: 'K', pos: [6.5, 13.7], text: 'We ran out of wood on the fourth night. We burned the chairs. Then the shelves. It stood at the edge of the firelight the whole time, patient, and every hour a little nearer.' },
  { room: 'B', pos: [22.3, 1.6], text: 'It never touches the fire. It watches us feed it. I think the fire is not what keeps it away. I think it is what it is waiting for, to end.' },
];

/** World-space UVs on a box so a texture tile covers `tile` metres on every face. */
function boxGeo(x0, y0, z0, x1, y1, z1, tile = 2) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const ox = (Math.abs(Math.sin(x0 * 12.9 + z0 * 78.2)) * 7) % 1;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile + ox, uv.getY(k) * dims[f][1] / tile);
    }
  }
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

export function buildLevel(models) {
  const group = new THREE.Group();
  const grid = new Array(GRID_W * GRID_H).fill(null);
  for (const [id, x, y, w, h] of RECTS) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * GRID_W + i] = id;
  const idAt = (x, y) => (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H ? null : grid[y * GRID_W + x]);

  const doorKey = ([x, y, side]) => ({ N: `h:${x},${y}`, S: `h:${x},${y + 1}`, W: `v:${x},${y}`, E: `v:${x + 1},${y}` }[side]);
  const doorEdges = new Set(DOORS.map(doorKey));

  // ---- materials ----
  const mats = {
    floor: new THREE.MeshStandardMaterial({ map: TX.planksTexture(), roughness: 0.9 }),
    floorShed: new THREE.MeshStandardMaterial({ map: TX.planksTexture([60, 46, 34]), roughness: 0.95 }),
    snow: new THREE.MeshStandardMaterial({ map: TX.snowTexture(), roughness: 0.95, emissive: 0x7f98c0, emissiveIntensity: 0.8 }),
    snowCap: new THREE.MeshStandardMaterial({ color: 0xdfe8f5, roughness: 1, emissive: 0x7f98c0, emissiveIntensity: 0.7 }),
    log: new THREE.MeshStandardMaterial({ map: TX.logsTexture(), roughness: 0.95 }),
    paperA: new THREE.MeshStandardMaterial({ map: TX.wallpaperTexture([88, 92, 72]), roughness: 0.95 }),
    paperB: new THREE.MeshStandardMaterial({ map: TX.wallpaperTexture([96, 78, 64]), roughness: 0.95 }),
    shedWall: new THREE.MeshStandardMaterial({ map: TX.planksTexture([52, 40, 30]), roughness: 1 }),
    ceiling: new THREE.MeshStandardMaterial({ map: TX.planksTexture([48, 34, 22]), roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ map: TX.stoneTexture(), roughness: 1 }),
    darkWall: new THREE.MeshBasicMaterial({ color: 0x070d16 }),
  };
  const buckets = new Map(); // material key -> { geos, cast }
  const addBox = (key, x0, y0, z0, x1, y1, z1, tile = 2, cast = true) => {
    if (!buckets.has(key)) buckets.set(key, { geos: [], cast });
    buckets.get(key).geos.push(boxGeo(x0, y0, z0, x1, y1, z1, tile));
  };

  const colliders = [];
  const addCollider = (cx, cz, hx, hz, h = WALL_H) => colliders.push({ x: cx, y: h / 2, z: cz, hx, hy: h / 2, hz });

  // ---- floors, ceilings, snow ----
  addBox('snow', -6, -0.2, -6, GRID_W * C + 6, 0, GRID_H * C + 6, 4, false);
  for (const [id, x, y, w, h] of RECTS) {
    if (id === 'Y') continue;
    const shed = SHEDS.has(id);
    addBox(shed ? 'floorShed' : 'floor', x * C, 0.001, y * C, (x + w) * C, 0.03, (y + h) * C, 2, false);
    addBox('ceiling', x * C - T / 2, WALL_H, y * C - T / 2, (x + w) * C + T / 2, WALL_H + 0.22, (y + h) * C + T / 2, 2, false);
    addBox('snowCap', x * C - T / 2, WALL_H + 0.22, y * C - T / 2, (x + w) * C + T / 2, WALL_H + 0.5, (y + h) * C + T / 2, 4, false);
  }

  // ---- walls ----
  const wallMat = (a, b) => {
    const ids = [a, b];
    const outdoors = ids.includes('Y') || ids.includes(null);
    const other = a === 'Y' || a === null ? b : a;
    if (outdoors) return SHEDS.has(other) ? 'shedWall' : 'log';
    return (a + b).includes('D') || (a + b).includes('T') ? 'paperA' : 'paperB';
  };
  const treeSpots = [];
  const doorways = [];
  const edgeWall = (horizontal, x, y) => {
    const a = horizontal ? idAt(x, y - 1) : idAt(x - 1, y);
    const b = idAt(x, y);
    if (a === b) return;
    if (!a && !b) return;
    const key = `${horizontal ? 'h' : 'v'}:${x},${y}`;
    const perimeter = !a || !b;
    const isDoor = doorEdges.has(key);
    if (perimeter) {
      // pine wall: collider plus a dark backing and trees (trees added after)
      const len = C;
      const cx = horizontal ? x * C + len / 2 : x * C, cz = horizontal ? y * C : y * C + len / 2;
      addCollider(cx, cz, horizontal ? len / 2 : 0.6, horizontal ? 0.6 : len / 2, 4);
      const dir = a ? 1 : -1; // outward direction
      if (horizontal) addBox('darkWall', x * C, 0, y * C + dir * 0.9 - 0.4, (x + 1) * C, 6, y * C + dir * 0.9 + 0.4, 4, false);
      else addBox('darkWall', x * C + dir * 0.9 - 0.4, 0, y * C, x * C + dir * 0.9 + 0.4, 6, (y + 1) * C, 4, false);
      for (let k = 0; k < 4; k++) {
        const u = (k + 0.2 + Math.random() * 0.6) * (C / 4);
        const along = horizontal ? x * C + u : y * C + u;
        const out = (a ? 1 : -1) * (0.4 + Math.random() * 1.3);
        treeSpots.push(horizontal ? [along, y * C + out] : [x * C + out, along]);
      }
      return;
    }
    const mk = wallMat(a, b);
    const half = T / 2;
    const u0 = DOOR_U0 * C, u1 = DOOR_U1 * C;
    const segs = isDoor ? [[0, u0], [u1, C]] : [[0, C]];
    for (const [s0, s1] of segs) {
      const ext = horizontal ? [x * C + s0 - (s0 === 0 ? half : 0), x * C + s1 + (s1 === C ? half : 0)] : [y * C + s0 - (s0 === 0 ? half : 0), y * C + s1 + (s1 === C ? half : 0)];
      if (horizontal) addBox(mk, ext[0], 0, y * C - half, ext[1], WALL_H, y * C + half, 2);
      else addBox(mk, x * C - half, 0, ext[0], x * C + half, WALL_H, ext[1], 2);
      const mid = (s0 + s1) / 2, hl = (s1 - s0) / 2;
      if (horizontal) addCollider(x * C + mid, y * C, hl, 0.15); else addCollider(x * C, y * C + mid, 0.15, hl);
    }
    if (isDoor) {
      if (horizontal) addBox(mk, x * C + u0, LINTEL, y * C - half, x * C + u1, WALL_H, y * C + half, 2);
      else addBox(mk, x * C - half, LINTEL, y * C + u0, x * C + half, WALL_H, y * C + u1, 2);
      doorways.push({ horizontal, x, y });
    }
  };
  for (let y = 0; y <= GRID_H; y++) for (let x = 0; x < GRID_W; x++) edgeWall(true, x, y);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x <= GRID_W; x++) edgeWall(false, x, y);

  // ---- hearth (stone chimney breast on the great room's north wall) ----
  const hx = HEARTH_CELL[0] * C, hz = HEARTH_CELL[1] * C;
  addBox('stone', hx - 1.5, 0, hz - 0.1, hx - 0.65, 2.7, hz + 0.95, 1.5);
  addBox('stone', hx + 0.65, 0, hz - 0.1, hx + 1.5, 2.7, hz + 0.95, 1.5);
  addBox('stone', hx - 0.7, 1.25, hz - 0.1, hx + 0.7, 2.7, hz + 0.95, 1.5);
  addBox('stone', hx - 1.55, 0, hz + 0.6, hx + 1.55, 0.18, hz + 1.5, 1.5, false); // hearth slab
  addBox('darkWall', hx - 0.7, 0, hz - 0.08, hx + 0.7, 1.25, hz, 1, false); // soot at the back
  addCollider(hx - 1.08, hz + 0.43, 0.43, 0.53, 2.7);
  addCollider(hx + 1.08, hz + 0.43, 0.43, 0.53, 2.7);
  addCollider(hx, hz + 0.15, 0.7, 0.3, 2.7);

  // ---- furniture (Kenney CC0 models, instanced) ----
  const inst = new Instancer(models);
  const PI = Math.PI;
  const addFurniture = (name, cx, cy, rot = 0, { collide = true, scale = S } = {}) => {
    const info = models[name];
    const c = info.box.getCenter(new THREE.Vector3());
    const m = new THREE.Matrix4()
      .makeTranslation(cx * C, 0, cy * C)
      .multiply(new THREE.Matrix4().makeRotationY(rot))
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, -info.box.min.y, -c.z));
    inst.add(name, m, 'furniture');
    const wb = info.box.clone().applyMatrix4(m);
    if (collide) addCollider((wb.min.x + wb.max.x) / 2, (wb.min.z + wb.max.z) / 2, (wb.max.x - wb.min.x) / 2, (wb.max.z - wb.min.z) / 2, Math.max(wb.max.y, 0.5));
    return wb;
  };
  const rug = (cx, cy, rot = 0) => addFurniture('furniture/rugRectangle', cx, cy, rot, { collide: false });

  // great room
  rug(12.5, 8.2);
  addFurniture('furniture/bookcaseClosed', 9.5, 5.3, 0); addFurniture('furniture/bookcaseClosed', 10.0, 5.3, 0);
  addFurniture('furniture/desk', 15.4, 5.6, 0); addFurniture('furniture/chairDesk', 15.4, 6.2, PI);
  addFurniture('furniture/bedSingle', 9.5, 9.2, PI / 2); // a sofa-like daybed
  addFurniture('furniture/cardboardBoxClosed', 16.0, 9.4, 0);
  // bedroom
  addFurniture('furniture/bedDouble', 7.2, 6.0, 0); addFurniture('furniture/sideTable', 6.3, 5.6, 0);
  addFurniture('furniture/bookcaseClosed', 8.4, 8.5, PI); rug(7.2, 7.8);
  // kitchen
  for (const y of [10.55, 11.05, 11.55]) addFurniture('furniture/kitchenCabinet', 6.25, y, PI / 2);
  addFurniture('furniture/desk', 7.5, 13.4, 0); addFurniture('furniture/trashcan', 8.3, 10.6, 0);
  // study
  addFurniture('furniture/desk', 18.3, 8.2, PI / 2); addFurniture('furniture/chairDesk', 17.6, 8.2, -PI / 2);
  addFurniture('furniture/bookcaseClosed', 18.5, 5.3, 0); addFurniture('furniture/bookcaseOpen', 19.4, 5.3, 0);
  // pantry
  for (const x of [17.4, 18.0, 18.6]) addFurniture('furniture/kitchenCabinet', x, 14.7, PI);
  addFurniture('furniture/cardboardBoxClosed', 19.4, 10.5, 0); addFurniture('furniture/cardboardBoxClosed', 19.4, 11.2, 0);
  // hall
  rug(12.5, 13.0, PI / 2); addFurniture('furniture/sideTableDrawers', 9.5, 14.6, PI);
  // sheds
  addFurniture('furniture/cardboardBoxClosed', 3.5, 4.3, 0);
  addFurniture('furniture/cardboardBoxClosed', 23.4, 17.2, 0);
  inst.build(group);

  // ---- merge the box geometry per material ----
  for (const [key, { geos, cast }] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mats[key]);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    geos.forEach((g) => g.dispose());
  }

  // ---- windows (emissive moonlight, both faces) ----
  const winTex = TX.windowTexture();
  const winMat = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.75, side: THREE.DoubleSide, roughness: 1 });
  for (const [cx, cy, kind] of WINDOWS) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.2), winMat);
    if (kind === 'h') w.position.set(cx * C, 1.55, cy * C);
    else { w.position.set(cx * C, 1.55, cy * C); w.rotation.y = PI / 2; }
    group.add(w);
  }

  // ---- pines ----
  const interiorTrees = [[2.5, 8.5], [3.0, 13.5], [5.0, 18], [9.0, 18.4], [18, 17.8], [24.2, 7], [24, 12.5], [14, 2], [8.5, 2.6], [19.5, 2.8], [4.5, 0.8]];
  for (const [x, y] of interiorTrees) {
    treeSpots.push([x * C, y * C]);
    addCollider(x * C, y * C, 0.45, 0.45, 4);
  }
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x14241c, roughness: 1, emissive: 0x08130f, emissiveIntensity: 0.7 });
  const trunkMat = new THREE.MeshStandardMaterial({ map: TX.barkTexture(), roughness: 1 });
  const cone = new THREE.ConeGeometry(1.5, 3.4, 7); cone.translate(0, 3.1, 0);
  const cone2 = new THREE.ConeGeometry(1.1, 2.8, 7); cone2.translate(0, 5.0, 0);
  const crown = mergeGeometries([cone, cone2]);
  const trunk = new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6); trunk.translate(0, 0.8, 0);
  const crowns = new THREE.InstancedMesh(crown, pineMat, treeSpots.length);
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, treeSpots.length);
  const tm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  treeSpots.forEach(([x, z], i) => {
    const s = 1.0 + Math.random() * 0.9;
    e.set(0, Math.random() * 6.28, 0);
    tm.compose(new THREE.Vector3(x, 0, z), q.setFromEuler(e), new THREE.Vector3(s, s * (0.9 + Math.random() * 0.4), s));
    crowns.setMatrixAt(i, tm); trunks.setMatrixAt(i, tm);
  });
  crowns.castShadow = true; trunks.castShadow = true;
  group.add(crowns, trunks);

  // ---- nav geometry (not rendered): floor slabs + colliders ----
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

  // ---- things the player can pick up or use ----
  const logPiles = [
    { cell: [10.7, 16.3], n: 4, rot: 0 }, // by the front porch
    { cell: [1.5, 2.9], n: 2, rot: PI / 2 }, { cell: [1.5, 4.0], n: 2, rot: PI / 2 }, { cell: [2.6, 2.3], n: 2, rot: 0 }, // woodshed
    { cell: [22.0, 1.4], n: 2, rot: 0 }, { cell: [23.5, 2.7], n: 2, rot: PI / 2 }, { cell: [21.5, 3.6], n: 2, rot: 0 }, // barn
    { cell: [21.5, 16.8], n: 3, rot: 0 }, { cell: [23.5, 15.5], n: 2, rot: PI / 2 }, // garage
  ];
  const chairs = [[11.0, 8.9, 0.6], [14.3, 9.0, -0.4], [12.7, 7.0, PI]];
  const batteries = [[2.4, 3.9], [22.9, 16.7], [7.3, 12.2], [18.6, 11.4], [22.7, 3.6]];

  return {
    group, grid, idAt, colliders, navMeshSource, doorways,
    hearth: new THREE.Vector3(hx, 0, hz + 0.75),
    spawn: { pos: new THREE.Vector3(12.5 * C, 0, 8.6 * C), yaw: 0 },
    patientStart: cellToWorld(2.5, 17.5),
    waypoints: WAYPOINTS.map(([x, y]) => cellToWorld(x, y)),
    cellToWorld,
    pickups: {
      logPiles: logPiles.map((p) => ({ pos: cellToWorld(...p.cell), n: p.n, rot: p.rot })),
      chairs: chairs.map(([x, y, rot]) => ({ pos: cellToWorld(x, y), rot })),
      batteries: batteries.map(([x, y]) => ({ pos: cellToWorld(x, y).setY(0.2) })),
      notes: NOTES.map((n) => ({ pos: cellToWorld(...n.pos).setY(0.9), text: n.text })),
    },
    bounds: { w: GRID_W * C, h: GRID_H * C },
    lodge: { x0: 6 * C, x1: 20 * C, z0: 5 * C, z1: 15 * C },
  };
}

/** Collects matrices per model and builds one InstancedMesh per sub-mesh. */
class Instancer {
  constructor(models) { this.models = models; this.items = {}; }

  add(name, matrix, kind) {
    const key = `${name}|${kind}`;
    (this.items[key] ||= { name, kind, mats: [] }).mats.push(matrix.clone());
  }

  build(group) {
    const tmp = new THREE.Matrix4();
    for (const { name, mats } of Object.values(this.items)) {
      const root = this.models[name].scene;
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh) return;
        const material = o.material.clone();
        material.color.multiplyScalar(0.5);
        material.roughness = Math.max(material.roughness ?? 0.8, 0.9);
        material.metalness = 0;
        const im = new THREE.InstancedMesh(o.geometry, material, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, o.matrixWorld)));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.computeBoundingBox();
        group.add(im);
      });
    }
  }
}
