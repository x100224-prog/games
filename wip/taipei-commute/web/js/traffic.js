// 車流：依道路等級的平均車流密度，在玩家周圍的路網上產生並駕駛其他車輛；含紅綠燈。
// 沒有行人，只有車。
import * as THREE from '../lib/three.module.min.js';
import { TRAFFIC, TRAFFIC_DENSITY } from './config.js';
import { edgePoint, hash2, srgb, signalArm } from './world.js';
import { carGeometry, roadsterGeometry, TRAFFIC_COLORS, TAXI_COLOR } from './vehicles.js';

const _a = { x: 0, y: 0, z: 0, dx: 0, dz: 0, i: 0 }, _b = { x: 0, y: 0, z: 0, dx: 0, dz: 0, i: 0 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const CYCLE = 56;
// 車流裡也有別人的飛天跑車：塞住不動時會垂直升空、往前飛越車陣（最多約 60 m），落地時可能壓到別的車。
export const FLYER = { rate: 0.03, wait: 2.5, dist: 60, time: 2.7, apex: 9, cooldown: 25 };
const FLYER_COLORS = [0xc4161c, 0x1d5fc4, 0xf2f2ee, 0x16181b, 0x7c8a96].map(h => new THREE.Color(h));

/** 每條路的車流密度（輛／公里／車道）。之後接上真實車流量資料時，改這裡即可。 */
export function edgeDensity(e) {
  return e.flow !== undefined ? e.flow : TRAFFIC_DENSITY[e.cls];
}

function laneOffset(e, dir, lane) {
  if (e.oneway) return (lane + 0.5) * e.laneW - (e.width - 1) / 2;
  return dir * (lane + 0.5) * e.laneW;
}

export class Traffic {
  constructor(scene, world) {
    this.world = world; this.cars = []; this.time = 0; this._spawnT = 0; this._sigT = 0;
    this.factor = 1;
    const g = carGeometry(), N = TRAFFIC.maxCars;
    this.paint = new THREE.InstancedMesh(g.paint, new THREE.MeshLambertMaterial(), N);
    this.trim = new THREE.InstancedMesh(g.trim, new THREE.MeshLambertMaterial({ vertexColors: true }), N);
    for (const m of [this.paint, this.trim]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.paint.setColorAt(0, TRAFFIC_COLORS[0]);
    const rg = roadsterGeometry(), NF = 24;
    this.fPaint = new THREE.InstancedMesh(rg.paint, new THREE.MeshLambertMaterial(), NF);
    this.fTrim = new THREE.InstancedMesh(rg.trim, new THREE.MeshLambertMaterial({ vertexColors: true }), NF);
    for (const m of [this.fPaint, this.fTrim]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.fPaint.setColorAt(0, FLYER_COLORS[0]); this.NF = NF;
    this.events = [];      // 給主程式的事件（例如飛天跑車落地壓到人）
    this.flyerRate = FLYER.rate;
    // 號誌：燈桿＋三顆燈
    this.SMAX = 90;
    const pole = { p: [], n: [], c: [] };
    const addBox = (w, h, d, x, y, z, rgb) => {
      const b = new THREE.BoxGeometry(w, h, d).toNonIndexed(), p = b.attributes.position, nn = b.attributes.normal;
      for (let i = 0; i < p.count; i++) { pole.p.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z); pole.n.push(nn.getX(i), nn.getY(i), nn.getZ(i)); pole.c.push(...rgb); }
    };
    // 區域座標：+x = 行車方向的右側，-z = 行車方向。燈桿在右側路緣，橫臂伸向車道上方。
    addBox(0.18, 6.0, 0.18, 0, 3.0, 0, srgb(0.5, 0.52, 0.54));
    addBox(4.6, 0.12, 0.12, -2.3, 5.9, 0, srgb(0.5, 0.52, 0.54));
    addBox(1.5, 0.5, 0.26, -3.6, 5.72, 0.05, srgb(0.12, 0.13, 0.14));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pole.p, 3)); pg.setAttribute('normal', new THREE.Float32BufferAttribute(pole.n, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(pole.c, 3));
    this.poles = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ vertexColors: true }), this.SMAX);
    const lamp = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16); lamp.rotateX(Math.PI / 2);
    this.lights = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial(), this.SMAX * 3);
    for (const m of [this.poles, this.lights]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.lights.setColorAt(0, new THREE.Color(0, 0, 0));
    this.approaches = [];
    this.COL = { r: [new THREE.Color(1, 0.16, 0.12), new THREE.Color(0.2, 0.03, 0.03)], y: [new THREE.Color(1, 0.78, 0.1), new THREE.Color(0.2, 0.15, 0.02)], g: [new THREE.Color(0.15, 1, 0.5), new THREE.Color(0.03, 0.2, 0.1)] };
  }

  clear() { for (const c of this.cars) this._detach(c); this.cars.length = 0; }

  // ------------------------------------------------------------- 號誌
  /** 沿 edge 以 dir 方向抵達的路口，目前是 'g' | 'y' | 'r'。 */
  signalFor(e, dir) {
    const node = this.world.nodes.get(dir > 0 ? e.b : e.a);
    if (!node || !node.signal) return 'g';
    if (node.sigBase === undefined || node.sigN !== node.edges.length) {
      let best = null; for (const x of node.edges) if (!best || x.width > best.width) best = x;
      node.sigBase = this._bearingInto(best, best.b === node.id ? 1 : -1); node.sigN = node.edges.length;
    }
    const ang = this._bearingInto(e, dir);
    const grp = Math.round((ang - node.sigBase) / (Math.PI / 2)) & 1;
    const t = (this.time + hash2(node.id, 99) * CYCLE) % CYCLE, u = grp ? (t + CYCLE / 2) % CYCLE : t;
    return u < 23 ? 'g' : u < 26 ? 'y' : 'r';
  }

  _bearingInto(e, dir) {
    edgePoint(e, dir > 0 ? e.len : 0, _a);
    return Math.atan2(_a.dz * dir, _a.dx * dir);
  }

  _refreshSignals(px, pz) {
    const list = [], R2 = 230 * 230;
    this.world.forEdgesNear(px, pz, 230, (e) => {
      if (e.cls > 5) return;
      for (const dir of [1, -1]) {
        if (dir < 0 && e.oneway) continue;
        if (!(dir > 0 ? e.sigB : e.sigA)) continue;
        const trim = dir > 0 ? e.trimB : e.trimA; if (trim < 5) continue;
        const s = dir > 0 ? e.len - trim : trim;
        edgePoint(e, s, _a);
        const d2 = (_a.x - px) ** 2 + (_a.z - pz) ** 2; if (d2 > R2) continue;
        const side = dir * ((e.width - 1) / 2 + 0.9);
        list.push({ e, dir, x: _a.x - _a.dz * side, z: _a.z + _a.dx * side, y: _a.y, psi: Math.atan2(-_a.dx * dir, -_a.dz * dir), d2, arm: signalArm(e.width) });
      }
    });
    list.sort((a, b) => a.d2 - b.d2); list.length = Math.min(list.length, this.SMAX);
    this.approaches = list;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      _e.set(0, a.psi, 0); _q.setFromEuler(_e); _v.set(a.x, a.y, a.z); _m.compose(_v, _q, _s);
      this.poles.setMatrixAt(i, _m);
      const c = Math.cos(a.psi), s = Math.sin(a.psi);
      for (let k = 0; k < 3; k++) {
        // 從駕駛看過去：紅在左、黃在中、綠在右
        const lx = -(a.arm - 1.0) + (k - 1) * 0.44, lz = 0.16;
        _v.set(a.x + lx * c + lz * s, a.y + 5.72, a.z - lx * s + lz * c); _m.compose(_v, _q, _s);
        this.lights.setMatrixAt(i * 3 + k, _m);
      }
    }
    this.poles.count = 0; this.lights.count = list.length * 3;   // 燈桿、橫臂、燈箱改由 world.js 畫成固定模型
    this.poles.instanceMatrix.needsUpdate = true; this.lights.instanceMatrix.needsUpdate = true;
  }

  _colorSignals() {
    for (let i = 0; i < this.approaches.length; i++) {
      const a = this.approaches[i]; if (a.e.dead) continue;
      const st = this.signalFor(a.e, a.dir);
      this.lights.setColorAt(i * 3, this.COL.r[st === 'r' ? 0 : 1]);
      this.lights.setColorAt(i * 3 + 1, this.COL.y[st === 'y' ? 0 : 1]);
      this.lights.setColorAt(i * 3 + 2, this.COL.g[st === 'g' ? 0 : 1]);
    }
    if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------- 產生／回收
  _desired(e) {
    const lanes = e.oneway ? e.lanes : 2 * e.lanesDir;
    const n = e.len / 1000 * edgeDensity(e) * lanes * this.factor;
    const base = Math.floor(n);
    return base + (hash2(e.id, 3) < n - base ? 1 : 0);
  }

  _spawn(px, pz, initial) {
    const R = TRAFFIC.radius, minD = initial ? 22 : TRAFFIC.minSpawnDist;
    this.world.forEdgesNear(px, pz, R, (e) => {
      if (this.cars.length >= TRAFFIC.maxCars || e.tunnel && e.cls === 6) return;
      if (e.mx === undefined) { edgePoint(e, e.len / 2, _a); e.mx = _a.x; e.mz = _a.z; }
      if ((e.mx - px) ** 2 + (e.mz - pz) ** 2 > R * R) return;
      const want = this._desired(e);
      if (e.cars.length >= want) return;
      const s0 = e.trimA + 4, s1 = e.len - e.trimB - 4; if (s1 - s0 < 5) return;
      const dir = e.oneway ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const lane = Math.floor(Math.random() * e.lanesDir), s = s0 + Math.random() * (s1 - s0);
      edgePoint(e, s, _a);
      if ((_a.x - px) ** 2 + (_a.z - pz) ** 2 < minD * minD) return;
      for (const c of e.cars) if (c.dir === dir && c.lane === lane && Math.abs(c.s - s) < 9) return;
      const flyer = this.cars.filter(c => c.flyer).length < this.NF && Math.random() < this.flyerRate;
      const taxi = !flyer && Math.random() < 0.13;
      const car = { e, dir, lane, s, v: e.speed / 3.6 * 0.6, fac: 0.78 + Math.random() * 0.24, x: 0, y: 0, z: 0, psi: 0, turn: null, next: null, wait: 0,
        color: flyer ? FLYER_COLORS[Math.floor(Math.random() * FLYER_COLORS.length)] : taxi ? TAXI_COLOR : TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)], scale: flyer ? 1 : 0.94 + Math.random() * 0.1,
        flyer, hop: null, hopCd: 5 + Math.random() * 10, wreck: 0, pitch: 0 };
      e.cars.push(car); this.cars.push(car);
      this._pose(car);
    });
  }

  _detach(c) { if (c.e) { const i = c.e.cars.indexOf(c); if (i >= 0) c.e.cars.splice(i, 1); } }

  // ------------------------------------------------------------- 行駛
  _pickNext(c) {
    const e = c.e, node = this.world.nodes.get(c.dir > 0 ? e.b : e.a);
    c.next = null; c.exit = false;
    // 實測用的通勤車：照導航路線走
    if (c.route) {
      const st = c.route[c.ri + 1]; if (!st) { c.arrived = true; return; }
      const e2 = this.world.edges.get(st.k); if (!e2 || e2.dead) return;
      edgePoint(e, c.dir > 0 ? e.len : 0, _a); edgePoint(e2, st.dir > 0 ? 0 : e2.len, _b);
      c.next = { e: e2, dir: st.dir, w: 1, dot: _a.dx * c.dir * _b.dx * st.dir + _a.dz * c.dir * _b.dz * st.dir };
      return;
    }
    // 地圖邊界的斷頭路（建圖時標記的）：不迴轉、不減速，開到盡頭就消失，避免回堵
    if (e.flags & (c.dir > 0 ? 32 : 16)) { c.exit = true; return; }
    if (!node) return;
    edgePoint(e, c.dir > 0 ? e.len : 0, _a);
    const hx = _a.dx * c.dir, hz = _a.dz * c.dir;
    let total = 0; const opts = [];
    for (const e2 of node.edges) {
      if (e2 === e || e2.dead) continue;
      let d2;
      if (e2.a === node.id) d2 = 1; else if (!e2.oneway) d2 = -1; else continue;
      if (e2.a === node.id && e2.b === node.id) continue;
      edgePoint(e2, d2 > 0 ? 0 : e2.len, _b);
      const dot = hx * _b.dx * d2 + hz * _b.dz * d2;
      let w = (0.12 + Math.max(0, dot)) ** 2;
      if (e2.cls === 6) w *= e.cls === 6 ? 1 : 0.06; else if (e2.cls === 5 && e.cls <= 4) w *= 0.22;
      opts.push({ e: e2, dir: d2, w, dot }); total += w;
    }
    if (!opts.length) { if (!e.oneway && node.edges.length === 1) c.next = { e, dir: -c.dir, dot: -1 }; return; }
    let r = Math.random() * total;
    for (const o of opts) { r -= o.w; if (r <= 0) { c.next = o; return; } }
    c.next = opts[opts.length - 1];
  }

  _pose(c) {
    if (c.turn) {
      const t = c.turn, u = t.u, k = 1 - u;
      c.x = k * k * t.x0 + 2 * k * u * t.x1 + u * u * t.x2; c.z = k * k * t.z0 + 2 * k * u * t.z1 + u * u * t.z2;
      c.y = t.y0 + (t.y2 - t.y0) * u;
      const dx = 2 * k * (t.x1 - t.x0) + 2 * u * (t.x2 - t.x1), dz = 2 * k * (t.z1 - t.z0) + 2 * u * (t.z2 - t.z1);
      if (dx * dx + dz * dz > 1e-6) c.psi = Math.atan2(-dx, -dz);
      return;
    }
    edgePoint(c.e, c.s, _a);
    const off = laneOffset(c.e, c.dir, c.lane);
    c.x = _a.x - _a.dz * off; c.z = _a.z + _a.dx * off; c.y = _a.y;
    c.psi = Math.atan2(-_a.dx * c.dir, -_a.dz * c.dir);
  }

  _startTurn(c) {
    const e = c.e, nx = c.next, e2 = nx.e, d2 = nx.dir;
    const lane2 = Math.min(c.lane, e2.lanesDir - 1);
    const sIn = d2 > 0 ? Math.min(e2.trimA, e2.len * 0.45) : e2.len - Math.min(e2.trimB, e2.len * 0.45);
    edgePoint(e, c.s, _a); const o1 = laneOffset(e, c.dir, c.lane);
    const x0 = _a.x - _a.dz * o1, z0 = _a.z + _a.dx * o1, y0 = _a.y, t0x = _a.dx * c.dir, t0z = _a.dz * c.dir;
    edgePoint(e2, sIn, _b); const o2 = laneOffset(e2, d2, lane2);
    const x2 = _b.x - _b.dz * o2, z2 = _b.z + _b.dx * o2, y2 = _b.y, t2x = _b.dx * d2, t2z = _b.dz * d2;
    this._detach(c);
    const chord = Math.hypot(x2 - x0, z2 - z0);
    c.e = e2; c.dir = d2; c.lane = lane2; c.s = sIn; e2.cars.push(c); c.next = null; c.wait = 0;
    if (chord < 0.8) { c.turn = null; return; }
    // 控制點：兩條切線的交點；幾乎平行或太遠時改用中點
    let x1 = (x0 + x2) / 2, z1 = (z0 + z2) / 2;
    const den = t0x * t2z - t0z * t2x;
    if (Math.abs(den) > 0.2) {
      const u = ((x2 - x0) * t2z - (z2 - z0) * t2x) / den;
      if (u > 0 && u < chord * 2.2) { x1 = x0 + t0x * u; z1 = z0 + t0z * u; }
    }
    const len = (Math.hypot(x1 - x0, z1 - z0) + Math.hypot(x2 - x1, z2 - z1) + chord) / 2;
    c.turn = { x0, z0, y0, x1, z1, x2, z2, y2, len: Math.max(1, len), u: 0, sharp: t0x * t2x + t0z * t2z };
  }

  update(dt, px, pz, obstacle, initial) {
    this.time += dt;
    this._spawnT -= dt;
    if (this._spawnT <= 0 || initial) { this._spawnT = 0.35; this._spawn(px, pz, initial); }
    this._sigT -= dt;
    if (this._sigT <= 0) { this._sigT = 0.4; this._refreshSignals(px, pz); }
    this._colorSignals();
    const D2 = TRAFFIC.despawn * TRAFFIC.despawn;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      let kill = !c.agent && (c.e.dead || (c.x - px) ** 2 + (c.z - pz) ** 2 > D2 && !initial);
      if (!kill) kill = this._drive(c, dt, obstacle) && !c.agent;
      if (kill) { this._detach(c); this.cars[i] = this.cars[this.cars.length - 1]; this.cars.pop(); }
    }
    let n = 0, nf = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      _e.set(c.pitch || 0, c.psi, c.roll || 0, 'YXZ'); _q.setFromEuler(_e); _v.set(c.x, c.y, c.z); _s.set(c.scale, c.scale, c.scale); _m.compose(_v, _q, _s);
      if (c.flyer && nf < this.NF) { this.fPaint.setMatrixAt(nf, _m); this.fTrim.setMatrixAt(nf, _m); this.fPaint.setColorAt(nf, c.color); nf++; }
      else { this.paint.setMatrixAt(n, _m); this.trim.setMatrixAt(n, _m); this.paint.setColorAt(n, c.color); n++; }
    }
    _s.set(1, 1, 1); _e.set(0, 0, 0, 'XYZ');
    this.paint.count = this.trim.count = n; this.fPaint.count = this.fTrim.count = nf;
    this.paint.instanceMatrix.needsUpdate = this.trim.instanceMatrix.needsUpdate = true;
    this.fPaint.instanceMatrix.needsUpdate = this.fTrim.instanceMatrix.needsUpdate = true;
    if (this.paint.instanceColor) this.paint.instanceColor.needsUpdate = true;
    if (this.fPaint.instanceColor) this.fPaint.instanceColor.needsUpdate = true;
  }

  /** 回傳 true 代表這輛車要被移除。 */
  _drive(c, dt, ob) {
    const e = c.e;
    if (c.hop) return this._hop(c, dt, ob);
    if (c.wreck > 0) { c.wreck -= dt; c.v = 0; c.wait = 0; this._pose(c); return false; }   // 撞成一團：停在原地一陣子
    if (c.hopCd > 0) c.hopCd -= dt;
    let vmax = e.speed / 3.6 * c.fac, gap = 1e9;
    // 玩家（車或人）擋在前面
    if (ob) for (const o of ob) {
      if (Math.abs(o.y - c.y) > 2.2) continue;
      const fx = -Math.sin(c.psi), fz = -Math.cos(c.psi), rx = o.x - c.x, rz = o.z - c.z;
      const ahead = rx * fx + rz * fz, lat = Math.abs(rx * -fz + rz * fx);
      // 橫向只看「會擋到這條車道」的距離（玩家車身半寬約 1 m＋自己半寬＋一點餘裕），對向車道的玩家不會讓對向車停下來
      if (ahead > 0 && ahead < 30 && lat < Math.min(o.r, 1.0) + 1.3) gap = Math.min(gap, ahead - o.r - 2.4);
    }
    if (c.turn) {
      const t = c.turn;
      vmax = Math.min(vmax, t.sharp > 0.8 ? 11 : t.sharp > 0.2 ? 6.5 : 5);
      for (const o of e.cars) if (o !== c && !o.turn && !o.hop && o.dir === c.dir && o.lane === c.lane) {
        const d = (o.s - c.s) * c.dir; if (d >= 0 && d < 20) gap = Math.min(gap, (1 - t.u) * t.len + d - 5.2);
      }
      c.v = this._speed(c.v, vmax, gap, dt);
      t.u += c.v * dt / t.len;
      if (t.u >= 1) c.turn = null;
      this._pose(c);
      return false;
    }
    if (!c.next) this._pickNext(c);
    const endS = c.dir > 0 ? e.len - e.trimB : e.trimA;
    const toEnd = (endS - c.s) * c.dir;
    // 前車
    let lead = 1e9;
    for (const o of e.cars) if (o !== c && o.dir === c.dir && o.lane === c.lane && !o.turn && !o.hop) {
      const d = (o.s - c.s) * c.dir; if (d > 0) { gap = Math.min(gap, d - 5.2); lead = Math.min(lead, d); }
    }
    // 飛天跑車：塞住不動、前面就有車，就升空飛越。落地點要有空位（同車道前後 4.8 m 內沒車）：
    // 先找「飛過路口、落在下一段路上」最遠的空位，沒有再找同一段路上的空位；直線距離最多約 60 m（10 台車）。
    if (c.flyer && c.hopCd <= 0 && c.wait > FLYER.wait && lead < 9 && (c.hopsLeft === undefined || c.hopsLeft > 0)) {
      const free = (ed, dir, lane, s1) => { for (const o of ed.cars) if (o !== c && o.dir === dir && o.lane === lane && Math.abs(o.s - s1) < 4.8) return false; return true; };
      let tgt = null;
      if (c.next && toEnd < FLYER.dist - 8) {
        const e2 = c.next.e, d2 = c.next.dir, l2 = Math.min(c.lane, e2.lanesDir - 1), sIn = d2 > 0 ? e2.trimA : e2.len - e2.trimB;
        for (let dd = FLYER.dist - toEnd; dd >= 6; dd -= 2) {
          const s2 = sIn + d2 * dd; if (s2 < 2 || s2 > e2.len - 2) continue;
          edgePoint(e2, s2, _b); const off = laneOffset(e2, d2, l2), x = _b.x - _b.dz * off, z = _b.z + _b.dx * off;
          if (Math.hypot(x - c.x, z - c.z) > FLYER.dist + 2) continue;
          if (free(e2, d2, l2, s2)) { tgt = { e: e2, dir: d2, lane: l2, s: s2, x, z, y: _b.y, psi: Math.atan2(-_b.dx * d2, -_b.dz * d2), next: true }; break; }
        }
      }
      if (!tgt) for (let d = Math.min(FLYER.dist, toEnd - 6); d >= 20; d -= 2) {
        const s1 = c.s + c.dir * d; if (!free(e, c.dir, c.lane, s1)) continue;
        edgePoint(e, s1, _b); const off = laneOffset(e, c.dir, c.lane);
        tgt = { e, dir: c.dir, lane: c.lane, s: s1, x: _b.x - _b.dz * off, z: _b.z + _b.dx * off, y: _b.y, psi: Math.atan2(-_b.dx * c.dir, -_b.dz * c.dir) }; break;
      }
      if (tgt) {
        const D = Math.hypot(tgt.x - c.x, tgt.z - c.z);
        c.hop = { t: 0, T: FLYER.time * Math.sqrt(Math.max(20, D) / FLYER.dist), x0: c.x, y0: c.y, z0: c.z, psi0: c.psi, D, tgt };
        c.hopCd = c.agent ? 5 : FLYER.cooldown; c.wait = 0; this.hops = (this.hops || 0) + 1; if (c.hopsLeft !== undefined) c.hopsLeft--; return false;
      }
    }
    if (c.next) {
      if (toEnd < 60) {
        const sig = this.signalFor(e, c.dir);
        if (sig === 'r' || (sig === 'y' && toEnd > c.v * 1.2)) gap = Math.min(gap, toEnd - 0.5);
        if (c.next.dot < 0.7 && toEnd < 22) vmax = Math.min(vmax, 5 + toEnd * 0.25);
        // 下一段路的入口被占住就先不進路口
        const e2 = c.next.e, d2 = c.next.dir, l2 = Math.min(c.lane, e2.lanesDir - 1), sIn = d2 > 0 ? e2.trimA : e2.len - e2.trimB;
        for (const o of e2.cars) if (o.dir === d2 && o.lane === l2 && !o.hop) { const d = (o.s - sIn) * d2; if (d > -2 && d < 8) gap = Math.min(gap, toEnd + d - 5); }
      }
    } else if (toEnd < 40 && !c.exit) gap = Math.min(gap, toEnd + 6);
    c.v = this._speed(c.v, vmax, gap, dt);
    if (c.v < 0.3) c.wait += dt; else c.wait = 0;
    c.s += c.v * dt * c.dir;
    if (toEnd <= 0.2 || (c.dir > 0 ? c.s >= endS : c.s <= endS)) {
      if (!c.next || c.next.e.dead) { if (c.agent) { c.s = endS; c.v = 0; c.next = null; this._pose(c); return false; } return true; }
      c.s = endS;
      this._startTurn(c);
      if (c.route) c.ri++;
    }
    this._pose(c);
    return c.wait > 45;
  }

  /** 飛越中：沿著車道往前飛（拋物線），落地時檢查有沒有壓到車。 */
  _hop(c, dt, ob) {
    const h = c.hop, g = h.tgt; h.t += dt;
    const u = Math.min(1, h.t / h.T), k = u * u * (3 - 2 * u);
    c.x = h.x0 + (g.x - h.x0) * u; c.z = h.z0 + (g.z - h.z0) * u;
    c.y = h.y0 + (g.y - h.y0) * u + 4 * FLYER.apex * u * (1 - u) * Math.sqrt(Math.max(20, h.D) / FLYER.dist);
    let dp = g.psi - h.psi0; dp = Math.atan2(Math.sin(dp), Math.cos(dp)); c.psi = h.psi0 + dp * k;
    c.pitch = (u - 0.5) * 0.35; c.v = h.D / h.T;
    if (u < 1) return false;
    // 落地：換到落地的那段路（飛過路口的話是下一段）
    c.hop = null; c.pitch = 0; c.v = 3; c.turn = null;
    if (g.e !== c.e) { this._detach(c); c.e = g.e; g.e.cars.push(c); if (c.route) c.ri++; }
    c.dir = g.dir; c.lane = g.lane; c.s = g.s; c.next = null;
    if (c.e.dead) return false;
    this._pose(c);
    // 落地時那裡剛好有車（飛的這幾秒有車開進來）：撞成一團
    for (const o of c.e.cars) if (o !== c && !o.hop && o.dir === c.dir && o.lane === c.lane && Math.abs(o.s - c.s) < 4.6) {
      c.wreck = o.wreck = 7; c.v = o.v = 0;
      this.events.push({ type: 'crash', x: c.x, y: c.y, z: c.z });
      break;
    }
    if (ob) for (const o of ob) if (o.r > 1.5 && Math.hypot(o.x - c.x, o.z - c.z) < 2.6 && Math.abs(o.y - c.y) < 1.6) {
      c.wreck = 7; c.v = 0; this.events.push({ type: 'hitPlayer', x: c.x, y: c.y, z: c.z });
    }
    return false;
  }

  _speed(v, vmax, gap, dt) {
    const safe = gap > 1e8 ? vmax : Math.sqrt(Math.max(0, 2 * 3.2 * gap));
    const target = Math.min(vmax, safe);
    if (gap < 0.3) return Math.max(0, v - 14 * dt);
    if (v > target) return Math.max(target, v - 7.5 * dt);
    return Math.min(target, v + 2.1 * dt);
  }
}
