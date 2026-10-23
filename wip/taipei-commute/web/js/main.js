// 台北上班路 — 主程式。每天：房間起床 → 走到車子 → 開去公司 → 停車（停進格子合法；停路邊算違規，可能被拖吊）→ 走進公司打卡
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
import { playInstrument } from './instruments.js';
import { EngineSound } from './engine.js';
import { Nav, polyProgress, nextTurn } from './nav.js';
import { Stunts } from './stunts.js';
import { DroneTraffic, DroneFlight, DRONE, overheadAt } from './drone.js';
import { Control } from './control.js';
import { CityMap } from './citymap.js';
import { edgePoint } from './world.js';
import { DenseSky, SKY } from './sky.js';
import { DemoRunner, DEMOS } from './demo.js';
import { Economy, SHOP, priceOf, store, PAY, SAVED_MEASURED, SAVED_NOTE, AIR, GAME_MODES, lotRate, roadRate, repairFee, ANNOY, TOW, towYard, towStorage, taxiFare } from './economy.js';
import { VIEW, TIME, PARK, WORK_DIST, RUSH, FEATURES } from './config.js';

const $ = (id) => document.getElementById(id);
// 目前已經做好、可以買的項目（其他的會顯示「製作中」）
const READY = { nav: true, preview: true, ev: true, roadster: true, drone: true, garage: true, curbspot: true };

// ===================================================================== 場景與光線
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !location.hash.includes('noaa'), powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const HAZE = new THREE.Color(0xd5d9d8);
// 手機：看得到的範圍短一點（約 750 m，霧也拉近），要畫的東西少一半、開到新區域時要建的街區也少
const PHONE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
if (PHONE) { Object.assign(VIEW, { loadRadius: 760, unloadRadius: 1150, fogNear: 200, fogFar: 740 }); renderer.shadowMap.type = THREE.PCFShadowMap; }
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
sun.castShadow = true; sun.shadow.mapSize.set(PHONE ? 1024 : 2048, PHONE ? 1024 : 2048);   // 手機的影子解析度低一點
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
  // 直立式鋼琴：靠床和衣櫃中間的牆
  const px = 0.45, pz = 2.5;
  box(1.46, 1.22, 0.5, px, 0.61, pz + 0.04, 0x2a1d17);                       // 琴身
  box(1.46, 0.06, 0.3, px, 0.74, pz - 0.36, 0x2a1d17);                       // 鍵盤底座
  box(1.34, 0.025, 0.16, px, 0.785, pz - 0.4, 0xf6f3ea, false);              // 白鍵
  for (let i = 0; i < 25; i++) { const k = i % 7; if (k === 2 || k === 6) continue;   // 黑鍵：每個八度 C#、D#、F#、G#、A#（E、B 後面沒有）
    box(0.026, 0.02, 0.09, px - 0.67 + (i + 1) * (1.34 / 26), 0.805, pz - 0.37, 0x111111, false); }
  box(1.0, 0.03, 0.04, px, 1.0, pz - 0.2, 0x3b2a20, false);                  // 譜架
  box(1.36, 0.12, 0.04, px, 0.6, pz - 0.2, 0x3b2a20, false);
  box(0.76, 0.46, 0.34, px, 0.23, pz - 1.1, 0x2a1d17, false);                // 琴椅（不擋路）
  // 吉他：放在窗戶和衣櫃中間的吉他架上
  const gtr = new THREE.Group(), wood = M(0xb9773f), dark = M(0x3a2618);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), wood); body.scale.set(1, 1.15, 0.28); body.position.y = 0.2; gtr.add(body);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), wood); upper.scale.set(1, 1, 0.28); upper.position.y = 0.48; gtr.add(upper);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.055, 18), dark); hole.position.set(0, 0.4, 0.058); gtr.add(hole);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.03), dark); neck.position.set(0, 0.85, 0.02); gtr.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.025), dark); head.position.set(0, 1.13, 0.01); gtr.add(head);
  gtr.position.set(1.98, 0.08, 0.45); gtr.rotation.set(-0.18, -Math.PI / 2, 0); s.add(gtr);
  box(0.3, 0.08, 0.3, 1.98, 0.04, 0.45, 0x22262b);                           // 吉他架
  return { scene: s, boxes, door: { x: 1.2, z: -2.45 }, desk: { x: -1.25, z: -0.45 }, W, D, H,
    piano: { x: px, z: pz - 0.74, yaw: Math.PI }, guitar: { x: 1.55, z: 0.45, yaw: -Math.PI / 2 }, gtr, gtrHome: { p: gtr.position.clone(), r: gtr.rotation.clone() } };
}
const room = buildRoom();

// ===================================================================== 地下室（買了住處地下停車位才會去）：自己的車停在中間的格子，牆上有電梯回家
function buildBasement() {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x15181c);
  s.add(new THREE.HemisphereLight(0xe8f0ff, 0x4a4a48, 1.8));
  for (const x of [-3.5, 3.5]) { const l = new THREE.PointLight(0xeaf4ff, 10, 14, 1.4); l.position.set(x, 2.4, 0.5); s.add(l); }
  const W = 12, D = 9, H = 2.7, boxes = [];
  const M = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, x, y, z, c, solid = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); s.add(m); if (solid) boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: y + h / 2 }); return m; };
  const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [M(0x9a9c98), M(0x9a9c98), M(0xb9bbb6), M(0x55595c), M(0x8e908c), M(0x8e908c)]);
  shell.material.forEach(m => { m.side = THREE.BackSide; }); shell.position.y = H / 2; s.add(shell);
  box(W, 0.01, 1.6, 0, 0.006, -2.6, 0x4f7a5a, false);                            // 綠色走道
  for (const x of [-4.2, 4.2]) box(0.5, H, 0.5, x, H / 2, 0.6, 0xb4b6b1);         // 柱子
  for (const x of [-4.2, -1.4, 1.4, 4.2]) box(0.08, 0.012, 4.6, x, 0.008, 2.15, 0xf2f2ea, false);   // 車格線
  box(2.6, 0.012, 0.08, 0, 0.008, -0.1, 0xf2f2ea, false);
  for (const x of [-2.8, 2.8]) {   // 鄰居的車（簡單的方塊）
    box(1.8, 0.7, 4.3, x, 0.45, 2.3, x < 0 ? 0x6d7f8f : 0x8b2f2f); box(1.6, 0.55, 2.2, x, 1.05, 2.5, 0x2a2f36);
  }
  for (const x of [-3.5, 0, 3.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.18), new THREE.MeshBasicMaterial({ color: 0xf4fbff })); l.position.set(x, H - 0.03, 0.5); s.add(l); }
  box(1.2, 2.1, 0.06, -4, 1.05, -4.47, 0x9fa7ae, false);                         // 電梯門
  box(0.04, 2.1, 0.07, -4, 1.05, -4.46, 0x6b737a, false);
  box(2.4, 2.2, 0.06, 4.6, 1.1, 4.47, 0x2a2d31, false);                          // 車道出口
  const label = (text, bg, x, y, z, ry, w = 1.0) => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#fff'; g.font = '900 44px "Noto Sans TC", "PingFang TC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.position.set(x, y, z); m.rotation.y = ry; s.add(m);
  };
  label('電梯 → 家', '#0b6b4f', -4, 2.35, -4.44, 0);
  label('出口 ↑', '#8a5a00', 4.6, 2.42, 4.43, Math.PI, 0.8);
  label('B1', '#30343a', 0, 1.8, 4.44, Math.PI, 0.6);
  return { scene: s, boxes, W, D, H, car: { x: 0, z: 2.25, psi: Math.PI }, lift: { x: -4, z: -3.6 } };
}
const basement = buildBasement();
// 車子在地下室時佔的位置（人不能穿過去）
basement.boxes.push({ x0: -0.95, x1: 0.95, z0: 0.0, z1: 4.5, h: 1.4 });

// ===================================================================== 狀態
const input = new Input(canvas, $('touch'));
const music = new Music({ key: 'taipei-music', rapUrl: null, cyberUrl: 'audio/cyber.mp3', homeUrl: 'audio/home.mp3' });
for (const [id, code] of [['btnMirL', 'KeyZ'], ['btnMirR', 'KeyX']]) {
  const el = $(id); if (!el) continue;
  el.addEventListener('touchstart', (e) => { input.keys.add(code); e.preventDefault(); }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) el.addEventListener(ev, (e) => { input.keys.delete(code); e.preventDefault(); }, { passive: false });
}
// 手機橫向玩：瀏覽器允許的話進全螢幕、把方向鎖成橫的（Android Chrome）；鎖不了（iPhone、在 App 裡面看）就把整個畫面轉 90 度
const landOn = () => document.documentElement.classList.contains('rot90') || !!(document.fullscreenElement && screen.orientation && /landscape/.test(screen.orientation.type));
function landBtns() {
  const portrait = innerHeight > innerWidth, on = landOn();
  for (const id of ['moreLand', 'btnLand']) { const b = $(id); if (!b) continue; b.textContent = on ? '回到直向' : '橫向玩'; b.hidden = !on && !portrait; }
}
async function setLandscape(on) {
  const root = document.documentElement;
  if (on) {
    try { if (root.requestFullscreen && !document.fullscreenElement) await root.requestFullscreen({ navigationUI: 'hide' }); } catch (err) { /* 不能全螢幕 */ }
    let locked = false;
    try { if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock('landscape'); locked = true; } } catch (err) { /* 不能鎖方向 */ }
    // 鎖了方向也要等一下看看真的轉過來沒（有些瀏覽器說好卻沒轉）；還是直的就把整個畫面轉 90 度
    if (locked) await new Promise(r => setTimeout(r, 700));
    if (innerHeight > innerWidth) { root.classList.add('rot90'); input.rot = 90; landBtns(); toast('畫面轉成橫的了：把手機往左轉來玩', 3); }
  } else {
    root.classList.remove('rot90'); input.rot = 0; landBtns();
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (err) { /* ignore */ }
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (err) { /* ignore */ }
  }
  requestAnimationFrame(() => { resize(); landBtns(); });
}
addEventListener('resize', () => {
  // 轉成橫的之後，手機自己也轉成橫的了：不用再轉 90 度
  if (document.documentElement.classList.contains('rot90') && innerWidth > innerHeight) { document.documentElement.classList.remove('rot90'); input.rot = 0; requestAnimationFrame(resize); }
  landBtns();
});
document.addEventListener('fullscreenchange', () => landBtns());
// 手機：不常用的功能收在「⋯」選單裡
let mirrorBtns = false;   // 手機：後照鏡按鈕要不要顯示（在「⋯」裡切換）
if ($('btnMore')) {
  let togT = 0;   // 手指點一下會先有 touchstart、有時還會再補一個 click：只算一次
  const tog = (e) => { const now = performance.now(); if (e.type === 'click' && now - togT < 700) return; togT = now; e.preventDefault(); $('morePreview').hidden = !(econ.has('preview') && G.state === 'drive' && !G.demo); $('moreMenu').hidden = !$('moreMenu').hidden; };
  $('btnMore').addEventListener('touchstart', tog, { passive: false }); $('btnMore').addEventListener('click', tog);
  for (const b of $('moreMenu').querySelectorAll('button')) b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'mirror') { mirrorBtns = !mirrorBtns; b.textContent = `後照鏡按鈕：${mirrorBtns ? '開' : '關'}`; }
    else if (a === 'quality') { comfort.quality = comfort.quality === 'smooth' ? 'high' : 'smooth'; comfort.qUser = true; applyComfort(); toast(comfort.quality === 'smooth' ? '順暢優先：不畫影子、解析度低一點' : '畫質優先：有影子、比較清楚（比較耗電，可能會卡）', 2.5); }
    else if (a === 'music') $('btnMusic').click();
    else if (a === 'sfx') $('btnSfx').click();
    else if (a === 'land') setLandscape(!landOn());
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
  cfg: { di: -1, home: null, work: null }, menuMode: 'new', menuAngle: 0, menuCenter: { x: 0, z: 0 }, menuTarget: { x: 0, z: 0, r: 520, h: 300 },
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
window.__tc = { G, P, renderer, scene, camera, econ, engine, input, THREE, sun };
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
let toastPrio = 0;
/** prio：重要的訊息（例如被檢舉停用）在顯示時間內不會被一般訊息蓋掉。 */
function toast(msg, sec = 3, prio = 0) { if (prio < toastPrio && uiTime < toastT) return; toastPrio = prio; const t = $('toast'); t.textContent = touchify(msg); t.hidden = false; toastT = uiTime + sec; placeToast(); }
/** 手機玩的時候看不到電腦才有的按鍵說明：「按 F」→「按「飛越」」、拿掉（Enter）（Esc）等。電腦版原樣。 */
const TOUCH_KEY = { Shift: '推進', F: '飛越', G: '吸附', T: '翻轉', R: '回正', E: '動作' };
function touchKey(k) {
  if (k === 'U') return G.mode === 'hybrid' ? '問總控' : '無人機';
  if (k === '再按 U') return G.mode === 'hybrid' ? '現在飛' : '無人機';
  if (k === 'C') return '⋯ 視角';
  if (k === 'P') return '⋯ 預覽路線';
  return TOUCH_KEY[k] || k;
}
function touchify(t) {
  if (!t || !input || !(input.touch || input.coarse)) return t;
  return String(t)
    .replace(/（手機[：:][^）]*）/g, '')
    .replace(/[（(](?:或 ?)?(?:Enter|Esc|M)[）)]/g, '')
    .replace(/<kbd>E<\/kbd>\s*/g, '')
    .replace(/10 秒內再按(?:一次)? ?U/g, () => G.mode === 'hybrid' ? '10 秒內按「現在飛」' : '10 秒內再按「無人機」')
    .replace(/再按(?:一次)? ?U\s?/g, () => `再按「${touchKey('U')}」`)
    .replace(/按住 Z／X[^，。；）]*/g, '用「⋯」裡的後照鏡按鈕看後照鏡')
    .replace(/按 ?C(?![A-Za-z])/g, '在「⋯」按「視角」').replace(/按 ?M(?![A-Za-z])/g, '在「⋯」按「地圖」').replace(/按 ?V(?![A-Za-z])/g, '在「⋯」按「座椅」').replace(/按 ?P(?![A-Za-z])/g, '在「⋯」按「預覽路線」')
    .replace(/按 ?(Shift|F|G|T|U|R|E)(?![A-Za-z])\s?/g, (m, k) => `按「${touchKey(k)}」`)
    .replace(/[（(](Shift|F|G|T|U)[）)]/g, (m, k) => `（按「${touchKey(k)}」）`)
    .replace(/^(Shift|[FGTU])：/, (m, k) => `${touchKey(k)}：`)
    .replace(/按「([^」]+)」\1/g, '按「$1」');   // 「按「飛越」飛越」→「按「飛越」」
}
/** 總控卡片開著時，提示訊息如果跟卡片重疊，就移到卡片下面。 */
/** 左邊的提示欄被路空總控卡片蓋到時，往下挪到卡片下面（用版面座標，畫面轉 90 度時也對）。 */
function placeToast() {
  const h = $('hints'), c = $('ctlCard'); h.style.top = '';
  if (!c || c.hidden) return;
  const ax = c.offsetLeft, ay = c.offsetTop, aw = c.offsetWidth, ah = c.offsetHeight, bx = h.offsetLeft, by = h.offsetTop, bw = h.offsetWidth;
  if (ax < bx + bw && bx < ax + aw && ay + ah > by) h.style.top = Math.round(ay + ah + 8) + 'px';
}
function setPrompt(html, cls = '') { const p = $('prompt'); if (!html) { p.hidden = true; return; } html = touchify(html); if (!html) { p.hidden = true; return; } if (p._h !== html) { p.innerHTML = html; p._h = html; } p.className = cls; p.hidden = false; }
function fadeThen(fn, hold = 60) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), hold); }, 360); }
const dest = () => G.leg === 'am' ? G.cfg.work : G.cfg.home;
const destName = () => G.leg === 'am' ? G.cfg.work.n : '家';

