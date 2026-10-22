// 手機：飛越 → 同一個位置的「翻轉」；太低來不及就不翻（不會翻車）；在畫面上左右快速滑一下也能翻。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: ['roadster', 'nav'], carKey: 'roadster', stuntFuel: 1 } })); });
await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(600);
// 放到一段比較空的直路上（士林水源快速道路，示範用的那段），清掉車流
const ROAD = { x: -2501.7, z: 4343.0, psi: -1.8011 };
await ev((R) => { const { car, world, traffic } = window.__tc; car.place(R.x, R.z, R.psi, world.groundAt(R.x, R.z)); car.v = 0; traffic.clear(); traffic.factor = 0; }, ROAD);
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 250); }, null, { timeout: 200000 }); await wait(1500);
await ev((R) => { const { car, world, stunts } = window.__tc; stunts.reset(); car.place(R.x, R.z, R.psi, world.groundAt(R.x, R.z)); car.v = 0; }, ROAD); await wait(800);
const rect = (id) => ev((id) => { const e = document.getElementById(id); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); }, id);
const st = () => ev(() => { const s = window.__tc.stunts; return { mode: s.mode, flip: !!s.flip, flips: s.stats.flips, crashes: s.stats.crashes, landIn: +s.landIn().toFixed(2), flipOff: document.getElementById('btnFlip').classList.contains('off'), toast: document.getElementById('toast').textContent.slice(0, 40) }; });
const ground = () => page.waitForFunction(() => { const s = window.__tc.stunts; if (s.mode !== 'ground') { s._gt2 = 0; return false; } s._gt2 = (s._gt2 || 0) + 1; return s._gt2 > 15; }, null, { timeout: 60000, polling: 100 });
const reset = async () => { await ev((R) => { const { car, world, stunts, econ } = window.__tc; stunts.reset(); econ.stuntFuel = 1; car.place(R.x, R.z, R.psi, world.groundAt(R.x, R.z)); car.v = 0; }, ROAD); await wait(700); };
// 1) 飛越 → 同一個位置馬上按「翻轉」
const jumpRect = await rect('btnJump');
await page.tap('#btnJump'); await wait(250);
const flipRect = await rect('btnFlip');
console.log('jump button', JSON.stringify(jumpRect), '→ flip button in air', JSON.stringify(flipRect), JSON.stringify(await st()));
await page.tap('#btnFlip'); await wait(200);
console.log('tap flip right away:', JSON.stringify(await st()));
await ground(); console.log('landed:', JSON.stringify(await st()));
// 2) 太晚才按（快落地）：不翻、不翻車
await reset(); await page.tap('#btnJump');
await page.waitForFunction(() => { const s = window.__tc.stunts; return s.mode === 'air' && s.landIn() < 0.9; }, null, { timeout: 30000, polling: 30 });
console.log('too late, button:', JSON.stringify(await st()));
await page.tap('#btnFlip'); await wait(200);
console.log('tap flip too late:', JSON.stringify(await st()));
await ground(); console.log('landed:', JSON.stringify(await st()));
// 3) 在畫面上左右快速滑一下
await reset(); await page.tap('#btnJump'); await wait(250);
const swipe = await ev(() => {
  const cv = document.querySelector('#app canvas'), r = cv.getBoundingClientRect(), x0 = r.left + r.width * 0.5, y0 = r.top + r.height * 0.4;
  const T = (x, y) => new Touch({ identifier: 9, target: cv, clientX: x, clientY: y });
  cv.dispatchEvent(new TouchEvent('touchstart', { touches: [T(x0, y0)], changedTouches: [T(x0, y0)], bubbles: true, cancelable: true }));
  for (let k = 1; k <= 4; k++) window.dispatchEvent(new TouchEvent('touchmove', { touches: [T(x0 - k * 30, y0)], changedTouches: [T(x0 - k * 30, y0)], bubbles: true }));
  window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [T(x0 - 120, y0)], bubbles: true }));
  return true;
});
await wait(200);
console.log('swipe left in air:', JSON.stringify(await st()), 'dir', await ev(() => window.__tc.stunts.flip && window.__tc.stunts.flip.dir));
await ground(); console.log('landed:', JSON.stringify(await st()));
// 4) 在地上滑一下：不會怎樣
await reset();
await ev(() => {
  const cv = document.querySelector('#app canvas'), r = cv.getBoundingClientRect(), x0 = r.left + r.width * 0.5, y0 = r.top + r.height * 0.4;
  const T = (x, y) => new Touch({ identifier: 9, target: cv, clientX: x, clientY: y });
  cv.dispatchEvent(new TouchEvent('touchstart', { touches: [T(x0, y0)], changedTouches: [T(x0, y0)], bubbles: true, cancelable: true }));
  window.dispatchEvent(new TouchEvent('touchmove', { touches: [T(x0 + 120, y0)], changedTouches: [T(x0 + 120, y0)], bubbles: true }));
  window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [T(x0 + 120, y0)], bubbles: true }));
});
await wait(500); console.log('swipe on ground:', JSON.stringify(await st()));
console.log('phone tip rows:', await ev(() => { const { input } = window.__tc; return input.coarse; }));
console.log(errs.slice(0, 4).join(' | ') || 'no page errors');
await browser.close();
