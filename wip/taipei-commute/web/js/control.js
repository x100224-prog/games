// 玩法「全城無人機・路空總控」：每台車都有無人機系統，但路上照樣有車在開。
// 想升空時先問「路空總控中心」：它掌握全部車子的動向——路上每台車的速度、天上每台車的位置和航向、
// 各地區排隊等降落的飛行計畫——估算「繼續開」和「飛起來」哪個先到，核准或建議繼續開。
//
// 參考的真實做法（只借概念，程式是自己寫的）：
//  - NASA 的無人機交通管理（UTM）：起飛前先送飛行計畫，系統事先排好降落時段，避免空中擠成一團。
//  - 機場的流量管理（地面等待）：降落容量不夠時，讓飛機在地面等到時段再起飛，比在空中繞圈省油又安全。
//  - 交通工程的使用者均衡（Wardrop 原則）：每個人都選對自己最快的方式，最後路面和空中會差不多快。
//    總控每秒比較「一般通勤開車要多久」和「飛要多久（含排隊降落）」，調整有多少車飛、多少車開。
//
// 下面的數字都是遊戲設定（不是實測資料），除了 roadJam：尖峰時全部的車都在路上，這個遊戲之前實測比空的路慢約 1.9 倍。
import { SKY, layerFor } from './sky.js';
import { TRAFFIC_DENSITY } from './config.js';

export const CTL = {
  // 降落容量：目的地 250 m 內的巷道、一般道路，每 300 m 算一個降落點（3～12 個）；
  // 每次降落佔用一個降落點 40 秒（遊戲 4 分鐘：降下來、等路上的車讓開、開走）
  spotR: 250, spotLen: 300, spotMin: 3, spotMax: 12, service: 40, refSpots: 6,
  // 想在一個地區降落的車（如果大家都飛）：熱鬧程度 ×（平時 + 尖峰）× 一般地區的降落容量
  am: { base: 0.35, peak: 1.9, at: 8 * 60 + 10, w: 35 },   // 上班：8:10 左右最多
  pm: { base: 0.3, peak: 1.6, at: 18 * 60 + 40, w: 40 },   // 下班：18:40 左右最多
  roadJam: 0.9,              // 路上的車越多越慢：全部的車都在路上時 ×1.9
  cruise: 50, airJam: 0.6,   // 天上越擠越慢：全部的車都在天上時巡航速度 ÷1.6
  sigma: 110,                // 大家怎麼選：差 110 秒時約 73% 選快的那個（其他人照習慣）
  pMin: 0.05, pMax: 0.8, relax: 30,   // 最多八成的車飛（有些車照習慣開、或只是短程）
  typD: 3500, typT: 520,     // 一般的通勤：直線 3.5 km，空的路開約 520 秒（遊戲 52 分鐘）
  margin: 0.95,              // 飛的時間要比開車少 5% 以上才核准（不然開車比較省錢）
};
const LANES = [3, 2, 2, 2, 1, 1, 1, 1];
const MU_REF = CTL.refSpots / CTL.service;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 時段曲線：如果大家都飛，想降落的車是一般地區容量的幾倍。 */
export function profile(leg, min) { const P = CTL[leg] || CTL.am; return P.base + P.peak * Math.exp(-(((min - P.at) / P.w) ** 2)); }
/** 路面：路上的車占尖峰的比例 load（0～1）時，比空的路慢幾倍。 */
export const roadMult = (load) => 1 + CTL.roadJam * load * load;
/** 天上：有 p 比例的車在飛時，平均巡航速度。 */
export const airSpeed = (p) => CTL.cruise / (1 + CTL.airJam * p * p);
/** Adams 等空檔公式：車流每秒 lam 台經過，要等出 T 秒的空檔，平均要等多久。 */
export const gapWait = (lam, T) => lam < 1e-6 ? 0 : (Math.exp(Math.min(30, lam * T)) - lam * T - 1) / lam;

