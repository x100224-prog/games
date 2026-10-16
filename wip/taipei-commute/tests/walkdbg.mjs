import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 700, height: 400 } });
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8766/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title');
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk');
await page.waitForTimeout(3000);
const r = await page.evaluate(() => { const { P, car, world } = window.__tc;
  const gr = world.groundAt(P.x, P.z, P.y); const s = world.surfaceAt(P.x, P.z, P.y, {});
  return { P: { x: P.x, y: P.y, z: P.z }, gr, surf: s ? s.y : null, car: { x: car.x, z: car.z }, bld: !!world.buildingAt(P.x, P.z) }; });
console.log(JSON.stringify(r));
await page.keyboard.down('KeyW');
for (let i = 0; i < 4; i++) { await page.waitForTimeout(3000); console.log(JSON.stringify(await page.evaluate(() => { const { P, tp } = window.__tc; return { x: P.x.toFixed(2), z: P.z.toFixed(2), y: P.y.toFixed(2), sp: P.speed.toFixed(2), yaw: tp.yaw.toFixed(2) }; }))); }
await browser.close();
