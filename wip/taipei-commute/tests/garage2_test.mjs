// 住處停車位二選一：路邊住戶專用車位（家門口藍色 P）、地下停車位（家裡多一層地下室：早上搭電梯下樓開車、晚上開進地下室再搭電梯回家）。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const boot = async () => { await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq'); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 }); };
const startWith = async (owned) => {
  await boot();
  await ev((owned) => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0];
    const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
    localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 9000000, owned, carKey: 'gas' } })); }, owned);
  await boot(); await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
  await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 }); await wait(800);
};
const shot = async (name) => { await ev(() => { window.__tc.noRender = false; }); await wait(2200); await page.screenshot({ path: `shots/${name}.png` }); await ev(() => { window.__tc.noRender = true; }); };
const info = () => ev(() => { const { G, car } = window.__tc, gs = G.garage; return { state: G.state, phase: G.phase, leg: G.leg, garage: gs && gs.type, carToSpot: gs ? +Math.hypot(car.x - gs.x, car.z - gs.z).toFixed(1) : null, prompt: document.getElementById('prompt').innerText, toast: document.getElementById('toast').textContent, task: document.getElementById('taskText').textContent }; });
const toWorkAndBack = async () => {
  await ev(() => { const { car, G } = window.__tc; car.place(G.cfg.work.x, G.cfg.work.z, 0, 0); car.v = 0; });
  await page.waitForFunction(() => { const { parking, car } = window.__tc; return parking.readyAround(car.x, car.z, 200); }, null, { timeout: 200000 }); await wait(1000);
  await ev(() => { const { parking, car, G } = window.__tc; let best = null; parking.forBaysNear(G.cfg.work.x, G.cfg.work.z, 440, (b, d2) => { if (!b.occupied && !b.reserved && b.type === 'road' && (!best || d2 < best.d2)) best = { b, d2 }; }); car.place(best.b.x, best.b.z, best.b.psi, best.b.y); car.v = 0; });
  await wait(800); await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(500);
  await ev(() => { const { P, G } = window.__tc; P.x = G.cfg.work.x + 1; P.z = G.cfg.work.z; });
  await page.waitForFunction(() => window.__tc.G.state === 'walk' && window.__tc.G.leg === 'pm', null, { timeout: 90000 }); await wait(1200);
  await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(800);
  await ev(() => { const { car, G } = window.__tc; car.place(G.garage.x, G.garage.z, G.garage.psi, G.garage.y); car.v = 0; });
  await page.waitForFunction(() => { const { parking, car } = window.__tc; return parking.readyAround(car.x, car.z, 200); }, null, { timeout: 200000 }); await wait(1500);
};

// ---- 商店：兩種都有、價錢
await startWith([]);
console.log('shop:', JSON.stringify(await ev(() => { const { econ } = window.__tc; return { curb: econ.price('curbspot'), under: econ.price('garage') }; })));
// ---- 路邊住戶專用車位
await startWith(['curbspot']);
console.log('[curb] morning:', JSON.stringify(await info()));
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(1000);
console.log('[curb] outside:', JSON.stringify(await info()));
await shot('garage2_curb');
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(800);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(400);
await toWorkAndBack();
console.log('[curb] evening at spot:', JSON.stringify(await info()));
await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(500);
console.log('[curb] parked:', JSON.stringify(await info()));
await ev(() => { const { P, G } = window.__tc; P.x = G.cfg.home.x + 1; P.z = G.cfg.home.z; });
await page.waitForFunction(() => window.__tc.G.state === 'summary', null, { timeout: 60000 });
console.log('[curb] summary:', await ev(() => document.getElementById('sumStats').innerText.replace(/\n/g, ' ')));
// ---- 地下停車位：地下室
await startWith(['garage']);
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'basement', null, { timeout: 60000 }); await wait(1200);
console.log('[under] morning basement:', JSON.stringify(await info()));
await shot('garage2_basement_am');
await ev(() => { const { P } = window.__tc; P.x = -1.6; P.z = 1.6; }); await wait(600);
console.log('[under] near car:', JSON.stringify(await info()));
await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(400);
console.log('[under] drove out:', JSON.stringify(await info()), 'car in world scene', await ev(() => window.__tc.car.group.parent === window.__tc.scene));
await shot('garage2_driveout');
await toWorkAndBack();
console.log('[under] evening at entrance:', JSON.stringify(await info()));
await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__tc.G.state === 'basement', null, { timeout: 60000 }); await wait(1200);
console.log('[under] evening basement:', JSON.stringify(await info()));
await shot('garage2_basement_pm');
await ev(() => { const { P } = window.__tc; P.x = -4; P.z = -3.3; }); await wait(600);
console.log('[under] at lift:', JSON.stringify(await info()));
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'summary', null, { timeout: 60000 });
console.log('[under] summary:', await ev(() => document.getElementById('sumStats').innerText.replace(/\n/g, ' ')), '| car back in world', await ev(() => window.__tc.car.group.parent === window.__tc.scene));
console.log(errs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
