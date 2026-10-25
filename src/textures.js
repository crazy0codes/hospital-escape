import * as THREE from 'three';

/** All textures are drawn here with the canvas API (no downloaded images, so no licence to track). */

let seed = 1234567;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a, b) => a + rnd() * (b - a);

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function toTexture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Speckle and blotch noise over the whole canvas. */
function grime(ctx, size, count, alpha, light = false) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size, y = rnd() * size, r = rr(1, 6);
    ctx.fillStyle = light ? `rgba(255,255,255,${rr(0, alpha)})` : `rgba(0,0,0,${rr(0, alpha)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
}

/** Wide floorboards, worn. */
export function planksTexture(base = [92, 62, 38]) {
  const [c, ctx] = canvas(256);
  const boards = 5, w = 256 / boards;
  for (let i = 0; i < boards; i++) {
    const k = rr(0.78, 1.15);
    ctx.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    ctx.fillRect(i * w, 0, w, 256);
    for (let g = 0; g < 26; g++) { // grain
      ctx.strokeStyle = `rgba(20,10,0,${rr(0.05, 0.22)})`;
      ctx.lineWidth = rr(0.5, 1.8);
      const x = i * w + rr(2, w - 2);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + rr(-4, 4), 80, x + rr(-4, 4), 160, x + rr(-3, 3), 256); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(i * w, 0, 2, 256); // gap
    const cut = rr(40, 220); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(i * w, cut, w, 2); // butt joint
  }
  grime(ctx, 256, 120, 0.25);
  grime(ctx, 256, 30, 0.12, true);
  return toTexture(c);
}

/** Horizontal logs of a cabin wall. */
export function logsTexture() {
  const [c, ctx] = canvas(256);
  const rows = 4, h = 256 / rows;
  for (let i = 0; i < rows; i++) {
    const g = ctx.createLinearGradient(0, i * h, 0, (i + 1) * h);
    const k = rr(0.85, 1.1);
    g.addColorStop(0, `rgb(${30 * k | 0},${20 * k | 0},${12 * k | 0})`);
    g.addColorStop(0.35, `rgb(${96 * k | 0},${64 * k | 0},${38 * k | 0})`);
    g.addColorStop(0.7, `rgb(${70 * k | 0},${46 * k | 0},${27 * k | 0})`);
    g.addColorStop(1, `rgb(${18 * k | 0},${11 * k | 0},${6 * k | 0})`);
    ctx.fillStyle = g; ctx.fillRect(0, i * h, 256, h);
    for (let s = 0; s < 40; s++) {
      ctx.strokeStyle = `rgba(15,8,0,${rr(0.1, 0.35)})`; ctx.lineWidth = rr(0.5, 1.5);
      const y = i * h + rr(4, h - 4), x = rr(0, 256);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rr(20, 90), y + rr(-2, 2)); ctx.stroke();
    }
  }
  grime(ctx, 256, 160, 0.25);
  return toTexture(c);
}

/** Faded striped wallpaper with water stains. */
export function wallpaperTexture(tone = [88, 92, 72]) {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`; ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(x, 0, 12, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 12, 0, 3, 256);
  }
  for (let i = 0; i < 6; i++) { // water stains, running down
    const x = rnd() * 256, w = rr(8, 30), l = rr(60, 200);
    const g = ctx.createLinearGradient(0, 0, 0, l);
    g.addColorStop(0, `rgba(40,25,5,${rr(0.15, 0.4)})`); g.addColorStop(1, 'rgba(40,25,5,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, w, l);
  }
  grime(ctx, 256, 220, 0.3);
  grime(ctx, 256, 40, 0.1, true);
  // wainscot band along the bottom of each tile
  const band = ctx.createLinearGradient(0, 214, 0, 256);
  band.addColorStop(0, 'rgba(25,14,6,0.85)'); band.addColorStop(1, 'rgba(15,8,3,0.95)');
  ctx.fillStyle = band; ctx.fillRect(0, 214, 256, 42);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 212, 256, 3);
  return toTexture(c);
}

/** Snow with blue shadows and glitter. */
export function snowTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#c9d6e6'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = rr(6, 30);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    g.addColorStop(0, dark ? 'rgba(120,145,185,0.35)' : 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(255,255,255,${rr(0.3, 0.9)})`; ctx.fillRect(rnd() * 256, rnd() * 256, 1.4, 1.4); }
  return toTexture(c);
}

export function barkTexture() {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#4a3320'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '15,8,2' : '120,90,60'},${rr(0.15, 0.5)})`; ctx.lineWidth = rr(1, 3);
    const x = rnd() * 128; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + rr(-6, 6), 128); ctx.stroke();
  }
  return toTexture(c);
}

export function stoneTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#3b3a38'; ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 6; row++) {
    let x = rr(-20, 0);
    while (x < 256) {
      const w = rr(32, 64), h = 256 / 6;
      const k = rr(0.7, 1.25);
      ctx.fillStyle = `rgb(${70 * k | 0},${68 * k | 0},${64 * k | 0})`;
      ctx.fillRect(x + 2, row * h + 2, w - 4, h - 4);
      x += w;
    }
  }
  grime(ctx, 256, 260, 0.35);
  return toTexture(c);
}

/** Window with a cross frame, lit by moon. Used emissive. */
export function windowTexture() {
  const [c, ctx] = canvas(128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#9fb6d6'); g.addColorStop(1, '#5f7596');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1a120a';
  ctx.fillRect(0, 0, 128, 8); ctx.fillRect(0, 120, 128, 8); ctx.fillRect(0, 0, 8, 128); ctx.fillRect(120, 0, 8, 128);
  ctx.fillRect(60, 0, 8, 128); ctx.fillRect(0, 60, 128, 8);
  return toTexture(c, { repeat: false });
}

/** Teardrop flame, additive. */
export function flameTexture() {
  const [c, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 92, 4, 64, 80, 62);
  g.addColorStop(0, 'rgba(255,250,200,1)');
  g.addColorStop(0.3, 'rgba(255,190,70,0.95)');
  g.addColorStop(0.65, 'rgba(240,90,20,0.55)');
  g.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(64, 2);
  ctx.bezierCurveTo(100, 50, 118, 80, 64, 124);
  ctx.bezierCurveTo(10, 80, 28, 50, 64, 2);
  ctx.fill();
  return toTexture(c, { repeat: false });
}

export function dotTexture() {
  const [c, ctx] = canvas(32);
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  return toTexture(c, { repeat: false });
}
