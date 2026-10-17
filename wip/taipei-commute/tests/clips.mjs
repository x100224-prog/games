// 錄影：用遊戲實際畫面一格一格錄（每格固定 1/24 秒、物理每格算 2 次），存成 JPEG，再用 ffmpeg 合成 mp4。
// 用法：node tests/clips.mjs <片段,片段...>    片段：boost hop flip wall under empty drone
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
import { execFileSync } from 'child_process';
const WANT = (process.argv[2] || 'boost,hop,flip,wall,under,empty,drone').split(',');
const W = 960, H = 540, FPS = 24, HASH = process.env.HASH || '#clip,noaa';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true).catch(() => false);
page.setDefaultTimeout(300000);

async function boot(econ, mode) {
  await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html' + HASH);
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
  await ev(([econ, mode]) => { const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
    localStorage.clear(); localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 7, econ, mode })); }, [econ, mode]);
  await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html' + HASH);
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
  await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
  await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
  await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
  await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
  await wait(600); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
  await page.keyboard.press('Enter'); await until(() => !window.__tc.G.seatAdj, null, 30000); await wait(800);
  await ev(() => { document.getElementById('help').hidden = true; let c = document.getElementById('clipCap'); if (!c) { c = document.createElement('div'); c.id = 'clipCap'; c.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:50;background:rgba(10,12,16,.78);color:#fff;font:900 22px/1.35 "Noto Sans TC",sans-serif;padding:8px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.2);white-space:nowrap;pointer-events:none'; document.body.appendChild(c); } c.textContent = ''; c.hidden = true; });
}
const cap = (t) => ev((t) => { const c = document.getElementById('clipCap'); c.textContent = t; c.hidden = !t; }, t);
async function place(x, z, psi, opts = {}) {
  await ev(([x, z, psi]) => { const { car, world, stunts, econ } = window.__tc; if (stunts) stunts.reset(); econ.stuntFuel = 1; car.place(x, z, psi, world.groundAt(x, z)); }, [x, z, psi]);
  await ev(() => { window.__tc.manual = false; });
  await until(([x, z]) => window.__tc.world.readyAround(x, z, 300) && window.__tc.parking.readyAround(x, z, 150), [x, z], 200000);
  await wait(1500);
  if (opts.clearTraffic) await ev(() => { window.__tc.traffic.clear(); window.__tc.traffic.factor = 0; });
  await ev(() => { window.__tc.manual = true; });
}
const keys = (...k) => ev((k) => { const I = window.__tc.input; for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) I.keys.delete(c); for (const c of k) I.keys.add(c); }, k);
const press = (code) => ev((c) => window.__tc.input.hit.add(c), code);
let frameNo = 0, dir = '', CDP = null;
function startRec(name) { dir = `build/frames/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); frameNo = 0; }
/** 錄 n 格；sub：每格模擬幾個 1/48 秒（2 = 正常速度，8 = 4 倍速）。 */
async function rec(n, sub = 2, each) {
  for (let i = 0; i < n; i++) {
    if (each) { const stop = await each(i); if (stop === true) return i; }
    await ev((s) => window.__tc.advance(1 / 48, s), sub);
    if (!CDP) CDP = await page.context().newCDPSession(page);
    const r = await CDP.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, optimizeForSpeed: true });
    fs.writeFileSync(`${dir}/${String(frameNo++).padStart(5, '0')}.jpg`, Buffer.from(r.data, 'base64'));
  }
  return n;
}
/** 一直錄到條件成立（最多 max 格）。 */
async function recUntil(cond, max, sub = 2, arg) { return rec(max, sub, async () => await ev(cond, arg)); }
function finish(name) {
  const out = `build/clips/${name}.mp4`; fs.mkdirSync('build/clips', { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'medium', '-movflags', '+faststart', out]);
  console.log(name, frameNo, 'frames', (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
}
const ROAD = { x: -2501.7, z: 4343.0, psi: -1.8011 };      // 士林，筆直的水源快速道路
const WALL = null;                                          // 由程式找
const UNDER = { x: -510.958, z: 1693.611, psi: 1.5211 };   // 市民大道高架下

const t0 = Date.now();
await boot({ money: 20000000, owned: ['nav', 'roadster', 'drone'], carKey: 'roadster', stuntFuel: 1 });
await ev(() => { window.__tc.manual = true; });

if (WANT.includes('dbg')) {
  await place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
  await keys('KeyW');
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 2; i++) { await ev(() => window.__tc.advance(1 / 48, 2)); await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 86, optimizeForSpeed: true }); }
  const t = Date.now(); for (let i = 0; i < 5; i++) { await ev(() => window.__tc.advance(1 / 48, 2)); const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 86, optimizeForSpeed: true }); fs.writeFileSync('/tmp/claude-0/t' + HASH.replace(/\W/g, '') + '.jpg', Buffer.from(r.data, 'base64')); } console.log(HASH, 'cdp shot+advance', (Date.now() - t) / 5);
}
if (WANT.includes('boost')) {
  await place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
  await ev(() => { window.__tc.G.cam = 'chase'; });
  startRec('boost'); await cap('推進器（Shift）：約 1 秒 0 → 100 km/h，車尾噴出壓縮空氣');
  await rec(14); await keys('KeyW', 'ShiftLeft');
  await rec(70); await keys(); await rec(30);
  finish('boost'); await ev(() => { window.__tc.G.cam = 'cockpit'; });
}
async function queue(n) {
  return ev((n) => {
    const { car, traffic, world } = window.__tc; traffic.clear(); traffic.factor = 0; let k = 0;
    const col = window.__tc.scene.children.find(o => o.isHemisphereLight).color.clone();
    for (let i = 1; i <= n; i++) {
      const x = car.x + car.fwdX * (i * 6.2), z = car.z + car.fwdZ * (i * 6.2), o = {}; const e = world.nearestEdge(x, z, 10, null, o); if (!e) continue;
      const c = { e, dir: 1, lane: 0, s: o.s, v: 0, fac: 1, x, y: world.groundAt(x, z), z, psi: car.psi, turn: null, next: null, wait: 0, color: col.clone().setHSL(0, 0, 0.35 + (i % 3) * 0.25), scale: 1, flyer: false, hop: null, hopCd: 99, wreck: 999, pitch: 0 };
      e.cars.push(c); traffic.cars.push(c); k++;
    }
    return k;
  }, n);
}
if (WANT.includes('hop')) {
  await place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
  console.log('queue', await queue(10));
  startRec('hop'); await cap('塞車停著也能飛：垂直升空，飛越前面 10 台車');
  await rec(20); await press('KeyF'); await rec(8);
  await recUntil(() => window.__tc.stunts.mode !== 'air', 200);
  await rec(40); finish('hop');
}
if (WANT.includes('flip')) {
  await place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
  startRec('flip'); await cap('空中翻轉（T）：側面噴氣，落地前要轉正');
  await keys('KeyW'); await rec(30); await keys(); await press('KeyF'); await rec(12); await press('KeyT');
  await recUntil(() => window.__tc.stunts.mode !== 'air', 160); await rec(36); finish('flip');
}
if (WANT.includes('wall')) {
  const t = await ev(() => {
    const { world, car } = window.__tc; let best = null;
    for (const c of world.cells.values()) { if (c.state !== 'ready' || !c.blds) continue;
      for (const b of c.blds) { if (b.h < 30 || b.h > 60 || Math.hypot((b.minx + b.maxx) / 2 - car.x, (b.minz + b.maxz) / 2 - car.z) > 900) continue;
        const p = b.pts, n = p.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) { const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1], L = Math.hypot(bx - ax, bz - az); if (L < 14) continue;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2; let nx = -(bz - az) / L, nz = (bx - ax) / L; if (world.buildingAt(mx + nx * 0.6, mz + nz * 0.6) === b) { nx = -nx; nz = -nz; }
          const px = mx + nx * 7, pz = mz + nz * 7; if (world.buildingAt(px, pz) || world.buildingAt(mx + nx * 3, mz + nz * 3) || world.buildingAt(mx + nx * 14, mz + nz * 14)) continue;
          const s = world.surfaceAt(px, pz, world.groundAt(px, pz), {}); if (!s || s.edge.bridge || s.edge.tunnel) continue;
          // 屋頂要夠深（往裡面 18～70 m 都是同一棟），對面邊緣外 30 m 內沒有更高的樓：才能在屋頂開一段、從對面開出去
          let k = 3; while (k < 90 && world.buildingAt(mx - nx * k, mz - nz * k) === b) k++;
          if (k < 18 || k > 70) continue;
          let open = true; for (let q = k + 1; q < k + 30; q += 2) { const o = world.buildingAt(mx - nx * q, mz - nz * q); if (o && o.y0 + o.h > b.y0 + b.h - 1.5) { open = false; break; } }
          if (!open) continue;
          if (!best || b.h > best.h) best = { x: px, z: pz, psi: Math.atan2(nx, nz), h: b.h, depth: k }; } } }
    return best; });
  console.log('wall', t);
  if (t) {
    await place(t.x, t.z, t.psi, { clearTraffic: true });
    await ev(() => { window.__tc.G.cam = 'chase'; });
    startRec('wall'); await cap('面向大樓按 G：吸住外牆，垂直開上屋頂');
    await rec(18); await press('KeyG'); await rec(18); await keys('KeyW');
    await recUntil(() => window.__tc.stunts.mode === 'roof', 700); await keys(); await cap('上到屋頂了');
    await rec(20); await cap('在屋頂上開，從另一邊開出去：車底噴氣減速落地'); await keys('KeyW');
    await rec(400, 2, async () => { const s = await ev(() => ({ m: window.__tc.stunts.mode, v: window.__tc.car.v })); if (s.m !== 'roof') return true; if (s.v > 9) await keys(); else await keys('KeyW'); });
    await keys();
    await recUntil(() => window.__tc.stunts.mode === 'ground' || window.__tc.stunts.mode === 'roof', 400); await rec(36); await ev(() => { window.__tc.G.cam = 'cockpit'; }); finish('wall');
  }
}
if (WANT.includes('under')) {
  await place(UNDER.x, UNDER.z, UNDER.psi, { clearTraffic: true });
  startRec('under'); await cap('在高架橋正下方按 G：翻上去，吸在橋底倒著開');
  await rec(16); await press('KeyG'); await rec(24); await keys('KeyW');
  await recUntil(() => window.__tc.stunts.stats.underM > 110, 360); await keys(); await cap('再按 G：翻轉落地'); await press('KeyG');
  await recUntil(() => window.__tc.stunts.mode === 'ground', 120); await rec(30); finish('under');
}
if (WANT.includes('empty')) {
  await place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
  await ev(() => { window.__tc.econ.stuntFuel = 0.002; });
  startRec('empty'); await cap('壓縮空氣用完：飛天跑車的特殊功能停用');
  await rec(16); await press('KeyF'); await rec(60); await cap('開車時慢慢補（遊戲設定：每公里 5%）'); await keys('KeyW'); await rec(70); await keys(); await rec(10); finish('empty');
}
if (WANT.includes('drone')) {
  await ev(() => { window.__tc.manual = false; });
  await boot({ money: 20000000, owned: ['nav', 'roadster', 'drone'], carKey: 'roadster', stuntFuel: 1 });
  await ev(() => { window.__tc.traffic.factor = 1.8; });
  await wait(3000); await ev(() => { window.__tc.manual = true; });
  const info = await ev(() => { const { car, G } = window.__tc; return { km: +(Math.hypot(car.x - G.cfg.work.x, car.z - G.cfg.work.z) / 1000).toFixed(1), work: G.cfg.work.n }; });
  console.log('drone trip', info);
  startRec('drone');
  await cap(`從家門口出發，到 ${info.work}（直線 ${info.km} 公里）`); await rec(24);
  await cap('按 U 進入無人機系統：四組旋翼從車身翻出來'); await press('KeyU');
  await rec(40);
  await cap('垂直升空到最空的高度層（4 倍速）');
  await recUntil(() => window.__tc.flight.phase !== 'lift', 400, 8);
  await cap('巡航：DAA 避撞，閃開別架無人機和超高大樓（8 倍速）');
  await recUntil(() => { const f = window.__tc.flight; return f.phase !== 'cruise' || Math.hypot(f.spot.x - f.x, f.spot.z - f.z) < 450; }, 700, 16);
  await cap('接近目的地，減速找降落點（4 倍速）');
  await recUntil(() => ['hover', 'descend'].includes(window.__tc.flight.phase) || !window.__tc.flight.active, 500, 8);
  let lastCap = '';
  await rec(900, 6, async () => {
    const s = await ev(() => { const f = window.__tc.flight; return { a: f.active, ph: f.phase, b: !!f.blocked }; });
    if (!s.a) return true;
    const t = s.b ? '降落點下面有車：停在空中等（3 倍速）' : s.ph === 'descend' ? '下面沒車了：垂直降落（3 倍速）' : '到降落點上方（3 倍速）';
    if (t !== lastCap) { lastCap = t; await cap(t); }
  });
  await cap('降落完成，旋翼收回車身'); await rec(48);
  console.log('drone result', await ev(() => { const { flight, econ } = window.__tc; return { flyMin: +(flight.flySec * 0.1).toFixed(1), waitMin: +(flight.waitSec * 0.1).toFixed(1), cost: Math.round(econ.day.drone) }; }));
  finish('drone');
}
console.log('wall time', ((Date.now() - t0) / 60000).toFixed(1), 'min');
console.log(errs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
