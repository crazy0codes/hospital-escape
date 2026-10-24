# St. Aldric: Night Shift Never Ended

First-person 3D horror in the browser. You wake in a closed hospital at night. One stalker hunts you. Find 3 keys, unlock the exit, get out. About 10 to 15 minutes.

## Run

Needs Node 18+.

```bash
npm install
npm start
```

Open the URL it prints (http://localhost:5173), click **Click to begin**.

To play the production build instead: `npm run play` (opens on http://localhost:4173).

Use Chrome, Edge or Firefox with headphones. Sounds are `.ogg`; browsers without Ogg Vorbis support (older Safari) will run the game silently.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look |
| Shift | Run (loud, 5 s of stamina) |
| F | Flashlight |
| E | Interact (take, read, unlock) |
| Esc | Pause |
| R | Restart (after death or win) |

## How it plays

- Keys are in Ward A (north), the Pharmacy (north east) and the Boiler Room (south west). The exit is at the south end.
- The torch drains. Spare cells (green cans) give +35%.
- The Patient hears running (12 m) and walking (5 m), and sees you in its view cone (14 m, or 8 m if you stand still with the torch off).
- Holding the torch beam on it for about a second makes it flinch for a few seconds. It then comes back, so use it to get away, not to win.
- Each key makes the hospital worse: key 1 wakes it, key 2 kills corridor lights and speeds it up, key 3 starts an alarm and it hunts you.

## Stack

three.js (rendering, GLTF, animation, positional audio), Rapier (collisions and character controller), recast-navigation (navmesh and pathfinding), postprocessing (bloom, vignette, grain, grade), Vite. Custom code is only the level layout, enemy rules and game flow in `src/`.

## Assets

All CC0. Sources and file list are in `CREDITS.md`. Design notes are in `GAME_SCRIPT.md`.

## What was and wasn't tested

Tested automatically in headless Chromium (software WebGL), against both dev and production builds: loads with no console errors or warnings; every key, battery, note, waypoint and the exit is reachable on the navmesh; the player capsule collides with walls and furniture and passes through doorways; enemy patrol, hear, chase, stun and kill; key pickup, locked and unlocked exit, win, death, restart and pause; keyboard and mouse input.

Not tested (no way to here): real GPU frame rate, how the sound mix and scare pacing feel, pointer lock in a real browser window (the tests used a no-lock mode), Safari. Software rendering ran at only a few frames per second, so performance on a laptop is unmeasured. The scene is light (about 130 meshes, 43k triangles, one shadow-casting light) but treat smoothness as unconfirmed.

Known limits: the models are low-poly and flat coloured, so the look comes from darkness, fog and grain. The stalker is a stylised zombie from a CC0 pack, not a realistic character.

Optional test scripts are in `tools/tests/` (they need `@sparticuz/chromium` and `puppeteer-core`).
