// 台北上班路 — 金錢、商店、存檔。
// 收入：每趟（上班、回家）各領一次，多少看工作地點（見 LIFE），上班遲到每分鐘扣錢。
// 支出：房租或房貸（看住在哪一區）、油錢／電費、上班時的路邊停車費、壓縮空氣、無人機燃料、修車。
// 收入用「萬」計，是配合換車的價錢（幾百萬）：準時上下班約 20 天可以買飛天跑車（玩家訂的）。
// 選住址和工作時看不到薪水和房租：上班打卡、晚上結算時才知道（玩家訂的）。
// 商店的價錢原則（玩家訂的）：能讓你越快到達的東西越貴。實際價錢依「每趟平均省下的分鐘數」換算（見 PRICE_RULE），
// 省下的分鐘數用自動測試在尖峰時段實際跑出來，數字放在 SAVED_MIN。

export const PAY = {
  trip: 200000,         // 每趟收入的基準 20 萬，實際乘上工作地點的倍數（見 LIFE、jobPay）
  latePerMin: 2500,     // 上班遲到每分鐘扣（元），最多扣到這趟收入的一半
  gasPrice: 30,         // 汽油（元／公升）
  homeKwh: 4,           // 在家充電（元／度）
  bayKwh: 6,            // 停車場電動車格充電（元／度）
  roadParkHr: 30,       // 路邊停車（元／小時），上班 9 小時
  workHours: 9,
};

