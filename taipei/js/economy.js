// 台北上班路 — 金錢、商店、存檔。
// 收入：每天準時打卡領日薪，遲到每分鐘扣錢。支出：油錢／電費、上班時的路邊停車費、特技燃料。
// 商店的價錢原則（玩家訂的）：能讓你越快到達的東西越貴。實際價錢依「每趟平均省下的分鐘數」換算（見 PRICE_RULE），
// 省下的分鐘數用自動測試在尖峰時段實際跑出來，數字放在 SAVED_MIN。

export const PAY = {
  daily: 2000,          // 準時上班的日薪（元）
  latePerMin: 25,       // 遲到每分鐘扣（元），最多扣到日薪的一半
  gasPrice: 30,         // 汽油（元／公升）
  homeKwh: 4,           // 在家充電（元／度）
  bayKwh: 6,            // 停車場電動車格充電（元／度）
  roadParkHr: 30,       // 路邊停車（元／小時），上班 9 小時
  workHours: 9,
  stuntRefill: 600,     // 特技燃料（壓縮空氣）從空充到滿（元）
};

// 價錢 ＝ 每趟平均省下的分鐘數（遊戲時間）× 每天 2 趟 × 每分鐘的價值（＝遲到每分鐘扣的錢）× 10 個上班日；最低 1,000 元。
// 意思是：這項功能用 10 個上班日（來回 20 趟），省下的時間剛好抵得上它的價錢。省越多時間就越貴。
export const PRICE_RULE = { tripsPerDay: 2, perMin: PAY.latePerMin, paybackDays: 10, min: 1000 };
// 每趟平均省下的遊戲分鐘數：2026/10/17 尖峰時段（車流 1.8 倍）實測，取中位數。
//   導航：300 組住家→公司，最快路線 vs「沒有導航、只看方向箭頭」的開法（每個路口往前看 3 個路口選路），tests/nav_saving.mjs → 11 分。
//   電動車：18 個公司附近，最近的空路邊格（早上 110 m 內停滿）vs 最近的電動車格，差的走路時間，tests/ev_measure.mjs → 約 0.2 分。
//   飛天跑車：8 組，同一條路線在車流裡開，一般車 vs 塞住時飛越車陣（每趟最多 3 次），tests/measure2.mjs → 20 分。
//   無人機：7 組，一般車開 vs 用無人機飛（含避撞、等降落），tests/measure2.mjs → 82 分（飛一趟約 12～14 分、燃料費約 550 元）。
//   模擬的尖峰車速中位數 15 km/h（TomTom 2025 臺北：早上尖峰 19 km/h、晚上 15 km/h）。
export const SAVED_MIN = { nav: 11, ev: 0.2, roadster: 20, drone: 82 };
export const SAVED_MEASURED = true;
export const SAVED_NOTE = {
  nav: '尖峰實測：每趟約省 11 分鐘（不用自己找路、不會繞遠路）',
  ev: '實測：停車走路幾乎省不到時間（電動車格多在停車場裡，不一定比路邊近）；好處是電費比油錢便宜很多',
  roadster: '尖峰實測：每趟約省 20 分鐘（塞車時飛越車陣）',
  drone: '尖峰實測：每趟約省 82 分鐘；一趟燃料費約 550 元',
};

export const SHOP = [
  { key: 'nav', name: '導航系統', kind: 'upgrade', desc: '中控螢幕與小地圖顯示建議路線，轉彎前提示。' },
  { key: 'ev', name: '電動車', kind: 'car', car: 'ev', desc: '可以停停車場裡的電動車專用格（停的時候順便充電，很少被占滿），電費比油錢便宜很多。' },
  { key: 'roadster', name: '飛天跑車', kind: 'car', car: 'roadster', desc: '電動跑車＋高壓氣體推進器：約 1 秒破百、塞車時垂直升空飛越 10 台車、空中翻轉、吸附大樓外牆垂直開上屋頂、吸在高架橋底倒著開。特技另外消耗燃料（每晚在家充滿，用多少算多少錢），也可以停電動車格。' },
  { key: 'drone', name: '無人機飛行系統', kind: 'upgrade', desc: '塞車時按 U 升空（車子伸出四組旋翼），自動選最空的高度層、用參考 NASA DAIDALUS 的避撞方法閃開別架無人機和超高大樓，飛到目的地附近；下方有車要在空中等。燃料費每分鐘 40 元，飛越久越貴。' },
];
export function priceOf(key) {
  const m = SAVED_MIN[key] || 0, r = PRICE_RULE;
  return Math.max(r.min, Math.round(m * r.tripsPerDay * r.perMin * r.paybackDays / 100) * 100);
}

