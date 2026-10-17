// 看示範：遊戲自己擺好場景、照腳本操作，畫面上有字幕。即時播放（不是錄好的影片），看完可以直接接手開。
// 每一段的動作跟錄影腳本（tests/clips.mjs、tests/clips_modes.mjs）一樣，只是改成在瀏覽器裡即時跑。
const CANCEL = new Error('demo-cancel');

// 固定地點
const ROAD = { x: -2501.7, z: 4343.0, psi: -1.8011 };     // 士林：筆直的水源快速道路
const UNDER = { x: -510.958, z: 1693.611, psi: 1.5211 };  // 市民大道高架下

export const DEMOS = [
  { key: 'boost', name: '推進器', sub: 'Shift：約 1 秒 0 → 100 km/h' },
  { key: 'hop', name: '飛越車陣', sub: 'F：停著垂直升空，越過 10 台車' },
  { key: 'flip', name: '空中翻轉', sub: 'T：側面噴氣，落地前要轉正' },
  { key: 'wall', name: '開上大樓外牆', sub: 'G：吸住外牆開上屋頂' },
  { key: 'under', name: '高架橋底倒著開', sub: 'G：吸在橋底倒著開' },
  { key: 'empty', name: '壓縮空氣用完', sub: '特殊功能停用、怎麼補氣' },
  { key: 'drone', name: '無人機系統（片段）', sub: 'U：旋翼伸出、升空、避撞、降落', near: true },
  { key: 'allfly', name: '新玩法：全城飛天跑車', sub: '每台車都會飛越，主角怎麼到公司', mode: 'allfly' },
  { key: 'alldrone', name: '新玩法：全城無人機', sub: '路上沒車、天上擠滿，主角飛上去', mode: 'alldrone' },
];

