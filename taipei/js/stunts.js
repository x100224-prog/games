// 飛天跑車的特技（2026/10/15 發表會上的動作，遊戲裡誇張一點）：
//  ・推進器（Shift）：約 1 秒從 0 加速到 100 km/h
//  ・飛越（F）：車底推進器垂直升空，再往前飛約 60 m（10 台車的距離）落地；塞車停著也能飛
//  ・空中翻轉（T）：在空中滾一圈，落地前要轉正，不然會撞壞
//  ・吸附（G）：面向大樓外牆按 G，車底風扇把車吸在牆上，可以一路往上開到屋頂（屋頂邊緣按 G 也能沿外牆開下來）；
//    在高架橋正下方按 G，翻上去吸在橋底倒著開。再按一次 G（或 F）脫離：從牆上跳開、從橋底翻轉落地
//  垂直開、倒著開、飛越、推進器、翻轉都要用壓縮空氣（空氣罐）；空氣用完，這些特殊功能就停用，要補氣才能再用。
//  空氣罐的容量、能跳幾次、怎麼補充都是遊戲設定（見 economy.js 的 AIR），Tesla 沒有公布。
//  特技時自動切到車外視角（地平線保持水平），落地後回到駕駛座。
import * as THREE from '../lib/three.module.min.js';
import { edgePoint, hash2 } from './world.js';
import { AIR } from './economy.js';

export const STUNT = {
  g: 9.8,
  boostAcc: 19, boostTop: 250 / 3.6, boostFuel: 0.05,      // 推進器：每秒用掉燃料箱的 5%
  hopDist: 60, hopApex: 10, hopFuel: 1 / AIR.jumpsPerTank,  // 飛越 10 台車（約 60 m），最高 10 m；滿罐可飛 8 次（遊戲設定）
  flipTime: 0.9, flipFuel: 0.03,
  wallSpeed: 13, wallFuel: 0.02, climbFuel: 0.0015,        // 垂直開：每秒 2%，每往上 1 m 再 0.15%
  underSpeed: 22, underFuel: 0.02, underMin: 3.9, underDrop: 3.4,   // 橋底倒著開：每秒 2%；橋底離地至少 3.9 m 才吸得上去
  retroFuel: 0.04, airFuel: 0.01,                          // 落地前反推減速、空中加速
  crash: 300, hardCrash: 800,                              // 修車費（元）
};
const HALF_L = 2.15, HALF_W = 0.95;
const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m = new THREE.Matrix4();
const _pt = { x: 0, y: 0, z: 0, dx: 0, dz: 0, i: 0 }, _pt2 = { x: 0, y: 0, z: 0, dx: 0, dz: 0, i: 0 };
const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** 由「前方、車頂方向」算出車身的旋轉（車頭朝 -z、車頂 +y、右邊 +x）。 */
function basisQuat(fwd, up, out) {
  _v1.crossVectors(fwd, up).normalize();          // 右
  _v2.crossVectors(_v1, fwd).normalize();         // 重新正交化的車頂方向
  _v3.copy(fwd).negate();
  _m.makeBasis(_v1, _v2, _v3);
  return out.setFromRotationMatrix(_m);
}
/** 一般行駛姿態：偏航 psi、繞車頭方向滾轉 roll。 */
function yawRollQuat(psi, roll, out, pitch = 0) {
  return out.setFromEuler(new THREE.Euler(pitch, psi, roll, 'YXZ'));
}

export class Stunts {
  /**
   * hooks：{ fuel() → 0..1, burn(frac) → 是否成功, toast(msg, sec), crash(fee, msg), bump(strength) }
   */
  constructor(car, world, hooks) {
    this.car = car; this.world = world; this.h = hooks;
    this.mode = 'ground';
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.q = new THREE.Quaternion();
    this.psi = 0; this.roll = 0; this.flip = null; this.att = null; this.tw = null;
    this.camHold = 0; this.thrust = 0; this.down = 0; this.suction = 0; this.hopT = 9;
    this.cp = null; this.stats = { hops: 0, flips: 0, wallUp: 0, underM: 0, boostS: 0, crashes: 0, roofs: 0 };
    this.traffic = null;
  }

  reset() {
    this.mode = 'ground'; this.tw = null; this.flip = null; this.att = null; this.camHold = 0; this.cp = null; this.roll = 0; this.hopT = 9; this.hopV = 0;
    this.thrust = 0; this.down = 0; this.suction = 0; this._visual(0);
  }

  /** 特技中（自動切車外視角）。 */
  get external() { return (this.mode !== 'ground' && this.mode !== 'roof') || this.camHold > 0; }
  get busy() { return this.mode !== 'ground'; }
  label() {
    if (this.mode === 'ground' && this.h.fuel() <= 1e-4) return '空氣用完・特殊功能暫停';
    return { ground: '', air: '飛行中', tween: '吸附中', wall: '垂直開', roof: '屋頂', under: '橋底倒著開' }[this.mode] || '';
  }

