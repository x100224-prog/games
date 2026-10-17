// 台北上班路 — 主程式。每天：房間起床 → 走到路邊的車 → 開去公司 → 停進合法車格 → 走進公司打卡
// → 下班走回車上 → 開回家 → 停好車走進家門 → 結算收入（每趟 20 萬）與花費。賺的錢可以在商店買導航、電動車、飛天跑車、無人機飛行系統。
// 走路是第三人稱，開車是第一人稱駕駛座（含左右後照鏡、座椅調整、舒適設定）。
import * as THREE from '../lib/three.module.min.js';
import { World, hash2 } from './world.js';
import { Parking } from './parking.js';
import { Traffic, FLYER } from './traffic.js';
import { PlayerCar, Cockpit, carSpec, ROADSTER_JETS } from './vehicles.js';
import { Mist } from './mist.js';
import { Input } from './input.js';
import { Avatar } from './avatar.js';
import { ThirdPersonCam } from './tpcam.js';
import { SignManager, genShopName, genVerticalName } from './signs.js';
import { Music } from './music.js';
import { EngineSound } from './engine.js';
import { Nav, polyProgress, nextTurn } from './nav.js';
import { Stunts } from './stunts.js';
import { DroneTraffic, DroneFlight, DRONE, overheadAt } from './drone.js';
import { Control } from './control.js';
import { DenseSky, SKY } from './sky.js';
import { DemoRunner, DEMOS } from './demo.js';
import { Economy, SHOP, priceOf, store, PAY, SAVED_MEASURED, SAVED_NOTE, AIR, GAME_MODES } from './economy.js';
import { VIEW, TIME, PARK, WORK_DIST, RUSH, FEATURES } from './config.js';

const $ = (id) => document.getElementById(id);
// 目前已經做好、可以買的項目（其他的會顯示「製作中」）
const READY = { nav: true, ev: true, roadster: true, drone: true };

// ===================================================================== 場景與光線
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !location.hash.includes('noaa'), powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const HAZE = new THREE.Color(0xd5d9d8);
scene.fog = new THREE.Fog(HAZE, VIEW.fogNear, VIEW.fogFar);
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 2600);
const sky = new THREE.Mesh(new THREE.SphereGeometry(2300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x4f86c6) }, mid: { value: new THREE.Color(0xa9c4dd) }, hor: { value: new THREE.Color(0xe3e2d6) }, sunDir: { value: new THREE.Vector3() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vP;
    void main(){ vec3 d = normalize(vP); float h = d.y;
      vec3 c = h < 0.0 ? hor : mix(mix(hor, mid, smoothstep(0.0, 0.14, h)), top, smoothstep(0.14, 0.65, h));
      float s = max(0.0, dot(d, normalize(sunDir)));
      c += vec3(1.0, 0.86, 0.62) * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -1; scene.add(sky);
const hemi = new THREE.HemisphereLight(0xcfe0f2, 0x6a5f50, 1.05); scene.add(hemi);
// 早上太陽在東南方，傍晚在西方、偏暖色
const SUN = {
  am: { dir: new THREE.Vector3(0.62, 0.5, 0.36).normalize(), color: 0xfff1d8, i: 2.4, hor: 0xe3e2d6, hemi: 1.05 },
  pm: { dir: new THREE.Vector3(-0.72, 0.3, 0.2).normalize(), color: 0xffcf96, i: 2.1, hor: 0xf0cfa8, hemi: 0.9 },
};
const SUN_DIR = new THREE.Vector3();
const sun = new THREE.DirectionalLight(0xffe4bd, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 10, far: 520 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
scene.add(sun); scene.add(sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: 0xa9aaa4 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -15; scene.add(ground);

function makeBeacon(color, r) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 90, 18, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.y = 45; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.75, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; g.add(ring);
  g.visible = false; scene.add(g); return g;
}
const destBeacon = makeBeacon(0xf5c518, 3.4), carBeacon = makeBeacon(0x6fd3ff, 2.2);
const bayMarks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }), 48);
bayMarks.count = 0; bayMarks.frustumCulled = false; bayMarks.renderOrder = 3; scene.add(bayMarks);
bayMarks.setColorAt(0, new THREE.Color(1, 1, 1));
// 導航路線：畫在路面上的藍線
const routeLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
routeLine.frustumCulled = false; routeLine.renderOrder = 2; routeLine.visible = false; scene.add(routeLine);

// ===================================================================== 房間（另一個小場景，第三人稱）
function buildRoom() {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x1a1d22);
  s.add(new THREE.HemisphereLight(0xfff4e6, 0xcfc2ae, 2.6));
  const lamp = new THREE.PointLight(0xffe2b8, 14, 10, 1.3); lamp.position.set(0, 2.5, 0); s.add(lamp);
  const win = new THREE.DirectionalLight(0xcfe6ff, 2.2); win.position.set(1, 0.6, -0.3); s.add(win);
  const W = 4.4, D = 5.6, H = 2.7, boxes = [];
  const M = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, x, y, z, c, solid = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); s.add(m); if (solid) boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: y + h / 2 }); return m; };
  const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [M(0xe6e1d8), M(0xe6e1d8), M(0xf3f1ec), M(0x9b7b5e), M(0xdcd6cb), M(0xdcd6cb)]);
  shell.material.forEach(m => { m.side = THREE.BackSide; }); shell.position.y = H / 2; s.add(shell);
  box(1.5, 0.45, 2.05, -1.42, 0.23, 1.72, 0x6e7f99);               // 床
  box(1.5, 0.12, 0.5, -1.42, 0.5, 2.5, 0xf4f2ec, false);           // 枕頭
  box(1.5, 0.9, 0.08, -1.42, 0.7, 2.76, 0x5a4636, false);          // 床頭板
  box(0.62, 0.75, 1.3, -1.88, 0.38, -1.2, 0x8a6a4c);               // 書桌
  box(0.05, 0.36, 0.6, -2.0, 1.0, -1.2, 0x1d2126, false);          // 電腦螢幕（商店）
  box(0.45, 0.45, 0.45, -1.35, 0.25, -1.2, 0x30343a);              // 椅子
  box(0.62, 2.1, 1.6, 1.88, 1.05, 1.6, 0xc9b79c);                  // 衣櫃
  box(1.6, 0.02, 1.2, 0, 0.01, 0.2, 0x9c4f45, false);              // 地毯
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ color: 0xcfe8ff }));
  glass.position.set(2.19, 1.55, -0.6); glass.rotation.y = -Math.PI / 2; s.add(glass);
  box(0.95, 2.06, 0.06, 1.2, 1.03, -2.78, 0x7a5a3d, false);        // 門
  box(0.06, 0.06, 0.08, 0.86, 1.0, -2.72, 0xd8c690, false);
  const label = (text, bg, x, y, z, ry, w = 0.7) => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 84);
    g.fillStyle = '#fff'; g.font = '900 46px "Noto Sans TC", "PingFang TC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.position.set(x, y, z); m.rotation.y = ry; s.add(m);
  };
  label('出 門 →', '#0b6b4f', 1.2, 2.3, -2.77, 0);
  label('商店', '#8a5a00', -1.97, 1.45, -1.2, Math.PI / 2, 0.5);
  return { scene: s, boxes, door: { x: 1.2, z: -2.45 }, desk: { x: -1.25, z: -0.45 }, W, D, H };
}
const room = buildRoom();

// ===================================================================== 狀態
const input = new Input(canvas, $('touch'));
const music = new Music({ key: 'taipei-music', rapUrl: null, cyberUrl: 'audio/cyber.mp3' });
for (const [id, code] of [['btnMirL', 'KeyZ'], ['btnMirR', 'KeyX']]) {
  const el = $(id); if (!el) continue;
  el.addEventListener('touchstart', (e) => { input.keys.add(code); e.preventDefault(); }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) el.addEventListener(ev, (e) => { input.keys.delete(code); e.preventDefault(); }, { passive: false });
}
// 手機：不常用的功能收在「⋯」選單裡
let mirrorBtns = false;   // 手機：後照鏡按鈕要不要顯示（在「⋯」裡切換）
if ($('btnMore')) {
  const tog = (e) => { e.preventDefault(); $('moreMenu').hidden = !$('moreMenu').hidden; };
  $('btnMore').addEventListener('touchstart', tog, { passive: false }); $('btnMore').addEventListener('click', tog);
  for (const b of $('moreMenu').querySelectorAll('button')) b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'mirror') { mirrorBtns = !mirrorBtns; b.textContent = `後照鏡按鈕：${mirrorBtns ? '開' : '關'}`; }
    else if (a === 'music') $('btnMusic').click();
    else if (a === 'sfx') $('btnSfx').click();
    else { input.hit.add(a); if (a === 'KeyV' && car && Math.abs(car.v) > 0.3) toast('停下來才能調座椅', 1.5); }
    $('moreMenu').hidden = true;
  });
}
for (const [id, code] of [['btnCenter', 'KeyR'], ['btnJump', 'KeyF'], ['btnGrip', 'KeyG'], ['btnFlip', 'KeyT'], ['btnDrone', 'KeyU']]) if ($(id)) $(id).addEventListener('touchstart', (e) => { input.hit.add(code); e.preventDefault(); }, { passive: false });
if ($('btnBoost')) {   // 推進器：按住
  $('btnBoost').addEventListener('touchstart', (e) => { input.keys.add('ShiftLeft'); e.preventDefault(); }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) $('btnBoost').addEventListener(ev, (e) => { input.keys.delete('ShiftLeft'); e.preventDefault(); }, { passive: false });
}
const engine = new EngineSound('gas');
music.keepAlive = () => engine.on;
const sfxBtn = () => { const b = $('btnSfx'); if (b) { b.textContent = engine.on ? '引擎聲 開' : '引擎聲 關'; b.setAttribute('aria-pressed', engine.on ? 'true' : 'false'); } };
engine.onChange = sfxBtn;
function audioStart() { music.start(); if (music.ctx) { engine.attach(music.ctx); if (engine.on) music.ctx.resume(); } }
const musicBtn = () => { const b = $('btnMusic'); if (b) { b.textContent = music.on ? '♪ 音樂 開' : '♪ 音樂 關'; b.setAttribute('aria-pressed', music.on ? 'true' : 'false'); } };
music.onChange = musicBtn;

const econ = new Economy();
const G = {
  state: 'boot', cam: 'cockpit', phase: 'room', leg: 'am', parked: null, clock: TIME.startMin, dayN: 1,
  cfg: { di: -1, home: null, work: null }, menuAngle: 0, menuCenter: { x: 0, z: 0 }, menuTarget: { x: 0, z: 0, r: 520, h: 300 },
  homeCar: null, route: null, routePoly: null, routeIdx: 0,
  mode: (() => { const h = location.hash.match(/mode=(\w+)/); if (h && GAME_MODES[h[1]]) return h[1]; try { const m = localStorage.getItem('taipei-commute-mode'); if (m && GAME_MODES[m]) return m; } catch (err) { /* ignore */ } return 'normal'; })(),
};
/** 新玩法解鎖了沒：一般模式擁有飛天跑車＋無人機飛行系統（買到時記下來，之後開新遊戲也不會再鎖）。 */
const UNLOCK_KEY = 'taipei-commute-unlock';
function modesUnlocked() {
  if (FEATURES.unlockModes) return true;
  try {
    if (localStorage.getItem(UNLOCK_KEY) === '1') return true;
    const sv = JSON.parse(localStorage.getItem(GAME_MODES.normal.save) || 'null'), o = (sv && sv.econ && sv.econ.owned) || [];
    if (o.includes('roadster') && o.includes('drone')) { localStorage.setItem(UNLOCK_KEY, '1'); return true; }
  } catch (err) { /* ignore */ }
  return false;
}
if (G.mode !== 'normal' && !modesUnlocked()) G.mode = 'normal';
store.setMode(G.mode);
const P = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, inRoom: false };
let world, parking, traffic, signs, car, cockpit, avatar, tp, meta, nav = null, stunts = null, drones = null, flight = null, statics = [];
let droneCity = null, droneSky = null;   // 一般：全市千分之一的無人機；全城無人機：你附近的整片天空
let ctl = null;   // 玩法「全城無人機・路空總控」的總控中心
const mist = new Mist(scene);   // 壓縮空氣噴出的白霧
window.__tc = { G, P, renderer, scene, camera, econ, engine, input };
if (location.hash.startsWith('#lowq')) { renderer.shadowMap.enabled = false; renderer.setPixelRatio(0.75); }
if (location.hash.startsWith('#clip')) { renderer.setPixelRatio(1); if (location.hash.includes('ns')) renderer.shadowMap.enabled = false; if (location.hash.includes('pcf')) renderer.shadowMap.type = THREE.PCFShadowMap; }   // 錄影：解析度 1 倍

function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
const fmtClock = (m) => { m = Math.floor(m); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const fmtDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
// 金額：一萬以上用「萬」顯示（例：40 萬、2.5 萬、800 萬），小額用元
const fmtMoney = (n) => {
  const a = Math.abs(Math.round(n)), sg = n < 0 ? '−' : '';
  if (a >= 10000) { const w = Math.round(a / 100) / 100; return sg + w.toLocaleString('zh-TW', { maximumFractionDigits: 2 }) + ' 萬'; }   // 例：39.97 萬
  return sg + a.toLocaleString('zh-TW') + ' 元';
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const districtName = (i) => meta.districts[i] ? meta.districts[i].name : '';
let toastT = 0;
function toast(msg, sec = 3) { const t = $('toast'); t.textContent = msg; t.hidden = false; toastT = uiTime + sec; placeToast(); }
/** 總控卡片開著時，提示訊息如果跟卡片重疊，就移到卡片下面。 */
function placeToast() {
  const t = $('toast'), c = $('ctlCard'); t.style.top = '';
  if (!c || c.hidden || t.hidden) return;
  const a = c.getBoundingClientRect(), b = t.getBoundingClientRect();
  if (a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top) t.style.top = Math.round(a.bottom + 8) + 'px';
}
function setPrompt(html, cls = '') { const p = $('prompt'); if (!html) { p.hidden = true; return; } if (p._h !== html) { p.innerHTML = html; p._h = html; } p.className = cls; p.hidden = false; }
function fadeThen(fn, hold = 60) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), hold); }, 360); }
const dest = () => G.leg === 'am' ? G.cfg.work : G.cfg.home;
const destName = () => G.leg === 'am' ? G.cfg.work.n : '家';

// ===================================================================== 啟動
async function boot() {
  resize();
  $('loadText').textContent = '載入台北市地圖…';
  try { const r = await fetch('data/meta.json'); if (!r.ok) throw new Error('HTTP ' + r.status); meta = await r.json(); }
  catch (err) { $('loadText').textContent = '地圖資料載入失敗'; $('loadSub').textContent = '請透過網頁伺服器開啟這個資料夾（不要直接雙擊 HTML 檔）。'; return; }
  world = new World(scene, meta, '');
  parking = new Parking(scene, world);
  traffic = new Traffic(scene, world);
  signs = new SignManager(scene);
  world.onCellReady.push((c) => {
    if (!c.signs) return;
    for (const s of c.signs) if (!s.text) s.text = s.vertical ? genVerticalName(s.seed) : genShopName(s.seed, s.cat);
    signs.addCell(c, c.signs);
  });
  world.onCellUnload.push((c) => signs.removeCell(c));
  for (const m of world.root.children) m.castShadow = false;
  parking.onDecorated = (cell) => {
    if (!G.cfg.work || G.state === 'menu') return;
    const C = world.CELL, cx = (cell.cx + 0.5) * C, cz = (cell.cz + 0.5) * C;
    if (G.cfg.home && Math.hypot(cx - G.cfg.home.x, cz - G.cfg.home.z) < 700) parking.ensureFreeNear(G.cfg.home.x, G.cfg.home.z, 3);
    if (Math.hypot(cx - G.cfg.work.x, cz - G.cfg.work.z) < 700) workParking();
  };
  tp = new ThirdPersonCam(camera);
  Object.assign(window.__tc, { world, parking, traffic, signs, tp, meta });
  Nav.load('data/nav.json').then(n => {
    nav = n; window.__tc.nav = n;
    // 全市會用無人機飛行系統的車（千分之一）：一直在全市飛，靠近你的才畫出來
    droneCity = drones = new DroneTraffic(scene, world, nav, RUSH.factor); drones.statics = statics; window.__tc.drones = drones;
    applyMode();
  }).catch(err => console.warn('nav load failed', err));
  // 超高大樓（台北 101 等）：無人機要繞開
  for (const lm of meta.landmarks || []) {
    const n = lm.pts.length / 2; let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += lm.pts[i * 2]; cz += lm.pts[i * 2 + 1]; } cx /= n; cz /= n;
    let r = 0; for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(lm.pts[i * 2] - cx, lm.pts[i * 2 + 1] - cz));
    statics.push({ x: cx, z: cz, r, top: (lm.base || 0) + lm.h, name: lm.n });
  }
  avatar = await Avatar.load('models/hero.json');
  if (avatar) avatar.attach(scene);
  window.__tc.avatar = avatar;
  if (!avatar) setTimeout(() => toast('人物模型載入失敗：' + (Avatar.lastError || '未知原因'), 12), 4000);
  const pj = meta.proj, tx = (121.5170 - pj.lon0) * pj.mlon, tz = -(25.0478 - pj.lat0) * pj.mlat;
  G.menuCenter = { x: tx, z: tz }; Object.assign(G.menuTarget, { x: tx, z: tz });
  buildMenu();
  $('btnMusic').onclick = () => { audioStart(); music.toggle(); }; musicBtn();
  $('btnSfx').onclick = () => { audioStart(); engine.toggle(); }; sfxBtn();
  G.state = 'menu'; $('loading').hidden = true;
  { const dm = location.hash.match(/demo-(\w+)/); if (dm && DEMOS.some(d => d.key === dm[1])) setTimeout(() => startDemo(dm[1]), 300); }   // 網址 #demo-boost 等：直接看示範
  requestAnimationFrame(loop);
}

