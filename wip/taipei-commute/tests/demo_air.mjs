// 看示範「壓縮空氣用完」：開車時空氣量會不會慢慢補回來、畫面上有沒有顯示「開車中慢慢補」。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await page.evaluate(() => { window.__tc.noRender = true; window.__tc.startDemo('empty'); });
await page.waitForFunction(() => window.__tc.G.demo && window.__tc.econ.stuntFuel < 0.01, null, { timeout: 200000 });
const t0 = Date.now(); let last = '';
for (let i = 0; i < 120; i++) {
  const s = await page.evaluate(() => { const { econ, car, G } = window.__tc; return { demo: !!G.demo, fuel: +(econ.stuntFuel * 100).toFixed(2), kmh: Math.round(car.kmh), odo: Math.round(car.odo), fill: document.getElementById('stuntFill').textContent, cap: document.getElementById('demoCap').textContent.slice(0, 30) }; });
  const line = JSON.stringify(s); if (line !== last) { console.log(Math.round((Date.now() - t0) / 1000) + 's', line); last = line; }
  if (!s.demo) break;
  await page.waitForTimeout(2500);
}
console.log(errs.slice(0, 3).join(' | ') || 'no page errors');
await browser.close();