  // ================================================================ 每幀
  /** keys：{ boost（按住）, jump, grip, flip（剛按下） }。車子的位置由這裡負責更新。 */
  update(dt, ctl, keys, obstacles, traffic) {
    this.traffic = traffic; this.obst = obstacles; this._dt = dt;
    this.camHold = Math.max(0, this.camHold - dt);
    this.thrust = 0; this.down = 0; this.suction = 0; this.side = 0; this.front = 0;   // 各方向噴氣的強度（0..1；side：正＝右側噴、負＝左側噴）
    const c = this.car, ox = c.x, oz = c.z;
    if (this.mode !== 'ground') { c.thrF = ctl.throttle || 0; c.brkF = ctl.brake || 0; }
    this._emptyT = Math.max(0, (this._emptyT || 0) - dt);
    switch (this.mode) {
      case 'ground': {
        if (keys.jump && this._startHop()) break;
        if (keys.grip && this._tryGrip()) break;
        c.update(dt, ctl, obstacles);
        this._boost(dt, ctl, keys);
        // 開車時車上的小壓縮機慢慢補氣（遊戲設定）
        const moved = Math.hypot(c.x - ox, c.z - oz);
        if (moved > 0 && moved < 5 && this.h.regen) this.h.regen(moved);
        break;
      }
      case 'air': this._air(dt, ctl, keys); break;
      case 'tween': this._tween(dt); break;
      case 'wall': this._wall(dt, ctl, keys); break;
      case 'roof': this._roof(dt, ctl, keys); break;
      case 'under': this._under(dt, ctl, keys); break;
    }
    if (this.mode !== 'ground') c.odo += Math.hypot(c.x - ox, c.z - oz);
    this._visual(dt);
  }

  // ================================================================ 地面：推進器
  _boost(dt, ctl, keys) {
    const c = this.car;
    if (keys.boost && ctl.throttle > 0.05 && this.h.fuel() <= 1e-4) this._empty();
    if (keys.boost && ctl.throttle > 0.05 && c.v >= -0.5 && this.h.fuel() > 0) {
      if (this.h.burn(STUNT.boostFuel * dt)) { c.v = Math.min(STUNT.boostTop, c.v + STUNT.boostAcc * dt); this.thrust = 1; this.stats.boostS += dt; }
    } else if (c.v > c.spec.maxSpeed) c.v -= Math.min(c.v - c.spec.maxSpeed, 4 * dt);
  }

  // ================================================================ 飛越（垂直升空）
  _startHop(fromRoof = false) {
    const c = this.car;
    if (!fromRoof && c.edge && c.edge.tunnel) { this.h.toast('隧道裡不能飛', 1.6); return false; }
    if (!fromRoof) {
      const d = this._deckAbove(c.x, c.z, c.y, 0.5);
      if (d && d.soffit - c.y < 12) { this.h.toast('上方有高架橋，不能往上飛（可以按 G 吸到橋底）', 2.2); return false; }
    }
    if (!this.h.burn(STUNT.hopFuel)) { this._empty(`壓縮空氣不夠飛一次（每次要 1/${AIR.jumpsPerTank} 罐）`); return false; }
    const g = STUNT.g, H = STUNT.hopApex, T = 2 * Math.sqrt(2 * H / g);
    const vNow = fromRoof ? this.rv || 0 : c.v;
    this.pos.set(c.x, c.y, c.z); this.psi = c.psi;
    const v0 = Math.max(0, vNow) * 0.35;                    // 先垂直升空，水平速度在前 0.8 秒推上去
    this.vel.set(c.fwdX * v0, Math.sqrt(2 * g * H), c.fwdZ * v0);
    this.hopV = Math.max(Math.max(0, vNow), STUNT.hopDist / (T - 0.45)); this.hopT = 0;
    this.roll = 0; this.flip = null; this.att = null;
    this.mode = 'air'; this.stats.hops++;
    return true;
  }

