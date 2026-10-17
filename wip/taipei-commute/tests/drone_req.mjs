// 無人機飛行系統要先有飛天跑車：商店按鈕、開油車按 U、開飛天跑車按 U。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true).catch(() => false);
page.setDefaultTimeout(240000);
async function start(econ) {
  await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq');
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 180000 });
  await ev((econ) => { const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 2000 && d < 4000; });
    localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 3, econ })); }, econ);
  await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq');
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 180000 });
  await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
  await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
}
async function shopButton() { await ev(() => { const { P } = window.__tc; P.x = -1.25; P.z = -0.45; }); await wait(400); await page.keyboard.press('KeyE'); await wait(800);
  const r = await ev(() => [...document.querySelectorAll('#shopList .item')].map(d => d.querySelector('b').textContent + '：' + d.querySelector('.buy').textContent));
  await page.click('#shopClose'); return r; }
async function toDrive() {
  await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
  await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
  await wait(600); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
  await page.keyboard.press('Enter'); await until(() => !window.__tc.G.seatAdj, null, 30000); await wait(1500);
}
await start({ money: 20000000, owned: [], carKey: 'gas', stuntFuel: 1 });
console.log('nothing owned →', (await shopButton()).join(' | '));
await start({ money: 20000000, owned: ['roadster'], carKey: 'roadster', stuntFuel: 1 });
console.log('roadster owned →', (await shopButton()).join(' | '));
await start({ money: 20000000, owned: ['roadster', 'drone'], carKey: 'gas', stuntFuel: 1 });
await toDrive(); await page.keyboard.press('KeyU'); await wait(1500);
console.log('drone owned, driving gas car, U →', await ev(() => ({ flying: window.__tc.flight.active, toast: document.getElementById('toast').textContent })));
await start({ money: 20000000, owned: ['roadster', 'drone'], carKey: 'roadster', stuntFuel: 1 });
await toDrive(); await page.keyboard.press('KeyU');
const ok = await until(() => window.__tc.flight.active && window.__tc.car.y - window.__tc.world.groundAt(window.__tc.car.x, window.__tc.car.z) > 25, null, 120000);
console.log('driving roadster, U →', ok);
await ev(() => { window.__tc.noRender = false; }); await wait(2500); await page.screenshot({ path: 'shots/dr_roadster.png' });
console.log(errs.join('\n') || 'no page errors');
await browser.close();
