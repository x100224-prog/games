// 手機在家裡的鏡頭：拍直拿、橫拿、彈鋼琴、走到門口。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, vp] of [['port', { width: 390, height: 844 }], ['land', { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
  page.setDefaultTimeout(300000);
  await page.goto('http://localhost:8768/index.html');
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
  await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
    localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: [], carKey: 'gas' } })); });
  await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
  await page.click('#btnContinue');
  await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 }); await wait(3500);
  const cam = () => ev(() => { const { camera, P } = window.__tc; return { dist: +Math.hypot(camera.position.x - P.x, camera.position.y - 1.55, camera.position.z - P.z).toFixed(2), camY: +camera.position.y.toFixed(2), fov: camera.fov }; });
  console.log(tag, 'room start', JSON.stringify(await cam())); await page.screenshot({ path: `shots/room_${tag}_start.png` });
  await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -1.6; }); await wait(2500);
  console.log(tag, 'near door', JSON.stringify(await cam())); await page.screenshot({ path: `shots/room_${tag}_door.png` });
  await ev(() => { const { P } = window.__tc; P.x = -0.2; P.z = 0.3; }); await wait(2500);
  console.log(tag, 'middle', JSON.stringify(await cam())); await page.screenshot({ path: `shots/room_${tag}_mid.png` });
  console.log(errs.slice(0, 3).join(' | ') || 'no page errors');
  await ctx.close();
}
await browser.close();
