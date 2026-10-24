// Usage: node game-test.mjs <scenario.js> ; scenario exports async (page, helpers) => result
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const scenario = (await import(path.resolve(process.argv[2]))).default;
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const out = await scenario(page, { sleep, shot: (p) => page.screenshot({ path: p }) });
  if (out !== undefined) console.log('RESULT:', JSON.stringify(out, null, 1));
} catch (e) { console.log('SCENARIO ERROR:', e.message); }
console.log('PROBLEMS:', problems.length ? '\n' + [...new Set(problems)].join('\n') : 'none');
await browser.close();
