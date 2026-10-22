// 手機 CPU 量測（CPU 降速 4 倍模擬中階手機）：遊戲邏輯各部分每格花多少時間、載入新小格時卡多久。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(400000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: ['nav'], carKey: 'gas' } })); });
await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(600);
await ev(() => { const { car, world } = window.__tc; car.place(1290, 1182, 0, world.groundAt(1290, 1182)); car.v = 0; });
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 500) && world.pending === 0; }, null, { timeout: 400000 });
await wait(3000);
// 量測：包住各個 update
await ev(() => {
  const T = window.__tc, acc = window.__acc = {}, builds = window.__builds = [];
  const wrap = (obj, fn, key) => { const f0 = obj[fn].bind(obj); obj[fn] = (...a) => { const t = performance.now(); const r = f0(...a); acc[key] = (acc[key] || 0) + performance.now() - t; return r; }; };
  wrap(T.world, 'update', 'world.update'); wrap(T.traffic, 'update', 'traffic'); wrap(T.parking, 'update', 'parking'); wrap(T.signs, 'update', 'signs');
  const b0 = T.world._build.bind(T.world); T.world._build = (c, t) => { const s = performance.now(); b0(c, t); builds.push(Math.round(performance.now() - s)); };
});
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
// 1) 停在原地：每格時間（遊戲邏輯／畫面的 CPU 部分）
const perFrame = (label) => ev((label) => { const T = window.__tc, R = T.renderer, r0 = R.render; T.manual = true; for (const k in window.__acc) delete window.__acc[k];
  const N = 20; let t = performance.now(); R.render = () => {}; for (let i = 0; i < N; i++) T.advance(1 / 30, 1); const logic = (performance.now() - t) / N;
  const parts = {}; for (const k in window.__acc) parts[k] = +(window.__acc[k] / N).toFixed(1);
  R.render = r0; let rt = 0; const r1 = R.render.bind(R); R.render = (a, b) => { const s = performance.now(); r1(a, b); rt += performance.now() - s; };
  t = performance.now(); for (let i = 0; i < N; i++) T.advance(1 / 30, 1); const all = (performance.now() - t) / N; R.render = r0; T.manual = false;
  return `${label}: 每格 ${all.toFixed(1)} ms（遊戲邏輯 ${logic.toFixed(1)}，畫面送出 ${(rt / N).toFixed(1)}）${JSON.stringify(parts)}`; }, label);
console.log('CPU×4', await perFrame('第三人稱 停著'));
await ev(() => { window.__tc.G.cam = 'cockpit'; }); console.log('CPU×4', await perFrame('駕駛座 停著')); await ev(() => { window.__tc.G.cam = 'chase'; });
// 2) 一路往東移動 1.6 km（每 100 m 跑 20 格）：記錄載入新小格各花多久
const builds = await ev(async () => { const T = window.__tc, { car, world } = T; T.manual = true; const out = []; let worst = 0;
  for (let k = 1; k <= 16; k++) { const x = 1290 + k * 100, z = 1182; car.place(x, z, -Math.PI / 2, world.groundAt(x, z)); car.v = 0;
    for (let i = 0; i < 20; i++) { const t = performance.now(); T.advance(1 / 30, 1); worst = Math.max(worst, performance.now() - t); }
    await new Promise(r => setTimeout(r, 300)); }
  T.manual = false; return { builds: window.__builds, worstFrame: Math.round(worst), cells: world.cells.size }; });
console.log('CPU×4 移動 1.6 km：載入小格（ms）', JSON.stringify(builds));
console.log(errs.slice(0, 3).join(' | ') || 'no page errors');
await browser.close();
