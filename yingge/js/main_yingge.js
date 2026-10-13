// 布丁狗去鶯歌 — 小遊戲：從蘆洲重陽公園走到車旁、開著雪鐵龍布丁狗到鶯歌捷運站，停好車走進車站。
import { Music } from './music.js';
import * as THREE from '../lib/three.module.min.js';
import { World } from './world.js';
import { Parking } from './parking.js';
import { Traffic } from './traffic.js';
import { PlayerCar, Cockpit, carSpec } from './vehicles.js';
import { Input } from './input.js';
import { Avatar } from './avatar.js';
import { ThirdPersonCam } from './tpcam.js';
import { SignManager, genShopName, genVerticalName } from './signs.js';
import { VIEW, PARK } from './config.js';

const $ = (id) => document.getElementById(id);
const BEST_KEY = 'yingge-pudding-best';
const best = { get() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(BEST_KEY, JSON.stringify(v)); } catch (e) { /* 存不了也沒關係 */ } } };

// ===================================================================== 場景與光線
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const HAZE = new THREE.Color(0xd9d4c8);
scene.fog = new THREE.Fog(HAZE, VIEW.fogNear, VIEW.fogFar);
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 2600);

const sky = new THREE.Mesh(new THREE.SphereGeometry(2300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x4f86c6) }, mid: { value: new THREE.Color(0xa9c4dd) }, hor: { value: new THREE.Color(0xeedcc2) }, sunDir: { value: new THREE.Vector3() } },
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
const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();      // 下午，太陽在西南方
sky.material.uniforms.sunDir.value.copy(SUN_DIR);
const sun = new THREE.DirectionalLight(0xffe4bd, 2.5);
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

// ===================================================================== 狀態
const input = new Input(canvas, $('touch'));
const music = new Music();
// 手機：按住「左鏡／右鏡」＝鍵盤按住 Z／X；「座椅」＝ V
for (const [id, code] of [['btnMirL', 'KeyZ'], ['btnMirR', 'KeyX']]) {
  const el = $(id); if (!el) continue;
  el.addEventListener('touchstart', (e) => { input.keys.add(code); e.preventDefault(); }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) el.addEventListener(ev, (e) => { input.keys.delete(code); e.preventDefault(); }, { passive: false });
}
if ($('btnSeat')) $('btnSeat').addEventListener('touchstart', (e) => { input.hit.add('KeyV'); e.preventDefault(); }, { passive: false });
const musicBtn = () => { const b = $('btnMusic'); if (b) { b.textContent = music.on ? '♪ 音樂 開' : '♪ 音樂 關'; b.setAttribute('aria-pressed', music.on ? 'true' : 'false'); } };
music.onChange = musicBtn;
const G = { state: 'boot', cam: 'cockpit', t0: 0, elapsed: 0, phase: 'toCar', parked: null };
const P = { x: 0, y: 0, z: 0, yaw: 0, speed: 0 };
let world, parking, traffic, signs, car, cockpit, avatar, tp, meta, M;
window.__tc = { G, P, renderer, scene, camera };
if (location.hash.startsWith('#lowq')) { renderer.shadowMap.enabled = false; renderer.setPixelRatio(0.75); }

function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
const fmtDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let toastT = 0;
function toast(msg, sec = 3) { const t = $('toast'); t.textContent = msg; t.hidden = false; toastT = performance.now() + sec * 1000; }
function setPrompt(html, cls = '') { const p = $('prompt'); if (!html) { p.hidden = true; return; } if (p._h !== html) { p.innerHTML = html; p._h = html; } p.className = cls; p.hidden = false; }
function fadeThen(fn) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), 60); }, 360); }

