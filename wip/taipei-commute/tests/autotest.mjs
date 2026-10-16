import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 280 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8766/index.html#lowq-autotest');
const t0 = Date.now(); let n = 0;
while (Date.now() - t0 < 560000) {
  await page.waitForTimeout(15000);
  const st = await page.evaluate(() => { const { G, car, P } = window.__tc; return { st: G.state, ph: G.phase, cam: G.cam, v: car && car.v.toFixed(1), d: car && Math.hypot(car.x - P.x, car.z - P.z).toFixed(1), lbl: document.body.lastChild.textContent }; });
  console.log(JSON.stringify(st));
  await page.screenshot({ path: `shots/a${String(n++).padStart(2, '0')}.png` });
  if (st.lbl && st.lbl.includes('測試結束')) break;
}
console.log(logs.join('\n')); await browser.close();