// ===================================================================== 選單
function buildMenu() {
  const svg = $('distMap'), [x0, z0, x1, z1] = meta.bounds, pad = 400;
  svg.setAttribute('viewBox', `${x0 - pad} ${z0 - pad} ${x1 - x0 + pad * 2} ${z1 - z0 + pad * 2}`);
  svg.innerHTML = '';
  meta.districts.forEach((d, i) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d.poly.map(r => 'M' + r.reduce((s, v, k) => s + (k % 2 ? ',' : (k ? ' L' : '')) + v, '') + 'Z').join(''));
    path.setAttribute('tabindex', '0'); path.setAttribute('role', 'button'); path.setAttribute('aria-label', d.name);
    path.dataset.i = i;
    path.addEventListener('click', () => pickDistrict(i));
    path.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickDistrict(i); } });
    svg.appendChild(path);
  });
  meta.districts.forEach((d) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', d.c[0]); t.setAttribute('y', d.c[1] + 260); t.textContent = d.name.replace('區', '');
    svg.appendChild(t);
  });
  renderModes(); renderDemos();
  $('demoExit').onclick = () => endDemo();
  $('homeMore').onclick = () => { G.homePage = (G.homePage || 0) + 1; renderHomes(); };
  $('workMore').onclick = () => { G.workSeed = (G.workSeed || 0) + 1; renderWorks(); };
  $('btnGo').onclick = () => newGame();
  $('btnAuto').onclick = () => { startAuto(); autoPick(); newGame(); };
  refreshContinue();
  $('btnNext').onclick = () => { $('summary').hidden = true; G.dayN++; startDay(); };
  $('btnMenu').onclick = () => { $('summary').hidden = true; toMenu(); };
  $('btnSumShop').onclick = () => openShop();
  $('shopClose').onclick = () => closeShop();
  $('bigClose').onclick = () => toggleBigMap(false);
}
// 玩法：一般／全城飛天跑車／全城無人機（各自的存檔）
function renderModes() {
  const box = $('modeOpts'); if (!box) return; box.innerHTML = '';
  const open = modesUnlocked();
  for (const M of Object.values(GAME_MODES)) {
    const locked = M.key !== 'normal' && !open;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt mode' + (G.mode === M.key ? ' on' : '') + (locked ? ' locked' : '');
    b.innerHTML = `<b>${M.name}${locked ? '　（未解鎖）' : ''}</b><span class="sub">${locked ? '在一般模式買了飛天跑車和無人機飛行系統後解鎖。' : M.desc}</span>`;
    if (locked) { b.disabled = true; box.appendChild(b); continue; }
    b.onclick = () => { G.mode = M.key; try { localStorage.setItem('taipei-commute-mode', M.key); } catch (err) { /* ignore */ } store.setMode(M.key); renderModes(); refreshContinue(); };
    box.appendChild(b);
  }
  const t = $('carText'); if (t) t.textContent = G.mode === 'allfly' ? '這個世界每台車都是飛天跑車：你一開始就有一台（壓縮空氣滿罐可以飛越 8 次，遊戲設定）。可以再買導航、無人機飛行系統。'
    : G.mode === 'alldrone' ? '這個世界每台車都進入無人機系統：你一開始就有飛天跑車和無人機飛行系統（按 U 升空）。天上的車只模擬你附近 1.3 公里內，數量跟尖峰時那一帶路上的車一樣多。'
    : G.mode === 'hybrid' ? '每台車都有無人機系統，但路上也照樣有車在開：總控中心依「開車和飛哪個快」分配，飛的人越多，路上越空、目的地降落越要排隊。你一開始就有飛天跑車和無人機飛行系統，想飛時按 U 問總控。'
    : '一開始開油車。存錢在商店買導航（約 55 萬）、電動車（約 206 萬）、飛天跑車（約 800 萬）；有了飛天跑車，才能再加裝無人機飛行系統（約 410 萬）。';
}
// ===================================================================== 看示範
let demo = null;
function renderDemos() {
  const box = $('demoOpts'); if (!box) return; box.innerHTML = '';
  const open = modesUnlocked();
  for (const D of DEMOS) {
    if (D.mode && !open) continue;   // 新玩法的示範：解鎖後才出現
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt demo';
    b.innerHTML = `<b>${D.name}</b><span class="sub">${D.sub}</span>`;
    b.onclick = () => startDemo(D.key);
    box.appendChild(b);
  }
}
/** 路空總控的示範：公司挑降落點夠多、不會太熱鬧的地方（不然一開始就要排很久，總控會建議繼續開，看不到升空）。 */
function hybridDemoCfg() {
  const base = demoCfg(false), C = new Control(nav), home = base.home;
  const ws = meta.works.map(w => ({ w, d: Math.hypot(w.x - home.x, w.z - home.z) })).filter(o => o.d > 3000 && o.d < 4800).sort((a, b) => a.d - b.d);
  for (const o of ws) { const q = C.area(o.w.x, o.w.z); if (q.spots >= 8 && q.A < 1.2) return { di: base.di, home, work: o.w }; }
  return base;
}
function demoCfg(near) {
  const di = 6, home = meta.homes[di][0];
  const ws = meta.works.map(w => ({ w, d: Math.hypot(w.x - home.x, w.z - home.z) })).filter(o => near ? o.d > 1200 && o.d < 2000 : o.d > 3000 && o.d < 4800).sort((a, b) => a.d - b.d);
  return { di, home, work: (ws[0] || { w: meta.works[0] }).w };
}
function startDemo(key) {
  const D = DEMOS.find(d => d.key === key); if (!D || (D.mode && !modesUnlocked())) return;
  if (!nav || !droneCity) { $('demoCap').hidden = false; $('demoCap').textContent = '載入路網中…'; setTimeout(() => startDemo(key), 500); return; }
  G.demo = { key, prevMode: G.demo ? G.demo.prevMode : G.mode };
  G.mode = D.mode || 'normal';
  econ.reset(); econ.applyMode(G.mode); for (const k of ['nav', 'roadster', 'drone']) econ.owned.add(k); econ.carKey = 'roadster'; econ.stuntFuel = 1;
  G.cfg = D.key === 'hybrid' ? hybridDemoCfg() : demoCfg(!!D.near); G.dayN = 1; G.homeCar = null; G.cam = 'cockpit';
  audioStart(); $('menu').hidden = true; input.enabled = true;
  $('demoExit').hidden = false; demoUi.cap(`看示範：${D.name}　載入中…`);
  startDay();
}
const demoUi = {
  cap(t) { const c = $('demoCap'); c.textContent = t || ''; c.hidden = !t; },
  speed(n) { const b = $('demoSpeed'); b.textContent = `快轉 ×${n}`; b.hidden = n <= 1; },
  done(ok) { demoUi.cap(ok ? '示範結束：可以直接接手開（W A S D），或按「結束示範」回選單' : '示範中斷了：可以自己開，或按「結束示範」回選單'); demo = null; },
};
function demoEnter() {
  G.state = 'drive'; G.phase = 'drive'; G.parked = null; P.inRoom = false;
  $('loading').hidden = true; $('hud').hidden = false; $('help').hidden = true;
  if (input.touch) $('touch').hidden = false;
  if (avatar) avatar.group.visible = false;
  audioStart(); engine.ignite();
  cockpit.lookYaw = 0; cockpit.lookPitch = 0; camera.near = 0.8; camera.updateProjectionMatrix();
  seatShown = true; loadSeat(); applySeat(); planRoute();
  G.stats.leave = G.clock;
  demo = new DemoRunner(window.__tc, demoUi);
  demo.run(G.demo.key);
}
function endDemo() {
  if (demo) demo.cancel(); demo = null;
  window.__tc.camHook = null; window.__tc.steps = 1;
  for (const id of ['demoCap', 'demoSpeed', 'demoExit']) $(id).hidden = true;
  if (G.demo) { G.mode = G.demo.prevMode; store.setMode(G.mode); G.demo = null; }
  if (flight && flight.active) { flight.active = false; flight.phase = 'off'; }
  if (stunts) stunts.reset();
  G.cam = 'cockpit'; G.cfg = { di: -1, home: null, work: null };
  econ.reset(); econ.applyMode(G.mode);
  toMenu(); applyMode(); renderModes();
  for (const id of ['step2', 'step3']) $(id).hidden = true;
  for (const p of $('distMap').querySelectorAll('path')) p.classList.remove('on');
  updateGo();
}
window.__tc.startDemo = startDemo; window.__tc.endDemo = endDemo;
/** 依玩法設定世界：路上車流、別人的飛天跑車、天上的無人機。 */
function applyMode() {
  const m = G.mode;
  if (traffic) {
    traffic.factor = m === 'alldrone' ? 0 : m === 'hybrid' ? RUSH.factor * (1 - (ctl ? ctl.p : 0.9)) : RUSH.factor;   // 全城無人機：路上的車全部飛上天了；路空總控：沒在飛的在路上
    traffic.flyerRate = m === 'allfly' ? 1 : m === 'hybrid' ? 0 : FLYER.rate;
    traffic.hopWait = m === 'allfly' ? 1.5 : FLYER.wait; traffic.hopCool = m === 'allfly' ? 8 : FLYER.cooldown;
  }
  if (nav && droneCity) {
    const sky = m === 'alldrone' || m === 'hybrid';
    if (sky && !droneSky) { droneSky = new DenseSky(scene, world, nav, RUSH.factor); droneSky.statics = statics; }
    if (m === 'hybrid' && !ctl) { ctl = new Control(nav); ctl.startLeg(G.leg || 'am', G.clock || TIME.startMin); if (traffic) traffic.factor = RUSH.factor * (1 - ctl.p); }
    drones = sky ? droneSky : droneCity;
    droneCity.body.visible = droneCity.trim.visible = droneCity.rotors.visible = !sky;
    if (droneSky) {
      droneSky.setVisible(sky); droneSky.share = m === 'hybrid' ? ctl.p : 1;
      // 路空總控：天上的車跟路上的車互相交換（停著的車原地升空、降落的車開進車流）
      droneSky.hybrid = m === 'hybrid' ? {
        take: () => traffic.takeForLift(P.x, P.z, (x, z, y) => !overheadAt(world, x, z, y)),
        lane: (x, z) => traffic.laneAt(x, z),
        give: (d) => traffic.addAt(d.L, d.color),
      } : null;
    }
    window.__tc.drones = drones; window.__tc.droneSky = droneSky; window.__tc.ctl = ctl;
  }
}
window.__tc.applyMode = applyMode;
function refreshContinue() {
  const sv = store.get(), b = $('btnContinue');
  if (sv && sv.cfg && sv.cfg.home && sv.cfg.work) {
    b.hidden = false;
    b.textContent = `繼續${G.mode !== 'normal' ? '（' + GAME_MODES[G.mode].name + '）' : ''}：第 ${sv.day} 天　${sv.cfg.home.a} → ${sv.cfg.work.n}　存款 ${fmtMoney((sv.econ && sv.econ.money) || 0)}`;
    b.onclick = () => { G.cfg = sv.cfg; G.dayN = sv.day; econ.fromJSON(sv.econ); econ.applyMode(G.mode); G.homeCar = sv.homeCar || null; startGame(); };
  } else b.hidden = true;
}
function pickDistrict(i) {
  G.cfg.di = i; G.homePage = 0;
  for (const p of $('distMap').querySelectorAll('path')) p.classList.toggle('on', +p.dataset.i === i);
  const d = meta.districts[i];
  Object.assign(G.menuTarget, { x: d.c[0], z: d.c[1], r: 520, h: 300 });
  $('step2').hidden = false; renderHomes();
  G.cfg.home = null; G.cfg.work = null; $('step3').hidden = true; updateGo();
}
function renderHomes() {
  const list = meta.homes[G.cfg.di] || [], n = 6, page = (G.homePage || 0) % Math.max(1, Math.ceil(list.length / n));
  const box = $('homeOpts'); box.innerHTML = '';
  const dn = districtName(G.cfg.di);
  $('homeHint').textContent = list.some(h => !h.approx) ? '門牌取自開放地圖資料' : '';
  for (const h of list.slice(page * n, page * n + n)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt' + (G.cfg.home === h ? ' on' : '');
    b.innerHTML = `<b>臺北市${dn}${h.a}</b><span class="sub">${h.road ? '門前道路：' + h.road : ''}${h.approx ? '（約略位置）' : ''}</span>`;
    b.onclick = () => { G.cfg.home = h; renderHomes(); Object.assign(G.menuTarget, { x: h.x, z: h.z, r: 170, h: 95 }); $('step3').hidden = false; G.cfg.work = null; renderWorks(); updateGo(); };
    box.appendChild(b);
  }
}
function workCands(h) { return meta.works.filter(w => { const d = Math.hypot(w.x - h.x, w.z - h.z); return d >= WORK_DIST.min && d <= WORK_DIST.max; }); }
function renderWorks() {
  const h = G.cfg.home; if (!h) return;
  const cands = workCands(h), seed = (G.workSeed || 0) * 7919 + Math.round(h.x);
  const scored = cands.map((w, i) => ({ w, r: hash2(i + seed, seed * 3 + 1) })).sort((a, b) => a.r - b.r);
  const pick = [], kinds = new Set();
  for (const { w } of scored) { if (pick.length >= 4) break; if (kinds.has(w.k) && pick.length < 3) continue; kinds.add(w.k); pick.push(w); }
  const box = $('workOpts'); box.innerHTML = '';
  if (!pick.length) { box.innerHTML = '<p class="fine">這個住址附近找不到合適的工作地點，換一個住址試試。</p>'; return; }
  for (const w of pick) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt' + (G.cfg.work === w ? ' on' : '');
    b.innerHTML = `<b>${w.n}</b><span class="meta">${fmtDist(Math.hypot(w.x - h.x, w.z - h.z))}</span><span class="sub">${w.k}・${districtName(w.d)}</span>`;
    b.onclick = () => { G.cfg.work = w; renderWorks(); updateGo(); };
    box.appendChild(b);
  }
}
function updateGo() { $('btnGo').disabled = !(G.cfg.home && G.cfg.work); }
function newGame() { G.dayN = 1; econ.reset(); econ.applyMode(G.mode); G.homeCar = null; startGame(); }

function startGame() {
  audioStart();
  $('menu').hidden = true;
  input.enabled = true;
  startDay();
}
// ===================================================================== 操作說明：一開始只教開車，買了新功能再教
const HELP_BASE = [['W A S D', '走路／開車（油門、煞車、方向盤）'], ['滑鼠', '轉動視角（點一下畫面鎖定游標）'], ['E', '出門、上車、下車、開商店'], ['空白鍵', '手煞車'], ['M', '全市地圖']];
const FEATURE_HELP = {
  nav: { title: '導航', rows: [['藍線', '路面上的藍色線就是建議路線'], ['螢幕', '右下角的車內螢幕會提示下一個轉彎和距離']] },
  ev: { title: '電動車', rows: [['充電', '可以停停車場裡的「電動車專用格」，停著就會充電']] },
  roadster: { title: '飛天跑車', rows: [['Shift', '推進器：約 1 秒破百（手機：推進）'], ['F', '垂直升空，飛越前面的車陣，約 10 台車（手機：飛越）'], ['T', '飛越時空中翻轉，落地前要轉正（手機：翻轉）'], ['G', '面向大樓：吸住外牆往上開；在高架橋下：吸在橋底倒著開；再按一次脫離（手機：吸附）'], ['空氣', '特技都用壓縮空氣，滿罐可飛越 8 次，用完特殊功能停用。開車慢慢補、停電動車充電格快速補、回家補滿（遊戲設定）']] },
  drone: { title: '無人機飛行系統', rows: [['U', '開飛天跑車時按 U：旋翼伸出、升空，自動避撞飛到目的地附近降落；再按一次取消（手機：無人機）'], ['C', '飛行中切換車外／駕駛座視角']] },
  ctl: { title: '路空總控', rows: [['U', '問路空總控：它比較「繼續開」和「飛起來」哪個先到。飛比較快就核准升空、排好降落時段（開著也能問，核准後慢下來停住就自動升空）（手機：問總控）'],
    ['再按 U', '總控建議繼續開、或建議先開等時段時，10 秒內再按一次就照你的意思現在升空'], ['C', '飛行中切換車外／駕駛座視角']] },
};
const FEATURES_ORDER = () => ['nav', 'ev', 'roadster', G.mode === 'hybrid' ? 'ctl' : 'drone'];
const featureOn = (k) => k === 'ctl' ? G.mode === 'hybrid' && econ.has('drone') && !!(car && car.spec.stunt)
  : econ.has(k) && (k === 'nav' || (k === 'ev' ? !!(car && car.spec.electric) : !!(car && car.spec.stunt)));
