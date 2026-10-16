// 用除錯攝影機從上方檢視玩家周圍
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const out = process.argv[2] || 'shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 30000 });
await page.evaluate(() => { const G = window.__tc.G; G.cfg.di = 5; G.cfg.home = G.meta.homes[5][0]; const h = G.cfg.home; G.cfg.work = G.meta.works.find(w => { const d = Math.hypot(w.x - h.x, w.z - h.z); return d > 2000 && d < 4000; }); G.cfg.car = 'gas'; G.carPicked = true; });
await page.click('#btnGo', { force: true }).catch(() => {});
await page.evaluate(() => { document.getElementById('btnGo').disabled = false; document.getElementById('btnGo').click(); });
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 90000 });
await page.evaluate(() => { const P = window.__tc.P; P.x = 1.2; P.z = -2.2; });
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 5000 });
await page.waitForTimeout(3000);
const h = await page.evaluate(() => { const { G, P } = window.__tc; return { px: P.x, pz: P.z, cx: G.car.x, cz: G.car.z, home: G.cfg.home }; });
console.log(JSON.stringify(h));
for (const [name, dc] of [['top_home', { x: h.px + 1, y: 90, z: h.pz + 60, tx: h.px, tz: h.pz }], ['top_car', { x: h.cx + 1, y: 45, z: h.cz + 30, tx: h.cx, tz: h.cz }], ['low_car', { x: h.cx + 14, y: 6, z: h.cz + 10, tx: h.cx, tz: h.cz, ty: 1 }]]) {
  await page.evaluate((dc) => { window.__tc.debugCam = dc; }, dc);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
