// 量測「會讓人暈」的畫面動作：鏡頭上下抖動、自動轉動、第三人稱鏡頭忽遠忽近、轉向角速度
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const ev = (f, a) => page.evaluate(f, a);
page.setDefaultTimeout(180000);
await page.goto('http://localhost:8767/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 90000 });
await ev(() => {
  window.__tc.noRender = true; window.__rec = [];
  const cam = window.__tc.camera; let lastT = performance.now();
  const f = (now) => { const { G, car, tp, P } = window.__tc; const dt = (now - lastT) / 1000; lastT = now;
    if (G.state === 'walk' || G.state === 'drive') window.__rec.push({ st: G.state, seat: !!G.seatAdj, cam: G.cam, dt, x: cam.position.x, y: cam.position.y, z: cam.position.z, rx: cam.rotation.x, ry: cam.rotation.y, rz: cam.rotation.z, carPitch: car ? car.pitch : 0, carY: car ? car.y : 0, v: car ? car.v : 0, tpd: tp.curDist, py: P.y, glance: !!G.glance });
    requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
await page.click('#btnAuto');
await page.waitForFunction(() => window.__tc.G.state === 'drive' && !window.__tc.G.seatAdj, null, { timeout: 150000 });
await page.waitForTimeout(24000);
const rec = await ev(() => window.__rec);
const deg = (r) => r * 180 / Math.PI;
// 走路：第三人稱鏡頭距離的變化
const walk = rec.filter(r => r.st === 'walk');
let pulls = 0; for (let i = 1; i < walk.length; i++) if (walk[i].tpd < walk[i - 1].tpd - 0.3) pulls++;
const td = walk.map(r => r.tpd);
console.log('WALK frames', walk.length, 'tp dist min/max', Math.min(...td).toFixed(2), Math.max(...td).toFixed(2), 'sudden pull-ins(>0.3m/frame)', pulls);
// 開車（駕駛座、沒在看後照鏡）：鏡頭俯仰的抖動、上下位移、轉向角速度
const drv = rec.filter(r => r.st === 'drive' && !r.seat && r.cam === 'cockpit' && !r.glance && Math.abs(r.v) > 1);
const pit = drv.map(r => deg(r.carPitch));
let pr = 0, maxYawRate = 0, ys = [];
for (let i = 1; i < drv.length; i++) { const d = deg(drv[i].rx - drv[i - 1].rx) / drv[i].dt; pr = Math.max(pr, Math.abs(d)); let dy = drv[i].ry - drv[i - 1].ry; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); maxYawRate = Math.max(maxYawRate, Math.abs(deg(dy) / drv[i].dt)); ys.push((drv[i].y - drv[i - 1].y) / drv[i].dt); }
const mean = pit.reduce((a, b) => a + b, 0) / (pit.length || 1), sd = Math.sqrt(pit.reduce((a, b) => a + (b - mean) ** 2, 0) / (pit.length || 1));
console.log('DRIVE cockpit frames', drv.length, 'car pitch deg min/max/sd', Math.min(...pit).toFixed(2), Math.max(...pit).toFixed(2), sd.toFixed(2), 'max pitch rate deg/s', pr.toFixed(1), 'max yaw rate deg/s', maxYawRate.toFixed(1), 'max vertical cam speed m/s', Math.max(...ys.map(Math.abs)).toFixed(2));
// 自動回正：沒有輸入時 lookYaw 被拉回 0 的情形（看程式設定）
const rates = []; for (let i = 1; i < drv.length; i++) rates.push(Math.abs(deg(drv[i].carPitch - drv[i - 1].carPitch) / drv[i].dt)); rates.sort((a, b) => a - b);
const T = drv.reduce((a, r) => a + r.dt, 0); let flips = 0; for (let i = 2; i < drv.length; i++) { const a = drv[i - 1].carPitch - drv[i - 2].carPitch, b = drv[i].carPitch - drv[i - 1].carPitch; if (a * b < 0 && Math.abs(b) > 0.0005) flips++; }
console.log('car-pitch rate deg/s p50/p90/p99', rates[rates.length >> 1].toFixed(2), rates[Math.floor(rates.length * 0.9)].toFixed(2), rates[Math.floor(rates.length * 0.99)].toFixed(2), 'direction reversals per s', (flips / T).toFixed(1), 'over', T.toFixed(1), 's');
const yr = []; for (let i = 1; i < drv.length; i++) { let dy = drv[i].ry - drv[i - 1].ry; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yr.push(Math.abs(deg(dy) / drv[i].dt)); } yr.sort((a, b) => a - b); console.log('yaw rate p50/p90/p99', yr[yr.length >> 1].toFixed(1), yr[Math.floor(yr.length * .9)].toFixed(1), yr[Math.floor(yr.length * .99)].toFixed(1));
console.log('roll(rz) max deg', Math.max(...rec.map(r => Math.abs(deg(r.rz)))).toFixed(2));
const fps = rec.length ? rec.length / rec.reduce((a, r) => a + r.dt, 0) : 0; console.log('logic fps', fps.toFixed(0));
await browser.close();