  _air(dt, ctl, keys) {
    const p = this.pos, v = this.vel, g = STUNT.g;
    this.hopT += dt;
    // 前 0.8 秒：往前推（飛越）；之後玩家可以用 W/S 微調、A/D 轉向
    let fx = -Math.sin(this.psi), fz = -Math.cos(this.psi);
    if (this.hopT < 0.8 && this.hopV) {
      const along = v.x * fx + v.z * fz, add = Math.min(Math.max(0, this.hopV - along), 30 * dt);
      v.x += fx * add; v.z += fz * add; this.thrust = 1; this.down = 1;
    }
    const dPsi = (ctl.steer || 0) * 0.9 * dt;
    if (dPsi) {
      const cs = Math.cos(dPsi), sn = Math.sin(dPsi), x = v.x, z = v.z;
      v.x = x * cs + z * sn; v.z = -x * sn + z * cs; this.psi += dPsi;
      fx = -Math.sin(this.psi); fz = -Math.cos(this.psi);
    }
    let along = v.x * fx + v.z * fz;
    const latX = v.x - fx * along, latZ = v.z - fz * along;
    if (ctl.throttle > 0.05 && this.hopT > 0.8 && this.h.burn(STUNT.airFuel * dt)) { along += 6 * dt; this.thrust = Math.max(this.thrust, 0.6); }
    if (ctl.brake > 0.05 && along > 0.5) { along = Math.max(0, along - 8 * dt); this.front = 1; }   // 空中減速：車頭往前噴
    if (Math.abs(ctl.steer || 0) > 0.1) this.side = -Math.sign(ctl.steer) * 0.6;                   // 空中轉向：往左轉時右側噴
    const kl = Math.max(0, 1 - dt * 1.5);
    v.x = fx * along + latX * kl; v.z = fz * along + latZ * kl;
    v.y -= g * dt;
    // 空中翻轉
    if (keys.flip && !this.flip && !this.att) {
      if (this.h.burn(STUNT.flipFuel)) this.flip = { t: 0, dir: (ctl.steer || 0) > 0.1 ? -1 : 1 };
      else this._empty('壓縮空氣不夠，不能翻轉');
    }
    if (this.flip) {
      this.flip.t += dt; this.side = this.flip.dir;   // 翻轉時一側噴氣
      const u = this.flip.t / STUNT.flipTime;
      this.roll = this.flip.dir * Math.PI * 2 * ease(u);
      if (u >= 1) { this.roll = 0; this.flip = null; this.stats.flips++; }
    }
    // 落地前反推（有燃料才有）：讓落地輕一點
    const below = this._below(p.x, p.z, p.y);
    const hgt = p.y - below.y;
    // 飛越的反推已經含在那 1/8 罐裡；從牆上、屋頂、橋底掉下來的反推另外用空氣（沒空氣就不會減速）
    if (v.y < -3 && hgt < v.y * v.y / (2 * 10) + 1.2 && (this.hopV ? true : this.h.fuel() > 0 && this.h.burn(STUNT.retroFuel * dt))) {
      v.y = Math.min(-2.5, v.y + (g + 10) * dt); this.down = 1;
    }
    // 移動＋碰撞
    let nx = p.x + v.x * dt, ny = p.y + v.y * dt, nz = p.z + v.z * dt;
    const b = this.world.buildingAt(nx, nz);
    if (b && ny < b.y0 + b.h - 0.05 && p.y < b.y0 + b.h - 0.05) {
      // 撞到大樓外牆：按 G 可以直接吸上去
      const w = this._wallAt(b, p.x, p.z);
      if (keys.grip && w && this._gripWall(w, p.y)) return;
      if (w) {
        const vn = v.x * w.nx + v.z * w.nz;
        if (vn < 0) { v.x -= w.nx * vn * 1.4; v.z -= w.nz * vn * 1.4; }
        if (-vn > 9) this._crash(STUNT.crash, '撞到大樓外牆！');
        else this.h.bump(0.8);
      }
      nx = p.x; nz = p.z;
    }
    // 橋底：往上飛撞到高架橋
    const deck = this._deckAbove(nx, nz, p.y, 0);
    if (deck && v.y > 0 && ny + 1.3 > deck.soffit && p.y < deck.soffit) {
      if (keys.grip) { /* 空中靠近橋底也能吸上去 */ }
      v.y = -Math.abs(v.y) * 0.25; ny = Math.min(ny, deck.soffit - 1.35); this.h.bump(0.6); this.h.toast('撞到高架橋底', 1.2);
    }
    // 空中跟別台飛天跑車相撞
    if (this.traffic) for (const o of this.traffic.cars) {
      if (!o.hop || Math.abs(o.x - nx) > 3 || Math.abs(o.z - nz) > 3) continue;
      if (Math.hypot(o.x - nx, o.z - nz) < 2.4 && Math.abs(o.y - ny) < 1.5) {
        o.hop = null; o.pitch = 0; o.wreck = 7; o.v = 0;
        v.x *= -0.3; v.z *= -0.3; v.y = Math.min(v.y, 0);
        this._crash(STUNT.crash, '在空中跟另一台飛天跑車相撞！');
        break;
      }
    }
    // 空中靠近牆面按 G：吸上去
    if (keys.grip) { const w = this._wallAhead(p.x, p.z, this.psi, 4.5, p.y); if (w && this._gripWall(w, p.y)) return; }
    // 落地：新位置上、不高於原本高度的最高表面（一幀掉很多也不會穿過去）
    const bl = this._below(nx, nz, Math.max(p.y, ny) + 0.01);
    p.set(nx, ny, nz);
    if (p.y <= bl.y + 0.01 && v.y <= 0) { this._land(bl); return; }
    this._pose();
  }

  _land(bl) {
    const c = this.car, p = this.pos, v = this.vel;
    p.y = bl.y;
    const upright = !this.flip && Math.abs(wrapPi(this.roll)) < 0.5 && (!this.att || this.att.t / this.att.T > 0.8);
    let hitCar = null;
    if (this.obst) for (const o of this.obst) if (Math.abs((o.y || 0) - bl.y) < 1.6 && Math.hypot(o.x - p.x, o.z - p.z) < 2.6) { hitCar = o; break; }
    const fx = -Math.sin(this.psi), fz = -Math.cos(this.psi), along = v.x * fx + v.z * fz, vy = v.y;
    this.flip = null; this.att = null; this.roll = 0;
    c.x = p.x; c.y = p.y; c.z = p.z; c.psi = this.psi; c.pitch = 0; c.steer = 0; c.edge = null;
    c.v = Math.max(0, along);
    this.camHold = 0.9;
    if (bl.kind === 'roof') { this.mode = 'roof'; this.roofB = bl.b; this.rv = c.v; this.stats.roofs++; }
    else this.mode = 'ground';
    if (!upright) { c.v = 0; this.rv = 0; this._crash(STUNT.hardCrash, '沒轉正就落地，翻車了！'); }
    else if (hitCar) { c.v = 0; this.rv = 0; if (hitCar.v !== undefined) { hitCar.v = 0; hitCar.wreck = 6; } this._crash(STUNT.crash, '落地壓到車了！'); }
    else if (vy < -12) this._crash(STUNT.crash, '落地太用力，底盤撞壞了');
    if (this.mode === 'ground') c.sync();
    else this._pose();
  }

