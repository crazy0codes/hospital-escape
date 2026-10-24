import './style.css';
import * as THREE from 'three';
import { init as initRecast, NavMeshQuery } from 'recast-navigation';
import { threeToSoloNavMesh } from '@recast-navigation/three';
import { createRenderer, createWorld, createComposer } from './fx.js';
import { loadModels, loadSoundBytes } from './assets.js';
import { buildLevel } from './level.js';
import { Physics } from './physics.js';
import { Game } from './game.js';
import { ui } from './ui.js';

const params = new URLSearchParams(location.search);
const opts = { nolock: params.has('nolock'), debug: params.has('debug') };

async function main() {
  ui.screen('loading');
  ui.loading(0.02, 'Loading models...');
  const canvas = document.getElementById('game');
  const renderer = createRenderer(canvas);
  const world = createWorld();
  const { composer, ...fx } = createComposer(renderer, world.scene, world.camera);

  const models = await loadModels((f) => ui.loading(f, 'Loading models...'));
  ui.loading(0.7, 'Loading sounds...');
  const soundBytes = await loadSoundBytes((f) => ui.loading(f, 'Loading sounds...'));

  ui.loading(0.95, 'Building the hospital...');
  await initRecast();
  const physics = await Physics.create();
  const level = buildLevel(models);

  const nav = threeToSoloNavMesh([level.navMeshSource], {
    cs: 0.1, ch: 0.1, walkableSlopeAngle: 45, walkableHeight: 18, walkableClimb: 2, walkableRadius: 3,
    maxEdgeLen: 60, maxSimplificationError: 1.2, minRegionArea: 8, mergeRegionArea: 40,
  });
  if (!nav.success) throw new Error('Navmesh generation failed');
  const query = new NavMeshQuery(nav.navMesh);

  const game = new Game({ renderer, composer, fx, world, physics, models, level, query, soundBytes, opts });
  if (opts.debug) { window.__game = game; window.__THREE = THREE; }
  game.run();
  ui.loading(1, 'Ready');
  ui.screen('title');
  document.title = 'St. Aldric: Night Shift Never Ended';
  window.__ready = true;
}

main().catch((e) => {
  console.error(e);
  const t = document.getElementById('loadText');
  if (t) t.textContent = `Failed to start: ${e.message}`;
});