function renderHelp() {
  const rows = [...HELP_BASE];
  for (const k of FEATURES_ORDER()) if (featureOn(k)) rows.push(...FEATURE_HELP[k].rows);
  $('help').innerHTML = rows.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('') +
    '<kbd>H</kbd><span>收起／打開這張說明</span><span class="more">其他：C 車外視角・Z／X 後照鏡・V 調座椅・N／B 配樂／引擎聲</span>';
}
const TIP_KEY = 'taipei-commute-tips';
function tipsSeen() { try { return JSON.parse(localStorage.getItem(TIP_KEY) || '[]'); } catch (err) { return []; } }
/** 買了新功能、第一次開上路時：跳出一張卡片說明怎麼用。 */
function showTips() {
  if (G.demo || G.state !== 'drive' || G.seatAdj) return;
  const seen = tipsSeen(), k = FEATURES_ORDER().find(x => featureOn(x) && !seen.includes(x));
  if (!k) { $('tipCard').hidden = true; return; }
  const F = FEATURE_HELP[k];
  $('tipTitle').textContent = `新功能：${F.title}`;
  $('tipRows').innerHTML = F.rows.map(([a, b]) => `<kbd>${a}</kbd><span>${b}</span>`).join('');
  $('tipCard').hidden = false; $('help').hidden = true; input.releaseLock();   // 說明卡出現時先收起按鍵說明，一次只看一樣
  $('tipOk').onclick = () => { seen.push(k); try { localStorage.setItem(TIP_KEY, JSON.stringify(seen)); } catch (err) { /* ignore */ } showTips(); };
}
function makeCar(key) {
  const spec = carSpec(key);
  if (car) scene.remove(car.group);
  car = new PlayerCar(scene, world, spec);
  car.onBump = (s) => { if (s > 0.4) toast(s > 1.5 ? '碰！撞到了' : '擦撞', 1.3); };
  car.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  cockpit = new Cockpit(spec);
  cockpit.hemi.intensity = 5.0; cockpit.sun.intensity = 3.2;
  engine.setKind(spec.electric ? 'ev' : 'gas');
  // 飛天跑車：特技系統。特技用空氣罐的壓縮空氣（存檔裡的 stuntFuel，0..1）；用完特殊功能就停用。
  // 補氣的錢在補的時候算（回家補、充電格補）；開車時慢慢補用的是車子的電。
  stunts = spec.stunt ? new Stunts(car, world, {
    fuel: () => econ.stuntFuel,
    burn: (f) => { if (econ.stuntFuel <= 1e-4 || (f > 0.005 && econ.stuntFuel < f - 1e-6)) return false; econ.stuntFuel = Math.max(0, econ.stuntFuel - f); return true; },
    regen: (d) => { if (econ.stuntFuel >= 1) return; const add = Math.min(1 - econ.stuntFuel, d / 1000 * AIR.drivePerKm); econ.stuntFuel += add; car.energy = Math.max(0, car.energy - add * AIR.driveKwhPerTank); G.airRegenT = 1.5; },
    toast: (m, sec) => toast(m, sec),
    crash: (fee, msg) => { econ.addRepair(fee); toast(`${msg}　修車費 ${fmtMoney(fee)}`, 2.8); },
    bump: (st) => car._bump(st),
  }) : null;
  flight = new DroneFlight(car, world, {
    toast: (m, sec) => toast(m, sec), cost: (f) => econ.addDrone(f), traffic: () => traffic, dest: () => dest(), gameMinPerSec: () => TIME.scale / 60,
    now: () => ctl ? ctl.t : 0, roads: () => G.mode === 'hybrid',
  });
  window.__tc.car = car; window.__tc.cockpit = cockpit; window.__tc.stunts = stunts; window.__tc.flight = flight;
  applyComfort();
}
function toMenu() {
  input.enabled = false; input.releaseLock(); engine.shutdown();
  G.state = 'menu'; $('hud').hidden = true; $('menu').hidden = false; $('touch').hidden = true;
  destBeacon.visible = carBeacon.visible = false; bayMarks.count = 0; routeLine.visible = false;
  traffic.clear(); refreshContinue(); renderModes(); renderDemos(); $('tipCard').hidden = true;
}
/** 公司附近的路邊停車：早上 110 m 內都停滿了，110～260 m 至少留 3 個空格（電動車可以停停車場的電動車格，比較近）。 */
function workParking() {
  const w = G.cfg.work; if (!w || !parking) return;
  if (G.leg === 'am') { parking.rushNear(w.x, w.z, PARK.rushR); parking.ensureFreeNear(w.x, w.z, 3, PARK.rushR); }
  else parking.ensureFreeNear(w.x, w.z, 3);
}
function save() {
  if (G.demo) return;
  if (G.mode === 'normal' && econ.has('roadster') && econ.has('drone')) { try { localStorage.setItem(UNLOCK_KEY, '1'); } catch (err) { /* ignore */ } }
  store.set({ v: 2, cfg: G.cfg, day: G.dayN, econ: econ.toJSON(), homeCar: G.homeCar, gasLeft: G.gasLeft }); }

// ===================================================================== 每日流程
function startDay() {
  const h = G.cfg.home;
  if (!car || car.spec.key !== econ.carKey) makeCar(econ.carKey);
  renderHelp();
  G.state = 'loading'; G.leg = 'am'; G.phase = 'room'; G.parked = null; G.clock = TIME.startMin;
  setSun('am'); applyMode(); ctlReset('am');
  $('hud').hidden = true; $('loading').hidden = false;
  $('loadText').textContent = `第 ${G.dayN} 天｜載入${districtName(G.cfg.di)}街區…`;
  $('loadSub').textContent = '道路、建物、招牌與停車格';
  G.focus = { x: h.x, z: h.z };
  parking.setDay(G.dayN); traffic.clear();
  econ.startDay();
  G.wait = {
    cond: () => world.readyAround(h.x, h.z, 320) && parking.readyAround(h.x, h.z, 210),
    then: () => {
      parking.setDay(G.dayN); workParking();
      let bay = null;
      if (G.homeCar) { const err = {}; bay = parking.bayAt(G.homeCar.x, G.homeCar.z, G.homeCar.psi, err); if (bay) { bay.reserved = true; bay.occupied = false; } }
      if (!bay) bay = parking.pickHomeBay(h.x, h.z, G.dayN);
      if (stunts) stunts.reset();
      if (bay) { car.place(bay.x, bay.z, bay.psi, bay.y); G.homeBay = bay; }
      else { const o = {}; world.nearestEdge(h.x, h.z, 120, e => e.cls >= 4 && !e.bridge, o); const x = o.x ?? h.rx, z = o.z ?? h.rz; car.place(x, z, 0, world.groundAt(x, z)); G.homeBay = null; }
      // 電動車晚上在家充飽；油車沿用昨天剩的油，低於兩成就順路加滿（錢算在油錢裡）
      const sp = car.spec;
      car.energy = sp.capacity;
      if (!sp.electric && typeof G.gasLeft === 'number' && G.gasLeft / sp.capacity >= 0.2) car.energy = G.gasLeft;
      G.stats = { leave: null, odo0: car.odo, bumps0: car.bumps };
      G.legE0 = car.energy;
      if (G.demo) demoEnter(); else enterRoom();
    },
  };
}

function enterRoom() {
  G.state = 'room'; P.inRoom = true;
  P.x = -0.6; P.z = 1.0; P.y = 0; P.yaw = Math.PI * 0.85; tp.yaw = P.yaw; tp.dist = 2.4; tp.curDist = 2.4; tp.pitch = 0.32;
  if (avatar) room.scene.add(avatar.group);
  $('loading').hidden = true; $('hud').hidden = false;
  if (input.touch) $('touch').hidden = false;
  camera.near = 0.05; camera.fov = 62; camera.updateProjectionMatrix();
  const mt = G.mode === 'allfly' ? '（全城飛天跑車：每台車都會飛越車陣）' : G.mode === 'alldrone' ? '（全城無人機：路上幾乎沒車，天上擠滿飛行車）' : G.mode === 'hybrid' ? '（路空總控：想飛先按 U 問總控）' : '';
  toast(`第 ${G.dayN} 天早上 7:30${mt}。走到門口出門上班（書桌的電腦可以開商店）`, 4);
  save();
}
function leaveRoom() {
  fadeThen(() => {
    const h = G.cfg.home;
    G.state = 'walk'; G.phase = 'toCar'; P.inRoom = false;
    if (avatar) scene.add(avatar.group);
    P.x = h.x; P.z = h.z; P.y = world.groundAt(h.x, h.z); P.yaw = Math.atan2(-(car.x - P.x), -(car.z - P.z)); tp.yaw = P.yaw;
    tp.dist = 4.4; tp.curDist = 4.4; tp.pitch = 0.22;
    G.stats.leave = G.clock;
    camera.near = 0.15; camera.updateProjectionMatrix();
    traffic.update(0.016, P.x, P.z, [], true);
    toast(`車停在${G.homeBay && G.homeBay.edge.name ? G.homeBay.edge.name + '的' : ''}路邊，跟著藍色光柱走過去`);
  });
}

let seatShown = false;
function enterCar() {
  fadeThen(() => {
    G.state = 'drive'; G.phase = 'drive'; G.parked = null;
    if (avatar) avatar.group.visible = false;
    audioStart(); engine.ignite();
    cockpit.lookYaw = 0; cockpit.lookPitch = 0;
    camera.near = 0.8; camera.updateProjectionMatrix();
    planRoute();
    if (!seatShown) { seatShown = true; openSeat(); }
    else { loadSeat(); applySeat(); toast(input.touch ? '地圖、後照鏡、視角在右上角「⋯」' : '按住 Z／X 看後照鏡，停車時按 V 調座椅', 2.5); showTips(); }
  });
}

const _err = { along: 0, lat: 0, ang: 0 };
function bayAllowed(b) { return b.type === 'road' || (b.type === 'ev' && !!car.spec.electric); }   // 電動車（含飛天跑車）可以停電動車格
function parkingCheck() {
  const b = parking.bayAt(car.x, car.z, car.psi, _err);
  if (!b) return { bay: null, ok: false, msg: '' };
  if (!bayAllowed(b)) return { bay: b, ok: false, msg: b.type === 'ev' ? '這是電動車專用格，油車不能停' : '停車場車位要月租或計時付費（之後開放）' };
  if (Math.abs(_err.ang) > PARK.angTol) return { bay: b, ok: false, msg: '車身要擺正' };
  if (Math.abs(_err.lat) > PARK.latTol) return { bay: b, ok: false, msg: '壓到格線了，往格子中間一點' };
  if (Math.abs(_err.along) > PARK.posTol) return { bay: b, ok: false, msg: _err.along > 0 ? '再往後一點' : '再往前一點' };
  return { bay: b, ok: true, msg: '已停妥' };
}
function exitCar() {
  if (flight && flight.active) { toast('飛行中不能下車', 1.6); return; }
  if (stunts && stunts.busy) { toast(stunts.mode === 'roof' ? '屋頂上不能下車，先開下去' : '特技中不能下車', 1.6); return; }
  if (Math.abs(car.v) > 0.4) { toast('先停下來才能下車', 1.6); return; }
  const chk = parkingCheck(), near = dist(car, dest()) < 450;
  G.parked = { legal: chk.ok && near, ok: chk.ok, bay: chk.bay, type: chk.bay ? chk.bay.type : null };
  if (chk.bay) { chk.bay.reserved = true; chk.bay.occupied = false; }   // 自己的車停在這格（之後重新佈置車格也不會被別台車占走）
  G.phase = 'toDest'; engine.shutdown(); engine.stunt(0, 0);
  fadeThen(() => {
    const lx = -Math.cos(car.psi), lz = Math.sin(car.psi);
    P.x = car.x + lx * 1.7; P.z = car.z + lz * 1.7; P.y = car.y; P.yaw = car.psi + Math.PI / 2; tp.yaw = car.psi;
    const p = { x: P.x, z: P.z }; if (world.collide(p, 0.4)) { P.x = car.x - lx * 1.7; P.z = car.z - lz * 1.7; }
    if (avatar) avatar.group.visible = true;
    G.state = 'walk'; camera.near = 0.15; camera.updateProjectionMatrix();
    routeLine.visible = false;
    const where = G.leg === 'am' ? '公司' : '家', go = G.leg === 'am' ? '走去公司打卡' : '走回家';
    toast(G.parked.legal ? (chk.bay.type === 'ev' ? `停進電動車格（會順便充電），${go}` : `停好了！${go}`)
      : chk.ok ? `停好了，但離${where}太遠（要 450 m 內）` : chk.msg ? '沒停好：' + chk.msg : '這裡不是停車格');
  });
}

/** 到達公司（早上）或家（晚上）。 */
function arrive() {
  const c = car;
  econ.addEnergy(c.spec, Math.max(0, G.legE0 - c.energy), true);     // 這一趟用掉的油或電
  if (G.leg === 'am') {
    const late = Math.max(0, G.clock - TIME.workMin);
    econ.clockIn(late);
    if (G.parked.type === 'road') econ.addParking('road');
    if (G.parked.type === 'ev') { const need = c.spec.capacity - c.energy; econ.day.charge += need * PAY.bayKwh; c.energy = c.spec.capacity; }
    G.amClock = G.clock;
    G.state = 'work'; setPrompt(''); input.releaseLock();
    const f = $('fade'); $('workText').textContent = late > 0.5 ? `${fmtClock(G.clock)} 打卡，遲到 ${Math.round(late)} 分鐘` : `${fmtClock(G.clock)} 準時打卡`;
    f.classList.add('on'); $('workCard').hidden = false;
    setTimeout(() => {
      // 下班：18:00 從公司門口出來，走回車上
      G.leg = 'pm'; G.phase = 'toCar'; G.clock = TIME.homeMin; setSun('pm'); traffic.clear(); ctlReset('pm');
      const w = G.cfg.work; P.x = w.x; P.z = w.z; P.y = world.groundAt(w.x, w.z); P.yaw = Math.atan2(-(car.x - P.x), -(car.z - P.z)); tp.yaw = P.yaw;
      G.parked = null; G.legE0 = c.energy; G.state = 'walk';
      traffic.update(0.016, P.x, P.z, [], true);
      $('workCard').hidden = true; f.classList.remove('on');
      toast('18:00 下班了，走回車上開回家');
    }, 3200);
  } else { econ.homeTrip(); finishDay(); }
}

function finishDay() {
  const c = car, s = G.stats, km = (c.odo - s.odo0) / 1000, bumps = c.bumps - s.bumps0;
  G.gasLeft = c.spec.electric ? undefined : c.energy;
  G.homeCar = G.parked && G.parked.bay ? { x: G.parked.bay.x, z: G.parked.bay.z, psi: G.parked.bay.psi } : { x: car.x, z: car.z, psi: car.psi };
  // 有飛天跑車：晚上在家用壓縮機把空氣罐補滿（錢算在今天）
  const airHome = econ.has('roadster') ? econ.refillAirHome() : 0;
  const charge = Math.round(econ.day.charge || 0), r = econ.endDay(km);
  G.state = 'summary'; input.releaseLock(); setPrompt('');
  $('sumTitle').textContent = r.late ? `第 ${G.dayN} 天｜遲到 ${r.late} 分鐘` : `第 ${G.dayN} 天｜準時上班`;
  $('sumLead').textContent = `${fmtClock(G.clock)} 回到家。`;
  const rows = [
    ['出門', fmtClock(s.leave || TIME.startMin), ''],
    ['打卡', fmtClock(G.amClock), r.late ? 'bad' : 'good'],
    ['到家', fmtClock(G.clock), ''],
    ['今天開了', km.toFixed(1) + ' km', ''],
    ['擦撞', bumps + ' 次', bumps ? 'bad' : 'good'],
    ['上班這趟', fmtMoney(r.payAm) + (r.late ? `（遲到扣 ${fmtMoney(PAY.trip - r.payAm)}）` : ''), 'good'],
    ['回家這趟', fmtMoney(r.payPm), 'good'],
    [c.spec.electric ? '電費' : '油錢', '−' + fmtMoney(r.energy), ''],
    ['停車／充電', '−' + fmtMoney(r.parking + charge), ''],
  ];
  if (r.stunt) rows.push([airHome > 0.005 ? `壓縮空氣（回家補 ${Math.round(airHome * 100)}%）` : '壓縮空氣補充', '−' + fmtMoney(r.stunt), '']);
  if (r.drone) rows.push(['無人機燃料', '−' + fmtMoney(r.drone), '']);
  if (r.repair) rows.push(['修車', '−' + fmtMoney(r.repair), 'bad']);
  rows.push(['今天淨賺', fmtMoney(r.net), r.net >= 0 ? 'good' : 'bad'], ['存款', fmtMoney(r.money), '']);
  $('sumStats').innerHTML = rows.map(([k, v, cl]) => `<dt>${k}</dt><dd class="${cl}">${v}</dd>`).join('');
  $('summary').hidden = false;
  save();
  if (AUTO) AUTO.done = true;
}

// ===================================================================== 商店
function openShop() {
  input.releaseLock(); input.noLock = true;
  // 從結算畫面打開時，先把結算收起來（不然結算視窗會蓋住商店）
  G.shopFromSummary = !$('summary').hidden; if (G.shopFromSummary) $('summary').hidden = true;
  renderShop(); $('shop').hidden = false;
}
function closeShop() { $('shop').hidden = true; input.noLock = false; if (G.shopFromSummary) { G.shopFromSummary = false; $('summary').hidden = false; } }
function renderShop() {
  $('shopMoney').textContent = fmtMoney(econ.money);
  const box = $('shopList'); box.innerHTML = '';
  for (const it of SHOP) {
    const p = priceOf(it.key), owned = econ.has(it.key), ready = READY[it.key];
    const d = document.createElement('div'); d.className = 'item' + (owned ? ' owned' : '');
    const evNote = it.key === 'ev' && !owned && econ.has('roadster') ? '<p class="saved">你的飛天跑車也是電動車，已經可以停電動車專用格了</p>' : '';
    d.innerHTML = `<div class="ihead"><b>${it.name}</b><span class="price">${owned ? '已擁有' : fmtMoney(p)}</span></div><p>${it.desc}</p>${SAVED_NOTE[it.key] ? `<p class="saved">${SAVED_NOTE[it.key]}</p>` : ''}${evNote}`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'buy';
    if (owned) { b.textContent = '已擁有'; b.disabled = true; }
    else if (!ready) { b.textContent = '製作中'; b.disabled = true; }
    else if (it.requires && !econ.has(it.requires)) { b.textContent = '要先有飛天跑車'; b.disabled = true; }
    else if (econ.money < p) { b.textContent = `還差 ${fmtMoney(p - econ.money)}`; b.disabled = true; }
    else { b.textContent = '購買'; b.onclick = () => { const r = econ.buy(it.key); toast(r.ok ? `${r.msg}：上路時會告訴你怎麼用` : r.msg, 2.8); save(); renderShop(); renderHelp(); }; }
    d.appendChild(b); box.appendChild(d);
  }
  const cars = econ.cars(), names = { gas: '油車', ev: '電動車', roadster: '飛天跑車' };
  const pick = $('shopCars'); pick.innerHTML = '<legend>明天開哪台車</legend>';
  for (const k of cars) {
    const l = document.createElement('label');
    l.innerHTML = `<input type="radio" name="carPick" value="${k}"${econ.carKey === k ? ' checked' : ''}> ${names[k] || k}`;
    l.querySelector('input').onchange = () => { econ.carKey = k; save(); toast(`明天開${names[k]}`, 1.8); };
    pick.appendChild(l);
  }
  pick.hidden = cars.length < 2;
  $('shopNote').textContent = '價錢依「尖峰時段實測，每趟平均省下的時間」：省越多時間越貴，車和加裝功能分開比。車＝基本車價 200 萬＋每趟每省 1 分鐘加 30 萬；加裝功能＝每趟每省 1 分鐘 5 萬。準時上下班一天收入 40 萬。';
}

