// 駕駛座：單一按鍵動作的畫面反應（沒有其他車，國道 1 號直線路段）
//   按一下 D 0.2 秒、按住 D 1 秒（50、90 km/h）；按一下 S 0.3 秒、按住 S；從靜止踩 W
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const tag = process.argv[2] || 'before';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8767/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 90000 });
await ev(() => { window.__tc.noRender = true; });
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 150000 });
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await page.waitForTimeout(800);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive' && window.__tc.G.seatAdj, null, { timeout: 60000 });
await ev(() => { const { car, M, world, traffic } = window.__tc; traffic.clear(); traffic.update = () => {}; const r = M.routes.fastest; let acc = 0, i = 2;
  for (; i < r.length; i += 2) { acc += Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]); if (acc > 3400) break; }
  const x = r[i - 2], z = r[i - 1], dx = r[i] - x, dz = r[i + 1] - z; car.place(x, z, Math.atan2(-dx, -dz), world.groundAt(x, z)); });
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 400); }, null, { timeout: 200000 });
await page.waitForTimeout(1500);
await ev(() => { const { car, world } = window.__tc; const o = {}; const e = world.nearestEdge(car.x, car.z, 30, null, o); const p = {}; const s = Math.min(e.len - 1, o.s + 1); window.__edge = e;
  // 車頭對齊道路方向
  const k = Math.max(0, e.cum.findIndex(c => c > o.s) - 1), dx = e.pts[k * 2 + 2] - e.pts[k * 2], dz = e.pts[k * 2 + 3] - e.pts[k * 2 + 1]; car.place(o.x, o.z, Math.atan2(-dx, -dz), car.y); });
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
// 動作腳本：每一段 = [名稱, 按鍵, 秒數 或 {v: 目標速度 km/h}]
const script = [
  ['加速到50', 'W', { v: 50 }], ['穩定', '', 0.6],
  ['點D0.2秒@50', 'D', 0.2], ['放開', '', 1.5], ['點A0.2秒@50', 'A', 0.2], ['放開', '', 1.5],
  ['按住D1秒@50', 'D', 1.0], ['放開', '', 2.0],
  ['點S0.3秒@50', 'S', 0.3], ['放開', '', 1.0],
  ['加速到90', 'W', { v: 90 }], ['穩定', '', 0.6],
  ['點D0.2秒@90', 'D', 0.2], ['放開', '', 2.0],
  ['按住S煞停', 'S', { v: 0 }], ['停住', '', 1.0],
  ['從靜止踩W', 'W', 2.0], ['放開', '', 0.5],
];
await ev((script) => {
  const send = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  let held = ''; const setKey = (k) => { if (k === held) return; if (held) send('Key' + held, false); if (k) send('Key' + k, true); held = k; };
  const cam = window.__tc.camera, dir = new cam.position.constructor(); const { car, world } = window.__tc;
  window.__rec = []; window.__done = false; let si = 0, segT = 0, t = 0, last = null;
  const step = (now) => {
    if (last === null) last = now; const dt = (now - last) / 1000; last = now; t += dt; segT += dt;
    const [name, key, dur] = script[si];
    let end = false;
    if (typeof dur === 'number') end = segT >= dur; else end = dur.v > 0 ? car.v * 3.6 >= dur.v : car.v < 0.05;
    if (end) { si++; segT = 0; if (si >= script.length) { setKey(''); window.__done = true; return; } }
    // 加速／穩定段：自動保持在車道中央（直接對齊方向，不算進量測）
    const [nm2, key2] = script[si];
    if (nm2.startsWith('加速') || nm2 === '穩定' || nm2 === '停住') { const o = {}; const e = world.nearestEdge(car.x, car.z, 30, ed => ed.cls <= 1, o); if (e) { const k = Math.max(0, e.cum.findIndex(c => c > o.s) - 1), dx = e.pts[k * 2 + 2] - e.pts[k * 2], dz = e.pts[k * 2 + 3] - e.pts[k * 2 + 1]; car.psi = Math.atan2(-dx, -dz); car.steer = 0; } }
    setKey(key2);
    cam.getWorldDirection(dir);
    window.__rec.push({ t, dt, seg: nm2, key: key2, yaw: Math.atan2(dir.x, -dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, dir.y))), v: car.v, steer: car.steer });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}, script);
await page.waitForFunction(() => window.__done, null, { timeout: 200000 });
const rec = await ev(() => window.__rec);
fs.writeFileSync(`shots/tap_${tag}.json`, JSON.stringify(rec));
const D = 180 / Math.PI;
const yr = [0], acc = [0];
for (let i = 1; i < rec.length; i++) { let d = rec[i].yaw - rec[i - 1].yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yr.push(d * D / rec[i].dt); acc.push((rec[i].v - rec[i - 1].v) / rec[i].dt); }
const sm = (a) => a.map((_, i) => (a[Math.max(0, i - 1)] + a[i] + a[Math.min(a.length - 1, i + 1)]) / 3);
const yrs = sm(yr), accs = sm(acc), ya = [0], jk = [0];
for (let i = 1; i < rec.length; i++) { ya.push((yrs[i] - yrs[i - 1]) / rec[i].dt); jk.push((accs[i] - accs[i - 1]) / rec[i].dt); }
// 每個動作：從按下開始，到下一個「放開」段結束
const out = {};
for (let i = 0; i < rec.length; i++) {
  const s = rec[i].seg; if (!/^(點|按住|從)/.test(s) || out[s]) continue;
  let j = i; while (j < rec.length && rec[j].seg === s) j++; let k = j; while (k < rec.length && /^(放開|停住)$/.test(rec[k].seg)) k++;
  const idx = Array.from({ length: k - i }, (_, n) => i + n);
  const pkYR = Math.max(...idx.map(n => Math.abs(yrs[n]))), pkN = idx.find(n => Math.abs(yrs[n]) === pkYR);
  let head = 0; for (const n of idx) { let d = rec[n].yaw - rec[Math.max(0, n - 1)].yaw; head += Math.atan2(Math.sin(d), Math.cos(d)) * D; }
  out[s] = /S|W/.test(rec[i].key)
    ? { 最大減速或加速_ms2: +Math.max(...idx.map(n => Math.abs(accs[n]))).toFixed(1), 最大急動度_ms3: +Math.max(...idx.map(n => Math.abs(jk[n]))).toFixed(0) }
    : { 最大轉動_度每秒: +pkYR.toFixed(1), 到達最大所需_秒: +(rec[pkN].t - rec[i].t).toFixed(2), 最大角加速度_度每秒平方: +Math.max(...idx.map(n => Math.abs(ya[n]))).toFixed(0), 車頭總共轉了_度: +Math.abs(head).toFixed(1) };
}
console.log(tag, JSON.stringify(out, null, 1));
console.log(errs.slice(0, 3).join('\n'));
await browser.close();
