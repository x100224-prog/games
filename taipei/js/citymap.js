// 全螢幕地圖：可以放大縮小、拖曳，有路名、停車場、你的車停在哪裡。
// 路名和停車場位置在 data/maplabels.json（tools/build_maplabels.py 從地圖小格整理出來），第一次打開地圖時才載入。
const GRID = 400;   // 道路的格網（公尺）：只畫畫面裡看得到的路
const ROAD_STYLE = [   // [最小比例尺（像素／公尺）, 顏色, 線寬（像素）, 放大後線寬（公尺）]
  [0, 'rgba(240,214,140,.95)', 2.2, 18], [0, 'rgba(240,214,140,.95)', 2.0, 16], [0, 'rgba(236,226,196,.9)', 1.7, 13],
  [0, 'rgba(214,220,226,.62)', 1.0, 10], [0.03, 'rgba(196,204,212,.5)', 0.8, 7], [0.1, 'rgba(170,180,190,.5)', 0.7, 5],
  [0.3, 'rgba(150,160,170,.45)', 0.6, 3.5], [0.03, 'rgba(214,220,226,.6)', 0.9, 8],
];
const LABEL_MIN = [0.07, 0.07, 0.1, 0.16, 0.28, 0.5, 0.9, 1e9];   // 這個比例尺以上才寫路名（大路先出現）