// ===================================================================== 導航
// ===================================================================== 路空總控（玩法「全城無人機・路空總控」）
// 按 U：總控用全部車子的動向估算「繼續開」和「飛起來」哪個先到。飛比較快就核准升空、排好降落時段；
// 降落要排很久就建議先開、時段快到再升空（地面等待）；開車比較快就建議繼續開。10 秒內再按一次 U＝照你的意思現在升空。
const gmin = (sec) => sec * TIME.scale / 60;
const clockAfter = (sec) => fmtClock(G.clock + gmin(sec));
function ctlReset(leg) {
  G.ctl = null; G.ctlHold = null; G.ctlAuto = null; G.ctlDrive = null; G.ctlShare = null; hideCtlCard();
  if (ctl && G.mode === 'hybrid') ctl.startLeg(leg, leg === 'am' ? TIME.startMin : TIME.homeMin);
}
function ctlTick(dt) {
  ctl.tick(dt, G.clock);
  G.ctlShareT = (G.ctlShareT || 0) - dt;
  if (G.ctlShareT <= 0) {
    G.ctlShareT = 1;   // 每秒依總控的分配調整路上和天上的車
    if (traffic) traffic.factor = RUSH.factor * (1 - ctl.p);
    if (droneSky) droneSky.share = ctl.p;
  }
  if (G.ctlCardT && uiTime > G.ctlCardT) hideCtlCard();   // 卡片看一下就收起來（地面等待的時段改在左上的任務列顯示）
}
function ctlEvaluate() {
  const d = dest(), rt = routeFromCar(d);
  return ctl.evaluate({ x: car.x, z: car.z, v: car.v, g: world.groundAt(car.x, car.z, car.y), dest: d, route: rt, traffic, sky: drones, min: G.clock, gmps: TIME.scale / 60 });
}
function ctlAsk() {
  const now = ctl.t, last = G.ctl;
  // 剛問過（10 秒內）再按一次：照你的意思現在升空
  if (last && last.armed && now - last.at < 10) {
    last.armed = false; const plan = last.plan || ctl.reserve(last.ev);
    hideCtlCard(); ctlLift(plan); return;
  }
  const ev = ctlEvaluate();
  G.ctl = { at: now, ev, armed: false, plan: null }; G.ctlHold = null; G.ctlAuto = null; G.ctlDrive = null;
  if (ev.fly && !ev.holdGround) { G.ctl.plan = ctl.reserve(ev); ctlLift(G.ctl.plan); }
  else if (ev.fly) { G.ctl.plan = ctl.reserve(ev); G.ctl.armed = true; G.ctlHold = { plan: G.ctl.plan, chk: 0 }; }
  else { G.ctl.armed = true; G.ctlDrive = { t0: now, pred: ev.road.sec }; }
  showCtlCard(ev);
}
function ctlLift(plan) {
  G.ctlHold = null; G.ctlDrive = null;
  const msg = flight.canStart(stunts && stunts.busy);
  if (!msg) { hideCtlCard(); flight.start(drones, plan); return; }
  if (Math.abs(car.v) > 3) { G.ctlAuto = { plan, until: ctl.t + 30 }; toast('總控已核准：慢下來停住就自動升空（30 秒內有效）', 3); }
  else toast(msg, 2.5);
}
/** 開車中（每幀）：核准後自動升空、地面等待的時段、開車到了報告預估準不準。 */
function ctlDrive(dt) {
  if (flight.active) { G.ctlAuto = null; G.ctlHold = null; G.ctlDrive = null; return; }
  const A = G.ctlAuto;
  if (A) {
    if (ctl.t > A.until) { G.ctlAuto = null; toast('升空的核准過期了：要飛再按 U 問一次總控', 2.5); }
    else if (Math.abs(car.v) < 0.8) {
      const msg = flight.canStart(stunts && stunts.busy);
      if (!msg) { G.ctlAuto = null; hideCtlCard(); flight.start(drones, A.plan); return; }
      if (!A.warned) { A.warned = true; toast(msg + '（總控的核准還有效，換個地方停）', 3); }   // 例如停在高架橋下
    } else A.warned = false;
  }
  const H = G.ctlHold;
  if (H && (H.chk -= dt) <= 0) {
    H.chk = 1;
    const d = dest(), leg = ctl.airLeg({ x: car.x, z: car.z, v: car.v, g: world.groundAt(car.x, car.z, car.y), dest: d, sky: drones });
    H.departAt = H.plan.slotAt - leg.toSlot;
    if (ctl.t >= H.departAt - 3) {
      // 時段到了：先看看直接開過去會不會更快（這段時間你一直在往目的地開）
      const rt = routeFromCar(d), rs = ctl.roadSec(rt);
      G.ctlHold = null;
      if (rs < H.plan.slotAt - ctl.t + H.plan.down) { G.ctlDrive = { t0: ctl.t, pred: rs }; G.ctl = null; toast(`總控：現在直接開過去比較快（約 ${Math.round(gmin(rs))} 分鐘），取消你的降落時段`, 4); }
      else { G.ctlAuto = { plan: H.plan, until: ctl.t + 40 }; toast(`起飛時段到了：慢下來停住就自動升空（降落時段 ${fmtClock(G.clock + gmin(H.plan.slotAt - ctl.t))}）`, 4); }
    }
  }
  const D = G.ctlDrive;
  if (D && dist(car, dest()) < 200) {
    toast(`開到目的地附近：總控預估 ${Math.round(gmin(D.pred))} 分鐘，實際 ${Math.round(gmin(ctl.t - D.t0))} 分鐘`, 4);
    G.ctlDrive = null;
  }
}
function hideCtlCard() { const c = $('ctlCard'); if (c) c.hidden = true; G.ctlCardT = 0; placeToast(); }
function showCtlCard(ev) {
  const c = $('ctlCard'); if (!c) return;
  const r = ev.road, a = ev.air, m = (s) => Math.max(1, Math.round(gmin(s))), f1 = (s) => gmin(s) < 0.95 ? gmin(s).toFixed(1) : String(Math.round(gmin(s)));
  const rows = [];
  if (r) rows.push(`<div class="row${ev.fly ? '' : ' win'}"><b>繼續開</b><em>${m(r.sec)} 分</em><span>${clockAfter(r.sec)} 到・路線 ${r.km.toFixed(1)} km・附近 ${r.live.n} 台車平均 ${Math.round(r.live.kmh)} km/h</span></div>`);
  rows.push(`<div class="row${ev.fly ? ' win' : ''}"><b>飛起來</b><em>${m(a.sec)} 分</em><span>${clockAfter(a.sec)} 落地・${a.stop > 1 ? '停車' : ''}升空 ${f1(a.stop + a.climb)}・穿層等 ${f1(a.cross)}・巡航 ${f1(a.cruise)}・排隊降落 ${f1(a.queue)}${a.ahead ? `（前面 ${a.ahead} 台）` : ''}・降落 ${f1(a.down)} 分・燃料約 ${fmtMoney(gmin(a.sec) * DRONE.costPerMin)}</span></div>`);
  let v;
  if (ev.fly && !ev.holdGround) v = `核准升空：飛比較快${r ? `，早 ${m(r.sec - a.sec)} 分到` : ''}。${Math.abs(car.v) > 3 ? '慢下來停住就自動升空' : ''}`;
  else if (ev.fly) v = `核准，降落時段 ${clockAfter(a.toSlot + a.queue)}：現在飛上去要在空中等 ${m(a.queue)} 分。建議先繼續開，時段快到時提醒你升空（現在就要飛：再按 U）`;
  else {
    const why = a.queue > a.sec * 0.35 ? `目的地附近降落要排 ${m(a.queue)} 分` : a.km < 1.6 ? '距離太近，升空降落的時間划不來' : '路上的車不多，開車就夠快';
    v = a.sec - r.sec > 30 ? `建議繼續開：開車早 ${m(a.sec - r.sec)} 分到（${why}）。還是要飛：10 秒內再按 U`
      : `建議繼續開：兩個差不多快（飛只差 ${m(Math.abs(r.sec - a.sec))} 分），開車省燃料費。還是要飛：10 秒內再按 U`;
  }
  $('ctlRows').innerHTML = rows.join('');
  $('ctlVerdict').textContent = v; $('ctlVerdict').className = ev.fly ? 'ok' : 'no';
  $('ctlNote').textContent = `總控即時掌握：路上 ${r ? r.live.n : 0} 台、天上 ${a.skyN.toLocaleString()} 架（你附近要穿過的高度層）・全市 ${Math.round(ev.p * 100)}% 的車在飛・目的地附近 ${a.spots} 個降落點`;
  c.hidden = false; G.ctlCardT = uiTime + (ev.fly && !ev.holdGround ? 9 : 14); placeToast();
}
window.__tc.ctlAsk = () => ctlAsk();
/** 從車子現在的位置到 d 的最快路線（先試著沿車頭方向走；單行道只能順向）。 */
function routeFromCar(d, o = {}) {
  if (!nav || !car) return null;
  const e = world.nearestEdge(car.x, car.z, 30, ed => ed.cls <= 6, o);
  let fwdOK = true;
  if (e) { const k = Math.max(0, e.cum.findIndex(c => c > o.s) - 1), dx = e.pts[k * 2 + 2] - e.pts[k * 2], dz = e.pts[k * 2 + 3] - e.pts[k * 2 + 1]; fwdOK = dx * car.fwdX + dz * car.fwdZ >= 0; }
  let rt = e ? nav.route({ edge: e, s: o.s, fwdOK: fwdOK, backOK: !fwdOK }, { x: d.x, z: d.z }) : null;
  if (!rt && e) rt = nav.route({ edge: e, s: o.s }, { x: d.x, z: d.z });
  if (!rt) rt = nav.route({ x: car.x, z: car.z }, { x: d.x, z: d.z });
  o.e = e; return rt;
}
function planRoute() {
  G.route = null; G.routePoly = null; routeLine.visible = false;
  if (!nav || !car) return;
  const o = {}, rt = routeFromCar(dest(), o), e = o.e;
  if (!rt) return;
  G.route = rt; G.routeS = e ? o.s : undefined;
  G.routePoly = nav.polyline(rt, world, { x: car.x, z: car.z }, G.routeS); G.routeIdx = 0;
  if (econ.has('nav')) buildRouteMesh();
}
function buildRouteMesh() {
  const p = G.routePoly; if (!p || p.length < 4) { routeLine.visible = false; return; }
  const pos = [], idx = [], W = 1.1, q = {};
  let n = 0;
  for (let i = Math.max(0, G.routeIdx - 2); i + 3 < p.length && n < 3000; i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.3) continue;
    if (Math.hypot(ax - car.x, az - car.z) > 900) break;
    const nx = -(bz - az) / L * W, nz = (bx - ax) / L * W;
    const sa = world.surfaceAt(ax, az, car.y + 0.5, q), ya = (sa ? sa.y : world.groundAt(ax, az)) + 0.3;
    const sb = world.surfaceAt(bx, bz, car.y + 0.5, q), yb = (sb ? sb.y : world.groundAt(bx, bz)) + 0.3;
    pos.push(ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz);
    idx.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4 + 1, n * 4 + 3, n * 4 + 2); n++;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  routeLine.geometry.dispose(); routeLine.geometry = g; routeLine.visible = n > 0;
}
function navTick(dt) {
  if (!G.routePoly) { G.routeT = (G.routeT || 0) + dt; if (G.routeT > 2 && nav) { G.routeT = 0; planRoute(); } return null; }
  const pr = polyProgress(G.routePoly, car.x, car.z, Math.max(0, G.routeIdx - 4), 300);
  G.routeIdx = pr.i;
  // 偏離路線 35 m 以上超過 1.5 秒：重新規劃
  G.offT = pr.d > 35 ? (G.offT || 0) + dt : 0;
  if (G.offT > 1.5) { G.offT = 0; planRoute(); if (econ.has('nav')) toast('重新規劃路線', 1.5); return null; }
  // 每 4 秒用剛載入的真實道路形狀更新路線（前方路段載入後會更準）
  G.meshT = (G.meshT || 0) - dt;
  if (G.meshT <= 0) { G.meshT = 4; G.routePoly = nav.polyline(G.route, world, null); G.routeIdx = polyProgress(G.routePoly, car.x, car.z, 0, 100000).i; if (econ.has('nav')) buildRouteMesh(); }
  let rest = 0; for (let i = pr.i; i + 3 < G.routePoly.length; i += 2) rest += Math.hypot(G.routePoly[i + 2] - G.routePoly[i], G.routePoly[i + 3] - G.routePoly[i + 1]);
  const turn = nextTurn(G.routePoly, pr, 1200);
  let road = '';
  if (turn) { const q = {}, k = Math.min(G.routePoly.length - 2, turn.idx + 2), e = world.nearestEdge((turn.x + G.routePoly[k]) / 2, (turn.z + G.routePoly[k + 1]) / 2, 20, null, q); road = e ? e.name : ''; }
  return { rest, turn, road };
}

