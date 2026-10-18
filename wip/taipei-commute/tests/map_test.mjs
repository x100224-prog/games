// 全螢幕地圖（放大縮小、路名、停車場、你的車）＋住處地下停車位（早上從車位出發、晚上停進車位）。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const boot = async () => { await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq'); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 200000 }); };
await boot();
await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 3000000, owned: [], carKey: 'gas' } })); });
await boot();
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
// 房間裡打開商店：有地下停車位、價錢
await page.keyboard.press('KeyM'); await wait(2500);
const mapInfo = () => ev(() => { const M = window.__tc.cityMap; return { open: !document.getElementById('bigmap').hidden, labels: !!(M && M.labels), scale: M && +M.s.toFixed(3), center: M && [Math.round(M.cx), Math.round(M.cz)] }; });
console.log('map in room:', JSON.stringify(await mapInfo()));
await ev(() => { window.__tc.noRender = false; }); await wait(800);
await page.screenshot({ path: 'shots/map_0_open.png' });
// 放大（滾輪，在畫面中間）
const cvBox = await page.locator('#bigCv').boundingBox();
await page.mouse.move(cvBox.x + cvBox.width / 2, cvBox.y + cvBox.height / 2);
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -300); await wait(150); }
await wait(600); console.log('after wheel zoom-in:', JSON.stringify(await mapInfo())); await page.screenshot({ path: 'shots/map_1_zoomin.png' });
// 拖曳
await page.mouse.down(); await page.mouse.move(cvBox.x + cvBox.width / 2 - 200, cvBox.y + cvBox.height / 2 - 100, { steps: 6 }); await page.mouse.up();
await wait(400); console.log('after drag:', JSON.stringify(await mapInfo()));
await page.click('#mapAll'); await wait(600); console.log('全市:', JSON.stringify(await mapInfo())); await page.screenshot({ path: 'shots/map_2_all.png' });
await page.click('#mapMe'); await page.click('#mapIn'); await wait(600); console.log('我＋放大:', JSON.stringify(await mapInfo()));
await page.click('#bigClose'); await wait(300);
// 走到車子旁邊（車停著）→ 地圖上有「你的車停在這裡」
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await page.keyboard.press('KeyM'); await wait(1500); await page.click('#mapIn'); await page.click('#mapIn'); await wait(800);
await page.screenshot({ path: 'shots/map_3_walk_car.png' }); await page.click('#bigClose');
// 買地下停車位（商店），第二天早上車子在停車位
await ev(() => { window.__tc.noRender = true; });
const bought = await ev(() => { const e = window.__tc.econ; e.money = 5000000; const p = e.price('garage'); const r = e.buy('garage'); return { price: p, ok: r.ok, msg: r.msg, moves: e.moves }; });
console.log('buy garage:', JSON.stringify(bought));
// 跳到隔天早上：結束今天（直接進下一天的流程）
await ev(() => { const G = window.__tc.G; G.dayN++; window.__tc.startDayForTest && window.__tc.startDayForTest(); });
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
const morning = await ev(() => { const { car, G } = window.__tc; return { atGarage: G.atGarage, carToHome: Math.round(Math.hypot(car.x - G.cfg.home.x, car.z - G.cfg.home.z)), garage: G.garage && [Math.round(G.garage.x), Math.round(G.garage.z)] }; });
console.log('next morning:', JSON.stringify(morning));
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(1000);
console.log('toast leaving home:', await ev(() => document.getElementById('toast').textContent));
await ev(() => { window.__tc.noRender = false; }); await wait(2500); await page.screenshot({ path: 'shots/map_4_garage_morning.png' }); await ev(() => { window.__tc.noRender = true; });
await page.keyboard.press('KeyM'); await wait(1200); await ev(() => { window.__tc.noRender = false; }); await page.click('#mapIn'); await page.click('#mapIn'); await wait(800); await page.screenshot({ path: 'shots/map_5_garage_map.png' }); await page.click('#bigClose'); await ev(() => { window.__tc.noRender = true; });
// 上車 → 開到公司（瞬移停好）→ 下班 → 開回家停進地下停車位
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(500);
await ev(() => { const { car, G } = window.__tc; car.place(G.cfg.work.x, G.cfg.work.z, 0, 0); });
await page.waitForFunction(() => { const { parking, car } = window.__tc; return parking.readyAround(car.x, car.z, 200); }, null, { timeout: 200000 }); await wait(1200);
await ev(() => { const { parking, car, G } = window.__tc; let best = null; parking.forBaysNear(G.cfg.work.x, G.cfg.work.z, 440, (b, d2) => { if (!b.occupied && !b.reserved && b.type === 'road' && (!best || d2 < best.d2)) best = { b, d2 }; }); if (best) car.place(best.b.x, best.b.z, best.b.psi, best.b.y); });
await wait(800); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, G } = window.__tc; P.x = G.cfg.work.x + 1; P.z = G.cfg.work.z; });
await page.waitForFunction(() => window.__tc.G.state === 'walk' && window.__tc.G.leg === 'pm', null, { timeout: 90000 }); await wait(1500);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await ev(() => { const { car, G } = window.__tc; car.place(G.garage.x, G.garage.z, G.garage.psi, G.garage.y); });
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 200); }, null, { timeout: 200000 }); await wait(1500);
console.log('evening at garage prompt:', await ev(() => document.getElementById('prompt').innerText));
await page.keyboard.press('KeyE'); await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(600);
console.log('parked:', JSON.stringify(await ev(() => ({ type: window.__tc.G.parked.type, legal: window.__tc.G.parked.legal, toast: document.getElementById('toast').textContent }))));
await ev(() => { const { P, G } = window.__tc; P.x = G.cfg.home.x + 1; P.z = G.cfg.home.z; });
await page.waitForFunction(() => window.__tc.G.state === 'summary', null, { timeout: 60000 });
console.log('summary:', await ev(() => document.getElementById('sumStats').innerText.replace(/\n/g, ' ')));
console.log(errs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
