// 駕駛座畫面截圖：node tests/cockpit_shot.mjs gas|roadster  '[{"name":"a","seat":{...},"wheel":{...}}]'
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const CAR = process.argv[2] || 'gas', VARS = JSON.parse(process.argv[3] || '[{"name":"now"}]');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [VW, VH] = (process.env.VP || '960x540').split('x').map(Number), TOUCH = !!process.env.TOUCH;
const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const URL = 'http://localhost:8768/index.html#lowq';
await page.goto(URL); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
await ev((car) => { localStorage.clear(); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: car === 'gas' ? ['nav'] : car === 'ev' ? ['nav', 'ev'] : ['nav', 'roadster'], carKey: car } })); localStorage.setItem('taipei-commute-tips', '["nav","roadster","ev","drone"]'); }, CAR);
await page.goto('about:blank'); await page.goto(URL); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await ev(() => { window.__tc.noRender = false; }); await wait(3000); await page.screenshot({ path: `shots/cockpit_${CAR}_seatadj_${VW}x${VH}.png` });
await page.keyboard.press('Enter'); await page.waitForFunction(() => !window.__tc.G.seatAdj, null, { timeout: 30000 });
// 移到一條直的大路上（看得到前面）
await ev(() => { const { world, car } = window.__tc; let best = null; world.forEdgesNear(car.x, car.z, 700, (e) => { if (best || e.cls > 3 || e.bridge || e.len < 160) return; const p = e.pts, L = Math.hypot(p[2] - p[0], p[3] - p[1]); if (L < 60) return; const ux = (p[2] - p[0]) / L, uz = (p[3] - p[1]) / L; best = { x: p[0] + ux * 15, z: p[1] + uz * 15, psi: Math.atan2(-ux, -uz) }; }); if (best) car.place(best.x, best.z, best.psi, world.groundAt(best.x, best.z)); });
await wait(4000);
console.log('seat default', JSON.stringify(await ev(() => window.__tc.setSeat({}))), 'wheel', JSON.stringify(await ev(() => { const w = window.__tc.cockpit.wheelPivot; return { p: w.position.toArray(), s: w.scale.x }; })), 'eye', JSON.stringify(await ev(() => window.__tc.cockpit.eyeBase.toArray())));
await ev(() => { window.__tc.noRender = false; document.getElementById('help').hidden = true; });
if (VARS[0].name === 'mapcheck') {
  await page.keyboard.down('KeyW'); await wait(2500);
  const a = await ev(() => ({ x: window.__tc.car.x, z: window.__tc.car.z, kmh: window.__tc.car.kmh, clock: window.__tc.G.clock }));
  await page.keyboard.press('KeyM'); await wait(3000);
  const b = await ev(() => ({ x: window.__tc.car.x, z: window.__tc.car.z, kmh: window.__tc.car.kmh, clock: window.__tc.G.clock, map: !document.getElementById('bigmap').hidden }));
  await page.screenshot({ path: 'shots/map_driving.png' });
  await page.keyboard.up('KeyW'); await page.keyboard.press('KeyM');
  console.log('before map', JSON.stringify(a), 'after 3 s with map open', JSON.stringify(b), 'moved', Math.hypot(b.x - a.x, b.z - a.z).toFixed(1));
  VARS.length = 0;
}
for (const v of VARS) {
  await ev((v) => { const c = window.__tc.cockpit; if (v.seat) window.__tc.setSeat(v.seat); if (v.wheel) { if (v.wheel.p) c.wheelPivot.position.fromArray(v.wheel.p); if (v.wheel.s) c.wheelPivot.scale.setScalar(v.wheel.s); } }, v);
  await wait(2500); await page.screenshot({ path: `shots/cockpit_${CAR}_${v.name}_${VW}x${VH}.png` });
}
console.log(errs.join('\n') || 'no errors'); await browser.close();
