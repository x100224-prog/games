// 台北城市：依玩家位置載入／卸載 500 m 小格，產生道路、標線、建物、綠地與水域的 3D 模型，
// 並提供路面高度、碰撞、最近道路等空間查詢。
import * as THREE from '../lib/three.module.min.js';
import { VIEW } from './config.js';

/** 把以 sRGB 寫的顏色轉成頂點色用的線性值。 */
export const srgb = (r, g, b) => { const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace); return [c.r, c.g, c.b]; };
const ROAD_Y = 0.05;
const MARK_Y = 0.17;
const ROAD_RGB = [
  [0.200, 0.212, 0.235], [0.215, 0.226, 0.248], [0.228, 0.238, 0.258], [0.245, 0.254, 0.272],
  [0.262, 0.270, 0.286], [0.290, 0.296, 0.308], [0.318, 0.322, 0.330], [0.215, 0.226, 0.248],
].map(c => srgb(...c));
const TUNNEL_RGB = srgb(0.16, 0.17, 0.19);
const TUNNEL_WALL = srgb(0.74, 0.72, 0.66), TUNNEL_TOP = srgb(0.30, 0.31, 0.32), TUNNEL_LAMP = srgb(1.0, 0.86, 0.6);
const WHITE = srgb(0.90, 0.91, 0.89), YELLOW = srgb(0.93, 0.74, 0.16);
const CONCRETE = srgb(0.66, 0.66, 0.64), PIER_A = srgb(0.56, 0.56, 0.54), PIER_B = srgb(0.62, 0.62, 0.60);
const SOFFIT = srgb(0.5, 0.5, 0.49);
const GREEN = srgb(0.50, 0.66, 0.42), WATER = srgb(0.40, 0.60, 0.74), LOT = srgb(0.33, 0.34, 0.36);
const LAND = srgb(0.585, 0.585, 0.572), HILL = srgb(0.52, 0.60, 0.44);

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const PAL = {
  0: ['#cfc8bb', '#d9d2c5', '#b9b4aa', '#c9b8a6', '#bfc4c4', '#d6cdbd', '#a9a59c', '#e0d9cf', '#c4a999', '#b7ab98', '#c2c9c0'].map(hex),
  2: ['#8fa3b3', '#9aa9b5', '#7f8d99', '#b5bcc2', '#6f8496', '#a8b4bd', '#c9c2b4'].map(hex),
  3: ['#9aa0a3', '#8c9399', '#a3a59c', '#b0a898'].map(hex),
  4: ['#c8b9a4', '#b99c86', '#d2c4b0', '#c1a58c', '#cdbfae'].map(hex),
  5: ['#c0574a', '#b84f3f'].map(hex),
  6: ['#8d949a', '#9a9f98'].map(hex),
};
PAL[1] = PAL[0];
const ROOF_GREY = ['#8e8f8c', '#9a9a96', '#84868a', '#a3a199'].map(hex);
const ROOF_SHEET = ['#8a4b3e', '#4f7f66', '#4b6f8f', '#7d4a3a', '#5e8a72'].map(hex);
const ROOF_TEMPLE = hex('#d1873a');

/** 號誌桿橫臂長度（跟 tools/build_tiles.py 的 arm_len 一致）。 */
export const signalArm = (width) => Math.max(4.0, Math.min(8.5, width * 0.55 + 1.5));

export function hash2(a, b) {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

class Geo {
  constructor(extra) { this.p = []; this.n = []; this.c = []; this.i = []; this.extra = extra ? {} : null; if (extra) for (const k of extra) this.extra[k] = []; }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, col) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); return this.p.length / 3 - 1; }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  build(sizes) {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.extra) for (const k in this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(this.extra[k], sizes[k]));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- 道路上的位置
/** 在 edge 上距起點 s 公尺處的位置與切線方向，寫入 out {x,y,z,dx,dz,i}。 */
export function edgePoint(e, s, out) {
  const cum = e.cum, n = cum.length;
  if (s <= 0) s = 0; else if (s >= e.len) s = e.len;
  let i = out.i | 0;
  if (!(i >= 0 && i < n - 1 && cum[i] <= s && cum[i + 1] >= s)) {
    let lo = 0, hi = n - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
    i = lo;
  }
  const seg = cum[i + 1] - cum[i] || 1e-6, t = (s - cum[i]) / seg;
  const ax = e.pts[i * 2], az = e.pts[i * 2 + 1], bx = e.pts[i * 2 + 2], bz = e.pts[i * 2 + 3];
  out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t;
  out.dx = (bx - ax) / seg; out.dz = (bz - az) / seg;
  out.y = e.hs[i] + (e.hs[i + 1] - e.hs[i]) * t;
  out.i = i;
  return out;
}

const _pt = { x: 0, y: 0, z: 0, dx: 0, dz: 0, i: 0 };
const _surfTmp = { y: 0, edge: null, s: 0, lat: 0, i: 0, t: 0, _d2: 0 };

/** 往 Geo 加一個可旋轉的長方體（yaw 繞 y 軸）。 */
function addBox(g, cx, cy, cz, w, h, d, yaw, col, colTop) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
  const faces = [
    [[1, 0, 0], [[w, -h, -d], [w, -h, d], [w, h, d], [w, h, -d]]], [[-1, 0, 0], [[-w, -h, d], [-w, -h, -d], [-w, h, -d], [-w, h, d]]],
    [[0, 0, 1], [[w, -h, d], [-w, -h, d], [-w, h, d], [w, h, d]]], [[0, 0, -1], [[-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d]]],
    [[0, 1, 0], [[-w, h, -d], [w, h, -d], [w, h, d], [-w, h, d]]],
  ];
  for (const [n, q] of faces) {
    const nx = n[0] * c + n[2] * s, nz = -n[0] * s + n[2] * c, colr = n[1] > 0 && colTop ? colTop : col;
    const idx = q.map(([x, y, z]) => { const p = P(x / 2, y / 2, z / 2); return g.v(p[0], p[1], p[2], nx, n[1], nz, colr); });
    g.quad(idx[0], idx[1], idx[2], idx[3]);
  }
}
function addCyl(g, cx, y0, cz, r, h, col, seg = 10) {
  const b = g.count;
  for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2, x = Math.cos(a), z = Math.sin(a); g.v(cx + x * r, y0, cz + z * r, x, 0, z, col); g.v(cx + x * r, y0 + h, cz + z * r, x, 0, z, col); }
  for (let k = 0; k < seg; k++) { const a = b + k * 2; g.i.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const c = g.v(cx, y0 + h, cz, 0, 1, 0, col);
  for (let k = 0; k < seg; k++) { const a = k / seg * Math.PI * 2, a2 = (k + 1) / seg * Math.PI * 2; const i1 = g.v(cx + Math.cos(a) * r, y0 + h, cz + Math.sin(a) * r, 0, 1, 0, col), i2 = g.v(cx + Math.cos(a2) * r, y0 + h, cz + Math.sin(a2) * r, 0, 1, 0, col); g.i.push(c, i2, i1); }
}
/** 行道樹：樹幹＋幾團樹冠（頂點顏色有深淺變化）。高約 7 m。 */
function makeTreeGeo() {
  const g = new Geo();
  addCyl(g, 0, 0, 0, 0.16, 2.6, srgb(0.36, 0.27, 0.2), 7);
  const blobs = [[0, 4.2, 0, 1.9], [0.9, 3.7, 0.4, 1.4], [-0.8, 3.9, -0.5, 1.5], [0.2, 5.3, -0.2, 1.4], [-0.4, 3.4, 0.9, 1.2]];
  for (const [bx, by, bz, br] of blobs) {
    const ico = new THREE.IcosahedronGeometry(br, 1).toNonIndexed(), p = ico.attributes.position, n = ico.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      const t = hash2(Math.round(p.getX(i) * 100 + bx * 7), Math.round(p.getY(i) * 100 + by * 13));
      const col = srgb(0.20 + t * 0.12, 0.36 + t * 0.16, 0.16 + t * 0.06);
      for (let k = 0; k < 3; k++) {
        const j = i + k, jit = 0.85 + hash2(Math.round(p.getX(j) * 50), Math.round(p.getZ(j) * 50)) * 0.3;
        g.v(bx + p.getX(j) * jit, by + p.getY(j) * jit, bz + p.getZ(j) * jit, n.getX(j), n.getY(j), n.getZ(j), col);
      }
      g.i.push(g.count - 3, g.count - 2, g.count - 1);
    }
  }
  return g.build();
}
/** 冷氣室外機（窗型／分離式）：0.8 × 0.55 × 0.32 m，正面是深色散熱格柵。 */
function makeACGeo() {
  const g = new Geo();
  addBox(g, 0, 0, 0, 0.8, 0.55, 0.32, 0, srgb(0.86, 0.86, 0.83));
  const b = g.count, c = srgb(0.35, 0.36, 0.37);
  g.v(-0.3, -0.2, 0.162, 0, 0, 1, c); g.v(0.3, -0.2, 0.162, 0, 0, 1, c); g.v(0.3, 0.2, 0.162, 0, 0, 1, c); g.v(-0.3, 0.2, 0.162, 0, 0, 1, c);
  g.quad(b, b + 1, b + 2, b + 3);
  addBox(g, 0, -0.33, -0.05, 0.9, 0.04, 0.42, 0, srgb(0.5, 0.5, 0.5));   // 鐵架
  return g.build();
}

export class World {
  constructor(scene, meta, base) {
    this.scene = scene; this.meta = meta; this.base = base;
    this.CELL = meta.cell; this.TC = meta.tileCells; this.TILE = this.CELL * this.TC;
    this.cells = new Map(); this.tiles = new Map();
    this.tileSet = new Set(meta.tiles.map(t => t[0] + '_' + t[1]));
    this.nodes = new Map(); this.edges = new Map();
    this.segGrid = new Map(); this.bldGrid = new Map();
    this.G = 32;
    this.onCellReady = []; this.onCellUnload = [];
    this.queue = []; this._t = 0; this._stamp = 0;
    this.loadedCount = 0;
    this.barriers = [];
    this._makeMaterials();
    this.root = new THREE.Group(); scene.add(this.root);
    this._landmarks();
    this.districts = meta.districts.map(d => ({ name: d.name, polys: d.poly }));
  }

