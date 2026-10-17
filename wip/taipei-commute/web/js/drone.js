// 無人機飛行系統：塞車時讓車子升空（車身伸出四組旋翼），自動飛到目的地附近、等下方沒車再降落。
//
// 避撞方法參考 NASA Langley 的 DAIDALUS（Detect and AvoID Alerting Logic for Unmanned Systems，
// NASA Open Source Agreement 開放原始碼）：
//   1. 「保持安全距離（well-clear）」：水平距離、垂直距離，加上「修正版 tau」（還有幾秒會靠太近），
//      三個條件同時成立就算「失去安全距離」。
//   2. 「可用航向範圍（bands）」：把每個可能的航向都往前預測一段時間，會跟別架飛機失去安全距離的航向標成紅色，
//      沒衝突的是綠色；從綠色裡挑最接近目的地方向的那個飛。航向全紅時改用爬升／下降避開。
// 這裡是依公開文件的概念自己寫的簡化版（城市低空、距離門檻縮小），不是 DAIDALUS 原始程式碼。
//
// 「選擇沒有堵塞的空間」：起飛前比較幾個巡航高度層，選路線附近別架無人機最少的那一層。
// 燃料費：飛越久越貴（每分鐘固定費率，遊戲時間）；到了目的地下方有車就要在空中等，等的時間也算錢。
// 會用這個系統的車：全市車流的千分之一（依路網長度與車流密度估算），在全市模擬，靠近玩家的才畫出來。
import * as THREE from '../lib/three.module.min.js';
import { carGeometry } from './vehicles.js';
import { TRAFFIC_DENSITY } from './config.js';
import { SKY, layerFor } from './sky.js';

export const DAA = {
  DTHR: 70,        // 水平安全距離 (m)
  ZTHR: 18,        // 垂直安全距離 (m)
  TTHR: 18,        // 修正版 tau 門檻 (s)
  LOOK: 35,        // 往前預測多久 (s)
  STEP: 1,         // 預測的時間間隔 (s)
  TRACK_STEP: 5,   // 航向每幾度算一次
};
export const DRONE = {
  layers: [130, 150, 170],     // 巡航高度層（離地，m）；高於大部分建物，超高大樓（台北 101 等）另外繞開
  cruise: 50, climb: 6, descend: 4,   // m/s（巡航約 180 km/h）
  share: 0.001,                // 會用無人機系統的車：千分之一
  costPerMin: 2500,            // 燃料費（元／遊戲分鐘），飛行、空中等待都算（跟遲到每分鐘扣的錢一樣）
  landClear: 9,                // 降落點周圍幾公尺內不能有車
};
const LANES = [3, 2, 2, 2, 1, 1, 1, 1];
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();

/** 依路網估算全市路上有多少車（每條路：長度 × 密度 × 車道數 × 尖峰倍數）。 */
export function cityCars(nav, factor) {
  let n = 0;
  for (let k = 0; k < nav.E; k++) { const c = nav.ecls[k]; n += nav.elen[k] / 1000 * TRAFFIC_DENSITY[c] * LANES[c] * (nav.eow[k] ? 1 : 2); }
  return n * factor;
}

// ------------------------------------------------------------------ DAIDALUS 式的衝突偵測
/** 相對狀態（對方 − 自己）在時間 t 是否失去安全距離。 */
function wcv(sx, sy, sz, vx, vy, vz) {
  if (Math.abs(sy) > DAA.ZTHR) return false;
  const r2 = sx * sx + sz * sz, D2 = DAA.DTHR * DAA.DTHR;
  if (r2 <= D2) return true;
  const sv = sx * vx + sz * vz;                  // 小於 0：正在接近
  if (sv >= 0) return false;
  const tau = (D2 - r2) / sv;                    // 修正版 tau（DMOD 外側時為正值）
  if (tau > DAA.TTHR) return false;
  // 最接近時的水平距離（HMD）也要在門檻內才算
  const v2 = vx * vx + vz * vz || 1e-6, tc = -sv / v2, hx = sx + vx * tc, hz = sz + vz * tc;
  return hx * hx + hz * hz <= D2;
}
/** 自己用速度 (vx,vy,vz) 飛，跟 list 裡的對象在 LOOK 秒內會不會失去安全距離；回傳最早的時間（沒有就 Infinity）。 */
function conflictTime(o, vx, vy, vz, list, statics, look = DAA.LOOK) {
  let first = Infinity;
  for (const it of list) {
    const sx0 = it.x - o.x, sy0 = it.y - o.y, sz0 = it.z - o.z, rvx = it.vx - vx, rvy = it.vy - vy, rvz = it.vz - vz;
    for (let t = 0; t <= look && t < first; t += DAA.STEP) {
      if (wcv(sx0 + rvx * t, sy0 + rvy * t, sz0 + rvz * t, rvx, rvy, rvz)) { first = t; break; }
    }
  }
  // 超高大樓：圓柱（加上 30 m 緩衝），在樓頂以下就不能進去
  if (statics) for (const b of statics) {
    for (let t = 0; t <= Math.min(look, 25) && t < first; t += DAA.STEP) {
      const x = o.x + vx * t, y = o.y + vy * t, z = o.z + vz * t;
      if (y < b.top + 25 && (x - b.x) ** 2 + (z - b.z) ** 2 < (b.r + 30) ** 2) { first = t; break; }
    }
  }
  return first;
}
/**
 * 航向可用範圍：每 TRACK_STEP 度一格，回傳 { bands: [{ deg, t }], pick: 選到的航向（弧度）, vs: 垂直速度, alert }
 * 航向用 atan2(dx, dz)（0 = 往 +z）。
 */
