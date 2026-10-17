// 新玩法的影片：node tests/clips_modes.mjs allfly|alldrone
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
import { execFileSync } from 'child_process';
const MODE = process.argv[2] || 'allfly', PART = process.argv[3] || 'all';
const W = 960, H = 540, FPS = 24, HASH = '#clip,noaa,mode=' + MODE;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true).catch(() => false);
page.setDefaultTimeout(300000);
const URL = 'http://localhost:8768/index.html' + HASH;

async function boot() {
  await page.goto('about:blank'); await page.goto(URL);
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
  await ev((mode) => { const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
    localStorage.clear(); localStorage.setItem('taipei-commute-v2-' + mode, JSON.stringify({ v: 2, cfg: { di, home, work }, day: 3, econ: { money: 3000000, owned: ['nav'] } })); }, MODE);
  await page.goto('about:blank'); await page.goto(URL);
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
  await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
  await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
  await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
  await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
  await wait(600); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
  await page.keyboard.press('Enter'); await until(() => !window.__tc.G.seatAdj, null, 30000); await wait(800);
  await ev(() => { document.getElementById('help').hidden = true; let c = document.getElementById('clipCap'); if (!c) { c = document.createElement('div'); c.id = 'clipCap'; c.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:50;background:rgba(10,12,16,.78);color:#fff;font:900 21px/1.35 "Noto Sans TC",sans-serif;padding:8px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.2);white-space:nowrap;pointer-events:none'; document.body.appendChild(c); } c.textContent = ''; c.hidden = true; });
}
const cap = (t) => ev((t) => { const c = document.getElementById('clipCap'); c.textContent = t; c.hidden = !t; }, t);
const keys = (...k) => ev((k) => { const I = window.__tc.input; for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) I.keys.delete(c); for (const c of k) I.keys.add(c); }, k);
const press = (code) => ev((c) => window.__tc.input.hit.add(c), code);
let frameNo = 0, dir = '', CDP = null;
function startRec(name) { dir = `build/frames/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); frameNo = 0; }
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
async function recUntil(cond, max, sub = 2, arg) { return rec(max, sub, async () => await ev(cond, arg)); }
function finish(name) {
  const out = `build/clips/${name}.mp4`; fs.mkdirSync('build/clips', { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'medium', '-movflags', '+faststart', out]);
  console.log(name, frameNo, 'frames', (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
}
/** 找住家附近有紅綠燈的大馬路，把車放在路段起點、車道上，面向路口。 */
async function toMainRoad() {
  const t = await ev(() => {
    const { world, car } = window.__tc; let best = null;
    world.forEdgesNear(car.x, car.z, 1000, (e) => {
      if (e.cls < 1 || e.cls > 2 || e.bridge || e.tunnel || e.len < 170 || !e.sigB) return;
      const p = e.pts, L0 = Math.hypot(p[2] - p[0], p[3] - p[1]); if (L0 < 40) return;
      const ux = (p[2] - p[0]) / L0, uz = (p[3] - p[1]) / L0, off = e.oneway ? 0.5 * e.laneW - (e.width - 1) / 2 : 0.5 * e.laneW;
      const x = p[0] + ux * 25 - uz * off, z = p[1] + uz * 25 + ux * off, d = Math.hypot(x - car.x, z - car.z);
      if (!best || d < best.d) best = { x, z, psi: Math.atan2(-ux, -uz), d, name: e.name, len: e.len, lanes: e.lanesDir };
    });
    return best;
  });
  console.log('main road', t);
  await ev(([x, z, psi]) => { const { car, world, stunts, econ } = window.__tc; if (stunts) stunts.reset(); econ.stuntFuel = 1; car.place(x, z, psi, world.groundAt(x, z)); }, [t.x, t.z, t.psi]);
  await ev(() => { window.__tc.manual = false; });
  await until(([x, z]) => window.__tc.world.readyAround(x, z, 300) && window.__tc.parking.readyAround(x, z, 150), [t.x, t.z], 200000);
  return t;
}
const t0 = Date.now();
await boot();

if (MODE === 'allfly') {
  const road = await toMainRoad();
  // 先讓車流跑一段時間（排隊、開始飛越）
  await ev(() => { window.__tc.noRender = true; window.__tc.steps = 4; }); await wait(25000);
  await ev(() => { window.__tc.noRender = false; window.__tc.steps = 1; window.__tc.manual = true; window.__tc.G.cam = 'chase'; });
  console.log('traffic', await ev(() => { const t = window.__tc.traffic; return { cars: t.cars.length, hops: t.hops, crashes: t.crashes, inAir: t.cars.filter(c => c.hop).length }; }));
  // 1. 俯瞰：繞著路口轉
  await ev(() => {
    const { car } = window.__tc; const cx = car.x - Math.sin(car.psi) * -60, cz = car.z - Math.cos(car.psi) * -60; // 前方 60 m
    const base = { x: car.x - Math.sin(car.psi) * 70, z: car.z - Math.cos(car.psi) * 70, y: car.y };
    let th = car.psi + 0.9;
    window.__tc.camHook = (cam) => { th += 0.0016; cam.up.set(0, 1, 0); cam.position.set(base.x + Math.sin(th) * 95, base.y + 48, base.z + Math.cos(th) * 95); cam.lookAt(base.x, base.y + 2, base.z); };
  });
  startRec('mode_allfly');
  await cap('全城飛天跑車：每台車塞住 1.5 秒就飛越車陣（遊戲設定）');
  await rec(216);
  await cap('落地的空位大家搶：飛的時候空位被占走，就壓在別台車上');
  await rec(168);
  // 2. 主角：開過去、塞住就飛越
  await ev(() => { window.__tc.camHook = null; });
  await cap('你也是飛天跑車：開到車陣後面，按 F 飛越'); await keys('KeyW');
  let stopped = 0;
  await rec(260, 2, async (i) => { const v = await ev(() => window.__tc.car.v); if (i > 30 && v < 0.6) stopped++; if (v > 9) await keys(); else if (v < 4 && stopped === 0) await keys('KeyW'); return stopped > 30; });
  await keys(); await press('KeyF'); await rec(8);
  await recUntil(() => window.__tc.stunts.mode !== 'air', 220);
  await cap('落地後繼續往前開'); await keys('KeyW'); await rec(72); await keys();
  finish('mode_allfly');
  console.log('traffic after', await ev(() => { const t = window.__tc.traffic; return { cars: t.cars.length, hops: t.hops, crashes: t.crashes }; }));
}

if (MODE === 'alldrone') {
  const road = await toMainRoad();
  await until(() => window.__tc.drones && window.__tc.drones.dense && window.__tc.drones.list.length > 100, null, 60000);
  await ev(() => { window.__tc.noRender = true; window.__tc.steps = 2; }); await wait(8000);
  await ev(() => { window.__tc.noRender = false; window.__tc.steps = 1; window.__tc.manual = true; window.__tc.G.cam = 'chase'; });
  const n = await ev(() => window.__tc.drones.list.length);
  console.log('sky', n, await ev(() => window.__tc.drones.roadCars));
  startRec('mode_alldrone');
  if (PART === 'all' || PART === 'road') {
    // 1. 空蕩蕩的路，抬頭看天空
    await ev(() => { const { car } = window.__tc; window.__tc.camHook = (cam) => { const fx = -Math.sin(car.psi), fz = -Math.cos(car.psi); cam.up.set(0, 1, 0); cam.position.set(car.x - fx * 8, car.y + 2.4, car.z - fz * 8); cam.lookAt(car.x + fx * 40, car.y + 26, car.z + fz * 40); }; });
    await cap(`全城無人機：路上沒有車，附近 1.3 公里內 ${n.toLocaleString()} 架都在天上`);
    await keys('KeyW'); await rec(150, 2, async () => { const v = await ev(() => window.__tc.car.v); if (v > 12) await keys(); else if (v < 9) await keys('KeyW'); });
    await keys('KeyS'); await rec(30); await keys();
    // 2. 高處看 6 個高度層
    await ev(() => { const { car } = window.__tc; const fx = -Math.sin(car.psi), fz = -Math.cos(car.psi), b = { x: car.x, y: car.y, z: car.z }; let k = 0;
      window.__tc.camHook = (cam) => { k += 1; const a = car.psi + 1.2 + k * 0.0012; cam.up.set(0, 1, 0); cam.position.set(b.x + Math.sin(a) * 260, b.y + 70, b.z + Math.cos(a) * 260); cam.lookAt(b.x, b.y + 135, b.z); }; });
    await cap('6 個高度層（90～190 m）：依航向分層，同一層大致同方向飛（遊戲設定）');
    await rec(150);
    await ev(() => { window.__tc.camHook = null; const c = window.__tc.car; c.v = 0; c.thrF = 0; });
  }
  // 3. 進入無人機系統飛到目的地
  await cap('按 U 進入無人機系統：旋翼伸出來'); await press('KeyU'); await rec(40);
  let last = '';
  const dyn = (fn) => async () => { const s = await ev(() => { const f = window.__tc.flight; return { a: f.active, ph: f.phase, held: f.held, v: Math.hypot(f.vx, f.vz), d: Math.hypot(f.spot.x - f.x, f.spot.z - f.z) }; }); const r = fn(s); if (r === true) return true; if (r && r !== last) { last = r; await cap(r); } };
  await rec(500, 8, dyn((s) => s.ph !== 'lift' ? true : s.held ? '等上面這一層的車流讓出空檔（系統讓那一層的車繞開）（4 倍速）' : '垂直爬升，穿過下面幾層的車流（4 倍速）'));
  await rec(900, 16, dyn((s) => s.ph !== 'cruise' || s.d < 450 ? true : s.v < 30 ? '空中也會塞車：同一層跟前車保持 80 m（8 倍速）' : '巡航：DAA 避撞（8 倍速）'));
  await rec(400, 8, dyn((s) => ['hover', 'descend'].includes(s.ph) || !s.a ? true : '接近目的地，減速（4 倍速）'));
  await rec(900, 6, dyn((s) => !s.a ? true : s.held ? '下降前，等下面那一層讓出空檔（3 倍速）' : '垂直下降，穿過下面幾層（3 倍速）'));
  await cap('降落完成，旋翼收回'); await rec(48);
  console.log('flight', await ev(() => { const f = window.__tc.flight; return { flyMin: +(f.flySec * 0.1).toFixed(1), liftWait: +(f.liftWait * 0.1).toFixed(1), crossWait: +(f.crossWait * 0.1).toFixed(1), jam: +(f.jamSec * 0.1).toFixed(1) }; }));
  finish('mode_alldrone');
}
console.log('wall time', ((Date.now() - t0) / 60000).toFixed(1), 'min');
console.log(errs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
