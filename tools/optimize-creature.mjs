// Prepares the user-supplied creature for the game.
// Usage: node tools/optimize-creature.mjs <in.glb> <out.glb> [simplifyRatio]
// - removes the "hair card" meshes (they render as white rectangles)
// - merges meshes that share a material (70 meshes -> a handful of draw calls)
// - optionally simplifies the mesh, converts textures to WebP
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, join, weld, simplify, textureCompress, flatten } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';


/** Merge skinned meshes that share a material and skin into one mesh per material (gltf-transform's join skips skinned meshes). */
function mergeSkinned(doc) {
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const buffer = root.listBuffers()[0];
  const groups = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); const skin = node.getSkin();
    if (!mesh || !skin) continue;
    for (const prim of mesh.listPrimitives()) {
      const key = `${prim.getMaterial()?.getName()}|${prim.listSemantics().sort().join('+')}`;
      if (!groups.has(key)) groups.set(key, { skin, node, items: [] });
      groups.get(key).items.push({ node, prim });
    }
  }
  for (const [key, g] of groups) {
    const names = g.items[0].prim.listSemantics();
    const total = g.items.reduce((n, it) => n + it.prim.getAttribute('POSITION').getCount(), 0);
    const merged = {};
    for (const sem of names) {
      const first = g.items[0].prim.getAttribute(sem);
      const size = first.getElementSize();
      const arr = new (first.getArray().constructor)(total * size);
      let off = 0;
      for (const it of g.items) { const a = it.prim.getAttribute(sem).getArray(); arr.set(a, off); off += a.length; }
      merged[sem] = doc.createAccessor(sem).setType(first.getType()).setArray(arr).setNormalized(first.getNormalized()).setBuffer(buffer);
    }
    const idxCount = g.items.reduce((n, it) => n + it.prim.getIndices().getCount(), 0);
    const idx = total > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
    let io2 = 0, vo = 0;
    for (const it of g.items) { const a = it.prim.getIndices().getArray(); for (let i = 0; i < a.length; i++) idx[io2++] = a[i] + vo; vo += it.prim.getAttribute('POSITION').getCount(); }
    const prim = doc.createPrimitive().setMaterial(g.items[0].prim.getMaterial())
      .setIndices(doc.createAccessor('idx').setType('SCALAR').setArray(idx).setBuffer(buffer));
    for (const sem of names) prim.setAttribute(sem, merged[sem]);
    const mesh = doc.createMesh(`merged_${key.split('|')[0]}`).addPrimitive(prim);
    const node = doc.createNode(`merged_${key.split('|')[0]}`).setMesh(mesh).setSkin(g.skin)
      .setTranslation(g.node.getTranslation()).setRotation(g.node.getRotation()).setScale(g.node.getScale());
    scene.addChild(node);
    for (const it of g.items) { const m = it.node.getMesh(); it.node.dispose(); m?.dispose(); }
  }
}

const [inPath, outPath, ratioArg] = process.argv.slice(2);
const ratio = ratioArg ? parseFloat(ratioArg) : 1;
const DROP = new Set(['hair_cards_v2', 'Hair_cards']);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const root = doc.getRoot();
const count = () => {
  let tris = 0, prims = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { prims++; tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; }
  return { meshes: root.listMeshes().length, prims, tris: Math.round(tris) };
};
console.log('in  ', count());

for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (DROP.has(prim.getMaterial()?.getName())) { mesh.removePrimitive(prim); prim.dispose(); }
  }
}
for (const mesh of root.listMeshes()) if (mesh.listPrimitives().length === 0) {
  for (const node of root.listNodes()) if (node.getMesh() === mesh) node.setMesh(null);
  mesh.dispose();
}
await doc.transform(prune(), dedup());
await doc.transform(flatten());
mergeSkinned(doc);
await doc.transform(prune());
console.log('join', count());

if (ratio < 1) {
  await MeshoptSimplifier.ready;
  await doc.transform(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }));
  console.log('simplified', count());
}
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  prune(),
);
await io.write(outPath, doc);
console.log('out ', count());