// ===================================================================== 啟動
async function boot() {
  resize();
  try { const r = await fetch('data/meta.json'); if (!r.ok) throw new Error(r.status); meta = await r.json(); }
  catch (err) { $('loadText').textContent = '地圖資料載入失敗'; $('loadSub').textContent = '請透過網頁伺服器開啟這個資料夾。'; return; }
  M = meta.mission;
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
  for (const m of world.root.children) m.castShadow = false;   // 遠景剪影不投影
  tp = new ThirdPersonCam(camera);
  Object.assign(window.__tc, { world, parking, traffic, signs, tp, M });
  avatar = await Avatar.load('models/hero.json');
  if (avatar) avatar.attach(scene);
  window.__tc.avatar = avatar;
  if (!avatar) setTimeout(() => toast('人物模型載入失敗：' + (Avatar.lastError || '未知原因'), 12), 4000);
  buildRoutePick();
  const b = best.get(); if (b) $('bestInfo').textContent = `最佳紀錄 ${fmtTime(b.t)}`;
  $('btnStart').onclick = () => start();
  $('btnMusic').onclick = () => { music.start(); music.toggle(); }; musicBtn();
  $('btnAgain').onclick = () => { $('summary').hidden = true; start(); };
  G.state = 'title'; $('loading').hidden = true;
  requestAnimationFrame(loop);
}
// ===================================================================== 導航路線選擇
const ROUTE_INFO = {
  fastest: ['最快', '國道 1 號 → 台 65 → 國道 3 號 → 三鶯交流道'],
  huankuai: ['新北環快', '集賢路 → 新北環河快速道路 → 中和交流道上國道 3 號 → 三鶯交流道'],
  surface: ['不走快速道路', '重陽路 → 重新橋 → 新莊中正路 → 新樹路 → 中山路'],
  shortest: ['距離最短', '永安北路 → 堤外道路 → 大安路 → 中山路'],
};
const ROUTE_KEY = 'yingge-route';
let routeSel = (() => { try { return localStorage.getItem(ROUTE_KEY) || 'fastest'; } catch (err) { return 'fastest'; } })();
const curRoute = () => (M.routes && (M.routes[routeSel] || M.routes.fastest)) || null;
function buildRoutePick() {
  const box = $('routePick'), keys = ['fastest', 'huankuai', 'surface', 'shortest'].filter(k => M.routes && M.routes[k]);
  if (!keys.includes(routeSel)) routeSel = keys[0] || 'fastest';
  for (const k of keys) {
    const [nm, via] = ROUTE_INFO[k] || [k, ''], L = polyLen(M.routes[k]);
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="radio" name="route" value="${k}"${k === routeSel ? ' checked' : ''}><span>${nm}<em>${via}</em></span><small>${fmtDist(L)}</small>`;
    lab.querySelector('input').addEventListener('change', () => { routeSel = k; try { localStorage.setItem(ROUTE_KEY, k); } catch (err) { /* ignore */ } updateRouteInfo(); });
    box.appendChild(lab);
  }
  updateRouteInfo();
}
function updateRouteInfo() {
  const r = curRoute(), L = r ? polyLen(r) : dist(M.start, M.dest);
  $('routeInfo').textContent = `${M.start.name} → ${M.dest.name}　${(ROUTE_INFO[routeSel] || ['建議'])[0]}路線約 ${fmtDist(L)}`;
}
function polyLen(r) { let L = 0; for (let i = 2; i < r.length; i += 2) L += Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]); return L; }

function start() {
  music.start();
  $('title').hidden = true; $('loading').hidden = false; $('loadText').textContent = '載入蘆洲街區…';
  input.enabled = true;
  if (car) scene.remove(car.group);
  car = new PlayerCar(scene, world, carSpec('berlingo'));
  car.onBump = (s) => { if (s > 0.4) toast(s > 1.5 ? '碰！撞到了' : '擦撞', 1.3); };
  car.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  cockpit = new Cockpit(car.spec);
  cockpit.hemi.intensity = 5.0; cockpit.sun.intensity = 3.2;    // 色調映射後車內要多一點光
  window.__tc.car = car;
  traffic.clear(); parking.setDay(1);
  G.state = 'loading'; G.focus = { x: M.start.x, z: M.start.z };
  G.wait = () => world.readyAround(M.start.x, M.start.z, 300) && parking.readyAround(M.start.x, M.start.z, 200);
  G.then = () => {
    parking.setDay(1);
    // 布丁狗停在離公園最近的路邊車格
    let bay = null, bd = 1e18;
    parking.forBaysNear(M.start.x, M.start.z, 150, (b, d2) => { if (b.type === 'road' && d2 > 6 * 6 && d2 < bd) { bd = d2; bay = b; } });
    if (bay) { bay.reserved = true; bay.occupied = false; }
    if (bay) car.place(bay.x, bay.z, bay.psi, bay.y);
    else { const o = {}; world.nearestEdge(M.start.x, M.start.z, 150, e => e.cls >= 4 && !e.bridge, o); car.place(o.x || M.start.x, o.z || M.start.z, 0, world.groundAt(o.x, o.z)); }
    P.x = M.start.x; P.z = M.start.z; P.y = world.groundAt(P.x, P.z);
    P.yaw = Math.atan2(-(car.x - P.x), -(car.z - P.z)); tp.yaw = P.yaw;
    G.phase = 'toCar'; G.parked = null; G.elapsed = 0; G.startOdo = car.odo; G.startBumps = car.bumps;
    G.state = 'walk'; $('loading').hidden = true; $('hud').hidden = false;
    if (input.touch) $('touch').hidden = false;
    traffic.update(0.016, P.x, P.z, [], true);
    toast(`布丁狗停在${bay && bay.edge.name ? bay.edge.name + '的' : ''}路邊，跟著藍色光柱走過去`);
  };
}

// ===================================================================== 走路（第三人稱）
const _q = { x: 0, z: 0 }, _surf = { y: 0, edge: null, s: 0, lat: 0, i: 0, t: 0, _d2: 0 };
const obsList = [];
function gatherObstacles(x, z, R) {
  obsList.length = 0;
  for (const c of traffic.cars) if (Math.abs(c.x - x) < R && Math.abs(c.z - z) < R) obsList.push(c);
  for (const b of parking.parked) if (Math.abs(b.x - x) < R && Math.abs(b.z - z) < R) obsList.push({ x: b.x, z: b.z, y: b.y, psi: b.psiCar });
  // 斷頭路段的封閉路障：沿著路障橫向排幾個障礙物
  for (const b of world.barriers) {
    if (Math.abs(b.x - x) > R + b.w || Math.abs(b.z - z) > R + b.w) continue;
    const k = Math.max(1, Math.ceil(b.w / 4)), psi = Math.atan2(-b.nx, -b.nz);
    for (let i = 0; i < k; i++) { const t = (i + 0.5) / k - 0.5; obsList.push({ x: b.x + b.nx * t * b.w, z: b.z + b.nz * t * b.w, y: b.y, psi }); }
  }
  return obsList;
}
function camBlocked(x, y, z) {
  const b = world.buildingAt(x, z);
  return !!(b && y < b.y0 + b.h + 1.0);
}
const groundAt = (x, z) => world.groundAt(x, z, P.y);

function walkFrame(dt) {
  tp.input(input.lookX, input.lookY);
  const fw = Math.max(-1, Math.min(1, input.forward)), st = Math.max(-1, Math.min(1, input.strafe));
  const fx = tp.fwdX, fz = tp.fwdZ;
  let mx = fx * fw - fz * st, mz = fz * fw + fx * st;
  const mag = Math.min(1, Math.hypot(mx, mz));
  const ox = P.x, oz = P.z;
  if (mag > 0.05) {
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    const sp = (input.run ? 4.8 : 1.9) * mag;
    P.x += mx * sp * dt; P.z += mz * sp * dt;
    const want = Math.atan2(-mx, -mz); let d = want - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    P.yaw += d * Math.min(1, dt * 10);
  }
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
  car.body.visible = true; car.sync();
  const dCar = dist(P, car); let dDest = dist(P, M.dest);
  // 車站本身是一棟建物：碰到它的外牆就算走到了（人進不去建物裡）
  if (dDest < 120) { const db = world.buildingAt(M.dest.x, M.dest.z); if (db) dDest = Math.min(dDest, polyDist(db.pts, P.x, P.z) + 4.5); }
  G.dDest = dDest;
  carBeacon.visible = G.phase === 'toCar' || (G.phase === 'toDest' && G.parked && !G.parked.legal);
  carBeacon.position.set(car.x, car.y, car.z);
  destBeacon.visible = G.phase !== 'toCar'; destBeacon.position.set(M.dest.x, world.groundAt(M.dest.x, M.dest.z), M.dest.z);
  bayMarks.count = 0;
  if (dCar < 3.0) { setPrompt('<kbd>E</kbd> 坐上布丁狗'); if (input.pressed('KeyE')) enterCar(); }
  else if (G.phase === 'toDest' && dDest < 6) {
    if (G.parked && G.parked.legal) finish();
    else setPrompt('車還沒停進車格，回去停好再進站', 'warn');
  } else setPrompt('');
}

function polyDist(p, x, z) {
  let m = Infinity; const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2] - ax, bz = p[i * 2 + 1] - az, l2 = bx * bx + bz * bz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2));
    m = Math.min(m, Math.hypot(x - ax - bx * t, z - az - bz * t));
  }
  return m;
}
// ===================================================================== 駕駛座調整
// 預設：畫面主要是前擋風玻璃，下緣只看到一點方向盤上緣
const SEAT_KEY = 'yingge-seat2', SEAT_DEF = { h: 0, f: 0, fov: 46, tilt: 12 };
const seat = (() => { try { return Object.assign({}, SEAT_DEF, JSON.parse(localStorage.getItem(SEAT_KEY) || '{}')); } catch (err) { return Object.assign({}, SEAT_DEF); } })();
function applySeat() {
  if (!cockpit) return;
  cockpit.eye.set(cockpit.eyeBase.x, cockpit.eyeBase.y + seat.h / 100, cockpit.eyeBase.z - seat.f / 100);
  cockpit.basePitch = seat.tilt * Math.PI / 180;
  $('seatH').value = seat.h; $('seatF').value = seat.f; $('seatV').value = seat.fov; $('seatT').value = seat.tilt;
  $('seatTv').textContent = (seat.tilt > 0 ? '往上 ' : seat.tilt < 0 ? '往下 ' : '') + Math.abs(seat.tilt) + '°';
  $('seatHv').textContent = (seat.h > 0 ? '+' : '') + seat.h + ' cm'; $('seatFv').textContent = (seat.f > 0 ? '+' : '') + seat.f + ' cm'; $('seatVv').textContent = seat.fov + '°';
  try { localStorage.setItem(SEAT_KEY, JSON.stringify(seat)); } catch (err) { /* 存不了就算了 */ }
}
for (const [id, k] of [['seatH', 'h'], ['seatF', 'f'], ['seatV', 'fov'], ['seatT', 'tilt']]) $(id).addEventListener('input', (e) => { seat[k] = +e.target.value; applySeat(); });
$('seatReset').onclick = () => { Object.assign(seat, SEAT_DEF); applySeat(); };
$('seatGo').onclick = () => closeSeat();
function openSeat() {
  G.seatAdj = true; G.cam = 'cockpit'; camera.near = 0.8; camera.updateProjectionMatrix();
  input.releaseLock(); input.noLock = true; $('seat').hidden = false; applySeat();
}
function closeSeat() {
  if (!G.seatAdj) return;
  G.seatAdj = false; input.noLock = false; $('seat').hidden = true;
  cockpit.lookYaw = 0; cockpit.lookPitch = 0;
  if (AUTO) AUTO.t = 0;
  toast('開車囉！滑鼠左右轉或按住 Z／X 看後照鏡', 3);
}

function enterCar() {
  fadeThen(() => {
    G.state = 'drive'; G.phase = 'drive'; G.parked = null;
    if (avatar) avatar.group.visible = false;
    cockpit.lookYaw = 0; cockpit.lookPitch = 0;
    camera.near = 0.8; camera.updateProjectionMatrix();
    if (!G.started) { G.started = true; G.t0 = performance.now(); }
    openSeat();
  });
}

const _err = { along: 0, lat: 0, ang: 0 };
function parkingCheck() {
  const b = parking.bayAt(car.x, car.z, car.psi, _err);
  if (!b) return { bay: null, ok: false, msg: '' };
  if (b.type === 'ev') return { bay: b, ok: false, msg: '這是電動車專用格，布丁狗是油車' };
  if (Math.abs(_err.ang) > PARK.angTol) return { bay: b, ok: false, msg: '車身要擺正' };
  if (Math.abs(_err.lat) > PARK.latTol) return { bay: b, ok: false, msg: '壓到格線了，往格子中間一點' };
  if (Math.abs(_err.along) > PARK.posTol) return { bay: b, ok: false, msg: _err.along > 0 ? '再往後一點' : '再往前一點' };
  return { bay: b, ok: true, msg: '已停妥' };
}
function exitCar() {
  if (Math.abs(car.v) > 0.4) { toast('先停下來才能下車', 1.6); return; }
  const chk = parkingCheck(), near = dist(car, M.dest) < 500;
  G.parked = { legal: chk.ok && near, ok: chk.ok, bay: chk.bay };
  G.phase = 'toDest';
  fadeThen(() => {
    const lx = -Math.cos(car.psi), lz = Math.sin(car.psi);
    P.x = car.x + lx * 1.7; P.z = car.z + lz * 1.7; P.y = car.y; P.yaw = car.psi + Math.PI / 2; tp.yaw = car.psi;
    const p = { x: P.x, z: P.z }; if (world.collide(p, 0.4)) { P.x = car.x - lx * 1.7; P.z = car.z - lz * 1.7; }
    G.state = 'walk'; camera.near = 0.15; camera.updateProjectionMatrix();
    toast(G.parked.legal ? '停好了！走進鶯歌捷運站' : chk.ok ? '停好了，但離車站太遠（要 500 m 內）' : chk.msg ? '沒停好：' + chk.msg : '這裡不是停車格');
  });
}

// ===================================================================== 開車（駕駛座視角）
let markT = 0, lotT = 0, frameN = 0;
// 按住 Z／X：轉頭看左／右後照鏡，放開就轉回前方
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
  if (input.pressed('KeyC')) { G.cam = G.cam === 'cockpit' ? 'chase' : 'cockpit'; camera.near = G.cam === 'cockpit' ? 0.8 : 0.3; camera.updateProjectionMatrix(); }
  const fov = G.cam === 'cockpit' ? seat.fov + (camera.aspect < 1 ? 26 : 0) : (camera.aspect < 1 ? 76 : 62);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (G.seatAdj && input.pressed('Enter')) closeSeat();
  if (!G.seatAdj && input.pressed('KeyV') && Math.abs(car.v) < 0.3) openSeat();
  const fw = G.seatAdj ? 0 : input.forward;
  const ctl = G.seatAdj ? { throttle: 0, brake: 1, steer: 0, handbrake: true } : { throttle: Math.max(0, Math.min(1, fw > 0.15 ? fw : 0)) || input.tGas, brake: Math.max(0, Math.min(1, fw < -0.15 ? -fw : 0)) || input.tBrake,
    steer: -Math.max(-1, Math.min(1, input.strafe)), handbrake: input.has('Space') };
  lotT -= dt; if (lotT <= 0) { lotT = 0.2; car.onLot = parking.inLot(car.x, car.z) || !!parking.bayAt(car.x, car.z, car.psi, _err); }
  car.update(dt, ctl, gatherObstacles(car.x, car.z, 14));
  world.update(car.x, car.z, dt); parking.update(dt, car.x, car.z); signs.update(dt, car.x, car.z);
  traffic.update(dt, car.x, car.z, [{ x: car.x, z: car.z, y: car.y, r: 2.3 }]);
  if (G.cam === 'cockpit') { cockpit.look(input.lookX, input.lookY, dt, Math.abs(car.v) > 1 && !G.seatAdj); glance(dt); if (window.__tc.cockpitLook) cockpit.lookYaw = window.__tc.cockpitLook; cockpit.applyTo(camera, car); car.body.visible = false; }
  else {
    car.body.visible = true;
    tp.input(input.lookX * 0.6, input.lookY * 0.6);
    const back = 8, up = 3.2, tx = car.x - car.fwdX * back, tz = car.z - car.fwdZ * back, ty = car.y + up, k = Math.min(1, dt * 5);
    if (!G.chase) G.chase = { x: tx, y: ty, z: tz };
    G.chase.x += (tx - G.chase.x) * k; G.chase.y += (ty - G.chase.y) * k; G.chase.z += (tz - G.chase.z) * k;
    camera.position.set(G.chase.x, G.chase.y, G.chase.z); camera.lookAt(car.x, car.y + 1.4, car.z);
  }
  P.x = car.x; P.z = car.z; P.y = car.y;
  const dDest = dist(car, M.dest);
  destBeacon.visible = true; destBeacon.position.set(M.dest.x, world.groundAt(M.dest.x, M.dest.z), M.dest.z); carBeacon.visible = false;
  markT -= dt;
  if (markT <= 0) {
    markT = 0.4; let n = 0;
    if (dDest < 520) {
      const list = [];
      parking.forBaysNear(car.x, car.z, 120, (b, d2) => { if (!b.occupied && !b.reserved && b.type !== 'ev' && dist(b, M.dest) < 500) { b._d2 = d2; list.push(b); } });
      list.sort((a, b) => a._d2 - b._d2);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(0xf5c518);
      for (const b of list.slice(0, 48)) { e.set(0, b.psi, 0); q.setFromEuler(e); v.set(b.x, b.y + 0.24, b.z); sc.set(b.wid - 0.3, 1, b.len - 0.3); m.compose(v, q, sc); bayMarks.setMatrixAt(n, m); bayMarks.setColorAt(n, col); n++; }
    }
    bayMarks.count = n; bayMarks.instanceMatrix.needsUpdate = true; if (bayMarks.instanceColor) bayMarks.instanceColor.needsUpdate = true;
  }
  let pr = '', cls = '';
  if (Math.abs(car.v) < 1.2) {
    const chk = dDest < 500 ? parkingCheck() : { bay: null };
    if (chk.bay) { if (chk.ok) { pr = '已停妥　<kbd>E</kbd> 下車'; cls = 'good'; } else { pr = chk.msg; cls = 'warn'; } }
    else if (Math.abs(car.v) < 0.3) pr = '<kbd>E</kbd> 下車';
  }
  if (G.seatAdj) { pr = '調整好座椅後按「開始開車」（或 Enter）'; cls = ''; }
  setPrompt(pr, cls);
  if (input.pressed('KeyE')) { if (G.seatAdj) { if (input.touch) closeSeat(); else { closeSeat(); exitCar(); } } else exitCar(); }
  if (G.cam === 'cockpit') {
    cockpit.drawDash(car, dt);
    if (frameN % 6 === 0) { const ang = Math.atan2(M.dest.x - car.x, -(M.dest.z - car.z)), heading = Math.atan2(car.fwdX, -car.fwdZ); cockpit.drawNav({ title: M.dest.name, dist: fmtDist(dDest), bearing: ang - heading }); }
  }
}

function finish() {
  G.state = 'done'; input.releaseLock();
  const t = (performance.now() - G.t0) / 1000, km = (car.odo - G.startOdo) / 1000, bumps = car.bumps - G.startBumps;
  const b = best.get(), isBest = !b || t < b.t;
  if (isBest) best.set({ t, km, bumps });
  $('sumTitle').textContent = isBest ? '抵達鶯歌！新紀錄' : '抵達鶯歌！';
  $('sumStats').innerHTML = [['花費時間', fmtTime(t)], ['開車距離', km.toFixed(1) + ' km'], ['擦撞', bumps + ' 次'], ['最佳紀錄', fmtTime(isBest ? t : b.t)]]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('summary').hidden = false; setPrompt('');
}

// ===================================================================== HUD、小地圖
let miniT = 0, placeT = 0;
function hud(dt) {
  if (G.started && G.state !== 'done') G.elapsed = (performance.now() - G.t0) / 1000;
  $('clock').textContent = fmtTime(G.elapsed || 0);
  let t = '', sub = '';
  if (G.phase === 'toCar') { t = '走到布丁狗旁邊'; sub = fmtDist(dist(P, car)); }
  else if (G.phase === 'drive') { const d = dist(car, M.dest); if (d < 520) { t = '在車站附近找車位'; sub = '黃色標示是空的路邊車格'; } else { t = `開往 ${M.dest.name}`; sub = `直線 ${fmtDist(d)}・跟著小地圖上的藍線`; } }
  else if (G.phase === 'toDest') { t = G.parked && G.parked.legal ? `走進 ${M.dest.name}` : '車沒停好'; sub = G.parked && G.parked.legal ? fmtDist(Math.max(0, (G.dDest ?? dist(P, M.dest)) - 4.5)) : '回到車上重新停進車格'; }
  $('taskText').textContent = t; $('taskSub').textContent = sub;
  const sp = $('speedo');
  if (G.state === 'drive' && (G.cam !== 'cockpit' || input.touch)) { sp.hidden = false; $('spd').textContent = Math.round(car.kmh); } else sp.hidden = true;
  placeT -= dt;
  if (placeT <= 0) { placeT = 0.6; const o = {}, e = world.nearestEdge(P.x, P.z, 40, null, o); $('placeRoad').textContent = (e && e.name) || '　'; $('placeDist').textContent = world.districtAt(P.x, P.z) || ''; }
  miniT -= dt; if (miniT <= 0) { miniT = 0.1; drawMini(); }
}
const ROADCOL = ['#e9c46a', '#e9c46a', '#f1f3f4', '#d7dbdf', '#b9c0c6', '#8f99a3', '#6b757e', '#d7dbdf'], ROADW = [5, 5, 4.5, 4, 3.2, 2.4, 1.6, 2.6];
function drawMini() {
  const cv = $('mini'), g = cv.getContext('2d'), S = cv.width, R = S / 2;
  const inCar = G.state === 'drive', cx = P.x, cz = P.z, head = inCar ? car.psi : (G.state === 'walk' ? tp.yaw : 0);
  const scale = R / (inCar ? 300 : 160);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#10141a'; g.fillRect(0, 0, S, S);
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
  // 建議路線
  const r = curRoute();
  if (r) { g.strokeStyle = 'rgba(80,170,255,0.85)'; g.lineWidth = Math.max(6, 9 / scale * 0.5); g.beginPath(); g.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) g.lineTo(r[i], r[i + 1]); g.stroke(); }
  if (G.state === 'walk' && G.phase !== 'toCar') { g.fillStyle = '#6fd3ff'; g.beginPath(); g.arc(car.x, car.z, 4 / scale, 0, Math.PI * 2); g.fill(); }
  g.restore();
  const tgt = G.phase === 'toCar' ? car : M.dest, dx = tgt.x - cx, dz = tgt.z - cz, c = Math.cos(head), s = Math.sin(head);
  let mx = (dx * c - dz * s) * scale, mz = (dx * s + dz * c) * scale; const d = Math.hypot(mx, mz), lim = R - 12, inside = d < lim;
  if (!inside) { mx *= lim / d; mz *= lim / d; }
  g.fillStyle = tgt === car ? '#6fd3ff' : '#f5c518'; g.strokeStyle = '#10141a'; g.lineWidth = 3; g.beginPath(); g.arc(R + mx, R + mz, inside ? 9 : 7, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(R, R - 12); g.lineTo(R + 8, R + 9); g.lineTo(R, R + 4); g.lineTo(R - 8, R + 9); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 20px "Barlow Semi Condensed", sans-serif'; g.textAlign = 'center';
  g.fillText('N', R + Math.sin(head) * (R - 16), R - Math.cos(head) * (R - 16) + 7);
}

// ===================================================================== 自動測試（網址加 #autotest）
// 用跟玩家一樣的按鍵輸入（W／A／D／E／C、視角）把流程跑一遍，方便在真的瀏覽器上檢查。
let AUTO = location.hash.includes('autotest') ? { t: 0, step: 'walk', started: false } : null;
// 在真的網頁上也能啟動：按 F8（網址的 # 參數傳不進嵌入的頁面）
function startAuto() { if (!AUTO) { AUTO = { t: 0, step: 'walk', started: false }; autoSay('啟動'); } }
window.addEventListener('keydown', (e) => { if (e.code === 'F8') startAuto(); });
// 標題畫面的「自動示範」按鈕：直接開始（不用找 F8 鍵）
if ($('btnAuto')) $('btnAuto').onclick = () => { startAuto(); AUTO.started = true; music.start(); $('btnStart').click(); };
let autoLbl = null;
function autoSay(msg) {
  if (!autoLbl) { autoLbl = document.createElement('div'); autoLbl.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99;background:#c0392b;color:#fff;font:700 15px/1.4 sans-serif;padding:6px 14px;border-radius:8px'; document.body.appendChild(autoLbl); }
  autoLbl.textContent = '自動測試：' + msg;
}
function autoKeys(...codes) { for (const c of ['KeyW', 'KeyA', 'KeyD', 'KeyS', 'ShiftLeft', 'KeyZ', 'KeyX']) input.keys.delete(c); for (const c of codes) if (c) input.keys.add(c); }
function routeTarget(x, z, ahead) {
  const r = curRoute(); if (!r) return null;
  let bi = 0, bd = 1e18; for (let i = 0; i < r.length; i += 2) { const d = (r[i] - x) ** 2 + (r[i + 1] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  let acc = 0, i = bi; while (i + 2 < r.length && acc < ahead) { acc += Math.hypot(r[i + 2] - r[i], r[i + 3] - r[i + 1]); i += 2; }
  return { x: r[i], z: r[i + 1] };
}
// 自動測試用：在 1.5 m 格子上避開建物找路（A*）
window.__walkPath = (a, b) => walkPath(a, b);
function walkPath(a, b) {
  const S = 1.5, pad = 60, x0 = Math.min(a.x, b.x) - pad, z0 = Math.min(a.z, b.z) - pad;
  const W = Math.ceil((Math.max(a.x, b.x) + pad - x0) / S), H = Math.ceil((Math.max(a.z, b.z) + pad - z0) / S);
  const block = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S;
    if (world.buildingAt(x, z) || world.buildingAt(x + 0.6, z) || world.buildingAt(x - 0.6, z) || world.buildingAt(x, z + 0.6) || world.buildingAt(x, z - 0.6)) block[j * W + i] = 1;
  }
  const id = (x, z) => Math.max(0, Math.min(H - 1, Math.floor((z - z0) / S))) * W + Math.max(0, Math.min(W - 1, Math.floor((x - x0) / S)));
  // 路邊停的車也要繞過去
  for (const o of gatherObstacles((a.x + b.x) / 2, (a.z + b.z) / 2, Math.hypot(a.x - b.x, a.z - b.z) / 2 + pad)) for (const off of [1.3, 0, -1.3]) {
    const px = o.x - Math.sin(o.psi) * off, pz = o.z - Math.cos(o.psi) * off;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const x = px + dx * S * 0.6, z = pz + dz * S * 0.6; if (Math.hypot(x - px, z - pz) < 1.9) block[id(x, z)] = 1; }
  }
  const st = id(a.x, a.z), gl = id(b.x, b.z); block[st] = 0; block[gl] = 0;
  const g = new Float32Array(W * H).fill(1e9), from = new Int32Array(W * H).fill(-1), open = [[0, st]]; g[st] = 0;
  const hx = (k) => Math.hypot(k % W - gl % W, Math.floor(k / W) - Math.floor(gl / W));
  while (open.length) {
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
function autoTest(dt) {
  AUTO.t += dt;
  if (G.state === 'walk' && G.phase === 'toCar') {
    if (!AUTO.path) AUTO.path = walkPath(P, car) || [{ x: car.x, z: car.z }];
    let wp = AUTO.path[0];
    while (AUTO.path.length > 1 && Math.hypot(wp.x - P.x, wp.z - P.z) < 1.6) { AUTO.path.shift(); wp = AUTO.path[0]; }
    autoSay(`沿人行空間走向布丁狗（W＋Shift），剩 ${dist(P, car).toFixed(0)} m`);
    tp.yaw = Math.atan2(-(wp.x - P.x), -(wp.z - P.z));
    if (dist(P, car) > 2.6) autoKeys('KeyW', 'ShiftLeft'); else { autoKeys(); input.hit.add('KeyE'); AUTO.t = 0; }
    return;
  }
  if (G.state !== 'drive') return;
  if (G.seatAdj) {
    autoSay('駕駛座調整畫面（座椅升高 6 cm）');
    if (AUTO.t > 2 && !AUTO.seatSet) { AUTO.seatSet = true; const el = $('seatH'); el.value = 6; el.dispatchEvent(new Event('input')); }
    if (AUTO.t > 5) $('seatGo').click();
    return;
  }
  const T = AUTO.t;
  if (T < 2) { autoSay('開始開車：前擋風視角'); autoKeys(); }
  else if (T < 6) { autoSay('按住 Z：看左後照鏡'); autoKeys('KeyZ'); }
  else if (T < 10) { autoSay('按住 X：看右後照鏡'); autoKeys('KeyX'); }
  else if (T < 32) {
    if (T > 22 && G.cam === 'cockpit') input.hit.add('KeyC');
    autoSay(G.cam === 'cockpit' ? '沿著建議路線開（駕駛座）' : '沿著建議路線開（車外視角）');
    const tg = routeTarget(car.x, car.z, 14);
    if (!tg) { autoKeys(); return; }
    const bearing = Math.atan2(tg.x - car.x, -(tg.z - car.z)), heading = Math.atan2(car.fwdX, -car.fwdZ);
    let e = bearing - heading; e = Math.atan2(Math.sin(e), Math.cos(e));
    const keys = [];
    if (car.v < 8) keys.push('KeyW');
    if (e > 0.06) keys.push('KeyD'); else if (e < -0.06) keys.push('KeyA');
    autoKeys(...keys);
  } else { autoSay('煞車停下，測試結束'); autoKeys(car.v > 0.3 ? 'KeyS' : null); }
}

// ===================================================================== 主迴圈
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frameN++;
  if (toastT > 0 && performance.now() > toastT) { toastT = 0; $('toast').hidden = true; }
  if (input.pressed('KeyH')) $('help').hidden = !$('help').hidden;
  if (input.pressed('KeyN')) { music.toggle(); toast(music.on ? '音樂：開' : '音樂：關', 1.2); }
  music.update(G.state === 'drive' ? (G.seatAdj ? 'walk' : 'drive') : G.state === 'done' ? 'done' : G.state === 'walk' ? 'walk' : 'title', car ? car.v : 0);
  if (G.state === 'title') {
    // 標題畫面：在終點車站上空盤旋
    const a = now / 1000 * 0.05, c = M.dest; world.update(c.x, c.z, dt); signs.update(dt, c.x, c.z);
    if (AUTO && !AUTO.started && now > 1500) { AUTO.started = true; $('btnStart').click(); }
    const gy = world.groundAt(c.x, c.z);
    camera.position.set(c.x + Math.sin(a) * 260, gy + 150, c.z + Math.cos(a) * 260); camera.lookAt(c.x, gy, c.z);
  } else if (G.state === 'loading') {
    world.update(G.focus.x, G.focus.z, dt, 14); parking.update(dt, G.focus.x, G.focus.z); parking.update(0, G.focus.x, G.focus.z);
    const gy = world.groundAt(G.focus.x, G.focus.z); camera.position.set(G.focus.x + 60, gy + 70, G.focus.z + 60); camera.lookAt(G.focus.x, gy, G.focus.z);
    if (G.wait && G.wait()) { G.wait = null; G.then(); }
  } else if (G.state === 'walk') { if (AUTO) autoTest(dt); walkFrame(dt); }
  else if (G.state === 'drive') { if (AUTO) autoTest(dt); driveFrame(dt); }
  else if (G.state === 'done') { if (avatar) avatar.update(dt, P.x, P.y, P.z, P.yaw, 0); }
  if (['walk', 'drive', 'done'].includes(G.state)) hud(dt);
  if (input.touch) {
    const drv = G.state === 'drive' && G.cam === 'cockpit' && !G.seatAdj;
    for (const id of ['btnMirL', 'btnMirR']) { const el = $(id); if (el && el.hidden === drv) el.hidden = !drv; }
    // 黃色 E 鍵在手機上直接寫出現在按下去會做什麼
    const act = $('btnAct'), lab = G.state === 'walk' ? (car && dist(P, car) < 3.0 ? '上車' : 'E') : G.state === 'drive' ? (G.seatAdj ? '開車' : Math.abs(car.v) < 0.4 ? '下車' : 'E') : 'E';
    if (act && act.textContent !== lab) act.textContent = lab;
    const st = $('btnSeat'), showSeat = G.state === 'drive' && !G.seatAdj && Math.abs(car.v) < 0.3;
    if (st && st.hidden === showSeat) st.hidden = !showSeat;
  }
  render();
  input.endFrame();
}

function render() {
  const dc = window.__tc.debugCam;
  if (dc) { camera.position.set(dc.x, dc.y, dc.z); camera.lookAt(dc.tx, dc.ty || 0, dc.tz); }
  sky.position.copy(camera.position);
  ground.position.set(Math.round(camera.position.x / 50) * 50, -15, Math.round(camera.position.z / 50) * 50);
  // 陰影跟著玩家
  const fx = G.state === 'drive' ? car.x : P.x, fz = G.state === 'drive' ? car.z : P.z, fy = G.state === 'drive' ? car.y : P.y;
  const sx = Math.round(fx / 4) * 4, sz = Math.round(fz / 4) * 4;
  sun.target.position.set(sx, fy, sz); sun.position.set(sx + SUN_DIR.x * 260, fy + SUN_DIR.y * 260, sz + SUN_DIR.z * 260);
  sun.target.updateMatrixWorld();
  const cockpitOn = G.state === 'drive' && G.cam === 'cockpit';
  if (cockpitOn && (location.hash !== '#lowq')) {
    // 後照鏡：中間、左、右輪流更新
    const k = frameN % 3, m = k === 0 ? { rt: cockpit.mirrorRT, cam: cockpit.mirrorCam } : k === 1 ? cockpit.mirrorL : cockpit.mirrorR;
    const sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(m.rt); renderer.clear(); renderer.render(scene, m.cam); renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = sm; renderer.shadowMap.needsUpdate = true;
  }
  renderer.clear(); renderer.render(scene, camera);
  if (cockpitOn) { renderer.clearDepth(); renderer.render(cockpit.scene, cockpit.cam); }
}

boot();