// 飛天跑車的壓縮空氣罐（推進器、垂直升空、吸附風扇都靠它）。
// ※ 以下全部是「遊戲設定」：Tesla 沒有公布空氣罐的容量、能跳幾次、怎麼補充，這裡的數字是遊戲自己訂的。
// 住哪裡、在哪裡上班（遊戲設定，數字是遊戲自己訂的）：
//  - 蛋黃區（大安、信義、中正、中山、松山）的工作薪水比較高，住在那裡的房租、房貸也比較高。
//  - 其他區也零星有高薪的工作（約 12%），運氣好可能選到離家近、薪水又高的。
//  - 真實的台北：2026 上半年獨立套房月租中位數全市約 1.5 萬，內湖 1.95 萬最高、大安和信義 1.8 萬（經濟日報，內政部租金補貼資料）；
//    遊戲裡把差距放大，讓住哪裡更有感。
export const LIFE = {
  core: ['大安區', '信義區', '中正區', '中山區', '松山區'],
  coreJob: [1.30, 1.55],       // 蛋黃區的工作：每趟收入 × 1.30～1.55
  highJob: [1.35, 1.60],       // 其他區零星的高薪工作
  highShare: 0.12,
  job: [0.80, 1.02],           // 其他區一般的工作
  rent: { core: [70000, 90000], semi: [55000, 70000], other: [35000, 50000] },   // 每天的房租（元）
  semi: ['內湖區'],             // 內湖：房租接近蛋黃區（真實的租金也高），但工作不算蛋黃區
  mortgageShare: 0.45, mortgageMult: 1.2,   // 約 45% 的住址是買的（房貸），每天比同一區的房租多 2 成
};
// 用座標算出固定的亂數（同一個地方每次都一樣，但看不出規則）
const hash01 = (x, z, k) => { const v = Math.sin(Math.round(x) * 12.9898 + Math.round(z) * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
const lerp = ([a, b], t) => a + (b - a) * t;
/** 這個工作每趟收入多少（元）。district：工作所在的行政區名稱。 */
export function jobPay(work, district) {
  const r1 = hash01(work.x, work.z, 1), r2 = hash01(work.x, work.z, 2);
  const m = LIFE.core.includes(district) ? lerp(LIFE.coreJob, r1) : r2 < LIFE.highShare ? lerp(LIFE.highJob, r1) : lerp(LIFE.job, r1);
  return Math.round(PAY.trip * m / 1000) * 1000;
}
/** 這個住址每天的住的費用：{ kind: '房租'|'房貸', perDay }。district：住址所在的行政區名稱。 */
export function homeCost(home, district) {
  const r1 = hash01(home.x, home.z, 3), r2 = hash01(home.x, home.z, 4);
  const R = LIFE.rent, base = lerp(LIFE.core.includes(district) ? R.core : LIFE.semi.includes(district) ? R.semi : R.other, r1);
  const own = r2 < LIFE.mortgageShare;
  return { kind: own ? '房貸' : '房租', perDay: Math.round(base * (own ? LIFE.mortgageMult : 1) / 1000) * 1000 };
}

export const AIR = {
  gameSetting: true,
  jumpsPerTank: 8,       // 滿罐可以垂直升空飛越 8 次（每次 1/8 罐，含落地前的反推）
  homePrice: 3000,       // 回家補：每晚在家用壓縮機補滿，從空補到滿 3,000 元（依補的量算）
  stationPrice: 8000,    // 充電站補：停在電動車充電格補氣，比較快但比較貴，從空到滿 8,000 元
  stationRate: 0.04,     // 充電格補氣速度：每秒 4%（約 25 秒補滿）
  drivePerKm: 0.05,      // 開車時慢慢補：車上的小壓縮機，每開 1 公里補 5%（用車子的電，約 1 度電補滿一罐）
  driveKwhPerTank: 1,
};

// 價錢（玩家訂的原則：省越多時間越貴；車和加裝功能分開比；換車要幾百萬）：
//   車（電動車、飛天跑車）＝ 基本車價 200 萬 ＋ 每趟省下的分鐘數 × 2 趟 × 每分鐘 2,500 元 × 60 天（每省 1 分鐘多 30 萬）
//   加裝功能（導航、無人機系統）＝ 每趟省下的分鐘數 × 2 趟 × 每分鐘 2,500 元 × 10 天（每省 1 分鐘 5 萬）
//   都進位到萬。準時上下班一天 40 萬：飛天跑車約 20 天、無人機系統約 10 天、電動車約 5 天、導航約 1.4 天。
export const PRICE_RULE = { tripsPerDay: 2, perMin: PAY.latePerMin, carBase: 2000000, carDays: 60, upgradeDays: 10 };
// 每趟平均省下的遊戲分鐘數：2026/10/17 尖峰時段（車流 1.8 倍）實測，取中位數。
//   導航：300 組住家→公司，最快路線 vs「沒有導航、只看方向箭頭」的開法（每個路口往前看 3 個路口選路），tests/nav_saving.mjs → 11 分。
//   電動車：18 個公司附近，最近的空路邊格（早上 110 m 內停滿）vs 最近的電動車格，差的走路時間，tests/ev_measure.mjs → 約 0.2 分。
//   飛天跑車：8 組，同一條路線在車流裡開，一般車 vs 塞住時飛越車陣（每趟最多 3 次），tests/measure2.mjs → 20 分。
//   無人機：7 組，一般車開 vs 用無人機飛（含避撞、等降落），tests/measure2.mjs → 82 分（飛一趟約 12～14 分鐘）。
//   模擬的尖峰車速中位數 15 km/h（TomTom 2025 臺北：早上尖峰 19 km/h、晚上 15 km/h）。
export const SAVED_MIN = { nav: 11, ev: 0.2, roadster: 20, drone: 82 };
export const SAVED_MEASURED = true;
export const SAVED_NOTE = {
  nav: '尖峰實測：每趟約省 11 分鐘（不用自己找路、不會繞遠路）',
  ev: '實測：停車走路幾乎省不到時間（電動車格多在停車場裡，不一定比路邊近）；好處是電費比油錢便宜很多',
  roadster: '尖峰實測：每趟約省 20 分鐘（塞車時飛越車陣）',
  drone: '尖峰實測：每趟約省 82 分鐘；飛一趟約 12～14 分鐘，燃料費約 3～3.5 萬',
};

export const SHOP = [
  { key: 'nav', name: '導航系統', kind: 'upgrade', desc: '中控螢幕與小地圖顯示建議路線，轉彎前提示。' },
  { key: 'ev', name: '電動車', kind: 'car', car: 'ev', desc: '可以停停車場裡的電動車專用格（停的時候順便充電，很少被占滿），電費比油錢便宜很多。' },
  { key: 'roadster', name: '飛天跑車', kind: 'car', car: 'roadster', desc: '電動跑車（也是電動車：可以停電動車專用格、停的時候順便充電、在家充電，電費比油錢便宜）＋壓縮空氣推進器：約 1 秒破百、塞車時垂直升空飛越 10 台車、空中翻轉、吸附大樓外牆垂直開上屋頂、吸在高架橋底倒著開。特技都用壓縮空氣：滿罐約可飛越 8 次，用完特殊功能就停用；每晚在家補滿（3,000 元／罐）、停電動車充電格補（8,000 元／罐）、開車時每公里慢慢補 5%。（空氣罐的數字是遊戲設定，Tesla 沒有公布）' },
  { key: 'drone', name: '無人機飛行系統', kind: 'upgrade', requires: 'roadster', desc: '加裝在飛天跑車上（要先有飛天跑車，開飛天跑車時才能用）：塞車時按 U，車身伸出四組折疊旋翼（像多旋翼無人機），整台車升空，自動選最空的高度層、用參考 NASA DAIDALUS 的避撞方法閃開別架無人機和超高大樓，飛到目的地附近；下方有車要在空中等。降落後旋翼收回，還是你的車。燃料費每分鐘 2,500 元，飛越久越貴。' },
];
export function priceOf(key) {
  const m = SAVED_MIN[key] || 0, r = PRICE_RULE, it = SHOP.find(s => s.key === key);
  const v = it && it.kind === 'car' ? r.carBase + m * r.tripsPerDay * r.perMin * r.carDays : m * r.tripsPerDay * r.perMin * r.upgradeDays;
  return Math.max(10000, Math.round(v / 10000) * 10000);
}

const SAVE_KEY = 'taipei-commute-v2';
// 三種玩法（世界設定不同），各自有自己的存檔
export const GAME_MODES = {
  normal: { key: 'normal', name: '一般', save: SAVE_KEY, give: [], car: null,
    desc: '大家開一般的車。' },
  allfly: { key: 'allfly', name: '全城飛天跑車', save: SAVE_KEY + '-allfly', give: ['roadster'], car: 'roadster',
    desc: '路上每一台車都是飛天跑車，你也是。' },
  alldrone: { key: 'alldrone', name: '全城無人機', save: SAVE_KEY + '-alldrone', give: ['roadster', 'drone'], car: 'roadster',
    desc: '每一台車都進入無人機系統，天上擠滿會飛的車。' },
  hybrid: { key: 'hybrid', name: '全城無人機・路空總控', save: SAVE_KEY + '-hybrid', give: ['roadster', 'drone'], car: 'roadster',
    desc: '每台車都有無人機系統，但路上照樣有車在開。想飛要先問路空總控中心。' },
};

export class Economy {
  constructor() { this.reset(); }
  reset() {
    this.money = 0; this.owned = new Set(); this.carKey = 'gas'; this.stuntFuel = 1; this.mode = this.mode || 'normal';
    this.moves = 0;   // 每買一樣新系統或車子，可以換一次住址或工作（玩家訂的）
    this.totals = { days: 0, late: 0, km: 0, earned: 0, spent: 0 };
    this.day = null;   // 今天的帳
    this.tripPay = PAY.trip; this.home = { kind: '房租', perDay: 0 };   // 這份工作每趟收入、住的費用（startDay 前由 setLife 設定）
  }
  /** 依住址和工作設定薪水、住的費用（每天開始時呼叫；同一個住址、工作永遠一樣）。 */
  setLife(home, homeDistrict, work, workDistrict) {
    this.tripPay = work ? jobPay(work, workDistrict) : PAY.trip;
    this.home = home ? homeCost(home, homeDistrict) : { kind: '房租', perDay: 0 };
  }
  toJSON() { return { money: this.money, owned: [...this.owned], carKey: this.carKey, stuntFuel: this.stuntFuel, totals: this.totals, moves: this.moves }; }
  fromJSON(o) {
    this.reset(); if (!o) return;
    this.money = o.money || 0; this.owned = new Set(o.owned || []); this.carKey = o.carKey || 'gas';
    this.stuntFuel = typeof o.stuntFuel === 'number' ? o.stuntFuel : 1; this.totals = Object.assign(this.totals, o.totals || {});
    this.moves = o.moves | 0;
  }
  has(key) { return this.owned.has(key); }
  /** 玩法：全城飛天跑車／全城無人機／路空總控一開始就有飛天跑車（和無人機系統），而且只能開它（世界上沒有別種車）。 */
  applyMode(m) {
    this.mode = GAME_MODES[m] ? m : 'normal'; const M = GAME_MODES[this.mode];
    for (const k of M.give) this.owned.add(k);
    if (M.car) this.carKey = M.car;
  }
  /** 擁有的車（油車一開始就有）。 */
  cars() { const M = GAME_MODES[this.mode]; if (M && M.car) return [M.car]; return ['gas', ...SHOP.filter(s => s.kind === 'car' && this.owned.has(s.key)).map(s => s.car)]; }
  buy(key) {
    const p = priceOf(key);
    if (this.owned.has(key)) return { ok: false, msg: '已經有了' };
    const it0 = SHOP.find(s => s.key === key);
    if (it0 && it0.requires && !this.owned.has(it0.requires)) return { ok: false, msg: '要先有飛天跑車才能買無人機飛行系統' };
    if (this.money < p) return { ok: false, msg: `還差 ${(p - this.money).toLocaleString()} 元` };
    this.money -= p; this.owned.add(key); this.totals.spent += p; this.moves++;
    const item = SHOP.find(s => s.key === key);
    if (item && item.kind === 'car') this.carKey = item.car;
    if (key === 'roadster') this.stuntFuel = 1;   // 新車的空氣罐是滿的
    return { ok: true, msg: `買了${item ? item.name : key}` };
  }

  /** 一天開始。 */
  startDay() { this.day = { pay: 0, payAm: 0, payPm: 0, late: 0, energy: 0, parking: 0, charge: 0, stunt: 0, drone: 0, repair: 0, lines: [] }; }
  /** 晚上回到家：用家裡的壓縮機把空氣罐補滿，回傳補的量（0..1）。錢算在今天。 */
  refillAirHome() { const f = Math.max(0, 1 - this.stuntFuel); this.day.stunt += f * AIR.homePrice; this.stuntFuel = 1; return f; }
  /** 在充電格補氣（每幀呼叫）。 */
  refillAirStation(frac) { const f = Math.min(frac, 1 - this.stuntFuel); if (f <= 0) return 0; this.stuntFuel += f; this.day.stunt += f * AIR.stationPrice; return f; }
  /** 上班打卡。 */
  clockIn(lateMin) {
    const d = this.day; d.late = Math.max(0, Math.round(lateMin));
    d.payAm = this.tripPay - Math.min(this.tripPay / 2, d.late * PAY.latePerMin); d.pay = d.payAm + d.payPm;
    return d.payAm;
  }
  /** 回到家：回家這趟的收入。 */
  homeTrip() { const d = this.day; d.payPm = this.tripPay; d.pay = d.payAm + d.payPm; }
  /** 開車用掉的能源（油車：公升；電動車：度）。 */
  addEnergy(spec, used, atHome = true) {
    if (used <= 0) return;
    const cost = spec.electric ? used * (atHome ? PAY.homeKwh : PAY.bayKwh) : used * PAY.gasPrice;
    this.day.energy += cost;
  }
  addParking(type) {
    if (type === 'road') this.day.parking += PAY.roadParkHr * PAY.workHours;
  }
  addDrone(cost) { this.day.drone += cost; }
  addRepair(cost) { this.day.repair = (this.day.repair || 0) + cost; }
  /** 一天結束：結算，回傳明細。 */
  endDay(km) {
    const d = this.day, housing = this.home.perDay, spend = Math.round(housing + d.energy + d.parking + d.charge + d.stunt + d.drone + (d.repair || 0));
    const net = Math.round(d.pay) - spend;
    this.money += net; this.totals.days++; this.totals.km += km; if (d.late) this.totals.late++;
    this.totals.earned += Math.round(d.pay); this.totals.spent += spend;
    return { pay: Math.round(d.pay), payAm: Math.round(d.payAm), payPm: Math.round(d.payPm), trip: this.tripPay, housing, housingKind: this.home.kind, late: d.late, energy: Math.round(d.energy), parking: Math.round(d.parking), stunt: Math.round(d.stunt), drone: Math.round(d.drone), repair: Math.round(d.repair || 0), spend, net, money: this.money };
  }
}

export const store = {
  key: SAVE_KEY,
  setMode(m) { this.key = (GAME_MODES[m] || GAME_MODES.normal).save; },
  get() { try { return JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(this.key, JSON.stringify(v)); } catch (e) { /* 存不了照樣能玩 */ } },
  clear() { try { localStorage.removeItem(this.key); } catch (e) { /* ignore */ } },
};