export class Control {
  constructor(nav) {
    this.nav = nav; this.t = 0; this.queues = new Map(); this.leg = 'am'; this.min = 0; this.min0 = 0;
    this.typ = { B: 0, mu: MU_REF, A: 1, spots: CTL.refSpots, key: 'typ', p: CTL.pMax };   // 「一般地區」：用來決定全市有多少車在飛
    this._actGrid();
  }
  /** 全市飛的比例（決定路上和天上各有多少車）。 */
  get p() { return this.typ.p; }
  /** 熱鬧程度：每 250 m 一格，加總路上的車流量（長度 × 密度 × 車道數）。 */
  _actGrid() {
    const nv = this.nav, C = 250, g = new Map(); this.AC = C; this.act = g;
    for (let k = 0; k < nv.E; k++) {
      const c = nv.ecls[k]; if (c > 5) continue;
      const a = nv.ea[k], b = nv.eb[k], key = Math.floor((nv.nx[a] + nv.nx[b]) / 2 / C) * 100003 + Math.floor((nv.nz[a] + nv.nz[b]) / 2 / C);
      g.set(key, (g.get(key) || 0) + nv.elen[k] / 1000 * TRAFFIC_DENSITY[c] * LANES[c] * (nv.eow[k] ? 1 : 2));
    }
    const v = []; for (let i = 0; i < nv.N; i += 97) v.push(this._actAt(nv.nx[i], nv.nz[i]));
    v.sort((a, b) => a - b); this.actRef = v[v.length >> 1] || 1;
  }
  _actAt(x, z) {
    const C = this.AC, gx = Math.floor(x / C), gz = Math.floor(z / C); let s = 0;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i + j * j <= 5) s += this.act.get((gx + i) * 100003 + gz + j) || 0;
    return s;
  }
  /** 目的地那一區：降落點數量、熱鬧程度、排隊、往那裡的車有多少比例在飛。 */
  area(x, z) {
    const key = Math.round(x / 40) + ',' + Math.round(z / 40);
    let q = this.queues.get(key); if (q) return q;
    const nv = this.nav, R2 = CTL.spotR ** 2; let L = 0;
    for (let k = 0; k < nv.E; k++) {
      const c = nv.ecls[k]; if (c < 4 || c > 5) continue;
      const a = nv.ea[k], b = nv.eb[k], mx = (nv.nx[a] + nv.nx[b]) / 2 - x, mz = (nv.nz[a] + nv.nz[b]) / 2 - z;
      if (mx * mx + mz * mz < R2) L += nv.elen[k];
    }
    const spots = clamp(Math.round(L / CTL.spotLen), CTL.spotMin, CTL.spotMax);
    q = { key, x, z, spots, mu: spots / CTL.service, A: clamp(this._actAt(x, z) / this.actRef, 0.6, 1.8), B: 0, p: CTL.pMax };
    this.queues.set(key, q);
    // 半路才查到的地區：從這一趟開始（7:30 或 18:00）補算到現在
    const gm = 0.1; for (let m = this.min0; m < this.min - 1e-6; m += 2 * gm) this._step(q, Math.min(2, (this.min - m) / gm), m);
    return q;
  }
  /** 早上／晚上開始時：排隊從零開始，飛的比例從「沒有排隊時」的均衡開始。 */
  startLeg(leg, min) {
    this.leg = leg; this.min0 = this.min = min;
    for (const q of [this.typ, ...this.queues.values()]) { q.B = 0; q.p = CTL.pMax; for (let i = 0; i < 120; i++) this._choose(q, 1); }
  }
  /** 路面（一般通勤）要多久：路上的車是尖峰的 1 − p。 */
  roadTyp() { return CTL.typT * roadMult(1 - this.p); }
  /** 往 q 這一區的車怎麼選：飛（含排隊降落）跟開車比，快越多越多人飛。 */
  _choose(q, dt) {
    const Tr = this.roadTyp(), Ta = 80 + CTL.typD / airSpeed(this.p) + q.B / q.mu;
    const pt = clamp(1 / (1 + Math.exp((Ta - Tr) / CTL.sigma)), CTL.pMin, CTL.pMax);
    q.p += (pt - q.p) * Math.min(1, dt / CTL.relax);
    if (q === this.typ) this.last = { Tr, Ta, pt };
  }
  _arrivals(q, min) { return q.p * q.A * profile(this.leg, min) * MU_REF; }
  _step(q, dt, min) { q.B = Math.max(0, q.B + (this._arrivals(q, min) - q.mu) * dt); this._choose(q, dt); }
  /** 每幀：dt 現實秒，min 遊戲時鐘（分鐘）。 */
  tick(dt, min) {
    this.t += dt; this.min = min;
    for (const q of [this.typ, ...this.queues.values()]) this._step(q, dt, min);
  }
  /** 預測：sec 秒後到達 q 那一區時，前面排了幾台（假設往那裡飛的比例不變）。 */
  backlogAt(q, sec, min, gmps) {
    let B = q.B; const h = 2;
    for (let s = 0; s < sec; s += h) B = Math.max(0, B + (this._arrivals(q, min + s * gmps) - q.mu) * Math.min(h, sec - s));
    return B;
  }

  /** 路上的車：數量、平均速度（現在玩家附近的，即時）。 */
  liveRoad(traffic, x, z) {
    let n = 0, v = 0, stop = 0;
    if (traffic) for (const c of traffic.cars) { if ((c.x - x) ** 2 + (c.z - z) ** 2 > 300 * 300 || c.hop) continue; n++; v += c.v; if (c.v < 0.5) stop++; }
    return { n, kmh: n ? v / n * 3.6 : 0, stop };
  }
  /** 天上：玩家附近要穿過的每一層，等空檔的時間（Adams 公式），和自己那一層的平均速度。 */
  liveSky(sky, x, z, g, layer) {
    const R = 700, area = Math.PI * R * R, r = SKY.sep + 10;
    let wait = 0, n = 0, own = 0;
    for (const L of SKY.layers) {
      if (L > layer) break;
      let cnt = 0, vs = 0;
      if (sky && sky.near) for (const o of sky.near(x, g + L, z, R, SKY.zsep)) { if (o.phase !== 'cruise') continue; cnt++; vs += o.v || 0; }
      n += cnt; if (L === layer) own = cnt;
      const vbar = cnt ? vs / cnt : 40, lam = cnt / area * 2 * r * vbar * 0.5;   // ×0.5：登記了起降柱子，那一層的車會繞開
      wait += gapWait(lam, 2.5 + 2 * r / Math.max(25, vbar));
    }
    // 自己那一層越擠飛越慢（跟車、閃車）：每平方公里多 1 架慢約 0.6%（用這個遊戲的模擬校正）。附近沒有資料時用全市的估算
    const dens = own / (area / 1e6);
    return { wait, n, dens, v: sky && sky.near ? CTL.cruise / (1 + 0.006 * dens) : airSpeed(this.p) };
  }
  /** 飛的那一段（不含排隊降落）：停車、爬升、穿過各層等空檔、巡航、降落各要幾秒。 */
  airLeg(ctx) {
    const { x, z, dest } = ctx;
    const D = Math.hypot(dest.x - x, dest.z - z), trk = Math.atan2(dest.x - x, dest.z - z), layer = layerFor(trk);
    const sk = this.liveSky(ctx.sky, x, z, ctx.g || 0, layer);
    // 開著問：先煞車停下來
    const v0 = Math.abs(ctx.v || 0), stop = v0 > 1 ? v0 / 3.5 + 1.5 : 0;
    const climb = 1.2 + layer / 6, cruise = Math.max(0, D - 60) / sk.v * 1.03 + 18;
    // 降落：穿過下面幾層，最後 25 m 等路上的車讓出空位（路上的車越多、目的地越熱鬧越要等）
    const q = this.area(dest.x, dest.z), gap = Math.min(90, 25 * q.A * (1 - this.p) / 0.2);
    const down = 1 + layer / 4 + sk.wait * 0.7 + 6 + gap;
    return { stop, climb, cross: sk.wait, cruise, down, gap, layer, km: D / 1000, skyN: sk.n, v: sk.v, toSlot: stop + climb + sk.wait + cruise };
  }
  /** 路面：照路線走要幾秒（空的路的時間 × 現在路上車流的塞車倍數）。 */
  roadSec(route) { return route ? route.time * roadMult(1 - this.p) : Infinity; }
  /**
   * 評估：ctx = { x, z, g（地面高度）, dest, route（nav.route 的結果）, traffic, sky, min, gmps }
   * 回傳兩種方式各要幾秒（現實秒）和細項、建議。
   */
  evaluate(ctx) {
    const { x, z, dest, route, min, gmps } = ctx;
    const live = this.liveRoad(ctx.traffic, x, z);
    const road = route ? { sec: this.roadSec(route), km: route.len / 1000, free: route.time, live } : null;
    const L = this.airLeg(ctx), q = this.area(dest.x, dest.z);
    const ahead = this.backlogAt(q, L.toSlot, min, gmps), queue = ahead / q.mu;
    const air = Object.assign(L, { sec: L.toSlot + queue + L.down, queue, ahead: Math.round(ahead), spots: q.spots, A: q.A });
    const fly = !road || air.sec <= road.sec * CTL.margin;
    // 現在升空會在空中等很久：建議先繼續開，排好的時段到了再升空（地面等待）
    const holdGround = fly && queue > 45 && !!road;
    return { road, air, fly, holdGround, p: this.p, area: q, t: this.t, min };
  }
  /** 核准升空：把降落時段排進去（之後這個時段就是你的，後來的車排在你後面）。 */
  reserve(ev) {
    const a = ev.air;
    const q = ev.area;
    return { slotAt: ev.t + a.toSlot + a.queue, arriveAt: ev.t + a.sec, ahead: a.ahead, area: q, predSec: a.sec, t0: ev.t, down: a.down,
      reslot: () => this.t + q.B / q.mu };   // 到了降落點上方：照那時候真正的排隊重新排（比預估早到就提前）
  }
}
