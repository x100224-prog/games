import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8766/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title');
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk');
await page.waitForTimeout(3000);
// 找最近的路名牌，把鏡頭放在它前面的路上
const info = await page.evaluate(() => {
  const { signs, P } = window.__tc; let best = null;
  for (const list of signs.all.values()) for (const s of list) if (s.road) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (!best || d < best.d) best = { d, s }; }
  if (!best) return null; const s = best.s;
  window.__tc.debugCam = { x: s.x + s.nx * 7 - s.tx * 2.5, y: s.y - 1.2, z: s.z + s.nz * 7 - s.tz * 2.5, tx: s.x, ty: s.y - 0.3, tz: s.z };
  document.getElementById('hud').hidden = true;
  return { text: s.text, en: s.en, d: best.d.toFixed(1), n: [...signs.all.values()].flat().filter(x => x.road).length };
});
console.log(JSON.stringify(info));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'shots/s01_sign.png' });
await page.evaluate(() => { const { P } = window.__tc; window.__tc.debugCam = null; document.getElementById('hud').hidden = false; });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/s02_walk.png' });
console.log(logs.join('\n')); await browser.close();