// ===================================================================== 走路（第三人稱）與房間
const _q = { x: 0, z: 0 }, _surf = { y: 0, edge: null, s: 0, lat: 0, i: 0, t: 0, _d2: 0 };
const obsList = [];
function gatherObstacles(x, z, R) {
  obsList.length = 0;
  for (const c of traffic.cars) if (Math.abs(c.x - x) < R && Math.abs(c.z - z) < R) obsList.push(c);
  for (const b of parking.parked) if (Math.abs(b.x - x) < R && Math.abs(b.z - z) < R) obsList.push({ x: b.x, z: b.z, y: b.y, psi: b.psiCar });
  // 全城無人機：剛降落／正要起飛停在路上的車
  if (drones && drones.dense) for (const d of drones.list) if (Math.abs(d.x - x) < R && Math.abs(d.z - z) < R && d.y - d.g < 2.5) obsList.push({ x: d.x, z: d.z, y: d.g, psi: d.track + Math.PI });
  for (const b of world.barriers) {
    if (Math.abs(b.x - x) > R + b.w || Math.abs(b.z - z) > R + b.w) continue;
    const k = Math.max(1, Math.ceil(b.w / 4)), psi = Math.atan2(-b.nx, -b.nz);
    for (let i = 0; i < k; i++) { const t = (i + 0.5) / k - 0.5; obsList.push({ x: b.x + b.nx * t * b.w, z: b.z + b.nz * t * b.w, y: b.y, psi }); }
  }
  return obsList;
}
const camBlocked = (x, y, z) => { const b = world.buildingAt(x, z); return !!(b && y < b.y0 + b.h + 1.0); };
const groundAt = (x, z) => world.groundAt(x, z, P.y);
const roomBlocked = (x, y, z) => {
  const m = 0.12;
  if (x < -room.W / 2 + m || x > room.W / 2 - m || z < -room.D / 2 + m || z > room.D / 2 - m || y > room.H - 0.1) return true;
  for (const b of room.boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.h) return true;
  return false;
};
/** 第三人稱移動：依鏡頭方向移動，角色轉向行進方向。 */
function stepWalk(dt, speedMul = 1) {
  const fw = Math.max(-1, Math.min(1, input.forward)), st = Math.max(-1, Math.min(1, input.strafe));
  const fx = tp.fwdX, fz = tp.fwdZ;
  let mx = fx * fw - fz * st, mz = fz * fw + fx * st;
  const mag = Math.min(1, Math.hypot(mx, mz));
  if (mag > 0.05) {
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    const sp = (input.run ? 4.8 : 1.9) * mag * speedMul;
    P.x += mx * sp * dt; P.z += mz * sp * dt;
    const want = Math.atan2(-mx, -mz); let d = want - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    P.yaw += d * Math.min(1, dt * 10);
  }
}
function roomFrame(dt) {
  tp.input(input.lookX, input.lookY);
  const ox = P.x, oz = P.z;
  stepWalk(dt, 0.8);
  const m = 0.3;
  P.x = Math.max(-room.W / 2 + m, Math.min(room.W / 2 - m, P.x)); P.z = Math.max(-room.D / 2 + m, Math.min(room.D / 2 - m, P.z));
  for (const b of room.boxes) {
    if (P.x > b.x0 - m && P.x < b.x1 + m && P.z > b.z0 - m && P.z < b.z1 + m) {
      const dx0 = P.x - (b.x0 - m), dx1 = b.x1 + m - P.x, dz0 = P.z - (b.z0 - m), dz1 = b.z1 + m - P.z, mn = Math.min(dx0, dx1, dz0, dz1);
      if (mn === dx0) P.x = b.x0 - m; else if (mn === dx1) P.x = b.x1 + m; else if (mn === dz0) P.z = b.z0 - m; else P.z = b.z1 + m;
    }
  }
  P.speed = Math.hypot(P.x - ox, P.z - oz) / Math.max(dt, 1e-4);
  if (avatar) { avatar.group.visible = true; avatar.update(dt, P.x, 0, P.z, P.yaw, P.speed); }
  tp.update(dt, P.x, 0, P.z, roomBlocked, () => 0);
  const nearDoor = Math.hypot(P.x - room.door.x, P.z - room.door.z) < 1.25, nearDesk = Math.hypot(P.x - room.desk.x, P.z - room.desk.z) < 1.0;
  setPrompt(nearDoor ? '<kbd>E</kbd> 出門' : nearDesk ? '<kbd>E</kbd> 打開電腦（商店）' : '走到房門口出門上班');
  if (input.pressed('KeyE')) { if (nearDoor) leaveRoom(); else if (nearDesk) openShop(); }
  world.update(G.cfg.home.x, G.cfg.home.z, dt);
  parking.update(dt, G.cfg.home.x, G.cfg.home.z);
}
function walkFrame(dt) {
  tp.input(input.lookX, input.lookY);
  const ox = P.x, oz = P.z;
  stepWalk(dt);
  const gr = world.groundAt(P.x, P.z, P.y);
  _q.x = P.x; _q.z = P.z;
  if (P.y - gr < 2.5 && P.y - gr > -2.0) { world.collide(_q, 0.32); P.x = _q.x; P.z = _q.z; }
  for (const o of gatherObstacles(P.x, P.z, 8).concat([{ x: car.x, z: car.z, y: car.y, psi: car.psi }])) {
    if (Math.abs((o.y || 0) - P.y) > 1.5) continue;
    for (const off of [1.3, 0, -1.3]) {
      const px = o.x - Math.sin(o.psi) * off, pz = o.z - Math.cos(o.psi) * off, dx = P.x - px, dz = P.z - pz, d = Math.hypot(dx, dz), R = 1.25;
      if (d < R && d > 1e-4) { P.x += dx / d * (R - d); P.z += dz / d * (R - d); }
    }
  }
  const s = world.surfaceAt(P.x, P.z, P.y, _surf);
  if (!s && P.y - gr > 1.3) { P.x = ox; P.z = oz; }
  else P.y += ((s ? s.y : world.groundAt(P.x, P.z, P.y)) - P.y) * Math.min(1, dt * 10);
  P.speed = Math.hypot(P.x - ox, P.z - oz) / Math.max(dt, 1e-4);
  if (avatar) { avatar.group.visible = true; avatar.update(dt, P.x, P.y, P.z, P.yaw, P.speed); }
  tp.update(dt, P.x, P.y, P.z, camBlocked, groundAt);
  world.update(P.x, P.z, dt); parking.update(dt, P.x, P.z); signs.update(dt, P.x, P.z);
  traffic.update(dt, P.x, P.z, [{ x: P.x, z: P.z, y: P.y, r: 0.6 }, { x: car.x, z: car.z, y: car.y, r: 2.3 }]);
  traffic.events.length = 0;
  if (drones) drones.update(dt, P.x, P.z, null);
  if (flight) flight.animate(dt);
  car.body.visible = true; car.sync();
  engine.update(dt, { v: 0, throttle: 0, brake: 0, cockpit: false });
  if (tunnelF > 0.001) tunnelLight(dt, null);
  const d = dest(), dCar = dist(P, car), dDest = dist(P, d);
  carBeacon.visible = G.phase === 'toCar' || (G.phase === 'toDest' && G.parked && !G.parked.legal);
  carBeacon.position.set(car.x, car.y, car.z);
  destBeacon.visible = G.phase !== 'toCar'; destBeacon.position.set(d.x, world.groundAt(d.x, d.z), d.z);
  bayMarks.count = 0;
  if (dCar < 3.0) { setPrompt('<kbd>E</kbd> 上車'); if (input.pressed('KeyE')) enterCar(); }
  else if (G.phase === 'toDest' && dDest < 4.5) {
    if (G.parked && G.parked.legal) { setPrompt(G.leg === 'am' ? '打卡中…' : '到家了', 'good'); arrive(); }
    else setPrompt('車還沒停進合法車格，回去停好', 'warn');
  } else setPrompt('');
}

// ===================================================================== 駕駛座調整、舒適設定
const SEAT_DEF = { h: 0, f: 0, fov: 46, tilt: 10 };
const seatKey = () => 'taipei-seat2-' + (car ? car.spec.key : 'gas');   // 2：駕駛座預設改成以擋風玻璃為主（舊的座椅設定不沿用）
let seat = Object.assign({}, SEAT_DEF);
const seatDef = () => Object.assign({}, SEAT_DEF, (car && car.spec.seat) || {});   // 跑車坐得低、車頂低：預設視線不往上抬
function loadSeat() { try { seat = Object.assign(seatDef(), JSON.parse(localStorage.getItem(seatKey()) || '{}')); } catch (err) { seat = seatDef(); } }
function applySeat() {
  if (!cockpit) return;
  cockpit.eye.set(cockpit.eyeBase.x, cockpit.eyeBase.y + seat.h / 100, cockpit.eyeBase.z - seat.f / 100);
  cockpit.basePitch = seat.tilt * Math.PI / 180;
  $('seatH').value = seat.h; $('seatF').value = seat.f; $('seatV').value = seat.fov; $('seatT').value = seat.tilt;
  $('seatTv').textContent = (seat.tilt > 0 ? '往上 ' : seat.tilt < 0 ? '往下 ' : '') + Math.abs(seat.tilt) + '°';
  $('seatHv').textContent = (seat.h > 0 ? '+' : '') + seat.h + ' cm'; $('seatFv').textContent = (seat.f > 0 ? '+' : '') + seat.f + ' cm'; $('seatVv').textContent = seat.fov + '°';
  try { localStorage.setItem(seatKey(), JSON.stringify(seat)); } catch (err) { /* 存不了就算了 */ }
}
for (const [id, k] of [['seatH', 'h'], ['seatF', 'f'], ['seatV', 'fov'], ['seatT', 'tilt']]) $(id).addEventListener('input', (e) => { seat[k] = +e.target.value; applySeat(); });
$('seatReset').onclick = () => { Object.assign(seat, seatDef()); applySeat(); };
window.__tc.setSeat = (o) => { Object.assign(seat, o); applySeat(); return Object.assign({}, seat); };
$('seatGo').onclick = () => closeSeat();
const COMFORT_KEY = 'drive-comfort', COMFORT_DEF = { autoCenter: false, followPitch: false, quality: 'high', inch: 14, cm: 55 };
const comfort = (() => { try { return Object.assign({}, COMFORT_DEF, JSON.parse(localStorage.getItem(COMFORT_KEY) || '{}')); } catch (err) { return Object.assign({}, COMFORT_DEF); } })();
function applyComfort() {
  if (cockpit) { cockpit.autoCenter = comfort.autoCenter; cockpit.followPitch = comfort.followPitch; }
  const smooth = comfort.quality === 'smooth' || location.hash.startsWith('#lowq');
  sun.castShadow = !smooth;
  renderer.setPixelRatio(location.hash.startsWith('#lowq') ? 0.75 : Math.min(window.devicePixelRatio || 1, smooth ? 1 : 1.5)); resize();
  $('cfAuto').checked = comfort.autoCenter; $('cfPitch').checked = comfort.followPitch;
  for (const r of document.querySelectorAll('input[name=cfQ]')) r.checked = r.value === comfort.quality;
  $('cfInch').value = comfort.inch; $('cfCm').value = comfort.cm;
  try { localStorage.setItem(COMFORT_KEY, JSON.stringify(comfort)); } catch (err) { /* 存不了就算了 */ }
}
$('cfAuto').addEventListener('change', (e) => { comfort.autoCenter = e.target.checked; applyComfort(); });
$('cfPitch').addEventListener('change', (e) => { comfort.followPitch = e.target.checked; applyComfort(); });
for (const r of document.querySelectorAll('input[name=cfQ]')) r.addEventListener('change', () => { comfort.quality = r.value; applyComfort(); });
$('cfCalc').onclick = () => {
  comfort.inch = Math.max(5, Math.min(100, +$('cfInch').value || 14)); comfort.cm = Math.max(20, Math.min(400, +$('cfCm').value || 55));
  const ar = (screen.width || 16) / (screen.height || 10), diag = comfort.inch * 2.54, h = diag / Math.sqrt(1 + ar * ar);
  let v = 2 * Math.atan(h / 2 / comfort.cm) * 180 / Math.PI; if (camera.aspect < 1) v -= 26;
  seat.fov = Math.round(Math.max(20, Math.min(80, v))); applySeat(); applyComfort();
  $('cfCalcOut').textContent = `依你的螢幕算出 ${Math.round(2 * Math.atan(h / 2 / comfort.cm) * 180 / Math.PI)}°，已套用到「視野寬窄」`;
};
let fpsN = 0, fpsT = 0;
function fpsTick(dt) {
  fpsN++; fpsT += dt;
  if (fpsT >= 1) { const f = fpsN / fpsT; fpsN = 0; fpsT = 0; const el = $('cfFps'); if (el && !$('seat').hidden) el.textContent = `目前畫面每秒 ${Math.round(f)} 張${f < 40 && comfort.quality === 'high' ? '，不夠順，建議改「順暢優先」' : ''}`; }
}
function openSeat() {
  loadSeat();
  G.seatAdj = true; G.cam = 'cockpit'; camera.near = 0.8; camera.updateProjectionMatrix();
  input.releaseLock(); input.noLock = true; $('seat').hidden = false; applySeat(); applyComfort();
}
function closeSeat() {
  if (!G.seatAdj) return;
  G.seatAdj = false; input.noLock = false; $('seat').hidden = true;
  cockpit.lookYaw = 0; cockpit.lookPitch = 0;
  if (AUTO) AUTO.t = 0;
  toast(input.touch ? '開車囉！地圖、後照鏡、視角在右上角「⋯」' : '開車囉！按住 Z／X 看後照鏡，視線轉開了按 R 回正', 3.5);
  showTips();
}

// ===================================================================== 開車（第一人稱駕駛座）
let markT = 0, lotT = 0, frameN = 0;
function glance(dt) {
  const L = input.has('KeyZ'), R = input.has('KeyX'), k = Math.min(1, dt * 10);
  if (L || R) {
    const ty = L ? 0.56 : -0.94;
    cockpit.lookYaw += (ty - cockpit.lookYaw) * k; cockpit.lookPitch += (-0.1 - (cockpit.basePitch || 0) - cockpit.lookPitch) * k; cockpit._idle = 0; G.glance = true;
  } else if (G.glance) {
    cockpit.lookYaw -= cockpit.lookYaw * k; cockpit.lookPitch -= cockpit.lookPitch * k;
    if (Math.abs(cockpit.lookYaw) < 0.01) { cockpit.lookYaw = 0; cockpit.lookPitch = 0; G.glance = false; }
  }
}
function driveFrame(dt) {
  const c = car;
  if (input.pressed('KeyC')) {
    if (flight && flight.active) G.droneView = G.droneView === 'cockpit' ? 'ext' : 'cockpit';   // 飛行中：車外／駕駛座
    else { G.cam = G.cam === 'cockpit' ? 'chase' : 'cockpit'; camera.near = G.cam === 'cockpit' ? 0.8 : 0.3; camera.updateProjectionMatrix(); }
  }
  // 無人機飛行：U 升空／取消；飛行中按 C 切換車外／駕駛座
  if (input.pressed('KeyU') && !G.seatAdj) {
    if (!econ.has('drone')) toast(econ.has('roadster') ? '要先在商店買「無人機飛行系統」' : '無人機飛行系統裝在飛天跑車上：要先買飛天跑車，再買無人機飛行系統', 2.5);
    else if (car.spec.key !== 'roadster') toast('無人機飛行系統裝在飛天跑車上，要開飛天跑車才能用（在商店的「明天開哪台車」換車）', 2.8);
    else if (flight.active) flight.abort();
    else if (G.mode === 'hybrid' && ctl) ctlAsk();   // 路空總控：先問總控（開著也能問）
    else { const msg = flight.canStart(stunts && stunts.busy); if (msg) toast(msg, 2); else flight.start(drones); }
  }
  if (G.mode === 'hybrid' && ctl && !G.seatAdj) ctlDrive(dt);
  const flying = flight && flight.active;
  // 特技（飛越、翻轉、垂直開、倒著開）時自動切到車外視角，落地後回到原本的視角
  const ext = !!(stunts && stunts.external) || (flying && G.droneView !== 'cockpit');
  if (ext !== !!G.extCam) {
    G.extCam = ext; if (ext && stunts && stunts.external) stunts.camFrom(camera); if (ext && flying) flight.cp = null;
    camera.near = ext || G.cam !== 'cockpit' ? 0.3 : 0.8; camera.updateProjectionMatrix();
  }
  G.camMode = ext ? (flying ? 'drone' : 'stunt') : G.cam;
  const fov = G.camMode === 'cockpit' ? seat.fov + (camera.aspect < 1 ? 26 : 0) : (camera.aspect < 1 ? 76 : 62);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (G.seatAdj && input.pressed('Enter')) closeSeat();
  else if (!$('tipCard').hidden && input.pressed('Enter')) $('tipOk').click();   // 新功能說明卡：Enter 關掉
  if (!G.seatAdj && input.pressed('KeyV') && Math.abs(c.v) < 0.3) openSeat();
  if (input.pressed('KeyR') && G.cam === 'cockpit') cockpit.recenter();
  const fw = G.seatAdj ? 0 : input.forward;
  const pedals = G.seatAdj ? { throttle: 0, brake: 1, steer: 0, handbrake: true } : { throttle: Math.max(0, Math.min(1, fw > 0.15 ? fw : 0)) || input.tGas, brake: Math.max(0, Math.min(1, fw < -0.15 ? -fw : 0)) || input.tBrake,
    steer: -Math.max(-1, Math.min(1, input.strafe)), handbrake: input.has('Space') };
  lotT -= dt; if (lotT <= 0) { lotT = 0.2; c.onLot = parking.inLot(c.x, c.z) || !!parking.bayAt(c.x, c.z, c.psi, _err); }
  const obs = gatherObstacles(c.x, c.z, 14);
  if (flying) flight.update(dt, TIME.scale / 60, drones, statics);
  else if (stunts) {
    const sk = G.seatAdj ? {} : { boost: input.has('ShiftLeft', 'ShiftRight'), jump: input.pressed('KeyF'), grip: input.pressed('KeyG'), flip: input.pressed('KeyT') };
    stunts.update(dt, pedals, sk, obs, traffic);
  } else c.update(dt, pedals, obs);
  if (flight) flight.animate(dt);   // 旋翼展開／收回的動畫（不影響開車）
  if (drones) drones.update(dt, c.x, c.z, flying ? [{ x: flight.x, y: flight.y, z: flight.z, vx: flight.vx, vy: flight.vy, vz: flight.vz }] : null);
  // 壓縮空氣：停在電動車充電格（車停著）就快速補氣（遊戲設定：每秒 4%，滿罐 600 元）
  G.airRegenT = Math.max(0, (G.airRegenT || 0) - dt);
  if (stunts && !stunts.busy && !flying && Math.abs(c.v) < 0.3 && econ.stuntFuel < 1) {
    G.airBayT = (G.airBayT || 0) - dt;
    if (G.airBayT <= 0) { G.airBayT = 0.3; const b = parking.bayAt(c.x, c.z, c.psi, _err); G.airBay = !!(b && b.type === 'ev'); }
    G.airStation = G.airBay && econ.refillAirStation(AIR.stationRate * dt) > 0;
  } else { G.airStation = false; G.airBay = false; }
  if (stunts) c.airText = `空氣 ${Math.round(econ.stuntFuel * 100)}%・${Math.floor(econ.stuntFuel * AIR.jumpsPerTank + 1e-6)} 次`;
  engine.update(dt, { v: flying ? 0 : c.v, throttle: c.energy > 0 && !flying ? c.thrF : 0, brake: c.brkF, cockpit: G.camMode === 'cockpit' });
  engine.stunt(flying ? 0.22 : stunts ? stunts.thrust : 0, flying ? 0.9 : stunts ? stunts.suction : 0);
  world.update(c.x, c.z, dt); parking.update(dt, c.x, c.z); signs.update(dt, c.x, c.z);
  traffic.update(dt, c.x, c.z, [{ x: c.x, z: c.z, y: c.y, r: 2.3 }]);
  jetMist(dt);
  for (const ev of traffic.events.splice(0)) {
    if (ev.type === 'hitPlayer') { c._bump(2); toast('被飛過來的飛天跑車壓到了！（對方負責修車費）', 2.6); }
    else if (Math.hypot(ev.x - c.x, ev.z - c.z) < 150) toast('前面有飛天跑車落地壓到別的車，撞成一團', 2.4);
  }
  if (G.camMode === 'drone') { c.body.visible = true; flight.camera(camera, dt); }
  else if (G.camMode === 'stunt') { c.body.visible = true; stunts.camera(camera, dt); }
  else if (G.camMode === 'cockpit') { cockpit.look(input.lookX, input.lookY, dt, Math.abs(c.v) > 1 && !G.seatAdj); glance(dt); cockpit.applyTo(camera, c); c.body.visible = false; }
  else {
    c.body.visible = true;
    const back = 7.5, up = 3.0, tx = c.x - c.fwdX * back, tz = c.z - c.fwdZ * back, ty = c.y + up, k = Math.min(1, dt * 5);
    if (!G.chase) G.chase = { x: tx, y: ty, z: tz };
    G.chase.x += (tx - G.chase.x) * k; G.chase.y += (ty - G.chase.y) * k; G.chase.z += (tz - G.chase.z) * k;
    camera.position.set(G.chase.x, G.chase.y, G.chase.z); camera.lookAt(c.x, c.y + 1.2, c.z);
  }
  P.x = c.x; P.z = c.z; P.y = c.y;
  tunnelLight(dt, c.edge);
  const d = dest(), dDest = dist(c, d);
  destBeacon.visible = true; destBeacon.position.set(d.x, world.groundAt(d.x, d.z), d.z); carBeacon.visible = false;
  markT -= dt;
  if (markT <= 0) {
    markT = 0.4; let n = 0;
    if (dDest < 420) {
      const list = [];
      parking.forBaysNear(c.x, c.z, 120, (b, d2) => { if (!b.occupied && !b.reserved && bayAllowed(b) && dist(b, d) < 450) { b._d2 = d2; list.push(b); } });
      list.sort((a, b) => a._d2 - b._d2);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      for (const b of list.slice(0, 48)) {
        e.set(0, b.psi, 0); q.setFromEuler(e); v.set(b.x, b.y + 0.24, b.z); sc.set(b.wid - 0.3, 1, b.len - 0.3); m.compose(v, q, sc);
        bayMarks.setMatrixAt(n, m); bayMarks.setColorAt(n, b.type === 'ev' ? new THREE.Color(0x3fe08f) : new THREE.Color(0xf5c518)); n++;
      }
    }
    bayMarks.count = n; bayMarks.instanceMatrix.needsUpdate = true; if (bayMarks.instanceColor) bayMarks.instanceColor.needsUpdate = true;
  }
  let pr = '', cls = '';
  if (Math.abs(c.v) < 1.2) {
    const chk = dDest < 450 ? parkingCheck() : { bay: null };
    if (chk.bay) { if (chk.ok) { pr = '已停妥　<kbd>E</kbd> 下車'; cls = 'good'; } else { pr = chk.msg; cls = 'warn'; } }
    else if (Math.abs(c.v) < 0.3) pr = '<kbd>E</kbd> 下車';
  }
  if ((stunts && stunts.busy) || flying) { pr = ''; cls = ''; }
  if (G.seatAdj) { pr = '調整好座椅後按「開始開車」（或 Enter）'; cls = ''; }
  setPrompt(pr, cls);
  if (input.pressed('KeyE')) { if (G.seatAdj) { closeSeat(); if (!input.touch) exitCar(); } else exitCar(); }
  const ni = navTick(dt);
  if (G.camMode === 'cockpit') {
    cockpit.drawDash(c, dt);
    if (frameN % 4 === 0) {
      const ang = Math.atan2(d.x - c.x, -(d.z - c.z)), heading = Math.atan2(c.fwdX, -c.fwdZ);
      const info = { title: G.leg === 'am' ? d.n : '回家', dist: fmtDist(dDest), bearing: ang - heading, kmh: Math.round(c.kmh), energy: (c.spec.electric ? '電量 ' : '油量 ') + Math.round(c.energy / c.spec.capacity * 100) + '%' };
      if (econ.has('nav') && ni) Object.assign(info, { nav: true, turn: ni.turn, road: ni.road, rest: fmtDist(ni.rest), map: navScreenMap });
      cockpit.drawNav(info);
    }
  }
}