export function computeBands(o, speed, want, list, statics) {
  const n = Math.round(360 / DAA.TRACK_STEP), bands = [];
  let best = null, bestCost = Infinity, nearest = Infinity;
  for (let i = 0; i < n; i++) {
    const h = i * DAA.TRACK_STEP * Math.PI / 180, vx = Math.sin(h) * speed, vz = Math.cos(h) * speed;
    const t = conflictTime(o, vx, 0, vz, list, statics);
    bands.push({ h, t });
    let d = h - want; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    if (t === Infinity) { const cost = d + (o.track !== undefined ? 0.15 * Math.abs(Math.atan2(Math.sin(h - o.track), Math.cos(h - o.track))) : 0); if (cost < bestCost) { bestCost = cost; best = h; } }
    if (d < 0.05) nearest = t;
  }
  // 現在的方向有沒有衝突（警示等級）
  const cur = conflictTime(o, o.vx, o.vy, o.vz, list, statics);
  const alert = cur < 8 ? 3 : cur < 15 ? 2 : cur < DAA.LOOK ? 1 : 0;
  let vs = 0;
  if (best === null) {
    // 航向全紅：試爬升或下降
    for (const v of [6, -4]) { if (conflictTime(o, Math.sin(want) * speed * 0.5, v, Math.cos(want) * speed * 0.5, list, statics) === Infinity) { vs = v; break; } }
    best = want;
  }
  return { bands, pick: best, vs, alert, nearest };
}

// ------------------------------------------------------------------ 折疊旋翼（玩家的車進入無人機系統時從車身伸出來）
// 四組旋翼平常收在車身裡（看起來就是一般的車）；進入無人機系統時從車頂四角伸出、展開，降落後再收回。
export function rotorGeometry() {
  const g = new THREE.Group(); g.userData.corners = []; g.userData.discs = [];
  const arm = new THREE.MeshLambertMaterial({ color: 0x2a2e33 }), disc = new THREE.MeshBasicMaterial({ color: 0xcfd8df, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const blade = new THREE.MeshLambertMaterial({ color: 0x15171a });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Group(); c.userData.sx = sx; c.userData.sz = sz;
    const a = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.12), arm); a.position.set(sx * 0.5, 0, 0); c.add(a);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10), arm); hub.position.set(sx * 1.0, 0.06, 0); c.add(hub);
    const rot = new THREE.Group(); rot.position.set(sx * 1.0, 0.16, 0); c.add(rot);
    rot.add(new THREE.Mesh(new THREE.CircleGeometry(0.95, 24).rotateX(-Math.PI / 2), disc));
    for (let k = 0; k < 2; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.1), blade); bl.rotation.y = k * Math.PI / 2; rot.add(bl); }
    g.add(c); g.userData.corners.push(c); g.userData.discs.push(rot);
  }
  setDeploy(g, 0);
  return g;
}
/** 旋翼展開程度 0（收在車身裡）～1（完全展開）。 */
export function setDeploy(g, k) {
  const e = k * k * (3 - 2 * k);
  g.visible = k > 0.01;
  for (const c of g.userData.corners) {
    const { sx, sz } = c.userData;
    c.position.set(sx * (0.55 + 0.15 * e), 0.95 + 0.4 * e, sz * 1.5);
    c.scale.set(Math.max(0.01, e), Math.max(0.01, 0.4 + 0.6 * e), Math.max(0.01, e));
    c.rotation.z = sx * (1 - e) * 1.2;   // 從車身側邊往上翻出來
  }
}

