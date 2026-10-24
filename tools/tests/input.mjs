export default async (page, { sleep }) => {
  const out = {};
  await page.goto((process.env.BASE || 'http://127.0.0.1:5173') + '/?debug&nolock', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  await page.click('#startBtn');
  await sleep(800);
  const pos = () => page.evaluate(() => ({ x: +__game.player.pos.x.toFixed(2), z: +__game.player.pos.z.toFixed(2), st: +__game.player.stamina.toFixed(2), run: __game.player.running, light: __game.player.flashlightOn, yaw: +__game.player.yaw.toFixed(2) }));
  const p0 = await pos();
  await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
  const p1 = await pos();
  out.walkForward = { from: p0, to: p1 };
  await page.keyboard.down('Shift'); await page.keyboard.down('KeyS'); await sleep(1500);
  out.runBack = await pos();
  await page.keyboard.up('KeyS'); await page.keyboard.up('Shift');
  await page.keyboard.press('KeyF'); await sleep(200);
  out.lightAfterF = (await pos()).light;
  await page.keyboard.press('KeyF'); await sleep(200);
  out.lightAfterFF = (await pos()).light;
  await page.mouse.move(600, 300); await page.mouse.move(700, 300);
  out.yawAfterMouse = (await pos()).yaw;
  // walk into a wall for 2 s: must not escape the map
  await page.evaluate(() => { __game.player.yaw = Math.PI / 2; });
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
  out.intoWall = await pos();
  return out;
};
