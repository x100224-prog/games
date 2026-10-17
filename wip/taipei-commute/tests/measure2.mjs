// 尖峰時段實測（第二版）：
//   gas、roadster：在車流裡放一台「通勤車」（跟其他車一樣跟車、等紅燈、排隊），照導航路線開；roadster 塞住時會飛越車陣。
//   drone：玩家的車從同一個起點升空，用無人機飛行系統（含避撞、降落等待）飛到目的地附近。
// 量的是遊戲時間（分鐘），到目的地 300 m 內為止。結果寫到 build/measure2.json。
// 用法：node tests/measure2.mjs <組數> <模式,模式> [起始組]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const NP = +(process.argv[2] || 1), MODES = (process.argv[3] || 'gas,roadster,drone').split(','), START = +(process.argv[4] || 0);
const OUT = 'build/measure2.json';
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 900, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true).catch(() => false);
page.setDefaultTimeout(240000);
const boot = async () => { await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq'); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones && window.__tc.nav, null, { timeout: 180000 }); await ev(() => { window.__tc.noRender = true; }); };
await boot();
// 測試用的住家→公司：各行政區輪流，直線 2.5～4.5 km；起點用住家附近的主要道路
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
    await boot();
    let row = { pair: pi, mode, home: pr.home.a, district: await ev((d) => window.__tc.meta.districts[d].name, pr.di), work: pr.work.n, straightKm: +(Math.hypot(pr.home.x - pr.work.x, pr.home.z - pr.work.z) / 1000).toFixed(2) };
    if (mode !== 'drone') {
      // 選單畫面：把地圖載入到起點附近
      await ev((h) => { const { G } = window.__tc; Object.assign(G.menuTarget, { x: h.x, z: h.z, r: 200, h: 120 }); G.menuCenter.x = h.x; G.menuCenter.z = h.z; }, pr.home);
      await until((h) => window.__tc.world.readyAround(h.x, h.z, 500), pr.home, 200000);
      const info = await ev(([pr, mode]) => { const t = window.__tc.traffic; t.factor = 1.8; window.__tc.steps = 6; return window.__tc.startMeasure({ mode, from: pr.home, to: pr.work, warm: 60 }); }, [pr, mode]);
      if (!info) { row.ok = false; row.err = 'no start'; }
      else {
        Object.assign(row, info);
        let ok = false;
        for (let k = 0; k < 200 && !ok; k++) {
          ok = await until(() => window.__tc.G.measure.done, null, 15000);
          if (!ok && k % 8 === 7) console.log('  …', JSON.stringify(await ev(() => { const M = window.__tc.G.measure, a = M.agent; return { gameMin: M.t0 !== null ? +(window.__tc.G.clock - M.t0).toFixed(1) : 'warm', left: Math.round(Math.hypot(a.x - M.to.x, a.z - M.to.z)), kmh: Math.round(a.v * 3.6), ri: a.ri + '/' + a.route.length, cars: window.__tc.traffic.cars.length, hopsLeft: a.hopsLeft }; })));
        }
        Object.assign(row, { ok }, await ev(() => { const M = window.__tc.G.measure; return { min: M.min && +M.min.toFixed(1), km: M.km && +M.km.toFixed(2), stoppedMin: +((M.stopT || 0) * 0.1).toFixed(1), hops: M.hops, wrecked: M.wrecked, cars: window.__tc.traffic.cars.length }; }));
      }
    } else {
      // 無人機：用遊戲本身的流程（續玩 → 上車 → 起點 → U）
      await ev((pr) => { localStorage.clear(); localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: pr, day: 2, econ: { money: 50000, owned: ['nav', 'roadster', 'drone'], carKey: 'roadster', stuntFuel: 1 } })); }, pr);
      await boot();
      await page.click('#btnContinue');
      await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
      await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
      await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
      await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
      await wait(600); await page.keyboard.press('KeyE');
      await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
      await page.keyboard.press('Enter'); await until(() => !window.__tc.G.seatAdj, null, 30000);
      // 跟通勤車同一個起點（住家附近的主要道路）
      await ev((h) => { const { world, car } = window.__tc, o = {}; const e = world.nearestEdge(h.x, h.z, 500, (ed) => ed.cls >= 1 && ed.cls <= 4 && !ed.bridge && !ed.tunnel, o); if (e) car.place(o.x, o.z, car.psi, world.groundAt(o.x, o.z)); }, pr.home);
      await until(() => window.__tc.world.readyAround(window.__tc.car.x, window.__tc.car.z, 300), null, 120000); await wait(2000);
      await ev(() => { window.__tc.steps = 6; window.__tc.traffic.factor = 1.8; });
      const c0 = await ev(() => window.__tc.G.clock);
      await page.keyboard.press('KeyU');
      const started = await until(() => window.__tc.flight.active, null, 15000);
      if (!started) { row.ok = false; row.err = await ev(() => document.getElementById('toast').textContent); }
      else {
        const ok = await until(() => !window.__tc.flight.active, null, 30 * 60000);
        Object.assign(row, { ok }, await ev((c0) => { const { G, flight, car, econ } = window.__tc; return { min: +(G.clock - c0).toFixed(1), waitMin: +(flight.waitSec * 0.1).toFixed(1), leftM: Math.round(Math.hypot(car.x - G.cfg.work.x, car.z - G.cfg.work.z)), cost: Math.round(econ.day.drone), layer: flight.layer }; }, c0));
      }
    }
    row.wallMin = +((Date.now() - t0) / 60000).toFixed(1);
    console.log(JSON.stringify(row));
    results.push(row); fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  }
}
console.log(errs.slice(0, 8).join('\n') || 'no page errors');
await browser.close();
