// 招牌：真實店家（開放地圖有名字的店）＋自動產生的台灣街頭招牌（橫式、直立式）。
// 只畫玩家附近的招牌：字畫在共用的貼圖上，離開範圍就回收再用。
import * as THREE from '../lib/three.module.min.js';
import { hash2 } from './world.js';

// 品牌（順序要跟 tools/build_tiles.py 的 BRANDS 一致）
const BRANDS = ['7-ELEVEN', '7-11', '統一超商', '全家', 'FamilyMart', '萊爾富', 'OK', '全聯', '家樂福', '麥當勞', '肯德基', '摩斯',
  '星巴克', '路易莎', '85度C', '屈臣氏', '康是美', '中華郵政', '郵局', '寶雅', '大苑子', '五十嵐', '清心', '迷客夏', '50嵐',
  '漢堡王', '必勝客', '達美樂', '頂呱呱', '八方雲集', '四海遊龍', '丹丹', '吉野家', 'Mister Donut', '台灣大哥大', '中華電信', '遠傳',
  '台灣銀行', '土地銀行', '合作金庫', '第一銀行', '華南銀行', '彰化銀行', '國泰世華', '中國信託', '玉山銀行', '台新銀行', '富邦', '永豐',
  '中油', '台塑', '燦坤', '全國電子', '大創', '無印良品', '優衣庫', 'UNIQLO', 'NET', '日藥本舖', '大樹藥局', '杏一', '丁丁藥局'];

// 品牌配色：[底色, 字色, 條紋色...]
const BRAND_STYLE = {
  '7-ELEVEN': ['#ffffff', '#0a7b3e', '#f47a20', '#e2231a', '#0a7b3e'], '7-11': 'ref:7-ELEVEN', '統一超商': 'ref:7-ELEVEN',
  '全家': ['#ffffff', '#0069b4', '#00a650', '#0069b4'], 'FamilyMart': 'ref:全家',
  '萊爾富': ['#ffffff', '#e60012', '#e60012', '#1d2088'], 'OK': ['#ffffff', '#e60012', '#e60012'],
  '全聯': ['#0050a0', '#ffffff', '#ffd400'], '家樂福': ['#ffffff', '#0b4ea2', '#e2001a'],
  '麥當勞': ['#da291c', '#ffc72c'], '肯德基': ['#a3080c', '#ffffff'], '摩斯': ['#ffffff', '#0b6b3a', '#c8102e'],
  '星巴克': ['#00704a', '#ffffff'], '路易莎': ['#ffffff', '#2b2b2b'], '85度C': ['#7a1c22', '#ffffff'],
  '屈臣氏': ['#00a0af', '#ffffff'], '康是美': ['#e4007f', '#ffffff'], '中華郵政': ['#0a7b3e', '#ffffff'], '郵局': 'ref:中華郵政',
  '寶雅': ['#e5007e', '#ffffff'], '五十嵐': ['#fdd000', '#1d4f91'], '50嵐': 'ref:五十嵐', '清心': ['#e60012', '#ffffff'],
  '漢堡王': ['#f5ebdc', '#d62300'], '必勝客': ['#c8102e', '#ffffff'], '達美樂': ['#006491', '#ffffff', '#e31837'],
  '八方雲集': ['#e60012', '#ffffff'], '台灣大哥大': ['#ff6600', '#ffffff'], '中華電信': ['#0060b6', '#ffffff'], '遠傳': ['#e60012', '#ffffff'],
  '台灣銀行': ['#ffffff', '#1d3c78'], '合作金庫': ['#ffffff', '#007a3d'], '第一銀行': ['#ffffff', '#00477f'], '國泰世華': ['#00704a', '#ffffff'],
  '中國信託': ['#ffffff', '#e60012', '#007a5e'], '玉山銀行': ['#ffffff', '#00805a'], '台新銀行': ['#e60012', '#ffffff'],
  '中油': ['#ffffff', '#0a5bab', '#e60012'], '燦坤': ['#ffd400', '#e60012'], '全國電子': ['#00489a', '#ffffff'],
  '大創': ['#e4007f', '#ffffff'], '無印良品': ['#7f0019', '#ffffff'], 'UNIQLO': ['#e60012', '#ffffff'], '優衣庫': 'ref:UNIQLO',
  '大樹藥局': ['#0a8f4a', '#ffffff'], '杏一': ['#0a6fb4', '#ffffff'], '丁丁藥局': ['#ffffff', '#e60012'],
};

