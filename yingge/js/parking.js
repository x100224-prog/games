// 停車：路邊停車格（沿一般道路與巷道自動產生）、停車場車格與電動車專用格，以及停在格子裡的車。
import * as THREE from '../lib/three.module.min.js';
import { PARK } from './config.js';
import { edgePoint, hash2, srgb } from './world.js';
import { carGeometry, TRAFFIC_COLORS } from './vehicles.js';

const _a = { x: 0, y: 0, z: 0, dx: 0, dz: 0, i: 0 };
const _p = { x: 0, z: 0 };
const _surf = { y: 0, edge: null, s: 0, lat: 0, i: 0, t: 0, _d2: 0 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const WHITE = srgb(0.9, 0.9, 0.88), STRIP = srgb(0.30, 0.31, 0.33), EVG = srgb(0.16, 0.56, 0.38), EVL = srgb(0.78, 0.96, 0.84), POST = srgb(0.92, 0.94, 0.95), POSTTOP = srgb(0.2, 0.78, 0.5);

function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) {
    const ax = pts[j * 2], az = pts[j * 2 + 1], bx = pts[i * 2], bz = pts[i * 2 + 1];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

export class Parking {
  constructor(scene, world) {
    this.world = world; this.day = 1; this.pending = []; this._t = 0;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.matPost = new THREE.MeshLambertMaterial({ vertexColors: true });
    const g = carGeometry(); this.N = 240;
    this.paint = new THREE.InstancedMesh(g.paint, new THREE.MeshLambertMaterial(), this.N);
    this.trim = new THREE.InstancedMesh(g.trim, new THREE.MeshLambertMaterial({ vertexColors: true }), this.N);
    for (const m of [this.paint, this.trim]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.paint.setColorAt(0, TRAFFIC_COLORS[0]);
    this.parked = [];          // 目前畫出來的停放車輛（也用於碰撞）
    this.onDecorated = null;   // 每格完成佈置時的回呼
    world.onCellReady.push(c => { if (c.state === 'ready') this.pending.push(c); else c.bays = []; });
    world.onCellUnload.push(c => { const i = this.pending.indexOf(c); if (i >= 0) this.pending.splice(i, 1); });
  }

  setDay(day) {
    this.day = day;
    for (const c of this.world.cells.values()) if (c.bays) for (const b of c.bays) { b.reserved = false; this._occupy(b); }
  }

  _occupy(b) {
    const r = hash2(b.id * 7 + 13, this.day * 131 + 7);
    b.occupied = r < (b.type === 'ev' ? 0.12 : b.type === 'lot' ? PARK.lotOccupied : PARK.roadsideOccupied);
    b.flip = hash2(b.id, 5) < 0.12;
    b.color = TRAFFIC_COLORS[Math.floor(hash2(b.id, this.day) * TRAFFIC_COLORS.length)];
  }

  update(dt, px, pz) {
    // 佈置：等四周的小格都載入後才產生車格（需要鄰格的建物做碰撞檢查）
    for (let k = 0; k < this.pending.length; k++) {
      const c = this.pending[k], C = this.world.CELL;
      if (c.state !== 'ready') { this.pending.splice(k, 1); k--; continue; }
      if (!this.world.readyAround((c.cx + 0.5) * C, (c.cz + 0.5) * C, C * 0.6)) continue;
      this.pending.splice(k, 1);
      this._decorate(c);
      if (this.onDecorated) this.onDecorated(c);
      break;
    }
    this._t -= dt;
    if (this._t <= 0) { this._t = 0.5; this._refreshParked(px, pz); }
  }

  /** 該位置周圍的車格是否都已產生。 */
  readyAround(x, z, r) {
    const C = this.world.CELL;
    for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++)
      for (let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) {
        const c = this.world.cells.get(cx + ',' + cz); if (!c || !c.bays) return false;
      }
    return true;
  }

  _free(x, z, psi, len, wid, selfEdge, y = 0) {
    // 車格四角＋中心都不能壓到建物，也不能落在別條路的路面上
    const fx = -Math.sin(psi), fz = -Math.cos(psi), rx = Math.cos(psi), rz = -Math.sin(psi);
    for (const [u, w] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      _p.x = x + fx * u * len / 2 + rx * w * wid / 2; _p.z = z + fz * u * len / 2 + rz * w * wid / 2;
      const bx = _p.x, bz = _p.z;
      if (this.world.collide(_p, 0.25)) return false;
      const s = this.world.surfaceAt(bx, bz, y, _surf);
      if (s && s.edge !== selfEdge && Math.abs(s.y - y) < 1 && (u === 0 || s.edge.cls <= 5)) return false;
    }
    return true;
  }

  _decorate(cell) {
    const bays = []; cell.bays = bays;
    const P = [], N = [], Cc = [], I = [], pp = [], pn = [], pc = [], pi = [];
    const quad = (x, y, z, psi, len, wid, col) => {
      const fx = -Math.sin(psi), fz = -Math.cos(psi), rx = Math.cos(psi), rz = -Math.sin(psi), b = P.length / 3;
      for (const [u, w] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) { P.push(x + fx * u * len / 2 + rx * w * wid / 2, y, z + fz * u * len / 2 + rz * w * wid / 2); N.push(0, 1, 0); Cc.push(col[0], col[1], col[2]); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const outline = (b, col) => {
      const t = 0.11, fx = -Math.sin(b.psi), fz = -Math.cos(b.psi), rx = Math.cos(b.psi), rz = -Math.sin(b.psi), y = b.y + 0.15;
      quad(b.x + rx * (b.wid / 2), y, b.z + rz * (b.wid / 2), b.psi, b.len, t, col);
      quad(b.x - rx * (b.wid / 2), y, b.z - rz * (b.wid / 2), b.psi, b.len, t, col);
      quad(b.x + fx * (b.len / 2), y, b.z + fz * (b.len / 2), b.psi, t, b.wid, col);
      quad(b.x - fx * (b.len / 2), y, b.z - fz * (b.len / 2), b.psi, t, b.wid, col);
    };
    const post = (x, z, y0) => {
      const g = new THREE.BoxGeometry(0.32, 1.35, 0.22).toNonIndexed(), p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { pp.push(p.getX(i) + x, p.getY(i) + 0.68 + y0, p.getZ(i) + z); pn.push(n.getX(i), n.getY(i), n.getZ(i)); const top = p.getY(i) > 0.3; pc.push(...(top ? POSTTOP : POST)); }
    };

    // ---- 路邊停車格
    for (const e of cell.edges) {
      if ((e.cls !== 4 && e.cls !== 5) || e.bridge || e.tunnel || e.len < 26 || e.width < 4.4) continue;
      const sides = e.oneway ? [1] : [1, -1];
      const L = PARK.bayLen, W = PARK.bayWid;
      for (const side of sides) {
        let s = e.trimA + 6 + L / 2, block = 0;
        const end = e.len - e.trimB - 6 - L / 2;
        while (s < end) {
          block++;
          if (hash2(e.id * 3 + (side > 0 ? 1 : 2), block) > 0.6) { s += 14; continue; }
          for (let k = 0; k < 4 && s < end; k++, s += L + 0.25) {
            edgePoint(e, s, _a);
            const off = side * (e.hw + W / 2 + 0.05);
            const x = _a.x - _a.dz * off, z = _a.z + _a.dx * off;
            const psi = Math.atan2(-_a.dx * side, -_a.dz * side);
            if (!this._free(x, z, psi, L, W, e, _a.y)) continue;
            const b = { id: e.id * 64 + (side > 0 ? 0 : 32) + (bays.length & 31), type: 'road', x, y: _a.y, z, psi, len: L, wid: W, edge: e, cell, occupied: false };
            this._occupy(b); bays.push(b);
            quad(x, _a.y + 0.045, z, psi, L + 0.25, W + 0.1, STRIP);
            outline(b, WHITE);
          }
          s += 3;
        }
      }
    }

    // ---- 停車場：沿最長邊方向排車格，前幾格是電動車專用格
    for (const lot of cell.lots) {
      const pts = lot.pts, n = pts.length / 2; let best = 0, ux = 1, uz = 0, cx = 0, cz = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, dx = pts[j * 2] - pts[i * 2], dz = pts[j * 2 + 1] - pts[i * 2 + 1], l = Math.hypot(dx, dz);
        if (l > best) { best = l; ux = dx / l; uz = dz / l; }
        cx += pts[i * 2]; cz += pts[i * 2 + 1];
      }
      cx /= n; cz /= n;
      const vx = -uz, vz = ux;
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (let i = 0; i < n; i++) { const u = (pts[i * 2] - cx) * ux + (pts[i * 2 + 1] - cz) * uz, v = (pts[i * 2] - cx) * vx + (pts[i * 2 + 1] - cz) * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const L = PARK.lotBayLen, W = PARK.lotBayWid, lotBays = [];
      let row = 0;
      for (let v = v0 + 0.5 + L / 2; v < v1 - L / 2 && lotBays.length < 48; row++) {
        const facing = row % 2 ? 1 : -1;
        for (let u = u0 + 0.6 + W / 2; u < u1 - W / 2 && lotBays.length < 48; u += W) {
          const x = cx + ux * u + vx * v, z = cz + uz * u + vz * v;
          let ok = true;
          for (const [du, dv] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const qx = x + ux * du * W / 2 + vx * dv * L / 2, qz = z + uz * du * W / 2 + vz * dv * L / 2;
            if (!inPoly(pts, qx, qz)) { ok = false; break; }
          }
          if (!ok) continue;
          const psi = Math.atan2(-vx * facing, -vz * facing);
          if (!this._free(x, z, psi, L, W, null, lot.lv)) continue;
          lotBays.push({ id: (lot.id + 1) * 4096 + lotBays.length, type: 'lot', x, y: lot.lv, z, psi, len: L, wid: W, lot, cell, occupied: false });
        }
        v += row % 2 ? L + 6.4 : L;
      }
      const evN = lotBays.length >= 3 ? Math.min(6, Math.max(2, Math.round(lotBays.length * 0.2))) : 0;
      lotBays.forEach((b, i) => {
        if (i < evN) b.type = 'ev';
        this._occupy(b); bays.push(b);
        if (b.type === 'ev') {
          quad(b.x, b.y + 0.05, b.z, b.psi, b.len - 0.1, b.wid - 0.1, EVG); outline(b, EVL);
          post(b.x - Math.sin(b.psi) * (b.len / 2 + 0.35), b.z - Math.cos(b.psi) * (b.len / 2 + 0.35), b.y);
        } else outline(b, WHITE);
      });
      lot.bays = lotBays;
    }

    for (const arr of [P, pp]) for (let i = 0; i < arr.length; i += 3) { arr[i] -= cell.ox; arr[i + 2] -= cell.oz; }
    if (I.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
      const m = new THREE.Mesh(g, this.mat); m.renderOrder = 2; cell.group.add(m);
    }
    if (pp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(pn, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
      cell.group.add(new THREE.Mesh(g, this.matPost));
    }
    void pi;
  }

  _refreshParked(px, pz) {
    const list = [], R = 230, C = this.world.CELL;
    for (let cx = Math.floor((px - R) / C); cx <= Math.floor((px + R) / C); cx++)
      for (let cz = Math.floor((pz - R) / C); cz <= Math.floor((pz + R) / C); cz++) {
        const c = this.world.cells.get(cx + ',' + cz); if (!c || !c.bays) continue;
        for (const b of c.bays) {
          if (!b.occupied || b.reserved) continue;
          const d2 = (b.x - px) ** 2 + (b.z - pz) ** 2;
          if (d2 < R * R) { b._d2 = d2; list.push(b); }
        }
      }
    list.sort((a, b) => a._d2 - b._d2); list.length = Math.min(list.length, this.N);
    this.parked = list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i]; b.psiCar = b.psi + (b.flip ? Math.PI : 0);
      _e.set(0, b.psiCar, 0); _q.setFromEuler(_e); _v.set(b.x, b.y, b.z); _m.compose(_v, _q, _s);
      this.paint.setMatrixAt(i, _m); this.trim.setMatrixAt(i, _m); this.paint.setColorAt(i, b.color);
    }
    this.paint.count = this.trim.count = list.length;
    this.paint.instanceMatrix.needsUpdate = this.trim.instanceMatrix.needsUpdate = true;
    if (this.paint.instanceColor) this.paint.instanceColor.needsUpdate = true;
  }

  forBaysNear(x, z, r, fn) {
    const C = this.world.CELL;
    for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++)
      for (let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) {
        const c = this.world.cells.get(cx + ',' + cz); if (!c || !c.bays) continue;
        for (const b of c.bays) { const d2 = (b.x - x) ** 2 + (b.z - z) ** 2; if (d2 <= r * r) fn(b, d2); }
      }
  }

  /** 車子中心 (x,z) 所在的車格；out 會寫入 { along, lat, ang } 誤差。 */
  bayAt(x, z, psi, out) {
    let best = null, bd = 1e9;
    this.forBaysNear(x, z, 6, (b, d2) => {
      const fx = -Math.sin(b.psi), fz = -Math.cos(b.psi);
      const along = (x - b.x) * fx + (z - b.z) * fz, lat = (x - b.x) * Math.cos(b.psi) + (z - b.z) * -Math.sin(b.psi);
      if (Math.abs(along) > b.len / 2 || Math.abs(lat) > b.wid / 2) return;
      if (d2 < bd) {
        bd = d2; best = b;
        let da = (psi - b.psi) % Math.PI; if (da > Math.PI / 2) da -= Math.PI; if (da < -Math.PI / 2) da += Math.PI;
        out.along = along; out.lat = lat; out.ang = da;
      }
    });
    return best;
  }

  /** (x,z) 是否在某個停車場範圍內。 */
  inLot(x, z) {
    const c = this.world.cellAt(x, z); if (!c) return false;
    for (const lot of c.lots) if (inPoly(lot.pts, x, z)) return true;
    return false;
  }

  /** 挑一個離 (x,z) 不遠的路邊車格當作今天車子停的位置。 */
  pickHomeBay(x, z, day) {
    const cand = [];
    this.forBaysNear(x, z, 190, (b, d2) => { if (b.type === 'road' && d2 > 12 * 12) cand.push(b); });
    if (!cand.length) return null;
    cand.sort((a, b) => a.id - b.id);
    const b = cand[Math.floor(hash2(day * 977 + 3, cand.length) * cand.length)];
    b.reserved = true; b.occupied = false;
    return b;
  }

  /** 目的地附近至少留幾個空的路邊車格（電動車另外有專用格）。 */
  ensureFreeNear(x, z, want = 3) {
    const road = [];
    this.forBaysNear(x, z, 260, (b, d2) => { if (b.type === 'road') { b._d2 = d2; road.push(b); } });
    let free = road.filter(b => !b.occupied).length;
    road.sort((a, b) => a._d2 - b._d2);
    for (const b of road) { if (free >= want) break; if (b.occupied && b._d2 > 30 * 30) { b.occupied = false; free++; } }
  }
}