// ===================================================================== 壓縮空氣的白霧
const _jp = new THREE.Vector3(), _jd = new THREE.Vector3(), JET_FX = {
  rear: { rate: 70, speed: 14, life: 1.0, s1: 2.4 }, down: { rate: 55, speed: 12, life: 1.4, s1: 3.2 },
  left: { rate: 50, speed: 10, life: 0.8, s1: 1.8 }, right: { rate: 50, speed: 10, life: 0.8, s1: 1.8 }, front: { rate: 50, speed: 10, life: 0.8, s1: 1.8 },
};
let mistAcc = {}, lastCar = null;
function jetMist(dt) {
  if (!car) return;
  const vx = lastCar ? (car.x - lastCar.x) / Math.max(dt, 1e-3) : 0, vy = lastCar ? (car.y - lastCar.y) / Math.max(dt, 1e-3) : 0, vz = lastCar ? (car.z - lastCar.z) / Math.max(dt, 1e-3) : 0;
  lastCar = { x: car.x, y: car.y, z: car.z };
  if (stunts) {
    const J = stunts.jets(); car.group.updateMatrixWorld(true); const mw = car.group.matrixWorld;
    for (const k of Object.keys(ROADSTER_JETS)) {
      const lv = J[k] || 0; if (lv < 0.02) { mistAcc[k] = 0; continue; }
      const fx = JET_FX[k]; mistAcc[k] = (mistAcc[k] || 0) + fx.rate * lv * dt;
      const n = Math.floor(mistAcc[k]); if (!n) continue; mistAcc[k] -= n;
      for (const j of ROADSTER_JETS[k]) {
        _jp.set(j.p[0], j.p[1], j.p[2]).applyMatrix4(mw); _jd.set(j.d[0], j.d[1], j.d[2]).transformDirection(mw);
        mist.emit(_jp.x, _jp.y, _jp.z, _jd.x, _jd.y, _jd.z, n, { speed: fx.speed, life: fx.life, s1: fx.s1, vx: vx * 0.3, vy: vy * 0.3, vz: vz * 0.3 });
      }
    }
  }
  // 別人的飛天跑車：升空、落地時車底也會噴霧
  mistAcc.ai = (mistAcc.ai || 0) + dt * 40; const nAi = Math.floor(mistAcc.ai); mistAcc.ai -= nAi;
  if (nAi) for (const c of traffic.cars) {
    if (!c.hop || Math.abs(c.x - car.x) > 220 || Math.abs(c.z - car.z) > 220) continue;
    const u = c.hop.t / c.hop.T; if (u > 0.3 && u < 0.75) continue;
    const cs = Math.cos(c.psi), sn = Math.sin(c.psi);
    for (const [lx, lz] of [[-0.62, -1.6], [0.62, -1.6], [-0.62, 1.6], [0.62, 1.6]]) mist.emit(c.x + lx * cs + lz * sn, c.y + 0.17, c.z - lx * sn + lz * cs, 0, -1, 0, nAi, { speed: 12, life: 1.3, s1: 3 });
  }
}

// ===================================================================== 隧道光線（不閃白光）
let tunnelF = 0;
function tunnelLight(dt, e) {
  let inside = false;
  if (e && e.tunnel && e.cover && !e.dead) { const k = Math.min(e.cum.length - 2, Math.max(0, (car._segI | 0))); inside = (e.cover[k] + e.cover[k + 1]) / 2 > 5; }
  tunnelF += ((inside ? 1 : 0) - tunnelF) * Math.min(1, dt * (inside ? 1.6 : 1.2));
  const b = G.sunBase || { sun: 2.4, hemi: 1.05 };
  sun.intensity = b.sun * (1 - 0.82 * tunnelF); hemi.intensity = b.hemi * (1 - 0.62 * tunnelF);
}
function setSun(leg) {
  const s = SUN[leg]; SUN_DIR.copy(s.dir); sun.color.set(s.color); sun.intensity = s.i; hemi.intensity = s.hemi;
  sky.material.uniforms.sunDir.value.copy(SUN_DIR); sky.material.uniforms.hor.value.set(s.hor);
  G.sunBase = { sun: s.i, hemi: s.hemi };
}

