// 無人機飛行系統實測：升空、選高度層、DAIDALUS 式避撞（迎面來一架）、繞開超高大樓、到了下方有車要等、降落、燃料費。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | '))); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts/.test(m.text())) errs.push('console ' + m.text()); });
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true).catch(() => false);
const shot = async (name, ms = 2500) => { await ev(() => { window.__tc.noRender = false; }); await wait(ms); await page.screenshot({ path: `shots/dr_${name}.png` }); await ev(() => { window.__tc.noRender = true; }); };
const simT = () => ev(() => window.__tc.G.clock * 10);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 120000 });
console.log('city drones', await ev(() => window.__tc.drones.count));
await ev(() => {
  const m = window.__tc.meta, di = 6, home = m.homes[di][0];
  const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 5, econ: { money: 20000, owned: ['nav', 'roadster', 'drone'], carKey: 'roadster', stuntFuel: 1 } }));
});
await page.reload();
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 120000 });
await ev(() => { window.__tc.noRender = true; });
await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1200);
await page.keyboard.press('Enter'); await wait(500);
await until(() => !window.__tc.G.seatAdj, null, 30000); await wait(800);
await ev(() => { window.__tc.steps = 4; });
const dist0 = await ev(() => { const { car, G } = window.__tc; return Math.hypot(car.x - G.cfg.work.x, car.z - G.cfg.work.z); });
console.log('straight distance to work', Math.round(dist0), 'route km', await ev(() => window.__tc.G.route && +(window.__tc.G.route.len / 1000).toFixed(1)));
// 監看：每 0.3 秒記錄跟其他無人機的最近距離
await ev(() => {
  window.__mon = { minSep: 1e9, minSepV: 0, alerts: [0, 0, 0, 0], tracks: [], phases: [] };
  setInterval(() => {
    const { flight, drones } = window.__tc; if (!flight || !flight.active) return;
    const m = window.__mon; if (m.phases[m.phases.length - 1] !== flight.phase) m.phases.push(flight.phase);
    for (const d of drones.list) { if (d.phase === 'ground') continue; const h = Math.hypot(d.x - flight.x, d.z - flight.z), v = Math.abs(d.y - flight.y); if (v < 18 && h < m.minSep) { m.minSep = h; m.minSepV = v; } }
    if (flight.r) m.alerts[flight.r.alert]++;
  }, 300);
});
const t0 = await simT(), clk0 = await ev(() => window.__tc.G.clock);
await page.keyboard.press('KeyU');
if (!(await until(() => window.__tc.flight.active, null, 10000))) {
  console.log('did not start; toast =', await ev(() => document.getElementById('toast').textContent), await ev(() => ({ v: window.__tc.car.v, seat: window.__tc.G.seatAdj, st: window.__tc.G.state })));
  console.log(errs.slice(0, 6).join('\n')); await browser.close(); process.exit(1);
}
console.log('started', await ev(() => { const f = window.__tc.flight; return { layer: f.layer, counts: f.layerCounts, provisional: !!f.spot.provisional }; }));
await until(() => window.__tc.car.y - window.__tc.world.groundAt(window.__tc.car.x, window.__tc.car.z) > 40, null, 60000);
await shot('lift', 2200);
await until(() => window.__tc.flight.phase === 'cruise', null, 120000);
// 迎面放一架無人機（同一高度層、正對著飛過來）：等巡航速度穩定、航向對準目的地後再放
await until(() => { const f = window.__tc.flight; return Math.hypot(f.vx, f.vz) > 45; }, null, 120000);
const tr0 = await ev(() => Math.atan2(window.__tc.flight.vx, window.__tc.flight.vz));
const intr = await ev(() => {
  const { flight, drones } = window.__tc, h = Math.atan2(flight.vx, flight.vz);
  const d = { x: flight.x + Math.sin(h) * 1400, y: flight.y, z: flight.z + Math.cos(h) * 1400, vx: 0, vy: 0, vz: 0, tx: flight.x - Math.sin(h) * 3000, tz: flight.z - Math.cos(h) * 3000, layer: flight.layer, phase: 'cruise', g: 0, track: h + Math.PI, wait: 0, color: drones.cols[0], spin: 0, test: true };
  d.g = flight.y - flight.layer; drones.list.push(d); window.__intr = d;
  return { from: Math.round(Math.hypot(d.x - flight.x, d.z - flight.z)) };
});
console.log('intruder placed head-on at', intr);
let minHead = 1e9, devMax = 0, maxAlert = 0;
for (let i = 0; i < 160; i++) {
  const s = await ev((tr0) => { const f = window.__tc.flight, d = window.__intr; const tr = Math.atan2(f.vx, f.vz); let dv = tr - tr0; dv = Math.atan2(Math.sin(dv), Math.cos(dv)); return { sep: Math.hypot(d.x - f.x, d.z - f.z), dz: Math.abs(d.y - f.y), dev: Math.abs(dv) * 180 / Math.PI, alert: f.r ? f.r.alert : -1, ph: f.phase }; }, tr0);
  maxAlert = Math.max(maxAlert, s.alert);
  minHead = Math.min(minHead, s.sep); devMax = Math.max(devMax, s.dev);
  if (i === 14) await shot('daa', 2000);
  if (s.sep > 900 && i > 40) break;
  await wait(150);
}
console.log('head-on encounter:', { minHorizontalSep: Math.round(minHead), maxDeviationDeg: Math.round(devMax), maxAlert, wellClear: 70 });
if (process.argv[2] === 'headon') { await browser.close(); process.exit(0); }
// 到降落點上方：放一台車在降落點，看會不會等
await until(() => ['hover', 'descend'].includes(window.__tc.flight.phase), null, 240000);
await ev(() => {
  const { flight, traffic, world } = window.__tc, sp = flight.spot, o = {}; const e = world.nearestEdge(sp.x, sp.z, 10, null, o);
  const col = window.__tc.scene.children.find(o => o.isHemisphereLight).color.clone().setRGB(0.9, 0.9, 0.9);
  const c = { e, dir: 1, lane: 0, s: o.s, v: 0, fac: 1, x: sp.x, y: world.groundAt(sp.x, sp.z), z: sp.z, psi: 0, turn: null, next: null, wait: 0, color: col, scale: 1, flyer: false, hop: null, hopCd: 99, wreck: 999, pitch: 0 };
  e.cars.push(c); traffic.cars.push(c); window.__blocker = c;
});
const w0 = await ev(() => window.__tc.flight.waitSec);
await wait(6000);
const hv = await ev(() => ({ phase: window.__tc.flight.phase, blocked: window.__tc.flight.blocked, waitSec: +window.__tc.flight.waitSec.toFixed(1), task: document.getElementById('taskText').textContent }));
console.log('with car under landing spot:', hv);
await shot('hover', 2200);
await ev(() => { const { traffic } = window.__tc, c = window.__blocker; c.wreck = 0; const i = traffic.cars.indexOf(c); if (i >= 0) traffic.cars.splice(i, 1); const j = c.e.cars.indexOf(c); if (j >= 0) c.e.cars.splice(j, 1); });
const landed = await until(() => !window.__tc.flight.active, null, 120000);
const t1 = await simT(), clk1 = await ev(() => window.__tc.G.clock);
const res = await ev(() => { const { car, G, flight, econ } = window.__tc; return { distToWork: Math.round(Math.hypot(car.x - G.cfg.work.x, car.z - G.cfg.work.z)), y: +car.y.toFixed(1), droneCost: Math.round(econ.day.drone), waitGameMin: +(flight.waitSec * 0.1).toFixed(1) }; });
console.log('spot', await ev(() => { const f = window.__tc.flight, w = window.__tc.G.cfg.work; return { toDest: Math.round(Math.hypot(f.spot.x - w.x, f.spot.z - w.z)), provisional: !!f.spot.provisional }; }));
console.log('landed', landed, res, 'flight game minutes', +(clk1 - clk0).toFixed(1), 'sim s', +(t1 - t0).toFixed(1));
console.log('monitor', await ev(() => window.__mon));
await shot('landed', 2200);
// 繞開台北 101：直接測避撞範圍函式
console.log('101 avoidance', await ev(() => {
  const { flight } = window.__tc; const b = window.__tc.drones.statics.find(s => s.top > 400);
  if (!b) return 'no 101';
  return { name: b.name, top: Math.round(b.top), r: Math.round(b.r) };
}));
console.log(errs.slice(0, 10).join('\n') || 'no page errors');
await browser.close();