// 自動產生的店名（虛構）
const ROOTS = ['永和', '大同', '新光', '福興', '日新', '建國', '中興', '和平', '長春', '金鼎', '鴻運', '吉祥', '順發', '三多', '聯合', '佳佳',
  '興隆', '大眾', '正記', '萬達', '美好', '一品', '老街', '文化', '光明', '旺來', '幸福', '名人', '天天', '豐盛'];
const FOOD = ['牛肉麵', '水餃', '便當', '滷肉飯', '麵線', '鍋貼', '小吃部', '火鍋', '燒臘', '快炒', '自助餐', '鹽酥雞', '早餐店', '豆漿店',
  '排骨飯', '海產粥', '雞肉飯', '涼麵', '炒飯', '臭豆腐', '麵包店', '飲料店', '刈包', '粥品'];
const SHOP = ['眼鏡', '五金行', '機車行', '通訊行', '美髮', '洗衣店', '文具', '藥局', '中醫診所', '牙醫診所', '房屋仲介', '水電行', '花店',
  '茶行', '彩券行', '服飾', '鞋店', '寵物美容', '補習班', '汽車美容', '電器行', '鎖店', '影印', '當舖', '銀樓', '診所', '機車行', '美甲'];
const VERT = ['旅館', 'KTV', '牙醫', '中醫', '補習班', '診所', '小兒科', '按摩', '美容美髮', '英語', '大飯店', '當舖', '銀樓', '牛肉麵'];
const FOOD_PRE = ['阿', '老', '小', '大'], NAMES = ['明', '華', '陳', '林', '王', '張', '黃', '美', '珍', '福', '鴻', '興', '雄', '英', '玲'];

const PALETTES = [
  ['#c8102e', '#ffffff'], ['#ffd400', '#c8102e'], ['#0b4ea2', '#ffffff'], ['#ffffff', '#c8102e'], ['#1b7a3e', '#ffffff'], ['#ffffff', '#0b4ea2'],
  ['#f39800', '#ffffff'], ['#2b2b2b', '#ffd400'], ['#ffffff', '#1b1b1b'], ['#e4007f', '#ffffff'], ['#0a8f8f', '#ffffff'], ['#7a1c22', '#ffe9a8'],
];
const CAT_PAL = { 3: [['#ffffff', '#0b4ea2'], ['#ffffff', '#007a3d']], 4: [['#ffffff', '#1b7a3e'], ['#1b7a3e', '#ffffff']], 7: [['#2b2b2b', '#ffd27a']] };

const ROAD_STYLE = { bg: '#0d6b45', fg: '#ffffff', stripes: [], road: true };   // 路名牌：綠底白字

function styleFor(text, cat, brand, seed) {
  if (brand >= 0) {
    let st = BRAND_STYLE[BRANDS[brand]];
    if (typeof st === 'string') st = BRAND_STYLE[st.slice(4)];
    if (st) return { bg: st[0], fg: st[1], stripes: st.slice(2) };
  }
  const pool = CAT_PAL[cat] || PALETTES;
  const p = pool[Math.floor(seed * 9973) % pool.length];
  return { bg: p[0], fg: p[1], stripes: [] };
}

