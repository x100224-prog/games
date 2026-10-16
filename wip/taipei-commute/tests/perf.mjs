import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + ' ' + e.stack)); page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
await page.goto('http://localhost:8766/index.html' + (process.argv[2] || ''));
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 60000 });
await page.waitForTimeout(5000);
const r = await page.evaluate(async () => {
  const { renderer, scene, camera, world } = window.__tc;
  const t0 = performance.now(); renderer.render(scene, camera); const t1 = performance.now();
  renderer.render(scene, camera); const t2 = performance.now();
  return { first: t1 - t0, second: t2 - t1, cells: world.cells.size, loaded: world.loadedCount, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries };
});
console.log(JSON.stringify(r)); console.log(logs.slice(0, 10).join('\n'));
await browser.close();
