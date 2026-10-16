import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
const ev = (f, a) => page.evaluate(f, a); const wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 120000 });
await ev(() => { const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 1800 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 3, econ: { money: 20000, owned: ['nav', 'roadster'], carKey: 'roadster', stuntFuel: 1 } })); });
await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 120000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1200);
await page.keyboard.press('Enter'); await wait(500);
// frame rate in noRender
const fr = await ev(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log('raf fps (noRender):', fr);
await ev(() => { const { car, world, stunts, traffic } = window.__tc; traffic.clear(); traffic.factor = 0; stunts.reset(); car.place(-2501.7 , 4343.0, -1.801, world.groundAt(-2501.7, 4343.0)); });
await wait(2000);
await page.keyboard.press('KeyF');
for (let i = 0; i < 30; i++) {
  console.log(JSON.stringify(await ev(() => { const { stunts: s, G } = window.__tc; return { clk: +(G.clock * 10).toFixed(2), m: s.mode, t: +s.hopT.toFixed(2), y: +s.pos.y.toFixed(2), vy: +s.vel.y.toFixed(2), vx: +s.vel.x.toFixed(1), vz: +s.vel.z.toFixed(1), x: +s.pos.x.toFixed(1), z: +s.pos.z.toFixed(1) }; })));
  await wait(300);
}
console.log(errs.join('\n') || 'no errors');
await browser.close();