export class DemoRunner {
  /** T：window.__tc；ui：{ cap(text), speed(n), done(), toast(m, s) } */
  constructor(T, ui) { this.T = T; this.ui = ui; this.waits = []; this.cancelled = false; this.cams = null; }
  /** 每幀呼叫一次（dt：這一幀的遊戲秒數，已乘上快轉倍數）。 */
  tick(dt) {
    const list = this.waits.splice(0);
    for (const w of list) {
      if (this.cancelled) { w.reject(CANCEL); continue; }
      let r = false; try { r = w.check(dt); } catch (e) { w.reject(e); continue; }
      if (r) w.resolve(r); else this.waits.push(w);
    }
  }
  cancel() { this.cancelled = true; for (const w of this.waits.splice(0)) w.reject(CANCEL); this._cleanup(); }
  _wait(check) { if (this.cancelled) return Promise.reject(CANCEL); return new Promise((resolve, reject) => this.waits.push({ check, resolve, reject })); }
  sleep(sec) { let left = sec; return this._wait((dt) => (left -= dt) <= 0); }
  until(cond, maxSec = 60) { let t = 0; return this._wait((dt) => { t += dt; return cond() ? 'ok' : t > maxSec ? 'timeout' : false; }); }
  /** 每幀做 fn(dt)，直到 fn 回傳 true 或超過 maxSec。 */
  each(fn, maxSec = 60) { let t = 0; return this._wait((dt) => { t += dt; return fn(dt, t) === true || t > maxSec; }); }
  keys(...k) { const I = this.T.input; for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) I.keys.delete(c); for (const c of k) if (c) I.keys.add(c); }
  press(code) { this.T.input.hit.add(code); }
  cap(t) { this.ui.cap(t); }
  speed(n) { this.T.steps = n; this.ui.speed(n); }
  cam(fn) { this.T.camHook = fn; }
  _cleanup() { this.keys(); this.T.camHook = null; this.speed(1); }

  async place(x, z, psi, o = {}) {
    const { car, world, stunts, econ, parking, traffic } = this.T;
    this.cap('載入這一帶的街區…');
    if (stunts) stunts.reset(); econ.stuntFuel = 1;
    car.place(x, z, psi, world.groundAt(x, z));
    await this.until(() => world.readyAround(x, z, 300) && parking.readyAround(x, z, 150), 90);
    if (stunts) stunts.reset();
    car.place(x, z, psi, world.groundAt(x, z));
    if (o.clearTraffic) { traffic.clear(); traffic.factor = 0; }
    await this.sleep(0.4);
  }
  /** 住家附近有紅綠燈的大馬路（車道上、面向路口）。 */
  mainRoad() {
    const { world, car } = this.T; let best = null;
    world.forEdgesNear(car.x, car.z, 1000, (e) => {
      if (e.cls < 1 || e.cls > 2 || e.bridge || e.tunnel || e.len < 170 || !e.sigB) return;
      const p = e.pts, L0 = Math.hypot(p[2] - p[0], p[3] - p[1]); if (L0 < 40) return;
      const ux = (p[2] - p[0]) / L0, uz = (p[3] - p[1]) / L0, off = e.oneway ? 0.5 * e.laneW - (e.width - 1) / 2 : 0.5 * e.laneW;
      const x = p[0] + ux * 25 - uz * off, z = p[1] + uz * 25 + ux * off, d = Math.hypot(x - car.x, z - car.z);
      if (!best || d < best.d) best = { x, z, psi: Math.atan2(-ux, -uz), d };
    });
    return best;
  }
  /** 找一棟可以開上外牆的大樓：正面有路、屋頂夠深、對面邊緣外沒有更高的樓（找不到就放寬條件）。 */
  wallTarget() {
    const { world, car } = this.T; let best = null, loose = null;
    for (const c of world.cells.values()) {
      if (c.state !== 'ready' || !c.blds) continue;
      for (const b of c.blds) {
        if (b.h < 28 || b.h > 60 || Math.hypot((b.minx + b.maxx) / 2 - car.x, (b.minz + b.maxz) / 2 - car.z) > 900) continue;
        const p = b.pts, n = p.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1], L = Math.hypot(bx - ax, bz - az); if (L < 14) continue;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2; let nx = -(bz - az) / L, nz = (bx - ax) / L;
          if (world.buildingAt(mx + nx * 0.6, mz + nz * 0.6) === b) { nx = -nx; nz = -nz; }
          const px = mx + nx * 7, pz = mz + nz * 7;
          if (world.buildingAt(px, pz) || world.buildingAt(mx + nx * 3, mz + nz * 3) || world.buildingAt(mx + nx * 14, mz + nz * 14)) continue;
          const s = world.surfaceAt(px, pz, world.groundAt(px, pz), {}); if (!s || s.edge.bridge || s.edge.tunnel) continue;
          const cand = { x: px, z: pz, psi: Math.atan2(nx, nz), h: b.h };
          if (!loose || b.h > loose.h) loose = cand;
          let k = 3; while (k < 90 && world.buildingAt(mx - nx * k, mz - nz * k) === b) k++;
          if (k < 18 || k > 70) continue;
          let open = true; for (let q = k + 1; q < k + 30; q += 2) { const o = world.buildingAt(mx - nx * q, mz - nz * q); if (o && o.y0 + o.h > b.y0 + b.h - 1.5) { open = false; break; } }
          if (open && (!best || b.h > best.h)) best = cand;
        }
      }
    }
    return best || loose;
  }
  queue(n) {
    const { car, traffic, world } = this.T; traffic.clear(); traffic.factor = 0;
    const col = this.T.scene.children.find(o => o.isHemisphereLight).color.clone(); const out = [];
    for (let i = 1; i <= n; i++) {
      const x = car.x + car.fwdX * (i * 6.2), z = car.z + car.fwdZ * (i * 6.2), o = {}; const e = world.nearestEdge(x, z, 10, null, o); if (!e) continue;
      const c = { e, dir: 1, lane: 0, s: o.s, v: 0, fac: 1, x, y: world.groundAt(x, z), z, psi: car.psi, turn: null, next: null, wait: 0, color: col.clone().setHSL(0, 0, 0.35 + (i % 3) * 0.25), scale: 1, flyer: false, hop: null, hopCd: 99, wreck: 999, pitch: 0 };
      e.cars.push(c); traffic.cars.push(c); out.push(c);
    }
    return out;
  }

  /** 跑一段示範。結束（或中途取消）後回到正常遊戲。 */
  async run(key) {
    try {
      await this['_' + key]();
      // 結束時把車停好（飛行中就不管，讓它自己飛完）
      const { car, flight } = this.T;
      if (!(flight && flight.active) && Math.abs(car.v) > 0.5) { this.keys('KeyS'); await this.until(() => Math.abs(car.v) < 0.5, 8); }
      this._cleanup(); this.ui.done(true);
    }
    catch (e) { this._cleanup(); if (e !== CANCEL) { console.warn('demo', e); this.ui.done(false, e); } }
  }

  // ---------------------------------------------------------------- 各段示範
  async _boost() {
    const { G, car } = this.T;
    await this.place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
    G.cam = 'chase';
    this.cap('推進器（Shift）：約 1 秒 0 → 100 km/h，車尾 2 個噴嘴噴出壓縮空氣'); await this.sleep(1);
    this.keys('KeyW', 'ShiftLeft'); await this.until(() => car.kmh > 180, 6);
    this.keys(); await this.sleep(2.5);
    this.keys('KeyS'); await this.until(() => car.kmh < 30, 8); this.keys();
  }
  async _hop() {
    const { stunts } = this.T;
    await this.place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
    const q = this.queue(10);
    this.cap('塞車停著也能飛（F）：車底 4 個噴嘴往下噴，垂直升空'); await this.sleep(1.2);
    this.press('KeyF'); await this.sleep(0.3);
    this.cap('往前飛約 60 m，越過前面 10 台車');
    await this.until(() => stunts.mode !== 'air', 15);
    this.cap('落地。剛剛飛越了 10 台車'); await this.sleep(2.5);
    for (const c of q) c.wreck = 0;
  }
  async _flip() {
    const { stunts } = this.T;
    await this.place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
    this.cap('空中翻轉（T）：先飛越，再在空中翻一圈'); this.keys('KeyW'); await this.sleep(1.3); this.keys();
    this.press('KeyF'); await this.sleep(0.5); this.press('KeyT');
    this.cap('左右兩側噴嘴輪流噴，落地前要轉正');
    await this.until(() => stunts.mode !== 'air', 15); await this.sleep(2);
  }
  async _wall() {
    const { G, stunts, car } = this.T;
    this.cap('找一棟可以開上去的大樓…');
    let t = this.wallTarget();
    if (!t) { await this.place(ROAD.x, ROAD.z, ROAD.psi); t = this.wallTarget(); }
    if (!t) { this.cap('附近找不到適合的大樓'); await this.sleep(3); return; }
    await this.place(t.x, t.z, t.psi, { clearTraffic: true });
    G.cam = 'chase';
    this.cap('面向大樓按 G：吸住外牆'); await this.sleep(0.8); this.press('KeyG'); await this.sleep(0.8);
    this.cap('垂直往上開（W）'); this.keys('KeyW');
    await this.until(() => stunts.mode === 'roof', 40); this.keys();
    this.cap('上到屋頂了，在屋頂上開'); await this.sleep(0.8);
    this.cap('從另一邊開出去：落地前車底噴氣減速');
    await this.each(() => { if (stunts.mode !== 'roof') return true; this.keys(car.v > 9 ? '' : 'KeyW'); }, 20); this.keys();
    await this.until(() => stunts.mode === 'ground' || stunts.mode === 'roof', 15); await this.sleep(2);
  }
  async _under() {
    const { stunts } = this.T;
    await this.place(UNDER.x, UNDER.z, UNDER.psi, { clearTraffic: true });
    this.cap('在高架橋正下方按 G：翻上去，吸在橋底'); await this.sleep(0.8); this.press('KeyG'); await this.sleep(1.2);
    this.cap('倒著開（市民大道高架）'); this.keys('KeyW');
    await this.until(() => stunts.stats.underM > 110 || stunts.mode === 'ground', 25); this.keys();
    if (stunts.mode === 'under') { this.cap('再按 G：翻正落地'); this.press('KeyG'); }
    await this.until(() => stunts.mode === 'ground', 10); await this.sleep(2);
  }
  async _empty() {
    const { econ } = this.T;
    await this.place(ROAD.x, ROAD.z, ROAD.psi, { clearTraffic: true });
    econ.stuntFuel = 0.002;
    this.cap('壓縮空氣用完了：按 F 也飛不起來'); await this.sleep(1); this.press('KeyF'); await this.sleep(2.5);
    this.keys('KeyW', 'ShiftLeft'); await this.sleep(1.5); this.keys('KeyW');
    this.cap('開車時會慢慢補（每公里 5%），回家或停電動車充電格補得快（遊戲設定）'); await this.sleep(4); this.keys();
    await this.sleep(1);
  }
  async _drone() {
    const { flight, G } = this.T;
    this.cap('從家門口出發，按 U 進入無人機系統：四組旋翼從車身翻出來'); await this.sleep(1.5);
    this.press('KeyU'); await this.until(() => flight.active, 3);
    if (!flight.active) { this.cap('這裡不能升空'); await this.sleep(3); return; }
    await this.sleep(1.2);
    this.speed(4); this.cap('垂直升空（4 倍速）');
    await this.until(() => flight.phase !== 'lift', 60);
    this.cap('巡航：右下角是避撞面板，綠色是可以飛的方向（4 倍速）');
    await this.until(() => flight.phase !== 'cruise', 120);
    let last = '';
    await this.each(() => {
      if (!flight.active) return true;
      const t = flight.blocked ? '降落點下面有車：停在空中等（4 倍速）' : flight.phase === 'descend' ? '垂直降落（4 倍速）' : '到降落點上方（4 倍速）';
      if (t !== last) { last = t; this.cap(t); }
    }, 180);
    this.speed(1); this.cap('降落完成，旋翼收回車身'); await this.sleep(2.5);
  }
  async _allfly() {
    const { G, car, traffic, stunts } = this.T;
    const r = this.mainRoad(); if (r) await this.place(r.x, r.z, r.psi);
    this.cap('全城飛天跑車：車流就位中（快轉）'); this.speed(8); await this.sleep(28); this.speed(1);
    G.cam = 'chase';
    const base = { x: car.x + car.fwdX * 55, y: car.y, z: car.z + car.fwdZ * 55 }; let th = car.psi + 0.9;
    this.cam((cam) => { th += 0.0016; cam.up.set(0, 1, 0); cam.position.set(base.x + Math.sin(th) * 70, base.y + 30, base.z + Math.cos(th) * 70); cam.lookAt(base.x, base.y + 3, base.z); });
    this.cap('每台車都是飛天跑車：塞住 1.5 秒就飛越車陣（遊戲設定）'); await this.sleep(8);
    this.cap('落地的空位大家搶：飛的時候被占走，就壓在別台車上撞成一團'); await this.sleep(7);
    this.cam(null);
    this.cap('你也是飛天跑車：開到車陣後面，塞住就按 F 飛越'); let stop = 0;
    await this.each((dt, t) => { if (t > 1 && car.v < 0.6) stop += dt; else stop = 0; this.keys(car.v > 9 ? '' : 'KeyW'); return stop > 1.2; }, 18);
    this.keys(); this.press('KeyF'); await this.sleep(0.4);
    await this.until(() => stunts.mode !== 'air', 15);
    this.cap(`落地後繼續開。這段時間全城飛越了 ${traffic.hops || 0} 次、撞成一團 ${traffic.crashes || 0} 次`);
    this.keys('KeyW'); await this.sleep(3); this.keys(); await this.sleep(1);
  }
  async _alldrone() {
    const { G, car, drones, flight } = this.T;
    const r = this.mainRoad(); if (r) await this.place(r.x, r.z, r.psi);
    await this.until(() => this.T.drones && this.T.drones.dense && this.T.drones.list.length > 100, 20);
    const sky = this.T.drones; G.cam = 'chase';
    this.cam((cam) => { const fx = car.fwdX, fz = car.fwdZ; cam.up.set(0, 1, 0); cam.position.set(car.x - fx * 8, car.y + 2.4, car.z - fz * 8); cam.lookAt(car.x + fx * 40, car.y + 26, car.z + fz * 40); });
    this.cap(`全城無人機：路上沒有車，附近 1.3 公里內 ${sky.list.length.toLocaleString()} 架都在天上`);
    await this.each(() => { this.keys(car.v > 11 ? '' : 'KeyW'); }, 6); this.keys('KeyS'); await this.until(() => car.v < 0.5, 4); this.keys();
    const b = { x: car.x, y: car.y, z: car.z }; let k = 0; const a0 = car.psi + 1.2;
    this.cam((cam) => { k++; const a = a0 + k * 0.0012; cam.up.set(0, 1, 0); cam.position.set(b.x + Math.sin(a) * 260, b.y + 70, b.z + Math.cos(a) * 260); cam.lookAt(b.x, b.y + 135, b.z); });
    this.cap('6 個高度層（90～190 m）：依航向分層，同一層大致同方向飛（遊戲設定）'); await this.sleep(6);
    this.cam(null);
    this.cap('按 U 飛上去：要先穿過下面幾層的車流'); this.press('KeyU'); await this.until(() => flight.active, 3);
    if (!flight.active) { this.cap('這裡不能升空'); await this.sleep(3); return; }
    await this.sleep(1.2); this.speed(4);
    let last = '';
    await this.each(() => {
      if (flight.phase !== 'lift') return true;
      const t = flight.held ? '向系統登記「空中柱子」，等那一層的車繞開讓出空檔（4 倍速）' : '垂直爬升，穿過下面幾層（4 倍速）';
      if (t !== last) { last = t; this.cap(t); }
    }, 90);
    await this.each((dt, t) => {
      const v = Math.hypot(flight.vx, flight.vz), s = v < 30 ? '空中也會塞車：同一層跟前車保持 80 m（4 倍速）' : '到了自己那一層，跟著車流飛（4 倍速）';
      if (s !== last) { last = s; this.cap(s); }
      return !flight.active || t > 50;
    }, 60);
    this.speed(1);
    this.cap('示範到這裡。飛機會繼續自己飛到目的地降落，你也可以按 U 取消、自己降落');
    await this.sleep(4);
  }
}
