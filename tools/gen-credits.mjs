// Generates CREDITS.md from the files actually present in public/.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const KENNEY = 'https://raw.githubusercontent.com/shorepine/kenney/main/3d/';
const SOUNDS = 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/';

const soundPacks = {
  loops: { dir: '30-cc0-sfx-loops', author: 'Not stated in repo (pack named "30 CC0 SFX Loops")' },
  weird: { dir: '30-cc0-weird-sfx', author: 'Not stated in repo (pack named "30 CC0 Weird SFX")' },
  creature: { dir: '80-CC0-creature-SFX', author: 'Not stated in repo (pack named "80 CC0 Creature SFX")' },
  sfx: { dir: '100-CC0-SFX', author: 'Not stated in repo (pack named "100 CC0 SFX")' },
  steps: { dir: 'kenney_impactsounds/Audio', author: 'Kenney (www.kenney.nl), Impact Sounds' },
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

let out = `# Credits

All assets are CC0 1.0 (public domain dedication). Credit is not required but given anyway.
This environment blocks the original asset websites, so files were fetched from public GitHub mirrors
of the original CC0 releases. Licence texts are in public/models/LICENSE-kenney.txt and public/audio/LICENSE-sounds-repo.txt.

Honest notes:
- 3D models: Kenney (https://kenney.nl), CC0. Mirror: https://github.com/shorepine/kenney (its LICENSE.txt states CC0 for the kits).
- Sounds: from https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds, whose LICENSE is CC0 1.0. Only the Kenney Impact Sounds pack carries its own licence file in the repo; the other packs are named "CC0" but their original author is not stated in the repo, so it is not claimed here.
- food/can-small.glb is a tin can, recoloured in game with an emissive tint to act as the battery cell pickup.
- furniture/books.glb is used as the readable note prop; platformer/key.glb and lock.glb are the keys and the exit lock.

## 3D models (Kenney, CC0)
| File | Source URL | Licence |
|---|---|---|
`;

const models = walk(path.join(ROOT, 'public/models')).filter((f) => f.endsWith('.glb') || f.endsWith('.png')).sort();
for (const f of models) {
  const rel = path.relative(path.join(ROOT, 'public/models'), f).split(path.sep).join('/');
  out += `| ${rel} | ${KENNEY}${rel} | CC0 1.0 |\n`;
}

out += `\n## Sounds (CC0)\n| File | Source URL | Licence | Author |\n|---|---|---|---|\n`;
for (const [folder, info] of Object.entries(soundPacks)) {
  const d = path.join(ROOT, 'public/audio', folder);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).sort()) {
    out += `| audio/${folder}/${f} | ${SOUNDS}${encodeURI(info.dir)}/${f} | CC0 1.0 | ${info.author} |\n`;
  }
}

fs.writeFileSync(path.join(ROOT, 'CREDITS.md'), out);
console.log('CREDITS.md written:', models.length, 'model files');
