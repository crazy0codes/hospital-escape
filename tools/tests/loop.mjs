const helpers = `
  window.__h = {
    tp(x, z) { const g = __game, P = g.player; P.pos.set(x, 0, z); g.physics.body.setTranslation({ x, y: 0.9, z }, true); g.physics.world.step(); P.applyCamera(0); },
    aim(pos) { const P = __game.player, d = pos.clone().sub(P.eye); P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); P.applyCamera(0); },
    near(pos) { const g = __game, r = g.enemy.query.findClosestPoint({ x: pos.x, y: 0, z: pos.z }, { halfExtents: { x: 2, y: 1.5, z: 2 } }).point; this.tp(r.x, r.z); this.aim(pos); },
    take(index) { const g = __game, k = g.pickups.find(p => p.index === index); this.near(k.pos); g.interact(); return k.taken; },
  };`;
export default async (page, { sleep, shot }) => {
  const out = {};
  try {
  await page.goto((process.env.BASE || 'http://127.0.0.1:5173') + '/?debug&nolock', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  await page.click('#startBtn');
  await sleep(1000);
  await page.evaluate(helpers);

  // key 1 + prompt
  out.key1 = await page.evaluate(() => { const g = __game; const k = g.pickups.find(p => p.index === 1); __h.near(k.pos); const t = g.findTarget(); const before = g.enemy.state; g.interact(); return { target: t && t.kind, taken: k.taken, keys: g.keysFound, enemyBefore: before, enemyAfter: g.enemy.state }; });
  await sleep(300);
  await page.evaluate(() => { const g = __game; g.enemy.reset(); g.enemy.setState('patrol'); });

  // chase and kill in the corridor
  out.chase = await page.evaluate(() => {
    const g = __game, E = g.enemy, P = g.player, T = __THREE;
    __h.tp(30, 14.3); E.pos.set(37, 0, 14.3); E.yaw = -Math.PI / 2; E.apply();
    P.flashlightOn = false; // so stun does not interfere
    const states = []; let n = 0;
    for (; n < 600; n++) { E.update(0.05); if (!states.length || states[states.length - 1] !== E.state) states.push(E.state); if (E.state === 'kill') break; }
    return { states, steps: n, dist: +E.distToPlayer().toFixed(2), gameState: g.state };
  });
  await page.waitForFunction('__game.state === "dead"', { timeout: 60000 });
  out.afterKill = await page.evaluate(() => ({ state: __game.state, deadVisible: !document.getElementById('dead').classList.contains('hidden'), text: document.getElementById('deadText').textContent }));
  await page.screenshot({ path: '/tmp/dead.png' });

  // restart
  await page.click('#restartBtn');
  await sleep(500);
  out.afterRestart = await page.evaluate(() => { const g = __game; return { state: g.state, keys: g.keysFound, pickupsTaken: g.pickups.filter(p => p.taken).length, enemy: g.enemy.state, battery: g.player.battery, pos: g.player.pos.toArray().map(v => +v.toFixed(1)) }; });

  // stun test: enemy 5 m ahead in corridor, light on, looking at it
  out.stun = await page.evaluate(() => {
    const g = __game, E = g.enemy, P = g.player, T = __THREE;
    E.reset(); E.wake(); E.stunCooldown = 0;
    __h.tp(20, 14.3); E.pos.set(25, 0, 14.3); E.yaw = -Math.PI / 2; E.apply();
    E.path = []; E.state = 'patrol'; E.timer = 99; // stand still
    P.yaw = -Math.PI / 2; P.pitch = 0; P.flashlightOn = true; P.applyCamera(0);
    const states = []; let n = 0;
    for (; n < 200; n++) { E.update(0.05); if (!states.length || states[states.length - 1] !== E.state) states.push(E.state); if (E.state === 'stunned') break; }
    const stunnedAt = n * 0.05;
    for (let i = 0; i < 80; i++) { E.update(0.05); if (!states.length || states[states.length - 1] !== E.state) states.push(E.state); }
    return { states, stunnedAfterSeconds: +stunnedAt.toFixed(2), enemyPos: [+E.pos.x.toFixed(1), +E.pos.z.toFixed(1)] };
  });

  // hearing: enemy patrolling far away should investigate a loud noise
  out.hearing = await page.evaluate(() => {
    const g = __game, E = g.enemy, P = g.player, T = __THREE;
    E.reset(); E.wake(); E.state = 'patrol';
    E.pos.set(10, 0, 14.3); E.apply(); E.stunCooldown = 99;
    __h.tp(18, 14.3);
    E.hear(P.pos, 12);
    const s1 = E.state; E.hear(new T.Vector3(60, 0, 40), 12); // too far: unchanged
    return { afterRunNoise: s1, afterFarNoise: E.state };
  });

  // battery pickup + drain
  out.battery = await page.evaluate(() => { const g = __game, P = g.player; P.battery = 30; const b = g.pickups.find(p => p.type === 'battery'); __h.near(b.pos); g.interact(); return { taken: b.taken, battery: P.battery }; });

  // full run: 3 keys, exit, win
  await page.evaluate(() => { __game.enemy.reset(); __game.enemy.stunCooldown = 0; });
  out.keys = await page.evaluate(() => { const g = __game; g.enemy.state = 'dormant'; g.enemy.sinceWake = -1e9; return [1, 2, 3].map(i => { g.enemy.state = 'dormant'; return __h.take(i); }).concat([g.keysFound, g.alarm]); });
  out.exitLocked = await page.evaluate(() => { const g = __game; g.enemy.state = 'dormant'; g.keysFound = 2; __h.tp(g.exit.x, g.exit.z - 1.4); __h.aim(new (__THREE.Vector3)(g.exit.x, 1.2, g.exit.z)); g.interact(); const r = { open: g.exit.open, toast: document.getElementById('toast').textContent }; g.keysFound = 3; return r; });
  out.exitOpen = await page.evaluate(() => { const g = __game; __h.tp(g.exit.x, g.exit.z - 1.4); __h.aim(new (__THREE.Vector3)(g.exit.x, 1.2, g.exit.z)); const t = g.findTarget(); g.interact(); return { target: t && t.kind, open: g.exit.open }; });
  await sleep(1800);
  await page.evaluate(() => { const g = __game; __h.tp(g.exit.x, g.exit.z - 1.0); g.player.yaw = Math.PI; g.player.applyCamera(0); g.enemy.state = 'dormant'; });
  await sleep(300);
  await page.screenshot({ path: '/tmp/exit.png' });
  out.walkThrough = await page.evaluate(() => { const g = __game; let stuck = 0; for (let i = 0; i < 120; i++) { const m = g.physics.movePlayer(0, 0.05); const moved = Math.hypot(m.x - g.player.pos.x, m.z - g.player.pos.z); g.player.pos.x = m.x; g.player.pos.z = m.z; if (moved < 0.01) stuck++; } return { z: +g.player.pos.z.toFixed(2), exitZ: +g.exit.z.toFixed(2), stuck }; });
  await page.waitForFunction('__game.state === "won"', { timeout: 60000 });
  out.win = await page.evaluate(() => ({ state: __game.state, visible: !document.getElementById('win').classList.contains('hidden'), text: document.getElementById('winText').textContent }));
  await page.click('#winBtn');
  await sleep(400);
  out.afterWinRestart = await page.evaluate(() => ({ state: __game.state, open: __game.exit.open, keys: __game.keysFound }));

  // pause / resume
  await page.keyboard.press('Escape');
  out.pause = await page.evaluate(() => ({ state: __game.state, visible: !document.getElementById('pause').classList.contains('hidden') }));
  await page.click('#resumeBtn');
  out.resume = await page.evaluate(() => __game.state);
  } catch (e) { out.ERROR = e.message; }
  return out;
};