// ===================================================================== HUD、小地圖、全市地圖
let miniT = 0, placeT = 0;
function hud(dt) {
  const ck = $('clock');
  $('dayChip').textContent = `第 ${G.dayN} 天`;
  ck.textContent = fmtClock(G.clock); ck.classList.toggle('late', G.leg === 'am' && G.clock > TIME.workMin);
  $('due').textContent = G.leg === 'am' ? '09:00 上班' : '下班回家';
  $('money').textContent = fmtMoney(econ.money);
  let t = '', sub = '';
  const d = dest();
  if (G.state === 'room') { t = '起床了，出門上班'; sub = `${districtName(G.cfg.di)}${G.cfg.home.a}`; }
  else if (G.phase === 'toCar') { t = '走到你的車'; sub = fmtDist(dist(P, car)); }
  else if (G.phase === 'drive') {
    const dd = dist(car, d);
    if (flight && flight.active) {
      t = flight.phase === 'hover' && flight.slotHold ? '排隊等降落時段' : flight.phase === 'hover' && flight.blocked ? '下方有車，在空中等待降落' : { lift: '無人機升空中', cruise: `無人機飛往 ${G.leg === 'am' ? d.n : '家'}`, approach: '接近降落點', hover: '對準降落點', descend: '降落中' }[flight.phase] || '無人機飛行';
      sub = `高度 ${Math.round(car.y - world.groundAt(car.x, car.z, car.y - 50))} m・${Math.round(car.v * 3.6)} km/h・剩 ${fmtDist(dist(car, flight.spot))}・燃料費 ${Math.round(flight.costSum)} 元`;
      if (flight.slotHold && flight.plan && ctl) { const left = flight.plan.slotAt - ctl.t; sub = `前面還有 ${Math.max(1, Math.ceil(left * flight.plan.area.mu))} 台・約 ${Math.max(1, Math.round(gmin(left)))} 分鐘（${clockAfter(left)} 輪到你）・燃料費 ${Math.round(flight.costSum)} 元`; }
    } else if (dd < 420) { t = G.leg === 'am' ? '在公司附近找車位' : '在家附近找車位'; sub = car.spec.electric ? '黃色：路邊空格　綠色：電動車格' : '黃色標示的是空的路邊車格'; }
    else { t = G.leg === 'am' ? `開車到 ${d.n}` : '開車回家'; sub = `直線 ${fmtDist(dd)}${econ.has('nav') ? '・跟著藍色導航線' : ''}`; }
    if (!(flight && flight.active) && G.mode === 'hybrid' && ctl) {
      if (G.ctlHold && G.ctlHold.departAt !== undefined) sub = `總控：約 ${clockAfter(G.ctlHold.departAt - ctl.t)} 起飛（降落時段 ${clockAfter(G.ctlHold.plan.slotAt - ctl.t)}）・現在就飛按 U`;
      else if (G.ctlAuto) sub = '總控已核准：慢下來停住就自動升空';
    }
  } else if (G.phase === 'toDest') {
    if (G.parked && G.parked.legal) { t = G.leg === 'am' ? `走進 ${d.n}` : '走回家'; sub = fmtDist(dist(P, d)); }
    else { t = '車沒停好'; sub = '回到車上（藍色光柱）重新停進車格'; }
  }
  $('taskText').textContent = t; $('taskSub').textContent = sub;
  const sb = $('stunt'), showS = !!(G.state === 'drive' && stunts);
  if (sb.hidden === showS) sb.hidden = !showS;
  if (showS) {
    const f = Math.max(0, econ.stuntFuel), jumps = Math.floor(f * AIR.jumpsPerTank + 1e-6);
    $('stuntBar').style.width = (f * 100).toFixed(1) + '%'; $('stuntBar').classList.toggle('low', f < 1 / AIR.jumpsPerTank);
    sb.classList.toggle('empty', f <= 1e-4);
    const pct = `${Math.round(f * 100)}%・可飛越 ${jumps} 次`; if ($('stuntPct').textContent !== pct) $('stuntPct').textContent = pct;
    const fill = G.airStation ? '充電格補氣中' : (G.airRegenT > 0 && f < 1 ? '開車中慢慢補' : '');
    if ($('stuntFill').textContent !== fill) $('stuntFill').textContent = fill;
    const lb = stunts.label(), hint = input.touch ? '' : stunts.mode === 'air' ? 'T 翻轉　A/D 轉向' : stunts.mode === 'wall' ? 'W 往上　A/D 轉向　G 跳離' : stunts.mode === 'under' ? 'W 前進　A/D 左右　G 翻轉落地' : stunts.mode === 'roof' ? 'F 飛下去　邊緣按 G 沿牆開下去' : 'Shift 推進　F 飛越　G 吸附';
    const t = lb ? lb + (hint ? '・' + hint : '') : hint;
    if ($('stuntMode').textContent !== t) $('stuntMode').textContent = t;
  }
  const dp = $('daa'), showD = !!(G.state === 'drive' && flight && flight.active);
  if (dp.hidden === showD) dp.hidden = !showD;
  if (showD) { G.daaT = (G.daaT || 0) - dt; if (G.daaT <= 0) { G.daaT = 0.15; flight.drawPanel(dp, drones); } }
  const sp = $('speedo');
  if (G.state === 'drive' && (G.camMode !== 'cockpit' || input.touch)) {
    sp.hidden = false; $('spd').textContent = Math.round(car.kmh);
    $('energy').textContent = (car.spec.electric ? '電量 ' : '油量 ') + Math.round(car.energy / car.spec.capacity * 100) + '%' + (stunts && input.touch ? `・空氣 ${Math.round(econ.stuntFuel * 100)}%（${Math.floor(econ.stuntFuel * AIR.jumpsPerTank + 1e-6)} 次）${G.airStation ? ' 補氣中' : ''}` : '');
  } else sp.hidden = true;
  placeT -= dt;
  if (placeT <= 0 && G.state !== 'room') { placeT = 0.6; const o = {}, e = world.nearestEdge(P.x, P.z, 40, null, o); $('placeRoad').textContent = (e && e.name) || '　'; $('placeDist').textContent = world.districtAt(P.x, P.z) || '臺北市外'; }
  else if (G.state === 'room') { $('placeRoad').textContent = '家裡'; $('placeDist').textContent = districtName(G.cfg.di); }
  // 小地圖：買了導航才有；開車在駕駛座時導航改在車內螢幕上。還沒買導航只能按 M 看全螢幕地圖
  const showMini = econ.has('nav') && !(G.state === 'drive' && G.camMode === 'cockpit');
  if ($('mini').hidden === showMini) $('mini').hidden = !showMini;
  miniT -= dt; if (miniT <= 0 && showMini) { miniT = 0.1; drawMini(); }
}
/** 車內螢幕的導航地圖（買了導航才有）：車頭朝上、跟著轉，藍線是路線。 */
function navScreenMap(g, x, y, w, h) {
  const cx = car.x, cz = car.z, head = car.psi, scale = h / 380, ax = x + w * 0.5, ay = y + h * 0.74;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#121a20'; g.fillRect(x, y, w, h);
  g.translate(ax, ay); g.rotate(head); g.scale(scale, scale); g.translate(-cx, -cz);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const span = Math.max(w, h) / scale, lists = [[], [], [], [], [], [], [], []];
  world.forEdgesNear(cx, cz, span, (e) => lists[e.cls].push(e));
  for (let cls = 7; cls >= 0; cls--) {
    g.strokeStyle = ROADCOL[cls]; g.lineWidth = ROADW[cls] * 1.1 / scale; g.beginPath();
    for (const e of lists[cls]) { const p = e.pts; g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); }
    g.stroke();
  }
  const r = G.routePoly;
  if (r) { g.strokeStyle = 'rgba(70,165,255,0.95)'; g.lineWidth = 6 / scale; g.beginPath(); g.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) g.lineTo(r[i], r[i + 1]); g.stroke(); }
  g.restore();
  g.fillStyle = '#fff'; g.strokeStyle = '#10141a'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay - 12); g.lineTo(ax + 8, ay + 9); g.lineTo(ax, ay + 4); g.lineTo(ax - 8, ay + 9); g.closePath(); g.fill(); g.stroke();
}
const ROADCOL = ['#e9c46a', '#e9c46a', '#f1f3f4', '#d7dbdf', '#b9c0c6', '#8f99a3', '#6b757e', '#d7dbdf'], ROADW = [5, 5, 4.5, 4, 3.2, 2.4, 1.6, 2.6];
function drawMini() {
  const cv = $('mini'), g = cv.getContext('2d'), S = cv.width, R = S / 2;
  const inCar = G.state === 'drive', cx = inCar ? car.x : P.x, cz = inCar ? car.z : P.z, head = inCar ? car.psi : (G.state === 'walk' ? tp.yaw : 0);
  const scale = R / (inCar ? 300 : 160);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#10141a'; g.fillRect(0, 0, S, S);
  if (G.state === 'room') { g.fillStyle = '#9aa6b0'; g.font = '700 26px "Noto Sans TC", sans-serif'; g.textAlign = 'center'; g.fillText('家', R, R + 8); return; }
  g.save(); g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
  g.translate(R, R); g.rotate(head); g.scale(scale, scale); g.translate(-cx, -cz);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const span = R / scale * 1.45, lists = [[], [], [], [], [], [], [], []];
  world.forEdgesNear(cx, cz, span, (e) => { if (Math.abs(e.pts[0] - cx) < span + 250 && Math.abs(e.pts[1] - cz) < span + 250) lists[e.cls].push(e); });
  for (let cls = 7; cls >= 0; cls--) {
    g.strokeStyle = ROADCOL[cls]; g.lineWidth = Math.max(ROADW[cls] / scale * 0.9, ROADW[cls] * 1.6); g.beginPath();
    for (const e of lists[cls]) { const p = e.pts; g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); }
    g.stroke();
  }
  const r = econ.has('nav') ? G.routePoly : null;
  if (r && G.phase === 'drive') { g.strokeStyle = 'rgba(80,170,255,0.9)'; g.lineWidth = Math.max(6, 9 / scale * 0.5); g.beginPath(); g.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) g.lineTo(r[i], r[i + 1]); g.stroke(); }
  if (G.state === 'walk' && G.phase !== 'toCar') { g.fillStyle = '#6fd3ff'; g.beginPath(); g.arc(car.x, car.z, 4 / scale, 0, Math.PI * 2); g.fill(); }
  g.restore();
  const d = dest(), tgt = G.phase === 'toCar' || (G.phase === 'toDest' && G.parked && !G.parked.legal) ? car : d;
  const dx = tgt.x - cx, dz = tgt.z - cz, c = Math.cos(head), s = Math.sin(head);
  let mx = (dx * c - dz * s) * scale, mz = (dx * s + dz * c) * scale; const dd = Math.hypot(mx, mz), lim = R - 12, inside = dd < lim;
  if (!inside) { mx *= lim / dd; mz *= lim / dd; }
  g.fillStyle = tgt === car ? '#6fd3ff' : '#f5c518'; g.strokeStyle = '#10141a'; g.lineWidth = 3; g.beginPath(); g.arc(R + mx, R + mz, inside ? 9 : 7, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(R, R - 12); g.lineTo(R + 8, R + 9); g.lineTo(R, R + 4); g.lineTo(R - 8, R + 9); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 20px "Barlow Semi Condensed", sans-serif'; g.textAlign = 'center';
  g.fillText('N', R + Math.sin(head) * (R - 16), R - Math.cos(head) * (R - 16) + 7);
}
let mapT = 0, mapBase = null;
function toggleBigMap(force) {
  const el = $('bigmap'), show = force !== undefined ? force : el.hidden;
  el.hidden = !show; if (!show) return;
  input.releaseLock();
  const cv = $('bigCv'), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  mapBase = null; mapT = 0; drawMap();
  if (G.state === 'drive' && Math.abs(car.v) > 1) toast('看地圖時車子還在開！', 2);
}
/** 全市地圖：行政區＋道路（第一次畫好存起來），每 0.25 秒更新你的位置。 */
function drawMap() {
  const cv = $('bigCv'), dpr = Math.min(2, window.devicePixelRatio || 1), [x0, z0, x1, z1] = meta.bounds;
  const sc = Math.min(cv.width / (x1 - x0), cv.height / (z1 - z0)) * 0.94;
  const ox = (cv.width - (x1 - x0) * sc) / 2 - x0 * sc, oz = (cv.height - (z1 - z0) * sc) / 2 - z0 * sc;
  const X = (x) => x * sc + ox, Z = (z) => z * sc + oz;
  if (!mapBase || mapBase.width !== cv.width || mapBase.height !== cv.height || (!mapBase.roads && nav)) {
    const b = document.createElement('canvas'); b.width = cv.width; b.height = cv.height; const g = b.getContext('2d');
    g.fillStyle = '#0d1115'; g.fillRect(0, 0, b.width, b.height);
    meta.districts.forEach((d, i) => {
      g.beginPath();
      for (const r of d.poly) { for (let k = 0; k < r.length; k += 2) k ? g.lineTo(X(r[k]), Z(r[k + 1])) : g.moveTo(X(r[k]), Z(r[k + 1])); g.closePath(); }
      g.fillStyle = i === G.cfg.di ? '#1d4a3c' : '#1c232b'; g.fill(); g.strokeStyle = '#3a4652'; g.lineWidth = 2 * dpr; g.stroke();
    });
    if (nav) {
      // 道路：大馬路粗、巷道細
      for (const [cmax, col, w] of [[6, 'rgba(150,165,178,.28)', 0.6], [4, 'rgba(190,200,210,.55)', 1.1], [2, 'rgba(235,225,190,.85)', 1.8]]) {
        g.strokeStyle = col; g.lineWidth = w * dpr; g.beginPath();
        for (let k = 0; k < nav.E; k++) { const c = nav.ecls[k]; if (c > cmax || (cmax === 4 && c <= 2) || (cmax === 6 && c <= 4)) continue; const a = nav.ea[k], e = nav.eb[k]; g.moveTo(X(nav.nx[a]), Z(nav.nz[a])); g.lineTo(X(nav.nx[e]), Z(nav.nz[e])); }
        g.stroke();
      }
    }
    meta.districts.forEach((d) => { g.fillStyle = '#c3ccd4'; g.font = `700 ${13 * dpr}px "Noto Sans TC", sans-serif`; g.textAlign = 'center'; g.strokeStyle = 'rgba(13,17,21,.85)'; g.lineWidth = 4 * dpr; g.strokeText(d.name, X(d.c[0]), Z(d.c[1])); g.fillText(d.name, X(d.c[0]), Z(d.c[1])); });
    b.roads = !!nav; mapBase = b;
  }
  const g = cv.getContext('2d');
  g.drawImage(mapBase, 0, 0);
  if (econ.has('nav') && G.routePoly) { const r = G.routePoly; g.strokeStyle = 'rgba(80,170,255,0.95)'; g.lineWidth = 3 * dpr; g.beginPath(); g.moveTo(X(r[0]), Z(r[1])); for (let i = 2; i < r.length; i += 2) g.lineTo(X(r[i]), Z(r[i + 1])); g.stroke(); }
  const dot = (x, z, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r * dpr, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#0d1115'; g.lineWidth = 2 * dpr; g.stroke(); };
  if (G.cfg.home) dot(G.cfg.home.x, G.cfg.home.z, '#4fd08c', 7);
  if (G.cfg.work) dot(G.cfg.work.x, G.cfg.work.z, '#f5c518', 8);
  const inCar = G.state === 'drive', px = inCar ? car.x : P.x, pz = inCar ? car.z : P.z, hd = inCar ? car.psi : P.yaw;
  if (G.state !== 'room') { g.save(); g.translate(X(px), Z(pz)); g.rotate(-hd); g.fillStyle = '#fff'; g.strokeStyle = '#0d1115'; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(0, -13 * dpr); g.lineTo(9 * dpr, 10 * dpr); g.lineTo(0, 5 * dpr); g.lineTo(-9 * dpr, 10 * dpr); g.closePath(); g.fill(); g.stroke(); g.restore(); }
  if (inCar) { g.fillStyle = Math.abs(car.v) > 1 ? '#ff6b5b' : '#9aa6b0'; g.font = `700 ${15 * dpr}px "Noto Sans TC", sans-serif`; g.textAlign = 'left'; g.fillText(Math.abs(car.v) > 1 ? `車子還在開：${Math.round(car.kmh)} km/h` : '車子停著', 14 * dpr, cv.height - 14 * dpr); }
}

// ===================================================================== 自動示範（選單按鈕或 F8）
let AUTO = location.hash.includes('autotest') ? { t: 0 } : null;
function startAuto() { if (!AUTO) AUTO = { t: 0 }; autoSay('啟動'); }
// 測試用：尖峰時段實測。放一台「通勤車」進車流（跟其他車一樣跟車、等紅燈、排隊），照導航路線開到目的地，量遊戲時間。
// mode：'gas'（一般車）或 'roadster'（塞住時飛越車陣，同一段路上最多 60 m，每趟最多飛 3 次＝不到半罐壓縮空氣）。
window.__tc.startMeasure = (o) => {
  const oo = {}, e = world.nearestEdge(o.from.x, o.from.z, 500, (ed) => ed.cls >= 1 && ed.cls <= 4 && !ed.bridge && !ed.tunnel, oo);
  if (!e || !nav) return null;
  const rt = nav.route({ edge: e, s: oo.s }, o.to); if (!rt || !rt.steps.length) return null;
  // 路線的第一段不是起點那條路（起點路段不在全市路網裡）：改從路線第一段的起點出發
  let e0 = e, s0 = oo.s;
  if (rt.steps[0].k !== e.id) { const e1 = world.edges.get(rt.steps[0].k); if (!e1) return null; e0 = e1; s0 = rt.steps[0].dir > 0 ? Math.min(e1.trimA + 2, e1.len / 2) : Math.max(e1.len - e1.trimB - 2, e1.len / 2); }
  const col = new THREE.Color(o.mode === 'roadster' ? 0xc4161c : 0x2f9e5a);
  const a = { e: e0, dir: rt.steps[0].dir, lane: 0, s: s0, v: 0, fac: 1, x: 0, y: 0, z: 0, psi: 0, turn: null, next: null, wait: 0, color: col, scale: 1,
    flyer: o.mode === 'roadster', hop: null, hopCd: 0, hopsLeft: o.mode === 'roadster' ? 3 : undefined, wreck: o.warm || 60, pitch: 0, agent: true, route: rt.steps, ri: 0 };
  e0.cars.push(a); traffic.cars.push(a);
  G.measure = { agent: a, mode: o.mode, to: o.to, endR: o.endR || 300, warm: o.warm || 60, t0: null, routeKm: rt.len / 1000, freeMin: rt.time / 60 * 6, done: false };
  G.state = 'measure'; if (car) car.group.visible = false;
  return { routeKm: +(rt.len / 1000).toFixed(2), freeFlowGameMin: +(rt.time / 60 * 6).toFixed(1), road: e.name };
};
function measureFrame(dt) {
  const M = G.measure, a = M.agent;
  world.update(a.x, a.z, dt); parking.update(dt, a.x, a.z);
  traffic.update(dt, a.x, a.z, null);
  traffic.events.length = 0;
  if (drones) drones.update(dt, a.x, a.z, null);
  if (M.t0 === null) { M.warm -= dt; if (M.warm <= 0) { a.wreck = 0; M.t0 = G.clock; M.km0 = 0; } }
  else {
    if (!M.lx) { M.lx = a.x; M.lz = a.z; M.km = 0; }
    M.km += Math.hypot(a.x - M.lx, a.z - M.lz) / 1000; M.lx = a.x; M.lz = a.z;
    M.stopT = (M.stopT || 0) + (a.v < 0.5 ? dt : 0);
    if (!M.done && (Math.hypot(a.x - M.to.x, a.z - M.to.z) < M.endR || a.arrived)) { M.done = true; M.min = G.clock - M.t0; M.hops = 3 - (a.hopsLeft ?? 3); M.wrecked = !!a.wrecked; }
  }
  if (a.wreck > 0 && M.t0 !== null) a.wrecked = true;
  const fx = -Math.sin(a.psi), fz = -Math.cos(a.psi);
  camera.position.set(a.x - fx * 12, a.y + 6, a.z - fz * 12); camera.lookAt(a.x, a.y + 1, a.z);
  P.x = a.x; P.z = a.z; P.y = a.y;
}
// 測試用：設定自動駕駛（含「實測模式」：遵守紅燈、跟車排隊、到了記錄時間；跑車塞住時飛越；無人機一開始就升空）
window.__tc.setAuto = (o) => { AUTO = o; };
window.addEventListener('keydown', (e) => { if (e.code === 'F8' && !AUTO) { startAuto(); if (G.state === 'menu') { autoPick(); newGame(); } } });
function autoPick() {
  if (G.cfg.home && G.cfg.work) return;
  const di = G.cfg.di >= 0 ? G.cfg.di : Math.floor(Math.random() * meta.districts.length), hs = meta.homes[di];
  for (let k = 0; k < hs.length; k++) { const h = hs[(k + Math.floor(Math.random() * hs.length)) % hs.length], ws = workCands(h); if (ws.length) { G.cfg = { di, home: h, work: ws[Math.floor(Math.random() * ws.length)] }; return; } }
}
let autoLbl = null;
function autoSay(msg) {
  if (!autoLbl) { autoLbl = document.createElement('div'); autoLbl.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99;background:#c0392b;color:#fff;font:700 15px/1.4 sans-serif;padding:6px 14px;border-radius:8px;pointer-events:none'; document.body.appendChild(autoLbl); }
  autoLbl.textContent = '自動示範：' + msg;
}
function autoKeys(...codes) { for (const c of ['KeyW', 'KeyA', 'KeyD', 'KeyS', 'ShiftLeft', 'KeyZ', 'KeyX']) input.keys.delete(c); for (const c of codes) if (c) input.keys.add(c); }
function walkPath(a, b) {
  const S = 1.5, pad = 60, x0 = Math.min(a.x, b.x) - pad, z0 = Math.min(a.z, b.z) - pad;
  const W = Math.ceil((Math.max(a.x, b.x) + pad - x0) / S), H = Math.ceil((Math.max(a.z, b.z) + pad - z0) / S);
  if (W * H > 250000) return null;
  const block = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S;
    if (world.buildingAt(x, z) || world.buildingAt(x + 0.6, z) || world.buildingAt(x - 0.6, z) || world.buildingAt(x, z + 0.6) || world.buildingAt(x, z - 0.6)) block[j * W + i] = 1;
  }
  const id = (x, z) => Math.max(0, Math.min(H - 1, Math.floor((z - z0) / S))) * W + Math.max(0, Math.min(W - 1, Math.floor((x - x0) / S)));
  for (const o of gatherObstacles((a.x + b.x) / 2, (a.z + b.z) / 2, Math.hypot(a.x - b.x, a.z - b.z) / 2 + pad)) for (const off of [1.3, 0, -1.3]) {
    const px = o.x - Math.sin(o.psi) * off, pz = o.z - Math.cos(o.psi) * off;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const x = px + dx * S * 0.6, z = pz + dz * S * 0.6; if (Math.hypot(x - px, z - pz) < 1.9) block[id(x, z)] = 1; }
  }
  const st = id(a.x, a.z), gl = id(b.x, b.z); block[st] = 0; block[gl] = 0;
  const g = new Float32Array(W * H).fill(1e9), from = new Int32Array(W * H).fill(-1), open = [[0, st]]; g[st] = 0;
  const hx = (k) => Math.hypot(k % W - gl % W, Math.floor(k / W) - Math.floor(gl / W));
  let guard = 0;
  while (open.length && guard++ < 60000) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, k] = open.splice(bi, 1)[0]; if (k === gl) break;
    const ci = k % W, cj = Math.floor(k / W);
    for (const [di, dj, c] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) {
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = nj * W + ni; if (block[nk]) continue;
      const ng = g[k] + c; if (ng < g[nk]) { g[nk] = ng; from[nk] = k; open.push([ng + hx(nk), nk]); }
    }
  }
  if (from[gl] < 0) return null;
  const out = []; for (let k = gl; k !== st && k >= 0; k = from[k]) out.push({ x: x0 + (k % W + 0.5) * S, z: z0 + (Math.floor(k / W) + 0.5) * S });
  return out.reverse().filter((_, i, arr) => i % 2 === 0 || i === arr.length - 1);
}
/** 示範用路線：導航路線往右偏半個車道（大路），每 2 m 一個點。 */
function demoPoly(src) {
  const N = src.length / 2, res = src.slice(), q = {};
  for (let k = 1; k < N; k++) {
    const ed = world.nearestEdge(src[k * 2], src[k * 2 + 1], 6, null, q);
    // 雙向道靠右開：大路偏半個車道；巷道偏一點點（路邊有停車，不能偏太多）
    const off = ed && !ed.oneway ? (ed.cls <= 4 ? Math.min(1.8, ed.width / 4) : ed.cls === 5 ? Math.min(0.8, ed.width / 6) : 0) : 0; if (!off) continue;
    const a = Math.max(0, k - 1), b = Math.min(N - 1, k + 1), dx = src[b * 2] - src[a * 2], dz = src[b * 2 + 1] - src[a * 2 + 1], L = Math.hypot(dx, dz) || 1;
    res[k * 2] = src[k * 2] - dz / L * off; res[k * 2 + 1] = src[k * 2 + 1] + dx / L * off;
  }
  const dense = [res[0], res[1]];
  for (let k = 1; k < N; k++) {
    const ax = res[k * 2 - 2], az = res[k * 2 - 1], bx = res[k * 2], bz = res[k * 2 + 1], L = Math.hypot(bx - ax, bz - az), m = Math.ceil(L / 2);
    for (let j = 1; j <= m; j++) dense.push(ax + (bx - ax) * j / m, az + (bz - az) * j / m);
  }
  return dense;
}
function routeTarget(x, z, ahead) {
  const r = AUTO.poly; if (!r) return null;
  const i0 = AUTO.ri || 0;
  let bi = i0, bd = 1e18; for (let i = i0; i < Math.min(r.length, i0 + 120); i += 2) { const d = (r[i] - x) ** 2 + (r[i + 1] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  AUTO.ri = bi;
  let acc = 0, i = bi; while (i + 2 < r.length && acc < ahead) { acc += Math.hypot(r[i + 2] - r[i], r[i + 3] - r[i + 1]); i += 2; }
  return { x: r[i], z: r[i + 1] };
}
function autoTest(dt) {
  AUTO.t += dt;
  if (G.state === 'room') {
    autoSay('走到房門口出門');
    const dx = room.door.x - P.x, dz = room.door.z - P.z;
    tp.yaw = Math.atan2(-dx, -dz);
    if (Math.hypot(dx, dz) > 1.0) autoKeys('KeyW'); else { autoKeys(); input.hit.add('KeyE'); }
    return;
  }
  if (G.state === 'walk') {
    const tgt = G.phase === 'toCar' ? car : dest();
    if (!AUTO.path || AUTO.pathFor !== G.phase + G.leg) { AUTO.path = walkPath(P, tgt) || [{ x: tgt.x, z: tgt.z }]; AUTO.pathFor = G.phase + G.leg; }
    let wp = AUTO.path[0];
    while (AUTO.path.length > 1 && Math.hypot(wp.x - P.x, wp.z - P.z) < 1.6) { AUTO.path.shift(); wp = AUTO.path[0]; }
    autoSay(G.phase === 'toCar' ? `走向車子，剩 ${dist(P, car).toFixed(0)} m` : `走向${destName()}，剩 ${dist(P, tgt).toFixed(0)} m`);
    tp.yaw = Math.atan2(-(wp.x - P.x), -(wp.z - P.z));
    if (G.phase === 'toCar' && dist(P, car) < 2.6) { autoKeys(); input.hit.add('KeyE'); AUTO.t = 0; AUTO.poly = null; return; }
    autoKeys('KeyW', 'ShiftLeft'); return;
  }
  if (G.state !== 'drive') return;
  if (G.seatAdj) { autoSay('駕駛座調整畫面'); if (AUTO.t > 2.5) $('seatGo').click(); return; }
  if (!AUTO.poly) { if (!G.routePoly) planRoute(); if (!G.routePoly) { autoKeys(); return; } AUTO.poly = demoPoly(G.routePoly); AUTO.ri = 0; window.__tc.autoPoly = AUTO.poly; }
  const dd = dist(car, dest()), M = AUTO.measure;
  if (M) {
    if (M.t0 === undefined) { M.t0 = G.clock; M.km0 = car.odo; M.jumps = 0; M.crash0 = econ.day.repair || 0; }
    if (M.mode === 'drone' && !M.flew && !flight.active) {
      const msg = flight.canStart(stunts && stunts.busy);
      if (!msg && flight.start(drones)) M.flew = true; else if (msg) { autoKeys('KeyW'); M.droneMsg = msg; }
      return;
    }
    if (flight.active) { autoKeys(); return; }
    if (M.flew && !M.replanned) { M.replanned = true; M.flightMin = G.clock - M.t0; AUTO.poly = null; G.routePoly = null; planRoute(); return; }   // 降落後：從降落點重新規劃
    if (stunts && stunts.busy) { autoKeys(); return; }
    if (dd < (M.endR || 160) && !M.done) {
      Object.assign(M, { done: true, min: G.clock - M.t0, km: (car.odo - M.km0) / 1000, repair: (econ.day.repair || 0) - M.crash0, stunt: Math.round(econ.day.stunt), drone: Math.round(econ.day.drone) });
      autoKeys(); return;
    }
    if (M.done) { autoKeys(car.v > 0.3 ? 'KeyS' : null); return; }
    if (dd >= 160 && AUTO.poly && AUTO.ri >= AUTO.poly.length - 4) { AUTO.poly = null; G.routePoly = null; planRoute(); return; }   // 路線跑完了但還沒到（例如無人機降落後）：重新規劃
  }
  // 快到了：示範直接停進最近的空車格
  if (dd < 160) {
    autoSay('到了，停進車格');
    if (car.v > 0.4) { autoKeys('KeyS'); return; }
    autoKeys();
    let best = null; parking.forBaysNear(car.x, car.z, 200, (b, d2) => { if (!b.occupied && !b.reserved && bayAllowed(b) && dist(b, dest()) < 440 && (!best || d2 < best.d2)) best = { b, d2 }; });
    if (best) { car.place(best.b.x, best.b.z, best.b.psi, best.b.y); input.hit.add('KeyE'); AUTO.path = null; }
    return;
  }
  const far = routeTarget(car.x, car.z, 18); if (!far) { autoKeys(); return; }
  const heading = Math.atan2(car.fwdX, -car.fwdZ), ang = (p) => { const d = Math.atan2(p.x - car.x, -(p.z - car.z)) - heading; return Math.atan2(Math.sin(d), Math.cos(d)); };
  const turning = Math.abs(ang(far)) > 0.5, vMax = turning ? 4 : (car.edge && car.edge.cls <= 2 ? 13 : 9);
  const tg = routeTarget(car.x, car.z, car.v < 4.5 ? 5 : 10), e = ang(tg);
  // 倒車時把方向盤往反方向打，車頭就會轉向路線（倒車的轉向跟前進相反）
  if (AUTO.rev > 0) { AUTO.rev -= dt; autoSay('卡住了，倒車一下'); autoKeys('KeyS', e > 0.1 ? 'KeyA' : e < -0.1 ? 'KeyD' : null); return; }
  AUTO.stuckT = car.v < 0.4 ? (AUTO.stuckT || 0) + dt : 0;
  let block = false;
  for (const o of traffic.cars) {
    if (Math.abs(o.x - car.x) > 24 || Math.abs(o.z - car.z) > 24) continue;
    const dx = o.x - car.x, dz = o.z - car.z, fwd = dx * car.fwdX + dz * car.fwdZ, lat = Math.abs(dx * car.fwdZ - dz * car.fwdX);
    const opp = -Math.sin(o.psi) * car.fwdX + -Math.cos(o.psi) * car.fwdZ < -0.5;   // 對向來車：只有正對著才算擋住
    if (fwd > 1 && fwd < 6 + Math.max(0, car.v) * 1.6 && lat < (opp ? 1.5 : 2.1)) { block = true; break; }
  }
  const waitMax = M ? 40 : 6;     // 實測：排隊跟車要一直等（不是被路邊停的車擋住）
  if (block && M && stunts && car.v < 0.5 && AUTO.waitT > 2 && econ.stuntFuel >= 0.15 && !M.noJump) {
    // 飛天跑車：塞住了，前面 100 m 內不轉彎、前面至少 3 台車 → 飛越
    const pr = polyProgress(G.routePoly || [], car.x, car.z, Math.max(0, G.routeIdx - 4), 300), nt = G.routePoly ? nextTurn(G.routePoly, pr, 400) : null;
    let ahead = 0; for (const o of traffic.cars) { const dx = o.x - car.x, dz = o.z - car.z, f = dx * car.fwdX + dz * car.fwdZ, l = Math.abs(dx * car.fwdZ - dz * car.fwdX); if (f > 1 && f < 70 && l < 2.5) ahead++; }
    if ((!nt || nt.dist > 100) && ahead >= 3) { input.hit.add('KeyF'); M.jumps++; AUTO.waitT = 0; autoKeys(); return; }
  }
  if (block) { AUTO.waitT = (AUTO.waitT || 0) + dt; AUTO.stuckT = 0; AUTO.pT = 0; if (AUTO.waitT < waitMax) { autoSay('前面有車，等一下'); autoKeys(car.v > 0.3 ? 'KeyS' : null); return; } if (AUTO.waitT < waitMax + 0.1) { AUTO.rev = 1.1; return; } }
  else AUTO.waitT = 0;
  // 實測：遵守紅綠燈（快到停止線、紅燈或來不及過的黃燈就停）
  if (M && car.edge && !car.edge.dead) {
    const e = car.edge, k = Math.max(0, Math.min(e.cum.length - 2, car._segI | 0)), tx = e.pts[k * 2 + 2] - e.pts[k * 2], tz = e.pts[k * 2 + 3] - e.pts[k * 2 + 1];
    const dir = tx * car.fwdX + tz * car.fwdZ >= 0 ? 1 : -1, stopS = dir > 0 ? e.len - e.trimB : e.trimA, toEnd = (stopS - car.edgeS) * dir;
    if ((dir > 0 ? e.sigB : e.sigA) && toEnd > 0 && toEnd < 30) {
      const sig = traffic.signalFor(e, dir);
      if (sig === 'r' || (sig === 'y' && toEnd > car.v * 1.5)) { autoSay('紅燈，停車等'); AUTO.stuckT = 0; AUTO.pT = 0; autoKeys(car.v > Math.max(0.3, Math.sqrt(Math.max(0, toEnd - 2) * 2 * 3)) ? 'KeyS' : (toEnd > 3 && car.v < 1.5 ? 'KeyW' : null)); return; }
    }
  }
  if (AUTO.stuckT > 1.2) { AUTO.stuckT = 0; AUTO.rev = 1.1; return; }
  // 一直踩油門卻沒前進（頂著牆或護欄慢慢磨）：每 3 秒檢查一次位移
  AUTO.pT = (AUTO.pT || 0) + dt;
  if (AUTO.pT > 3) { const moved = Math.hypot(car.x - (AUTO.pX ?? car.x + 9), car.z - (AUTO.pZ ?? car.z)); AUTO.pT = 0; AUTO.pX = car.x; AUTO.pZ = car.z; if (moved < 1.2) { AUTO.rev = 1.4; AUTO.pX = undefined; return; } }
  autoSay(`沿導航路線開往${destName()}，剩 ${fmtDist(dd)}`);
  const keys = [];
  if (car.v < vMax) keys.push('KeyW'); else if (car.v > vMax + 1.5) keys.push('KeyS');
  if (e > 0.06) keys.push('KeyD'); else if (e < -0.06) keys.push('KeyA');
  autoKeys(...keys);
}

// ===================================================================== 主迴圈
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (window.__tc.manual) return;   // 錄影用：改由 __tc.advance() 一格一格推進
  frame(dt);
}
// 錄影用：每一格固定時間、跑 n 次遊戲邏輯，最後一次才畫（畫面跟正常遊戲一樣，只是不受電腦快慢影響）
window.__tc.advance = (dt, n = 1) => { for (let i = 0; i < n; i++) { window.__tc.noRender = i < n - 1; frame(dt); } window.__tc.noRender = false; };
let uiTime = 0;
function frame(dt) {
  frameN++; fpsTick(dt); uiTime += dt;
  if (toastT > 0 && uiTime > toastT) { toastT = 0; $('toast').hidden = true; }
  if (input.pressed('KeyH')) $('help').hidden = !$('help').hidden;
  if (input.pressed('KeyN')) { audioStart(); music.toggle(); toast(music.on ? '音樂：開' : '音樂：關', 1.2); }
  if (input.pressed('KeyB')) { audioStart(); engine.toggle(); toast(engine.on ? '引擎聲：開' : '引擎聲：關', 1.2); }
  if (input.pressed('KeyM') && ['walk', 'drive', 'room'].includes(G.state)) toggleBigMap();
  if (!$('shop').hidden) { if (!window.__tc.noRender) render(); input.endFrame(); return; }
  // 全螢幕地圖打開時遊戲不暫停：車子還在動就會繼續開（沒有導航只能這樣看地圖）
  const mapOpen = !$('bigmap').hidden;
  if (mapOpen) { mapT -= dt; if (mapT <= 0) { mapT = 0.25; drawMap(); } }
  music.setStyle(G.demo ? 'cyber' : 'drive');   // 看示範：賽博龐克電子樂
  music.update(G.state === 'drive' ? (G.seatAdj ? 'walk' : 'drive') : G.state === 'summary' ? 'done' : G.state === 'menu' ? 'title' : 'walk', car ? car.v : 0);
  const st = G.state;
  // 測試用快轉：window.__tc.steps > 1 時，每一幀跑好幾次遊戲邏輯（只畫一次）。正常遊戲是 1。
  const steps = Math.max(1, Math.min(12, window.__tc.steps | 0 || 1));
  if (G.demo && input.pressed('Escape')) endDemo();
  if (demo && G.state === 'drive') demo.tick(dt * steps);
  for (let k = 0; k < steps && G.state === st; k++) {
    if (k > 0) { input.hit.clear(); input.lookX = 0; input.lookY = 0; }
    if (st === 'menu') menuFrame(dt);
    else if (st === 'loading') loadingFrame(dt);
    else if (st === 'room') { if (AUTO) autoTest(dt); roomFrame(dt); }
    else if (st === 'walk') { if (AUTO) autoTest(dt); walkFrame(dt); }
    else if (st === 'drive') { if (AUTO) autoTest(dt); driveFrame(dt); }
    else if (st === 'summary' || st === 'work') { world.update(P.x, P.z, dt); }
    else if (st === 'measure') measureFrame(dt);
    if (['walk', 'drive', 'room', 'measure'].includes(st)) G.clock += dt * TIME.scale / 60;
    if (ctl && G.mode === 'hybrid' && ['walk', 'drive', 'room'].includes(st)) ctlTick(dt);
  }
  if (['walk', 'drive', 'room'].includes(st)) hud(dt);
  if (st === 'drive' || st === 'walk' || mist.n) mist.update(dt, camera, canvas.clientHeight || innerHeight, (x, z, y) => world.groundAt(x, z, y));
  if (input.touch) {
    const drv = st === 'drive' && G.camMode === 'cockpit' && !G.seatAdj;
    const flyingNow = !!(flight && flight.active), busyNow = flyingNow || !!(stunts && stunts.busy);
    const stn = st === 'drive' && !!stunts && !G.seatAdj && !flyingNow;
    const airOut = econ.stuntFuel <= 1e-4;
    // 飛天跑車的按鈕：只在用得到的時候出現（推進：在地面；飛越：停著或很慢、或在屋頂；翻轉：在空中；吸附：面對大樓或在高架橋下）
    const sm = stunts ? stunts.mode : 'ground', slowNow = Math.abs(car ? car.v : 0) < 4.2;
    G.gripT = (G.gripT || 0) - dt;
    if (G.gripT <= 0) { G.gripT = 0.3; G.gripOk = !!(stn && sm === 'ground' && (stunts._deckAbove(car.x, car.z, car.y, 3.9) || stunts._wallAhead(car.x, car.z, car.psi, 5.5, car.y))); }
    const vis = { btnBoost: stn && sm === 'ground', btnJump: stn && ((sm === 'ground' && slowNow) || sm === 'roof'), btnFlip: stn && sm === 'air', btnGrip: stn && (G.gripOk || ['wall', 'under', 'roof'].includes(sm)) };
    for (const id of ['btnBoost', 'btnJump', 'btnGrip', 'btnFlip']) { const el = $(id); if (!el) continue; if (el.hidden === vis[id]) el.hidden = !vis[id]; el.classList.toggle('off', airOut || (id === 'btnJump' && econ.stuntFuel < 1 / AIR.jumpsPerTank - 1e-6)); }
    const hyb = G.mode === 'hybrid' && !!ctl;   // 路空總控：開著也能問總控
    const dbt = $('btnDrone'), showDr = st === 'drive' && !G.seatAdj && econ.has('drone') && car.spec.key === 'roadster' && (flyingNow || hyb || Math.abs(car.v) < 3);
    if (dbt) {
      if (dbt.hidden === showDr) dbt.hidden = !showDr;
      const lb = flyingNow ? '取消飛行' : hyb ? (G.ctl && G.ctl.armed && ctl.t - G.ctl.at < 10 ? '現在飛' : '問總控') : '無人機';
      if (dbt.textContent !== lb) dbt.textContent = lb;
    }
    for (const id of ['btnMirL', 'btnMirR']) { const el = $(id), on = drv && mirrorBtns; if (el && el.hidden === on) el.hidden = !on; }
    const act = $('btnAct'), lab = st === 'walk' ? (car && dist(P, car) < 3.0 ? '上車' : 'E') : st === 'drive' ? (G.seatAdj ? '開車' : Math.abs(car.v) < 0.4 && !busyNow ? '下車' : 'E') : st === 'room' ? '出門' : 'E';
    if (act && act.textContent !== lab) act.textContent = lab;
    const bc = $('btnCenter'), showC = !!(drv && cockpit && (Math.abs(cockpit.lookYaw) > 0.05 || Math.abs(cockpit.lookPitch) > 0.05) && !G.glance);
    if (bc && bc.hidden === showC) bc.hidden = !showC;
  }
  if (!window.__tc.noRender && !mapOpen) render();
  input.endFrame();
}
function menuFrame(dt) {
  const t = G.menuTarget, c = G.menuCenter;
  c.x += (t.x - c.x) * Math.min(1, dt * 1.2); c.z += (t.z - c.z) * Math.min(1, dt * 1.2);
  G.menuR = (G.menuR || t.r) + (t.r - (G.menuR || t.r)) * Math.min(1, dt * 1.2);
  G.menuH = (G.menuH || t.h) + (t.h - (G.menuH || t.h)) * Math.min(1, dt * 1.2);
  G.menuAngle += dt * 0.06;
  const gy = world.groundAt(c.x, c.z, G.menuGy || 0); G.menuGy = (G.menuGy || gy) + (gy - (G.menuGy || gy)) * Math.min(1, dt * 1.5);
  camera.position.set(c.x + Math.sin(G.menuAngle) * G.menuR, G.menuH + G.menuGy, c.z + Math.cos(G.menuAngle) * G.menuR);
  camera.lookAt(c.x, G.menuGy, c.z);
  world.update(c.x, c.z, dt); parking.update(dt, c.x, c.z); signs.update(dt, c.x, c.z);
}
function loadingFrame(dt) {
  const f = G.focus;
  world.update(f.x, f.z, dt, 14); parking.update(dt, f.x, f.z); parking.update(0, f.x, f.z);
  const pend = world.pending + parking.pending.length;
  G.loadMax = Math.max(G.loadMax || 0, pend);
  $('loadFill').style.width = (G.loadMax ? 100 * (1 - pend / G.loadMax) : 100).toFixed(0) + '%';
  const fg = world.groundAt(f.x, f.z);
  camera.position.set(f.x + 60, fg + 70, f.z + 60); camera.lookAt(f.x, fg, f.z);
  if (G.wait && G.wait.cond()) { const w = G.wait; G.wait = null; G.loadMax = 0; w.then(); }
}
function render() {
  if (G.state === 'room') { renderer.clear(); renderer.render(room.scene, camera); return; }
  if (window.__tc.camHook) window.__tc.camHook(camera);   // 錄影用：自訂鏡頭
  sky.position.copy(camera.position);
  ground.position.set(Math.round(camera.position.x / 50) * 50, -15, Math.round(camera.position.z / 50) * 50);
  const inCar = G.state === 'drive', fx = inCar ? car.x : P.x, fz = inCar ? car.z : P.z, fy = inCar ? car.y : P.y;
  const sx = Math.round(fx / 4) * 4, sz = Math.round(fz / 4) * 4;
  sun.target.position.set(sx, fy, sz); sun.position.set(sx + SUN_DIR.x * 260, fy + SUN_DIR.y * 260, sz + SUN_DIR.z * 260);
  sun.target.updateMatrixWorld();
  const cockpitOn = inCar && G.camMode === 'cockpit';
  const mirrorEvery = comfort.quality === 'smooth' ? 3 : 1;
  if (cockpitOn && !location.hash.startsWith('#lowq') && frameN % mirrorEvery === 0) {
    const k = (frameN / mirrorEvery | 0) % 3, m = k === 0 ? { rt: cockpit.mirrorRT, cam: cockpit.mirrorCam } : k === 1 ? cockpit.mirrorL : cockpit.mirrorR;
    const sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(m.rt); renderer.clear(); renderer.render(scene, m.cam); renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = sm; renderer.shadowMap.needsUpdate = true;
  }
  renderer.clear(); renderer.render(scene, camera);
  if (cockpitOn) { renderer.clearDepth(); renderer.render(cockpit.scene, cockpit.cam); }
}

boot();
