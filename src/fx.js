import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, NoiseEffect,
  ToneMappingEffect, ToneMappingMode, HueSaturationEffect, BlendFunction, KernelSize,
} from 'postprocessing';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2c4c);
  scene.fog = new THREE.FogExp2(0x111b30, 0.027);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 90);
  scene.add(camera);

  // Dim fill so silhouettes never go fully black.
  const ambient = new THREE.AmbientLight(0x5a6e92, 0.5);
  scene.add(ambient);

  // Flashlight, parented to the camera.
  const flashlight = new THREE.SpotLight(0xfff0d4, 34, 26, 0.5, 0.55, 1.35);
  flashlight.position.set(0.12, -0.1, 0.05);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.shadow.camera.near = 0.15;
  flashlight.shadow.camera.far = 26;
  flashlight.shadow.bias = -0.0004;
  flashlight.shadow.normalBias = 0.03;
  flashlight.target.position.set(0, 0, -6);
  camera.add(flashlight);
  camera.add(flashlight.target);

  // Fixed number of lamp lights (moved onto the nearest working lamps) so shaders never recompile.
  const lampLights = [0, 1, 2].map(() => {
    const l = new THREE.PointLight(0xffb96b, 0, 11, 2);
    scene.add(l);
    return l;
  });

  return { scene, camera, ambient, flashlight, lampLights };
}

export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer, { multisampling: 0, frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.95, luminanceSmoothing: 0.25, mipmapBlur: true, kernelSize: KernelSize.MEDIUM });
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.75 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
  noise.blendMode.opacity.value = 0.32;
  const grade = new HueSaturationEffect({ saturation: -0.35, hue: 0 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });

  composer.addPass(new EffectPass(camera, bloom, grade, tone, vignette, noise));
  return { composer, bloom, vignette, noise, grade };
}
