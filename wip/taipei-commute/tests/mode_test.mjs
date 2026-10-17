// 新玩法實測：node tests/mode_test.mjs alldrone|allfly [fly]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const MODE = process.argv[2] || 'alldrone', ACT = process.argv[3] || '';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts/.test(m.text())) errs.push('console ' + m.text()); });
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 200 }).then(() => true).catch(() => false);
page.setDefaultTimeout(300000);
const URL = 'http://localhost:8768/index.html#lowq,mode=' + MODE;
await page.goto(URL);
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
await ev((mode) => { const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.clear(); localStorage.setItem('taipei-commute-v2-' + mode, JSON.stringify({ v: 2, cfg: { di, home, work }, day: 3, econ: { money: 1000000 } })); }, MODE);
await page.goto('about:blank'); await page.goto(URL);
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
console.log('menu mode', await ev(() => window.__tc.G.mode), await ev(() => document.getElementById('btnContinue').textContent));
await page.screenshot({ path: 'shots/mode_menu.png' });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
console.log('econ', await ev(() => ({ owned: [...window.__tc.econ.owned], car: window.__tc.econ.carKey, cars: window.__tc.econ.cars(), factor: window.__tc.traffic.factor, flyerRate: window.__tc.traffic.flyerRate, dense: !!window.__tc.drones.dense })));
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await page.keyboard.press('Enter'); await until(() => !window.__tc.G.seatAdj, null, 30000); await wait(3000);
const info = await ev(() => { const d = window.__tc.drones, t = window.__tc.traffic; return { n: d.list.length, target: d.target, roadCars: d.roadCars, phases: d.list.reduce((o, x) => (o[x.phase] = (o[x.phase] || 0) + 1, o), {}), cars: t.cars.length, flyers: t.cars.filter(c => c.flyer).length }; });
console.log('world', info);
// 每幀成本
const cost = await ev(() => { window.__tc.manual = true; const t = performance.now(); window.__tc.advance(1 / 30, 30); const ms = (performance.now() - t) / 30; window.__tc.manual = false; return ms; });
console.log('ms per frame (logic + 1 render)', cost.toFixed(1));
await ev(() => { window.__tc.noRender = false; }); await wait(2500); await page.screenshot({ path: `shots/mode_${MODE}_drive.png` });
if (MODE === 'alldrone' && ACT === 'fly') {
  await ev(() => { window.__tc.noRender = true; window.__tc.steps = 4; });
  const c0 = await ev(() => window.__tc.G.clock);
  await page.keyboard.press('KeyU');
  console.log('started', await until(() => window.__tc.flight.active, null, 10000), await ev(() => ({ layer: window.__tc.flight.layer, toast: document.getElementById('toast').textContent })));
  let last = '';
  for (let i = 0; i < 400; i++) {
    const s = await ev(() => { const f = window.__tc.flight, g = window.__tc.world.groundAt(f.x, f.z, 0); return { a: f.active, ph: f.phase, h: Math.round(f.y - g), v: Math.round(Math.hypot(f.vx, f.vz)), held: f.held, lw: +(f.liftWait || 0).toFixed(1), cw: +(f.crossWait || 0).toFixed(1), jam: +(f.jamSec || 0).toFixed(1), left: Math.round(Math.hypot(f.spot.x - f.x, f.spot.z - f.z)), alert: f.r ? f.r.alert : -1 }; });
    const k = s.ph + (s.held ? '-held' : '');
    if (k !== last || i % 15 === 0) { console.log(i, JSON.stringify(s)); last = k; }
    if (i === 6 || (s.ph === 'cruise' && i % 60 === 30)) { await ev(() => { window.__tc.noRender = false; }); await wait(2000); await page.screenshot({ path: `shots/mode_fly_${i}.png` }); await ev(() => { window.__tc.noRender = true; }); }
    if (!s.a) break;
    await wait(1000);
  }
  console.log('result', await ev((c0) => { const { G, flight, econ, car } = window.__tc; return { gameMin: +(G.clock - c0).toFixed(1), flyMin: +(flight.flySec * 0.1).toFixed(1), liftWaitMin: +(flight.liftWait * 0.1).toFixed(1), crossWaitMin: +(flight.crossWait * 0.1).toFixed(1), groundWaitMin: +(flight.waitSec * 0.1).toFixed(1), jamMin: +(flight.jamSec * 0.1).toFixed(1), cost: Math.round(econ.day.drone), leftM: Math.round(Math.hypot(car.x - G.cfg.work.x, car.z - G.cfg.work.z)) }; }, c0));
}
if (MODE === 'allfly') {
  await ev(() => { window.__tc.noRender = true; window.__tc.steps = 4; });
  for (let i = 0; i < 6; i++) { await wait(10000); console.log('t', i, await ev(() => { const t = window.__tc.traffic; return { cars: t.cars.length, flyers: t.cars.filter(c => c.flyer).length, inAir: t.cars.filter(c => c.hop).length, hops: t.hops || 0, crashes: t.crashes, wrecks: t.cars.filter(c => c.wreck > 0).length }; })); }
  await ev(() => { window.__tc.noRender = false; }); await wait(2500); await page.screenshot({ path: `shots/mode_allfly_2.png` });
}
console.log(errs.slice(0, 8).join('\n') || 'no page errors');
await browser.close();
