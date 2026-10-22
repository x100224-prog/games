// 手機：開車是車外（第三人稱）視角、不跳座椅調整、預設順暢優先；拍幾個原本被房子擋住的地方。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8768/index.html');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('drive-comfort', JSON.stringify({ quality: 'high' }));   // 舊的存檔：以前一定存成 high
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: ['nav'], carKey: 'gas' } })); });
await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1500);
const st = () => ev(() => { const { G, renderer, sun, world } = window.__tc; return { cam: G.cam, camMode: G.camMode, seatPanel: !document.getElementById('seat').hidden, seatAdj: G.seatAdj, navMini: !document.getElementById('navMini').hidden, mini: !document.getElementById('mini').hidden,
  speedo: !document.getElementById('speedo').hidden, shadow: sun.castShadow, px: renderer.getPixelRatio(), lite: world.lite, more: [...document.querySelectorAll('#moreMenu button')].map(b => b.textContent).join('|'), toast: document.getElementById('toast').textContent }; });
console.log('entered car:', JSON.stringify(await st()));
const shot = async (name, sec = 3) => { await ev(() => { window.__tc.noRender = false; }); await wait(sec * 1000); await page.screenshot({ path: `shots/${name}.png` }); };
const placeOn = (x, z, filter) => ev(([x, z, filter]) => { const { car, world, traffic } = window.__tc; const o = {}; const e = world.nearestEdge(x, z, 80, filter ? new Function('e', 'return ' + filter) : null, o);
  if (!e) return null; const i = Math.min(e.pts.length / 2 - 2, Math.max(0, e.cum.findIndex(c => c > o.s) - 1)); const dx = e.pts[i * 2 + 2] - e.pts[i * 2], dz = e.pts[i * 2 + 3] - e.pts[i * 2 + 1];
  car.place(o.x, o.z, Math.atan2(-dx, -dz), world.groundAt(o.x, o.z)); car.v = 0; window.__tc.G.chase = null; return e.name + ' cls ' + e.cls; }, [x, z, filter]);
// 1) 復興北路（文湖線高架車站，原本車站整棟蓋在馬路上）
await ev(() => { window.__tc.car.place(-86, 900, 0, 0); });
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 400); }, null, { timeout: 300000 });
console.log('place', await placeOn(-87, 880, 'e.cls <= 3'));
await shot('fix_fuxing_station', 4);
// 往前開 120 m，看會不會被擋
// 遊戲時間開 sec 秒（每格 1/30 秒，不畫畫面），油門踩到 30 km/h 左右，方向跟著路
const drive = (sec) => ev((sec) => { const T = window.__tc, c = T.car, x0 = c.x, z0 = c.z; T.manual = true; let minV = 99, hits = 0, path = 0, px = c.x, pz = c.z;
  for (let i = 0; i < sec * 30; i++) { T.input.keys.delete('KeyW'); if (c.kmh < 30) T.input.keys.add('KeyW'); T.noRender = true; T.advance(1 / 30, 2); path += Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; if (i > 60) minV = Math.min(minV, c.kmh); }
  T.input.keys.delete('KeyW'); T.manual = false; return { straight: Math.round(Math.hypot(c.x - x0, c.z - z0)), path: Math.round(path), kmh: Math.round(c.kmh), minKmhAfter2s: Math.round(minV), state: T.G.state }; }, sec);
console.log('drive under station:', JSON.stringify(await drive(15)));
await shot('fix_fuxing_station_after', 1);
console.log('after drive:', JSON.stringify(await st()));
// 2) 雨聲街（巷子，原本房子壓在路上）
await ev(() => { window.__tc.car.place(-1648, -4750, 0, 0); });
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 300); }, null, { timeout: 300000 });
console.log('place', await placeOn(-1648, -4750, 'e.cls >= 5'));
await shot('fix_alley', 4);
console.log('drive alley:', JSON.stringify(await drive(10)));
// 畫面數字
await shot('fix_alley_after', 2);
console.log('render:', JSON.stringify(await ev(() => { const { renderer } = window.__tc; renderer.info.autoReset = false; renderer.info.reset(); return new Promise(r => setTimeout(() => { const i = renderer.info.render; r({ callsPerFrame: Math.round(i.calls / i.frame), trisPerFrameK: Math.round(i.triangles / i.frame / 1000), frames: i.frame }); renderer.info.autoReset = true; }, 3000)); })));
console.log(errs.slice(0, 4).join(' | ') || 'no page errors');
await browser.close();
