// 早上到公司附近：車格的分佈（路邊空格／被占、停車場、電動車格），還有停進停車場格子時會說什麼。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const WI = +(process.env.WI || 0);
const boot = async () => { await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq'); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 200000 }); };
await boot();
await ev((WI) => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0];
  const ws = m.works.filter(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; }); const work = ws[WI % ws.length];
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 300000, owned: [], carKey: 'gas' } })); }, WI);
await boot();
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(500);
await ev(() => { const { car, G } = window.__tc; car.place(G.cfg.work.x, G.cfg.work.z, 0, 0); car.v = 0; });
await page.waitForFunction(() => { const { parking, car } = window.__tc; return parking.readyAround ? parking.readyAround(car.x, car.z, 300) : window.__tc.world.readyAround(car.x, car.z, 300); }, null, { timeout: 200000 });
await wait(4000);
const stats = await ev(() => {
  const { parking, G } = window.__tc, w = G.cfg.work, out = {};
  parking.forBaysNear(w.x, w.z, 450, (b, d2) => { const d = Math.sqrt(d2), band = d < 110 ? '0-110' : d < 260 ? '110-260' : '260-450'; const k = b.type + ' ' + band; const o = out[k] || (out[k] = { n: 0, free: 0 }); o.n++; if (!b.occupied && !b.reserved) o.free++; });
  return { leg: G.leg, work: w.n, stats: out };
});
console.log('bays near work (morning):', JSON.stringify(stats));
// 停進最近的停車場格子會說什麼
const lot = await ev(() => { const { parking, car, G } = window.__tc; let best = null; parking.forBaysNear(G.cfg.work.x, G.cfg.work.z, 450, (b, d2) => { if (b.type === 'lot' && !b.occupied && (!best || d2 < best.d2)) best = { b, d2 }; });
  if (!best) return null; const b = best.b; car.place(b.x, b.z, b.psi, b.y); car.v = 0; return Math.round(Math.sqrt(best.d2)); });
await wait(1500);
console.log('lot bay at', lot, 'm → prompt:', await ev(() => document.getElementById('prompt').innerText));
// 停進最近的空路邊格
const road = await ev(() => { const { parking, car, G } = window.__tc; let best = null; parking.forBaysNear(G.cfg.work.x, G.cfg.work.z, 450, (b, d2) => { if (b.type === 'road' && !b.occupied && !b.reserved && (!best || d2 < best.d2)) best = { b, d2 }; });
  if (!best) return null; const b = best.b; car.place(b.x, b.z, b.psi, b.y); car.v = 0; return Math.round(Math.sqrt(best.d2)); });
await wait(1500);
console.log('nearest free road bay at', road, 'm → prompt:', await ev(() => document.getElementById('prompt').innerText));

// 實際開進停車場：從最近的路開過去（每 100 ms 朝車格中心打方向盤）
const drives = [];
const lotsNear = await ev(() => { const { parking, G } = window.__tc, w = G.cfg.work, seen = new Map();
  parking.forBaysNear(w.x, w.z, 450, (b, d2) => { if (b.type !== 'lot' || b.occupied) return; const k = b.lot.id; if (!seen.has(k) || seen.get(k).d2 > d2) seen.set(k, { x: b.x, z: b.z, psi: b.psi, y: b.y, d2, id: b.id }); });
  return [...seen.values()].sort((a, b) => a.d2 - b.d2).slice(0, 4); });
for (const tgt of lotsNear) {
  const start = await ev((t) => { const { world, car } = window.__tc, o = {}; const e = world.nearestEdge(t.x, t.z, 120, ed => ed.cls <= 7 && !ed.bridge && !ed.tunnel, o); if (!e) return null;
    const psi = Math.atan2(-(t.x - o.x), -(t.z - o.z)); car.place(o.x, o.z, psi, world.groundAt(o.x, o.z)); car.v = 0;
    let blocked = 0; const n = Math.ceil(Math.hypot(t.x - o.x, t.z - o.z) / 2); for (let i = 1; i < n; i++) { const p = { x: o.x + (t.x - o.x) * i / n, z: o.z + (t.z - o.z) * i / n }; if (window.__tc.world.collide(p, 1.0)) blocked++; }
    return { road: e.name || '(無名)', cls: e.cls, gap: Math.round(Math.hypot(t.x - o.x, t.z - o.z)), blockedSamples: blocked, of: n - 1 }; }, tgt);
  if (!start) { drives.push({ id: tgt.id, start: null }); continue; }
  await wait(600);
  const res = await ev(async (t) => { const { car, input } = window.__tc; const b0 = car.bumps; let best = 1e9, t0 = performance.now();
    while (performance.now() - t0 < 40000) { await new Promise(r => setTimeout(r, 100));
      const d = Math.hypot(t.x - car.x, t.z - car.z); best = Math.min(best, d);
      for (const c of ['KeyW', 'KeyA', 'KeyD', 'KeyS']) input.keys.delete(c);
      if (d < 1.2) { input.keys.add('KeyS'); if (Math.abs(car.v) < 0.2) break; continue; }
      const heading = Math.atan2(car.fwdX, -car.fwdZ); let e = Math.atan2(t.x - car.x, -(t.z - car.z)) - heading; e = Math.atan2(Math.sin(e), Math.cos(e));
      if (car.v < 2.5) input.keys.add('KeyW'); if (e > 0.06) input.keys.add('KeyD'); else if (e < -0.06) input.keys.add('KeyA'); }
    for (const c of ['KeyW', 'KeyA', 'KeyD', 'KeyS']) input.keys.delete(c);
    return { closest: +best.toFixed(1), final: +Math.hypot(t.x - car.x, t.z - car.z).toFixed(1), bumps: car.bumps - b0, secs: Math.round((performance.now() - t0) / 1000), prompt: document.getElementById('prompt').innerText }; }, tgt);
  drives.push({ fromWork: Math.round(Math.sqrt(tgt.d2)), ...start, ...res });
}
console.log('drive into lots:', JSON.stringify(drives, null, 0));
console.log(errs.slice(0, 4).join('\n') || 'no page errors');
await browser.close();
