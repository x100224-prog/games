// 尖峰時段實測：同一組「住家→公司」，分別用 油車（有導航）、飛天跑車（塞住時飛越）、無人機飛行，量到達公司附近（160 m 內）花的遊戲時間。
// 用法：node tests/measure.mjs <組數> <模式,模式> [起始組]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const NP = +(process.argv[2] || 1), MODES = (process.argv[3] || 'gas,roadster,drone').split(','), START = +(process.argv[4] || 0);
const OUT = 'build/measure.json';
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 900, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true).catch(() => false);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 120000 });
// 選測試用的住家→公司（各行政區輪流，直線 2.5～4.5 km）
const pairs = await ev((n) => {
  const m = window.__tc.meta, out = [];
  let seed = 12345; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; out.length < n && k < 400; k++) {
    const di = k % m.districts.length, hs = m.homes[di]; if (!hs || !hs.length) continue;
    const home = hs[Math.floor(rnd() * hs.length)];
    const ws = m.works.filter(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 2500 && d < 4500; });
    if (!ws.length) continue;
    out.push({ di, home, work: ws[Math.floor(rnd() * ws.length)] });
  }
  return out;
}, START + NP);
for (let pi = START; pi < START + NP; pi++) {
  const pr = pairs[pi];
  for (const mode of MODES) {
    if (results.find(r => r.pair === pi && r.mode === mode && r.ok)) continue;
    const t0 = Date.now();
    await ev(([pr, mode]) => {
      localStorage.clear();
      localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: pr, day: 2, econ: { money: 50000, owned: ['nav', 'ev', 'roadster', 'drone'], carKey: mode === 'roadster' ? 'roadster' : 'gas', stuntFuel: 1 } }));
    }, [pr, mode]);
    await page.reload();
    await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 120000 });
    await ev(() => { window.__tc.noRender = true; });
    await page.click('#btnContinue');
    await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
    await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
    await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
    await wait(600); await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
    await page.keyboard.press('Enter');
    await until(() => !window.__tc.G.seatAdj, null, 30000); await wait(1500);
    // 起點：住家附近的主要道路（避免巷弄裡跟路邊停車、對向來車卡住，量的是尖峰時段大路上的塞車）
    const st = await ev(() => {
      const { world, car, G, stunts } = window.__tc, h = G.cfg.home, w = G.cfg.work, o = {};
      const e = world.nearestEdge(h.x, h.z, 600, (ed) => ed.cls >= 1 && ed.cls <= 3 && !ed.bridge && !ed.tunnel, o); if (!e) return null;
      const k = Math.max(0, e.cum.findIndex(c => c > o.s) - 1), dx = e.pts[k * 2 + 2] - e.pts[k * 2], dz = e.pts[k * 2 + 3] - e.pts[k * 2 + 1], L = Math.hypot(dx, dz);
      let ux = dx / L, uz = dz / L; if (e.oneway === 0 && ux * (w.x - o.x) + uz * (w.z - o.z) < 0) { ux = -ux; uz = -uz; }
      const off = e.oneway ? 0 : Math.min(1.8, e.width / 4), x = o.x - uz * off, z = o.z + ux * off;
      if (stunts) stunts.reset(); car.place(x, z, Math.atan2(-ux, -uz), world.groundAt(x, z)); car.edge = null;
      return { road: e.name, cls: e.cls, fromHome: Math.round(o.d) };
    });
    await page.waitForFunction(() => window.__tc.world.readyAround(window.__tc.car.x, window.__tc.car.z, 250), null, { timeout: 120000 });
    await wait(1500);
    await ev(() => { const { G } = window.__tc; G.routePoly = null; G.route = null; });
    await page.keyboard.press('KeyR'); await wait(3500);
    const info = await ev(() => { const { G } = window.__tc; return { routeKm: G.route ? +(G.route.len / 1000).toFixed(2) : null, freeFlowMin: G.route ? +(G.route.time / 60 * 6).toFixed(1) : null }; });
    await ev((mode) => { window.__M = { mode, endR: 300 }; window.__tc.steps = 6; window.__A = { t: 0, measure: window.__M }; window.__tc.setAuto(window.__A); }, mode);
    let ok = false;
    if (process.env.DBG) {
      for (let k = 0; k < 14; k++) {
        await wait(10000);
        console.log(JSON.stringify(await ev(() => { const { car, G, traffic, parking } = window.__tc, A = window.__A, M = window.__M; const near = [];
          for (const o of traffic.cars) { const dx = o.x - car.x, dz = o.z - car.z, f = dx * car.fwdX + dz * car.fwdZ, l = dx * car.fwdZ - dz * car.fwdX; if (Math.hypot(dx, dz) < 12) near.push(['T', +f.toFixed(1), +l.toFixed(1), +o.v.toFixed(1)]); }
          for (const b of parking.parked) { const dx = b.x - car.x, dz = b.z - car.z; if (Math.hypot(dx, dz) < 8) near.push(['P', +(dx * car.fwdX + dz * car.fwdZ).toFixed(1), +(dx * car.fwdZ - dz * car.fwdX).toFixed(1)]); }
          return { gm: +(G.clock - (M.t0 || G.clock)).toFixed(1), x: +car.x.toFixed(1), z: +car.z.toFixed(1), v: +car.v.toFixed(2), edge: car.edge && car.edge.name + '/' + car.edge.cls, off: car.offroad, rev: A.rev && +A.rev.toFixed(2), stuck: A.stuckT && +A.stuckT.toFixed(2), wait: A.waitT && +A.waitT.toFixed(1), ri: A.ri, n: A.poly && A.poly.length, near, bumps: car.bumps, say: document.body.lastChild.textContent }; })));
        if (k === 3) { await ev(() => { window.__tc.noRender = false; window.__tc.G.cam = 'chase'; }); await wait(2500); await page.screenshot({ path: 'shots/ms_stuck.png' }); await ev(() => { window.__tc.noRender = true; window.__tc.G.cam = 'cockpit'; }); }
      }
      await browser.close(); process.exit(0);
    }
    for (let k = 0; k < 160 && !ok; k++) {
      ok = await until(() => window.__M.done, null, 15000);
      if (!ok && k % 4 === 3) console.log('  …', JSON.stringify(await ev(() => { const { car, G, flight, stunts } = window.__tc, M = window.__M, w = G.leg === 'am' ? G.cfg.work : G.cfg.home; return { gameMin: M.t0 !== undefined ? +(G.clock - M.t0).toFixed(1) : null, left: Math.round(Math.hypot(car.x - w.x, car.z - w.z)), kmh: Math.round(car.kmh), jumps: M.jumps, fly: flight.active ? flight.phase : '', st: stunts ? stunts.mode : '', say: document.body.lastChild && document.body.lastChild.textContent }; })));
    }
    const r = await ev(() => { const M = window.__M, { econ, traffic } = window.__tc; return { min: M.min && +M.min.toFixed(1), km: M.km && +M.km.toFixed(2), jumps: M.jumps, repair: M.repair, stunt: M.stunt, drone: M.drone, flightMin: M.flightMin && +M.flightMin.toFixed(1), droneMsg: M.droneMsg, cars: traffic.cars.length, now: +(window.__tc.G.clock).toFixed(1) }; });
    const row = { pair: pi, mode, ok, start: st, home: pr.home.a, work: pr.work.n, straightKm: +(Math.hypot(pr.home.x - pr.work.x, pr.home.z - pr.work.z) / 1000).toFixed(2), ...info, ...r, wallMin: +((Date.now() - t0) / 60000).toFixed(1) };
    console.log(JSON.stringify(row));
    results.push(row); fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  }
}
console.log(errs.slice(0, 8).join('\n') || 'no page errors');
await browser.close();
