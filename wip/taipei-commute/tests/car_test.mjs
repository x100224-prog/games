// 碰撞修車費、飛天跑車的隱藏厭惡值（煙霧罩到別的車）→ 被檢舉停用一天、空氣罐不再回家補滿。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const boot = async () => { await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq'); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 }); };
await boot();
await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0];
  const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 5000000, owned: ['roadster', 'nav'], carKey: 'roadster', stuntFuel: 0.5 } })); });
await boot();
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(800);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(800);
// ---- 碰撞修車費
const rep = () => ev(() => ({ repair: window.__tc.econ.day.repair || 0, toast: document.getElementById('toast').textContent }));
await ev(() => { window.__tc.car._bump(1); }); await wait(300); console.log('bump strength 1:', JSON.stringify(await rep()));
await wait(1400); await ev(() => { window.__tc.car._bump(0.5); }); await wait(300); console.log('bump strength 0.5:', JSON.stringify(await rep()));
await wait(1400); await ev(() => { window.__tc.stunts._crash(50000, '測試翻車'); }); await wait(300); console.log('stunt crash 50000 (no extra bump fee):', JSON.stringify(await rep()));
// ---- 厭惡值：停在一台車後面 7 m，原地垂直升空（F）
const setup = await ev(async () => {
  const { traffic, car, world } = window.__tc;
  for (let k = 0; k < 40 && traffic.cars.filter(c => !c.hop).length < 4; k++) await new Promise(r => setTimeout(r, 250));
  const c = traffic.cars.find(c => !c.hop && Math.hypot(c.x - car.x, c.z - car.z) < 250) || traffic.cars[0]; if (!c) return null;
  const fx = -Math.sin(c.psi), fz = -Math.cos(c.psi); car.place(c.x - fx * 7, c.z - fz * 7, c.psi, world.groundAt(c.x - fx * 7, c.z - fz * 7)); car.v = 0;
  return { cars: traffic.cars.length, target: [Math.round(c.x), Math.round(c.z)] };
});
console.log('jump setup:', JSON.stringify(setup)); await wait(600);
const annoy = () => ev(() => ({ annoy: window.__tc.G.annoy || 0, banned: !!window.__tc.G.banUntil, mode: window.__tc.stunts.mode, fuel: +window.__tc.econ.stuntFuel.toFixed(3) }));
for (let j = 0; j < 3; j++) {
  await ev(() => { window.__tc.car.v = 0; }); await page.keyboard.press('KeyF'); await wait(300);
  console.log(`jump ${j + 1} takeoff:`, JSON.stringify(await annoy()));
  await page.waitForFunction(() => window.__tc.stunts.mode === 'ground', null, { timeout: 60000 }); await wait(1500);
  console.log(`jump ${j + 1} landed:`, JSON.stringify(await annoy()));
  // 回到原位、再找一台車
  await ev(() => { const { traffic, car, world } = window.__tc; const c = traffic.cars.filter(c => !c.hop).sort((a, b) => Math.hypot(a.x - car.x, a.z - car.z) - Math.hypot(b.x - car.x, b.z - car.z))[0]; if (!c) return;
    const fx = -Math.sin(c.psi), fz = -Math.cos(c.psi); car.place(c.x - fx * 7, c.z - fz * 7, c.psi, world.groundAt(c.x - fx * 7, c.z - fz * 7)); car.v = 0; }); await wait(500);
}
// 快到上限：再飛一次 → 被檢舉
const stableGround = () => page.waitForFunction(() => { const s = window.__tc.stunts; if (s.mode !== 'ground') { s._gt = 0; return false; } s._gt = (s._gt || 0) + 1; return s._gt > 20; }, null, { timeout: 60000, polling: 100 });
await ev(() => { window.__tc.G.annoy = 39; window.__tc.econ.stuntFuel = 0.6; window.__tc.car.v = 0; }); await page.keyboard.press('KeyF'); await wait(500);
await stableGround();
console.log('after limit:', JSON.stringify(await annoy()), 'skillBanned', await ev(() => window.__tc.skillBanned()), '| toast:', await ev(() => document.getElementById('toast').textContent));
await wait(4200); await ev(() => { window.__tc.car.v = 0; }); await page.keyboard.press('KeyF'); await wait(800);
console.log('press F while banned:', JSON.stringify(await annoy()), '| toast:', await ev(() => document.getElementById('toast').textContent), '| HUD:', await ev(() => document.getElementById('stuntMode').textContent + ' / ' + document.getElementById('stuntFill').textContent));
console.log('ban until:', await ev(() => { const G = window.__tc.G; return { banUntil: Math.round(G.banUntil), now: G.dayN * 1440 + Math.round(G.clock) }; }));
await ev(() => { window.__tc.G.clock += 24 * 60 + 1; }); await wait(300);
console.log('24 h later skillBanned', await ev(() => window.__tc.skillBanned()));
await ev(() => { window.__tc.car.v = 0; }); await page.keyboard.press('KeyF'); await wait(500);
console.log('24 h later F:', JSON.stringify(await annoy()));
await stableGround(); await ev(() => { window.__tc.G.clock -= 24 * 60 + 1; });
// ---- 空氣罐：回家不再補滿、結算沒有補氣的錢
await ev(() => { window.__tc.econ.stuntFuel = 0.4; });
await ev(() => { const { car, G } = window.__tc; car.place(G.cfg.work.x, G.cfg.work.z, 0, 0); car.v = 0; });
await page.waitForFunction(() => { const { parking, car } = window.__tc; return parking.readyAround(car.x, car.z, 200); }, null, { timeout: 200000 }); await wait(1200);
const parkNear = (k) => ev((k) => { const { parking, car, G } = window.__tc, c = G.cfg[k]; let best = null; parking.forBaysNear(c.x, c.z, 440, (b, d2) => { if (!b.occupied && !b.reserved && b.type === 'road' && (!best || d2 < best.d2)) best = { b, d2 }; }); if (best) car.place(best.b.x, best.b.z, best.b.psi, best.b.y); car.v = 0; }, k);
await parkNear('work'); await wait(800); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(500);
await ev(() => { const { P, G } = window.__tc; P.x = G.cfg.work.x + 1; P.z = G.cfg.work.z; });
await page.waitForFunction(() => window.__tc.G.state === 'walk' && window.__tc.G.leg === 'pm', null, { timeout: 90000 }); await wait(1200);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { car, G } = window.__tc; car.place(G.cfg.home.x, G.cfg.home.z, 0, 0); car.v = 0; });
await page.waitForFunction(() => { const { parking, car } = window.__tc; return parking.readyAround(car.x, car.z, 200); }, null, { timeout: 200000 }); await wait(1200);
await parkNear('home'); await wait(800); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(500);
await ev(() => { const { P, G } = window.__tc; P.x = G.cfg.home.x + 1; P.z = G.cfg.home.z; });
await page.waitForFunction(() => window.__tc.G.state === 'summary', null, { timeout: 60000 });
console.log('summary:', await ev(() => document.getElementById('sumStats').innerText.replace(/\n/g, ' ')));
console.log('air after day:', await ev(() => +window.__tc.econ.stuntFuel.toFixed(3)), '| saved ban/annoy:', await ev(() => { const s = JSON.parse(localStorage.getItem('taipei-commute-v2')); return JSON.stringify({ annoy: s.annoy, banUntil: s.banUntil }); }));
console.log(errs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
