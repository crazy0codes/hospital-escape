export default async (page, { sleep }) => {
  await page.goto((process.env.BASE || 'http://127.0.0.1:5173') + '/?debug&nolock', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  await page.click('#startBtn'); await sleep(500);
  return await page.evaluate(() => {
    const g = __game, P = g.player, C = 2.2, res = {};
    const tp = (x, z) => { P.pos.set(x, 0, z); g.physics.body.setTranslation({ x, y: 0.9, z }, true); g.physics.world.step(); };
    const push = (dx, dz, n) => { for (let i = 0; i < n; i++) { const m = g.physics.movePlayer(dx, dz); P.pos.x = m.x; P.pos.z = m.z; } return [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)]; };
    tp(3 * C, 2 * C); res.westWall = push(-0.08, 0, 200);        // Reception west wall at x = 1*C
    tp(3 * C, 2 * C); res.northWall = push(0, -0.08, 200);       // north wall z = 1*C
    tp(3 * C, 2 * C); res.southThroughWallNotDoor = push(0, 0.08, 200); // south wall of reception (x=3 has no door) at z = 6*C
    tp(4.5 * C, 2 * C); res.southThroughDoor = push(0, 0.08, 120);     // door at x=4 (4.29..4.72)
    tp(11.3 * C, 3 * C); res.intoBed = push(0, -0.08, 60);       // bed row in ward A near z 1.06..2.18 (cells)
    res.walls = { westLimit: 1 * C, northLimit: 1 * C, southLimit: 6 * C };
    return res;
  });
};
