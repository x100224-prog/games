// 玩法「全城無人機」：所有的車都進入無人機系統，路上幾乎沒有車，天上擠滿會飛的車。
//
// 數量：在你附近（半徑 SKY.R）的路網上，尖峰時段原本有多少車（每條路：長度 × 車流密度 × 車道數 × 尖峰倍數），
//      天上就有多少架（遊戲設定：「路上的車全部改用飛的」）。全市約 7 萬多架，這裡只模擬你附近的那一塊，
//      離開範圍的從範圍邊緣補進來，密度維持不變。
// 規則（遊戲設定，參考航空的「依航向分高度層」）：6 個巡航高度層，每 60 度航向一層，同一層的車大致同方向飛，
//      比較少對頭相撞的情況。同一層裡跟前車保持約 80 m（跟車），太近就往旁邊閃、減速。
// 這些車用簡化的規則飛（計算量小）；玩家自己的飛行仍然用 DAA 避撞（drone.js）。
import * as THREE from '../lib/three.module.min.js';
import { carGeometry } from './vehicles.js';
import { TRAFFIC_DENSITY } from './config.js';

export const SKY = {
  layers: [90, 110, 130, 150, 170, 190],   // 巡航高度層（離地 m），依航向分配
  R: 1300,          // 模擬範圍（半徑 m）
  maxN: 3200,       // 效能上限
  sep: 70,          // 水平安全距離（m，跟 DAA 一樣）
  zsep: 18,         // 垂直安全距離（m）
  follow: 80,       // 跟前車的距離（m）
  cruise: 50, climb: 6, descend: 4,
  nearFull: 260,    // 這個距離內畫完整車身＋旋翼
  CELL: 150,
};
const LANES = [3, 2, 2, 2, 1, 1, 1, 1];
const TAU = Math.PI * 2;
/** 依航向（atan2(dx,dz)）分配高度層。 */
export function layerFor(h) { const s = ((h % TAU) + TAU) % TAU; return SKY.layers[Math.min(SKY.layers.length - 1, Math.floor(s / (TAU / SKY.layers.length)))]; }
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();

