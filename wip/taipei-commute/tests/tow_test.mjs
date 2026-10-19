// 違規停車拖吊：TOW=1 一定被拖（上班時被拖 → 下班搭計程車去保管場；晚上停路邊過夜被拖 → 隔天早上去保管場）
// TOW=0 一定不被拖（路邊停著，下班車還在；隔天早上車還在昨晚停的地方）。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const FORCE = process.env.TOW !== '0';
const boot = async () => { await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq'); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 200000 }); };
await boot();
await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0];
  const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: [], carKey: 'gas' } })); });
await boot();
await ev((f) => { window.__tc.noRender = true; window.__tc.towForce = f; }, FORCE); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
const toCar = async () => { await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(800); await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(400); };
// 停在路邊（不是停車格）：離目標 40～150 m 的路上
const streetPark = (near) => ev((near) => { const { world, car, parking, G } = window.__tc, c = near === 'home' ? G.cfg.home : G.cfg.work, o = {}, err = {};
  for (let r = 40; r < 200; r += 15) for (let a = 0; a < 6.28; a += 0.5) { const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; const e = world.nearestEdge(x, z, 30, ed => ed.cls >= 3 && ed.cls <= 6 && !ed.bridge && !ed.tunnel, o); if (!e) continue;
    if (parking.bayAt(o.x, o.z, 0, err)) continue; car.place(o.x, o.z, Math.atan2(-o.dx || 0, -o.dz || -1), world.groundAt(o.x, o.z)); car.v = 0; return { d: Math.round(Math.hypot(o.x - c.x, o.z - c.z)), road: e.name }; }
  return null; }, near);
const ready = () => page.waitForFunction(() => { const { parking, car, world } = window.__tc; return world.readyAround(car.x, car.z, 250) && parking.readyAround(car.x, car.z, 200); }, null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await toCar();
// 公司附近：110 m 內還有沒有空格（之前早上全滿）
await ev(() => { const { car, G } = window.__tc; car.place(G.cfg.work.x, G.cfg.work.z, 0, 0); car.v = 0; }); await ready(); await wait(2500);
console.log('free road bays within 110 m of work:', await ev(() => { const { parking, G } = window.__tc; let n = 0, f = 0; parking.forBaysNear(G.cfg.work.x, G.cfg.work.z, 110, (b) => { if (b.type === 'road') { n++; if (!b.occupied && !b.reserved) f++; } }); return f + '/' + n; }));
console.log('street spot near work:', JSON.stringify(await streetPark('work'))); await wait(1500);
console.log('prompt (stopped on street):', await ev(() => document.getElementById('prompt').innerText));
await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(700);
console.log('after E:', JSON.stringify(await ev(() => { const p = window.__tc.G.parked; return { legal: p.legal, illegal: p.illegal, type: p.type, toast: document.getElementById('toast').textContent }; })));
await ev(() => { const { P, G } = window.__tc; P.x = G.cfg.work.x + 1; P.z = G.cfg.work.z; });
await page.waitForFunction(() => window.__tc.G.state === 'work', null, { timeout: 90000 }); await wait(3600);
console.log('18:00 card:', await ev(() => !document.getElementById('workCard').hidden && document.getElementById('workText').textContent));
await page.waitForFunction(() => window.__tc.G.state === 'walk' && window.__tc.G.leg === 'pm', null, { timeout: 200000 }); await wait(1500);
console.log('pm start:', JSON.stringify(await ev(() => { const { G, car, P, econ } = window.__tc; return { clock: Math.round(G.clock), phase: G.phase, carToWork: Math.round(Math.hypot(car.x - G.cfg.work.x, car.z - G.cfg.work.z)), meToCar: Math.round(Math.hypot(car.x - P.x, car.z - P.z) * 10) / 10, tow: econ.day.tow, toast: document.getElementById('toast').textContent, task: document.getElementById('taskText').textContent }; })));
await ev(() => { window.__tc.noRender = false; }); await wait(3000); await page.screenshot({ path: `shots/tow_${FORCE ? 1 : 0}_pm.png` }); await ev(() => { window.__tc.noRender = true; });
await toCar();
// 回家：停在家附近路邊（過夜）
await ev(() => { const { car, G } = window.__tc; car.place(G.cfg.home.x, G.cfg.home.z, 0, 0); car.v = 0; }); await ready(); await wait(2000);
const hs = await streetPark('home'); console.log('street spot near home:', JSON.stringify(hs)); await wait(1200);
const nightSpot = await ev(() => ({ x: window.__tc.car.x, z: window.__tc.car.z }));
await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(600);
await ev(() => { const { P, G } = window.__tc; P.x = G.cfg.home.x + 1; P.z = G.cfg.home.z; });
await page.waitForFunction(() => window.__tc.G.state === 'summary', null, { timeout: 60000 });
console.log('summary:', await ev(() => document.getElementById('sumStats').innerText.replace(/\n/g, ' ')));
console.log('saved towNext:', await ev(() => JSON.stringify(JSON.parse(localStorage.getItem('taipei-commute-v2')).towNext)));
// 隔天早上（重新開遊戲、按繼續：確定存檔也對）
await boot(); await ev((f) => { window.__tc.noRender = true; window.__tc.towForce = f; }, FORCE); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
console.log('next morning car→last night spot m', await ev((s) => Math.round(Math.hypot(window.__tc.car.x - s.x, window.__tc.car.z - s.z)), nightSpot), '| G.tow', await ev(() => window.__tc.G.tow && window.__tc.G.tow.yard.n));
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 200000 }); await wait(1500);
console.log('morning walk:', JSON.stringify(await ev(() => { const { G, car, P, econ } = window.__tc; return { clock: Math.round(G.clock), meToCar: Math.round(Math.hypot(car.x - P.x, car.z - P.z) * 10) / 10, carToHome: Math.round(Math.hypot(car.x - G.cfg.home.x, car.z - G.cfg.home.z)), tow: econ.day.tow, toast: document.getElementById('toast').textContent }; })));
await ev(() => { window.__tc.noRender = false; }); await wait(3000); await page.screenshot({ path: `shots/tow_${FORCE ? 1 : 0}_am.png` });
console.log(errs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