export function genShopName(seed, cat) {
  const r = (k) => hash2(Math.floor(seed * 1e6) + k * 977, k * 31 + 7);
  if (cat === 1 || r(1) < 0.42) {
    const food = FOOD[Math.floor(r(2) * FOOD.length)];
    return r(3) < 0.5 ? FOOD_PRE[Math.floor(r(4) * 4)] + NAMES[Math.floor(r(5) * NAMES.length)] + food : NAMES[Math.floor(r(5) * NAMES.length)] + '記' + food;
  }
  return ROOTS[Math.floor(r(6) * ROOTS.length)] + SHOP[Math.floor(r(7) * SHOP.length)];
}
export function genVerticalName(seed) {
  const r = (k) => hash2(Math.floor(seed * 1e6) + k * 131, k * 17 + 3);
  return ROOTS[Math.floor(r(1) * ROOTS.length)] + VERT[Math.floor(r(2) * VERT.length)];
}

const HS = { w: 256, h: 64, cols: 8, rows: 32 };      // 橫式：2048×2048
const VS = { w: 64, h: 256, cols: 16, rows: 4 };       // 直式：1024×1024

export class SignManager {
  constructor(scene) {
    this.scene = scene;
    this.all = new Map();            // cellKey -> [sign]
    this._t = 0;
    this.pages = [this._page(HS, false), this._page(VS, true)];
  }

  _page(S, vertical) {
    const cv = document.createElement('canvas'); cv.width = S.w * S.cols; cv.height = S.h * S.rows;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.32, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false; mesh.castShadow = false;
    this.scene.add(mesh);
    return { S, vertical, cv, ctx, tex, mesh, slots: new Array(S.cols * S.rows).fill(null), active: new Map() };
  }

  addCell(cell, list) { if (list.length) this.all.set(cell.key, list); }
  removeCell(cell) { this.all.delete(cell.key); }