// ------------------------------------------------------------------ 全市的無人機（千分之一的車）
export class DroneTraffic {
  constructor(scene, world, nav, factor = 1.8) {
    this.world = world; this.nav = nav; this.list = [];
    this.count = Math.max(4, Math.round(cityCars(nav, factor) * DRONE.share));
    // 畫面上：近的無人機用實例化網格畫（車身＋四個旋翼）
    const g = carGeometry(), N = 60;
    this.body = new THREE.InstancedMesh(g.paint, new THREE.MeshLambertMaterial(), N);
    this.trim = new THREE.InstancedMesh(g.trim, new THREE.MeshLambertMaterial({ vertexColors: true }), N);
    const rot = new THREE.BoxGeometry(4.3, 0.06, 0.12), rot2 = new THREE.BoxGeometry(0.12, 0.06, 4.0);
    const merged = new THREE.BufferGeometry();
    {
      const parts = [];
      for (const sx of [-1.7, 1.7]) for (const sz of [-1.55, 1.55]) { const d = new THREE.CircleGeometry(1.0, 16).rotateX(-Math.PI / 2).translate(sx, 1.52, sz); parts.push(d.index ? d.toNonIndexed() : d); }
      parts.push(rot.clone().translate(0, 1.35, -1.55).toNonIndexed(), rot.clone().translate(0, 1.35, 1.55).toNonIndexed(), rot2.clone().translate(-1.7, 1.35, 0).toNonIndexed(), rot2.clone().translate(1.7, 1.35, 0).toNonIndexed());
      const pos = []; for (const p of parts) { const a = p.attributes.position; for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i)); }
      merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    }
    this.rotors = new THREE.InstancedMesh(merged, new THREE.MeshBasicMaterial({ color: 0x9fb1bf, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), N);
    for (const m of [this.body, this.trim, this.rotors]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.body.setColorAt(0, new THREE.Color(1, 1, 1)); this.N = N;
    this.cols = [0xe8e8e6, 0x2b2d31, 0x8e9399, 0x21395c, 0x6f1f24].map(h => new THREE.Color(h));
    for (let i = 0; i < this.count; i++) this.list.push(this._spawn(true));
  }

  _node() { const nv = this.nav; for (let k = 0; k < 30; k++) { const e = Math.floor(Math.random() * nv.E); if (nv.ecls[e] <= 5) { const n = Math.random() < 0.5 ? nv.ea[e] : nv.eb[e]; return { x: nv.nx[n], z: nv.nz[n] }; } } return { x: nv.nx[0], z: nv.nz[0] }; }
  _spawn(initial) {
    const a = this._node(); let b = this._node();
    for (let k = 0; k < 20 && Math.hypot(b.x - a.x, b.z - a.z) < 1500; k++) b = this._node();
    const layer = DRONE.layers[Math.floor(Math.random() * DRONE.layers.length)];
    const d = { x: a.x, y: 0, z: a.z, vx: 0, vy: 0, vz: 0, tx: b.x, tz: b.z, layer, phase: 'lift', g: 0, track: Math.atan2(b.x - a.x, b.z - a.z), wait: 0, color: this.cols[Math.floor(Math.random() * this.cols.length)], spin: Math.random() * 6 };
    if (initial) {
      // 一開始：大部分已經在空中某個位置
      const u = Math.random(); d.x = a.x + (b.x - a.x) * u; d.z = a.z + (b.z - a.z) * u; d.phase = 'cruise';
    }
    d.g = this.world.groundAt(d.x, d.z, 10); d.y = initial ? d.g + layer : d.g;
    return d;
  }

  /** 每幀：飛行（含彼此避撞），把靠近 (px,pz) 的畫出來。others：玩家的無人機（也要被避開）。 */
  update(dt, px, pz, others) {
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i];
      d.daaT = (d.daaT === undefined ? Math.random() * 0.5 : d.daaT) - dt;
      const doDaa = d.daaT <= 0; if (doDaa) d.daaT = 0.5;            // 每架每 0.5 秒重算一次（錯開時間）
      const gr = this.world.groundAt(d.x, d.z, d.g); d.g = gr;
      if (d.phase === 'lift') {
        d.vy = DRONE.climb; d.vx = d.vz = 0;
        if (d.y >= gr + d.layer) { d.phase = 'cruise'; d.vy = 0; }
      } else if (d.phase === 'cruise') {
        const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
        if (doDaa) {
          const near = [];
          // 只看可能衝突的：水平 2 km、垂直 40 m 內（不同高度層相差 20 m，平常不會互相影響）
          for (const o of this.list) if (o !== d && o.phase !== 'ground' && Math.abs(o.y - d.y) < 40 && Math.abs(o.x - d.x) < 2000 && Math.abs(o.z - d.z) < 2000) near.push(o);
          if (others) for (const o of others) if (Math.abs(o.y - d.y) < 40) near.push(o);
          d.track = d.track === undefined ? want : d.track;
          const st = this.statics ? this.statics.filter(b => b.top + 25 > d.y && (b.x - d.x) ** 2 + (b.z - d.z) ** 2 < 1500 * 1500) : [];
          if (near.length || st.length) { const r = computeBands(d, DRONE.cruise, want, near, st); d.track = r.pick; d.vsCmd = r.vs; }
          else { d.track = want; d.vsCmd = 0; }
        }
        const sp = Math.min(DRONE.cruise, dist / 4 + 5);
        d.vx = Math.sin(d.track) * sp; d.vz = Math.cos(d.track) * sp;
        const ty = gr + d.layer;
        d.vy = d.vsCmd ? d.vsCmd : Math.max(-3, Math.min(3, (ty - d.y) * 0.5));
        if (dist < 60) { d.phase = 'land'; d.vx = d.vz = 0; }
      } else if (d.phase === 'land') {
        d.vx = d.vz = 0; d.vy = -DRONE.descend;
        if (d.y <= gr + 0.2) { d.phase = 'ground'; d.vy = 0; d.y = gr; d.wait = 4 + Math.random() * 6; }
      } else if (d.phase === 'ground') {
        d.wait -= dt; if (d.wait <= 0) Object.assign(d, this._spawn(false));
      }
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.spin += dt * 40;
    }
    // 畫出 1.6 km 內的
    let n = 0;
    for (const d of this.list) {
      if (n >= this.N || Math.abs(d.x - px) > 1600 || Math.abs(d.z - pz) > 1600) continue;
      const psi = Math.atan2(-d.vx, -d.vz) || 0;
      _e.set(0, d.vx || d.vz ? psi : d.track + Math.PI, 0); _q.setFromEuler(_e); _v.set(d.x, d.y, d.z); _m.compose(_v, _q, _s);
      this.body.setMatrixAt(n, _m); this.trim.setMatrixAt(n, _m); this.rotors.setMatrixAt(n, _m); this.body.setColorAt(n, d.color); n++;
    }
    for (const m of [this.body, this.trim, this.rotors]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }
}