// ===================================================================== 啟動
async function boot() {
  resize();
  $('loadText').textContent = '載入台北市地圖…';
  try { const r = await fetch('data/meta.json'); if (!r.ok) throw new Error('HTTP ' + r.status); meta = await r.json(); }
  catch (err) { $('loadText').textContent = '地圖資料載入失敗'; $('loadSub').textContent = '請透過網頁伺服器開啟這個資料夾（不要直接雙擊 HTML 檔）。'; return; }
  world = new World(scene, meta, '', { lite: PHONE });
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
  $('btnGo').onclick = () => { if (G.menuMode === 'work') finishMove('work'); else newGame(); };
  // 新的開始：一頁選區、一頁選住址、一頁選工作（薪水、房租都不會在這裡出現）
  $('btnNew').onclick = () => { G.menuMode = 'new'; G.cfg = { di: -1, home: null, work: null }; markDistricts(); updateGo(); showPage('pgDist'); };
  for (const b of document.querySelectorAll('#menuPanel .back')) b.onclick = () => {
    if (b.dataset.to === 'pgMove') { closeMove(false); return; }   // 換住址或工作：回結算
    // 換住址或工作：從第一頁返回 → 回到「要換什麼」
    if (G.menuMode !== 'new' && (b.dataset.to === 'pgTitle' || (G.menuMode === 'work' && b.dataset.to === 'pgHome'))) { G.cfg = Object.assign({}, G.moveBak); G.menuMode = 'move'; showPage('pgMove'); return; }
    showPage(b.dataset.to);
  };
  $('btnMove').onclick = () => openMove();
  if ($('btnLand')) $('btnLand').onclick = () => setLandscape(!landOn());
  landBtns();
  $('btnMoveHome').onclick = () => { G.menuMode = 'home'; G.cfg = Object.assign({}, G.moveBak); markDistricts(); $('btnHomeOk').hidden = true; showPage('pgDist'); };
  $('btnMoveWork').onclick = () => { G.menuMode = 'work'; G.cfg = Object.assign({}, G.moveBak, { work: null }); G.workSeed = (G.workSeed || 0) + 1; renderWorks(); updateGo(); showPage('pgWork'); };
  $('btnHomeOk').onclick = () => finishMove('home');
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
    b.innerHTML = `<b>${M.name}${locked ? '　（未解鎖）' : ''}</b><span class="sub">${locked ? '在一般模式玩到一定程度就會解鎖。' : M.desc}</span>`;
    if (locked) { b.disabled = true; box.appendChild(b); continue; }
    b.onclick = () => { G.mode = M.key; try { localStorage.setItem('taipei-commute-mode', M.key); } catch (err) { /* ignore */ } store.setMode(M.key); renderModes(); refreshContinue(); };
    box.appendChild(b);
  }
}
// ===================================================================== 看示範
let demo = null;
function renderDemos() {
  const box = $('demoOpts'); if (!box) return; box.innerHTML = '';
  const open = modesUnlocked();
  for (const D of DEMOS) {
    if (D.mode && !open) continue;   // 新玩法的示範：解鎖後才出現
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt demo';
    b.innerHTML = `<b>${D.name}</b><span class="sub">${touchify(D.sub)}</span>`;
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
  G.cfg = D.key === 'hybrid' ? hybridDemoCfg() : demoCfg(!!D.near); G.dayN = 1; G.homeCar = null; G.towNext = null; G.cam = defaultCam(); G.chase = null;
  audioStart(); $('menu').hidden = true; input.enabled = true;
  $('demoExit').hidden = false; demoUi.cap(`看示範：${D.name}　載入中…`);
  startDay();
}
const demoUi = {
  cap(t) { const c = $('demoCap'); c.textContent = touchify(t) || ''; c.hidden = !t; },
  speed(n) { const b = $('demoSpeed'); b.textContent = `快轉 ×${n}`; b.hidden = n <= 1; },
  done(ok) { demoUi.cap(ok ? '示範結束：可以直接接手開（W A S D），或按「結束示範」回選單' : '示範中斷了：可以自己開，或按「結束示範」回選單'); demo = null; },
};
function demoEnter() {
  G.state = 'drive'; G.phase = 'drive'; G.parked = null; P.inRoom = false;
  $('loading').hidden = true; $('hud').hidden = false; $('help').hidden = true;
  if (input.touch) $('touch').hidden = false;
  if (avatar) avatar.group.visible = false;
  audioStart(); engine.ignite();
  cockpit.lookYaw = 0; cockpit.lookPitch = 0; camera.near = G.cam === 'cockpit' ? 0.8 : 0.3; camera.updateProjectionMatrix();
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
  G.cam = defaultCam(); G.cfg = { di: -1, home: null, work: null };
  econ.reset(); econ.applyMode(G.mode);
  toMenu(); applyMode(); renderModes();
  for (const p of $('distMap').querySelectorAll('path')) p.classList.remove('on');
  showPage('pgTitle');
  updateGo();
}
window.__tc.startDemo = startDemo; window.__tc.endDemo = endDemo;
window.__tc.startDayForTest = () => startDay();   // 測試用：直接開始下一天
window.__tc.bayMarks = bayMarks; window.__tc.room = room; window.__tc.music = music; window.__tc.skillBanned = () => skillBanned();
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
    b.onclick = () => { G.cfg = sv.cfg; G.dayN = sv.day; econ.fromJSON(sv.econ); econ.applyMode(G.mode); G.homeCar = sv.homeCar || null; G.towNext = sv.towNext || null; G.annoy = sv.annoy || 0; G.banUntil = sv.banUntil || 0; G.prac = sv.prac || {}; startGame(); };
  } else b.hidden = true;
}
function pickDistrict(i) {
  const path = $('distMap').querySelector(`path[data-i="${i}"]`); if (path && path.classList.contains('off')) return;   // 搬家：這一區沒有離公司合適距離的住址
  G.cfg.di = i; G.homePage = 0;
  for (const p of $('distMap').querySelectorAll('path')) p.classList.toggle('on', +p.dataset.i === i);
  const d = meta.districts[i];
  Object.assign(G.menuTarget, { x: d.c[0], z: d.c[1], r: 520, h: 300 });
  G.cfg.home = null; if (G.menuMode !== 'home') G.cfg.work = null; updateGo();
  $('btnHomeOk').hidden = G.menuMode !== 'home'; $('btnHomeOk').disabled = true;
  $('homeDist').textContent = d.name; renderHomes(); showPage('pgHome');
}
/** 選單換頁：標題 → 行政區 → 住址 → 工作。 */
function showPage(id) {
  for (const pg of document.querySelectorAll('#menuPanel .page')) pg.hidden = pg.id !== id;
  const mv = G.menuMode || 'new';
  $('pgnoDist').textContent = mv === 'home' ? '搬家 1 / 2' : '1 / 3'; $('pgnoHome').textContent = mv === 'home' ? '搬家 2 / 2' : '2 / 3'; $('pgnoWork').textContent = mv === 'work' ? '換工作' : '3 / 3';
  $('distTitle').textContent = mv === 'home' ? '要搬到哪一區？' : '你要住哪一區？';
  $('btnGo').textContent = mv === 'work' ? '換這份工作' : '出發上班';
  if (mv === 'work') document.querySelector('#pgWork .back').textContent = '← 不換了'; else { document.querySelector('#pgWork .back').textContent = '← 換住址'; }
  $('menuPanel').scrollTop = 0;
  const h = document.querySelector('#' + id + ' .pgtitle'); if (h) h.focus({ preventScroll: true });
  // 背景的鏡頭：標題、選區看整個台北；選住址看那一區；選工作看那個住址
  const c = G.menuCenter, d = meta.districts[G.cfg.di], hm = G.cfg.home;
  if (id === 'pgHome' && d) Object.assign(G.menuTarget, { x: d.c[0], z: d.c[1], r: 520, h: 300 });
  else if (id === 'pgWork' && hm) Object.assign(G.menuTarget, { x: hm.x, z: hm.z, r: 170, h: 95 });
  else if (id === 'pgTitle' || id === 'pgDist') Object.assign(G.menuTarget, { x: c.x, z: c.z, r: 520, h: 300 });
}
function renderHomes() {
  const all = meta.homes[G.cfg.di] || [], list = G.menuMode === 'home' && G.cfg.work ? all.filter(h => inRange(h, G.cfg.work) && !sameSpot(h, G.moveBak.home)) : all;
  const n = 6, page = (G.homePage || 0) % Math.max(1, Math.ceil(list.length / n));
  const box = $('homeOpts'); box.innerHTML = '';
  const dn = districtName(G.cfg.di);
  $('homeHint').textContent = list.some(h => !h.approx) ? '門牌取自開放地圖資料。' : '';
  for (const h of list.slice(page * n, page * n + n)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt' + (G.cfg.home === h ? ' on' : '');
    b.innerHTML = `<b>臺北市${dn}${h.a}</b><span class="sub">${h.road ? '門前道路：' + h.road : ''}${h.approx ? '（約略位置）' : ''}</span>`;
    b.onclick = () => {
      G.cfg.home = h;
      if (G.menuMode === 'home') { renderHomes(); $('btnHomeOk').disabled = false; return; }   // 搬家：選好按「搬到這裡」
      G.cfg.work = null; renderHomes(); renderWorks(); updateGo(); showPage('pgWork');
    };
    box.appendChild(b);
  }
}
const inRange = (a, b) => { const d = Math.hypot(a.x - b.x, a.z - b.z); return d >= WORK_DIST.min && d <= WORK_DIST.max; };
const sameSpot = (a, b) => !!(a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.z - b.z) < 0.5);
function workCands(h) { return meta.works.filter(w => inRange(w, h) && !(G.menuMode === 'work' && G.moveBak && sameSpot(w, G.moveBak.work))); }
/** 地圖上的區：新的開始全部可以選；搬家時，沒有離公司合適距離住址的區變暗。 */
function markDistricts() {
  for (const p of $('distMap').querySelectorAll('path')) {
    const i = +p.dataset.i; p.classList.remove('on');
    p.classList.toggle('off', G.menuMode === 'home' && !(meta.homes[i] || []).some(h => inRange(h, G.cfg.work) && !sameSpot(h, G.moveBak.home)));
  }
}
// ===================================================================== 換住址或工作（每買一樣新系統或車子，可以換一次；從結算畫面進來，明天起生效）
function openMove() {
  if (!(econ.moves > 0) || !G.cfg.home || !G.cfg.work) return;
  G.moveBak = Object.assign({}, G.cfg); G.menuMode = 'move';
  $('summary').hidden = true; $('menu').hidden = false; input.releaseLock();
  $('moveLeft').textContent = `可以換 ${econ.moves} 次`;
  $('moveNow').textContent = `現在住在${districtName(G.cfg.di)}${G.cfg.home.a}，在${G.cfg.work.n}上班。`;
  showPage('pgMove');
}
function closeMove(done) {
  if (!done && G.moveBak) G.cfg = G.moveBak;
  G.menuMode = 'new'; G.moveBak = null;
  $('menu').hidden = true; showPage('pgTitle'); $('summary').hidden = false; refreshMoveBtn();
}
function finishMove(kind) {
  if (kind === 'home' && !G.cfg.home) return; if (kind === 'work' && !G.cfg.work) return;
  econ.moves = Math.max(0, econ.moves - 1);
  if (kind === 'home') G.homeCar = null;   // 搬家：車子明天停在新家附近的路邊
  const msg = kind === 'home' ? `明天起住在${districtName(G.cfg.di)}${G.cfg.home.a}` : `明天起在${G.cfg.work.n}上班`;
  save(); closeMove(true);
  $('sumLead').textContent = `${fmtClock(G.clock)} 回到家。${msg}。`;
}
function refreshMoveBtn() { const b = $('btnMove'); if (b) { b.hidden = !(econ.moves > 0); b.textContent = `換住址或工作${econ.moves > 1 ? `（${econ.moves} 次）` : ''}`; } }
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
function newGame() { G.dayN = 1; econ.reset(); econ.applyMode(G.mode); G.homeCar = null; G.towNext = null; G.annoy = 0; G.banUntil = 0; G.prac = {}; startGame(); }

function startGame() {
  audioStart();
  $('menu').hidden = true;
  input.enabled = true;
  startDay();
}
// ===================================================================== 操作說明：一開始只教開車，買了新功能再教
const HELP_BASE = [['W A S D', '走路／開車（油門、煞車、方向盤）'], ['滑鼠', '轉動視角（點一下畫面鎖定游標）'], ['E', '出門、上車、下車、開商店'], ['空白鍵', '手煞車'], ['M', '全市地圖']];
const FEATURE_HELP = {
  nav: { title: '導航', rows: [['藍線', '路面上的藍色線就是建議路線'], ['螢幕', '導航螢幕（電腦在車內右下角，手機在畫面右側）會提示下一個轉彎和距離']] },
  preview: { title: '路線預覽', rows: [['P', '停在車上時按 P：用車外視角把今天的路線先開一次給你看，不花遊戲時間（手機：⋯ → 預覽路線）'], ['路名牌', '要轉彎的路口前，用大的路名牌顯示要轉進哪條路、往哪邊轉；直走的路口不打擾你'], ['地標', '沿路經過的捷運站、火車站、學校、大學、醫院、公園、百貨、博物館、市府／區公所、超高大樓（例如台北 101），會告訴你在左邊還是右邊，畫面上也會標出來'], ['速度', '預覽中可以切換 1×／2×／4×、暫停；按「結束預覽」（或 Esc）回到車上']] },
  ev: { title: '電動車', rows: [['充電', '可以停停車場裡的「電動車專用格」，停著就會充電']] },
  roadster: { title: '飛天跑車', rows: [['Shift', '推進器：約 1 秒破百（手機：推進）'], ['F', '垂直升空，飛越前面的車陣，約 10 台車（手機：飛越）'], ['T', '飛越時空中翻一圈，要在剛飛起來時按，落地前才轉得正（手機：翻轉）'], ['滑', '手機：飛起來之後，原本「飛越」的按鈕會變成「翻轉」，再按一下就翻；也可以在畫面上左右快速滑一下（往哪邊滑就往哪邊翻）', 'touch'], ['G', '面向大樓：吸住外牆往上開；在高架橋下：吸在橋底倒著開；再按一次脫離（手機：吸附）'], ['空氣', '特技都用壓縮空氣，滿罐可飛越 8 次，用完特殊功能停用。不用另外補氣，開車時會慢慢補回來（遊戲設定）']] },
  drone: { title: '無人機飛行系統', rows: [['U', '開飛天跑車時按 U：旋翼伸出、升空，自動避撞飛到目的地附近降落；再按一次取消（手機：無人機）'], ['C', '飛行中切換車外／駕駛座視角', 'desk']] },
  ctl: { title: '路空總控', rows: [['U', '問路空總控：它比較「繼續開」和「飛起來」哪個先到。飛比較快就核准升空、排好降落時段（開著也能問，核准後慢下來停住就自動升空）（手機：問總控）'],
    ['再按 U', '總控建議繼續開、或建議先開等時段時，10 秒內再按一次就照你的意思現在升空'], ['C', '飛行中切換車外／駕駛座視角', 'desk']] },
};
const FEATURES_ORDER = () => ['nav', 'preview', 'ev', 'roadster', G.mode === 'hybrid' ? 'ctl' : 'drone'];
const featureOn = (k) => k === 'ctl' ? G.mode === 'hybrid' && econ.has('drone') && !!(car && car.spec.stunt)
  : econ.has(k) && (k === 'nav' || k === 'preview' || (k === 'ev' ? !!(car && car.spec.electric) : !!(car && car.spec.stunt)));