  _draw(pg, slot, s) {
    const { S, ctx } = pg, cx = (slot % S.cols) * S.w, cy = Math.floor(slot / S.cols) * S.h;
    const st = s.style;
    ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, S.w, S.h); ctx.clip();
    ctx.fillStyle = st.bg; ctx.fillRect(cx, cy, S.w, S.h);
    const font = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    if (st.road && !pg.vertical) {
      // 路名牌：白色外框、中文大字、下面一行英文
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.strokeRect(cx + 4, cy + 4, S.w - 8, S.h - 8);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = s.en ? 30 : 38; ctx.font = `700 ${size}px ${font}`;
      const maxW = S.w * ((s.arrows || 0) ? 0.66 : 0.86), w = ctx.measureText(s.text).width; if (w > maxW) { size = Math.max(14, size * maxW / w); ctx.font = `700 ${size}px ${font}`; }
      const ar = s.arrows || 0, pad = ar ? 30 : 0;
      ctx.fillText(s.text, cx + S.w / 2 + ((ar & 1) ? pad / 2 : 0) - ((ar & 2) ? pad / 2 : 0), cy + S.h * (s.en ? 0.38 : 0.53));
      // 箭頭：相交道路往哪邊有路
      ctx.font = `700 ${s.en ? 24 : 30}px ${font}`;
      if (ar & 1) ctx.fillText('◀', cx + 22, cy + S.h * 0.5);
      if (ar & 2) ctx.fillText('▶', cx + S.w - 22, cy + S.h * 0.5);
      if (s.en) {
        let es = 15; ctx.font = `600 ${es}px "Helvetica Neue", Arial, sans-serif`;
        const ew = ctx.measureText(s.en).width; if (ew > maxW) { es = Math.max(9, es * maxW / ew); ctx.font = `600 ${es}px "Helvetica Neue", Arial, sans-serif`; }
        ctx.fillText(s.en, cx + S.w / 2, cy + S.h * 0.76);
      }
      ctx.restore(); return;
    }
    if (!pg.vertical) {
      // 品牌條紋放在下緣
      if (st.stripes.length) {
        const sh = S.h * 0.14 / st.stripes.length;
        st.stripes.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(cx, cy + S.h - sh * (st.stripes.length - i), S.w, sh); });
      }
      ctx.fillStyle = st.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = 42; ctx.font = `900 ${size}px ${font}`;
      const maxW = S.w * 0.9;
      const w = ctx.measureText(s.text).width; if (w > maxW) { size = Math.max(16, size * maxW / w); ctx.font = `900 ${size}px ${font}`; }
      ctx.fillText(s.text, cx + S.w / 2, cy + S.h * (st.stripes.length ? 0.44 : 0.52));
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3; ctx.strokeRect(cx + 1.5, cy + 1.5, S.w - 3, S.h - 3);
    } else {
      ctx.fillStyle = st.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const chars = [...s.text].slice(0, 6), n = chars.length, size = Math.min(52, S.h * 0.86 / n);
      ctx.font = `900 ${size}px ${font}`;
      chars.forEach((ch, i) => ctx.fillText(ch, cx + S.w / 2, cy + S.h * 0.07 + (i + 0.5) * (S.h * 0.86 / n)));
      ctx.strokeStyle = st.fg; ctx.lineWidth = 3; ctx.strokeRect(cx + 3, cy + 3, S.w - 6, S.h - 6);
    }
    ctx.restore();
  }

  update(dt, px, pz) {
    this._t -= dt; if (this._t > 0) return; this._t = 0.6;
    const R2 = 170 * 170, near = [];
    for (const list of this.all.values()) for (const s of list) {
      const d2 = (s.x - px) ** 2 + (s.z - pz) ** 2; if (d2 < R2) { s._d2 = d2; near.push(s); }
    }
    near.sort((a, b) => a._d2 - b._d2);
    for (const pg of this.pages) {
      const want = near.filter(s => s.vertical === pg.vertical).slice(0, pg.slots.length);
      const wantSet = new Set(want);
      let changed = false;
      for (const [s, slot] of pg.active) if (!wantSet.has(s)) { pg.active.delete(s); pg.slots[slot] = null; changed = true; }
      for (const s of want) {
        if (pg.active.has(s)) continue;
        const slot = pg.slots.indexOf(null); if (slot < 0) break;
        if (!s.style) s.style = s.road ? ROAD_STYLE : styleFor(s.text, s.cat, s.brand, s.seed);
        pg.slots[slot] = s; pg.active.set(s, slot); this._draw(pg, slot, s); changed = true;
      }
      if (changed) { pg.tex.needsUpdate = true; this._rebuild(pg); }
    }
  }

  _rebuild(pg) {
    const P = [], N = [], U = [], I = [], { S } = pg, W = S.w * S.cols, H = S.h * S.rows;
    for (const [s, slot] of pg.active) {
      const u0 = (slot % S.cols) * S.w / W, u1 = u0 + S.w / W, v1 = 1 - Math.floor(slot / S.cols) * S.h / H, v0 = v1 - S.h / H;
      // 招牌平面：寬度方向 (tx,tz)、法線 (nx,nz)
      const tx = s.tx, tz = s.tz, hw = s.w / 2, hh = s.h / 2, b = P.length / 3;
      const corners = [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]];
      for (const [a, c, u, v] of corners) { P.push(s.x + tx * a, s.y + c, s.z + tz * a); N.push(s.nx, 0, s.nz); U.push(u, v); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      if (s.box) {
        // 招牌有厚度：側邊與上下緣用招牌底色的一小塊
        const d = s.box, bb = P.length / 3, ub = u0 + 0.002, vb = v0 + 0.002;
        for (const [a, c] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) { P.push(s.x + tx * a - s.nx * d, s.y + c, s.z + tz * a - s.nz * d); N.push(s.nx, 0, s.nz); U.push(ub, vb); }
        for (const [p0, p1] of [[0, 1], [1, 2], [2, 3], [3, 0]]) I.push(b + p0, bb + p0, bb + p1, b + p0, bb + p1, b + p1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    pg.mesh.geometry.dispose(); pg.mesh.geometry = g;
  }
}

export { BRANDS };
