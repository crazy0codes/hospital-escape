# GAME_SCRIPT: St. Aldric Hospital (working title: "Night Shift Never Ended")

## 1. Premise and story beats
You wake on a gurney-less bed in the reception ward of St. Aldric Hospital, closed for years. Power is out except flickering emergency lamps. Your phone is gone; only a flashlight lies on the bedside table. A patient who never left is roaming the halls ("the Patient").

Beats (delivered as 3 short wall notes + audio, no cutscenes):
1. Wake. Note: "Exit sealed at 02:00. Three keys: Ward A, Pharmacy, Boiler Room."
2. Key 1 (Ward A). Lights flicker, a distant door slams. The Patient wakes and starts patrolling.
3. Key 2 (Pharmacy). Corridor lights die in sections. Patient patrols faster, investigates noise.
4. Key 3 (Boiler Room). Alarm loop starts. Patient is told where you are (heads to your position, then hunts).
5. Reach the Exit Lobby, insert 3 keys (E), door slides open, run out. WIN.

## 2. Scene (one location, one floor)
Grid map, 1 cell = 2.2 m. Approx 28 x 20 cells (62 x 44 m) so keys are far apart and a first run lasts 8-12 min. Wall height ~2.8 m.
- Reception Ward (spawn), central loop corridor (lets you run circles), Ward A (key 1), Ward B (loot: battery, note), Pharmacy (key 2), Boiler Room (key 3, dead-end side branch = tension), Exit Lobby (locked exit door).
- Layout lives in `src/level.js` as an ASCII grid. Walls/floors/furniture are Kenney GLBs placed from the grid.
- 4 battery pickups, 3 notes, 3 keys.

## 3. Player mechanics
WASD move, mouse look (Pointer Lock), Shift run (stamina 5 s, regen 8 s, running is loud), F flashlight toggle, E interact, Esc pause.
- Flashlight: SpotLight with shadow. Battery 100% = 240 s of ON time. Below 20% it flickers. 0% = dark. Battery pickup +35%.
- Footstep sounds from surface; running is audible to the Patient at 12 m, walking at 5 m, crouch-less.
- Interact: ray from camera, 2 m range, prompt "[E] Take key".
- Collision: Rapier kinematic character controller (capsule) vs cuboid colliders for walls and furniture.

## 4. Enemy: "the Patient" (Kenney Graveyard Kit zombie, scaled to 1.9 m)
Navigation: recast-navigation NavMesh built from level geometry at load, `NavMeshQuery.computePath`, path-following with simple steering. Own tiny state machine (game logic only).

States:
- **Dormant**: stands idle facing a wall in Ward B. Wakes when key 1 is taken, 90 s pass, or the player comes within 4 m.
- **Patrol**: walks between room waypoints (walk anim, speed 1.6 m/s, 2.0 after key 2).
- **Investigate**: heard noise (running within 12 m, walking within 5 m, item pickup/door slam within 10 m). Goes to the noise point, waits 3 s, scans.
- **Chase**: sees player (line of sight raycast, FOV 110 deg, range 14 m, 8 m if flashlight is off and player is still). Sprint anim, 3.3 m/s (player run is 4.0 m/s, walk 2.4 m/s), ramping from 2.0 to 3.3 over the first 2 s so a chase is never an instant kill. Repaths every 0.3 s. Gives up (Search) after 6 s without line of sight or if the player is over 25 m away.
- **Search**: lost the player for 2 s. Goes to last known position, then wanders nearby 10 s, then back to Patrol.
- **Stunned**: flashlight beam held on it for 1.2 s (within 8 m, in cone) makes it recoil for 2.5 s (cooldown 8 s). This is the panic button, not a kill.
- **Kill**: within 1.1 m, attack animation, then Game Over screen.

How to escape: break line of sight and stay quiet, loop the central corridor, stun it with the light and run, outrun it using Shift (stamina limits this).

## 5. Scare and pacing plan
- 0:00-2:30 QUIET: ambience loop, drips, distant weird sounds; no enemy visible. Reader of notes builds dread.
- Key 1 (about 3-4 min) TENSION: flicker, door slam, creature sound far away, first patrol sighting at end of corridor.
- Key 2 (about 6-7 min) PAYOFF 1: lights die in corridor sections, first real chase. Enemy faster.
- Key 3 (about 9 min) PAYOFF 2: alarm loop, hunted to the exit. Finale: Patient guarding the Exit Lobby corridor, uses the loop to reach the door.
- Stretch goal only (built last, cut if time is short): a wheelchair rolls across the corridor as you pass, once.
- Music-free; tension from dynamic audio: low drone volume rises as the Patient gets closer, creature breath within 6 m, footsteps positional so you can hear where it is.

## 6. Win / lose / restart
- WIN: 3 keys inserted, exit door opens, step through trigger. Screen: time, batteries used. Button "Play again".
- LOSE: caught. Screen "It found you." Button "Try again". R also restarts.
- Restart resets scene state without page reload (re-seeds keys/batteries/patient).

## 7. Libraries (verified installed via npm, current versions)
| Need | Library | Version |
|---|---|---|
| Rendering, GLTF loading, animation, positional audio, spot light | three | 0.186.1 |
| Post-processing: bloom, vignette, noise | postprocessing | 6.39.5 |
| Physics/collision | @dimforge/rapier3d-compat | 0.21.0 |
| NavMesh and pathfinding | recast-navigation + @recast-navigation/three | 0.43.1 |
| Dev server and bundler | vite | 8.3.5 |
Audio: three.js built-in `AudioListener`/`PositionalAudio` (no extra library). Plain DOM for menus/HUD.
Rejected: Yuka (steering/FSM, no navmesh from meshes), cannon-es (Rapier has a ready character controller).
API checked in installed READMEs: `init()`, `threeToSoloNavMesh(meshes, cfg)`, `new NavMeshQuery(navMesh)`, `computePath(start, end)`.

