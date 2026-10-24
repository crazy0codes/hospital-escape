export default async (page, { sleep }) => {
  await page.goto((process.env.BASE || 'http://127.0.0.1:5173') + '/?debug&nolock', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  await page.click('#startBtn');
  await sleep(1500);
  return await page.evaluate(() => {
    const g = __game, T = __THREE, P = g.player, E = g.enemy, out = {};
    const tp = (x, z) => { P.pos.set(x, 0, z); g.physics.body.setTranslation({ x, y: 0.9, z }, true); g.physics.world.step(); P.applyCamera(0); };
    const q = E.query;
    // 1. reachability from spawn
    const from = g.level.spawn.pos;
    const targets = [...g.level.waypoints.map((w, i) => ['wp' + i, w]), ...g.pickups.map((p, i) => [p.type + (p.index ?? i), p.pos]), ['exit', new T.Vector3(g.exit.x, 0, g.exit.z - 1.2)]];
    out.unreachable = [];
    for (const [name, pos] of targets) {
      const s = q.findClosestPoint({ x: pos.x, y: 0, z: pos.z }, { halfExtents: { x: 2, y: 1.5, z: 2 } });
      if (!s.success) { out.unreachable.push(name + ':nopoly'); continue; }
      const r = q.computePath({ x: from.x, y: 0, z: from.z }, s.point, { halfExtents: { x: 2, y: 1.5, z: 2 } });
      const last = r.path[r.path.length - 1];
      if (!r.success || !last || Math.hypot(last.x - s.point.x, last.z - s.point.z) > 0.5) out.unreachable.push(name);
    }
    // 2. walk the real capsule along navmesh paths between key spots
    const walk = (to) => {
      const r = q.computePath({ x: P.pos.x, y: 0, z: P.pos.z }, to, { halfExtents: { x: 2, y: 1.5, z: 2 } });
      let stuck = 0;
      for (const c of r.path) {
        for (let i = 0; i < 400; i++) {
          const dx = c.x - P.pos.x, dz = c.z - P.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.25) break;
          const s = Math.min(0.08, d);
          const m = g.physics.movePlayer(dx / d * s, dz / d * s);
          const moved = Math.hypot(m.x - P.pos.x, m.z - P.pos.z);
          P.pos.x = m.x; P.pos.z = m.z;
          if (moved < s * 0.2) stuck++;
          if (i === 399) stuck += 100;
        }
      }
      return stuck;
    };
    out.walk = {};
    const stops = [['key1', g.pickups.find(p => p.index === 1).pos], ['key2', g.pickups.find(p => p.index === 2).pos], ['key3', g.pickups.find(p => p.index === 3).pos], ['exit', new T.Vector3(g.exit.x, 0, g.exit.z - 1.2)]];
    for (const [n, p] of stops) {
      const t = q.findClosestPoint({ x: p.x, y: 0, z: p.z }, { halfExtents: { x: 2, y: 1.5, z: 2 } }).point;
      out.walk[n] = { stuckSteps: walk(t), at: [+P.pos.x.toFixed(1), +P.pos.z.toFixed(1)], target: [+p.x.toFixed(1), +p.z.toFixed(1)] };
    }
    tp(from.x, from.z);
    // 3. enemy sim: wake and run 120 s of game time without rendering
    E.wake();
    const seen = {}; let moved = 0, last = E.pos.clone(), offMesh = 0;
    for (let i = 0; i < 2400; i++) {
      E.update(0.05);
      seen[E.state] = (seen[E.state] || 0) + 1;
      moved += E.pos.distanceTo(last); last.copy(E.pos);
      if (i % 20 === 0) { const c = q.findClosestPoint({ x: E.pos.x, y: 0, z: E.pos.z }, { halfExtents: { x: 0.5, y: 1, z: 0.5 } }); if (!c.success || Math.hypot(c.point.x - E.pos.x, c.point.z - E.pos.z) > 0.4) offMesh++; }
      if (E.state === 'kill') break;
    }
    out.enemy = { states: seen, distanceWalked: +moved.toFixed(1), offMeshSamples: offMesh, pos: [+E.pos.x.toFixed(1), +E.pos.z.toFixed(1)] };
    return out;
  });
};
