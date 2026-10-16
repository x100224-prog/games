// 駕駛座頭暈原因實測：模擬一般玩家用鍵盤開車（按一下、放一下修正方向；放開油門、踩煞車），
// 在建議路線的一段大路上開 40 秒，每一幀記錄鏡頭方向、車速、方向盤角度，算出：
//   鏡頭左右轉的角速度、角加速度、左右來回甩的次數、加減速度與「急」的程度（jerk）、視角自動轉動
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const tag = process.argv[2] || 'before', startKm = +(process.argv[3] || 1.6), vKmh = +(process.argv[4] || 50), routeKey = process.argv[5] || 'fastest';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8767/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 90000 });
await ev(() => { window.__tc.noRender = true; try { localStorage.removeItem('yingge-route'); } catch (e) {} });
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 150000 });
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await page.waitForTimeout(800);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive' && window.__tc.G.seatAdj, null, { timeout: 60000 });
// 移到建議路線上大約 startKm 公里處（大路），方向沿著路線
const info = await ev(([km, rk]) => { const { car, M, world, traffic } = window.__tc; const r = M.routes[rk]; traffic.clear(); traffic.update = () => {}; let acc = 0, i = 2;
  for (; i < r.length; i += 2) { acc += Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]); if (acc > km * 1000) break; }
  const x = r[i - 2], z = r[i - 1], dx = r[i] - x, dz = r[i + 1] - z; car.place(x, z, Math.atan2(-dx, -dz), world.groundAt(x, z));
  window.__route = r; window.__ri = i - 2; return { x, z }; }, [startKm, routeKey]);
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 400); }, null, { timeout: 200000 });
await page.waitForTimeout(1500);
const road = await ev(() => { const { car, world } = window.__tc; const o = {}; const e = world.nearestEdge(car.x, car.z, 30, null, o); car.place(o.x, o.z, car.psi, o.y || world.groundAt(o.x, o.z)); return e ? `${e.name} cls${e.cls} 寬${e.width}m` : '?'; });
await page.keyboard.press('Enter');   // 關掉座椅調整
await page.waitForTimeout(300);
// 在頁面內每幀執行「模擬玩家」：反應時間 0.15 s、每 0.1 s 決定一次按鍵
await ev((vT) => {
  const send = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const held = new Set(); const setKeys = (want) => { for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) { const w = want.includes(k); if (w && !held.has(k)) { send(k, true); held.add(k); } else if (!w && held.has(k)) { send(k, false); held.delete(k); } } };
  const cam = window.__tc.camera, dir = new cam.position.constructor();
  window.__rec = []; let t0 = null, last = null, nextDecide = 0, pending = [], want = [];
  const r = window.__route;
  const step = (now) => {
    const { car, G } = window.__tc; if (G.state !== 'drive') return;
    if (t0 === null) { t0 = now; last = now; }
    const t = (now - t0) / 1000, dt = (now - last) / 1000; last = now;
    // 路線上前方的點（往右偏 1.75 m，靠右行駛）
    let bi = window.__ri, bd = 1e18; for (let i = window.__ri; i < Math.min(r.length, window.__ri + 200); i += 2) { const d = (r[i] - car.x) ** 2 + (r[i + 1] - car.z) ** 2; if (d < bd) { bd = d; bi = i; } } window.__ri = bi;
    let acc = 0, i = bi, ahead = 14 + Math.max(0, car.v) * 0.9; while (i + 2 < r.length && acc < ahead) { acc += Math.hypot(r[i + 2] - r[i], r[i + 3] - r[i + 1]); i += 2; }
    const sx = r[i] - r[i - 2], sz = r[i + 1] - r[i - 1], L = Math.hypot(sx, sz) || 1, tx = r[i] - sz / L * 1.75, tz = r[i + 1] + sx / L * 1.75;
    let e = Math.atan2(tx - car.x, -(tz - car.z)) - Math.atan2(car.fwdX, -car.fwdZ); e = Math.atan2(Math.sin(e), Math.cos(e));
    // 前一段 dt 的偏離道路中心距離
    const ax = r[bi], az = r[bi + 1], bx = r[bi + 2] ?? ax, bz = r[bi + 3] ?? az, l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, u = Math.max(0, Math.min(1, ((car.x - ax) * (bx - ax) + (car.z - az) * (bz - az)) / l2));
    const lat = Math.hypot(car.x - ax - (bx - ax) * u, car.z - az - (bz - az) * u);
    if (t >= nextDecide) {
      nextDecide = t + 0.1;
      const k = [];
      const brakePhase = t > 20 && t < 22.5;
      if (brakePhase) k.push('KeyS'); else if (car.v < vT / 3.6 - 0.8) k.push('KeyW');
      if (e > 0.025) k.push('KeyD'); else if (e < -0.025) k.push('KeyA');
      pending.push([t + 0.15, k]);   // 反應時間
    }
    while (pending.length && pending[0][0] <= t) want = pending.shift()[1];
    setKeys(want);
    cam.getWorldDirection(dir);
    window.__rec.push({ t, dt, yaw: Math.atan2(dir.x, -dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, dir.y))), y: cam.position.y, v: car.v, steer: car.steer, lookYaw: window.__tc.cockpit ? 0 : 0, keys: want.join(''), lat });
    if (t < 40) requestAnimationFrame(step); else setKeys([]);
  };
  requestAnimationFrame(step);
}, vKmh);
await page.waitForTimeout(43000);
const rec = await ev(() => window.__rec);
fs.writeFileSync(`shots/cockpit_${tag}.json`, JSON.stringify(rec));
const D = 180 / Math.PI;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const yr = [], ya = [], acc = [], jerk = [];
for (let i = 1; i < rec.length; i++) { let d = rec[i].yaw - rec[i - 1].yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yr.push(d * D / rec[i].dt); acc.push((rec[i].v - rec[i - 1].v) / rec[i].dt); }
// 角加速度、jerk 用 3 幀平均，避免單幀計時誤差
const sm = (a) => a.map((_, i) => (a[Math.max(0, i - 1)] + a[i] + a[Math.min(a.length - 1, i + 1)]) / 3);
const yrs = sm(yr), accs = sm(acc);
for (let i = 1; i < yrs.length; i++) { ya.push((yrs[i] - yrs[i - 1]) / rec[i + 1].dt); jerk.push((accs[i] - accs[i - 1]) / rec[i + 1].dt); }
const T = rec[rec.length - 1].t - rec[0].t;
let rev = 0, prevSign = 0; for (const w of yrs) { const s = w > 3 ? 1 : w < -3 ? -1 : 0; if (s && prevSign && s !== prevSign) rev++; if (s) prevSign = s; }
let keyChanges = 0; for (let i = 1; i < rec.length; i++) if (/[AD]/.test(rec[i].keys) !== /[AD]/.test(rec[i - 1].keys) || rec[i].keys.replace(/[WS]/g, '') !== rec[i - 1].keys.replace(/[WS]/g, '')) keyChanges++;
const res = {
  tag, road, seconds: +T.toFixed(1), frames: rec.length, avgKmh: +(rec.reduce((a, r) => a + r.v, 0) / rec.length * 3.6).toFixed(0),
  yawRate_p95_degs: +pct(yrs.map(Math.abs), 0.95).toFixed(1), yawRate_max: +Math.max(...yrs.map(Math.abs)).toFixed(1),
  yawAccel_p95_degs2: +pct(ya.map(Math.abs), 0.95).toFixed(0), yawAccel_max: +Math.max(...ya.map(Math.abs)).toFixed(0),
  leftRightReversals_per_min: +(rev / T * 60).toFixed(1),
  steerKeyChanges_per_min: +(keyChanges / T * 60).toFixed(0),
  maxDecel_ms2: +(-Math.min(...accs)).toFixed(1), maxAccel_ms2: +Math.max(...accs).toFixed(1), jerk_p99_ms3: +pct(jerk.map(Math.abs), 0.99).toFixed(1),
  laneErr_mean_m: +(rec.reduce((a, r) => a + r.lat, 0) / rec.length).toFixed(2),
};
console.log(JSON.stringify(res, null, 1));
console.log(errs.slice(0, 3).join('\n'));
await browser.close();