/** (x,z) 上方（高度 y 再上去 2 m）有沒有高架橋或建物擋住，不能垂直升空。 */
export function overheadAt(W, x, z, y) {
  const G = W.G, arr = W.segGrid.get(Math.floor(x / G) * 73856093 ^ Math.floor(z / G) * 19349663);
  if (arr) for (const { e, i } of arr) {
    if (!e.bridge) continue;
    const p = e.pts, ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az, L2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 > (e.hw + 2) ** 2) continue;
    if (e.hs[i] + (e.hs[i + 1] - e.hs[i]) * t > y + 2) return true;
  }
  const b = W.buildingAt(x, z); return !!(b && b.y0 + b.h > y + 2);
}

// ------------------------------------------------------------------ 玩家的無人機飛行
export class DroneFlight {
  /** hooks：{ toast(msg,s), cost(元), traffic(), dest() → {x,z}, statics } */
  constructor(car, world, hooks) {
    this.car = car; this.world = world; this.h = hooks;
    this.active = false; this.phase = 'off'; this.vx = this.vy = this.vz = 0;
    this.rotors = rotorGeometry(); car.body.add(this.rotors); this.deploy = 0;
    this.costSum = 0; this.waitSec = 0; this.flySec = 0; this.r = null; this.cp = null;
  }

  /** 要不要切到車外視角。 */
  get external() { return this.active; }

  /** 起飛前檢查：停著或很慢、上方沒有高架橋、不在隧道裡。 */
  canStart(stuntsBusy) {
    const c = this.car;
    if (stuntsBusy) return '特技中不能啟動無人機飛行';
    if (Math.abs(c.v) > 3) return '先慢下來（10 km/h 以下）才能升空';
    if (c.edge && c.edge.tunnel) return '隧道裡不能升空';
    if (this._overhead(c.x, c.z, c.y)) return '上方有高架橋或建物，先開出來再升空';
    return '';
  }
  _overhead(x, z, y) { return overheadAt(this.world, x, z, y); }