export class CityMap {
  constructor(canvas, meta) {
    this.cv = canvas; this.meta = meta; this.nav = null; this.labels = null; this.loading = false;
    this.cx = 0; this.cz = 0; this.s = 0.05; this.fitS = 0.03; this.base = null; this.grid = null;
    this.pointers = new Map(); this.onChange = null;
    this._bind();
  }
  setNav(nav) { if (nav && nav !== this.nav) { this.nav = nav; this.grid = null; this.base = null; } }
  async loadLabels() {
    if (this.labels || this.loading) return; this.loading = true;
    try { const r = await fetch('data/maplabels.json'); if (r.ok) { const d = await r.json(); this.labels = d; this._labelGrid(); this.onChange && this.onChange(); } } catch (err) { /* 沒有路名照樣能看 */ }
    this.loading = false;
  }
  get dpr() { return Math.min(2, window.devicePixelRatio || 1); }
  /** 依畫布大小算「整個台北」的比例尺；第一次打開時以你為中心。 */
  resize(center) {
    const cv = this.cv, dpr = this.dpr;
    cv.width = Math.max(1, Math.round(cv.clientWidth * dpr)); cv.height = Math.max(1, Math.round(cv.clientHeight * dpr));
    const [x0, z0, x1, z1] = this.meta.bounds;
    this.fitS = Math.min(cv.width / (x1 - x0), cv.height / (z1 - z0)) * 0.94 / dpr;
    this.minS = this.fitS * 0.8; this.maxS = 3.2;
    if (center) { this.cx = center.x; this.cz = center.z; this.s = Math.max(this.fitS, Math.min(this.maxS, Math.min(cv.width, cv.height) / dpr / 2600)); }
    this.base = null;
  }
  fitAll() { const [x0, z0, x1, z1] = this.meta.bounds; this.cx = (x0 + x1) / 2; this.cz = (z0 + z1) / 2; this.s = this.fitS; }
  zoomBy(f, px, py) {
    const cv = this.cv, dpr = this.dpr, W = cv.width / dpr, H = cv.height / dpr;
    if (px === undefined) { px = W / 2; py = H / 2; }
    const wx = this.cx + (px - W / 2) / this.s, wz = this.cz + (py - H / 2) / this.s;
    this.s = Math.max(this.minS, Math.min(this.maxS, this.s * f));
    this.cx = wx - (px - W / 2) / this.s; this.cz = wz - (py - H / 2) / this.s;
    this._clamp();
  }
  _clamp() { const [x0, z0, x1, z1] = this.meta.bounds; this.cx = Math.max(x0, Math.min(x1, this.cx)); this.cz = Math.max(z0, Math.min(z1, this.cz)); }
  // 滑鼠滾輪、拖曳、兩指縮放（畫面轉了 90 度時，手指的方向也要轉回來）
  _local(e) {
    const r = this.cv.getBoundingClientRect();
    if (document.documentElement.classList.contains('rot90')) return { x: e.clientY - r.top, y: r.right - e.clientX };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _bind() {
    const cv = this.cv;
    cv.style.touchAction = 'none';
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = this._local(e); this.zoomBy(Math.exp(-e.deltaY * 0.0016), p.x, p.y); this.onChange && this.onChange(); }, { passive: false });
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, this._local(e)); this._pinch = null; });
    cv.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = this._local(e), prev = this.pointers.get(e.pointerId); this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) { this.cx -= (p.x - prev.x) / this.s; this.cz -= (p.y - prev.y) / this.s; this._clamp(); }
      else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this._pinch) { this.zoomBy(d / this._pinch.d, mx, my); this.cx -= (mx - this._pinch.mx) / this.s; this.cz -= (my - this._pinch.my) / this.s; this._clamp(); }
        this._pinch = { d, mx, my };
      }
      this.onChange && this.onChange();
    });
    const up = (e) => { this.pointers.delete(e.pointerId); this._pinch = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  _buildGrid() {
    const nv = this.nav, g = new Map();
    for (let k = 0; k < nv.E; k++) {
      const a = nv.ea[k], b = nv.eb[k], key = Math.floor((nv.nx[a] + nv.nx[b]) / 2 / GRID) * 100003 + Math.floor((nv.nz[a] + nv.nz[b]) / 2 / GRID);
      let l = g.get(key); if (!l) g.set(key, l = []); l.push(k);
    }
    this.grid = g;
  }
  _labelGrid() {
    const L = this.labels.L, g = new Map();
    for (let i = 0; i < L.length; i += 5) { const key = Math.floor(L[i] / GRID) * 100003 + Math.floor(L[i + 1] / GRID); let l = g.get(key); if (!l) g.set(key, l = []); l.push(i); }
    const P = this.labels.P, pg = new Map();
    for (let i = 0; i < P.length; i += 2) { const key = Math.floor(P[i] / GRID) * 100003 + Math.floor(P[i + 1] / GRID); let l = pg.get(key); if (!l) pg.set(key, l = []); l.push(i); }
    this.lgrid = g; this.pgrid = pg;
  }
  _cells(x0, z0, x1, z1, fn) {
    for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++) for (let j = Math.floor(z0 / GRID); j <= Math.floor(z1 / GRID); j++) fn(i * 100003 + j);
  }
  /** 畫地圖。m：{ me, car, carParked, home, work, garage, route, districtIndex, status } */
  draw(m) {
    const cv = this.cv, g = cv.getContext('2d'), dpr = this.dpr, W = cv.width, H = cv.height, s = this.s * dpr;
    const X = (x) => (x - this.cx) * s + W / 2, Z = (z) => (z - this.cz) * s + H / 2;
    const vx0 = this.cx - W / 2 / s, vx1 = this.cx + W / 2 / s, vz0 = this.cz - H / 2 / s, vz1 = this.cz + H / 2 / s;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0d1115'; g.fillRect(0, 0, W, H);
    // 行政區
    this.meta.districts.forEach((d, i) => {
      g.beginPath();
      for (const r of d.poly) { for (let k = 0; k < r.length; k += 2) k ? g.lineTo(X(r[k]), Z(r[k + 1])) : g.moveTo(X(r[k]), Z(r[k + 1])); g.closePath(); }
      g.fillStyle = i === m.districtIndex ? '#173a30' : '#1a2128'; g.fill(); g.strokeStyle = '#3a4652'; g.lineWidth = 1.6 * dpr; g.stroke();
    });
    // 道路：放大時只畫看得到的格子
    if (this.nav) {
      if (!this.grid) this._buildGrid();
      const nv = this.nav, byCls = [[], [], [], [], [], [], [], []];
      this._cells(vx0 - 200, vz0 - 200, vx1 + 200, vz1 + 200, (key) => { const l = this.grid.get(key); if (l) for (const k of l) { const c = nv.ecls[k]; if (this.s >= ROAD_STYLE[c][0]) byCls[c].push(k); } });
      g.lineCap = 'round';
      for (const c of [6, 5, 4, 7, 3, 2, 1, 0]) {
        const l = byCls[c]; if (!l.length) continue; const st = ROAD_STYLE[c];
        g.strokeStyle = st[1]; g.lineWidth = Math.max(st[2] * dpr, Math.min(st[3] * s, 26 * dpr)); g.beginPath();
        for (const k of l) { const a = nv.ea[k], b = nv.eb[k]; g.moveTo(X(nv.nx[a]), Z(nv.nz[a])); g.lineTo(X(nv.nx[b]), Z(nv.nz[b])); }
        g.stroke();
      }
    }
    // 導航路線
    if (m.route) { const r = m.route; g.strokeStyle = 'rgba(80,170,255,0.95)'; g.lineWidth = Math.max(3 * dpr, Math.min(9 * s, 10 * dpr)); g.beginPath(); g.moveTo(X(r[0]), Z(r[1])); for (let i = 2; i < r.length; i += 2) g.lineTo(X(r[i]), Z(r[i + 1])); g.stroke(); }
    // 停車場（放大才看得到）
    if (this.labels && this.s >= 0.45) {   // 停車場：放大到街區才看得到（不然太密）
      const P = this.labels.P, sz = Math.max(13, Math.min(20, this.s * 20)) * dpr;
      g.font = `900 ${sz * 0.72}px "Barlow Semi Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      this._cells(vx0, vz0, vx1, vz1, (key) => { const l = this.pgrid.get(key); if (l) for (const i of l) { const x = X(P[i]), y = Z(P[i + 1]); g.fillStyle = '#2f6fd6'; g.fillRect(x - sz / 2, y - sz / 2, sz, sz); g.fillStyle = '#fff'; g.fillText('P', x, y + 1); } });
    }
    // 路名：大路先放，跟已經放的字重疊就不放
    const boxes = [];
    const free = (b) => { for (const o of boxes) if (b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1) return false; boxes.push(b); return true; };
    if (this.labels && this.s >= LABEL_MIN[0]) {
      const L = this.labels.L, N = this.labels.names, cand = [];
      this._cells(vx0, vz0, vx1, vz1, (key) => { const l = this.lgrid.get(key); if (l) for (const i of l) if (this.s >= LABEL_MIN[L[i + 3]]) cand.push(i); });
      cand.sort((a, b) => L[a + 3] - L[b + 3]);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const i of cand) {
        const x = X(L[i]), y = Z(L[i + 1]); if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
        const cls = L[i + 3], fs = (cls <= 2 ? 14 : cls <= 4 ? 12.5 : 11.5) * dpr, name = N[L[i + 4]], w = name.length * fs * 1.02, ang = L[i + 2] * Math.PI / 180;
        const hw = (Math.abs(Math.cos(ang)) * w + Math.abs(Math.sin(ang)) * fs) / 2 + 2 * dpr, hh = (Math.abs(Math.sin(ang)) * w + Math.abs(Math.cos(ang)) * fs) / 2 + 2 * dpr;
        if (!free({ x0: x - hw, x1: x + hw, y0: y - hh, y1: y + hh })) continue;
        g.save(); g.translate(x, y); g.rotate(ang);
        g.font = `${cls <= 3 ? 700 : 500} ${fs}px "Noto Sans TC", sans-serif`;
        g.strokeStyle = 'rgba(13,17,21,.9)'; g.lineWidth = 3.5 * dpr; g.strokeText(name, 0, 0);
        g.fillStyle = cls <= 2 ? '#ffe7a6' : '#e6edf2'; g.fillText(name, 0, 0); g.restore();
      }
    }
    // 行政區名稱（看整個台北時）
    if (this.s < 0.12) this.meta.districts.forEach((d) => {
      g.font = `700 ${14 * dpr}px "Noto Sans TC", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.strokeStyle = 'rgba(13,17,21,.85)'; g.lineWidth = 4 * dpr; g.strokeText(d.name, X(d.c[0]), Z(d.c[1])); g.fillStyle = '#c3ccd4'; g.fillText(d.name, X(d.c[0]), Z(d.c[1]));
    });
    // 標記：家、公司、地下停車位、你的車、你
    const pin = (x, z, col, text, sub) => {
      const px = X(x), py = Z(z), r = 8 * dpr;
      g.fillStyle = col; g.strokeStyle = '#0d1115'; g.lineWidth = 2.5 * dpr; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); g.stroke();
      if (!text) return;
      g.font = `700 ${13 * dpr}px "Noto Sans TC", sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      const t = sub ? `${text}・${sub}` : text;
      g.strokeStyle = 'rgba(13,17,21,.92)'; g.lineWidth = 4 * dpr; g.strokeText(t, px + r + 5 * dpr, py); g.fillStyle = col; g.fillText(t, px + r + 5 * dpr, py);
    };
    const tag = (x, z, bg, letter, text) => {
      const px = X(x), py = Z(z), sz = 20 * dpr;
      g.fillStyle = bg; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr; g.beginPath(); g.rect(px - sz / 2, py - sz / 2, sz, sz); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `900 ${14 * dpr}px "Barlow Semi Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, px, py + 1);
      if (text) { g.font = `700 ${13 * dpr}px "Noto Sans TC", sans-serif`; g.textAlign = 'left'; g.strokeStyle = 'rgba(13,17,21,.92)'; g.lineWidth = 4 * dpr; g.strokeText(text, px + sz / 2 + 5 * dpr, py); g.fillStyle = '#fff'; g.fillText(text, px + sz / 2 + 5 * dpr, py); }
    };
    if (m.home) pin(m.home.x, m.home.z, '#4fd08c', '家');
    if (m.work) pin(m.work.x, m.work.z, '#f5c518', m.work.n || '公司');
    if (m.garage) tag(m.garage.x, m.garage.z, m.garage.type === 'curb' ? '#2f7fd6' : '#5b3fd6', 'P', m.garage.type === 'curb' ? '住戶專用車位' : '地下停車場入口');
    if (m.car && m.carParked) tag(m.car.x, m.car.z, '#d6453b', 'P', '你的車停在這裡');
    if (m.me) {
      g.save(); g.translate(X(m.me.x), Z(m.me.z)); g.rotate(-m.me.hd);
      g.fillStyle = '#fff'; g.strokeStyle = '#0d1115'; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(0, -13 * dpr); g.lineTo(9 * dpr, 10 * dpr); g.lineTo(0, 5 * dpr); g.lineTo(-9 * dpr, 10 * dpr); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    // 比例尺
    const nice = [50, 100, 200, 500, 1000, 2000, 5000].find(v => v * s > 70 * dpr) || 5000, bx = 16 * dpr, by = H - 18 * dpr;
    g.strokeStyle = '#e6edf2'; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(bx, by - 5 * dpr); g.lineTo(bx, by); g.lineTo(bx + nice * s, by); g.lineTo(bx + nice * s, by - 5 * dpr); g.stroke();
    g.font = `600 ${12 * dpr}px "Noto Sans TC", sans-serif`; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = '#e6edf2'; g.fillText(nice >= 1000 ? nice / 1000 + ' km' : nice + ' m', bx + 4 * dpr, by - 6 * dpr);
    if (m.status) { g.font = `700 ${15 * dpr}px "Noto Sans TC", sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = m.statusColor || '#9aa6b0'; g.fillText(m.status, 16 * dpr, 14 * dpr); }
  }
}
