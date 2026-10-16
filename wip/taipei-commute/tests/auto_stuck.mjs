// 自動示範卡住時是撞到什麼：只跑邏輯，偵測到卡住就畫一張圖
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const ev = (f, a) => page.evaluate(f, a);
page.setDefaultTimeout(180000);
await page.goto('http://localhost:8767/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 90000 });
await ev(() => { window.__tc.noRender = true; });
await page.click('#btnAuto');
let stuck = 0, moved = false;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(500);
  const s = await ev(() => { const c = window.__tc.car, G = window.__tc.G; return { st: G.state, seat: G.seatAdj, v: c ? c.v : 0, kmh: c ? c.kmh : 0, x: c && c.x, z: c && c.z, psi: c && c.psi, bumps: c && c.bumps }; });
  if (s.kmh > 5) moved = true;
  if (moved && s.st === 'drive' && s.kmh < 1) stuck++; else stuck = 0;
  if (stuck === 3) {
    console.log('stuck at', JSON.stringify(s));
    const near = await ev(() => { const { car, traffic, parking, world } = window.__tc; const out = [];
      for (const c of traffic.cars) { const d = Math.hypot(c.x - car.x, c.z - car.z); if (d < 8) out.push('traffic ' + d.toFixed(1) + ' v=' + c.v.toFixed(1)); }
      for (const b of parking.parked) { const d = Math.hypot(b.x - car.x, b.z - car.z); if (d < 8) out.push('parked ' + d.toFixed(1)); }
      const bl = world.buildingAt(car.x + car.fwdX * 3, car.z + car.fwdZ * 3); if (bl) out.push('building ahead');
      for (const b of world.barriers) { const d = Math.hypot(b.x - car.x, b.z - car.z); if (d < 10) out.push('barrier ' + d.toFixed(1)); }
      const o = {}; const e = world.nearestEdge(car.x, car.z, 30, null, o); out.push('road ' + (e && e.name) + ' cls ' + (e && e.cls) + ' off ' + (o.d != null ? o.d.toFixed(1) : '?'));
      return out; });
    console.log(near.join('\n'));
    await ev(() => { window.__tc.noRender = false; }); await page.waitForTimeout(4000);
    await page.keyboard.press('KeyC'); await page.waitForTimeout(3000);
    await page.screenshot({ path: 'shots/auto_stuck.png' });
    break;
  }
}
await browser.close();