## 8. Asset list (all CC0, fetched from GitHub since asset websites are blocked in this environment)
Models: `https://raw.githubusercontent.com/shorepine/kenney/main/3d/<kit>/<file>.glb` (Kenney, CC0; mirror of kenney.nl)
- furniture: wall, wallDoorway, wallCorner, floorFull, bedSingle, bedDouble, sideTable, sideTableDrawers, desk, chair, chairDesk, bookcaseClosed, bookcaseOpen, kitchenCabinet, kitchenCabinetUpper, lampWall, lampSquareCeiling, toilet, bathroomSink, trashcan, cardboardBoxClosed, rugRectangle
- graveyard: character-zombie (stalker, has idle/walk/sprint/attack-melee-right/die animations)
- platformer: key, lock
- prototype: wheelchair, door-sliding-double-wide (exit door; verify), shape-cylinder (door frame filler only if needed)
- food: can-small (recoloured emissive green as a battery cell; honest note in README)
Sounds: `https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/<branch>/<path>` (repo LICENSE is CC0; packs named CC0)
- 30-cc0-sfx-loops: ambient_01-03, noise_01, machine_01, alarm_01, weird_01
- 30-cc0-weird-sfx: weird_01-30 (stingers, distant sounds)
- 80-CC0-creature-SFX: breath, monster_01-07, howl, roar_01, scream_01 (kill)
- 100-CC0-SFX: door_open, door_close_01, slam_01-03, key_open_01-02, metal_01-05, glass_01, paper_01
- kenney_impactsounds: footstep_concrete_000-004 (player and patient)
All sources and licences go in CREDITS.md. Total size target well under 100 MB (models about 7 MB).

## 9. Performance plan
- One shadow-casting light only (flashlight, 1024 map). Emergency lamps are non-shadow point lights, max 3 active (nearest to player), rest are emissive meshes.
- Static level meshes merged/instanced per material to keep draw calls low. Fog hides draw distance.
- Pixel ratio capped at 1.5. Postprocessing in one EffectPass.
- NavMesh generated once at load from floor + wall + furniture meshes, agentRadius 0.4, agentHeight 1.9, agentMaxClimb 0.25 so bed/desk tops are not walkable. Targets are snapped with `findClosestPoint`.
- Kenney furniture has flat colours and no textures. Look comes from darkness, fog, a desaturated colour grade, grain and vignette. Expect a stylised look, not realism.
- Patient moves along navmesh path, not through Rapier (no physics for it).

## 10. Build order (run after each)
1. Project, scene, player controller, Rapier collisions, level from grid.
2. Lighting, fog, flashlight, post-processing, flicker lamps.
3. Interactables: keys, batteries, notes, exit door, HUD prompts.
4. Enemy: model, animations, navmesh, FSM, senses.
5. Audio: ambience, footsteps, positional enemy sounds, stingers, dynamic drone.
6. Menus and UI: title, pause, HUD (battery, stamina, keys), game over, win.
7. Win/lose/restart loop, README, CREDITS.

## 11. Loop pieces required (added by validator)
Title screen with controls, click-to-start (needed for audio and pointer lock), pause on Esc or pointer lock loss, objective line ("Find 3 keys 0/3"), key/battery/stamina HUD, low battery warning, death camera facing the Patient, win screen, restart without reload, volume handled by a single master gain.

## 12. Validation log
Round 1 (found and fixed):
- Map too small for a 10-15 min target: enlarged to 28 x 20 cells.
- Chase could be an instant kill: added speed ramp, 6 s give-up rule, 25 m lose-track rule.
- Dormant enemy could be skipped or stumbled into unfairly: added 4 m wake radius.
- Navmesh and furniture could disagree: furniture is in the navmesh input, agentMaxClimb 0.25.
- Scope: wheelchair scare demoted to stretch goal.
- Flat untextured models: look relies on fog, grade, grain, vignette (stated as a limit).
- Missing loop pieces added (section 11).
Round 2 (checked):
- All 50 asset URLs (27 models, 23 sounds) fetched: all HTTP 200.
- Rapier 0.21 character controller API and recast 0.43 `threeToSoloNavMesh` signature present in installed typings.
- Headless Chromium (with SwiftShader WebGL) installs from npm, so a load/console-error smoke test is possible.
Open risks accepted: sound mix and scare balance cannot be judged by ear here; zombie model is not hospital-themed.

## 13. Build notes (deviations from the script)
- Wheelchair scare (stretch goal) was cut, along with its model.
- Map is 28 x 22 cells. Assets trimmed to what the game uses (27 models, about 34 sounds, 2.6 MB).
- Final speeds: patrol 1.6 to 2.0 m/s, chase 3.3 to 3.75 m/s (ramps up over 2 s), player walk 2.4 and run 4.0 m/s.
- Battery cell is a recoloured tin can (food/can-small); notes are a book model; the Patient is a user-supplied wendigo model (procedural gait, see src/creature.js).
- Audio is decoded after the Start click so no AudioContext exists before a user gesture.

## 14. Known limits
Cannot listen to audio or see the game with eyes in this environment: balance of scares, sound mix and visual look are untested by a human. Automated checks: build succeeds, game loads in headless browser if one is available, no console errors.