  // ================================================================ 吸附：判斷要吸牆還是橋底
  _tryGrip() {
    const c = this.car;
    const d = this._deckAbove(c.x, c.z, c.y, STUNT.underMin);
    if (d) {
      edgePoint(d.e, d.s, _pt);
      const dot = c.fwdX * _pt.dx + c.fwdZ * _pt.dz;
      if (Math.abs(dot) >= 0.7) return this._gripUnder(d, dot > 0 ? 1 : -1);
      this.h.toast('車頭要對齊高架橋的方向才能吸到橋底', 2); return false;
    }
    const w = this._wallAhead(c.x, c.z, c.psi, 5.5, c.y);
    if (w) return this._gripWall(w, c.y);
    this.h.toast('要面向大樓外牆（5 m 內），或停在高架橋正下方，才能按 G 吸附', 2.6);
    return false;
  }

  // ================================================================ 大樓外牆
  /** 最接近 (x,z) 的牆面（建物多邊形的一邊），法線朝外。 */
  _wallAt(b, x, z) {
    const p = b.pts, n = p.length / 2;
    let best = null, bd = 1e18;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      if (L2 < 1) continue;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t, d2 = (x - qx) ** 2 + (z - qz) ** 2;
      if (d2 < bd) { bd = d2; best = { ax, az, bx, bz, t, qx, qz }; }
    }
    if (!best) return null;
    const L = Math.hypot(best.bx - best.ax, best.bz - best.az), tx = (best.bx - best.ax) / L, tz = (best.bz - best.az) / L;
    // 法線：兩種方向試一下，指向建物外面的那個
    let nx = -tz, nz = tx;
    const mx = best.qx + nx * 0.6, mz = best.qz + nz * 0.6;
    if (this.world.buildingAt(mx, mz) === b) { nx = -nx; nz = -nz; }
    return { b, ax: best.ax, az: best.az, tx, tz, L, u: best.t * L, nx, nz, dist: Math.sqrt(bd), top: b.y0 + b.h };
  }
  /** 車頭前方的牆（面向牆、夠近、夠高）。 */
  _wallAhead(x, z, psi, maxD, y) {
    const fx = -Math.sin(psi), fz = -Math.cos(psi);
    for (let d = 1.2; d <= maxD + HALF_L; d += 0.8) {
      const b = this.world.buildingAt(x + fx * d, z + fz * d);
      if (!b || b.h < 6 || (y !== undefined && y > b.y0 + b.h - 2)) continue;
      const w = this._wallAt(b, x, z); if (!w) return null;
      if (w.dist > maxD + HALF_L || -(fx * w.nx + fz * w.nz) < 0.5 || w.L < 3) return null;
      return w;
    }
    return null;
  }

  _gripWall(w, y) {
    if (!this.h.burn(0.01)) { this._empty('壓縮空氣不夠，吸不住'); return false; }
    const ground = this.world.groundAt(w.ax + w.tx * w.u, w.az + w.tz * w.u, y);
    this.wl = { w, u: Math.max(1.0, Math.min(w.L - 1.0, w.u)), y: Math.max(y + 1.0, ground + HALF_L + 0.1), th: 0, v: Math.max(3, Math.min(10, Math.abs(this.car.v) * 0.6)) };
    // 左右方向：車頭朝上時，車子的右邊是 (上 × 牆法線)
    this.wl.sg = Math.sign(w.nz * w.tx - w.nx * w.tz) || 1;
    this._startTween('wall', this._wallPose(), 0.55);
    this.h.toast('吸住了！W 往上開，A/D 轉向，G 跳離牆面', 2.5);
    return true;
  }
  _wallPose(out = {}) {
    const wl = this.wl, w = wl.w, s = Math.sin(wl.th), c = Math.cos(wl.th);
    out.x = w.ax + w.tx * wl.u + w.nx * 0.02; out.z = w.az + w.tz * wl.u + w.nz * 0.02; out.y = wl.y;
    out.q = out.q || new THREE.Quaternion();
    basisQuat(_v1.set(w.tx * s, c, w.tz * s).clone(), new THREE.Vector3(w.nx, 0, w.nz), out.q);
    out.psi = Math.atan2(w.nx, w.nz);
    return out;
  }
  _wall(dt, ctl, keys) {
    const wl = this.wl, w = wl.w;
    if (keys.grip || keys.jump) { this._leaveWall(); return; }
    if (!this.h.burn(STUNT.wallFuel * dt)) { this._empty('壓縮空氣用完，吸不住了！'); this._leaveWall(); return; }
    this.suction = 1;
    const c = Math.cos(wl.th), s = Math.sin(wl.th);
    let a = (ctl.throttle || 0) * 7 - (ctl.brake || 0) * (wl.v > 0 ? 10 : 4) - 2.2 * c;
    if (!(ctl.throttle > 0.05) && !(ctl.brake > 0.05) && Math.abs(wl.v) < 0.6) { a = 0; wl.v = 0; }
    wl.v = Math.max(-5, Math.min(STUNT.wallSpeed, wl.v + a * dt));
    wl.th += -(ctl.steer || 0) * 1.4 * dt * wl.sg * (wl.v >= 0 ? 1 : -1);
    const du = wl.v * s * dt, dy = wl.v * c * dt;
    if (dy > 0) { this.h.burn(STUNT.climbFuel * dy); this.stats.wallUp += dy; }
    wl.u += du;
    if (wl.u < 1.0 || wl.u > w.L - 1.0) { wl.u = Math.max(1.0, Math.min(w.L - 1.0, wl.u)); wl.v *= Math.max(0, 1 - dt * 3); }
    wl.y += dy;
    const ground = this.world.groundAt(w.ax + w.tx * wl.u, w.az + w.tz * wl.u, wl.y);
    if (wl.y + HALF_L * c >= w.top - 0.1 && c > 0.3 && wl.v > 0) { this._wallToRoof(); return; }
    if (wl.y - HALF_L <= ground + 0.05) {
      if (c < -0.3 && wl.v > 0) { this._wallToGround(ground); return; }
      wl.y = ground + HALF_L + 0.05; if (wl.v < 0 && c > 0) wl.v = 0;
    }
    const ps = this._wallPose(this._wp || (this._wp = {}));
    this.pos.set(ps.x, ps.y, ps.z); this.q.copy(ps.q); this.psi = ps.psi;
    this._apply(Math.abs(wl.v));
  }
  _leaveWall() {
    const wl = this.wl, w = wl.w, ps = this._wallPose();
    this.pos.set(ps.x + w.nx * 1.2, ps.y, ps.z + w.nz * 1.2);
    this.vel.set(w.nx * 7, 3 + Math.max(0, wl.v * Math.cos(wl.th) * 0.5), w.nz * 7);
    this.psi = Math.atan2(-w.nx, -w.nz); this.roll = 0; this.flip = null; this.hopT = 9; this.hopV = 0;
    this.att = { q0: ps.q.clone(), t: 0, T: 0.7 };
    this.mode = 'air';
  }
  _wallToRoof() {
    const w = this.wl.w, u = this.wl.u, x = w.ax + w.tx * u - w.nx * 2.6, z = w.az + w.tz * u - w.nz * 2.6;
    const b2 = this.world.buildingAt(x, z) || w.b, psi = Math.atan2(w.nx, w.nz);
    this.roofB = b2; this.rv = 4; this.stats.roofs++;
    this._startTween('roof', { x, y: b2.y0 + b2.h, z, psi, q: yawRollQuat(psi, 0, new THREE.Quaternion()) }, 0.6);
    this.h.toast('上到屋頂了！可以在屋頂開、按 F 飛下去，或在邊緣按 G 沿外牆開下去', 3);
  }
  _wallToGround(ground) {
    const w = this.wl.w, u = this.wl.u, x = w.ax + w.tx * u + w.nx * (HALF_L + 0.4), z = w.az + w.tz * u + w.nz * (HALF_L + 0.4);
    const psi = Math.atan2(-w.nx, -w.nz);
    this.groundV = Math.max(2, this.wl.v * 0.6);
    this._startTween('ground', { x, y: this.world.groundAt(x, z, ground), z, psi, q: yawRollQuat(psi, 0, new THREE.Quaternion()) }, 0.5);
  }

  // ================================================================ 屋頂
  _roof(dt, ctl, keys) {
    const c = this.car, b = this.roofB;
    if (keys.jump && this._startHop(true)) return;
    if (keys.grip) {
      // 屋頂邊緣、車頭朝外：沿著外牆開下去
      const w = this._wallAt(b, c.x, c.z);
      if (w && w.dist < 3.5 && (c.fwdX * w.nx + c.fwdZ * w.nz) > 0.5 && this.h.burn(0.01)) {
        this.wl = { w, u: Math.max(1, Math.min(w.L - 1, w.u)), y: w.top - HALF_L - 0.2, th: Math.PI, v: 3 };
        this.wl.sg = Math.sign(w.nz * w.tx - w.nx * w.tz) || 1;
        this._startTween('wall', this._wallPose(), 0.6);
        this.h.toast('沿著外牆往下開（W 前進，G 跳離）', 2.2);
        return;
      }
      this.h.toast('開到屋頂邊緣、車頭朝外再按 G，就能沿外牆開下去', 2.2);
    }
    let a = (ctl.throttle || 0) * 6 - (ctl.brake || 0) * (this.rv > 0.3 ? 9 : 3);
    if (!(ctl.throttle > 0.05) && !(ctl.brake > 0.05)) a = -Math.sign(this.rv) * Math.min(Math.abs(this.rv) / dt, 1.2);
    this.rv = Math.max(-4, Math.min(16, this.rv + a * dt));
    const st = (ctl.steer || 0) * Math.min(0.55, Math.atan(2.6 * 5.5 / Math.max(1, this.rv * this.rv)));
    c.steer += (st - c.steer) * Math.min(1, dt * 5);
    c.psi += this.rv / 2.6 * Math.tan(c.steer) * dt;
    const nx = c.x + c.fwdX * this.rv * dt, nz = c.z + c.fwdZ * this.rv * dt, top = b.y0 + b.h;
    const b2 = this.world.buildingAt(nx, nz);
    if (!b2 || Math.abs(b2.y0 + b2.h - top) > 1.5) {
      if (b2 && b2.y0 + b2.h > top) { this.rv = 0; this.h.bump(0.5); this._applyUpright(); return; }   // 旁邊的大樓比較高：擋住
      // 開出屋頂邊緣：掉下去（有燃料會反推減速）
      this.pos.set(nx, top, nz); this.psi = c.psi; this.vel.set(c.fwdX * Math.max(3, this.rv), 0, c.fwdZ * Math.max(3, this.rv));
      this.roll = 0; this.flip = null; this.att = null; this.hopT = 9; this.hopV = 0; this.mode = 'air';
      this.h.toast('衝出屋頂！', 1.2);
      return;
    }
    if (b2 !== b) this.roofB = b2;
    c.x = nx; c.z = nz; c.y = b2.y0 + b2.h; c.v = this.rv;
    this._applyUpright();
  }

  // ================================================================ 高架橋底倒著開
  /** (x,z) 正上方、橋底離 y 至少 minClear 的高架橋（取最低的那座）。 */
  _deckAbove(x, z, y, minClear) {
    const W = this.world, G = W.G, arr = W.segGrid.get(Math.floor(x / G) * 73856093 ^ Math.floor(z / G) * 19349663);
    if (!arr) return null;
    let best = null;
    for (let k = 0; k < arr.length; k++) {
      const { e, i } = arr[k]; if (!e.bridge || e.dead) continue;
      const p = e.pts, ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az, L2 = dx * dx + dz * dz || 1e-6;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t, d2 = (x - qx) ** 2 + (z - qz) ** 2;
      if (d2 > (e.hw - 0.4) ** 2) continue;
      const h = e.hs[i] + (e.hs[i + 1] - e.hs[i]) * t, rel = e.rel[i] + (e.rel[i + 1] - e.rel[i]) * t;
      if (rel < 1.5) continue;
      const soffit = h - Math.min(1.1, rel);
      if (soffit - y < minClear || soffit - y > 40) continue;
      if (!best || soffit < best.soffit) {
        const L = Math.sqrt(L2);
        best = { e, i, t, s: e.cum[i] + L * t, soffit, h, lat: ((x - ax) * -dz + (z - az) * dx) / L };
      }
    }
    return best;
  }
  _relAt(e, s) {
    edgePoint(e, s, _pt2);
    const i = _pt2.i, seg = e.cum[i + 1] - e.cum[i] || 1, t = (Math.max(0, Math.min(e.len, s)) - e.cum[i]) / seg;
    return { y: _pt2.y, rel: e.rel ? e.rel[i] + (e.rel[i + 1] - e.rel[i]) * t : 0, slope: (e.hs[i + 1] - e.hs[i]) / seg };
  }
  _gripUnder(d, dir) {
    if (!this.h.burn(0.015)) { this._empty('壓縮空氣不夠，吸不住'); return false; }
    // lat：在高架橋的哪一側（以行進方向為準，右邊為正）
    this.un = { e: d.e, s: d.s, dir, lat: d.lat * dir, v: Math.max(3, Math.min(14, this.car.v)), phi: 0 };
    // 橋墩在橋的正中間：吸上去時如果剛好在中線上，往比較近的一側偏開（橋夠寬的話）
    const pw = Math.min(2.2, Math.max(1.2, d.e.width * 0.16)), side = HALF_W + pw / 2 + 0.25;
    if (Math.abs(this.un.lat) < side && d.e.hw - 0.9 > side) this.un.lat = (this.un.lat >= 0 ? 1 : -1) * side;
    this.un.lat = Math.max(-(d.e.hw - 0.9), Math.min(d.e.hw - 0.9, this.un.lat));
    this._startTween('under', this._underPose(), 0.75, 2.5);
    this.h.toast('翻上去了！吸在高架橋底倒著開（W 前進，A/D 左右，G 翻轉落地）', 3);
    return true;
  }
  _underPose(out = {}) {
    const un = this.un, e = un.e;
    edgePoint(e, un.s, _pt);
    const r = this._relAt(e, un.s), tx = _pt.dx * un.dir, tz = _pt.dz * un.dir, rx = -tz, rz = tx;
    out.x = _pt.x + rx * un.lat; out.z = _pt.z + rz * un.lat; out.y = r.y - Math.min(1.1, r.rel);
    const c = Math.cos(un.phi), s = Math.sin(un.phi);
    const fx = tx * c + rx * s, fz = tz * c + rz * s;      // phi > 0：偏向行進方向的右邊
    const fwd = new THREE.Vector3(fx, r.slope * un.dir, fz).normalize();
    out.q = out.q || new THREE.Quaternion();
    basisQuat(fwd, new THREE.Vector3(0, -1, 0), out.q);
    out.psi = Math.atan2(-fx, -fz); out.fx = fx; out.fz = fz; out.rel = r.rel; out.ground = r.y - r.rel;
    return out;
  }
  _piers(e) {
    if (e._piers) return e._piers;
    const out = [], step = 34;
    for (let s = step * (0.3 + hash2(e.id, 7) * 0.5); s < e.len; s += step) {
      const r = this._relAt(e, s); if (r.rel < 3.2) continue;
      out.push({ s, pw: Math.min(2.2, Math.max(1.2, e.width * 0.16)) });
    }
    return (e._piers = out);
  }
  _nextBridge(e, dir) {
    const node = this.world.nodes.get(dir > 0 ? e.b : e.a); if (!node) return null;
    edgePoint(e, dir > 0 ? e.len : 0, _pt);
    const tx = _pt.dx * dir, tz = _pt.dz * dir;
    let best = null;
    for (const e2 of node.edges) {
      if (e2 === e || !e2.bridge || e2.dead) continue;
      const d2 = e2.a === node.id ? 1 : e2.b === node.id ? -1 : 0; if (!d2) continue;
      edgePoint(e2, d2 > 0 ? 0 : e2.len, _pt2);
      const dot = tx * _pt2.dx * d2 + tz * _pt2.dz * d2;
      if (dot > 0.75 && (!best || dot > best.dot)) best = { e: e2, dir: d2, dot };
    }
    return best;
  }
  _under(dt, ctl, keys) {
    const un = this.un;
    if (keys.grip || keys.jump) { this._dropUnder(); return; }
    if (!this.h.burn(STUNT.underFuel * dt)) { this._empty('壓縮空氣用完，吸不住了！'); this._dropUnder(); return; }
    this.suction = 1;
    let a = (ctl.throttle || 0) * 7 - (ctl.brake || 0) * (un.v > 0.3 ? 10 : 3);
    if (!(ctl.throttle > 0.05) && !(ctl.brake > 0.05)) a = -Math.sign(un.v) * Math.min(Math.abs(un.v) / dt, 0.8);
    un.v = Math.max(-5, Math.min(STUNT.underSpeed, un.v + a * dt));
    // 從車外（下方後面）看：A 往畫面左邊、D 往畫面右邊
    const target = -(ctl.steer || 0) * 0.4;
    un.phi += (target - un.phi) * Math.min(1, dt * 3);
    un.s += un.dir * un.v * Math.cos(un.phi) * dt;
    un.lat += un.v * Math.sin(un.phi) * dt;
    this.stats.underM += Math.abs(un.v) * dt;
    // 接到下一段高架橋
    if (un.s > un.e.len || un.s < 0) {
      const over = un.s > un.e.len ? un.s - un.e.len : -un.s, nb = this._nextBridge(un.e, un.dir);
      if (!nb) { this.h.toast('高架橋到這裡結束，翻轉落地', 1.8); un.s = Math.max(0, Math.min(un.e.len, un.s)); this._dropUnder(); return; }
      un.e = nb.e; un.dir = nb.dir; un.s = nb.dir > 0 ? over : nb.e.len - over;
    }
    un.lat = Math.max(-(un.e.hw - 0.9), Math.min(un.e.hw - 0.9, un.lat));
    // 橋墩：在正中間，要閃開
    for (const pr of this._piers(un.e)) {
      const ds = un.s - pr.s;
      if (Math.abs(ds) < HALF_L + pr.pw / 2 && Math.abs(un.lat) < HALF_W + pr.pw / 2) {
        const sp0 = Math.abs(un.v);
        un.s = pr.s + Math.sign(ds || -un.dir) * (HALF_L + pr.pw / 2 + 0.05); un.v = 0;
        if (sp0 > 1) { this.h.bump(sp0 / 6); this.h.toast('撞到橋墩！往旁邊閃', 1.4); }
      }
    }
    const ps = this._underPose(this._up || (this._up = {}));
    if (ps.y - ps.ground < STUNT.underDrop) { this.h.toast('高架橋變低了，翻轉落地', 1.8); this._dropUnder(); return; }
    this.pos.set(ps.x, ps.y, ps.z); this.q.copy(ps.q); this.psi = ps.psi;
    this._apply(Math.abs(un.v));
  }
  _dropUnder() {
    const ps = this._underPose(), un = this.un;
    this.pos.set(ps.x, ps.y - 0.05, ps.z);
    this.vel.set(ps.fx * un.v * 0.9, -0.5, ps.fz * un.v * 0.9);
    this.psi = ps.psi; this.roll = 0; this.flip = null; this.hopT = 9; this.hopV = 0;
    this.att = { q0: ps.q.clone(), t: 0, T: 0.55 };
    this.mode = 'air';
  }

  // ================================================================ 轉換動畫（吸上牆、翻到橋底、上屋頂…）
  _startTween(next, to, T, arc = 0) {
    const c = this.car;
    const q0 = this.mode === 'ground' || this.mode === 'roof' ? yawRollQuat(c.psi, 0, new THREE.Quaternion()) : this.q.clone();
    this.tw = { next, t: 0, T, x0: c.x, y0: c.y, z0: c.z, q0, to, arc };
    this.mode = 'tween';
  }
  _tween(dt) {
    const tw = this.tw, c = this.car; tw.t += dt;
    const u = Math.min(1, tw.t / tw.T), k = ease(u), to = tw.to;
    this.pos.set(tw.x0 + (to.x - tw.x0) * k, tw.y0 + (to.y - tw.y0) * k + tw.arc * Math.sin(Math.PI * u), tw.z0 + (to.z - tw.z0) * k);
    this.q.copy(tw.q0).slerp(to.q, k);
    this.suction = tw.next === 'ground' || tw.next === 'roof' ? 0.5 : 1; this.down = tw.next === 'under' ? 1 : 0;
    this._apply(0);
    if (u < 1) return;
    this.mode = tw.next; this.tw = null;
    if (tw.next === 'ground' || tw.next === 'roof') {
      c.x = to.x; c.y = to.y; c.z = to.z; c.psi = to.psi; c.pitch = 0; c.steer = 0; c.edge = null;
      c.v = tw.next === 'ground' ? this.groundV || 0 : 0; this.camHold = 0.9;
      if (tw.next === 'roof') this.rv = 4;
      this._applyUpright();
    }
  }

  // ================================================================ 共用
  /** 最高、但不高於 y 的表面：道路（含高架）、屋頂、地面。 */
  _below(x, z, y) {
    const W = this.world;
    let best = W.groundAt(x, z, y), kind = 'ground', b = null;
    const G = W.G, arr = W.segGrid.get(Math.floor(x / G) * 73856093 ^ Math.floor(z / G) * 19349663);
    if (arr) for (let k = 0; k < arr.length; k++) {
      const { e, i } = arr[k]; if (e.dead || e.tunnel) continue;
      const p = e.pts, ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az, L2 = dx * dx + dz * dz || 1e-6;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d2 = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
      if (d2 > (e.hw + 0.3) ** 2) continue;
      const h = e.hs[i] + (e.hs[i + 1] - e.hs[i]) * t;
      if (h <= y + 0.4 && h > best) { best = h; kind = 'road'; }
    }
    const bd = W.buildingAt(x, z);
    if (bd) { const top = bd.y0 + bd.h; if (top <= y + 0.4 && top > best) { best = top; kind = 'roof'; b = bd; } }
    return { y: best, kind, b };
  }
  /** 空氣不夠時的提示（說明怎麼補）。 */
  _empty(lead) {
    if (this._emptyT > 0) return; this._emptyT = 4;
    const none = this.h.fuel() <= 1e-4;
    this.h.toast(`${lead || '壓縮空氣用完了'}${none ? '，飛天跑車的特殊功能暫停' : ''}。開車會慢慢補、停電動車充電格可以快速補、晚上回家會補滿`, 3.5);
  }
  _crash(fee, msg) { this.stats.crashes++; this.h.crash(fee, msg); this.h.bump(2); }

  /** 空中：姿態＝偏航＋翻轉；剛離開牆面／橋底時從原本的姿態慢慢轉正。 */
  _pose() {
    const q = yawRollQuat(this.psi, this.roll, this.q, Math.max(-0.25, Math.min(0.25, this.vel.y * 0.015)));
    if (this.att) {
      this.att.t += this._dt || 1 / 60;
      const k = ease(this.att.t / this.att.T);
      this.q.copy(this.att.q0).slerp(q.clone(), k);
      if (this.att.t >= this.att.T) this.att = null;
    }
    this._apply(Math.hypot(this.vel.x, this.vel.z));
  }
  _apply(speed) {
    const c = this.car;
    c.x = this.pos.x; c.y = this.pos.y; c.z = this.pos.z; c.psi = this.psi; c.v = speed; c.edge = null;
    c.group.position.copy(this.pos); c.group.quaternion.copy(this.q);
  }
  _applyUpright() {
    const c = this.car;
    this.pos.set(c.x, c.y, c.z); this.psi = c.psi;
    yawRollQuat(c.psi, 0, this.q);
    c.group.position.set(c.x, c.y, c.z); c.group.quaternion.copy(this.q);
  }

  /** 各方向噴氣的強度（給白霧用）。 */
  jets() { return { rear: this.thrust, down: this.down, left: this.side < 0 ? -this.side : 0, right: this.side > 0 ? this.side : 0, front: this.front }; }
  _visual(dt) {
    const c = this.car, f = c.flames; if (!f) return;
    const J = this.jets();
    for (const k of Object.keys(f)) for (const m of f[k]) { const v = J[k] || 0; m.visible = v > 0.02; if (m.visible) m.scale.set(1, 0.25 + v * 0.55 + Math.random() * 0.15, 1); }
    if (c.grip) c.grip.visible = this.suction > 0.01;
  }

  // ================================================================ 車外視角（地平線保持水平）
  camera(cam, dt) {
    const p = this.pos, tgt = _v1, look = _v2;
    const fx = -Math.sin(this.psi), fz = -Math.cos(this.psi);
    if (this.mode === 'wall' && this.wl) {
      const w = this.wl.w, s = Math.sin(this.wl.th), c = Math.cos(this.wl.th);
      let d = 11;
      for (; d > 3; d -= 1) { const b = this.world.buildingAt(p.x + w.nx * d, p.z + w.nz * d); if (!b || b.y0 + b.h < p.y - 3) break; }
      tgt.set(p.x + w.nx * d - w.tx * s * 4, p.y - c * 4, p.z + w.nz * d - w.tz * s * 4);
      tgt.y = Math.max(tgt.y, this.world.groundAt(tgt.x, tgt.z, p.y) + 1.5);
      look.set(p.x + w.tx * s * 2, p.y + c * 2, p.z + w.tz * s * 2);
    } else if (this.mode === 'under' && this.un) {
      const ps = this._up || this._underPose(), g = ps.ground !== undefined ? ps.ground : p.y - 5;
      tgt.set(p.x - ps.fx * 8.5, Math.max(g + 1.0, Math.min(p.y - 1.8, p.y - 2.4)), p.z - ps.fz * 8.5);
      look.set(p.x + ps.fx * 3, p.y - 0.7, p.z + ps.fz * 3);
    } else {
      tgt.set(p.x - fx * 9, p.y + 3.4, p.z - fz * 9);
      tgt.y = Math.max(tgt.y, this.world.groundAt(tgt.x, tgt.z, p.y) + 1.2);
      look.set(p.x + fx * 2, p.y + 0.9, p.z + fz * 2);
    }
    if (!this.cp) { this.cp = tgt.clone(); this.lk = look.clone(); }
    const k = 1 - Math.exp(-dt * 4.5);
    this.cp.lerp(tgt, k); this.lk.lerp(look, 1 - Math.exp(-dt * 8));
    cam.up.set(0, 1, 0); cam.position.copy(this.cp); cam.lookAt(this.lk);
  }
  /** 從駕駛座切到車外時，鏡頭從目前位置開始（不會跳一下）。 */
  camFrom(cam) { this.cp = cam.position.clone(); this.lk = this.pos.clone(); }
}