function simpleFlyer() {
  // 遠處用的低面數飛行車：車身、車窗、四片旋翼（頂點色：車身白色＝乘上每台車的顏色）
  const parts = [], add = (g, x, y, z, c) => { g.translate(x, y, z); const n = g.toNonIndexed(); const cnt = n.attributes.position.count, col = []; for (let i = 0; i < cnt; i++) col.push(...c); n.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); parts.push(n); };
  add(new THREE.BoxGeometry(1.8, 0.6, 4.4), 0, 0.6, 0, [1, 1, 1]);
  add(new THREE.BoxGeometry(1.5, 0.5, 2.2), 0, 1.15, 0.2, [0.16, 0.19, 0.23]);
  for (const sx of [-1.7, 1.7]) for (const sz of [-1.55, 1.55]) add(new THREE.CylinderGeometry(0.95, 0.95, 0.05, 10), sx, 1.5, sz, [0.3, 0.33, 0.36]);
  const pos = [], nor = [], col = [];
  for (const p of parts) { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); col.push(...p.attributes.color.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class DenseSky {
  constructor(scene, world, nav, factor = 1.8) {
    this.world = world; this.nav = nav; this.factor = factor; this.list = []; this.statics = [];
    this.cx = null; this.cz = null; this.target = 0; this.nodes = []; this.dense = true; this.count = 0;
    this.cols = [0xe8e8e6, 0x2b2d31, 0x8e9399, 0x21395c, 0x6f1f24, 0xb8433a, 0xc9ccd0].map(h => new THREE.Color(h));
    // 近的：完整車身＋旋翼；遠的：低面數
    const g = carGeometry(), NF = 160;
    this.body = new THREE.InstancedMesh(g.paint, new THREE.MeshLambertMaterial(), NF);
    this.trim = new THREE.InstancedMesh(g.trim, new THREE.MeshLambertMaterial({ vertexColors: true }), NF);
    const rp = [];
    for (const sx of [-1.7, 1.7]) for (const sz of [-1.55, 1.55]) { const d = new THREE.CircleGeometry(1.0, 16).rotateX(-Math.PI / 2).translate(sx, 1.52, sz).toNonIndexed(); rp.push(...d.attributes.position.array); }
    for (const [w, d, x, z] of [[4.3, 0.12, 0, -1.55], [4.3, 0.12, 0, 1.55], [0.12, 4.0, -1.7, 0], [0.12, 4.0, 1.7, 0]]) rp.push(...new THREE.BoxGeometry(w, 0.06, d).translate(x, 1.35, z).toNonIndexed().attributes.position.array);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    this.rotors = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: 0x9fb1bf, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), NF);
    this.far = new THREE.InstancedMesh(simpleFlyer(), new THREE.MeshLambertMaterial({ vertexColors: true }), SKY.maxN);
    for (const m of [this.body, this.trim, this.rotors, this.far]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.body.setColorAt(0, this.cols[0]); this.far.setColorAt(0, this.cols[0]); this.NF = NF;
    // 格網（找鄰居用）
    this.GN = Math.ceil((SKY.R + 450) * 2 / SKY.CELL); this.head = new Int32Array(this.GN * this.GN); this.next = new Int32Array(SKY.maxN + 8);
    this.stats = { spawned: 0, landed: 0 };
    // 起降保留區：玩家要穿過某一層時向系統登記，那一層的車會繞開這根「空中柱子」、讓出空檔（遊戲設定）
    this.reserve = [];
  }
  setVisible(v) { for (const m of [this.body, this.trim, this.rotors, this.far]) m.visible = v; }

  /** 以 (px,pz) 為中心重新估算：範圍內的路網原本有多少車、可以起降的路口。 */
  _recenter(px, pz) {
    this.cx = px; this.cz = pz;
    const nv = this.nav, R = SKY.R, R2 = R * R, ext = (R + 1600) ** 2; let n = 0; const nodes = [], outer = [];
    for (let k = 0; k < nv.E; k++) {
      const c = nv.ecls[k]; if (c > 5) continue;
      const a = nv.ea[k], b = nv.eb[k], mx = (nv.nx[a] + nv.nx[b]) / 2 - px, mz = (nv.nz[a] + nv.nz[b]) / 2 - pz, d2 = mx * mx + mz * mz;
      if (d2 < R2) { n += nv.elen[k] / 1000 * TRAFFIC_DENSITY[c] * LANES[c] * (nv.eow[k] ? 1 : 2) * this.factor; if (nv.elen[k] > 25) nodes.push(a); }
      else if (d2 < ext && (k & 3) === 0) outer.push(a);
    }
    this.roadCars = Math.round(n); this.target = Math.min(SKY.maxN, this.roadCars);
    this.nodes = nodes; this.outer = outer.length ? outer : nodes;
  }
  _node(arr) { const i = arr[Math.floor(Math.random() * arr.length)]; return { x: this.nav.nx[i], z: this.nav.nz[i] }; }
  _mk(x, z, tx, tz, phase, g) {
    const h = Math.atan2(tx - x, tz - z), layer = layerFor(h);
    const d = { x, y: phase === 'cruise' ? g + layer : g, z, vx: 0, vy: 0, vz: 0, tx, tz, track: h, v: phase === 'cruise' ? SKY.cruise * (0.7 + Math.random() * 0.3) : 0, layer, phase, g, gT: Math.random(), wait: 0, color: this.cols[Math.floor(Math.random() * this.cols.length)] };
    if (phase === 'cruise') { d.vx = Math.sin(h) * d.v; d.vz = Math.cos(h) * d.v; }
    this.stats.spawned++;
    return d;
  }
  /** 從地面（範圍內的路口）起飛，飛往範圍內或範圍外的地方。 */
  _spawnLift() {
    const a = this._node(this.nodes); let b = this._node(Math.random() < 0.5 ? this.nodes : this.outer);
    for (let k = 0; k < 12 && Math.hypot(b.x - a.x, b.z - a.z) < 900; k++) b = this._node(Math.random() < 0.5 ? this.nodes : this.outer);
    return this._mk(a.x, a.z, b.x, b.z, 'lift', this.world.groundAt(a.x, a.z, 10));
  }
  /** 從範圍邊緣飛進來。 */
  _spawnRing(initial) {
    let x, z;
    if (initial) { const r = SKY.R * Math.sqrt(Math.random()), t = Math.random() * TAU; x = this.cx + Math.sin(t) * r; z = this.cz + Math.cos(t) * r; }
    else { const t = Math.random() * TAU; x = this.cx + Math.sin(t) * SKY.R; z = this.cz + Math.cos(t) * SKY.R; }
    let b = this._node(this.nodes);
    for (let k = 0; k < 12 && Math.hypot(b.x - x, b.z - z) < 700; k++) b = this._node(Math.random() < 0.7 ? this.nodes : this.outer);
    return this._mk(x, z, b.x, b.z, 'cruise', this.world.groundAt(x, z, 10));
  }

  /** 範圍內、某個高度範圍裡，水平距離 r 以內有沒有別的飛行車（玩家起降時檢查「這一段空中有沒有車」）。 */
  columnBusy(x, z, y0, y1, r = SKY.sep) {
    let hit = 0;
    this._forNear(x, z, r, (o) => { if (o.phase !== 'ground' && o.y >= y0 && o.y <= y1 && (o.x - x) ** 2 + (o.z - z) ** 2 < r * r) hit++; });
    return hit;
  }
  /** 給 DAA 用：附近（水平 r、垂直 dy 以內）的飛行車。 */
  near(x, y, z, r, dy) {
    const out = [];
    this._forNear(x, z, r, (o) => { if (o.phase !== 'ground' && Math.abs(o.y - y) < dy && (o.x - x) ** 2 + (o.z - z) ** 2 < r * r) out.push(o); });
    return out;
  }
  _forNear(x, z, r, fn) {
    if (this.cx === null) return;
    const C = SKY.CELL, GN = this.GN, ox = this.cx - GN * C / 2, oz = this.cz - GN * C / 2;
    const i0 = Math.max(0, Math.floor((x - r - ox) / C)), i1 = Math.min(GN - 1, Math.floor((x + r - ox) / C));
    const j0 = Math.max(0, Math.floor((z - r - oz) / C)), j1 = Math.min(GN - 1, Math.floor((z + r - oz) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let k = this.head[j * GN + i]; k >= 0; k = this.next[k]) { const o = this.list[k]; if (o) fn(o); }
  }
  _grid() {
    const C = SKY.CELL, GN = this.GN, ox = this.cx - GN * C / 2, oz = this.cz - GN * C / 2;
    this.head.fill(-1);
    for (let k = 0; k < this.list.length; k++) {
      const d = this.list[k]; if (!d || d.phase === 'ground') { this.next[k] = -1; continue; }
      const i = Math.floor((d.x - ox) / C), j = Math.floor((d.z - oz) / C);
      if (i < 0 || j < 0 || i >= GN || j >= GN) { this.next[k] = -1; continue; }
      const c = j * GN + i; this.next[k] = this.head[c]; this.head[c] = k;
    }
  }

  /** 每幀。others：玩家（飛行中的車），這些車會讓它。 */
  update(dt, px, pz, others) {
    if (this.cx === null || Math.hypot(px - this.cx, pz - this.cz) > 250) {
      const first = this.cx === null; this._recenter(px, pz);
      if (first) { this.list.length = 0; for (let i = 0; i < this.target; i++) this.list.push(Math.random() < 0.06 ? this._spawnLift() : this._spawnRing(true)); }
    }
    this.count = this.list.length;
    this._grid();
    const R2 = (SKY.R + 250) ** 2, list = this.list, W = this.world;
    let removed = 0;
    for (let k = list.length - 1; k >= 0; k--) {
      const d = list[k];
      d.gT -= dt; if (d.gT <= 0) { d.gT = 1 + Math.random() * 0.5; d.g = W.groundAt(d.x, d.z, d.g); }
      if (d.phase === 'lift') {
        d.vx = d.vz = 0; d.vy = SKY.climb;
        if (d.y >= d.g + d.layer) { d.phase = 'cruise'; d.vy = 0; d.v = 0; }
      } else if (d.phase === 'cruise') {
        const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
        const fx = Math.sin(d.track), fz = Math.cos(d.track);
        let vlim = Math.min(SKY.cruise, dist / 5 + 6), steer = 0;
        const look = (o) => {
          if (o === d || Math.abs(o.y - d.y) > SKY.zsep) return;
          const rx = o.x - d.x, rz = o.z - d.z, r2 = rx * rx + rz * rz; if (r2 > 150 * 150 || r2 < 0.01) return;
          const r = Math.sqrt(r2), along = rx * fx + rz * fz, lat = rx * fz - rz * fx;
          // 同方向的前車：跟車；對向或橫越的：往旁邊閃、放慢但不停下來（停下來就轉不開了）
          const ov = (o.vx || 0) * fx + (o.vz || 0) * fz;
          if (along > 0 && Math.abs(lat) < 45 && ov > 2) vlim = Math.min(vlim, Math.max(4, ov + (along - SKY.follow) * 0.6));
          if (r < 90) { steer -= Math.sign(lat || 1) * (90 - r) / 90 * 1.3; if (along > -10 && r < 55) vlim = Math.min(vlim, 10); }
        };
        this._forNear(d.x, d.z, 150, look);
        if (others) for (const o of others) look(o);
        for (const rv of this.reserve) {
          if (d.y < rv.lo || d.y > rv.hi) continue;
          const rx = rv.x - d.x, rz = rv.z - d.z, r = Math.hypot(rx, rz) - rv.r, along = rx * fx + rz * fz;
          if (r > 160) continue;
          steer -= Math.sign(rx * fz - rz * fx || 1) * Math.max(0, 160 - r) / 160 * 1.6;
          if (along > 0 && r < 60) vlim = Math.min(vlim, Math.max(6, r * 0.4));
          if (r < 0) { const k = Math.hypot(rx, rz) || 1; d.x -= rx / k * 6 * dt; d.z -= rz / k * 6 * dt; }   // 已經在柱子裡：往外移
        }
        if (this.statics) for (const b of this.statics) {
          if (d.y > b.top + 25) continue;
          const rx = b.x - d.x, rz = b.z - d.z, r = Math.hypot(rx, rz) - b.r; if (r > 120) continue;
          steer -= Math.sign(rx * fz - rz * fx || 1) * (120 - r) / 120 * 1.5;
        }
        const turn = Math.max(-0.6, Math.min(0.6, wrap(want - d.track) * 1.2 + steer));
        d.track += turn * dt;
        d.v += Math.max(-8 * dt, Math.min(4 * dt, vlim - d.v));
        d.vx = Math.sin(d.track) * d.v; d.vz = Math.cos(d.track) * d.v;
        d.vy = Math.max(-3, Math.min(3, (d.g + d.layer - d.y) * 0.5));
        if (dist < 50) { d.phase = 'land'; this.stats.landed++; }
      } else if (d.phase === 'land') {
        d.vx = (d.tx - d.x) * 0.5; d.vz = (d.tz - d.z) * 0.5; d.vy = -SKY.descend; d.v = 0;
        if (d.y <= d.g + 0.1) { d.y = d.g; d.vy = 0; d.vx = d.vz = 0; d.phase = 'ground'; d.wait = 3 + Math.random() * 4; }
      } else if (d.phase === 'ground') {
        d.wait -= dt; if (d.wait <= 0) { list[k] = this._spawnLift(); continue; }
      }
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if ((d.x - this.cx) ** 2 + (d.z - this.cz) ** 2 > R2) {
        // 飛出範圍：從邊緣補一台新的進來（數量超過目標就不補）
        if (list.length - removed > this.target) { list[k] = null; removed++; } else list[k] = this._spawnRing(false);
      }
    }
    if (removed) { let w = 0; for (let k = 0; k < list.length; k++) if (list[k]) list[w++] = list[k]; list.length = w; }
    while (list.length < this.target) list.push(this._spawnRing(false));
    this._grid();   // 位置更新後重建格網（玩家的避撞在後面會查）
    this._draw(px, pz);
  }

  _draw(px, pz) {
    let nf = 0, n = 0; const NF2 = SKY.nearFull * SKY.nearFull;
    for (const d of this.list) {
      const psi = d.v > 1 || d.vx || d.vz ? Math.atan2(-d.vx, -d.vz) : d.track + Math.PI;
      _e.set(0, psi, 0); _q.setFromEuler(_e); _v.set(d.x, d.y, d.z); _m.compose(_v, _q, _s);
      const d2 = (d.x - px) ** 2 + (d.z - pz) ** 2;
      if (d2 < NF2 && nf < this.NF) { this.body.setMatrixAt(nf, _m); this.trim.setMatrixAt(nf, _m); this.rotors.setMatrixAt(nf, _m); this.body.setColorAt(nf, d.color); nf++; }
      else if (n < SKY.maxN) { this.far.setMatrixAt(n, _m); this.far.setColorAt(n, d.color); n++; }
    }
    this.body.count = this.trim.count = this.rotors.count = nf; this.far.count = n;
    for (const m of [this.body, this.trim, this.rotors, this.far]) m.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.far.instanceColor) this.far.instanceColor.needsUpdate = true;
  }
}