  /** 選降落點：目的地附近（250 m 內）的一般道路上，周圍 6 m 沒有建物。 */
  /**
   * 選降落點：目的地附近（250 m 內）的道路上，周圍 6 m 沒有建物。車少的路優先（巷道、一般道路），
   * 大馬路車多、常常等不到空檔，算成「多 120 m」。avoid：已經等太久、放棄的降落點。
   */
  _landingSpot(dest, avoid = []) {
    const W = this.world; let best = null;
    W.forEdgesNear(dest.x, dest.z, 260, (e) => {
      if (e.bridge || e.tunnel || e.cls > 5 || e.cls < 2 || e.dead) return;
      const pen = e.cls <= 3 ? 120 : 0;
      for (let i = 0; i + 1 < e.pts.length / 2; i++) {
        const x = (e.pts[i * 2] + e.pts[i * 2 + 2]) / 2, z = (e.pts[i * 2 + 1] + e.pts[i * 2 + 3]) / 2, d = Math.hypot(x - dest.x, z - dest.z);
        if (d > 250 || (best && d + pen >= best.score)) continue;
        if (avoid.some(a => Math.hypot(a.x - x, a.z - z) < 40)) continue;
        let ok = true; for (const [ox, oz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) if (W.buildingAt(x + ox, z + oz)) { ok = false; break; }
        if (ok) best = { x, z, d, score: d + pen, e, psi: Math.atan2(-(e.pts[i * 2 + 2] - e.pts[i * 2]), -(e.pts[i * 2 + 3] - e.pts[i * 2 + 1])) };
      }
    });
    return best;
  }

  /** 選巡航高度層：路線（直線）兩側 300 m 內，別架無人機最少的那一層。 */
  _pickLayer(from, to, drones) {
    const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1, cnt = DRONE.layers.map(() => 0);
    for (const d of drones) {
      if (d.phase !== 'cruise') continue;
      const t = Math.max(0, Math.min(1, ((d.x - from.x) * dx + (d.z - from.z) * dz) / (L * L)));
      if (Math.hypot(d.x - from.x - dx * t, d.z - from.z - dz * t) > 300) continue;
      DRONE.layers.forEach((h, k) => { if (Math.abs(d.layer - h) < 1) cnt[k]++; });
    }
    let k = 0; for (let i = 1; i < cnt.length; i++) if (cnt[i] < cnt[k]) k = i;
    return { layer: DRONE.layers[k], counts: cnt };
  }

  /** plan：路空總控排好的降落時段（{ slotAt, predSec, t0, ahead, area }），沒有就是一般的飛行。 */
  start(drones, plan) {
    const c = this.car, dest = this.h.dest();
    // 目的地那邊的街區可能還沒載入：先朝目的地飛，靠近後（街區載入了）再選降落的路段
    const spot = this._landingSpot(dest) || { x: dest.x, z: dest.z, provisional: true, psi: c.psi };
    const dense = !!(drones && drones.dense), trk = Math.atan2(spot.x - c.x, spot.z - c.z);
    // 全城無人機：依航向分高度層（遊戲設定）；平常：選路線附近最空的那一層
    const lp = dense ? { layer: layerFor(trk), counts: null } : this._pickLayer(c, spot, drones ? drones.list : []);
    Object.assign(this, { avoid: [], spotWait: 0, active: true, phase: 'lift', spot, layer: lp.layer, layerCounts: lp.counts, vx: 0, vy: 0, vz: 0, track: trk, costSum: 0, waitSec: 0, flySec: 0, cp: null,
      dense, liftWait: 0, crossWait: 0, commit: null, held: false, jamSec: 0, plan: plan || null, slotHold: false, slotSec: 0, roads: !!(this.h.roads && this.h.roads()), tPh: { lift: 0, cruise: 0, approach: 0, hover: 0, descend: 0 }, d0: 0 });
    this.d0 = Math.hypot(spot.x - c.x, spot.z - c.z);
    this.x = c.x; this.y = c.y; this.z = c.z; this.psi = c.psi;
    c.v = 0;
    if (plan) this.h.toast(`總控核准升空：往這個方向的車在 ${lp.layer} m 那一層，降落時段已經排好`, 3);
    else if (dense) this.h.toast(`無人機飛行：往這個方向的車都在 ${lp.layer} m 那一層（依航向分層）。往上要穿過下面幾層的車流，等空檔再爬升`, 3.5);
    else this.h.toast(`無人機飛行：升空到 ${lp.layer} m（這一層最空：${lp.counts.join(' / ')} 架）`, 3);
    return true;
  }
  /** 中途取消：就地找路面降落。 */
  abort() {
    if (!this.active || this.phase === 'descend' || this.phase === 'hover') return;
    const o = {}; const e = this.world.nearestEdge(this.x, this.z, 150, (ed) => !ed.bridge && !ed.tunnel && ed.cls <= 5, o);
    if (!e) { this.h.toast('附近沒有可以降落的道路', 1.8); return; }
    this.spot = { x: o.x, z: o.z, e, psi: this.psi }; this.phase = 'approach';
    this.h.toast('取消飛行，降落到附近的道路', 2);
  }

  /** 每幀（遊戲時間的分鐘數 gameMin 用來算燃料費）。others：全市無人機。 */
  update(dt, gameMinPerSec, drones, statics) {
    if (!this.active) return;
    const c = this.car, W = this.world;
    const gr = W.groundAt(this.x, this.z, this.y - 50);
    this.flySec += dt; if (this.tPh) this.tPh[this.phase] = (this.tPh[this.phase] || 0) + dt;
    const fee = DRONE.costPerMin * gameMinPerSec * dt; this.costSum += fee; this.h.cost(fee);
    const dense = this.dense && drones && drones.dense;
    const list = !drones ? [] : dense ? drones.near(this.x, this.y, this.z, 600, SKY.zsep + 4) : drones.list.filter(d => d.phase !== 'ground' && Math.abs(d.x - this.x) < 2500 && Math.abs(d.z - this.z) < 2500);
    this.gr = gr; this.held = false; if (dense) this.sky = drones;
    if (this.spot.provisional && Math.hypot(this.spot.x - this.x, this.spot.z - this.z) < 900) {
      const s2 = this._landingSpot(this.h.dest(), this.avoid);
      if (s2) this.spot = s2;
      else if (Math.hypot(this.spot.x - this.x, this.spot.z - this.z) < 350) {
        const o = {}, e = W.nearestEdge(this.spot.x, this.spot.z, 300, (ed) => !ed.bridge && !ed.tunnel && ed.cls <= 6, o);
        if (e) this.spot = { x: o.x, z: o.z, e, psi: this.psi };
      }
    }
    const sp = this.spot, dx = sp.x - this.x, dz = sp.z - this.z, dist = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
    this.daaT = (this.daaT || 0) - dt;
    if (this.phase === 'lift') {
      // 旋翼還沒完全展開前先停在原地（約 1 秒）
      this.vx *= 0.9; this.vz *= 0.9; this.vy = this.deploy >= 0.98 ? DRONE.climb : 0;
      // 全城無人機：要穿過下面幾層的車流，進入每一層之前先確認這幾秒內不會有車經過（不然就停在層與層之間等）
      if (dense && this.vy > 0 && !this._crossOk(drones, 1)) { this.vy = 0; this.liftWait += dt; this.held = true; }
      if (this.y >= gr + this.layer) { this.phase = 'cruise'; this.vy = 0; if (dense) drones.reserve = []; }
    } else if (this.phase === 'cruise' || this.phase === 'approach') {
      if (this.daaT <= 0) {
        this.daaT = 0.4;
        const o = { x: this.x, y: this.y, z: this.z, vx: this.vx, vy: this.vy, vz: this.vz, track: this.track };
        this.r = computeBands(o, DRONE.cruise, want, list, statics);
        this.track = this.r.pick; this.vsCmd = dense ? 0 : this.r.vs;
      }
      const slow = this.phase === 'approach' || dist < 600;
      let spd = slow ? Math.max(4, Math.min(DRONE.cruise, dist / 6)) : DRONE.cruise;
      if (dense) {
        // 同一層跟前車保持距離（空中也會塞車）
        const fx = Math.sin(this.track), fz = Math.cos(this.track);
        for (const o of list) {
          if (Math.abs(o.y - this.y) > SKY.zsep) continue;
          const rx = o.x - this.x, rz = o.z - this.z, along = rx * fx + rz * fz, lat = rx * fz - rz * fx;
          const ov = (o.vx || 0) * fx + (o.vz || 0) * fz;
          if (along > 0 && along < 160 && Math.abs(lat) < 45 && ov > 2) spd = Math.min(spd, Math.max(4, ov + (along - SKY.follow) * 0.6));
          else if (along > 0 && along < 60 && Math.abs(lat) < 45) spd = Math.min(spd, 10);
        }
        if (spd < DRONE.cruise * 0.6 && !slow) this.jamSec += dt;
      }
      let d = this.track - Math.atan2(this.vx, this.vz); d = Math.atan2(Math.sin(d), Math.cos(d));
      const tr = Math.atan2(this.vx, this.vz) + Math.max(-0.6 * dt, Math.min(0.6 * dt, d));   // 轉向速度有限（約每秒 34 度）
      const cur = Math.hypot(this.vx, this.vz), ns = cur + Math.max(-6 * dt, Math.min(4 * dt, spd - cur));
      this.vx = Math.sin(slow && dist < 120 ? want : tr) * ns; this.vz = Math.cos(slow && dist < 120 ? want : tr) * ns;
      // 全城無人機：在自己那一層飛；已經降到各層下面（換降落點）就留在低空（40 m）飛過去，不用再穿過下面幾層
      const low = dense && this.phase === 'approach' && this.y < gr + SKY.layers[0] - SKY.zsep;
      const ty = dense && !low ? gr + this.layer : (slow || low ? Math.max(gr + 40, W.groundAt(sp.x, sp.z, gr) + 40) : gr + this.layer);
      this.vy = this.vsCmd ? this.vsCmd : Math.max(-DRONE.descend, Math.min(DRONE.climb, (ty - this.y) * 0.5));
      if (dist < 8 && cur < 6 && !sp.provisional) { this.phase = 'hover'; this.vx = this.vz = 0; }
    } else if (this.phase === 'hover') {
      // 降落點正上方：下面有車就等
      this.vx = (sp.x - this.x) * 0.8; this.vz = (sp.z - this.z) * 0.8;
      const lg = W.groundAt(sp.x, sp.z, gr), ty = dense ? this.y : lg + 25; this.vy = dense ? 0 : Math.max(-DRONE.descend, Math.min(2, (ty - this.y) * 0.6));
      // 路空總控：還沒到排好的降落時段，在降落點上方等。比預估早到、而且排隊的車比較少：總控把時段提前
      if (this.plan && this.plan.reslot && !this.plan.reslotted) { this.plan.reslotted = true; this.plan.slotAt = Math.min(this.plan.slotAt, this.plan.reslot()); }
      this.slotHold = !!(this.plan && this.h.now && this.h.now() < this.plan.slotAt);
      if (this.slotHold) { this.slotSec += dt; this.waitSec += dt; }
      else if (this._clear(sp, drones)) { if (Math.abs(this.y - ty) < 3) this.phase = 'descend'; }
      else if (!this.slotHold) {
        this.waitSec += dt; this.blocked = true; this.spotWait = (this.spotWait || 0) + dt;
        // 同一個降落點等了 40 秒（遊戲 4 分鐘）還是有車：換附近另一個降落點
        if (this.spotWait > 40) {
          this.avoid = (this.avoid || []).concat([{ x: sp.x, z: sp.z }]);
          const s2 = this._landingSpot(this.h.dest(), this.avoid);
          if (s2) { this.spot = s2; this.phase = 'approach'; this.h.toast('下面一直有車，換一個降落點', 2); }
          this.spotWait = 0;
        }
      }
    } else if (this.phase === 'descend') {
      this.vx = (sp.x - this.x) * 0.8; this.vz = (sp.z - this.z) * 0.8; this.vy = -DRONE.descend;
      const lg = W.groundAt(sp.x, sp.z, gr);
      if (dense && !this._crossOk(drones, -1)) { this.vy = 0; this.crossWait += dt; this.held = true; }
      else if (!this._clear(sp, drones) && this.y > lg + 4 && (!dense || (this.roads && this.y < lg + 30))) { this.phase = 'hover'; }   // 降到一半又有車開進來：停在空中等（路上有車流時，降到 30 m 以下才檢查）
      const s = W.surfaceAt(this.x, this.z, lg, {}), floor = s ? s.y : lg;
      if (this.y <= floor + 0.05) { this._finish(floor); return; }
    }
    this.blocked = this.phase === 'hover' && !this.slotHold && !this._clear(sp, drones);
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    if (Math.hypot(this.vx, this.vz) > 1) this.psi = Math.atan2(-this.vx, -this.vz);
    c.x = this.x; c.y = this.y; c.z = this.z; c.psi = this.psi; c.v = Math.hypot(this.vx, this.vz); c.edge = null; c.pitch = 0;
    c.group.position.set(c.x, c.y, c.z); c.group.rotation.set(0, c.psi, 0, 'YXZ');
  }
  _clear(sp, drones) {
    const t = this.h.traffic();
    if (t) for (const o of t.cars) if (Math.abs(o.x - sp.x) < DRONE.landClear && Math.abs(o.z - sp.z) < DRONE.landClear && Math.hypot(o.x - sp.x, o.z - sp.z) < DRONE.landClear) return false;
    // 全城無人機：降落點上有別台剛降落／正在降落的車
    if (drones && drones.dense) for (const o of drones.list) if ((o.phase === 'ground' || o.phase === 'land') && Math.abs(o.x - sp.x) < DRONE.landClear && Math.abs(o.z - sp.z) < DRONE.landClear) return false;
    return true;
  }
  /**
   * 全城無人機：往上（dir=1）或往下（dir=-1）穿過一個高度層之前，預測那一層的車接下來幾秒會不會經過頭上／腳下 70 m 內。
   * 進入那一層之後就不再停（已經在層裡停下來反而更危險），那一層的車會讓你。
   */
  _crossOk(drones, dir) {
    const g = this.gr, z = SKY.zsep, rate = dir > 0 ? DRONE.climb : DRONE.descend;
    const Ls = SKY.layers.filter(L => dir > 0 ? L <= this.layer : L < this.layer).sort((a, b) => dir > 0 ? a - b : b - a);
    for (const L of Ls) {
      const lo = g + L - z, hi = g + L + z;
      if (dir > 0 ? this.y > lo - 0.5 : this.y < hi + 0.5) continue;          // 已經過了（或已經在裡面）
      if (this.commit === dir * 1000 + L) return true;
      if (dir > 0 ? lo - this.y > rate * 2.5 : this.y - hi > rate * 2.5) return true;   // 還沒到那一層
      // 快到了：向系統登記這一段「空中柱子」，那一層的車會繞開；等柱子裡沒車了才進去
      drones.reserve = [{ x: this.x, z: this.z, r: 95, lo: lo - 4, hi: hi + 4 }];
      if (this._layerBusy(drones, g + L, 2.5)) return false;
      this.commit = dir * 1000 + L; return true;
    }
    return true;
  }
  _layerBusy(drones, y, T) {
    const r = SKY.sep + 10, R = r + SKY.cruise * T;
    for (const o of drones.near(this.x, y, this.z, R, SKY.zsep + 3)) {
      if (o.phase !== 'cruise') continue;
      for (let t = 0; t <= T; t += 0.5) { const x = o.x + (o.vx || 0) * t - this.x, zz = o.z + (o.vz || 0) * t - this.z; if (x * x + zz * zz < r * r) return true; }
    }
    return false;
  }
  _finish(y) {
    const c = this.car;
    if (this.sky) this.sky.reserve = [];
    c.x = this.spot.x; c.z = this.spot.z; c.y = y; c.psi = this.spot.psi; c.v = 0; c.steer = 0; c.edge = null;
    c.sync();
    this.active = false; this.phase = 'off';
    const gm = this.h.gameMinPerSec(), wt = (this.waitSec + (this.liftWait || 0) + (this.crossWait || 0)) * gm;
    const pl = this.plan;
    if (pl && this.h.now) {
      // 路空總控：預估跟實際差多少（從按 U 問總控那一刻算起）
      const act = (this.h.now() - pl.t0) * gm, pred = pl.predSec * gm;
      this.result = { pred, act, slot: this.slotSec * gm };
      this.h.toast(`降落完成：總控預估 ${pred.toFixed(0)} 分鐘，實際 ${act.toFixed(0)} 分鐘${this.slotSec * gm > 0.3 ? `（其中排隊等降落時段 ${(this.slotSec * gm).toFixed(0)} 分鐘）` : ''}，燃料費 ${Math.round(this.costSum).toLocaleString()} 元`, 5);
      return;
    }
    this.h.toast(`降落完成：飛了 ${(this.flySec * gm).toFixed(0)} 分鐘${wt > 0.05 ? `（其中在空中等 ${wt.toFixed(1)} 分鐘${this.dense ? '：等各層車流的空檔' : '：等下方沒車'}）` : ''}，燃料費 ${Math.round(this.costSum)} 元`, 4);
  }

  /** 每幀（飛不飛都要呼叫）：旋翼展開／收回、轉動。 */
  animate(dt) {
    const t = this.active ? 1 : 0;
    this.deploy += Math.max(-dt / 1.0, Math.min(dt / 1.0, t - this.deploy));
    setDeploy(this.rotors, this.deploy);
    const spin = this.active ? (this.phase === 'lift' ? 10 + 30 * this.deploy : 40) : 12 * this.deploy;
    for (const r of this.rotors.userData.discs) r.rotation.y += dt * spin;
  }

  /** 車外視角：在後上方、地平線水平。 */
  camera(cam, dt) {
    const fx = -Math.sin(this.psi), fz = -Math.cos(this.psi);
    _v.set(this.x - fx * 14, this.y + 6, this.z - fz * 14);
    if (!this.cp) this.cp = cam.position.clone();
    this.cp.lerp(_v, 1 - Math.exp(-dt * 3));
    cam.up.set(0, 1, 0); cam.position.copy(this.cp); cam.lookAt(this.x + fx * 6, this.y + 0.5, this.z + fz * 6);
  }

  /** 避撞面板：航向範圍（綠＝可飛、紅＝會失去安全距離）、附近的無人機、警示等級。 */
  drawPanel(cv, drones) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 22;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,14,18,.82)'; g.beginPath(); g.arc(cx, cy, R + 16, 0, Math.PI * 2); g.fill();
    const hd = Math.atan2(this.vx, this.vz) || this.track || 0;    // 航向朝上
    const toScreen = (h) => -Math.PI / 2 + (h - hd) * -1;           // 航向（atan2(dx,dz)）→ 畫面角度
    if (this.r) for (const b of this.r.bands) {
      const a = toScreen(b.h), w = DAA.TRACK_STEP * Math.PI / 180 / 2 + 0.01;
      g.strokeStyle = b.t === Infinity ? '#3fd08a' : b.t < 15 ? '#ff4d4d' : '#f5c518'; g.lineWidth = 9;
      g.beginPath(); g.arc(cx, cy, R, a - w, a + w); g.stroke();
    }
    // 附近的無人機（1.5 km 內）
    const RNG = drones && drones.dense ? 600 : 1500, sc = R / RNG;
    if (drones) for (const d of (drones.dense ? drones.near(this.x, this.y, this.z, RNG, 400) : drones.list)) {
      if (d.phase === 'ground') continue;
      const dx = d.x - this.x, dz = d.z - this.z; if (Math.abs(dx) > RNG || Math.abs(dz) > RNG) continue;
      const ang = Math.atan2(dx, dz) - hd, r = Math.hypot(dx, dz) * sc; if (r > R - 6) continue;
      const near = Math.abs(d.y - this.y) < DAA.ZTHR * 2;
      g.fillStyle = near ? '#ffd27a' : '#7d8b97';
      g.beginPath(); g.arc(cx - Math.sin(ang) * r, cy - Math.cos(ang) * r, near ? 4 : 3, 0, Math.PI * 2); g.fill();
    }
    // 目的地方向
    const ta = Math.atan2(this.spot.x - this.x, this.spot.z - this.z) - hd;
    g.fillStyle = '#f5c518'; g.beginPath(); g.arc(cx - Math.sin(ta) * (R - 16), cy - Math.cos(ta) * (R - 16), 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, cy - 10); g.lineTo(cx + 7, cy + 8); g.lineTo(cx, cy + 3); g.lineTo(cx - 7, cy + 8); g.closePath(); g.fill();
    g.fillStyle = '#cfe6ff'; g.font = '700 12px "Noto Sans TC", sans-serif'; g.textAlign = 'center';
    g.fillText('DAA 避撞（參考 NASA DAIDALUS）', cx, 13);
    const lv = this.r ? this.r.alert : 0;
    g.fillStyle = ['#8b96a1', '#f5c518', '#ff9b3d', '#ff4d4d'][lv];
    g.fillText(['航線淨空', '注意：有無人機接近', '避讓中', '緊急避讓'][lv], cx, H - 6);
  }
}