function renderHelp() {
  const rows = [...HELP_BASE];
  for (const k of FEATURES_ORDER()) if (featureOn(k)) rows.push(...FEATURE_HELP[k].rows.filter(r => r[2] !== 'touch'));
  $('help').innerHTML = rows.map(([k, v]) => `<kbd>${k}</kbd><span>${v.replace(/（手機[：:][^）]*）/g, '')}</span>`).join('') +
    '<kbd>H</kbd><span>收起／打開這張說明</span><span class="more">其他：Shift 走路時跑步・C 車外視角・Z／X 後照鏡・V 調座椅・N／B 配樂／引擎聲</span>';
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
  $('tipRows').innerHTML = F.rows.filter(r => input.coarse ? r[2] !== 'desk' : r[2] !== 'touch').map(([a, b]) => `<kbd>${input.coarse ? touchKey(a) : a}</kbd><span>${input.coarse ? touchify(b) : b.replace(/（手機[：:][^）]*）/g, '')}</span>`).join('');
  $('tipCard').hidden = false; $('help').hidden = true; input.releaseLock();   // 說明卡出現時先收起按鍵說明，一次只看一樣
  $('tipOk').onclick = () => { seen.push(k); try { localStorage.setItem(TIP_KEY, JSON.stringify(seen)); } catch (err) { /* ignore */ } showTips(); };
}
function makeCar(key) {
  const spec = carSpec(key);
  if (car) scene.remove(car.group);
  car = new PlayerCar(scene, world, spec);
  // 每撞一次扣修車費（特技翻車、被別人的飛天跑車壓到：那邊已經另外算或對方負責，這裡不重複扣）
  car.onBump = (s) => {
    if (G.demo || uiTime < (G.bumpFreeT || 0)) { if (s > 0.4) toast(s > 1.5 ? '碰！撞到了' : '擦撞', 1.3); return; }
    const fee = repairFee(s); econ.addRepair(fee);
    toast(`${s > 1.5 ? '碰！撞到了' : '擦撞'}　修車費 ${fmtMoney(fee)}`, 2);
  };
  car.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  cockpit = new Cockpit(spec);
  cockpit.hemi.intensity = 5.0; cockpit.sun.intensity = 3.2;
  engine.setKind(spec.electric ? 'ev' : 'gas');
  // 飛天跑車：特技系統。特技用空氣罐的壓縮空氣（存檔裡的 stuntFuel，0..1）；用完特殊功能就停用。
  // 不用另外補氣：開車時車上的小壓縮機慢慢補回來，用的是車子的電。
  stunts = spec.stunt ? new Stunts(car, world, {
    fuel: () => econ.stuntFuel,
    burn: (f) => { if (econ.stuntFuel <= 1e-4 || (f > 0.005 && econ.stuntFuel < f - 1e-6)) return false; econ.stuntFuel = Math.max(0, econ.stuntFuel - f); return true; },
    regen: (d) => { if (econ.stuntFuel >= 1) return; const add = Math.min(1 - econ.stuntFuel, d / 1000 * AIR.drivePerKm); econ.stuntFuel += add; car.energy = Math.max(0, car.energy - add * AIR.driveKwhPerTank); G.airRegenT = 1.5; },
    toast: (m, sec) => toast(m, sec),
    crash: (fee, msg) => { G.bumpFreeT = uiTime + 0.3; econ.addRepair(fee); toast(`${msg}　修車費 ${fmtMoney(fee)}`, 2.8); },
    locked: () => skillBanned(), lockMsg: () => `飛天跑車的特殊功能停用中（被附近車主檢舉），${banEndText()} 才能再用`,
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
  stopInstrument(true); leaveBasement();
  input.enabled = false; input.releaseLock(); engine.shutdown();
  G.state = 'menu'; $('hud').hidden = true; $('menu').hidden = false; $('touch').hidden = true;
  destBeacon.visible = carBeacon.visible = false; bayMarks.count = 0; routeLine.visible = false;
  traffic.clear(); refreshContinue(); renderModes(); renderDemos(); $('tipCard').hidden = true; showPage('pgTitle');
}
/** 公司附近的路邊停車：照一般的占用比例（約七成五停滿），離公司 30～260 m 至少留 3 個空格。 */
function workParking() {
  const w = G.cfg.work; if (!w || !parking) return;
  parking.ensureFreeNear(w.x, w.z, 3);
}
function save() {
  if (G.demo) return;
  if (G.mode === 'normal' && econ.has('roadster') && econ.has('drone')) { try { localStorage.setItem(UNLOCK_KEY, '1'); } catch (err) { /* ignore */ } }
  store.set({ v: 2, cfg: G.cfg, day: G.dayN, econ: econ.toJSON(), homeCar: G.homeCar, gasLeft: G.gasLeft, annoy: G.annoy || 0, banUntil: G.banUntil || 0, prac: G.prac || null,
    towNext: G.towNext || (G.tow && G.state === 'room' ? { yi: TOW.yards.indexOf(G.tow.yard), towT: G.tow.towT + 24 * 60 } : null) }); }   // 早上還沒去領車就關掉遊戲：下次車子還在保管場

// ===================================================================== 每日流程
function startDay() {
  const h = G.cfg.home;
  if (!car || car.spec.key !== econ.carKey) makeCar(econ.carKey);
  renderHelp();
  leaveBasement();
  G.state = 'loading'; G.leg = 'am'; G.phase = 'room'; G.parked = null; G.clock = TIME.startMin;
  setSun('am'); applyMode(); ctlReset('am');
  $('hud').hidden = true; $('loading').hidden = false;
  $('loadText').textContent = `第 ${G.dayN} 天｜載入${districtName(G.cfg.di)}街區…`;
  $('loadSub').textContent = '道路、建物、招牌與停車格';
  G.focus = { x: h.x, z: h.z };
  parking.setDay(G.dayN); traffic.clear();
  econ.setLife(G.cfg.home, districtName(G.cfg.di), G.cfg.work, G.cfg.work ? districtName(G.cfg.work.d) : '');   // 薪水、房租／房貸：選的時候看不到，領錢和結算時才知道
  econ.startDay();
  // 昨晚停路邊被拖吊：今天早上車子在保管場（towT 換算成今天的時間，會是負的）
  G.annoy = Math.max(0, (G.annoy || 0) - ANNOY.decayPerDay);   // 厭惡值每天自然消一點
  G.tow = G.towNext && !G.demo ? { yard: TOW.yards[G.towNext.yi] || TOW.yards[2], towT: G.towNext.towT - 24 * 60 } : null; G.towNext = null;
  towMark.visible = false;
  G.wait = {
    cond: () => world.readyAround(h.x, h.z, 320) && parking.readyAround(h.x, h.z, 210),
    then: () => {
      parking.setDay(G.dayN); workParking();
      let bay = null; const gs = garageSpot(); G.atGarage = !!gs;
      garageMark.visible = !!gs && gs.type === 'garage'; curbMark.visible = !!gs && gs.type === 'curb';
      if (gs) { for (const mk of [garageMark, curbMark]) { mk.position.set(gs.x, gs.y, gs.z); mk.rotation.y = gs.psi; } parking.forBaysNear(gs.x, gs.z, 9, (b) => { b.reserved = true; b.occupied = false; }); }
      let street = null;
      if (gs || G.tow) { /* 有地下停車位：車子從自己的車位出發；被拖吊：車子在保管場 */ }
      else if (G.homeCar) { const err = {}; bay = parking.bayAt(G.homeCar.x, G.homeCar.z, G.homeCar.psi, err); if (bay) { bay.reserved = true; bay.occupied = false; } else street = G.homeCar; }   // 昨晚停路邊（沒被拖走）：車子還在原地
      if (!bay && !street && !G.tow) bay = parking.pickHomeBay(h.x, h.z, G.dayN);
      if (stunts) stunts.reset();
      if (G.tow) { G.atGarage = false; car.place(G.tow.yard.x, G.tow.yard.z, 0, 0); G.homeBay = null; }
      else if (gs) { car.place(gs.x, gs.z, gs.psi, gs.y); G.homeBay = null; }
      else if (street) { car.place(street.x, street.z, street.psi, world.groundAt(street.x, street.z)); G.homeBay = null; }
      else if (bay) { car.place(bay.x, bay.z, bay.psi, bay.y); G.homeBay = bay; }
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
  if (input.touch) roomCamPhone();
  const mt = G.mode === 'allfly' ? '（全城飛天跑車：每台車都會飛越車陣）' : G.mode === 'alldrone' ? '（全城無人機：路上幾乎沒車，天上擠滿飛行車）' : G.mode === 'hybrid' ? '（路空總控：想飛先按 U 問總控）' : '';
  toast(`第 ${G.dayN} 天早上 7:30${mt}。走到門口出門上班（書桌的電腦可以開商店）`, 4);
  save();
}
function leaveRoom() {
  stopInstrument(true);
  if (G.tow) {   // 走到樓下：車子不見了（昨晚被拖吊）
    G.stats.leave = G.clock;
    fadeThen(() => { if (avatar) scene.add(avatar.group); P.inRoom = false; towPickup(G.cfg.home.x, G.cfg.home.z, '車子不見了：昨晚停在路邊被拖吊了。'); });
    return;
  }
  if (G.atGarage && econ.has('garage')) { G.stats.leave = G.clock; fadeThen(() => enterBasement('am')); return; }
  fadeThen(() => {
    const h = G.cfg.home;
    G.state = 'walk'; G.phase = 'toCar'; P.inRoom = false;
    if (avatar) scene.add(avatar.group);
    P.x = h.x; P.z = h.z; P.y = world.groundAt(h.x, h.z); P.yaw = Math.atan2(-(car.x - P.x), -(car.z - P.z)); tp.yaw = P.yaw;
    tp.dist = 4.4; tp.curDist = 4.4; tp.pitch = 0.22;
    G.stats.leave = G.clock;
    camera.near = 0.15; camera.fov = 62; camera.updateProjectionMatrix();
    traffic.update(0.016, P.x, P.z, [], true);
    const hb = G.homeBay;
    toast(G.atGarage ? '車停在家門口的住戶專用車位（藍色的 P），跟著藍色光柱走過去'
      : hb && !hb.edge ? '車停在附近的停車場，跟著藍色光柱走過去'
      : `車停在${hb && hb.edge.name ? hb.edge.name + '的' : ''}路邊，跟著藍色光柱走過去`);
  });
}

let seatShown = false;
function enterCar() {
  fadeThen(() => {
    if (G.inBasement) { leaveBasement(); const gs = garageSpot(); if (gs) car.place(gs.x, gs.z, gs.psi, gs.y); toast('從地下室開出來了', 2); }
    G.state = 'drive'; G.phase = 'drive'; G.parked = null;
    if (avatar) avatar.group.visible = false;
    audioStart(); engine.ignite();
    cockpit.lookYaw = 0; cockpit.lookPitch = 0;
    G.cam = defaultCam(); G.chase = null;
    camera.near = G.cam === 'cockpit' ? 0.8 : 0.3; camera.updateProjectionMatrix();
    planRoute();
    if (G.cam !== 'cockpit') { seatShown = true; loadSeat(); applySeat(); toast('地圖在右上角「⋯」', 2.5); showTips(); }   // 手機：車外（第三人稱）視角，不用調座椅
    else if (!seatShown) { seatShown = true; openSeat(); }
    else { loadSeat(); applySeat(); toast('按住 Z／X 看後照鏡，停車時按 V 調座椅', 2.5); showTips(); }
  });
}

const _err = { along: 0, lat: 0, ang: 0 };
function bayAllowed(b) { return b.type === 'road' || (b.type === 'ev' && !!car.spec.electric); }   // 電動車（含飛天跑車）可以停電動車格（示範自動停車只用這兩種）
/** 停車費（路邊停車格、停車場、停車場裡的電動車格都按小時算）：這格每小時多少錢、停到什麼時候（早上停到 18:00 下班，晚上停到隔天 7:30 出門）。 */
function lotInfo(b) {
  if (!b.rate) { const dn = world.districtAt(b.x, b.z) || ''; b.rate = b.type === 'road' ? roadRate(dn) : lotRate(dn); }
  const hrs = G.leg === 'am' ? (TIME.homeMin - G.clock) / 60 : (24 * 60 + TIME.startMin - G.clock) / 60;
  return { rate: b.rate, fee: Math.ceil(Math.max(0, hrs) - 1e-6) * b.rate };
}
/** 玩家可以合法停的格子：路邊格、停車場格（計時收費）、電動車格（電動車）。 */
function canPark(b) { return bayAllowed(b) || b.type === 'lot'; }
function parkingCheck() {
  const gs = G.leg === 'pm' ? garageSpot() : null;
  if (gs && Math.hypot(car.x - gs.x, car.z - gs.z) < 7) return gs.type === 'garage' ? { bay: gs, ok: true, under: true, msg: '地下停車場入口' } : { bay: gs, ok: true, msg: '停進自己的住戶專用車位' };
  const b = parking.bayAt(car.x, car.z, car.psi, _err);
  if (!b) return { bay: null, ok: false, msg: '' };
  if (b.type === 'ev' && !car.spec.electric) return { bay: b, ok: false, kind: 'evgas', msg: '電動車專用格，油車停這裡算違規' };
  const lot = b.type === 'garage' ? null : lotInfo(b);
  if (Math.abs(_err.ang) > PARK.angTol) return { bay: b, ok: false, kind: 'align', msg: '車身要擺正' };
  if (Math.abs(_err.lat) > PARK.latTol) return { bay: b, ok: false, kind: 'align', msg: '壓到格線了，往格子中間一點' };
  if (Math.abs(_err.along) > PARK.posTol) return { bay: b, ok: false, kind: 'align', msg: _err.along > 0 ? '再往後一點' : '再往前一點' };
  return { bay: b, ok: true, msg: lot ? `${b.type === 'road' ? '路邊停車格' : '停車場'}每小時 ${lot.rate} 元` : '已停妥', rate: lot && lot.rate };
}
function exitCar() {
  if (flight && flight.active) { toast('飛行中不能下車', 1.6); return; }
  if (stunts && stunts.busy) { toast(stunts.mode === 'roof' ? '屋頂上不能下車，先開下去' : '特技中不能下車', 1.6); return; }
  if (Math.abs(car.v) > 0.4) { toast('先停下來才能下車', 1.6); return; }
  const chk = parkingCheck(), near = dist(car, dest()) < 450;
  // 停進格子（路邊格、停車場、電動車格、自己的地下停車位）＝合法；其他（路邊沒有格子、壓線、油車停電動車格）＝違規停車，可能被拖吊
  // legal：離目的地夠近、可以走過去了（違規停車也算，只是可能被拖吊）
  G.parked = { legal: near, illegal: !chk.ok, ok: chk.ok, bay: chk.ok ? chk.bay : null, type: chk.ok ? chk.bay.type : 'street', rate: chk.rate || 0, t: G.clock };
  if (chk.ok && chk.bay) { chk.bay.reserved = true; chk.bay.occupied = false; }   // 自己的車停在這格（之後重新佈置車格也不會被別台車占走）
  if (chk.under && near) {   // 開進自己家的地下室：在地下室下車，搭電梯回家
    G.phase = 'toDest'; engine.shutdown(); engine.stunt(0, 0); routeLine.visible = false;
    fadeThen(() => enterBasement('pm'));
    return;
  }
  G.phase = 'toDest'; engine.shutdown(); engine.stunt(0, 0);
  fadeThen(() => {
    const lx = -Math.cos(car.psi), lz = Math.sin(car.psi);
    P.x = car.x + lx * 1.7; P.z = car.z + lz * 1.7; P.y = car.y; P.yaw = car.psi + Math.PI / 2; tp.yaw = car.psi;
    const p = { x: P.x, z: P.z }; if (world.collide(p, 0.4)) { P.x = car.x - lx * 1.7; P.z = car.z - lz * 1.7; }
    if (avatar) avatar.group.visible = true;
    G.state = 'walk'; camera.near = 0.15; camera.updateProjectionMatrix();
    routeLine.visible = false;
    const where = G.leg === 'am' ? '公司' : '家', go = G.leg === 'am' ? '走去公司打卡' : '走回家';
    toast(!G.parked.legal ? `這裡離${where}太遠（要 450 m 內），回車上開近一點再停`
      : G.parked.illegal ? (chk.kind === 'evgas' ? `油車停電動車專用格算違規，可能被拖吊。${go}` : chk.kind === 'align' ? `沒停進格子裡（${chk.msg}），算違規停車，可能被拖吊。${go}` : `停在路邊（不是停車格），可能被拖吊。${go}`)
      : chk.bay.type === 'ev' ? `停進電動車格（停車每小時 ${chk.rate} 元，會順便充電），${go}` : chk.bay.type === 'curb' ? `停進家門口的住戶專用車位，${go}` : chk.bay.type === 'lot' ? `停進停車場（每小時 ${chk.rate} 元），${go}` : `停好了（路邊停車格每小時 ${chk.rate} 元），${go}`, 4);
  });
}

/** 到達公司（早上）或家（晚上）。 */
function arrive() {
  const c = car;
  econ.addEnergy(c.spec, Math.max(0, G.legE0 - c.energy), true);     // 這一趟用掉的油或電
  if (G.leg === 'am') {
    const late = Math.max(0, G.clock - TIME.workMin);
    const payAm = econ.clockIn(late);
    if (G.parked.rate) econ.addLot((TIME.homeMin - G.parked.t) / 60, G.parked.rate);   // 停車費按小時：停到 18:00 下班
    if (G.parked.type === 'ev') { const need = c.spec.capacity - c.energy; econ.day.charge += need * PAY.bayKwh; c.energy = c.spec.capacity; }
    G.tow = null;
    if (G.parked.illegal && towRoll(TOW.workP)) G.tow = { yard: towYard(world.districtAt(c.x, c.z)), towT: G.parked.t + 20 + Math.random() * Math.max(0, 17 * 60 - G.parked.t - 20) };   // 上班時被拖走（停好 20 分鐘後到 17:00 之間）
    G.amClock = G.clock;
    G.state = 'work'; setPrompt(''); input.releaseLock();
    const f = $('fade'); $('workText').textContent = (late > 0.5 ? `${fmtClock(G.clock)} 打卡，遲到 ${Math.round(late)} 分鐘` : `${fmtClock(G.clock)} 準時打卡`) + `　這趟 +${fmtMoney(payAm)}`;
    f.classList.add('on'); $('workCard').hidden = false;
    setTimeout(() => {
      if (G.tow) {   // 下班走出公司：車不見了 → 搭計程車去保管場領車
        G.leg = 'pm'; G.clock = TIME.homeMin; setSun('pm'); traffic.clear(); ctlReset('pm'); G.parked = null; G.legE0 = c.energy;
        $('workText').textContent = `18:00 下班。走出公司，車子不見了：停在路邊被拖吊到「${G.tow.yard.n}」`;
        setTimeout(() => { $('workCard').hidden = true; f.classList.remove('on'); towPickup(G.cfg.work.x, G.cfg.work.z); }, 3200);
        return;
      }
      // 下班：18:00 從公司門口出來，走回車上
      G.leg = 'pm'; G.phase = 'toCar'; G.clock = TIME.homeMin; setSun('pm'); traffic.clear(); ctlReset('pm');
      const w = G.cfg.work; P.x = w.x; P.z = w.z; P.y = world.groundAt(w.x, w.z); P.yaw = Math.atan2(-(car.x - P.x), -(car.z - P.z)); tp.yaw = P.yaw;
      G.parked = null; G.legE0 = c.energy; G.state = 'walk';
      traffic.update(0.016, P.x, P.z, [], true);
      $('workCard').hidden = true; f.classList.remove('on');
      toast('18:00 下班了，走回車上開回家');
    }, 3200);
  } else {
    if (G.parked.rate) econ.addLot((24 * 60 + TIME.startMin - G.parked.t) / 60, G.parked.rate);   // 停車費按小時：過夜停到隔天 7:30 出門
    // 晚上停路邊（違規）過夜：可能半夜被拖走，隔天早上出門才發現
    G.towNext = G.parked.illegal && towRoll(TOW.nightP) ? { yi: TOW.yards.indexOf(towYard(world.districtAt(c.x, c.z))), towT: G.parked.t + 30 + Math.random() * 300 } : null;
    econ.homeTrip(); finishDay();
  }
}

function finishDay() {
  const c = car, s = G.stats, km = (c.odo - s.odo0) / 1000, bumps = c.bumps - s.bumps0;
  G.gasLeft = c.spec.electric ? undefined : c.energy;
  G.homeCar = G.parked && G.parked.bay ? { x: G.parked.bay.x, z: G.parked.bay.z, psi: G.parked.bay.psi } : { x: car.x, z: car.z, psi: car.psi };
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
    ['上班這趟', fmtMoney(r.payAm) + (r.late ? `（遲到扣 ${fmtMoney(r.trip - r.payAm)}）` : ''), 'good'],
    ['回家這趟', fmtMoney(r.payPm), 'good'],
    [r.housingKind, '−' + fmtMoney(r.housing), ''],
    [c.spec.electric ? '電費' : '油錢', '−' + fmtMoney(r.energy), ''],
    ['停車／充電', '−' + fmtMoney(r.parking + charge), ''],
  ];
  if (r.drone) rows.push(['無人機燃料', '−' + fmtMoney(r.drone), '']);
  if (r.repair) rows.push(['修車', '−' + fmtMoney(r.repair), 'bad']);
  if (r.tow) rows.push(['拖吊（移置費、保管費、計程車）', '−' + fmtMoney(r.tow), 'bad']);
  rows.push(['今天淨賺', fmtMoney(r.net), r.net >= 0 ? 'good' : 'bad'], ['存款', fmtMoney(r.money), '']);
  $('sumStats').innerHTML = rows.map(([k, v, cl]) => `<dt>${k}</dt><dd class="${cl}">${v}</dd>`).join('');
  $('summary').hidden = false; refreshMoveBtn();
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
function closeShop() { $('shop').hidden = true; input.noLock = false; if (G.shopFromSummary) { G.shopFromSummary = false; $('summary').hidden = false; refreshMoveBtn(); } }
function renderShop() {
  $('shopMoney').textContent = fmtMoney(econ.money);
  const box = $('shopList'); box.innerHTML = '';
  for (const it of SHOP) {
    const p = econ.price(it.key), owned = econ.has(it.key), ready = READY[it.key];
    const d = document.createElement('div'); d.className = 'item' + (owned ? ' owned' : '');
    const evNote = it.key === 'ev' && !owned && econ.has('roadster') ? '<p class="saved">你的飛天跑車也是電動車，已經可以停電動車專用格了</p>' : '';
    d.innerHTML = `<div class="ihead"><b>${it.name}</b><span class="price">${owned ? '已擁有' : fmtMoney(p)}</span></div><p>${touchify(it.desc)}</p>${SAVED_NOTE[it.key] ? `<p class="saved">${SAVED_NOTE[it.key]}</p>` : ''}${evNote}`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'buy';
    if (owned) { b.textContent = '已擁有'; b.disabled = true; }
    else if (!ready) { b.textContent = '製作中'; b.disabled = true; }
    else if (it.requires && !econ.has(it.requires)) { const need = SHOP.find(s2 => s2.key === it.requires); b.textContent = `要先有${need ? need.name : it.requires}`; b.disabled = true; }
    else if (it.key === 'curbspot' && econ.has('garage')) { b.textContent = '已經有地下停車位'; b.disabled = true; }
    else if (econ.money < p) { b.textContent = `還差 ${fmtMoney(p - econ.money)}`; b.disabled = true; }
    else { b.textContent = '購買'; b.onclick = () => { const r = econ.buy(it.key); toast(!r.ok ? r.msg : it.key === 'garage' ? `${r.msg}：家裡多了一層地下室。明天起早上搭電梯下樓就能開車，回家開到家門口紫色的 P（地下停車場入口）就會開進地下室` : it.key === 'curbspot' ? `${r.msg}：明天起車子停在家門口的住戶專用車位，回家停進藍色的 P 就好` : `${r.msg}：上路時會告訴你怎麼用。也多了一次換住址或工作的機會（在結算畫面）`, 3.5); save(); renderShop(); renderHelp(); }; }
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
  $('shopNote').textContent = '';
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
  $('ctlVerdict').textContent = touchify(v); $('ctlVerdict').className = ev.fly ? 'ok' : 'no';
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
function buildRouteMesh(cx = car.x, cz = car.z, cy = car.y) {
  const p = G.routePoly; if (!p || p.length < 4) { routeLine.visible = false; return; }
  const pos = [], idx = [], W = 1.1, q = {};
  let n = 0;
  for (let i = Math.max(0, G.routeIdx - 2); i + 3 < p.length && n < 3000; i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.3) continue;
    if (Math.hypot(ax - cx, az - cz) > 900) break;
    const nx = -(bz - az) / L * W, nz = (bx - ax) / L * W;
    const sa = world.surfaceAt(ax, az, cy + 0.5, q), ya = (sa ? sa.y : world.groundAt(ax, az)) + 0.3;
    const sb = world.surfaceAt(bx, bz, cy + 0.5, q), yb = (sb ? sb.y : world.groundAt(bx, bz)) + 0.3;
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
// 手機在家裡：鏡頭拉高、拉遠，從斜上方往下看（房間的牆和天花板從外面看是透明的），人物不會塞滿畫面
const ROOM_PHONE = { distPort: 5.3, distLand: 4.6, pitch: 0.82, minPitch: 0.5, fovPort: 64, fovLand: 56 };
function roomCamPhone() {
  const d = camera.aspect < 1 ? ROOM_PHONE.distPort : ROOM_PHONE.distLand;
  tp.dist = d; tp.curDist = d; tp.pitch = ROOM_PHONE.pitch;
  camera.fov = camera.aspect < 1 ? ROOM_PHONE.fovPort : ROOM_PHONE.fovLand; camera.updateProjectionMatrix();
}
/** 手機在家裡：鏡頭只會被家具擋住（可以在牆外、天花板上面）。 */
const roomFurnBlocked = (x, y, z) => { for (const b of room.boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.h) return true; return false; };
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
  if (G.inst && uiTime >= G.inst.end) stopInstrument(false);
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
  tp.minPitch = input.touch ? ROOM_PHONE.minPitch : -0.35;
  if (input.touch) { const port = camera.aspect < 1, f = port ? ROOM_PHONE.fovPort : ROOM_PHONE.fovLand; tp.dist = port ? ROOM_PHONE.distPort : ROOM_PHONE.distLand; if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }
  tp.update(dt, P.x, 0, P.z, input.touch ? roomFurnBlocked : roomBlocked, () => 0);
  const nearDoor = Math.hypot(P.x - room.door.x, P.z - room.door.z) < 1.25, nearDesk = Math.hypot(P.x - room.desk.x, P.z - room.desk.z) < 1.0;
  const nearPno = Math.hypot(P.x - room.piano.x, P.z - room.piano.z) < 0.85, nearGtr = Math.hypot(P.x - room.guitar.x, P.z - room.guitar.z) < 0.85;
  G.roomNear = G.inst ? 'inst' : nearDoor ? 'door' : nearPno || nearGtr ? 'inst' : nearDesk ? 'desk' : '';
  if (G.inst) {   // 正在彈：按 E 或走開就停
    const k = G.inst.kind;
    if (k === 'gtr') holdGuitar();
    setPrompt(`${k === 'pno' ? '彈鋼琴' : '彈吉他'}中…　<kbd>E</kbd> 停下來`);
    if (input.pressed('KeyE') || Math.abs(input.forward) > 0.3 || Math.abs(input.strafe) > 0.3) stopInstrument(true);
  } else {
    setPrompt(nearDoor ? '<kbd>E</kbd> 出門' : nearPno ? '<kbd>E</kbd> 彈鋼琴' : nearGtr ? '<kbd>E</kbd> 彈吉他' : nearDesk ? '<kbd>E</kbd> 打開電腦（商店）' : '走到房門口出門上班');
    if (input.pressed('KeyE')) { if (nearDoor) leaveRoom(); else if (nearPno) startInstrument('pno'); else if (nearGtr) startInstrument('gtr'); else if (nearDesk) openShop(); }
  }
  world.update(G.cfg.home.x, G.cfg.home.z, dt);
  parking.update(dt, G.cfg.home.x, G.cfg.home.z);
}
// ===================================================================== 地下室
function enterBasement(leg) {
  G.state = 'basement'; G.inBasement = true; P.inRoom = true; P.y = 0;
  const B = basement;
  basement.scene.add(car.group); car.group.position.set(B.car.x, 0, B.car.z); car.group.rotation.set(0, B.car.psi, 0); car.body.visible = true;
  if (avatar) { basement.scene.add(avatar.group); avatar.group.visible = true; }
  destBeacon.visible = carBeacon.visible = false; bayMarks.count = 0; routeLine.visible = false;
  camera.near = 0.05; camera.updateProjectionMatrix();
  if (leg === 'am') { P.x = B.lift.x + 0.4; P.z = B.lift.z + 0.6; G.phase = 'toCar'; toast('搭電梯下樓到地下室了，你的車停在中間那一格', 3); }
  else { P.x = B.car.x - 1.5; P.z = B.car.z - 0.6; G.phase = 'toDest'; toast('開進家裡的地下室停好了，搭電梯回家', 3); }
  P.yaw = Math.atan2(-((leg === 'am' ? B.car.x : B.lift.x) - P.x), -((leg === 'am' ? B.car.z : B.lift.z) - P.z)); tp.yaw = P.yaw; tp.dist = 3.2; tp.curDist = 3.2; tp.pitch = 0.32;
  $('hud').hidden = false; if (input.touch) $('touch').hidden = false;
}
/** 把車子和人放回城市（從地下室開出去，或搭電梯回家之前）。 */
function leaveBasement() {
  if (!G.inBasement) return;
  scene.add(car.group); if (avatar) scene.add(avatar.group);
  G.inBasement = false; P.inRoom = false;
  camera.near = 0.15; camera.updateProjectionMatrix();
}
const basementBlocked = (x, y, z) => {
  const B = basement, m = 0.12;
  if (x < -B.W / 2 + m || x > B.W / 2 - m || z < -B.D / 2 + m || z > B.D / 2 - m || y > B.H - 0.1) return true;
  for (const b of B.boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.h) return true;
  return false;
};
function basementFrame(dt) {
  tp.input(input.lookX, input.lookY);
  const ox = P.x, oz = P.z, B = basement;
  stepWalk(dt);
  const m = 0.3;
  P.x = Math.max(-B.W / 2 + m, Math.min(B.W / 2 - m, P.x)); P.z = Math.max(-B.D / 2 + m, Math.min(B.D / 2 - m, P.z));
  for (const b of B.boxes) {
    if (P.x > b.x0 - m && P.x < b.x1 + m && P.z > b.z0 - m && P.z < b.z1 + m) {
      const dx0 = P.x - (b.x0 - m), dx1 = b.x1 + m - P.x, dz0 = P.z - (b.z0 - m), dz1 = b.z1 + m - P.z, mn = Math.min(dx0, dx1, dz0, dz1);
      if (mn === dx0) P.x = b.x0 - m; else if (mn === dx1) P.x = b.x1 + m; else if (mn === dz0) P.z = b.z0 - m; else P.z = b.z1 + m;
    }
  }
  P.speed = Math.hypot(P.x - ox, P.z - oz) / Math.max(dt, 1e-4);
  if (avatar) avatar.update(dt, P.x, 0, P.z, P.yaw, P.speed);
  tp.minPitch = -0.35;
  tp.update(dt, P.x, 0, P.z, basementBlocked, () => 0);
  const nearCar = Math.hypot(P.x - B.car.x, P.z - B.car.z) < 3.0, nearLift = Math.hypot(P.x - B.lift.x, P.z - B.lift.z) < 1.4;
  G.bNear = G.phase === 'toCar' && nearCar ? 'car' : G.phase === 'toDest' && nearLift ? 'lift' : '';
  setPrompt(G.bNear === 'car' ? '<kbd>E</kbd> 上車' : G.bNear === 'lift' ? '<kbd>E</kbd> 搭電梯回家' : G.phase === 'toCar' ? '走到你的車' : '走到電梯（綠色的牌子）');
  if (input.pressed('KeyE')) {
    if (G.bNear === 'car') enterCar();
    else if (G.bNear === 'lift') { const gs = garageSpot(); leaveBasement(); if (gs) car.place(gs.x, gs.z, gs.psi, gs.y); setPrompt('到家了', 'good'); arrive(); }
  }
  world.update(G.cfg.home.x, G.cfg.home.z, dt);
  parking.update(dt, G.cfg.home.x, G.cfg.home.z);
}

// ===================================================================== 房間裡的鋼琴、吉他（照《雞不可失》的練法）
// 一天只算一次練習：第一天很不順、第二天好一點、第三天起就順了（中間沒練不會退步）。彈的時候配樂先收起來。
const INST_LINES = {
  gtr_0: ['第一次摸吉他，手指各彈各的。', '這首是〈阿爾罕布拉宮的回憶〉。現在彈出來的比較像〈回憶不起來〉。', '左手按不準，右手輪指也不太聽話。'],
  gtr_1: ['昨天練過了，今天手指有記得一點。', '還會卡，但卡得比較有節奏了。', '今天彈到後半段了，前半段假裝很熟。'],
  gtr_2: ['三天了，〈阿爾罕布拉宮的回憶〉終於順了。', '輪指順了，手指自己知道要去哪裡。', '這次是完整的一段，一次都沒卡住。'],
  gtr_end0: ['……彈完了。手指好痛。', '剛剛那幾個音不算，是在調音。'],
  gtr_end1: ['比昨天好，明天應該就順了。', '有幾個地方卡住，記下來了，明天修。'],
  gtr_end2: ['這一段可以一直彈下去。', '彈完了，心情很好，可以出門了。'],
  pno_0: ['第一次坐上琴椅，兩隻手一隻都不聽話。', '這首是〈匈牙利舞曲第五號〉。現在只彈得出前面一點點。', '右手找旋律，左手找不到路。'],
  pno_1: ['昨天練過了，今天兩隻手開始認識彼此。', '今天彈完整段，還要升 key。升上去會不會掉下來，不保證。', '快的地方還是會打結。'],
  pno_2: ['三天了，〈匈牙利舞曲第五號〉彈兩遍，第二遍還升 key。', '琴鍵終於肯聽話了。', '兩隻手終於一起走了。'],
  pno_end0: ['……彈完了。左手說它盡力了。', '手指打結了，明天再解。'],
  pno_end1: ['比昨天好，升 key 那邊明天再修。', '有幾個地方卡住，記下來了。'],
  pno_end2: ['彈完了，布拉姆斯聽了應該會點頭。', '這段可以拿出去表演了。'],
  prac: ['今天練過了。再彈幾次也是這樣，手指要睡一覺才會記得，明天再來。', '一天練十次，不如十天各練一次。', '今天的份練完了。進步是明天的事，不是等一下的事。'],
};
const pickLine = (k) => { const a = INST_LINES[k]; return a[Math.floor(Math.random() * a.length)]; };
let instOut = null;
function instLevel(kind) {
  const P = G.prac || (G.prac = {});
  if (P[kind + 'Last'] !== G.dayN) { P[kind + 'Days'] = (P[kind + 'Days'] || 0) + 1; P[kind + 'Last'] = G.dayN; }
  return Math.max(0, Math.min(2, (P[kind + 'Days'] || 1) - 1));
}
function startInstrument(kind) {
  const level = instLevel(kind);
  const face = kind === 'pno' ? room.piano : room.guitar;
  P.x = face.x; P.z = face.z; P.yaw = face.yaw;
  // 鏡頭：彈鋼琴從斜後方看得到琴鍵；彈吉他人轉向房間、鏡頭在前面看得到吉他
  if (kind === 'gtr') { P.yaw = face.yaw + Math.PI; tp.yaw = P.yaw + Math.PI + 0.35; } else tp.yaw = P.yaw + 0.85;
  tp.pitch = input.touch ? 0.6 : 0.28;
  save();
  audioStart();
  const ctx = music.ctx;
  if (!ctx || !music.on) {   // 配樂關著：照樣算練習，只是聽不到
    toast(pickLine(kind + '_' + level) + '（配樂關著，聽不到琴聲：在「⋯」或右上角打開配樂）', 4);
    return;
  }
  if (!instOut) { instOut = ctx.createGain(); instOut.connect(ctx.destination); }
  instOut.gain.value = Math.max(0.25, music.volume) * 1.1;
  music.hold(true);
  const p = playInstrument(ctx, instOut, kind, level);
  G.inst = { kind, level, stop: p.stop, end: uiTime + p.dur };
  toast(pickLine(kind + '_' + level), Math.min(6, p.dur));
}
function stopInstrument(early) {
  const I = G.inst; if (!I) return;
  G.inst = null; I.stop(); music.hold(false);
  if (I.kind === 'gtr') { room.gtr.position.copy(room.gtrHome.p); room.gtr.rotation.copy(room.gtrHome.r); }
  if (early) { toast('先不彈了。', 1.5); return; }
  const end = pickLine(I.kind + '_end' + I.level);
  toast(end, 4);
  if (I.level < 2) setTimeout(() => { if (G.state === 'room' && !G.inst && $('toast').textContent === touchify(end)) toast(pickLine('prac'), 5); }, 4300);   // 還沒練順：提醒每天練一點比一天練很多有用
}
/** 彈吉他的時候把吉他拿到人的身前（琴頸朝左上）。 */
function holdGuitar() {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = -fz, rz = fx;   // r：人的右手邊（往前 × 往上）
  room.gtr.position.set(P.x + fx * 0.3 + rx * 0.16, 0.8, P.z + fz * 0.3 + rz * 0.16);   // 琴身在身體前面偏右，琴頸往左
  room.gtr.rotation.set(0, Math.atan2(fx, fz), -Math.PI / 2 + 0.4);
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
  tp.minPitch = -0.35;
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
  const atDoor = G.phase === 'toDest' && dDest < 4.5 && G.parked && G.parked.legal && dDest < dCar;   // 車停在家門口時：離門口比較近就算到家
  if (dCar < 3.0 && !atDoor) { setPrompt('<kbd>E</kbd> 上車'); if (input.pressed('KeyE')) enterCar(); }
  else if (G.phase === 'toDest' && dDest < 4.5) {
    if (G.parked && G.parked.legal) { setPrompt(G.leg === 'am' ? '打卡中…' : '到家了', 'good'); arrive(); }
    else setPrompt('車停得離這裡太遠，回車上開近一點再停', 'warn');
  } else setPrompt('');
}

// ===================================================================== 駕駛座調整、舒適設定
const SEAT_DEF = { h: 0, f: 0, fov: 46, tilt: 5 };   // 視線微微往上：地平線在畫面中間偏下，擋風玻璃占大部分
const seatKey = () => 'taipei-seat3-' + (car ? car.spec.key : 'gas');   // 3：擋風玻璃占大部分畫面、不畫方向盤（舊的座椅設定不沿用）
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
if (input.touch && !comfort.qUser) comfort.quality = 'smooth';   // 手機預設「順暢優先」（玩家自己選過就照玩家的）
function applyComfort() {
  if (cockpit) { cockpit.autoCenter = comfort.autoCenter; cockpit.followPitch = comfort.followPitch; }
  const smooth = comfort.quality === 'smooth' || location.hash.startsWith('#lowq');
  sun.castShadow = !smooth;
  renderer.setPixelRatio(location.hash.startsWith('#lowq') ? 0.75 : Math.min(window.devicePixelRatio || 1, smooth ? 1 : input.touch ? 1.25 : 1.5)); resize();
  $('cfAuto').checked = comfort.autoCenter; $('cfPitch').checked = comfort.followPitch;
  for (const r of document.querySelectorAll('input[name=cfQ]')) r.checked = r.value === comfort.quality;
  $('cfInch').value = comfort.inch; $('cfCm').value = comfort.cm;
  if ($('moreQ')) $('moreQ').textContent = comfort.quality === 'smooth' ? '畫面：順暢優先（按一下改畫質優先）' : '畫面：畫質優先（按一下改順暢優先）';
  try { localStorage.setItem(COMFORT_KEY, JSON.stringify(comfort)); } catch (err) { /* 存不了就算了 */ }
}
$('cfAuto').addEventListener('change', (e) => { comfort.autoCenter = e.target.checked; applyComfort(); });
$('cfPitch').addEventListener('change', (e) => { comfort.followPitch = e.target.checked; applyComfort(); });
for (const r of document.querySelectorAll('input[name=cfQ]')) r.addEventListener('change', () => { comfort.quality = r.value; comfort.qUser = true; applyComfort(); });
$('cfCalc').onclick = () => {
  comfort.inch = Math.max(5, Math.min(100, +$('cfInch').value || 14)); comfort.cm = Math.max(20, Math.min(400, +$('cfCm').value || 55));
  const ar = (screen.width || 16) / (screen.height || 10), diag = comfort.inch * 2.54, h = diag / Math.sqrt(1 + ar * ar);
  let v = 2 * Math.atan(h / 2 / comfort.cm) * 180 / Math.PI;
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
  toast(input.touch ? '開車囉！地圖在右上角「⋯」' : '開車囉！按住 Z／X 看後照鏡，視線轉開了按 R 回正', 3.5);
  showTips();
}

// ===================================================================== 開車（第一人稱駕駛座）
let markT = 0, lotT = 0, frameN = 0;
function glance(dt) {
  const L = input.has('KeyZ'), R = input.has('KeyX'), k = Math.min(1, dt * 10);
  if (L || R) {
    const ty = L ? 0.56 : -0.94;
    cockpit.lookYaw += (ty - cockpit.lookYaw) * k; cockpit.lookPitch += (-0.26 - (cockpit.basePitch || 0) - cockpit.lookPitch) * k;   // 後照鏡跟著儀表台放低了：視線往下多一點 cockpit._idle = 0; G.glance = true;
  } else if (G.glance) {
    cockpit.lookYaw -= cockpit.lookYaw * k; cockpit.lookPitch -= cockpit.lookPitch * k;
    if (Math.abs(cockpit.lookYaw) < 0.01) { cockpit.lookYaw = 0; cockpit.lookPitch = 0; G.glance = false; }
  }
}
/** 開車的預設視角：電腦是駕駛座（第一人稱），手機是車外（第三人稱，跟在車子後面）。 */
function defaultCam() { return input.touch ? 'chase' : 'cockpit'; }
/**
 * 車外視角（第三人稱）：跟在車子後上方。
 *  ・跟著車頭方向轉（平滑），轉彎時鏡頭會慢慢繞到車後面；倒車時不會轉到車前面
 *  ・鏡頭跟車子之間有建物擋住就拉近（拉近快、退回慢），不會鑽進房子裡
 *  ・手機直拿（畫面窄）時鏡頭高一點、遠一點，看得到前面的路；地下道、隧道裡放低
 */
function chaseCam(c, dt, opt) {
  c.body.visible = true;
  const port = camera.aspect < 1, tun = !!(c.edge && c.edge.tunnel);
  const back = tun ? 6.2 : opt ? (port ? opt.backPort : opt.back) : port ? 8.4 : 7.2, up = tun ? 2.1 : opt ? (port ? opt.upPort : opt.up) : port ? 3.4 : 2.9;
  const yawT = Math.atan2(c.fwdX, c.fwdZ);
  let ch = G.chase;
  if (!ch || !Number.isFinite(ch.yaw)) ch = G.chase = { yaw: yawT, y: c.y, d: back };
  let dy = yawT - ch.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  ch.yaw += dy * Math.min(1, dt * (Math.abs(c.v) > 2 ? 3.2 : 1.6));
  ch.y += (c.y - ch.y) * Math.min(1, dt * 6);
  const ex = -Math.sin(ch.yaw), ez = -Math.cos(ch.yaw), py = ch.y + 1.6;
  // 從車頂往鏡頭的方向找第一個被建物擋住的地方
  let free = back;
  for (let i = 1; i <= 14; i++) {
    const d = back * i / 14, x = c.x + ex * d, z = c.z + ez * d, y = py + (up - 1.6) * i / 14;
    if (camBlocked(x, y, z)) { free = Math.max(2.4, back * (i - 1) / 14 - 0.3); break; }
  }
  if (free < ch.d) ch.d = Math.max(free, ch.d - 25 * dt); else ch.d = Math.min(free, ch.d + 2.5 * dt);
  const f = ch.d / back, cx = c.x + ex * ch.d, cz = c.z + ez * ch.d;
  let cy = py + (up - 1.6) * f;
  const gy = world.groundAt(cx, cz, cy); if (cy < gy + 0.6) cy = gy + 0.6;
  camera.position.set(cx, cy, cz);
  camera.lookAt(c.x - ex * 3.0, ch.y + 1.25, c.z - ez * 3.0);
}
function driveFrame(dt) {
  const c = car;
  if (input.pressed('KeyC')) {
    if (flight && flight.active) G.droneView = G.droneView === 'cockpit' ? 'ext' : 'cockpit';   // 飛行中：車外／駕駛座
    else if (!input.touch) { G.cam = G.cam === 'cockpit' ? 'chase' : 'cockpit'; G.chase = null; camera.near = G.cam === 'cockpit' ? 0.8 : 0.3; camera.updateProjectionMatrix(); }   // 手機固定車外視角
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
  const fov = G.camMode === 'cockpit' ? seat.fov : (camera.aspect < 1 ? 76 : 62);   // 駕駛座：直的螢幕也用同樣的上下視角，擋風玻璃照樣占大部分
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (G.seatAdj && input.pressed('Enter')) closeSeat();
  else if (!$('tipCard').hidden && input.pressed('Enter')) $('tipOk').click();   // 新功能說明卡：Enter 關掉
  if (!G.seatAdj && input.pressed('KeyV') && Math.abs(c.v) < 0.3 && G.cam === 'cockpit') openSeat();
  if (input.pressed('KeyP') && !G.demo) { startPreview(); if (G.preview) return; }
  if (input.pressed('KeyR') && G.cam === 'cockpit') cockpit.recenter();
  const fw = G.seatAdj ? 0 : input.forward;
  const pedals = G.seatAdj ? { throttle: 0, brake: 1, steer: 0, handbrake: true } : { throttle: Math.max(0, Math.min(1, fw > 0.15 ? fw : 0)) || input.tGas, brake: Math.max(0, Math.min(1, fw < -0.15 ? -fw : 0)) || input.tBrake,
    steer: -Math.max(-1, Math.min(1, input.strafe)), handbrake: input.has('Space') };
  lotT -= dt; if (lotT <= 0) { lotT = 0.2; c.onLot = parking.inLot(c.x, c.z) || !!parking.bayAt(c.x, c.z, c.psi, _err); }
  const obs = gatherObstacles(c.x, c.z, 14);
  if (flying) flight.update(dt, TIME.scale / 60, drones, statics);
  else if (stunts) {
    const sk = G.seatAdj ? {} : { boost: input.has('ShiftLeft', 'ShiftRight'), jump: input.pressed('KeyF'), grip: input.pressed('KeyG'), flip: input.pressed('KeyT'), flipDir: input.pressed('KeyT') ? input.flipDir : 0 }; input.flipDir = 0;
    stunts.update(dt, pedals, sk, obs, traffic);
  } else c.update(dt, pedals, obs);
  if (flight) flight.animate(dt);   // 旋翼展開／收回的動畫（不影響開車）
  if (drones) drones.update(dt, c.x, c.z, flying ? [{ x: flight.x, y: flight.y, z: flight.z, vx: flight.vx, vy: flight.vy, vz: flight.vz }] : null);
  // 壓縮空氣：開車時慢慢補回來（stunts 的 regen）
  G.airRegenT = Math.max(0, (G.airRegenT || 0) - dt);
  if (stunts) c.airText = `空氣 ${Math.round(econ.stuntFuel * 100)}%・${Math.floor(econ.stuntFuel * AIR.jumpsPerTank + 1e-6)} 次`;
  engine.update(dt, { v: flying ? 0 : c.v, throttle: c.energy > 0 && !flying ? c.thrF : 0, brake: c.brkF, cockpit: G.camMode === 'cockpit' });
  engine.stunt(flying ? 0.22 : stunts ? stunts.thrust : 0, flying ? 0.9 : stunts ? stunts.suction : 0);
  world.update(c.x, c.z, dt); parking.update(dt, c.x, c.z); signs.update(dt, c.x, c.z);
  traffic.update(dt, c.x, c.z, [{ x: c.x, z: c.z, y: c.y, r: 2.3 }]);
  jetMist(dt);
  for (const ev of traffic.events.splice(0)) {
    if (ev.type === 'hitPlayer') { G.bumpFreeT = uiTime + 0.3; c._bump(2); toast('被飛過來的飛天跑車壓到了！（對方負責修車費）', 2.6); }
    else if (Math.hypot(ev.x - c.x, ev.z - c.z) < 150) toast('前面有飛天跑車落地壓到別的車，撞成一團', 2.4);
  }
  if (G.camMode === 'drone') { c.body.visible = true; flight.camera(camera, dt); }
  else if (G.camMode === 'stunt') { c.body.visible = true; stunts.camera(camera, dt); }
  else if (G.camMode === 'cockpit') { cockpit.look(input.lookX, input.lookY, dt, Math.abs(c.v) > 1 && !G.seatAdj); glance(dt); cockpit.applyTo(camera, c); c.body.visible = false; }
  else chaseCam(c, dt);
  P.x = c.x; P.z = c.z; P.y = c.y;
  tunnelLight(dt, c.edge);
  const d = dest(), dDest = dist(c, d);
  destBeacon.visible = true; destBeacon.position.set(d.x, world.groundAt(d.x, d.z), d.z); carBeacon.visible = false;
  markT -= dt;
  if (markT <= 0) {
    markT = 0.4; let n = 0; G.markLot = 0;
    if (dDest < 420) {
      const list = [];
      parking.forBaysNear(c.x, c.z, 120, (b, d2) => { if (!b.occupied && !b.reserved && canPark(b) && dist(b, d) < 450) { b._d2 = d2; list.push(b); } });
      list.sort((a, b) => a._d2 - b._d2);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      for (const b of list.slice(0, 48)) {
        e.set(0, b.psi, 0); q.setFromEuler(e); v.set(b.x, b.y + 0.24, b.z); sc.set(b.wid - 0.3, 1, b.len - 0.3); m.compose(v, q, sc);
        bayMarks.setMatrixAt(n, m); bayMarks.setColorAt(n, b.type === 'ev' ? new THREE.Color(0x3fe08f) : b.type === 'lot' ? new THREE.Color(0x4aa8ff) : new THREE.Color(0xf5c518)); n++; if (b.type === 'lot') G.markLot++;
      }
    }
    bayMarks.count = n; bayMarks.instanceMatrix.needsUpdate = true; if (bayMarks.instanceColor) bayMarks.instanceColor.needsUpdate = true;
  }
  let pr = '', cls = '';
  if (Math.abs(c.v) < 1.2) {
    const chk = dDest < 450 ? parkingCheck() : { bay: null };
    const stopped = Math.abs(c.v) < 0.3;
    if (chk.ok && chk.under) { pr = '地下停車場入口　<kbd>E</kbd> 開進去'; cls = 'good'; }
    else if (chk.ok) { pr = (chk.rate ? `已停妥（${chk.bay.type === 'road' ? '路邊停車格' : '停車場'}每小時 ${chk.rate} 元）` : '已停妥') + '　<kbd>E</kbd> 下車'; cls = 'good'; }
    else if (chk.bay) { pr = chk.msg + (stopped ? '　<kbd>E</kbd> 下車（算違規停車）' : ''); cls = 'warn'; }
    else if (stopped && dDest < 450) { pr = '路邊不是停車格，可能被拖吊　<kbd>E</kbd> 下車'; cls = 'warn'; }
    else if (stopped) pr = '<kbd>E</kbd> 下車';
    if (stopped && pr && econ.has('preview') && !input.touch && !G.demo && dDest > 150) pr += '　<kbd>P</kbd> 預覽路線';
  }
  if ((stunts && stunts.busy) || flying) { pr = ''; cls = ''; }
  if (G.seatAdj) { pr = '調整好座椅後按「開始開車」（或 Enter）'; cls = ''; }
  setPrompt(pr, cls);
  if (input.pressed('KeyE')) { if (G.seatAdj) { closeSeat(); if (!input.touch) exitCar(); } else exitCar(); }
  const ni = navTick(dt);
  // 手機車外視角：導航畫面（下一個轉彎、距離）一樣貼在畫面角落
  const navOn = G.camMode === 'cockpit' || (input.touch && G.camMode === 'chase');
  if (navOn) {
    if (G.camMode === 'cockpit') cockpit.drawDash(c, dt);
    if (frameN % 4 === 0) {
      const ang = Math.atan2(d.x - c.x, -(d.z - c.z)), heading = Math.atan2(c.fwdX, -c.fwdZ);
      const info = { title: G.leg === 'am' ? d.n : '回家', dist: fmtDist(dDest), bearing: ang - heading, kmh: Math.round(c.kmh), energy: (c.spec.electric ? '電量 ' : '油量 ') + Math.round(c.energy / c.spec.capacity * 100) + '%' };
      if (econ.has('nav') && ni) Object.assign(info, { nav: true, turn: ni.turn, road: ni.road, rest: fmtDist(ni.rest), map: navScreenMap });
      cockpit.drawNav(info);
    }
  }
  // 螢幕直的（手機直拿）：左右看得比較窄，車內的中控螢幕在視野外面 → 把同一個畫面貼在畫面右下角
  // 手機橫的：車內的中控螢幕會被右下的按鈕擋住 → 也貼一份在右上角
  const mini = $('navMini'), wantMini = navOn && (camera.aspect < 0.9 || input.touch) && !G.seatAdj;
  if (mini.hidden === wantMini) mini.hidden = !wantMini;
  mini.classList.toggle('wide', camera.aspect >= 0.9);
  if (wantMini && frameN % 4 === 0) mini.getContext('2d').drawImage(cockpit.navCv, 0, 0);
}

// ===================================================================== 路線預覽（商店：導航的進階功能）
// 停在車上按 P：一台「影子車」照今天的導航路線、用車外視角開一次給你看（車流清掉、遊戲時間不走）。
// 經過的路口在畫面上方用大的路名牌（仿指25：綠底白字、中英文）顯示路名，要轉彎時提早說往哪邊轉。
let pvGhost = null;
const _pvS = { y: 0, edge: null, s: 0, lat: 0, i: 0, t: 0, _d2: 0 }, _pvS2 = { y: 0, edge: null, s: 0, lat: 0, i: 0, t: 0, _d2: 0 };
function startPreview() {
  if (G.state !== 'drive' || G.preview || G.demo) return;
  if (!econ.has('preview')) { toast(econ.has('nav') ? '要先在商店買「路線預覽」' : '路線預覽是導航的進階功能：要先買導航系統，再買路線預覽', 2.6); return; }
  if (G.seatAdj || (flight && flight.active) || (stunts && stunts.busy)) return;
  if (Math.abs(car.v) > 0.5) { toast('停下來才能預覽路線', 1.6); return; }
  if (!G.route) planRoute();
  if (!G.route || !nav) { toast('現在找不到路線，等一下再試', 1.8); return; }
  const start = { x: car.x, z: car.z, y: car.y }, steps = G.route.steps, nodes = [];
  for (let i = 0; i + 1 < steps.length; i++) { const st = steps[i], id = st.dir > 0 ? nav.eb[st.k] : nav.ea[st.k]; nodes.push({ id, cur: st.k, next: steps[i + 1].k, x: nav.nx[id], z: nav.nz[id], s: -1, d: 1e9 }); }
  G.preview = { start, nodes, s: 0, v: 0, mult: 2, pause: false, off: 0, y: car.y, psi: car.psi, loadedSeen: world.loadedCount, meshT: 0, endT: 0, poly: null, cum: null, total: 0, pos: { x: car.x, z: car.z }, tf: traffic.factor };
  pvSetPoly();
  fadeThen(() => {
    const pv = G.preview; if (!pv) return;
    pvGhost = car.group.clone(true);
    const bi = car.group.children.indexOf(car.body); if (bi >= 0) pvGhost.children[bi].visible = true;
    scene.add(pvGhost); car.group.visible = false;   // 自己的車先藏起來（不然開頭兩台車疊在一起）
    traffic.clear(); traffic.factor = 0;
    G.state = 'preview'; G.chase = null; camera.near = 0.3; camera.updateProjectionMatrix();
    $('hud').hidden = true; $('touch').hidden = true; $('moreMenu').hidden = true; $('pv').hidden = false; $('pvSign').hidden = true; $('pvHint').hidden = true; $('pvMark').hidden = true;
    setPrompt(''); pvButtons(); input.releaseLock(); input.noLock = true;   // 電腦：放開滑鼠，才按得到下面的按鈕
  });
}
/** 依目前載入的道路重新產生路線折線（還沒載入的路段是路口連線，載入後換成真實形狀），並重新對齊影子車和路口的位置。 */
function pvSetPoly() {
  const pv = G.preview, st = pv.start;
  const poly = nav.polyline(G.route, world, { x: st.x, z: st.z }, G.routeS), n = poly.length / 2, cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(poly[i * 2] - poly[i * 2 - 2], poly[i * 2 + 1] - poly[i * 2 - 1]);
  const sOf = (pr) => { const k = pr.i >> 1; return cum[k] + pr.t * ((cum[k + 1] ?? cum[k]) - cum[k]); };
  if (pv.poly && pv.s > 0) pv.s = sOf(polyProgress(poly, pv.pos.x, pv.pos.z, Math.max(0, (pv.i || 0) - 60), 600));
  pv.poly = poly; pv.cum = cum; pv.total = cum[n - 1];
  let i0 = 0;
  for (const nd of pv.nodes) { const pr = polyProgress(poly, nd.x, nd.z, i0, 6000); nd.s = sOf(pr); nd.d = pr.d; if (pr.d < 40) i0 = pr.i; }
  G.routePoly = poly; pv.marks = null;   // 地標的位置跟著新折線重算
}
function pvAt(s) {
  const pv = G.preview, c = pv.cum, p = pv.poly, n = c.length; s = Math.max(0, Math.min(pv.total, s));
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const L = c[hi] - c[lo] || 1e-6, t = Math.max(0, Math.min(1, (s - c[lo]) / L));
  return { x: p[lo * 2] + (p[hi * 2] - p[lo * 2]) * t, z: p[lo * 2 + 1] + (p[hi * 2 + 1] - p[lo * 2 + 1]) * t, i: lo, t };
}
function pvButtons() {
  const pv = G.preview; if (!pv) return;
  for (const b of document.querySelectorAll('#pvCtl [data-sp]')) b.classList.toggle('on', +b.dataset.sp === pv.mult && !pv.pause);
  $('pvPause').textContent = pv.pause ? '繼續' : '暫停'; $('pvPause').classList.toggle('on', pv.pause);
}
for (const b of document.querySelectorAll('#pvCtl [data-sp]')) b.addEventListener('click', () => { if (G.preview) { G.preview.mult = +b.dataset.sp; G.preview.pause = false; pvButtons(); } });
$('pvPause').addEventListener('click', () => { if (G.preview) { G.preview.pause = !G.preview.pause; pvButtons(); } });
$('pvEnd').addEventListener('click', () => endPreview());
/** 路口的英文路名：找附近路名牌上寫的英文（地圖資料有的話）。 */
function pvEnglish(name, x, z) {
  if (!name) return '';
  let en = '';
  for (const c of world.cells.values()) {
    if (c.state !== 'ready' || !c.signs) continue;
    const cx = (c.cx + 0.5) * world.CELL, cz = (c.cz + 0.5) * world.CELL; if (Math.abs(cx - x) > 420 || Math.abs(cz - z) > 420) continue;
    for (const sg of c.signs) if (sg.road && sg.en && sg.text === name && Math.abs(sg.x - x) < 80 && Math.abs(sg.z - z) < 80) { en = sg.en; break; }
    if (en) break;
  }
  return en;
}
/** 影子車現在在路線的哪一段路（nav／world 共用的路段編號）。 */
function pvRouteEdge() {
  const pv = G.preview, ns = pv.nodes; let k = G.route.steps[0].k;
  for (let j = 0; j < ns.length; j++) { const n = ns[j]; if (n.d > 40) continue; if (n.s > pv.s) break; k = n.next; }
  return k;
}
/** 某段路在 (x,z) 的路面高度（找最近的線段內插）。 */
function edgeHeightAt(e, x, z) {
  const p = e.pts, n = p.length / 2; let bd = 1e18, h = null;
  for (let i = 0; i + 1 < n; i++) {
    const ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az, L2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d2 = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2; if (d2 < bd) { bd = d2; h = e.hs[i] + (e.hs[i + 1] - e.hs[i]) * t; }
  }
  return bd < 25 * 25 ? h : null;
}
/** 在路口要做什麼：直走、左轉、右轉、迴轉（比較進路口前 15 m 和出路口後 15 m 的方向）。 */
function pvTurnAt(s) {
  const a = pvAt(s - 15), b = pvAt(s), c = pvAt(s + 15);
  const a0 = Math.atan2(b.z - a.z, b.x - a.x), a1 = Math.atan2(c.z - b.z, c.x - b.x); let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
  return Math.abs(da) < 0.55 ? 'straight' : Math.abs(da) > 2.6 ? 'uturn' : da > 0 ? 'right' : 'left';
}
const PV_ARROW = { straight: '↑', right: '→', left: '←', uturn: '↶' }, PV_WORD = { straight: '直走', right: '右轉', left: '左轉', uturn: '迴轉' };
function previewFrame(dt) {
  const pv = G.preview; if (!pv || !pv.poly) return;
  if (input.pressed('Escape') || input.pressed('KeyP')) { endPreview(); return; }
  if (input.pressed('Space')) { pv.pause = !pv.pause; pvButtons(); }
  for (const [k, m] of [['Digit1', 1], ['Digit2', 2], ['Digit4', 4]]) if (input.pressed(k)) { pv.mult = m; pv.pause = false; pvButtons(); }
  const a0 = pvAt(pv.s);
  world.update(a0.x, a0.z, dt); parking.update(dt, a0.x, a0.z); signs.update(dt, a0.x, a0.z);
  // 新的小格載入了：用真實道路形狀重新產生路線
  if (world.loadedCount !== pv.loadedSeen) { pv.loadedSeen = world.loadedCount; pvSetPoly(); }
  const a = pvAt(pv.s), ahead = pvAt(pv.s + 130);
  const ready = world.readyAround(a.x, a.z, 150) && world.readyAround(ahead.x, ahead.z, 120);
  // 現在走的是路線上的哪一段路（用路線自己的路段，不用「最近的路」：高架、匝道疊在一起時不會認錯）
  const rk = pvRouteEdge(), re = world.edges.get(rk), sf = re && !re.dead ? null : world.surfaceAt(a.x, a.z, pv.y + 0.8, _pvS), e = re && !re.dead ? re : sf ? sf.edge : null;
  // 速度：大馬路約 50、一般道路 40、巷子 30 km/h；轉彎前、快到的時候放慢
  const turn = nextTurn(pv.poly, { i: a.i * 2, t: a.t }, 250);
  let vT = e ? (e.cls <= 3 ? 13.9 : e.cls === 4 ? 11.1 : 8.3) : 9.7;
  if (turn && turn.dist < 50) vT = Math.min(vT, 4.5 + turn.dist * 0.14);
  const rest = pv.total - pv.s; if (rest < 45) vT = Math.min(vT, 1.5 + rest * 0.25);
  const dm = dt * pv.mult;
  if (!ready || pv.pause) pv.v = 0;
  else { pv.v += Math.max(-5 * dm, Math.min(2.6 * dm, vT - pv.v)); pv.s = Math.min(pv.total, pv.s + pv.v * dm); }
  // 位置、方向：雙向道開在右半邊的車道
  const p = pvAt(pv.s), f = pvAt(pv.s + 5), bk = pvAt(pv.s - 2);
  let dx = f.x - bk.x, dz = f.z - bk.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const offT = e && !e.oneway ? Math.min(e.hw * 0.5, 1.8) : 0; pv.off += (offT - pv.off) * Math.min(1, dt * 2);
  const x = p.x - dz * pv.off, z = p.z + dx * pv.off;
  let dpsi = Math.atan2(-dx, -dz) - pv.psi; dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi)); pv.psi += dpsi * Math.min(1, dm * 5);
  const hy = e && e === re ? edgeHeightAt(e, x, z) : null, s2 = hy === null ? world.surfaceAt(x, z, pv.y + 0.8, _pvS2) : null;
  const ty = hy !== null ? hy : s2 ? s2.y : world.groundAt(x, z, pv.y); pv.y += (ty - pv.y) * Math.min(1, dt * 10);
  pv.pos.x = x; pv.pos.z = z; pv.i = p.i * 2;
  if (pvGhost) { pvGhost.position.set(x, pv.y, z); pvGhost.rotation.set(0, pv.psi, 0); }
  chaseCam({ x, y: pv.y, z, fwdX: -Math.sin(pv.psi), fwdZ: -Math.cos(pv.psi), v: pv.v * pv.mult, edge: e, body: {} }, dt, { back: 10.5, up: 4.6, backPort: 11.5, upPort: 5.4 });
  // 藍色路線（路面上）跟著影子車更新
  pv.meshT -= dt; if (pv.meshT <= 0 && econ.has('nav')) { pv.meshT = 1.5; G.routeIdx = p.i * 2; buildRouteMesh(x, z, pv.y); }
  // ---- 只在要轉彎（變換方向）的路口說路名；沿路經過的明顯地標也告訴你在哪一邊
  const curName = (e && e.name) || '';
  $('pvRoad').textContent = curName ? `現在：${curName}` : '現在：沒有路名的巷子';
  $('pvRest').textContent = `剩 ${fmtDist(Math.max(0, rest))}・${pv.pause ? '暫停' : pv.mult + '×'}`;
  const tn = pvNextTurn(6000), sign = $('pvSign'), hint = $('pvHint');
  if (!ready) { sign.hidden = true; hint.hidden = false; hint.className = ''; hint.textContent = '載入前面的路…'; }
  else if (rest < 2) {
    sign.hidden = true; hint.hidden = false; hint.className = 'turn'; hint.textContent = `到了：${G.leg === 'am' ? dest().n : '家'}附近，接下來自己找車位停`;
    pv.endT += dt; if (pv.endT > 2.2) endPreview();
  } else if (tn && tn.n.s - pv.s < 250) {
    const name = tn.name || '巷子', d = Math.max(0, Math.round(tn.n.s - pv.s));
    sign.hidden = false; $('pvArrow').textContent = PV_ARROW[tn.t]; $('pvName').textContent = name;
    if (tn.n.enFor !== name) { tn.n.enFor = name; tn.n.en = tn.name ? pvEnglish(name, tn.n.x, tn.n.z) : ''; }
    $('pvEn').textContent = tn.n.en || ''; $('pvEn').hidden = !tn.n.en;
    hint.hidden = false; hint.className = 'turn';
    hint.textContent = `${d > 3 ? `前方 ${d} m 的路口` : '這個路口'}${PV_WORD[tn.t]}${tn.name ? `，進入${tn.name}` : ''}`;
  } else {
    sign.hidden = true; hint.hidden = false; hint.className = '';
    const road = curName || '這條路';
    hint.textContent = tn ? `沿著${road}直走 ${fmtDist(tn.n.s - pv.s)}，然後${PV_WORD[tn.t]}${tn.name ? `進入${tn.name}` : ''}` : `沿著${road}直走 ${fmtDist(rest)} 就到了`;
  }
  pvMarks();
}
/** 下一個要轉彎的路口（路口要有 3 條以上的路，路自己彎過去不算）。轉進迴轉道就是迴轉，路名用迴轉後那條路。 */
function pvNextTurn(maxAhead) {
  const pv = G.preview, ns = pv.nodes;
  for (let k = 0; k < ns.length; k++) {
    const n = ns[k]; if (n.d > 40 || n.s < pv.s - 3 || n.skip) continue; if (n.s - pv.s > maxAhead) break;
    let t = pvTurnAt(n.s); if (t === 'straight') continue;
    const wn = world.nodes.get(n.id), deg = wn ? wn.edges.length : nav.off[n.id + 1] - nav.off[n.id];
    if (deg < 3) continue;
    const nextE = world.edges.get(n.next); let name = nextE ? nextE.name : '';
    if (/迴轉道/.test(name)) {   // 左轉進迴轉道、再轉出來＝迴轉
      t = 'uturn';
      for (let j = k + 1; j < ns.length && ns[j].s - n.s < 90; j++) { if (ns[j].d > 40 || pvTurnAt(ns[j].s) === 'straight') continue; const e2 = world.edges.get(ns[j].next); name = e2 ? e2.name : ''; if (ns[j].s < pv.s + 1) ns[j].skip = true; ns[j].afterU = true; break; }
    }
    if (n.afterU) continue;
    return { n, t, name };
  }
  return null;
}
// ---- 沿路地標：捷運站、火車站、學校、大學、醫院、公園、百貨、博物館、市府／區公所、超高大樓
const PV_MARK = { mrt: ['捷運', '#0070bd'], train: ['火車', '#4a5966'], school: ['學校', '#2f8f4e'], univ: ['大學', '#2f8f4e'], hospital: ['醫院', '#c8352b'], park: ['公園', '#3a9a3a'],
  mall: ['百貨', '#b0548f'], museum: ['博物館', '#8a6d3b'], gov: ['政府', '#56606b'], tower: ['地標', '#d08a00'] };
/** 預覽開始／路線更新時：找出路線旁邊的地標，算出在路線上的位置和在左邊還是右邊。 */
function pvMarkSetup() {
  const pv = G.preview, poly = pv.poly, cum = pv.cum, list = [];
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]); }
  for (const m of meta.marks || []) {
    const [kind, name, x, z, r] = m, far = kind === 'tower' ? 700 : r + 70;
    if (x < x0 - far || x > x1 + far || z < z0 - far || z > z1 + far) continue;
    const pr = polyProgress(poly, x, z, 0, poly.length), k = pr.i >> 1, sAt = cum[k] + pr.t * ((cum[k + 1] ?? cum[k]) - cum[k]);
    const ok = kind === 'tower' ? pr.d < 700 : kind === 'mrt' || kind === 'train' ? pr.d < 90 : pr.d - r < 45;
    if (!ok || sAt < 5) continue;
    const a = pvAt(sAt - 3), b = pvAt(sAt + 3), q = pvAt(sAt), tx = b.x - a.x, tz = b.z - a.z;
    const side = (-tz * (x - q.x) + tx * (z - q.z)) > 0 ? '右' : '左';
    list.push({ kind, name, x, z, s: sAt, d: pr.d, side, shown: false });
  }
  list.sort((p1, p2) => p1.s - p2.s);
  pv.marks = list;
}
let pvPin = null;
function pvPinFor(m) {
  if (!pvPin) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    pvPin = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
    pvPin.renderOrder = 999; pvPin.userData.cv = cv; scene.add(pvPin);
  }
  if (pvPin.userData.name !== m.name) {
    const cv = pvPin.userData.cv, g = cv.getContext('2d'), [lab, col] = PV_MARK[m.kind];
    g.clearRect(0, 0, cv.width, cv.height);
    g.font = '900 52px "Noto Sans TC", sans-serif'; const w = Math.min(cv.width - 8, g.measureText(m.name).width + 150);
    const x0 = (cv.width - w) / 2;
    g.fillStyle = 'rgba(10,13,16,.88)'; g.beginPath(); g.roundRect(x0, 8, w, 88, 18); g.fill();
    g.beginPath(); g.moveTo(cv.width / 2 - 16, 94); g.lineTo(cv.width / 2 + 16, 94); g.lineTo(cv.width / 2, 124); g.fill();
    g.fillStyle = col; g.beginPath(); g.roundRect(x0 + 10, 20, 116, 64, 12); g.fill();
    g.fillStyle = '#fff'; g.font = '900 34px "Noto Sans TC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lab, x0 + 68, 53);
    g.font = '900 46px "Noto Sans TC", sans-serif'; g.textAlign = 'left'; g.fillText(m.name, x0 + 140, 54, w - 150);
    pvPin.material.map.needsUpdate = true; pvPin.userData.name = m.name;
  }
  // 標示放在路邊靠地標的那一側（地標中心可能在校園深處）；超高大樓標在大樓上方
  let px = m.x, pz = m.z;
  if (m.kind !== 'tower') { const q = pvAt(m.s), k = Math.min(1, 22 / Math.max(1, m.d)); px = q.x + (m.x - q.x) * k; pz = q.z + (m.z - q.z) * k; }
  const gy = world.groundAt(px, pz), h = m.kind === 'tower' ? 120 : 8;
  pvPin.position.set(px, gy + h, pz); pvPin.scale.set(0.34, 0.085, 1); pvPin.visible = true;
}
/** 畫面上：快經過的地標（前方 180 m 到剛經過 20 m；超高大樓從 600 m 外就說看得到）。 */
function pvMarks() {
  const pv = G.preview, box = $('pvMark'); if (!pv.marks) pvMarkSetup();
  const near = pv.marks.filter(m => m.s - pv.s < (m.kind === 'tower' ? 600 : 180) && m.s - pv.s > -20).slice(0, 2);
  if (!near.length) { box.hidden = true; if (pvPin) pvPin.visible = false; return; }
  box.hidden = false;
  const html = near.map(m => { const [lab, col] = PV_MARK[m.kind], ds = m.s - pv.s;
    const where = m.kind === 'tower' ? `${m.side}前方看得到：` : ds > 25 ? `前方 ${Math.round(ds)} m ${m.side}邊：` : `${m.side}邊就是`;
    return `<div class="pvm"><span class="pvk" style="background:${col}">${lab}</span><span>${where}<b>${m.name}</b></span></div>`; }).join('');
  if (box.innerHTML !== html) box.innerHTML = html;
  pvPinFor(near[0]);
}
function endPreview() {
  const pv = G.preview; if (!pv || pv.ending) return; pv.ending = true;
  fadeThen(() => {
    if (pvGhost) { scene.remove(pvGhost); pvGhost = null; }
    if (pvPin) pvPin.visible = false;
    car.group.visible = true;
    $('pv').hidden = true; input.noLock = false;
    traffic.factor = pv.tf ?? 1;
    G.preview = null; G.chase = null;
    const back = () => {
      G.state = 'drive'; $('loading').hidden = true; $('hud').hidden = false; if (input.touch) $('touch').hidden = false;
      camera.near = G.cam === 'cockpit' ? 0.8 : 0.3; camera.updateProjectionMatrix();
      traffic.update(0.016, car.x, car.z, [{ x: car.x, z: car.z, y: car.y, r: 2.3 }], true);
      planRoute(); toast('預覽結束，回到車上：照剛剛的路線開吧', 2.4);
    };
    if (world.readyAround(car.x, car.z, 260) && parking.readyAround(car.x, car.z, 120)) back();
    else {
      G.state = 'loading'; G.focus = { x: car.x, z: car.z }; $('hud').hidden = true; $('touch').hidden = true; $('loading').hidden = false;
      $('loadText').textContent = '回到車上…'; $('loadSub').textContent = '';
      G.wait = { cond: () => world.readyAround(car.x, car.z, 260) && parking.readyAround(car.x, car.z, 120), then: back };
    }
  });
}
window.__tc.startPreview = startPreview; window.__tc.endPreview = endPreview;

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
    annoyTick(J.down || 0);
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

/** 升空、落地時車底往下噴的煙霧：罩到旁邊的車就累積厭惡值（不顯示），太高就被檢舉、特殊功能停用 24 小時。 */
const annoyHit = new Set();
function annoyTick(down) {
  if (down < 0.02) { annoyHit.clear(); return; }   // 這一次噴完了：下一次升空或落地重新算
  if (G.demo || !traffic) return;
  const R = ANNOY.radius;
  for (const c of traffic.cars) {
    if (c.hop || annoyHit.has(c)) continue;
    const dx = c.x - car.x, dz = c.z - car.z, dy = car.y - (c.y || 0);
    if (dx * dx + dz * dz > R * R || dy < -1.5 || dy > 14) continue;
    annoyHit.add(c); G.annoy = (G.annoy || 0) + 1;
  }
  if (G.annoy >= ANNOY.limit && !skillBanned()) {
    G.banUntil = absMin() + ANNOY.banMin; G.annoy = 0;
    toast(`附近的車主受不了飛天跑車噴出來的煙霧，聯合檢舉你！特殊功能停用一天，${banEndText()} 才能再用`, 7, 2);
    save();
  }
}
const absMin = () => G.dayN * 24 * 60 + G.clock;   // 從第 0 天 0:00 算起的遊戲分鐘
function skillBanned() { return !G.demo && !!G.banUntil && absMin() < G.banUntil; }
function banEndText() { const d = Math.floor(G.banUntil / 1440), m = G.banUntil - d * 1440; return `${d === G.dayN ? '今天' : d === G.dayN + 1 ? '明天' : `第 ${d} 天`} ${fmtClock(m)}`; }

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
  if (G.state !== 'drive') $('navMini').hidden = true;
  const ck = $('clock');
  $('dayChip').textContent = `第 ${G.dayN} 天`;
  ck.textContent = fmtClock(G.clock); ck.classList.toggle('late', G.leg === 'am' && G.clock > TIME.workMin);
  $('due').textContent = G.leg === 'am' ? '09:00 上班' : '下班回家';
  $('money').textContent = fmtMoney(econ.money);
  let t = '', sub = '';
  const d = dest();
  if (G.state === 'room') { t = '起床了，出門上班'; sub = `${districtName(G.cfg.di)}${G.cfg.home.a}`; }
  else if (G.state === 'basement') { t = G.phase === 'toCar' ? '走到你的車' : '搭電梯回家'; sub = '家裡的地下室'; }
  else if (G.phase === 'toCar') { t = '走到你的車'; sub = fmtDist(dist(P, car)); }
  else if (G.phase === 'drive') {
    const dd = dist(car, d);
    if (flight && flight.active) {
      t = flight.phase === 'hover' && flight.slotHold ? '排隊等降落時段' : flight.phase === 'hover' && flight.blocked ? '下方有車，在空中等待降落' : { lift: '無人機升空中', cruise: `無人機飛往 ${G.leg === 'am' ? d.n : '家'}`, approach: '接近降落點', hover: '對準降落點', descend: '降落中' }[flight.phase] || '無人機飛行';
      sub = `高度 ${Math.round(car.y - world.groundAt(car.x, car.z, car.y - 50))} m・${Math.round(car.v * 3.6)} km/h・剩 ${fmtDist(dist(car, flight.spot))}・燃料費 ${Math.round(flight.costSum)} 元`;
      if (flight.slotHold && flight.plan && ctl) { const left = flight.plan.slotAt - ctl.t; sub = `前面還有 ${Math.max(1, Math.ceil(left * flight.plan.area.mu))} 台・約 ${Math.max(1, Math.round(gmin(left)))} 分鐘（${clockAfter(left)} 輪到你）・燃料費 ${Math.round(flight.costSum)} 元`; }
    } else if (dd < 420) { t = G.leg === 'am' ? '在公司附近找車位' : '在家附近找車位'; sub = (car.spec.electric || G.markLot) ? '黃色：路邊空格' + (car.spec.electric ? '　綠色：電動車格' : '') + (G.markLot ? '　藍色：停車場' : '') : '黃色標示的是空的路邊車格'; }
    else { t = G.leg === 'am' ? `開車到 ${d.n}` : '開車回家'; sub = `直線 ${fmtDist(dd)}${econ.has('nav') ? '・跟著藍色導航線' : ''}`; }
    if (!(flight && flight.active) && G.mode === 'hybrid' && ctl) {
      if (G.ctlHold && G.ctlHold.departAt !== undefined) sub = `總控：約 ${clockAfter(G.ctlHold.departAt - ctl.t)} 起飛（降落時段 ${clockAfter(G.ctlHold.plan.slotAt - ctl.t)}）・現在就飛按 U`;
      else if (G.ctlAuto) sub = '總控已核准：慢下來停住就自動升空';
    }
  } else if (G.phase === 'toDest') {
    if (G.parked && G.parked.legal) { t = G.leg === 'am' ? `走進 ${d.n}` : '走回家'; sub = fmtDist(dist(P, d)); }
    else { t = '車停太遠了'; sub = '回到車上（藍色光柱），開到 450 m 內再停'; }
  }
  $('taskText').textContent = t; $('taskSub').textContent = touchify(sub);
  const sb = $('stunt'), showS = !!(G.state === 'drive' && stunts);
  if (sb.hidden === showS) sb.hidden = !showS;
  if (showS) {
    const f = Math.max(0, econ.stuntFuel), jumps = Math.floor(f * AIR.jumpsPerTank + 1e-6);
    $('stuntBar').style.width = (f * 100).toFixed(1) + '%'; $('stuntBar').classList.toggle('low', f < 1 / AIR.jumpsPerTank);
    sb.classList.toggle('empty', f <= 1e-4);
    const pct = `${Math.round(f * 100)}%・可飛越 ${jumps} 次`; if ($('stuntPct').textContent !== pct) $('stuntPct').textContent = pct;
    const fill = skillBanned() ? '特殊功能停用中' : (G.airRegenT > 0 && f < 1 ? '開車中慢慢補' : '');
    if ($('stuntFill').textContent !== fill) $('stuntFill').textContent = fill;
    const lb = stunts.label(), hint = input.touch ? '' : stunts.mode === 'air' ? 'T 翻轉　A/D 轉向' : stunts.mode === 'wall' ? 'W 往上　A/D 轉向　G 跳離' : stunts.mode === 'under' ? 'W 前進　A/D 左右　G 翻轉落地' : stunts.mode === 'roof' ? 'F 飛下去　邊緣按 G 沿牆開下去' : 'Shift 推進　F 飛越　G 吸附';
    const t = skillBanned() && stunts.mode === 'ground' ? lb : lb ? lb + (hint ? '・' + hint : '') : hint;
    if ($('stuntMode').textContent !== t) $('stuntMode').textContent = t;
  }
  const dp = $('daa'), showD = !!(G.state === 'drive' && flight && flight.active);
  if (dp.hidden === showD) dp.hidden = !showD;
  if (showD) { G.daaT = (G.daaT || 0) - dt; if (G.daaT <= 0) { G.daaT = 0.15; flight.drawPanel(dp, drones); } }
  const sp = $('speedo');
  if (G.state === 'drive' && (G.camMode !== 'cockpit' || input.touch)) {
    sp.hidden = false; $('spd').textContent = Math.round(car.kmh);
    $('energy').textContent = (car.spec.electric ? '電量 ' : '油量 ') + Math.round(car.energy / car.spec.capacity * 100) + '%' + (stunts && input.touch ? `・空氣 ${Math.round(econ.stuntFuel * 100)}%（${Math.floor(econ.stuntFuel * AIR.jumpsPerTank + 1e-6)} 次）${skillBanned() ? ' 特殊功能停用中' : ''}` : '');
  } else sp.hidden = true;
  placeT -= dt;
  if (placeT <= 0 && G.state !== 'room' && G.state !== 'basement') { placeT = 0.6; const o = {}, e = world.nearestEdge(P.x, P.z, 40, null, o); $('placeRoad').textContent = (e && e.name) || '　'; $('placeDist').textContent = world.districtAt(P.x, P.z) || '臺北市外'; }
  else if (G.state === 'room' || G.state === 'basement') { $('placeRoad').textContent = G.state === 'room' ? '家裡' : '地下室'; $('placeDist').textContent = districtName(G.cfg.di); }
  // 小地圖：買了導航才有；開車在駕駛座時導航改在車內螢幕上。還沒買導航只能按 M 看全螢幕地圖
  const showMini = econ.has('nav') && !(G.state === 'drive' && (G.camMode === 'cockpit' || (input.touch && G.camMode === 'chase')));
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
  const inCar = G.state === 'drive', atHome = G.state === 'room' || G.state === 'basement', cx = inCar ? car.x : atHome ? G.cfg.home.x : P.x, cz = inCar ? car.z : atHome ? G.cfg.home.z : P.z, head = inCar ? car.psi : (G.state === 'walk' ? tp.yaw : 0);
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
let mapT = 0, cityMap = null;
function toggleBigMap(force) {
  const el = $('bigmap'), show = force !== undefined ? force : el.hidden;
  el.hidden = !show; if (!show) return;
  input.releaseLock();
  if (!cityMap) {
    cityMap = new CityMap($('bigCv'), meta); cityMap.onChange = () => drawMap();
    $('mapIn').onclick = () => { cityMap.zoomBy(1.6); drawMap(); }; $('mapOut').onclick = () => { cityMap.zoomBy(1 / 1.6); drawMap(); };
    $('mapAll').onclick = () => { cityMap.fitAll(); drawMap(); }; $('mapMe').onclick = () => { const m = mapMe(); cityMap.cx = m.x; cityMap.cz = m.z; if (cityMap.s < 0.2) cityMap.s = 0.35; drawMap(); };
    window.__tc.cityMap = cityMap;
  }
  cityMap.setNav(nav); cityMap.loadLabels();
  requestAnimationFrame(() => { cityMap.resize(mapMe()); mapT = 0; drawMap(); });
  if (G.state === 'drive' && Math.abs(car.v) > 1) toast('看地圖時車子還在開！', 2);
}
const mapMe = () => { const inCar = G.state === 'drive'; return (G.state === 'room' || G.state === 'basement') && G.cfg.home ? { x: G.cfg.home.x, z: G.cfg.home.z, hd: 0 } : { x: inCar ? car.x : P.x, z: inCar ? car.z : P.z, hd: inCar ? car.psi : P.yaw }; };
/** 全市地圖：可以放大縮小、拖曳；有路名、停車場、你的車停在哪裡。每 0.25 秒更新你的位置。 */
function drawMap() {
  if (!cityMap || $('bigmap').hidden) return;
  const inCar = G.state === 'drive', moving = inCar && Math.abs(car.v) > 1;
  cityMap.draw({
    me: G.state === 'room' || G.state === 'basement' ? null : mapMe(), car: car && !G.inBasement ? { x: car.x, z: car.z } : null, carParked: !!car && !inCar,
    home: G.cfg.home, work: G.cfg.work, garage: garageSpot(),
    route: econ.has('nav') && G.routePoly ? G.routePoly : null, districtIndex: G.cfg.di,
    status: inCar ? (moving ? `車子還在開：${Math.round(car.kmh)} km/h` : '車子停著') : '', statusColor: moving ? '#ff6b5b' : '#9aa6b0',
  });
}
// ===================================================================== 住處地下停車位：家門口的停車場入口（路邊，紫色的格子＋P 牌子）
function parkMark(padColor, signColor, sub) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: padColor, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
  pad.position.y = 0.07; pad.renderOrder = 3; g.add(pad);
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160; const c = cv.getContext('2d');
  c.fillStyle = signColor; c.fillRect(0, 0, 128, 160); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '900 92px sans-serif'; c.fillText('P', 64, 62); c.font = '900 26px "Noto Sans TC", "PingFang TC", sans-serif'; c.fillText(sub, 64, 132);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  for (const r of [0, Math.PI]) { const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.12), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); sign.position.set(1.9, 2.8, 0); sign.rotation.y = r; g.add(sign); }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), new THREE.MeshLambertMaterial({ color: 0x9aa3ab })); post.position.set(1.9, 1.35, 0); g.add(post);
  g.visible = false; scene.add(g); return g;
}
const garageMark = parkMark(0x8b6cff, '#5b3fd6', '地下停車場'), curbMark = parkMark(0x4aa8ff, '#2f7fd6', '住戶專用');
/** 家門口地下停車場入口的位置（買了停車位才有）：離家最近的路，靠家那一邊的路邊，車頭順著靠右行駛的方向。 */
/** 住處的車位（買了才有）：type 'garage'（地下停車場入口，車子會開進地下室）或 'curb'（家門口的住戶專用路邊車位）。有地下的就用地下的。 */
function garageSpot() {
  const h = G.cfg.home, kind = econ.has('garage') ? 'garage' : econ.has('curbspot') ? 'curb' : null;
  if (!h || !kind || !world) return null;
  if (G.garage && G.garage.hx === h.x && G.garage.hz === h.z && G.garage.type === kind) return G.garage;
  const sp = curbSpot(h.x, h.z); if (!sp) return null;
  G.garage = Object.assign(sp, { hx: h.x, hz: h.z, type: kind });
  return G.garage;
}
/** (x,z) 旁邊最近的一般道路：靠 (x,z) 那一邊的路邊，車頭順著靠右行駛的方向。 */
function curbSpot(x0, z0, r = 150) {
  const o = {}, e = world.nearestEdge(x0, z0, r, (ed) => ed.cls >= 3 && ed.cls <= 6 && !ed.bridge && !ed.tunnel && ed.len > 16, o);
  if (!e) return null;
  const sMid = Math.max(e.trimA + 4, Math.min(e.len - e.trimB - 4, o.s)), p = edgePoint(e, sMid, {});
  let nx = -p.dz, nz = p.dx, fx = p.dx, fz = p.dz;
  if ((x0 - p.x) * nx + (z0 - p.z) * nz < 0) { nx = -nx; nz = -nz; fx = -fx; fz = -fz; }   // 目標在路的哪一邊：那一邊當作車子的右手邊
  const off = Math.max(0, e.hw - 1.3), x = p.x + nx * off, z = p.z + nz * off;
  return { x, z, y: p.y, psi: Math.atan2(-fx, -fz), nx, nz, edge: e };
}
// ===================================================================== 違規停車拖吊：保管場門口（紅色的格子＋「拖吊」牌子）
const towRoll = (p) => (window.__tc.towForce !== undefined ? !!window.__tc.towForce : Math.random() < p);
const towMark = (() => {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5b4f, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
  pad.position.y = 0.07; pad.renderOrder = 3; g.add(pad);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#c62f25'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#fff'; c.font = '900 56px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('拖吊保管場', 128, 66);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  for (const r of [0, Math.PI]) {   // 正反兩面都貼一張，兩邊看過來字都是正的
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    sign.position.set(2.2, 2.7, 0); sign.rotation.y = r; g.add(sign);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), new THREE.MeshLambertMaterial({ color: 0x9aa3ab })); post.position.set(2.2, 1.35, 0); g.add(post);
  g.visible = false; scene.add(g); return g;
})();
/** 被拖吊：從 (fx,fz) 搭計程車到保管場、繳移置費＋保管費，然後在保管場門口上車繼續（早上去上班、晚上回家）。 */
function towPickup(fx, fz, lead = '') {
  const T = G.tow, y = T.yard;
  const km = Math.hypot(y.x - fx, y.z - fz) * 1.3 / 1000;          // 實際開的路比直線長約三成
  const ride = Math.round(6 + km / 22 * 60);                       // 叫車約 6 分鐘＋市區平均時速約 22 km
  const taxi = taxiFare(km, G.clock);
  G.clock += ride;
  const storage = towStorage((G.clock - T.towT) / 60);
  econ.addTow(TOW.fee + storage + taxi);
  G.towBill = { yard: y, taxi, storage, km, ride };
  G.state = 'loading'; G.phase = 'room'; setPrompt(''); bayMarks.count = 0; destBeacon.visible = carBeacon.visible = false;
  $('hud').hidden = true; $('touch').hidden = true; $('loading').hidden = false;
  $('loadText').textContent = `${lead}搭計程車去「${y.n}」領車…`;
  $('loadSub').textContent = `${y.a}・約 ${km.toFixed(1)} 公里、${ride} 分鐘`;
  G.focus = { x: y.x, z: y.z }; traffic.clear();
  G.wait = {
    cond: () => world.readyAround(y.x, y.z, 260) && parking.readyAround(y.x, y.z, 120),
    then: () => {
      const sp = curbSpot(y.x, y.z, 400) || { x: y.x, z: y.z, y: world.groundAt(y.x, y.z), psi: 0, nx: 1, nz: 0 };
      parking.forBaysNear(sp.x, sp.z, 9, (b) => { b.reserved = true; b.occupied = false; });
      car.place(sp.x, sp.z, sp.psi, sp.y); car.v = 0;
      towMark.position.set(sp.x, sp.y, sp.z); towMark.rotation.y = sp.psi; towMark.visible = true;
      // 人站在路邊人行道上，面向車子
      P.x = sp.x + sp.nx * 2.6 - Math.sin(sp.psi) * 3; P.z = sp.z + sp.nz * 2.6 - Math.cos(sp.psi) * 3;
      const q = { x: P.x, z: P.z }; if (world.collide(q, 0.4)) { P.x = sp.x - sp.nx * 2.6; P.z = sp.z - sp.nz * 2.6; }
      P.y = world.groundAt(P.x, P.z); P.yaw = Math.atan2(-(car.x - P.x), -(car.z - P.z)); tp.yaw = P.yaw; tp.dist = 4.4; tp.curDist = 4.4; tp.pitch = 0.22;
      if (avatar && avatar.group.parent !== scene) scene.add(avatar.group);
      P.inRoom = false; G.state = 'walk'; G.phase = 'toCar'; G.parked = null; G.homeBay = null;
      camera.near = 0.15; camera.updateProjectionMatrix();
      $('loading').hidden = true; $('hud').hidden = false; if (input.touch) $('touch').hidden = false;
      traffic.update(0.016, P.x, P.z, [], true);
      toast(`在${y.n}繳了移置費 ${TOW.fee.toLocaleString()} 元${storage ? `、保管費 ${storage} 元` : ''}（計程車 ${taxi} 元）。上車${G.leg === 'am' ? '去上班' : '回家'}`, 6);
      G.tow = null;
    },
  };
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
  if (input.pressed('KeyM') && ['walk', 'drive', 'room', 'basement'].includes(G.state)) toggleBigMap();
  if (!$('shop').hidden) { if (!window.__tc.noRender) render(); input.endFrame(); return; }
  // 全螢幕地圖打開時遊戲不暫停：車子還在動就會繼續開（沒有導航只能這樣看地圖）
  const mapOpen = !$('bigmap').hidden;
  if (mapOpen) { mapT -= dt; if (mapT <= 0) { mapT = 0.25; drawMap(); } }
  music.setStyle(G.demo ? 'cyber' : G.state === 'room' ? 'home' : 'drive');   // 看示範：賽博龐克電子樂；在家：居家曲
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
    else if (st === 'basement') basementFrame(dt);
    else if (st === 'walk') { if (AUTO) autoTest(dt); walkFrame(dt); }
    else if (st === 'drive') { if (AUTO) autoTest(dt); driveFrame(dt); }
    else if (st === 'summary' || st === 'work') { world.update(P.x, P.z, dt); }
    else if (st === 'measure') measureFrame(dt);
    else if (st === 'preview') previewFrame(dt);
    if (['walk', 'drive', 'room', 'basement', 'measure'].includes(st)) G.clock += dt * TIME.scale / 60;
    if (ctl && G.mode === 'hybrid' && ['walk', 'drive', 'room'].includes(st)) ctlTick(dt);
  }
  if (['walk', 'drive', 'room', 'basement'].includes(st)) hud(dt);
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
    for (const id of ['btnBoost', 'btnJump', 'btnGrip', 'btnFlip']) { const el = $(id); if (!el) continue; if (el.hidden === vis[id]) el.hidden = !vis[id]; el.classList.toggle('off', airOut || skillBanned() || (id === 'btnJump' && econ.stuntFuel < 1 / AIR.jumpsPerTank - 1e-6) || (id === 'btnFlip' && !(stunts && stunts.canFlip()))); }
    input.swipeFlip = !!(stn && sm === 'air');
    const hyb = G.mode === 'hybrid' && !!ctl;   // 路空總控：開著也能問總控
    const dbt = $('btnDrone'), showDr = st === 'drive' && !G.seatAdj && econ.has('drone') && car.spec.key === 'roadster' && (flyingNow || hyb || Math.abs(car.v) < 3);
    if (dbt) {
      if (dbt.hidden === showDr) dbt.hidden = !showDr;
      const lb = flyingNow ? '取消飛行' : hyb ? (G.ctl && G.ctl.armed && ctl.t - G.ctl.at < 10 ? '現在飛' : '問總控') : '無人機';
      if (dbt.textContent !== lb) dbt.textContent = lb;
    }
    for (const id of ['btnMirL', 'btnMirR']) { const el = $(id), on = drv && mirrorBtns && !flyingNow; if (el && el.hidden === on) el.hidden = !on; }
    // 走路（房間裡、街上）：油門、煞車用不到，油門的位置換成「跑步」
    const onFoot = st === 'walk' || st === 'room';
    for (const id of ['btnGas', 'btnBrake']) { const el = $(id); if (el.hidden !== onFoot) el.hidden = onFoot; }
    const rb = $('btnRun'); if (rb.hidden === onFoot) rb.hidden = !onFoot;
    if (onFoot) { const rl = input.runOn ? '跑步中' : '跑步'; if (rb.textContent !== rl) { rb.textContent = rl; rb.classList.toggle('on', input.runOn); rb.setAttribute('aria-pressed', String(input.runOn)); } }
    const act = $('btnAct'), lab = st === 'walk' ? (car && dist(P, car) < 3.0 ? '上車' : '動作') : st === 'drive' ? (G.seatAdj ? '開車' : Math.abs(car.v) < 0.4 && !busyNow ? '下車' : '動作') : st === 'room' ? ({ door: '出門', inst: G.inst ? '停下來' : '彈琴', desk: '商店' }[G.roomNear] || '動作') : st === 'basement' ? ({ car: '上車', lift: '回家' }[G.bNear] || '動作') : '動作';
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
  if (G.state === 'basement') { renderer.clear(); renderer.render(basement.scene, camera); return; }
  if (window.__tc.camHook) window.__tc.camHook(camera);   // 錄影用：自訂鏡頭
  sky.position.copy(camera.position);
  ground.position.set(Math.round(camera.position.x / 50) * 50, -15, Math.round(camera.position.z / 50) * 50);
  const inCar = G.state === 'drive', pvp = G.state === 'preview' && pvGhost ? pvGhost.position : null;
  const fx = pvp ? pvp.x : inCar ? car.x : P.x, fz = pvp ? pvp.z : inCar ? car.z : P.z, fy = pvp ? pvp.y : inCar ? car.y : P.y;
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