const SAVE_KEY = 'taipei-commute-v2';

export class Economy {
  constructor() { this.reset(); }
  reset() {
    this.money = 0; this.owned = new Set(); this.carKey = 'gas'; this.stuntFuel = 1;
    this.totals = { days: 0, late: 0, km: 0, earned: 0, spent: 0 };
    this.day = null;   // 今天的帳
  }
  toJSON() { return { money: this.money, owned: [...this.owned], carKey: this.carKey, stuntFuel: this.stuntFuel, totals: this.totals }; }
  fromJSON(o) {
    this.reset(); if (!o) return;
    this.money = o.money || 0; this.owned = new Set(o.owned || []); this.carKey = o.carKey || 'gas';
    this.stuntFuel = typeof o.stuntFuel === 'number' ? o.stuntFuel : 1; this.totals = Object.assign(this.totals, o.totals || {});
  }
  has(key) { return this.owned.has(key); }
  /** 擁有的車（油車一開始就有）。 */
  cars() { return ['gas', ...SHOP.filter(s => s.kind === 'car' && this.owned.has(s.key)).map(s => s.car)]; }
  buy(key) {
    const p = priceOf(key);
    if (this.owned.has(key)) return { ok: false, msg: '已經有了' };
    if (this.money < p) return { ok: false, msg: `還差 ${(p - this.money).toLocaleString()} 元` };
    this.money -= p; this.owned.add(key); this.totals.spent += p;
    const item = SHOP.find(s => s.key === key);
    if (item && item.kind === 'car') this.carKey = item.car;
    return { ok: true, msg: `買了${item ? item.name : key}` };
  }

  /** 一天開始。 */
  startDay() { this.day = { pay: 0, late: 0, energy: 0, parking: 0, charge: 0, stunt: 0, drone: 0, repair: 0, lines: [] }; this.stuntFuel = 1; }   // 特技燃料每晚在家充滿（用掉的錢已算在當天）
  /** 上班打卡。 */
  clockIn(lateMin) {
    const d = this.day; d.late = Math.max(0, Math.round(lateMin));
    d.pay = PAY.daily - Math.min(PAY.daily / 2, d.late * PAY.latePerMin);
  }
  /** 開車用掉的能源（油車：公升；電動車：度）。 */
  addEnergy(spec, used, atHome = true) {
    if (used <= 0) return;
    const cost = spec.key === 'gas' ? used * PAY.gasPrice : used * (atHome ? PAY.homeKwh : PAY.bayKwh);
    this.day.energy += cost;
  }
  addParking(type) {
    if (type === 'road') this.day.parking += PAY.roadParkHr * PAY.workHours;
  }
  addStunt(frac) { this.day.stunt += frac * PAY.stuntRefill; }
  addDrone(cost) { this.day.drone += cost; }
  addRepair(cost) { this.day.repair = (this.day.repair || 0) + cost; }
  /** 一天結束：結算，回傳明細。 */
  endDay(km) {
    const d = this.day, spend = Math.round(d.energy + d.parking + d.charge + d.stunt + d.drone + (d.repair || 0));
    const net = Math.round(d.pay) - spend;
    this.money += net; this.totals.days++; this.totals.km += km; if (d.late) this.totals.late++;
    this.totals.earned += Math.round(d.pay); this.totals.spent += spend;
    return { pay: Math.round(d.pay), late: d.late, energy: Math.round(d.energy), parking: Math.round(d.parking), stunt: Math.round(d.stunt), drone: Math.round(d.drone), repair: Math.round(d.repair || 0), spend, net, money: this.money };
  }
}

export const store = {
  get() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) { /* 存不了照樣能玩 */ } },
  clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
};
