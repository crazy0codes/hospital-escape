import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;

export const MODEL_NAMES = [
  'furniture/wall', 'furniture/wallDoorway', 'furniture/floorFull',
  'furniture/bedSingle', 'furniture/bedDouble', 'furniture/sideTable', 'furniture/sideTableDrawers',
  'furniture/desk', 'furniture/chair', 'furniture/chairDesk', 'furniture/bookcaseClosed', 'furniture/bookcaseOpen',
  'furniture/kitchenCabinet', 'furniture/lampSquareCeiling',
  'furniture/trashcan', 'furniture/cardboardBoxClosed', 'furniture/rugRectangle', 'furniture/books',
  'enemy/wendigo', 'platformer/key', 'platformer/lock', 'prototype/door-sliding-double-wide',
  'food/can-small',
];

export const SOUND_FILES = {
  ambient1: 'loops/ambient_01', ambient2: 'loops/ambient_02', ambient3: 'loops/ambient_03',
  noise1: 'loops/noise_01', alarm: 'loops/alarm_01',
  breath: 'creature/breath', monster1: 'creature/monster_01', monster2: 'creature/monster_02', monster3: 'creature/monster_03',
  howl: 'creature/howl', roar: 'creature/roar_01', scream: 'creature/scream_01',
  doorOpen: 'sfx/door_open', slam1: 'sfx/slam_01', slam2: 'sfx/slam_02', slam3: 'sfx/slam_03',
  key1: 'sfx/key_open_01', key2: 'sfx/key_open_02', metal1: 'sfx/metal_01', metal2: 'sfx/metal_02', metal3: 'sfx/metal_03',
  glass: 'sfx/glass_01', paper: 'sfx/paper_01',
  step0: 'steps/footstep_concrete_000', step1: 'steps/footstep_concrete_001', step2: 'steps/footstep_concrete_002',
  step3: 'steps/footstep_concrete_003', step4: 'steps/footstep_concrete_004',
  weird5: 'weird/weird_05', weird9: 'weird/weird_09', weird12: 'weird/weird_12', weird17: 'weird/weird_17',
  weird21: 'weird/weird_21', weird26: 'weird/weird_26',
};

/** Loads all models. Returns { name: { scene, animations, box } } where box is the model's local bounding box. */
export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const out = {};
  let done = 0;
  await Promise.all(MODEL_NAMES.map(async (name) => {
    const gltf = await loader.loadAsync(`${BASE}models/${name}.glb`);
    gltf.scene.updateMatrixWorld(true);
    out[name] = { scene: gltf.scene, animations: gltf.animations, box: new THREE.Box3().setFromObject(gltf.scene) };
    onProgress?.(++done / MODEL_NAMES.length * 0.7);
  }));
  return out;
}

/** Fetches every sound as raw bytes. Decoding waits for the user's click (an AudioContext must not exist before it). */
export async function loadSoundBytes(onProgress) {
  const out = {};
  const entries = Object.entries(SOUND_FILES);
  let done = 0;
  await Promise.all(entries.map(async ([key, path]) => {
    try {
      const res = await fetch(`${BASE}audio/${path}.ogg`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out[key] = await res.arrayBuffer();
    } catch (e) {
      console.warn(`sound not loaded: ${key} (${path})`, e);
    }
    onProgress?.(0.7 + ++done / entries.length * 0.3);
  }));
  return out;
}
