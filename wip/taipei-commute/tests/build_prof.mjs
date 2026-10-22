// 小格建立時間拆解（電腦速度，不降速）：哪一步最花時間。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const ev = (f, a) => page.evaluate(f, a);
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.world, null, { timeout: 200000 });
const r = await ev(async () => {
  const { world } = window.__tc, W = world, acc = {}, P = Object.getPrototypeOf(W);
  for (const fn of ['_roadGeo', '_bldGeo', '_realSigns', '_roadSigns', '_terrainMesh', '_park', '_parkTrees', '_sidewalk', '_tunnelGeo']) {
    const f0 = P[fn]; W[fn] = function (...a) { const t = performance.now(); const r = f0.apply(this, a); acc[fn] = (acc[fn] || 0) + performance.now() - t; return r; };
  }
  let tot = 0, n = 0; const b0 = P._build; W._build = function (c, t) { const s = performance.now(); b0.call(this, c, t); tot += performance.now() - s; n++; };
  // 載入東區一帶 9 個小格
  window.__tc.noRender = true;
  for (let i = 0; i < 400 && (n < 20); i++) { W.update(1290, 1182, 0.3, 50); await new Promise(r => setTimeout(r, 50)); }
  const o = {}; for (const k in acc) o[k] = Math.round(acc[k] / n * 10) / 10; return { cells: n, perCell: Math.round(tot / n), parts: o };
});
console.log(JSON.stringify(r));
await browser.close();