  _makeMaterials() {
    this.matRoad = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.matMark = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, fog: true });
    this.matGround = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matPath = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.matTerrain = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.matStruct = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // 建物外牆：台灣常見的磁磚牆、鋁窗＋鐵窗、樓層板、帷幕玻璃、一樓騎樓店面（全部用 shader 畫，不需要貼圖）
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 wuv;\nattribute vec2 seed;\nvarying vec4 vWuv;\nflat varying vec2 vSeed;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWuv = wuv; vSeed = seed;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec4 vWuv;
flat varying vec2 vSeed;
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 LIN(vec3 c){ return pow(c, vec3(2.2)); }
float boxm(vec2 f, vec2 lo, vec2 hi){ return step(lo.x, f.x) * step(f.x, hi.x) * step(lo.y, f.y) * step(f.y, hi.y); }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (vWuv.z >= 0.0) {
          float bt = vWuv.z, flags = vWuv.w, H = vSeed.y, sd = vSeed.x;
          float u = vWuv.x, v = vWuv.y;
          vec3 wall = diffuseColor.rgb;
          vec2 fwv = fwidth(vWuv.xy); float px = max(fwv.x, fwv.y);
          float street = mod(flags, 2.0);
          vec3 V = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(abs(dot(normalize(normal), V)), 0.0, 1.0), 2.2);
          vec3 sky = LIN(vec3(0.66, 0.76, 0.86));
          vec3 col = wall;
          bool curtain = bt > 1.5 && bt < 2.5 && H > 18.0;
          if (v > H - 0.05) {
            col = wall * 0.92;                                   // 女兒牆
          } else if (curtain) {
            // 帷幕玻璃大樓：直向鋁框、每層一道窗間牆
            vec2 g = vec2(u / 1.5, v / 3.8); vec2 f = fract(g);
            float mull = 1.0 - boxm(f, vec2(0.04, 0.0), vec2(0.96, 1.0));
            float spand = 1.0 - step(0.16, f.y);
            float r = h21(floor(g) + sd * 37.0);
            vec3 gl = mix(LIN(vec3(0.16, 0.22, 0.28)), LIN(vec3(0.30, 0.40, 0.50)), r * 0.6);
            gl = mix(gl, sky, 0.25 + 0.55 * fres);
            vec3 c = mix(gl, LIN(vec3(0.70, 0.72, 0.74)), max(mull, spand * 0.85));
            float fade = 1.0 - smoothstep(0.25, 0.9, px / 1.5 * 6.0);
            col = mix(mix(gl, LIN(vec3(0.6, 0.62, 0.64)), 0.12), c, fade);
          } else {
            // 一般公寓：每層 3.2 m、每 2.7 m 一扇窗
            float fh = 3.2, bw = bt > 1.5 && bt < 2.5 ? 3.0 : 2.7;
            vec2 g = vec2(u / bw, v / fh); vec2 id = floor(g); vec2 f = fract(g);
            float r = h21(id + sd * 91.7), r2 = h21(id.yx + sd * 13.1);
            // 磁磚：細格線（近看才看得到）
            vec2 tg = fract(vec2(u / 0.3, v / 0.1));
            float tl = (1.0 - smoothstep(0.0, 0.08, min(tg.x, 1.0 - tg.x))) * 0.5 + (1.0 - smoothstep(0.0, 0.12, min(tg.y, 1.0 - tg.y)));
            float tfade = 1.0 - smoothstep(0.012, 0.04, px);
            vec3 w2 = wall * (1.0 - 0.07 * clamp(tl, 0.0, 1.0) * tfade);
            // 樓板線
            float slab = 1.0 - smoothstep(0.0, 0.06, abs(f.y - 0.02) * fh);
            w2 = mix(w2, wall * 0.78, slab * 0.8);
            // 窗
            float wsz = mix(0.5, 0.72, step(0.5, h21(vec2(id.x, sd))));       // 每一欄窗戶寬度不同
            vec2 lo = vec2(0.5 - wsz * 0.5, 0.26), hi = vec2(0.5 + wsz * 0.5, 0.84);
            float win = boxm(f, lo, hi);
            vec2 fi = (f - lo) / (hi - lo);
            float frame = win * (1.0 - boxm(fi, vec2(0.05, 0.07), vec2(0.95, 0.93)));
            float midbar = win * (1.0 - step(0.022, abs(fi.x - 0.5)));
            vec3 glass = mix(LIN(vec3(0.12, 0.15, 0.18)), LIN(vec3(0.24, 0.28, 0.30)), r);
            glass = mix(glass, LIN(vec3(0.72, 0.62, 0.50)), step(0.82, r2) * 0.6);   // 有窗簾
            glass = mix(glass, sky, 0.18 + 0.5 * fres);
            vec3 c = mix(w2, glass, win);
            c = mix(c, LIN(vec3(0.80, 0.81, 0.80)), max(frame, midbar));
            // 鐵窗：住宅低樓層常見
            float grill = step(bt, 1.5) * step(0.38, h21(vec2(sd, id.x * 0.37))) * step(id.y, 5.0) * step(1.0, id.y);
            if (grill > 0.5) {
              vec2 gf = vec2(fract((u - (id.x + lo.x) * bw) / 0.14), fract(v / 0.55));
              float bars = (1.0 - step(0.16, gf.x)) + (1.0 - step(0.05, gf.y));
              vec2 cage = (f - lo + vec2(0.04, 0.03)) / (hi - lo + vec2(0.08, 0.06));
              float inCage = boxm(cage, vec2(0.0), vec2(1.0));
              float gfade = 1.0 - smoothstep(0.02, 0.06, px);
              c = mix(c, LIN(vec3(0.28, 0.29, 0.30)), clamp(bars, 0.0, 1.0) * inCage * gfade * 0.85);
              c = mix(c, LIN(vec3(0.42, 0.43, 0.44)), (inCage - win) * 0.6);
            }
            float fade = 1.0 - smoothstep(0.08, 0.5, px * 4.0);
            vec3 avg = mix(wall * 0.95, LIN(vec3(0.26, 0.31, 0.36)), (hi.x - lo.x) * (hi.y - lo.y) * 0.9);
            col = mix(avg, c, fade);
            // 一樓：臨街的騎樓店面
            if (v < 3.3 && street > 0.5 && bt < 2.5) {
              float bay = u / 4.6 + sd * 7.0; float bid = floor(bay), bf = fract(bay);
              float pillar = 1.0 - boxm(vec2(bf, 0.5), vec2(0.09, 0.0), vec2(0.91, 1.0));
              float shut = step(0.78, h21(vec2(bid, sd * 3.0)));                       // 拉下鐵捲門
              vec3 shop = mix(LIN(vec3(0.24, 0.21, 0.17)), LIN(vec3(0.85, 0.74, 0.52)), smoothstep(0.2, 2.2, v) * 0.55 * (0.6 + 0.4 * h21(vec2(bid, 1.7 + sd))));
              vec3 shutter = LIN(vec3(0.55, 0.56, 0.57)) * (0.86 + 0.14 * step(0.5, fract(v / 0.09)));
              vec3 front = mix(shop, shutter, shut);
              front = mix(front, LIN(vec3(0.60, 0.60, 0.58)), step(2.75, v));           // 騎樓樑
              col = mix(front, wall * 0.85, pillar);
            } else if (v < 3.3) {
              col = mix(col, wall * 0.82, 0.5);
            }
          }
          diffuseColor.rgb = col;
        }`);
    };
    this.matBld = m;
    this.matDeco = new THREE.MeshLambertMaterial({ vertexColors: true });
    // 人行道地磚貼圖（畫在 canvas 上）
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#9d9792'; c2.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const t = (x * 7 + y * 13) % 5; c2.fillStyle = ['#a8a29c', '#9f9893', '#b0aaa3', '#a39d96', '#968f8a'][t];
      c2.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
    c2.fillStyle = '#c9c6bf'; c2.fillRect(0, 0, 256, 18);                    // 路緣石
    c2.fillStyle = '#d9b43a'; c2.fillRect(0, 30, 256, 26);                   // 導盲磚
    c2.fillStyle = '#c29f2c'; for (let x = 4; x < 256; x += 10) for (let y = 34; y < 54; y += 10) c2.fillRect(x, y, 4, 4);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    this.matWalk = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this._treeGeo = makeTreeGeo(); this._acGeo = makeACGeo();
    this.matTree = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  _landmarks() {
    // 超高建物（例如台北 101）在遠處也畫出剪影
    this.landmarks = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x8fa3b5, fog: false, transparent: true, opacity: 0.55 });
    for (const lm of this.meta.landmarks || []) {
      const sh = new THREE.Shape();
      let cx = 0, cz = 0; const n = lm.pts.length / 2;
      for (let i = 0; i < n; i++) { cx += lm.pts[i * 2]; cz += lm.pts[i * 2 + 1]; }
      cx /= n; cz /= n;
      for (let i = 0; i < n; i++) { const x = lm.pts[i * 2] - cx, z = lm.pts[i * 2 + 1] - cz; i ? sh.lineTo(x, -z) : sh.moveTo(x, -z); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: lm.h, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(cx, lm.base || 0, cz);
      this.root.add(mesh);
      this.landmarks.push({ mesh, x: cx, z: cz, name: lm.n, h: lm.h });
    }
  }

  // ------------------------------------------------------------- 載入排程
  cellKey(cx, cz) { return cx + ',' + cz; }
  cellAt(x, z) { return this.cells.get(Math.floor(x / this.CELL) + ',' + Math.floor(z / this.CELL)); }

  /** (x,z) 周圍 r 公尺內的小格是否都已載入完成。 */
  readyAround(x, z, r) {
    const C = this.CELL;
    for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++)
      for (let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) {
        const c = this.cells.get(cx + ',' + cz);
        if (!c || c.state === 'pending') return false;
      }
    return true;
  }

  update(px, pz, dt, budgetMs = 7) {
    this._t -= dt;
    const C = this.CELL;
    if (this._t <= 0) {
      this._t = 0.25;
      const R = VIEW.loadRadius + C * 0.7;
      for (let cx = Math.floor((px - R) / C); cx <= Math.floor((px + R) / C); cx++)
        for (let cz = Math.floor((pz - R) / C); cz <= Math.floor((pz + R) / C); cz++) {
          const mx = (cx + 0.5) * C - px, mz = (cz + 0.5) * C - pz;
          if (mx * mx + mz * mz > R * R) continue;
          const key = cx + ',' + cz;
          if (this.cells.has(key)) continue;
          const tx = Math.floor(cx / this.TC), tz = Math.floor(cz / this.TC), tk = tx + '_' + tz;
          const cell = { key, cx, cz, tk, tx, tz, state: 'pending', group: null, edges: [], blds: [], lots: [], poi: [] };
          this.cells.set(key, cell);
          if (!this.tileSet.has(tk)) { cell.state = 'empty'; this._ready(cell); continue; }
          this.queue.push(cell);
          this._requestTile(tk);
        }
      const U = VIEW.unloadRadius;
      for (const cell of this.cells.values()) {
        const mx = (cell.cx + 0.5) * C - px, mz = (cell.cz + 0.5) * C - pz;
        if (mx * mx + mz * mz > U * U) this._unload(cell);
      }
      for (const [tk, t] of this.tiles) {
        if (t.state !== 'ready') continue;
        const mx = (t.tx + 0.5) * this.TILE - px, mz = (t.tz + 0.5) * this.TILE - pz;
        if (mx * mx + mz * mz > 3600 * 3600) this.tiles.delete(tk);
      }
      this.queue.sort((a, b) => {
        const da = ((a.cx + 0.5) * C - px) ** 2 + ((a.cz + 0.5) * C - pz) ** 2;
        const db = ((b.cx + 0.5) * C - px) ** 2 + ((b.cz + 0.5) * C - pz) ** 2;
        return da - db;
      });
      for (const lm of this.landmarks) lm.mesh.visible = (lm.x - px) ** 2 + (lm.z - pz) ** 2 > 1250 * 1250;
    }
    const t0 = performance.now();
    for (let k = 0; k < this.queue.length;) {
      const cell = this.queue[k];
      if (cell.state !== 'pending') { this.queue.splice(k, 1); continue; }
      const tile = this.tiles.get(cell.tk);
      if (!tile) { this._requestTile(cell.tk); k++; continue; }
      if (tile.state === 'loading') { k++; continue; }
      this.queue.splice(k, 1);
      if (tile.state === 'error') { cell.state = 'empty'; this._ready(cell); continue; }
      this._build(cell, tile);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  get pending() { return this.queue.length; }

  _requestTile(tk) {
    if (this.tiles.has(tk)) return;
    const [tx, tz] = tk.split('_').map(Number);
    const t = { state: 'loading', tx, tz, data: null };
    this.tiles.set(tk, t);
    fetch(this.base + 'data/t_' + tk + '.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { t.data = d; t.state = 'ready'; })
      .catch(err => { console.warn('tile failed', tk, err); t.state = 'error'; });
  }

  _ready(cell) { for (const f of this.onCellReady) f(cell); }

  _unload(cell) {
    if (cell.state === 'pending') { this.cells.delete(cell.key); return; }
    for (const f of this.onCellUnload) f(cell);
    this.barriers = this.barriers.filter(b => b.cell !== cell);
    if (cell.group) {
      this.root.remove(cell.group);
      cell.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    for (const e of cell.edges) {
      this.edges.delete(e.id);
      for (const nid of [e.a, e.b]) {
        const n = this.nodes.get(nid);
        if (!n) continue;
        const i = n.edges.indexOf(e); if (i >= 0) n.edges.splice(i, 1);
        if (!n.edges.length) this.nodes.delete(nid);
      }
      e.dead = true;
    }
    for (const grid of [this.segGrid, this.bldGrid]) {
      for (const k of cell.gridKeys || []) {
        const arr = grid.get(k); if (!arr) continue;
        const kept = arr.filter(o => (o.e ? o.e.cell : o.cell) !== cell);
        if (kept.length) grid.set(k, kept); else grid.delete(k);
      }
    }
    this.cells.delete(cell.key);
    if (cell.state === 'ready') this.loadedCount--;
  }

  // ------------------------------------------------------------- 建立小格
  _build(cell, tile) {
    const d = tile.data.cells[cell.key];
    if (!d) { cell.state = 'empty'; this._ready(cell); return; }
    const ox = tile.tx * this.TILE, oz = tile.tz * this.TILE;
    const names = tile.data.names;
    cell.gridKeys = new Set(); cell.parks = [];
    const group = new THREE.Group();
    const gRoad = new Geo(), gMark = new Geo(), gStruct = new Geo(), gGround = new Geo();
    const gBld = new Geo(['wuv', 'seed']), gDeco = new Geo(), gWalk = new Geo(['uv']);
    const acs = [], signs = [], trees = [];
    this._gWalk = gWalk; this._trees = trees;

    // ---- 道路
    for (const r of d.r || []) {
      const raw = r[10], n = raw.length / 2;
      const pts = new Float32Array(n * 2), cum = new Float32Array(n);
      for (let i = 0; i < n; i++) { pts[i * 2] = ox + raw[i * 2] / 10; pts[i * 2 + 1] = oz + raw[i * 2 + 1] / 10; }
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
      const hs = new Float32Array(n); for (let i = 0; i < n; i++) hs[i] = r[11][i] / 10;
      let rel = null, cover = null;
      if (r[14]) { rel = new Float32Array(n); for (let i = 0; i < n; i++) rel[i] = r[14][i] / 10; }
      if (r[15]) { cover = new Float32Array(n); for (let i = 0; i < n; i++) cover[i] = r[15][i] / 10; }
      const width = r[3] / 10, lanes = r[4], oneway = r[5];
      const lanesDir = oneway ? lanes : Math.max(1, lanes >> 1);
      const e = {
        id: r[0], cls: r[1], name: names[r[2]] || '', width, hw: width / 2, lanes, oneway, speed: r[6], flags: r[7],
        a: r[8], b: r[9], pts, hs, rel, cover, bridge: !!rel, cum, len: cum[n - 1], trimA: (r[12] || 0) / 10, trimB: (r[13] || 0) / 10,
        tunnel: !!(r[7] & 2), sigA: !!(r[7] & 4), sigB: !!(r[7] & 8), cell, lanesDir,
        laneW: (width - 1) / (oneway ? lanes : 2 * lanesDir), cars: [], dead: false,
      };
      cell.edges.push(e); this.edges.set(e.id, e);
      this._linkNode(e.a, pts[0], pts[1], hs[0], e);
      this._linkNode(e.b, pts[n * 2 - 2], pts[n * 2 - 1], hs[n - 1], e);
      for (let i = 0; i < n - 1; i++) this._gridInsert(this.segGrid, cell, { e, i },
        Math.min(pts[i * 2], pts[i * 2 + 2]) - e.hw - 1, Math.min(pts[i * 2 + 1], pts[i * 2 + 3]) - e.hw - 1,
        Math.max(pts[i * 2], pts[i * 2 + 2]) + e.hw + 1, Math.max(pts[i * 2 + 1], pts[i * 2 + 3]) + e.hw + 1);
      this._roadGeo(e, gRoad, gMark, gStruct);
      // 地圖邊緣的高架／快速道路斷頭：放路障擋住玩家（車流會直接消失，不受影響）
      const needBar = (k) => e.cls <= 2 || (e.rel && e.rel[k === 0 ? 0 : e.rel.length - 1] > 1.5);
      if ((e.flags & 16) && needBar(0)) this._barrier(e, 0, gDeco, cell);
      if ((e.flags & 32) && needBar(1)) this._barrier(e, 1, gDeco, cell);
    }

    // ---- 地面：綠地、水域、停車場
    const poly = (rings, y, col) => {
      const contour = [], holes = [];
      const toV = (flat) => { const a = []; for (let i = 0; i < flat.length; i += 2) a.push(new THREE.Vector2(ox + flat[i] / 10, oz + flat[i + 1] / 10)); return a; };
      contour.push(...toV(rings[0]));
      for (let k = 1; k < rings.length; k++) holes.push(toV(rings[k]));
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (err) { return; }
      const all = contour.concat(...holes), base = gGround.count;
      for (const v of all) gGround.v(v.x, y, v.y, 0, 1, 0, col);
      for (const t of tris) {
        const a = all[t[0]], b = all[t[1]], c = all[t[2]];
        const up = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
        if (up > 0) gGround.i.push(base + t[0], base + t[1], base + t[2]); else gGround.i.push(base + t[0], base + t[2], base + t[1]);
      }
    };
    for (const w of d.w || []) poly(w.slice(1), w[0] / 10 + 0.03, WATER);
    for (const p of d.p || []) {
      const lv = (p[2] || 0) / 10;
      poly([p[1]], lv + 0.035, LOT);
      const flat = p[1], pp = new Float32Array(flat.length);
      for (let i = 0; i < flat.length; i += 2) { pp[i] = ox + flat[i] / 10; pp[i + 1] = oz + flat[i + 1] / 10; }
      cell.lots.push({ id: p[0], pts: pp, lv });
    }
    for (const q of d.poi || []) cell.poi.push({ type: q[0], x: ox + q[1] / 10, z: oz + q[2] / 10 });

    // ---- 建物、招牌
    for (const b of d.b || []) this._bldGeo(b, ox, oz, cell, gBld, gDeco, acs, signs);
    const real = []; this._realSigns(d, names, ox, oz, real);
    this._roadSigns(d, names, ox, oz, gDeco, real);
    // 有真實店家的位置，就不放自動產生的招牌
    const kept = signs.filter(sg => !real.some(r => !r.vertical && !r.road && Math.abs(r.x - sg.x) < 3.6 && Math.abs(r.z - sg.z) < 3.6 && Math.abs(r.y - sg.y) < 2));
    cell.signs = real.concat(kept);

    // 頂點改成相對於小格原點，避免離原點十幾公里時的浮點數抖動
    cell.ox = cell.cx * this.CELL; cell.oz = cell.cz * this.CELL;
    group.position.set(cell.ox, 0, cell.oz);
    if (d.t) { const tm = this._terrainMesh(cell, d.t); tm.receiveShadow = true; group.add(tm); }
    const gPark = new Geo();
    for (const pk of d.pk || []) this._park(pk, ox, oz, cell, gPark, gDeco, trees);
    const add = (geo, mat, sizes, order, shadow = '') => {
      const p = geo.p; for (let i = 0; i < p.length; i += 3) { p[i] -= cell.ox; p[i + 2] -= cell.oz; }
      const g = geo.build(sizes); if (!g) return;
      const m = new THREE.Mesh(g, mat); if (order) m.renderOrder = order;
      m.castShadow = shadow.includes('c'); m.receiveShadow = shadow.includes('r'); group.add(m);
    };
    add(gGround, this.matGround, null, 0, 'r');
    add(gRoad, this.matRoad, null, 0, 'r');
    add(gMark, this.matMark, null, 1, '');
    add(gStruct, this.matStruct, null, 0, 'cr');
    add(gBld, this.matBld, { wuv: 4, seed: 2 }, 0, 'cr');
    add(gDeco, this.matDeco, null, 0, 'cr');
    add(gWalk, this.matWalk, { uv: 2 }, 0, 'r');
    add(gPark, this.matPath, null, 0, 'r');
    // 冷氣室外機（同一種模型大量重複，用 instancing）
    if (acs.length) {
      const nA = acs.length / 4, im = new THREE.InstancedMesh(this._acGeo, this.matDeco, nA), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      for (let k = 0; k < nA; k++) { e.set(0, acs[k * 4 + 3], 0); q.setFromEuler(e); v.set(acs[k * 4] - cell.ox, acs[k * 4 + 1], acs[k * 4 + 2] - cell.oz); mm.compose(v, q, one); im.setMatrixAt(k, mm); }
      im.castShadow = true; im.receiveShadow = true; group.add(im);
    }
    // 行道樹與公園樹
    this._parkTrees(cell, d, trees);
    if (trees.length) {
      const nT = trees.length / 4, im = new THREE.InstancedMesh(this._treeGeo, this.matTree, nT), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      for (let k = 0; k < nT; k++) { const s2 = trees[k * 4 + 3]; e.set(0, s2 * 40, 0); q.setFromEuler(e); v.set(trees[k * 4] - cell.ox, trees[k * 4 + 1], trees[k * 4 + 2] - cell.oz); sc.set(s2, s2, s2); mm.compose(v, q, sc); im.setMatrixAt(k, mm); }
      im.castShadow = true; im.receiveShadow = true; group.add(im);
    }
    cell.group = group; this.root.add(group);
    cell.state = 'ready'; this.loadedCount++;
    this._ready(cell);
  }

  // ------------------------------------------------------------- 地形
  _terrainMesh(cell, t) {
    const n = this.meta.terrain.n, step = this.meta.terrain.step, dl = t[0], green = t[1] || '', hole = t[2] || '';
    const hgt = new Float32Array(n * n);
    let acc = 0;
    for (let k = 0; k < n * n; k++) { acc += dl[k]; hgt[k] = acc / 10; }
    cell.hgt = hgt; cell.tn = n; cell.tstep = step;
    const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, h = hgt[k];
      pos[k * 3] = i * step; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * step;
      let c = green[k] === '1' ? GREEN : LAND;
      if (c === LAND && h > 35) { const f = Math.min(1, (h - 35) / 90); c = [LAND[0] + (HILL[0] - LAND[0]) * f, LAND[1] + (HILL[1] - LAND[1]) * f, LAND[2] + (HILL[2] - LAND[2]) * f]; }
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    }
    const idx = new Uint16Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const v00 = j * n + i, v10 = v00 + 1, v01 = v00 + n, v11 = v01 + 1;
      if (hole && (hole[v00] === '1' || hole[v10] === '1' || hole[v01] === '1' || hole[v11] === '1')) continue;   // 地下道引道開口
      idx[q++] = v00; idx[q++] = v01; idx[q++] = v10; idx[q++] = v10; idx[q++] = v01; idx[q++] = v11;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(q < idx.length ? idx.slice(0, q) : idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return new THREE.Mesh(g, this.matTerrain);
  }

  /** 地面高度（地形網格雙線性內插）。該處還沒載入時回傳 fallback。 */
  groundAt(x, z, fallback = 0) {
    const c = this.cells.get(Math.floor(x / this.CELL) + ',' + Math.floor(z / this.CELL));
    if (!c || !c.hgt) return fallback;
    const n = c.tn, st = c.tstep;
    let fx = (x - c.cx * this.CELL) / st, fz = (z - c.cz * this.CELL) / st;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i >= n - 1) i = n - 2; if (j >= n - 1) j = n - 2; if (i < 0) i = 0; if (j < 0) j = 0;
    fx -= i; fz -= j;
    const h = c.hgt, k = j * n + i;
    const a = h[k] + (h[k + 1] - h[k]) * fx, b = h[k + n] + (h[k + n + 1] - h[k + n]) * fx;
    return a + (b - a) * fz;
  }

  _linkNode(id, x, z, h, e) {
    let n = this.nodes.get(id);
    if (!n) { n = { id, x, z, h, edges: [], signal: false }; this.nodes.set(id, n); }
    n.edges.push(e);
    if ((e.a === id && e.sigA) || (e.b === id && e.sigB)) n.signal = true;
  }

  _gridInsert(grid, cell, obj, x0, z0, x1, z1) {
    const G = this.G;
    for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++)
      for (let gz = Math.floor(z0 / G); gz <= Math.floor(z1 / G); gz++) {
        const k = gx * 73856093 ^ gz * 19349663;
        let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
        a.push(obj); cell.gridKeys.add(k);
      }
  }

  _roadGeo(e, gRoad, gMark, gStruct) {
    const { pts, hs, hw, cls } = e, n = pts.length / 2;
    const col = e.tunnel ? TUNNEL_RGB : ROAD_RGB[cls];
    const yOff = ROAD_Y + (7 - cls) * 0.012;
    // 逐點的右向量（斜接）
    const rx = new Float32Array(n), rz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let dx0 = 0, dz0 = 0, dx1 = 0, dz1 = 0;
      if (i > 0) { dx0 = pts[i * 2] - pts[i * 2 - 2]; dz0 = pts[i * 2 + 1] - pts[i * 2 - 1]; const l = Math.hypot(dx0, dz0) || 1; dx0 /= l; dz0 /= l; }
      if (i < n - 1) { dx1 = pts[i * 2 + 2] - pts[i * 2]; dz1 = pts[i * 2 + 3] - pts[i * 2 + 1]; const l = Math.hypot(dx1, dz1) || 1; dx1 /= l; dz1 /= l; }
      if (i === 0) { dx0 = dx1; dz0 = dz1; } if (i === n - 1) { dx1 = dx0; dz1 = dz0; }
      let tx = dx0 + dx1, tz = dz0 + dz1; const tl = Math.hypot(tx, tz);
      if (tl < 1e-4) { tx = dx1; tz = dz1; } else { tx /= tl; tz /= tl; }
      const cosHalf = Math.max(0.5, tx * dx1 + tz * dz1);
      rx[i] = -tz / cosHalf; rz[i] = tx / cosHalf;
    }
    const base = gRoad.count;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], z = pts[i * 2 + 1], y = hs[i] + yOff;
      gRoad.v(x - rx[i] * hw, y, z - rz[i] * hw, 0, 1, 0, col);
      gRoad.v(x + rx[i] * hw, y, z + rz[i] * hw, 0, 1, 0, col);
    }
    for (let i = 0; i < n - 1; i++) { const a = base + i * 2; gRoad.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    // 兩端補圓盤，把路口轉角填滿
    for (const end of [0, n - 1]) {
      const x = pts[end * 2], z = pts[end * 2 + 1], y = hs[end] + yOff;
      const c = gRoad.v(x, y, z, 0, 1, 0, col), S = 10;
      for (let k = 0; k < S; k++) { const a = k / S * Math.PI * 2; gRoad.v(x + Math.cos(a) * hw, y, z + Math.sin(a) * hw, 0, 1, 0, col); }
      for (let k = 0; k < S; k++) gRoad.i.push(c, c + 1 + (k + 1) % S, c + 1 + k);
    }

    // ---- 高架：護欄＋梁側板＋橋墩
    if (e.bridge) {
      const rel = e.rel;
      // 橋底（從下面往上看是一整片混凝土，不會看到路面標線）
      for (let i = 0; i < n - 1; i++) {
        if (rel[i] < 0.7 && rel[i + 1] < 0.7) continue;
        const lo0 = hs[i] - Math.min(1.1, rel[i]), lo1 = hs[i + 1] - Math.min(1.1, rel[i + 1]);
        const a = gStruct.v(pts[i * 2] - rx[i] * hw, lo0, pts[i * 2 + 1] - rz[i] * hw, 0, -1, 0, SOFFIT), b = gStruct.v(pts[i * 2] + rx[i] * hw, lo0, pts[i * 2 + 1] + rz[i] * hw, 0, -1, 0, SOFFIT);
        const c = gStruct.v(pts[i * 2 + 2] + rx[i + 1] * hw, lo1, pts[i * 2 + 3] + rz[i + 1] * hw, 0, -1, 0, SOFFIT), d2 = gStruct.v(pts[i * 2 + 2] - rx[i + 1] * hw, lo1, pts[i * 2 + 3] - rz[i + 1] * hw, 0, -1, 0, SOFFIT);
        gStruct.quad(a, b, c, d2);
      }
      for (let i = 0; i < n - 1; i++) {
        const h0 = hs[i], h1 = hs[i + 1];
        if (rel[i] < 0.7 && rel[i + 1] < 0.7) continue;
        for (const s of [-1, 1]) {
          const x0 = pts[i * 2] + rx[i] * hw * s, z0 = pts[i * 2 + 1] + rz[i] * hw * s;
          const x1 = pts[i * 2 + 2] + rx[i + 1] * hw * s, z1 = pts[i * 2 + 3] + rz[i + 1] * hw * s;
          const nx = rx[i] * s, nz = rz[i] * s;
          const lo0 = h0 - Math.min(1.1, rel[i]), lo1 = h1 - Math.min(1.1, rel[i + 1]);
          const a = gStruct.v(x0, lo0, z0, nx, 0, nz, CONCRETE), b = gStruct.v(x1, lo1, z1, nx, 0, nz, CONCRETE);
          const c = gStruct.v(x1, h1 + 0.95, z1, nx, 0, nz, CONCRETE), d2 = gStruct.v(x0, h0 + 0.95, z0, nx, 0, nz, CONCRETE);
          gStruct.quad(a, b, c, d2);
        }
      }
      // 橋墩
      const step = 34;
      for (let s = step * (0.3 + hash2(e.id, 7) * 0.5); s < e.len; s += step) {
        edgePoint(e, s, _pt);
        const si = _pt.i, sf = (s - e.cum[si]) / ((e.cum[si + 1] - e.cum[si]) || 1);
        const rh = rel[si] + (rel[si + 1] - rel[si]) * sf;
        if (rh < 3.2) continue;
        const pw = Math.min(2.2, Math.max(1.2, e.width * 0.16)), top = _pt.y - 0.9, bot = _pt.y - rh - 0.6;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (let k = 0; k < 4; k++) {
          const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
          const nx = (ax + bx) / 2, nz = (az + bz) / 2, shade = k % 2 ? PIER_A : PIER_B;
          const a = gStruct.v(_pt.x + ax * pw / 2, bot, _pt.z + az * pw / 2, nx, 0, nz, shade), b = gStruct.v(_pt.x + bx * pw / 2, bot, _pt.z + bz * pw / 2, nx, 0, nz, shade);
          const c = gStruct.v(_pt.x + bx * pw / 2, top, _pt.z + bz * pw / 2, nx, 0, nz, shade), d2 = gStruct.v(_pt.x + ax * pw / 2, top, _pt.z + az * pw / 2, nx, 0, nz, shade);
          gStruct.quad(a, b, c, d2);
        }
      }
    }

    // ---- 隧道：兩側牆、弧形頂、頂燈（引道段只有擋土牆）
    if (e.tunnel && e.cover) this._tunnelGeo(e, rx, rz, gStruct, gMark);
    // ---- 人行道（主要、次要幹道）＋行道樹
    if (cls >= 1 && cls <= 3 && !e.bridge && !e.tunnel) this._sidewalk(e, gStruct);

    // ---- 標線
    const s0 = e.trimA, s1 = e.len - e.trimB;
    if (s1 - s0 < 3) return;
    const strip = (off, half, a, b, dash, gap, colr) => this._strip(e, gMark, off, half, a, b, dash, gap, colr);
    const carriage = (e.width - 1) / 2;
    if (!e.oneway) {
      if (cls <= 4 && e.lanes >= 2) { strip(-0.16, 0.06, s0, s1, 0, 0, YELLOW); strip(0.16, 0.06, s0, s1, 0, 0, YELLOW); }
      else if (cls === 5 && e.width >= 6.4) strip(0, 0.06, s0, s1, 4, 6, YELLOW);
      for (let k = 1; k < e.lanesDir; k++) { strip(k * e.laneW, 0.06, s0, s1, 4, 6, WHITE); strip(-k * e.laneW, 0.06, s0, s1, 4, 6, WHITE); }
    } else if (cls !== 6) {
      for (let k = 1; k < e.lanes; k++) strip(k * e.laneW - carriage, 0.06, s0, s1, 4, 6, WHITE);
    }
    if (cls <= 1 || cls === 7) { strip(carriage + 0.15, 0.07, s0, s1, 0, 0, WHITE); strip(-carriage - 0.15, 0.07, s0, s1, 0, 0, cls === 7 || e.oneway ? YELLOW : WHITE); }
    // 停止線與斑馬線（有號誌的路口）
    if (cls <= 5) {
      const zebra = (sa, sb) => { for (let o = -carriage; o <= carriage - 0.2; o += 0.95) strip(o + 0.25, 0.22, sa, sb, 0, 0, WHITE); };
      if (e.sigB && e.trimB > 5) {
        this._cross(e, gMark, s1, e.oneway ? -carriage : 0.1, carriage, 0.22);
        zebra(s1 + 0.9, Math.min(e.len, s1 + 3.6));
      }
      if (e.sigA && e.trimA > 5) {
        if (!e.oneway) this._cross(e, gMark, s0, -carriage, -0.1, 0.22);
        zebra(Math.max(0, s0 - 3.6), s0 - 0.9);
      }
    }
  }

  _sidewalk(e, gStruct) {
    const g = this._gWalk, trees = this._trees, W = 3.2, CURB = 0.2;
    const s0 = e.trimA + 0.5, s1 = e.len - e.trimB - 0.5;
    if (s1 - s0 < 4) return;
    const { pts, hs, cum } = e, n = cum.length;
    for (const side of e.oneway ? [1] : [1, -1]) {
      for (let i = 0; i < n - 1; i++) {
        const a = Math.max(s0, cum[i]), b = Math.min(s1, cum[i + 1]);
        if (b - a < 0.05) continue;
        const seg = cum[i + 1] - cum[i], ax = pts[i * 2], az = pts[i * 2 + 1];
        const dx = (pts[i * 2 + 2] - ax) / seg, dz = (pts[i * 2 + 3] - az) / seg, rxx = -dz * side, rzz = dx * side;
        const P = (sv, off) => { const t = sv - cum[i], y = hs[i] + (hs[i + 1] - hs[i]) * t / seg; return [ax + dx * t + rxx * off, y, az + dz * t + rzz * off]; };
        const o0 = e.hw, o1 = e.hw + W;
        const A = P(a, o0), B = P(b, o0), C = P(b, o1), D = P(a, o1);
        const ia = g.v(A[0], A[1] + CURB, A[2], 0, 1, 0, [1, 1, 1]), ib = g.v(B[0], B[1] + CURB, B[2], 0, 1, 0, [1, 1, 1]);
        const ic = g.v(C[0], C[1] + CURB, C[2], 0, 1, 0, [1, 1, 1]), id = g.v(D[0], D[1] + CURB, D[2], 0, 1, 0, [1, 1, 1]);
        g.extra.uv.push(a / 3.2, 1, b / 3.2, 1, b / 3.2, 0, a / 3.2, 0);
        g.quad(ia, ib, ic, id);
        // 路緣石側面
        const col = CONCRETE;
        gStruct.quad(gStruct.v(A[0], A[1] + 0.02, A[2], -rxx, 0, -rzz, col), gStruct.v(B[0], B[1] + 0.02, B[2], -rxx, 0, -rzz, col),
          gStruct.v(B[0], B[1] + CURB, B[2], -rxx, 0, -rzz, col), gStruct.v(A[0], A[1] + CURB, A[2], -rxx, 0, -rzz, col));
      }
      // 行道樹：每 11～14 m 一棵，種在人行道靠車道那一側
      for (let sv = s0 + 4 + hash2(e.id, side) * 6; sv < s1 - 3; sv += 11 + hash2(e.id, Math.floor(sv)) * 3) {
        edgePoint(e, sv, _pt);
        const off = (e.hw + 1.1) * side, tx = _pt.x - _pt.dz * off, tz = _pt.z + _pt.dx * off;
        trees.push(tx, _pt.y + CURB, tz, 0.75 + hash2(Math.floor(sv), e.id) * 0.45);
      }
    }
  }

  /** 斷頭的高架／快速道路（地圖範圍到這裡為止）：放紅白封閉路障，車子會被擋下來。 */
  _barrier(e, atEnd, g, cell) {
    const s = atEnd ? Math.max(0, e.len - 0.4) : Math.min(e.len, 0.4);
    edgePoint(e, s, _pt);
    const y = _pt.y, nx = -_pt.dz, nz = _pt.dx, W = e.width + 0.6, yaw = Math.atan2(_pt.dx, _pt.dz);
    const RED = srgb(0.82, 0.12, 0.10), WHITE2 = srgb(0.95, 0.95, 0.93), CON = srgb(0.70, 0.70, 0.68), LAMP = srgb(1.0, 0.75, 0.15);
    // 紐澤西護欄
    addBox(g, _pt.x, y + 0.45, _pt.z, W, 0.9, 0.6, yaw + Math.PI / 2, CON);
    // 紅白相間的封閉牌
    const k = Math.max(3, Math.round(W / 1.2));
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k - 0.5, x = _pt.x + nx * t * W, z = _pt.z + nz * t * W;
      addBox(g, x, y + 1.35, z, W / k * 0.98, 0.7, 0.08, yaw + Math.PI / 2, i % 2 ? WHITE2 : RED);
    }
    for (const t of [-0.45, 0.45]) addBox(g, _pt.x + nx * t * W, y + 1.95, _pt.z + nz * t * W, 0.3, 0.3, 0.3, yaw, LAMP);
    const rec = { x: _pt.x, y, z: _pt.z, nx, nz, w: W, cell };
    this.barriers.push(rec);
  }

  /**
   * 都市小公園（範圍來自開放地圖）：繞一圈的步道＋往中間的步道、密植大樹、矮樹籬、長椅，
   * 大一點的公園加一座遊戲區。步道與樹的位置是依範圍推算的，不是逐一測量。
   */
  _park(rec, ox, oz, cell, gPath, gDeco, trees) {
    const kind = rec[0], ring = rec[1]; if (!ring || ring.length < 6) return;
    const n = ring.length / 2, P = [];
    for (let i = 0; i < n; i++) P.push([ox + ring[i * 2] / 10, oz + ring[i * 2 + 1] / 10]);
    let cx = 0, cz = 0, A = 0;
    for (let i = 0; i < n; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % n], c = x0 * z1 - x1 * z0; A += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c; }
    if (Math.abs(A) < 1) return; cx /= 3 * A; cz /= 3 * A; A = Math.abs(A) / 2;
    const inside = (x, z) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    if (!inside(cx, cz)) { cx = P[0][0] * 0.5 + P[Math.floor(n / 2)][0] * 0.5; cz = P[0][1] * 0.5 + P[Math.floor(n / 2)][1] * 0.5; if (!inside(cx, cz)) return; }
    const PAVE = srgb(0.70, 0.66, 0.60), PAVE2 = srgb(0.62, 0.58, 0.53), HEDGE = srgb(0.20, 0.36, 0.17);
    const segs = [];   // 步道中心線
    const path = (x0, z0, x1, z1, w) => {
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1) return;
      const k = Math.max(1, Math.ceil(L / 4)), nx = -(z1 - z0) / L * w / 2, nz = (x1 - x0) / L * w / 2;
      let prev = null;
      for (let s = 0; s <= k; s++) {
        const x = x0 + (x1 - x0) * s / k, z = z0 + (z1 - z0) * s / k, y = this.groundAt(x, z) + 0.06, col = s % 2 ? PAVE : PAVE2;
        const a = gPath.v(x + nx, y, z + nz, 0, 1, 0, col), b = gPath.v(x - nx, y, z - nz, 0, 1, 0, col);
        if (prev) gPath.quad(prev[0], prev[1], b, a);
        prev = [a, b];
      }
      segs.push([x0, z0, x1, z1, w]);
    };
    // 外圈步道：每個頂點往中心內縮 3.2 m
    const inset = P.map(([x, z]) => { const dx = cx - x, dz = cz - z, L = Math.hypot(dx, dz) || 1, k = Math.min(3.2, L * 0.4) / L; return [x + dx * k, z + dz * k]; });
    if (A > 600) for (let i = 0; i < n; i++) { const a = inset[i], b = inset[(i + 1) % n]; path(a[0], a[1], b[0], b[1], 2.2); }
    // 從長邊中點通往中心的步道
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L > 22 && hash2(i + 7, Math.floor(A)) < 0.75) path((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, cx, cz, 2.0);
    }
    const nearPath = (x, z, m) => {
      for (const [x0, z0, x1, z1, w] of segs) {
        const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
        if (Math.hypot(x - x0 - dx * t, z - z0 - dz * t) < w / 2 + m) return true;
      }
      return false;
    };
    // 遊戲區（一般造型：平台、溜滑梯、鞦韆架）
    let play = null;
    if (kind === 2 || A > 1500) {
      for (let tries = 0; tries < 12 && !play; tries++) {
        const ang = hash2(tries, Math.floor(A)) * 6.283, r = 6 + tries * 1.5, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
        if (inside(x, z) && inside(x + 5, z) && inside(x - 5, z) && inside(x, z + 5) && inside(x, z - 5) && !nearPath(x, z, 3.5)) play = [x, z, ang];
      }
      if (play) {
        const [x, z, yaw] = play, y = this.groundAt(x, z);
        const SAFE = srgb(0.55, 0.36, 0.30), RED = srgb(0.78, 0.18, 0.16), BLUE = srgb(0.16, 0.38, 0.70), YEL = srgb(0.93, 0.75, 0.18), POST = srgb(0.25, 0.48, 0.30);
        addBox(gDeco, x, y + 0.03, z, 9, 0.06, 7, yaw, SAFE);                                // 防撞地墊
        const c = Math.cos(yaw), sn = Math.sin(yaw), at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [px, pz] = at(lx * 0.9, lz * 0.9); addBox(gDeco, px, y + 1.25, pz, 0.14, 2.5, 0.14, yaw, POST); }
        { const [px, pz] = at(0, 0); addBox(gDeco, px, y + 1.2, pz, 2.0, 0.12, 2.0, yaw, YEL); addBox(gDeco, px, y + 2.7, pz, 2.3, 0.5, 2.3, yaw, RED, RED); }
        { const [px, pz] = at(2.4, 0); const g = gDeco, b = g.count;   // 溜滑梯（斜板）
          addBox(g, px, y + 0.65, pz, 2.6, 0.08, 0.8, yaw, BLUE); for (let k = b; k < g.count; k++) { const lx0 = (g.p[k * 3] - px) * c - (g.p[k * 3 + 2] - pz) * sn; g.p[k * 3 + 1] -= lx0 * 0.42; } }
        { const [px, pz] = at(-2.6, -0.4); addBox(gDeco, px, y + 0.6, pz, 1.4, 1.2, 0.9, yaw, BLUE); }
        { const [sx, sz] = at(0, 3.2); addBox(gDeco, sx, y + 2.2, sz, 3.2, 0.12, 0.12, yaw, POST);   // 鞦韆架
          for (const lx of [-1.5, 1.5]) { const [px, pz] = at(lx, 3.2); addBox(gDeco, px, y + 1.1, pz, 0.12, 2.2, 0.12, yaw, POST); }
          for (const lx of [-0.6, 0.6]) { const [px, pz] = at(lx, 3.2); addBox(gDeco, px, y + 0.45, pz, 0.45, 0.05, 0.2, yaw, YEL); } }
      }
    }
    // 長椅：每條步道放一兩張
    const WOOD = srgb(0.52, 0.36, 0.22), IRON = srgb(0.22, 0.23, 0.24);
    segs.forEach(([x0, z0, x1, z1, w], si) => {
      if (hash2(si, 31) > 0.55) return;
      const t = 0.3 + hash2(si, 5) * 0.4, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, L = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = -(z1 - z0) / L, nz = (x1 - x0) / L, bx = x + nx * (w / 2 + 0.7), bz = z + nz * (w / 2 + 0.7), y = this.groundAt(bx, bz), yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      addBox(gDeco, bx, y + 0.45, bz, 1.6, 0.06, 0.45, yaw, WOOD); addBox(gDeco, bx, y + 0.22, bz, 1.4, 0.44, 0.08, yaw, IRON);
    });
    // 外圍矮樹籬
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 3) continue;
      const k = Math.floor(L / 2.5);
      for (let s = 0; s < k; s++) {
        const t = (s + 0.5) / k, x0 = a[0] + (b[0] - a[0]) * t, z0 = a[1] + (b[1] - a[1]) * t, dx = cx - x0, dz = cz - z0, dl = Math.hypot(dx, dz) || 1;
        const x = x0 + dx / dl * 0.9, z = z0 + dz / dl * 0.9;
        if (nearPath(x, z, 0.6)) continue;
        addBox(gDeco, x, this.groundAt(x, z) + 0.4, z, L / k * 1.02, 0.8, 0.8, Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2, HEDGE);
      }
    }
    // 大樹：約 6 m 一棵，避開步道與遊戲區
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of P) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    let cnt = 0;
    for (let gz = z0 + 2.5; gz < z1 && cnt < 220; gz += 6) for (let gx = x0 + 2.5; gx < x1 && cnt < 220; gx += 6) {
      const r = hash2(Math.floor(gx * 3), Math.floor(gz * 7)), x = gx + (r - 0.5) * 3.2, z = gz + (hash2(Math.floor(gz * 5), Math.floor(gx)) - 0.5) * 3.2;
      if (!inside(x, z) || nearPath(x, z, 1.6) || (play && Math.hypot(x - play[0], z - play[1]) < 7)) continue;
      if (r < 0.12) continue;
      trees.push(x, this.groundAt(x, z) - 0.1, z, 1.0 + r * 0.55); cnt++;
    }
    cell.parks = cell.parks || []; cell.parks.push({ cx, cz, area: A, inside });
  }

  _parkTrees(cell, d, trees) {
    const t = d.t; if (!t || !t[1]) return;
    const green = t[1], n = this.meta.terrain.n, step = this.meta.terrain.step;
    let cnt = 0;
    for (let j = 0; j < n - 1 && cnt < 260; j += 2) for (let i = 0; i < n - 1 && cnt < 260; i += 2) {
      if (green[j * n + i] !== '1') continue;
      const r = hash2(cell.cx * 1000 + i, cell.cz * 1000 + j);
      if (r > 0.42) continue;
      const x = cell.ox + (i + hash2(i, j) * 1.6) * step, z = cell.oz + (j + hash2(j, i) * 1.6) * step;
      const gy = this.groundAt(x, z);
      if (this.surfaceAt(x, z, gy, _surfTmp)) continue;
      if (cell.parks && cell.parks.some(pk => pk.inside(x, z))) continue;   // 公園裡已經照公園的樣子種了
      trees.push(x, gy - 0.1, z, 0.8 + r);
      cnt++;
    }
  }

  _tunnelGeo(e, rx, rz, g, gLight) {
    const { pts, hs, cover } = e, n = pts.length / 2, W = e.hw + 0.6, WALL = 4.8;
    // 弧形斷面（相對中心線的橫向位置, 相對路面高度）
    const arch = [[-W, WALL], [-W * 0.62, WALL + 1.1], [0, WALL + 1.55], [W * 0.62, WALL + 1.1], [W, WALL]];
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1, c0 = cover[i], c1 = cover[j];
      if (c0 < 0.6 && c1 < 0.6) continue;                       // 已經回到地面
      const p = (k, lat, up) => [pts[k * 2] + rx[k] * lat, hs[k] + up, pts[k * 2 + 1] + rz[k] * lat];
      const ramp = Math.min(c0, c1) < 6;
      for (const sd of [-1, 1]) {
        // 牆：引道段做到地面再高出 0.9 m（護欄），有頂的段落做到起拱線
        const t0 = c0 >= 6 && c1 >= 6 ? WALL : Math.max(0.9, c0 + 0.9), t1 = c0 >= 6 && c1 >= 6 ? WALL : Math.max(0.9, c1 + 0.9);
        const a = p(i, sd * W, -0.2), b = p(j, sd * W, -0.2), c = p(j, sd * W, t1), d = p(i, sd * W, t0);
        const nx = -rx[i] * sd, nz = -rz[i] * sd;
        const col = TUNNEL_WALL;
        g.quad(g.v(a[0], a[1], a[2], nx, 0, nz, col), g.v(b[0], b[1], b[2], nx, 0, nz, col), g.v(c[0], c[1], c[2], nx, 0, nz, col), g.v(d[0], d[1], d[2], nx, 0, nz, col));
      }
      if (ramp) {
        // 引道兩側的地面邊緣：把地形開口補平
        for (const sd of [-1, 1]) {
          const a = p(i, sd * W, Math.max(0, c0) - 0.04), b = p(j, sd * W, Math.max(0, c1) - 0.04);
          const c = p(j, sd * (W + 11), Math.max(0, c1) - 0.04), d = p(i, sd * (W + 11), Math.max(0, c0) - 0.04);
          g.quad(g.v(a[0], a[1], a[2], 0, 1, 0, LAND), g.v(b[0], b[1], b[2], 0, 1, 0, LAND), g.v(c[0], c[1], c[2], 0, 1, 0, LAND), g.v(d[0], d[1], d[2], 0, 1, 0, LAND));
        }
        // 隧道口上方的牆面
        const k = c0 >= 6 ? i : c1 >= 6 ? j : -1;
        if (k >= 0) {
          const top = cover[k] + 0.2, base = WALL + 1.5;
          // 牆面朝向引道（車子開過來的方向）
          const tx = pts[j * 2] - pts[i * 2], tz = pts[j * 2 + 1] - pts[i * 2 + 1], tl = Math.hypot(tx, tz) || 1, sg = k === j ? -1 : 1;
          const fnx = tx / tl * sg, fnz = tz / tl * sg;
          const a = p(k, -(W + 11), base), b = p(k, W + 11, base), c = p(k, W + 11, top), d = p(k, -(W + 11), top);
          g.quad(g.v(a[0], a[1], a[2], fnx, 0, fnz, TUNNEL_WALL), g.v(b[0], b[1], b[2], fnx, 0, fnz, TUNNEL_WALL), g.v(c[0], c[1], c[2], fnx, 0, fnz, TUNNEL_WALL), g.v(d[0], d[1], d[2], fnx, 0, fnz, TUNNEL_WALL));
        }
        continue;                                                // 引道沒有頂
      }
      for (let k = 0; k < arch.length - 1; k++) {
        const [l0, u0] = arch[k], [l1, u1] = arch[k + 1];
        const a = p(i, l0, u0), b = p(i, l1, u1), c = p(j, l1, u1), d = p(j, l0, u0);
        g.quad(g.v(a[0], a[1], a[2], 0, -1, 0, TUNNEL_TOP), g.v(b[0], b[1], b[2], 0, -1, 0, TUNNEL_TOP), g.v(c[0], c[1], c[2], 0, -1, 0, TUNNEL_TOP), g.v(d[0], d[1], d[2], 0, -1, 0, TUNNEL_TOP));
      }
    }
    // 頂燈：每 9 m 一盞，左右兩排
    for (let s = 4; s < e.len; s += 9) {
      edgePoint(e, s, _pt);
      const k = _pt.i, f = (s - e.cum[k]) / ((e.cum[k + 1] - e.cum[k]) || 1), cv = cover[k] + (cover[k + 1] - cover[k]) * f;
      if (cv < 6) continue;
      const rxx = -_pt.dz, rzz = _pt.dx;
      for (const lat of [-W * 0.45, W * 0.45]) {
        const cx = _pt.x + rxx * lat, cz = _pt.z + rzz * lat, y = _pt.y + WALL + 1.25;
        const A = gLight.v(cx - _pt.dx * 0.9 - rxx * 0.2, y, cz - _pt.dz * 0.9 - rzz * 0.2, 0, -1, 0, TUNNEL_LAMP);
        const B = gLight.v(cx - _pt.dx * 0.9 + rxx * 0.2, y, cz - _pt.dz * 0.9 + rzz * 0.2, 0, -1, 0, TUNNEL_LAMP);
        const C = gLight.v(cx + _pt.dx * 0.9 + rxx * 0.2, y, cz + _pt.dz * 0.9 + rzz * 0.2, 0, -1, 0, TUNNEL_LAMP);
        const D = gLight.v(cx + _pt.dx * 0.9 - rxx * 0.2, y, cz + _pt.dz * 0.9 - rzz * 0.2, 0, -1, 0, TUNNEL_LAMP);
        gLight.i.push(A, B, C, A, C, D);
      }
    }
  }

  /** 沿道路畫一條（可為虛線的）標線。off = 距中心線的橫向位移（向右為正）。 */
  _strip(e, g, off, half, s0, s1, dash, gap, col) {
    const { pts, hs, cum } = e, n = cum.length;
    const period = dash + gap;
    for (let i = 0; i < n - 1; i++) {
      const a = Math.max(s0, cum[i]), b = Math.min(s1, cum[i + 1]);
      if (b - a < 0.05) continue;
      const seg = cum[i + 1] - cum[i];
      const ax = pts[i * 2], az = pts[i * 2 + 1];
      const dx = (pts[i * 2 + 2] - ax) / seg, dz = (pts[i * 2 + 3] - az) / seg, rx = -dz, rz = dx;
      const emit = (u0, u1) => {
        const t0 = u0 - cum[i], t1 = u1 - cum[i];
        const y0 = (hs ? hs[i] + (hs[i + 1] - hs[i]) * t0 / seg : 0) + MARK_Y, y1 = (hs ? hs[i] + (hs[i + 1] - hs[i]) * t1 / seg : 0) + MARK_Y;
        const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
        const A = g.v(x0 + rx * (off - half), y0, z0 + rz * (off - half), 0, 1, 0, col), B = g.v(x0 + rx * (off + half), y0, z0 + rz * (off + half), 0, 1, 0, col);
        const C = g.v(x1 + rx * (off + half), y1, z1 + rz * (off + half), 0, 1, 0, col), D = g.v(x1 + rx * (off - half), y1, z1 + rz * (off - half), 0, 1, 0, col);
        g.i.push(A, D, B, B, D, C);
      };
      if (!dash) { emit(a, b); continue; }
      for (let k = Math.floor((a - s0) / period); ; k++) {
        const d0 = s0 + k * period, d1 = d0 + dash;
        if (d0 >= b) break;
        const u0 = Math.max(a, d0), u1 = Math.min(b, d1);
        if (u1 - u0 > 0.05) emit(u0, u1);
      }
    }
  }

  /** 橫跨車道的停止線。 */
  _cross(e, g, s, o0, o1, half) {
    edgePoint(e, s, _pt);
    const rx = -_pt.dz, rz = _pt.dx, y = _pt.y + MARK_Y;
    const A = g.v(_pt.x + rx * o0 - _pt.dx * half, y, _pt.z + rz * o0 - _pt.dz * half, 0, 1, 0, WHITE);
    const B = g.v(_pt.x + rx * o1 - _pt.dx * half, y, _pt.z + rz * o1 - _pt.dz * half, 0, 1, 0, WHITE);
    const C = g.v(_pt.x + rx * o1 + _pt.dx * half, y, _pt.z + rz * o1 + _pt.dz * half, 0, 1, 0, WHITE);
    const D = g.v(_pt.x + rx * o0 + _pt.dx * half, y, _pt.z + rz * o0 + _pt.dz * half, 0, 1, 0, WHITE);
    g.i.push(A, D, B, B, D, C);
  }

  _bldGeo(b, ox, oz, cell, g, deco, acs, signs) {
    const h = b[0] / 10, bt = b[1], flat = b[2], n = flat.length / 2, y0 = (b[3] || 0) / 10, yt = y0 + h;
    const mask = b[4] || 0, gen = b[6] || 0;
    if (n < 3) return;
    const pts = new Float32Array(n * 2);
    let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
    for (let i = 0; i < n; i++) {
      const x = ox + flat[i * 2] / 10, z = oz + flat[i * 2 + 1] / 10;
      pts[i * 2] = x; pts[i * 2 + 1] = z;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    const sd = hash2(flat[0] + cell.cx * 131, flat[1] + cell.cz * 717), sd2 = hash2(flat[1] * 3 + 11, flat[0] + 5);
    const pal = PAL[bt] || PAL[0];
    const wall = pal[Math.floor(sd * pal.length) % pal.length];
    const shade = 0.9 + sd2 * 0.18;
    const wc = [wall[0] * shade, wall[1] * shade, wall[2] * shade];
    const plain = bt === 6 || bt === 5 || h < 5;
    const wbt = plain ? -1 : bt;
    const para = plain ? 0 : 0.9;                               // 女兒牆
    const curtain = bt === 2 && h > 18;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[j * 2], bz = pts[j * 2 + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      const nx = dz / L, nz = -dx / L, street = i < 30 && (mask >> i) & 1 ? 1 : 0;
      const top = yt + para;
      const A = g.v(ax, y0, az, nx, 0, nz, wc), B = g.v(bx, y0, bz, nx, 0, nz, wc), C = g.v(bx, top, bz, nx, 0, nz, wc), D = g.v(ax, top, az, nx, 0, nz, wc);
      g.i.push(A, C, B, A, D, C);
      const vt = h + para;
      g.extra.wuv.push(u, 0, wbt, street, u + L, 0, wbt, street, u + L, vt, wbt, street, u, vt, wbt, street);
      g.extra.seed.push(sd, h, sd, h, sd, h, sd, h);
      // 冷氣室外機
      if (!plain && !curtain && L > 3 && acs.length < 2600) {
        const bays = Math.floor(L / 2.7), floors = Math.min(Math.floor(h / 3.2), 11);
        for (let fy = 1; fy < floors; fy++) for (let k = 0; k < bays; k++) {
          const r = hash2(Math.floor(sd * 1e5) + i * 131 + k * 7, fy * 17 + 3);
          if (r > (street ? 0.2 : 0.12)) continue;
          const t = (k + 0.5) / bays, px = ax + dx * t + nx * 0.2, pz = az + dz * t + nz * 0.2;
          acs.push(px, y0 + fy * 3.2 + 0.42, pz, Math.atan2(nx, nz));
        }
      }
      // 自動產生的店面招牌（臨街、一樓）
      if (street && !plain && bt <= 2 && L >= 4 && h > 6) {
        const nb = Math.max(1, Math.round(L / 4.6));
        for (let k = 0; k < nb; k++) {
          const r = hash2(Math.floor(sd * 1e5) + i * 977 + k, 41);
          if (r > 0.72) continue;
          const t = (k + 0.5) / nb, w = Math.min(4.4, L / nb * 0.86);
          signs.push({ gen: true, text: null, seed: r * 7.13 + sd, cat: -1, brand: -1, vertical: false,
            x: ax + dx * t + nx * 0.24, y: y0 + 3.05, z: az + dz * t + nz * 0.24, nx, nz, tx: nz, tz: -nx, w, h: 0.86, box: 0.18 });
        }
        // 直立招牌
        if (h > 12 && hash2(Math.floor(sd * 1e5) + i, 77) < 0.3) {
          const t = hash2(i, Math.floor(sd * 1e4)) < 0.5 ? 0.12 : 0.88, Hs = 3.4 + hash2(i, 5) * 2.4;
          const wx = ax + dx * t + nx * 0.62, wz = az + dz * t + nz * 0.62, sy = y0 + 4.4 + Hs / 2, dlx = dx / L, dlz = dz / L;
          const seed = sd * 3.3 + i;
          for (const sg of [1, -1]) signs.push({ gen: true, vertText: true, text: null, seed, cat: -2, brand: -1, vertical: true,
            x: wx + dlx * 0.05 * sg, y: sy, z: wz + dlz * 0.05 * sg, nx: dlx * sg, nz: dlz * sg, tx: nx * sg, tz: nz * sg, w: 0.95, h: Hs });
        }
      }
      u += L;
    }
    // 屋頂
    let rc;
    if (bt === 5) rc = ROOF_TEMPLE;
    else if (plain && (bt === 0 || bt === 1)) rc = ROOF_SHEET[Math.floor(sd * 97) % ROOF_SHEET.length];
    else rc = ROOF_GREY[Math.floor(sd2 * 89) % ROOF_GREY.length];
    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(pts[i * 2], pts[i * 2 + 1]));
    let tris = null;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (err) { tris = null; }
    if (tris) {
      const base = g.count;
      for (let i = 0; i < n; i++) { g.v(pts[i * 2], yt, pts[i * 2 + 1], 0, 1, 0, rc); g.extra.wuv.push(0, 0, -1, 0); g.extra.seed.push(sd, h); }
      for (const t of tris) {
        const a = contour[t[0]], bb = contour[t[1]], c = contour[t[2]];
        const up = (bb.y - a.y) * (c.x - a.x) - (bb.x - a.x) * (c.y - a.y);
        if (up > 0) g.i.push(base + t[0], base + t[1], base + t[2]); else g.i.push(base + t[0], base + t[2], base + t[1]);
      }
    }
    // 屋頂上的東西：水塔、鐵皮加蓋、機房
    if (!plain && h < 60) {
      let best = 0, ux = 1, uz = 0;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, dx = pts[j * 2] - pts[i * 2], dz = pts[j * 2 + 1] - pts[i * 2 + 1], L = Math.hypot(dx, dz); if (L > best) { best = L; ux = dx / L; uz = dz / L; } }
      let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += pts[i * 2]; cz += pts[i * 2 + 1]; } cx /= n; cz /= n;
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (let i = 0; i < n; i++) { const px = pts[i * 2] - cx, pz = pts[i * 2 + 1] - cz, a = px * ux + pz * uz, bq = -px * uz + pz * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, bq); b1 = Math.max(b1, bq); }
      const la = a1 - a0, lb = b1 - b0, yaw = Math.atan2(ux, uz) + Math.PI / 2;
      const at = (a, bq) => [cx + ux * a - uz * bq, cz + uz * a + ux * bq];
      if (la > 5 && lb > 4) {
        if (bt <= 1) {
          if (sd2 < 0.45 && h < 32) {
            // 鐵皮加蓋
            const [sx, sz] = at((a0 + a1) / 2, (b0 + b1) / 2), shc = ROOF_SHEET[Math.floor(sd2 * 211) % ROOF_SHEET.length];
            addBox(deco, sx, yt + 1.3, sz, la * 0.62, 2.6, lb * 0.62, yaw, srgb(0.78, 0.77, 0.72), shc);
          }
          const nt = sd > 0.55 ? 2 : 1;
          for (let k = 0; k < nt; k++) {
            const [tx, tz] = at(a0 + 1.4 + k * 1.7, b1 - 1.4), blue = hash2(k, Math.floor(sd * 1e4)) < 0.45;
            addBox(deco, tx, yt + 0.5, tz, 1.3, 1.0, 1.3, yaw, srgb(0.5, 0.5, 0.48));
            addCyl(deco, tx, yt + 1.0, tz, 0.62, 1.15, blue ? srgb(0.24, 0.42, 0.68) : srgb(0.80, 0.82, 0.84), 12);
          }
        } else if (bt === 2 || bt === 4 || h > 20) {
          const [mx, mz] = at(a0 * 0.3, b0 * 0.3);
          addBox(deco, mx, yt + 1.2, mz, Math.min(6, la * 0.3), 2.4, Math.min(5, lb * 0.3), yaw, srgb(0.62, 0.63, 0.62));
        }
      }
    }
    const rec = { pts, minx, minz, maxx, maxz, h, y0, cell, stamp: 0 };
    cell.blds.push(rec);
    this._gridInsert(this.bldGrid, cell, rec, minx, minz, maxx, maxz);
  }

  /**
   * 路名牌（指25，寫相交道路的名稱），依街景的做法分兩種（位置由建圖程式算好）：
   *  種類 1：有紅綠燈的路口 — 灰色號誌桿＋伸到車道上方的橫臂，橫臂上掛綠底白字的橫式路名牌（中文、英文、箭頭），
   *          桿子上再貼一塊直式路名牌；紅綠燈燈號由 traffic.js 依同一個位置畫。
   *  種類 0：沒有紅綠燈的路口 — 路口右前方一支獨立的路名牌桿。
   */
  _roadSigns(d, names, ox, oz, g, out) {
    const POLE = srgb(0.46, 0.48, 0.50), HOUSING = srgb(0.10, 0.11, 0.12);
    for (const r of d.rs || []) {
      const name = names[r[0]]; if (!name) continue;
      const en = r[1] >= 0 ? names[r[1]] : '';
      const x = ox + r[2] / 10, z = oz + r[3] / 10, nx = r[4] / 100, nz = r[5] / 100, kind = r[7] || 0, arrows = r[8] || 0;
      const gy = this.groundAt(x, z, r[6] / 10);
      const tx = nz, tz = -nx;                      // 招牌寬度方向＝駕駛的右手邊
      if (kind === 1) {
        const L = (r[9] || 50) / 10, yaw = Math.atan2(nx, nz);
        addCyl(g, x, gy, z, 0.12, 6.15, POLE, 10);                                              // 號誌桿
        const ax = x - tx * L / 2, az = z - tz * L / 2;
        addBox(g, ax, gy + 5.9, az, L, 0.14, 0.14, yaw, POLE);                                  // 橫臂（往駕駛左手邊伸到車道上方）
        const hx = x - tx * (L - 1.0), hz = z - tz * (L - 1.0);
        addBox(g, hx, gy + 5.72, hz, 1.5, 0.5, 0.26, yaw, HOUSING);                              // 燈箱（燈號由 traffic.js 畫）
        addBox(g, hx + nx * 0.16, gy + 5.98, hz + nz * 0.16, 1.5, 0.04, 0.12, yaw, HOUSING);      // 遮光板
        const sw = Math.max(1.4, Math.min(2.3, L - 2.0)), sc = Math.max(sw / 2 + 0.25, (L - 1.75) / 2);
        const sh = en ? 0.62 : 0.5;
        out.push({ road: true, text: name, en, arrows, x: x - tx * sc + nx * 0.08, y: gy + 5.9 - 0.1 - sh / 2, z: z - tz * sc + nz * 0.08, nx, nz, tx, tz, w: sw, h: sh, box: 0.04, vertical: false, cat: -10, brand: -1, seed: 0 });
        out.push({ road: true, text: name.length > 6 ? name.slice(0, 6) : name, en: '', x: x + nx * 0.14, y: gy + 3.1, z: z + nz * 0.14, nx, nz, tx, tz, w: 0.36, h: 1.3, box: 0.03, vertical: true, cat: -10, brand: -1, seed: 0 });
      } else {
        const H = 3.4, pw = 1.8;
        addCyl(g, x - nx * 0.12, gy, z - nz * 0.12, 0.06, H + 0.32, POLE, 8);
        out.push({ road: true, text: name, en, arrows: 0, x, y: gy + H, z, nx, nz, tx, tz, w: pw, h: en ? 0.56 : 0.44, box: 0.04, vertical: false, cat: -10, brand: -1, seed: 0 });
      }
    }
  }

  /** 真實店家招牌（開放地圖有名字的店）。 */
  _realSigns(d, names, ox, oz, signs) {
    for (const r of d.s || []) {
      const name = names[r[0]]; if (!name) continue;
      const cat = r[1], brand = r[2], x = ox + r[3] / 10, z = oz + r[4] / 10, nx = r[5] / 100, nz = r[6] / 100, base = r[7] / 10, bh = r[8] / 10;
      const w = Math.max(2.4, Math.min(7.5, [...name].length * 0.62 + 1.2));
      const y = base + (bh > 6 ? 3.05 : 2.35);
      signs.push({ gen: false, text: name, seed: hash2(r[3], r[4]), cat, brand, vertical: false,
        x: x + nx * 0.26, y, z: z + nz * 0.26, nx, nz, tx: nz, tz: -nx, w, h: 0.95, box: 0.2 });
      if ((cat === 1 || cat === 4 || cat === 7 || cat === 10) && bh > 12 && hash2(r[3], 9) < 0.5) {
        const dlx = -nz, dlz = nx, Hs = Math.min(5.5, [...name].length * 0.85 + 0.8), sy = base + 4.3 + Hs / 2;
        for (const sg of [1, -1]) signs.push({ gen: false, text: name.slice(0, 6), seed: 0, cat, brand, vertical: true,
          x: x + nx * 0.65 + dlx * (1.6 + 0.05 * sg), y: sy, z: z + nz * 0.65 + dlz * (1.6 + 0.05 * sg), nx: dlx * sg, nz: dlz * sg, tx: nx * sg, tz: nz * sg, w: 0.95, h: Hs });
      }
    }
  }

  // ------------------------------------------------------------- 空間查詢
  /**
   * 路面查詢：回傳 (x,z) 所在、且高度最接近 yRef 的道路表面。
   * 找不到時回傳 null（代表在一般地面，高度 0）。
   */
  surfaceAt(x, z, yRef, out) {
    const G = this.G, arr = this.segGrid.get(Math.floor(x / G) * 73856093 ^ Math.floor(z / G) * 19349663);
    if (!arr) return null;
    let best = null, bestD = 2.2;
    for (let k = 0; k < arr.length; k++) {
      const { e, i } = arr[k], p = e.pts;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t, d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
      if (d2 > (e.hw + 0.25) * (e.hw + 0.25)) continue;
      const h = e.hs[i] + (e.hs[i + 1] - e.hs[i]) * t;
      const dh = Math.abs(h - yRef);
      if (dh < bestD - 1e-6 || (best && Math.abs(dh - bestD) < 1e-6 && d2 < out._d2)) {
        bestD = dh; best = e; out.y = h; out.edge = e; out.i = i; out.t = t; out._d2 = d2;
        const L = Math.sqrt(L2); out.s = e.cum[i] + L * t;
        out.lat = ((x - ax) * -dz + (z - az) * dx) / L;
      }
    }
    return best ? out : null;
  }

  /** 最近的道路（不看高度）。filter(e) 回傳 false 可略過。 */
  nearestEdge(x, z, maxD, filter, out) {
    const G = this.G, r = Math.ceil(maxD / G);
    const gx0 = Math.floor(x / G), gz0 = Math.floor(z / G);
    let best = null, bd = maxD * maxD;
    for (let gx = gx0 - r; gx <= gx0 + r; gx++) for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
      const arr = this.segGrid.get(gx * 73856093 ^ gz * 19349663); if (!arr) continue;
      for (let k = 0; k < arr.length; k++) {
        const { e, i } = arr[k]; if (filter && !filter(e)) continue;
        const p = e.pts, ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az, L2 = dx * dx + dz * dz || 1e-6;
        let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t, qz = az + dz * t, d2 = (x - qx) ** 2 + (z - qz) ** 2;
        if (d2 < bd) { bd = d2; best = e; if (out) { out.edge = e; out.x = qx; out.z = qz; out.s = e.cum[i] + Math.sqrt(L2) * t; out.d = Math.sqrt(d2); } }
      }
    }
    return best;
  }

  /** 圓形與建物的碰撞：把 (pos.x,pos.z) 推出建物外，回傳是否有碰到。 */
  collide(pos, r) {
    const G = this.G; let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const stamp = ++this._stamp; let moved = false;
      for (let gx = Math.floor((pos.x - r) / G); gx <= Math.floor((pos.x + r) / G); gx++)
        for (let gz = Math.floor((pos.z - r) / G); gz <= Math.floor((pos.z + r) / G); gz++) {
          const arr = this.bldGrid.get(gx * 73856093 ^ gz * 19349663); if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const b = arr[k]; if (b.stamp === stamp) continue; b.stamp = stamp;
            if (pos.x < b.minx - r || pos.x > b.maxx + r || pos.z < b.minz - r || pos.z > b.maxz + r) continue;
            const p = b.pts, n = p.length / 2; let inside = false, bd = 1e18, qx = 0, qz = 0;
            for (let i = 0, j = n - 1; i < n; j = i++) {
              const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
              if ((az > pos.z) !== (bz > pos.z) && pos.x < (bx - ax) * (pos.z - az) / (bz - az) + ax) inside = !inside;
              const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
              let t = ((pos.x - ax) * dx + (pos.z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
              const x = ax + dx * t, z = az + dz * t, d2 = (pos.x - x) ** 2 + (pos.z - z) ** 2;
              if (d2 < bd) { bd = d2; qx = x; qz = z; }
            }
            const d = Math.sqrt(bd);
            if (inside) { const k2 = (d + r) / (d || 1e-3); pos.x = qx + (qx - pos.x) * (r / (d || 1e-3)); pos.z = qz + (qz - pos.z) * (r / (d || 1e-3)); hit = moved = true; void k2; }
            else if (d < r) { const s = (r - d) / (d || 1e-3); pos.x += (pos.x - qx) * s; pos.z += (pos.z - qz) * s; hit = moved = true; }
          }
        }
      if (!moved) break;
    }
    return hit;
  }

  /** (x,z) 所在的建物（沒有就回傳 null）。 */
  buildingAt(x, z) {
    const G = this.G, arr = this.bldGrid.get(Math.floor(x / G) * 73856093 ^ Math.floor(z / G) * 19349663);
    if (!arr) return null;
    for (const b of arr) {
      if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz) continue;
      const p = b.pts, n = p.length / 2; let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
      }
      if (inside) return b;
    }
    return null;
  }

  /** (x,z) 是否在任何建物內（含 margin）。 */
  insideBuilding(x, z, margin = 0) {
    const p = { x, z }; return this.collide(p, Math.max(0.01, margin));
  }

  districtAt(x, z) {
    for (const d of this.districts) for (const poly of d.polys) {
      let inside = false;
      for (let i = 0, n = poly.length / 2, j = n - 1; i < n; j = i++) {
        const ax = poly[j * 2], az = poly[j * 2 + 1], bx = poly[i * 2], bz = poly[i * 2 + 1];
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
      }
      if (inside) return d.name;
    }
    return '';
  }

  /** 走訪 (x,z) 周圍 r 公尺內已載入的道路。 */
  forEdgesNear(x, z, r, fn) {
    const C = this.CELL;
    for (let cx = Math.floor((x - r - 150) / C); cx <= Math.floor((x + r + 150) / C); cx++)
      for (let cz = Math.floor((z - r - 150) / C); cz <= Math.floor((z + r + 150) / C); cz++) {
        const c = this.cells.get(cx + ',' + cz); if (!c || c.state !== 'ready') continue;
        for (const e of c.edges) fn(e);
      }
  }
}
