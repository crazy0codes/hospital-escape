export default async (page, { sleep, shot }) => {
  await page.goto((process.env.BASE || 'http://127.0.0.1:5173') + '/?debug&nolock', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  await shot('/tmp/title.png');
  await page.click('#startBtn');
  await sleep(2500);
  await shot('/tmp/spawn.png');
  return await page.evaluate(() => ({ state: __game.state, pos: __game.player.pos.toArray(), calls: __game.renderer.info.render.calls, tris: __game.renderer.info.render.triangles }));
};
