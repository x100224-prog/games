// 車輛：外觀模型（玩家車、車流、路邊停放的車共用）、玩家車的物理與車內駕駛艙。
import * as THREE from '../lib/three.module.min.js';
import { CARS } from './config.js';
import { RoundedBoxGeometry } from '../lib/RoundedBoxGeometry.js';

/**
 * 布丁狗：高頂休旅車（短車頭、陡擋風、長平車頂、垂直尾門、滑門）。
 * 車身用側面輪廓擠出＋圓角，再做車頂內縮，比方塊拼起來的更像真車。車頭朝 -z，原點在車身中心地面。
 */
export function buildBerlingo(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.28 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x121a22, roughness: 0.06, metalness: 0.7, side: THREE.DoubleSide });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.82 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9cfd5, roughness: 0.22, metalness: 0.9 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xf1f4f7, emissive: 0xdfe8ff, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.3 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xe0902a, emissive: 0x6a3a00, emissiveIntensity: 0.4, roughness: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xa3161b, emissive: 0x5a0000, emissiveIntensity: 0.55, roughness: 0.25 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.95 });
  const rimM = new THREE.MeshStandardMaterial({ color: 0x8f969d, roughness: 0.3, metalness: 0.85 });
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
  const HW = 0.82, BEV = 0.1;                       // 輪廓擠出的半寬（加上圓角後車寬約 1.84 m）
  // 車頂內縮：越高越往內收
  const tumble = (x, y) => x * (y > 1.12 ? 1 - Math.min(1, (y - 1.12) / 0.75) * 0.085 : 1);
  // 側面輪廓座標 (u = 往前, v = 高度) → 世界 (x, y, z = -u)
  const extrudeSide = (shape, halfW, bevel) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: halfW * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14 });
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i), w = p.getZ(i) - halfW;
      p.setXYZ(i, tumble(w, v), v, -u);
    }
    geo.computeVertexNormals();
    return geo;
  };
  // ---- 車身
  const WR = 0.43, WZ = 1.36;
  const sh = new THREE.Shape();
  sh.moveTo(-2.12, 0.34);
  sh.lineTo(-WZ - WR - 0.08, 0.34); sh.absarc(-WZ, 0.36, WR + 0.08, Math.PI, 0, true);
  sh.lineTo(WZ - WR - 0.08, 0.34); sh.absarc(WZ, 0.36, WR + 0.08, Math.PI, 0, true);
  sh.lineTo(2.08, 0.34);
  sh.quadraticCurveTo(2.17, 0.36, 2.16, 0.58);     // 前保桿
  sh.lineTo(2.13, 0.82);
  sh.quadraticCurveTo(2.1, 0.93, 1.95, 0.96);      // 車頭上緣
  sh.quadraticCurveTo(1.55, 1.04, 1.2, 1.14);      // 微弧引擎蓋
  sh.lineTo(0.5, 1.74);                             // 斜擋風玻璃
  sh.quadraticCurveTo(0.4, 1.8, 0.2, 1.8);
  sh.lineTo(-1.98, 1.8);                            // 長平車頂
  sh.quadraticCurveTo(-2.1, 1.8, -2.12, 1.68);
  sh.lineTo(-2.14, 0.62);                           // 垂直尾門
  sh.quadraticCurveTo(-2.15, 0.36, -2.12, 0.34);
  add(extrudeSide(sh, HW, BEV), paint);
  // ---- 側窗（三片：前門、滑門、後側窗；中間露出車身色的 B／C 柱）
  const winShape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) s.lineTo(pts[i], pts[i + 1]); return s; };
  const GW = HW + BEV + 0.012;
  // 黑色柱子＋深色玻璃連成一條窗帶，再用細黑框分出前門、滑門、後側窗
  add(extrudeSide(winShape([1.12, 1.17, 0.5, 1.72, -2.0, 1.72, -2.03, 1.17]), GW, 0), glass);
  for (const u of [0.18, -1.08]) add(extrudeSide(winShape([u + 0.05, 1.17, u + 0.05, 1.72, u - 0.05, 1.72, u - 0.05, 1.17]), GW + 0.004, 0), plastic);
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.035, 3.1), chrome, sd * (GW + 0.004), 1.165, 0.42);   // 窗下飾條
  // ---- 前擋風、後擋（貼在圓角外表面外一點點）
  const quad = (pts, mat) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals(); return add(geo, mat);
  };
  {
    const a = [1.2, 1.14], b = [0.5, 1.74], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = dy / L * -1, ny = -dx / L;
    const off = BEV + 0.012, P = (t, sideW) => { const u = a[0] + dx * t + nx * -off, v = a[1] + dy * t + ny * off; return [sideW, v, -u]; };
    const p0 = P(0.06, -0.78), p1 = P(0.06, 0.78), p2 = P(0.95, 0.72), p3 = P(0.95, -0.72);
    quad([...p0, ...p1, ...p2, ...p3], glass);
  }
  quad([-0.68, 1.16, 2.242, 0.68, 1.16, 2.242, 0.64, 1.7, 2.232, -0.64, 1.7, 2.232], glass);
  // ---- 輪胎與輪圈（5 幅）、黑色輪拱
  for (const sd of [-1, 1]) for (const z of [-WZ, WZ]) {
    const t = new THREE.CylinderGeometry(0.335, 0.335, 0.23, 28); t.rotateZ(Math.PI / 2); add(t, tire, sd * 0.8, 0.335, -z);
    const r = new THREE.CylinderGeometry(0.235, 0.235, 0.02, 24); r.rotateZ(Math.PI / 2); add(r, plastic, sd * 0.918, 0.335, -z);
    for (let k = 0; k < 10; k++) { const sp = add(new THREE.BoxGeometry(0.02, 0.21, k % 2 ? 0.035 : 0.055), rimM, sd * 0.928, 0.335, -z); sp.rotation.x = k * Math.PI / 5; sp.translateY(0.105); }   // 雙色鋁圈
    const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12); hub.rotateZ(Math.PI / 2); add(hub, chrome, sd * 0.935, 0.335, -z);
    const arch = new THREE.TorusGeometry(WR + 0.02, 0.05, 6, 22, Math.PI); add(arch, plastic, sd * 0.915, 0.36, -z, 0, Math.PI / 2, 0);
  }
  for (const sd of [-1, 1]) {
    add(rb(0.05, 0.09, 3.4, 0.02), plastic, sd * 0.93, 0.44, 0);                    // 側裙
    add(rb(0.05, 0.2, 1.62, 0.07), plastic, sd * 0.935, 0.62, 0.2);                   // 車門下方黑色護板
    add(rb(0.052, 0.025, 0.5, 0.01), tail, sd * 0.94, 0.68, -0.25);                   // 護板上的紅色小飾條
    add(new THREE.BoxGeometry(0.02, 0.62, 0.015), plastic, sd * 0.925, 0.82, -0.2);   // 前門縫
    add(new THREE.BoxGeometry(0.02, 0.62, 0.015), plastic, sd * 0.925, 0.82, 1.08);   // 滑門後緣
    add(new THREE.BoxGeometry(0.015, 0.03, 1.1), plastic, sd * 0.905, 1.13, 1.6);     // 滑門軌道
    add(rb(0.03, 0.035, 0.16, 0.01), plastic, sd * 0.935, 1.02, -0.05);               // 門把
    add(rb(0.03, 0.035, 0.16, 0.01), plastic, sd * 0.935, 1.02, 1.0);
    // 後照鏡（車身色外殼＋黑色支架）
    add(rb(0.07, 0.07, 0.12, 0.02), plastic, sd * 0.95, 1.18, -1.05);
    add(rb(0.12, 0.17, 0.22, 0.05), plastic, sd * 1.03, 1.26, -1.03);
    add(rb(0.05, 0.06, 2.7, 0.02), plastic, sd * 0.62, 1.93, 0.2);                    // 黑色車頂架
    for (const z of [-1.0, 1.25]) add(rb(0.07, 0.06, 0.1, 0.02), plastic, sd * 0.6, 1.88, z);
  }
  // ---- 車頭：大燈、方向燈、水箱罩、霧燈、黑色下保桿、車牌
  for (const sd of [-1, 1]) {
    add(rb(0.46, 0.09, 0.08, 0.035), lamp, sd * 0.6, 0.86, -2.2, 0, sd * 0.14, 0);
    add(rb(0.12, 0.06, 0.06, 0.02), amber, sd * 0.84, 0.88, -2.18, 0, sd * 0.3, 0);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), lamp, sd * 0.62, 0.44, -2.28, Math.PI / 2, 0, 0);
  }
  add(rb(0.86, 0.12, 0.06, 0.04), plastic, 0, 0.9, -2.22);                              // 上水箱罩
  add(rb(1.2, 0.2, 0.06, 0.05), plastic, 0, 0.62, -2.24);                               // 下進氣口
  add(rb(1.86, 0.2, 0.14, 0.06), plastic, 0, 0.42, -2.2);                               // 下保桿
  add(rb(1.3, 0.05, 0.08, 0.02), chrome, 0, 0.3, -2.22);                                // 銀色下護板
  add(new THREE.BoxGeometry(0.52, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }), 0, 0.72, -2.27);
  // ---- 車尾：直立尾燈、尾門把手、第三煞車燈、黑色後保桿、車牌
  for (const sd of [-1, 1]) add(rb(0.14, 0.5, 0.06, 0.04), tail, sd * 0.82, 1.1, 2.24);
  add(rb(0.5, 0.025, 0.04, 0.01), tail, 0, 1.76, 2.2);
  add(rb(0.3, 0.05, 0.05, 0.02), chrome, 0, 1.08, 2.27);
  add(rb(1.86, 0.24, 0.14, 0.06), plastic, 0, 0.45, 2.2);
  add(new THREE.BoxGeometry(0.52, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }), 0, 0.8, 2.28);
  return g;
}

/**
 * 飛天跑車：低矮的電動雙座跑車（長車頭、很斜的前擋、短車頂、斜背車尾＋小鴨尾）。外型是自己設計的通用跑車比例，
 * 不照任何品牌的車抄。車尾兩個、車底四個高壓氣體推進噴嘴（特技用），車底有吸附風扇。車頭朝 -z，原點在車身中心地面。
 * 每個零件回傳 { geo, mat }，玩家的車（一般網格＋材質）和車流裡的飛天跑車（合併成一個幾何）共用。
 */
let _rsParts = null;
function roadsterParts() {
  if (_rsParts) return _rsParts;
  const parts = [];
  const put = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    parts.push({ geo: g, mat }); return g;
  };
  const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
  const HW = 0.84, BEV = 0.12;
  // 車身寬度變化：車艙越高越往內收，車頭、車尾兩端也收窄
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const shapeX = (x, v, u) => x * (1 - sstep(0.78, 1.18, v) * 0.27) * (1 - 0.12 * sstep(1.3, 2.25, u) - 0.06 * sstep(-1.6, -2.2, u));
  const extrudeSide = (shape, halfW, bevel) => {
    // 圓角只往車寬方向長（bevelSize 很小），車長、車高維持輪廓的尺寸
    const geo = new THREE.ExtrudeGeometry(shape, { depth: halfW * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.35, bevelSegments: 3, curveSegments: 16 });
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i), w = p.getZ(i) - halfW; p.setXYZ(i, shapeX(w, v, u), v, -u); }
    geo.computeVertexNormals();
    return geo;
  };
  const WR = 0.34, WF = 1.32, WB = -1.25, AR = WR + 0.08;
  const sh = new THREE.Shape();
  sh.moveTo(-2.12, 0.3);
  sh.lineTo(WB - AR, 0.3); sh.absarc(WB, 0.34, AR, Math.PI, 0, true);
  sh.lineTo(WF - AR, 0.3); sh.absarc(WF, 0.34, AR, Math.PI, 0, true);
  sh.lineTo(2.02, 0.28);
  sh.quadraticCurveTo(2.22, 0.3, 2.2, 0.48);       // 車鼻下緣
  sh.quadraticCurveTo(2.18, 0.62, 1.98, 0.68);      // 車鼻上緣
  sh.quadraticCurveTo(1.3, 0.8, 0.62, 0.86);        // 長引擎蓋
  sh.lineTo(-0.12, 1.15);                           // 很斜的前擋風玻璃
  sh.quadraticCurveTo(-0.3, 1.19, -0.55, 1.16);     // 短車頂（可拆頂篷）
  sh.quadraticCurveTo(-1.3, 1.07, -1.88, 0.9);      // 斜背
  sh.lineTo(-2.08, 0.93);                           // 鴨尾
  sh.quadraticCurveTo(-2.18, 0.9, -2.16, 0.7);
  sh.lineTo(-2.14, 0.42);
  sh.quadraticCurveTo(-2.15, 0.31, -2.12, 0.3);
  put(extrudeSide(sh, HW, BEV), 'paint');
  // 側窗
  const poly = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) s.lineTo(pts[i], pts[i + 1]); return s; };
  const GW = HW + BEV + 0.012;
  put(extrudeSide(poly([0.5, 0.89, -0.1, 1.12, -0.52, 1.125, -1.22, 0.97, -1.3, 0.9]), GW, 0), 'glass');
  // 前擋、後窗（貼在車身表面外一點點）
  const quad = (pts, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals(); return put(geo, mat); };
  const onLine = (a, b, t, off) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + off];
  {
    const a = [0.62, 0.86], b = [-0.12, 1.15], P = (t, s) => { const [u, v] = onLine(a, b, t, 0.05); return [s * shapeX(HW + BEV - 0.06, v, u), v, -u]; };
    quad([...P(0.05, 1), ...P(0.05, -1), ...P(0.95, -1), ...P(0.95, 1)], 'glass');
    // 後窗：沿著斜背的曲線分段貼上（直接用一片平面會被凸起的車身蓋住中間）
    const B = (t) => { const k = 1 - t; return [k * k * -0.55 + 2 * k * t * -1.3 + t * t * -1.88, k * k * 1.16 + 2 * k * t * 1.07 + t * t * 0.9]; };
    const Q = (t, s) => { const [u, v] = B(t); return [s * shapeX(HW + BEV - 0.14, v, u), v + 0.045, -u]; };
    for (let k = 0; k < 6; k++) { const t0 = 0.08 + k * 0.09, t1 = t0 + 0.09; quad([...Q(t0, 1), ...Q(t0, -1), ...Q(t1, -1), ...Q(t1, 1)], 'glass'); }
  }
  // 輪胎、輪圈（10 幅）、煞車卡鉗
  for (const sd of [-1, 1]) for (const u of [WF, WB]) {
    const t = new THREE.CylinderGeometry(WR, WR, 0.27, 28); t.rotateZ(Math.PI / 2); put(t, 'tire', sd * 0.84, WR, -u);
    const r = new THREE.CylinderGeometry(0.25, 0.25, 0.02, 24); r.rotateZ(Math.PI / 2); put(r, 'black', sd * 0.975, WR, -u);
    for (let k = 0; k < 10; k++) { const sp = new THREE.BoxGeometry(0.02, 0.23, 0.04); sp.translate(0, 0.115, 0); sp.rotateX(k * Math.PI / 5); put(sp, 'rim', sd * 0.985, WR, -u); }
  }
  for (const sd of [-1, 1]) {
    put(rb(0.05, 0.08, 2.3, 0.02), 'black', sd * 0.965, 0.36, 0.0);           // 側裙
    put(rb(0.05, 0.17, 0.5, 0.06), 'black', sd * 0.965, 0.62, 0.78);          // 車門後方的進氣口
    put(rb(0.09, 0.07, 0.17, 0.03), 'paint', sd * 0.97, 0.98, -0.32);        // 後照鏡
    put(rb(0.5, 0.045, 0.1, 0.02), 'lamp', sd * 0.6, 0.63, -2.12, 0, sd * 0.22, 0);   // 細長 LED 頭燈
  }
  put(rb(1.24, 0.15, 0.08, 0.05), 'black', 0, 0.4, -2.21);                     // 下進氣口
  put(rb(1.66, 0.11, 0.03, 0.02), 'black', 0, 0.85, 2.165);                    // 尾燈黑底
  put(rb(1.6, 0.06, 0.05, 0.02), 'tail', 0, 0.86, 2.19);                      // 貫穿式尾燈
  put(new THREE.BoxGeometry(0.5, 0.11, 0.02), 'plate', 0, 0.64, 2.2);           // 車牌（空白）
  put(rb(1.6, 0.14, 0.12, 0.05), 'black', 0, 0.36, 2.17);                      // 後擾流（擴散器）
  // 推進噴嘴：車尾兩個、車底四個
  for (const sx of [-0.36, 0.36]) { const n = new THREE.CylinderGeometry(0.075, 0.095, 0.12, 14, 1, true); n.rotateX(Math.PI / 2); put(n, 'chrome', sx, 0.52, 2.2); }
  for (const sx of [-0.62, 0.62]) for (const sz of [-1.62, 1.6]) put(new THREE.CylinderGeometry(0.06, 0.08, 0.08, 10), 'chrome', sx, 0.24, sz);
  for (const sd of [-1, 1]) { const n = new THREE.CylinderGeometry(0.06, 0.075, 0.1, 12, 1, true); n.rotateZ(Math.PI / 2); put(n, 'chrome', sd * 0.985, 0.62, 0.1); }   // 兩側
  for (const sx of [-0.5, 0.5]) { const n = new THREE.CylinderGeometry(0.055, 0.07, 0.1, 12, 1, true); n.rotateX(Math.PI / 2); put(n, 'chrome', sx, 0.42, -2.24); }    // 車頭
  _rsParts = parts;
  return parts;
}

/**
 * 壓縮空氣噴嘴（車身座標，車頭朝 -z）：5 個方向、10 個噴嘴。噴嘴的數量與位置是遊戲設定（Tesla 沒有公布推進器配置）。
 *   往後 2：推進加速、飛越往前衝　往下 4：垂直升空、落地前減速　往左 1、往右 1：空中翻轉、空中轉向　往前 2：空中減速
 * 玩家不用分開操作，依照車子正在做的動作自動噴。
 */
export const ROADSTER_JETS = {
  rear: [{ p: [-0.36, 0.52, 2.3], d: [0, 0, 1] }, { p: [0.36, 0.52, 2.3], d: [0, 0, 1] }],
  down: [[-0.62, -1.62], [0.62, -1.62], [-0.62, 1.6], [0.62, 1.6]].map(([x, z]) => ({ p: [x, 0.17, z], d: [0, -1, 0] })),
  left: [{ p: [-1.04, 0.62, 0.1], d: [-1, 0, 0] }],
  right: [{ p: [1.04, 0.62, 0.1], d: [1, 0, 0] }],
  front: [{ p: [-0.5, 0.42, -2.3], d: [0, 0, -1] }, { p: [0.5, 0.42, -2.3], d: [0, 0, -1] }],
};

/** 玩家開的飛天跑車：回傳 Group，userData.flames 是噴嘴口的亮光（各方向）、userData.grip 是吸附風扇的光。 */
export function buildRoadster(color) {
  const g = new THREE.Group();
  const M = {
    paint: new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0f161d, roughness: 0.05, metalness: 0.75, side: THREE.DoubleSide }),
    black: new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.7 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.95 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.3, metalness: 0.85 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf4f7fa, emissive: 0xe4eeff, emissiveIntensity: 0.8, roughness: 0.15 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff3a3a, emissive: 0xe01010, emissiveIntensity: 0.9, roughness: 0.25 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
  };
  for (const p of roadsterParts()) { const m = new THREE.Mesh(p.geo, M[p.mat]); m.castShadow = true; g.add(m); }
  // 推進火焰（高壓氣體，藍白色）：平常隱藏，用 scale 控制長度
  const flameM = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  // 噴嘴口的亮光：短錐形，尖端朝噴出方向（長度用 scale.y 控制）；真正看得到的是 mist.js 畫的白霧
  const flames = { rear: [], down: [], left: [], right: [], front: [] }, up = new THREE.Vector3(0, -1, 0);
  for (const k of Object.keys(ROADSTER_JETS)) for (const j of ROADSTER_JETS[k]) {
    const c = new THREE.ConeGeometry(k === 'down' ? 0.08 : 0.1, 1, 12, 1, true); c.translate(0, -0.5, 0);   // 尖端朝 -y
    const f = new THREE.Mesh(c, flameM); f.position.set(j.p[0], j.p[1], j.p[2]);
    f.quaternion.setFromUnitVectors(up, new THREE.Vector3(j.d[0], j.d[1], j.d[2]));
    f.visible = false; g.add(f); flames[k].push(f);
  }
  const grip = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.4).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  grip.position.y = 0.17; grip.visible = false; g.add(grip);
  g.userData.flames = flames; g.userData.grip = grip;
  return g;
}

let _rsGeo = null;
/** 車流裡的飛天跑車（一個實例化網格）：{ paint, trim }，trim 用頂點顏色。 */
export function roadsterGeometry() {
  if (_rsGeo) return _rsGeo;
  const paint = { p: [], n: [], c: [] }, trim = { p: [], n: [], c: [] };
  const COL = { glass: [0.06, 0.08, 0.1], black: [0.07, 0.08, 0.09], tire: [0.05, 0.05, 0.05], rim: [0.35, 0.37, 0.4], chrome: [0.7, 0.72, 0.75], lamp: [0.95, 0.96, 0.98], tail: [0.9, 0.12, 0.1], plate: [0.92, 0.92, 0.9] };
  for (const p of roadsterParts()) {
    if (p.mat === 'paint') part(p.geo.clone(), 0, 0, 0, [1, 1, 1], paint);
    else part(p.geo.clone(), 0, 0, 0, COL[p.mat], trim);
  }
  _rsGeo = { paint: finish(paint), trim: finish(trim) };
  return _rsGeo;
}

// ------------------------------------------------------------------ 幾何工具
function part(geo, x, y, z, rgb, out, mutate) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = g.attributes.normal;
  _c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  if (mutate) { mutate(p); g.computeVertexNormals(); }
  for (let i = 0; i < p.count; i++) {
    out.p.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z);
    out.n.push(n.getX(i), n.getY(i), n.getZ(i));
    out.c.push(_c.r, _c.g, _c.b);
  }
}
const _c = new THREE.Color();
function finish(out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.c, 3));
  g.computeBoundingSphere();
  return g;
}
const taper = (sx, sz, dz = 0) => (p) => { for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * sx); p.setZ(i, p.getZ(i) * sz + dz); } };

let _carGeo = null;
/** 低多邊形房車。車頭朝 -z，原點在車身中心的地面上。回傳 { paint, trim }。 */
export function carGeometry() {
  if (_carGeo) return _carGeo;
  const paint = { p: [], n: [], c: [] }, trim = { p: [], n: [], c: [] };
  const W = [1, 1, 1];
  part(new THREE.BoxGeometry(1.78, 0.52, 4.4), 0, 0.56, 0, W, paint);
  part(new THREE.BoxGeometry(1.74, 0.16, 1.5), 0, 0.84, -1.42, W, paint, taper(0.96, 0.92, -0.04));   // 引擎蓋
  part(new THREE.BoxGeometry(1.74, 0.14, 1.0), 0, 0.84, 1.68, W, paint, taper(0.96, 0.9, 0.04));      // 行李廂
  part(new THREE.BoxGeometry(1.36, 0.05, 1.32), 0, 1.44, 0.22, W, paint);                              // 車頂
  part(new THREE.BoxGeometry(1.62, 0.58, 2.5), 0, 1.11, 0.2, [0.10, 0.13, 0.16], trim, taper(0.84, 0.54, 0.02)); // 車窗
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12); wheel.rotateZ(Math.PI / 2);
  for (const sx of [-0.8, 0.8]) for (const sz of [-1.36, 1.38]) part(wheel.clone(), sx, 0.33, sz, [0.07, 0.07, 0.08], trim);
  part(new THREE.BoxGeometry(1.5, 0.12, 0.06), 0, 0.66, -2.21, [0.95, 0.95, 0.86], trim);   // 頭燈
  part(new THREE.BoxGeometry(1.5, 0.12, 0.06), 0, 0.70, 2.21, [0.75, 0.10, 0.08], trim);    // 尾燈
  part(new THREE.BoxGeometry(1.8, 0.14, 4.44), 0, 0.27, 0, [0.09, 0.09, 0.10], trim);       // 底盤裙
  _carGeo = { paint: finish(paint), trim: finish(trim) };
  return _carGeo;
}

export const TRAFFIC_COLORS = [0xe8e8e6, 0xe8e8e6, 0xd9dadb, 0x2b2d31, 0x2b2d31, 0x8e9399, 0x8e9399, 0x6f1f24, 0x21395c, 0xb9b3a4, 0x3d5a4a]
  .map(h => new THREE.Color(h));
export const TAXI_COLOR = new THREE.Color(0xf2c21a);

// ------------------------------------------------------------------ 玩家的車
const _surf = { y: 0, edge: null, s: 0, lat: 0, i: 0, t: 0, _d2: 0 };
const _p = { x: 0, z: 0 };

export class PlayerCar {
  constructor(scene, world, spec) {
    this.world = world; this.spec = spec;
    this.x = 0; this.y = 0; this.z = 0; this.psi = 0; this.pitch = 0;
    this.v = 0; this.steer = 0; this.energy = spec.capacity;
    this.odo = 0; this.bumps = 0; this._bumpCd = 0;
    this.edge = null; this.edgeS = 0; this.edgeLat = 0; this.gear = 'P';
    const g = carGeometry();
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    if (spec.model === 'berlingo') {
      this.body.add(buildBerlingo(spec.color));
    } else if (spec.model === 'roadster') {
      const rs = buildRoadster(spec.color); this.body.add(rs);
      this.flames = rs.userData.flames; this.grip = rs.userData.grip;
    } else {
      this.body.add(new THREE.Mesh(g.paint, new THREE.MeshLambertMaterial({ color: spec.color })));
      this.body.add(new THREE.Mesh(g.trim, new THREE.MeshLambertMaterial({ vertexColors: true })));
    }
    if (spec.model === 'berlingo' || spec.model === 'roadster') { /* 外觀已含燈與標誌 */ } else if (spec.key === 'ev') {
      // 電動車：車頭貫穿式燈條與綠色充電口標示
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x9fe8ff })); bar.position.set(0, 0.8, -2.2); this.body.add(bar);
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0x3fbf7f })); port.position.set(-0.9, 0.78, 1.5); this.body.add(port);
    } else {
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.05), new THREE.MeshLambertMaterial({ color: 0x15171a })); grille.position.set(0, 0.5, -2.21); this.body.add(grille);
    }
    this.group.add(this.body);
    scene.add(this.group);
  }

  place(x, z, psi, y = 0) { this.x = x; this.z = z; this.psi = psi; this.y = y; this.v = 0; this.steer = 0; this.thrF = 0; this.brkF = 0; this.sync(); }

  get fwdX() { return -Math.sin(this.psi); }
  get fwdZ() { return -Math.cos(this.psi); }
  get kmh() { return Math.abs(this.v) * 3.6; }

  /** ctl: { throttle 0..1, brake 0..1, steer -1..1 (正=左), handbrake } ；obstacles: [{x,z,r}] */
  update(dt, ctl, obstacles) {
    const spec = this.spec, L = 2.7;
    // ---- 踏板濾波（賽車遊戲給鍵盤／手把用的做法）：鍵盤只有「按」和「放」，直接用會變成
    //      一按就全油門、一按就 1 G 急煞，畫面猛衝猛停。改成按住時踏板慢慢踩深：
    //      油門約 0.35 秒踩到底、煞車約 0.6 秒踩到底，放開時很快鬆開。輕點就是輕踩。
    const thrIn = Math.max(0, Math.min(1, ctl.throttle || 0)), brkIn = Math.max(0, Math.min(1, ctl.brake || 0));
    this.thrF = this.thrF || 0; this.brkF = this.brkF || 0;
    this.thrF += Math.max(-dt / 0.12, Math.min(dt / 0.35, thrIn - this.thrF));
    this.brkF += Math.max(-dt / 0.15, Math.min(dt / 0.6, brkIn - this.brkF));
    const thr = this.thrF, brk = this.brkF;
    // ---- 縱向
    let a = 0;
    const hasEnergy = this.energy > 0;
    if (thr > 0.001 && hasEnergy) {
      if (this.v >= -0.2) { a += spec.accel * thr * Math.max(0, 1 - Math.pow(Math.max(0, this.v) / spec.maxSpeed, 1.4)); this.gear = 'D'; }
      else a += 9 * thr;
    }
    if (brk > 0.001) {
      // 快停下來時煞車自動放輕（像熟練的駕駛在停止前鬆一點煞車），停下那一下不會猛頓
      if (this.v > 0.4) a -= 9.5 * brk * Math.max(0.3, Math.min(1, this.v / 3));
      else if (hasEnergy) { a -= 2.6 * brk * Math.max(0, 1 + this.v / 7); this.gear = 'R'; }
    }
    const drag = 0.35 + 0.012 * this.v * this.v * 0.25 + (this.offroad ? 1.6 : 0);
    if (thr <= 0.001 && brk <= 0.001) { const d = drag * dt; this.v = Math.abs(this.v) <= d ? 0 : this.v - Math.sign(this.v) * d; }
    if (ctl.handbrake) { const d = 12 * dt; this.v = Math.abs(this.v) <= d ? 0 : this.v - Math.sign(this.v) * d; }
    this.v += a * dt;
    if (this.offroad && this.v > 9) this.v -= (this.v - 9) * Math.min(1, dt * 2);
    if (Math.abs(this.v) < 0.02 && thr <= 0.001 && brk <= 0.001) { this.v = 0; this.gear = 'P'; }
    // ---- 轉向（高速時自動收斂，避免過大的側向加速度）
    const maxSteer = Math.min(0.62, Math.atan(L * 5.5 / Math.max(1, this.v * this.v)));
    const target = ctl.steer * maxSteer;
    // 方向盤濾波：原本是固定每秒轉 1.5 弧度，車速快時能打的角度很小，0.05 秒就打滿，
    // 按一下 D 畫面就瞬間甩過去。改成跟賽車遊戲的「steer filter」一樣：不管車速，
    // 從回正打到底都要約 0.45 秒、放開約 0.25 秒回正，輕點 = 輕輕修一點方向。
    const over = Math.abs(this.steer) > maxSteer + 1e-4;     // 加速後原本的角度超過現在允許的範圍：快速收回
    const rate = (over ? 2.6 : (Math.abs(target) < Math.abs(this.steer) ? maxSteer / 0.25 : maxSteer / 0.45)) * dt;
    this.steer += Math.max(-rate, Math.min(rate, target - this.steer));
    this.psi += this.v / L * Math.tan(this.steer) * dt;
    // ---- 位移與路面
    const ox = this.x, oz = this.z;
    let nx = this.x + this.fwdX * this.v * dt, nz = this.z + this.fwdZ * this.v * dt;
    let s = this.world.surfaceAt(nx, nz, this.y, _surf);
    const gN = this.world.groundAt(nx, nz, this.y);
    if (!s && (this.y - gN > 1.3 || (this.edge && this.edge.tunnel && this.y - gN < -0.8))) {   // 高架護欄、地下道牆
      // 前方沒有路面：被護欄或隧道牆擋住，只保留沿著道路方向的分量
      let ok = false;
      if (this.edge && !this.edge.dead) {
        const e = this.edge, i = Math.min(e.cum.length - 2, Math.max(0, this._segI | 0));
        const seg = e.cum[i + 1] - e.cum[i] || 1, tx = (e.pts[i * 2 + 2] - e.pts[i * 2]) / seg, tz = (e.pts[i * 2 + 3] - e.pts[i * 2 + 1]) / seg;
        const along = (nx - ox) * tx + (nz - oz) * tz;
        const mx = ox + tx * along, mz = oz + tz * along;
        s = this.world.surfaceAt(mx, mz, this.y, _surf);
        if (s) { nx = mx; nz = mz; ok = true; this.v *= Math.max(0, 1 - dt * 2.5); this._bump(0.5); }
      }
      if (!ok) { nx = ox; nz = oz; this.v *= 0.3; this._bump(1); s = this.world.surfaceAt(nx, nz, this.y, _surf); }
    }
    this.x = nx; this.z = nz;
    let ty = s ? s.y : this.world.groundAt(nx, nz, this.y);
    if (s) { ty = s.y; this.edge = s.edge; this.edgeS = s.s; this.edgeLat = s.lat; this._segI = s.i; this.offroad = false; }
    else { this.offroad = !this.onLot; }
    const dy = ty - this.y; this.y += dy * Math.min(1, dt * 12);
    const sp = Math.abs(this.v) > 0.5 ? Math.atan2(dy * 12 * Math.sign(this.v), Math.abs(this.v) + 3) : 0;
    this.pitch += (Math.max(-0.2, Math.min(0.2, sp)) - this.pitch) * Math.min(1, dt * 6);
    // ---- 碰撞：建物（地面層才有）
    this._bumpCd -= dt;
    const relG = this.y - this.world.groundAt(this.x, this.z, this.y);
    if (relG < 2.5 && relG > -2.0) {   // 在高架上或地下道裡不會撞到地面建物
      let hit = false;
      for (const off of [1.55, 0, -1.55]) {
        _p.x = this.x + this.fwdX * off; _p.z = this.z + this.fwdZ * off;
        const bx = _p.x, bz = _p.z;
        if (this.world.collide(_p, 0.95)) { this.x += _p.x - bx; this.z += _p.z - bz; hit = true; }
      }
      if (hit) { const sp0 = Math.abs(this.v); this.v *= Math.max(0, 1 - dt * 6); if (sp0 > 2.5) { this.v *= 0.4; this._bump(sp0 / 6); } }
    }
    // ---- 碰撞：其他車輛
    if (obstacles) for (const o of obstacles) {
      if (Math.abs(o.y - this.y) > 2) continue;
      for (const off of [1.3, -1.3]) {
        const cx = this.x + this.fwdX * off, cz = this.z + this.fwdZ * off;
        for (const oo of [1.2, -1.2]) {
          const px = o.x - Math.sin(o.psi) * oo, pz = o.z - Math.cos(o.psi) * oo;
          const dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz), R = 1.9;
          if (d < R && d > 1e-3) {
            const push = (R - d);
            this.x += dx / d * push; this.z += dz / d * push;
            const sp0 = Math.abs(this.v);
            this.v *= 0.55; if (sp0 > 1.5) this._bump(sp0 / 5);
            if (o.car) o.car.v *= 0.3;
          }
        }
      }
    }
    // ---- 里程與耗能
    const dist = Math.hypot(this.x - ox, this.z - oz);
    this.odo += dist;
    this.energy = Math.max(0, this.energy - dist / 1000 * spec.perKm * (1 + Math.max(0, a) * 0.08));
    this.sync();
  }

  _bump(strength) {
    if (this._bumpCd > 0) return;
    this._bumpCd = 1.2; this.bumps++; this.lastBump = strength;
    if (this.onBump) this.onBump(strength);
  }

  sync() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.set(this.pitch, this.psi, 0, 'YXZ');
  }
}

// ------------------------------------------------------------------ 駕駛艙（車內視角）
export class Cockpit {
  constructor(spec) {
    this.spec = spec;
    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight(0xdfe9f5, 0x8a8076, 1.5); this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.2); sun.position.set(-0.6, 1, -0.5); this.scene.add(sun); this.sun = sun;
    this.cam = new THREE.PerspectiveCamera(66, 1, 0.03, 12);
    this.eye = new THREE.Vector3(-0.38, 1.2, 0.18);   // 台灣為左駕
    this.root = new THREE.Group(); this.scene.add(this.root);
    const dy = spec.cockpitLift || 0;                    // 高頂車（布丁狗）坐得比較高
    // 車艙形狀（跑車：駕駛坐得比較後面、車頂比較低、前擋比較斜）
    const CB = Object.assign({ z: 0, pillarTop: 1.58, roofY: 1.6, linerZ: 0.52, linerD: 1.9, mirrorY: 1.47 }, spec.cabin || {});
    const dark = new THREE.MeshLambertMaterial({ color: 0x33363c }), mid = new THREE.MeshLambertMaterial({ color: 0x4a4e56 });
    const soft = new THREE.MeshLambertMaterial({ color: 0x5b5f68 }), liner = new THREE.MeshLambertMaterial({ color: 0xb8bbbf }), paintM = new THREE.MeshLambertMaterial({ color: spec.color });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); this.root.add(m); return m; };
    // 引擎蓋
    const hood = new THREE.BoxGeometry(1.72, 0.1, 1.5); taper(0.94, 0.95)(hood.attributes.position); hood.computeVertexNormals();
    add(hood, paintM, 0, 0.9, -1.72, 0.035);
    // 儀表台（深灰上飾板＋黑色下半部，參考使用者給的內裝照片的配置）
    const dashTop = new THREE.MeshLambertMaterial({ color: 0x45484e }), dashLow = new THREE.MeshLambertMaterial({ color: 0x2a2d31 });
    const gloss = new THREE.MeshLambertMaterial({ color: 0x15171a }), red = new THREE.MeshLambertMaterial({ color: 0xb3262b });
    const rbx = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
    add(rbx(1.76, 0.3, 0.62, 0.06), dashLow, 0, 0.84, -0.8);
    add(rbx(1.76, 0.1, 0.56, 0.05), dashTop, 0, 1.02, -0.86, 0.1);
    // 儀表拿掉了（會擋擋風玻璃）：車速、電量／油量改顯示在右邊的中控螢幕
    add(rbx(1.0, 0.03, 0.04, 0.01), dashTop, 0.28, 0.96, -0.5);                       // 副駕前橫飾條
    add(rbx(0.62, 0.16, 0.03, 0.03), dashLow, 0.5, 0.82, -0.49);                      // 置物箱
    add(new THREE.BoxGeometry(0.2, 0.012, 0.01), gloss, 0.5, 0.8, -0.475);            // 置物箱把手
    add(rbx(0.06, 0.32, 0.03, 0.01), red, 0.62, 1.0, -0.82, -1.0);                    // 副駕上方紅色縫線飾條
    // 中控：出風口、雙閃鍵、空調面板、下方排檔座
    for (const sx of [-0.105, 0.105]) {
      add(rbx(0.17, 0.065, 0.04, 0.02), gloss, sx, 1.0, -0.52);
      for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.15, 0.006, 0.01), dashTop, sx, 0.983 + k * 0.017, -0.497);
    }
    add(rbx(0.05, 0.035, 0.02, 0.008), red, 0, 1.0, -0.505);
    add(rbx(0.34, 0.05, 0.03, 0.015), gloss, 0, 0.93, -0.5);                         // 空調面板
    add(rbx(0.24, 0.5, 0.42, 0.04), dashLow, 0, 0.6, -0.42);                         // 中控台
    add(rbx(0.14, 0.1, 0.14, 0.03), gloss, 0, 0.84, -0.36, -0.5);                    // 排檔座
    add(rbx(0.035, 0.05, 0.05, 0.01), dashTop, 0, 0.88, -0.36);
    // 左右兩側圓角出風口
    for (const sx of [-0.74, 0.74]) { add(rbx(0.12, 0.07, 0.04, 0.025), gloss, sx, 1.0, -0.56); }
    // 車門、A 柱、車頂
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.1, 0.62, 2.6), mid, s * 0.87, 0.72, 0.3);
      add(new THREE.BoxGeometry(0.02, 0.22, 0.7), new THREE.MeshLambertMaterial({ color: 0x5d6168 }), s * 0.815, 0.82, -0.05);   // 門板布面
      add(new THREE.BoxGeometry(0.06, 0.06, 2.4), dark, s * 0.86, 1.03, 0.3);
      // A 柱：從儀表台角落斜向後上方接到車頂
      const a0 = new THREE.Vector3(s * 0.84, 1.0, -1.0), a1 = new THREE.Vector3(s * 0.71, CB.pillarTop, -0.38);
      const dir = a1.clone().sub(a0), len = dir.length();
      const pil = add(new THREE.BoxGeometry(0.055, len, 0.07), dark, (a0.x + a1.x) / 2, (a0.y + a1.y) / 2, (a0.z + a1.z) / 2);
      pil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      add(new THREE.BoxGeometry(0.07, CB.roofY - 1.04, 0.09), dark, s * 0.84, (CB.roofY + 1.02) / 2, 0.62);        // B 柱
      // 左右後照鏡：鏡面朝向駕駛的眼睛，鏡中是即時畫面
      const mx = s * 1.04, my = 1.06, mz = -0.86, face = Math.atan2(-0.38 - mx, 0.18 - mz);
      const mir = add(new THREE.BoxGeometry(0.27, 0.18, 0.07), paintM, mx, my, mz); mir.rotation.y = face;
      const rt = new THREE.WebGLRenderTarget(256, 160);
      const g = new THREE.PlaneGeometry(0.25, 0.16), guv = g.attributes.uv;
      for (let i = 0; i < guv.count; i++) guv.setX(i, 1 - guv.getX(i));
      const glass = add(g, new THREE.MeshBasicMaterial({ map: rt.texture }), mx + Math.sin(face) * 0.037, my, mz + Math.cos(face) * 0.037); glass.rotation.y = face;
      const cam = new THREE.PerspectiveCamera(30, 256 / 160, 1.0, 240);
      (s < 0 ? (this.mirrorL = { rt, cam, x: mx, y: my, z: mz, out: -0.3 }) : (this.mirrorR = { rt, cam, x: mx, y: my, z: mz, out: 0.38 }));
    }
    add(new THREE.BoxGeometry(1.5, 0.05, CB.linerD), liner, 0, CB.roofY, CB.linerZ);   // 車頂內襯（淺灰）
    add(new THREE.BoxGeometry(1.5, 0.07, 0.12), dark, 0, CB.roofY - 0.015, -0.42);
    // 座椅
    const fabric = new THREE.MeshLambertMaterial({ color: 0x34373b }), pipe = new THREE.MeshLambertMaterial({ color: 0xb3262b });
    for (const sx of [-0.38, 0.38]) {
      add(new RoundedBoxGeometry(0.52, 0.15, 0.52, 2, 0.05), fabric, sx, 0.52, 0.36);
      add(new RoundedBoxGeometry(0.52, 0.76, 0.14, 2, 0.05), fabric, sx, 0.9, 0.66, 0.15);
      add(new RoundedBoxGeometry(0.3, 0.2, 0.12, 2, 0.04), fabric, sx, 1.38, 0.73, 0.15);   // 頭枕
      add(new THREE.BoxGeometry(0.53, 0.018, 0.02), pipe, sx, 0.6, 0.1);                 // 紅色滾邊
      for (const ex of [-0.255, 0.255]) add(new THREE.BoxGeometry(0.018, 0.74, 0.02), pipe, sx + ex, 0.9, 0.59, 0.15);
    }
    // 方向盤
    this.wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.019, 8, 28), dark); this.wheel.add(rim);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.035, 0.02), mid); this.wheel.add(spoke);
    const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.02), mid); spoke2.position.y = -0.09; this.wheel.add(spoke2);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 16), mid); hub.rotation.x = Math.PI / 2; this.wheel.add(hub);
    this.wheelPivot = new THREE.Group(); this.wheelPivot.position.set(-0.38, 0.87, -0.46); this.wheelPivot.scale.setScalar(0.9); this.wheelPivot.rotation.x = -0.36; this.wheelPivot.add(this.wheel);   // 方向盤小一點、低一點：畫面以擋風玻璃為主
    this.root.add(this.wheelPivot);
    // 儀表（畫在 canvas 上）
    this.dashCv = document.createElement('canvas'); this.dashCv.width = 384; this.dashCv.height = 128;
    this.dashTex = new THREE.CanvasTexture(this.dashCv); this.dashTex.colorSpace = THREE.SRGBColorSpace;
    // 中控螢幕
    this.navCv = document.createElement('canvas'); this.navCv.width = 320; this.navCv.height = 200;
    this.navTex = new THREE.CanvasTexture(this.navCv); this.navTex.colorSpace = THREE.SRGBColorSpace;
    add(new RoundedBoxGeometry(0.32, 0.19, 0.025, 2, 0.01), new THREE.MeshLambertMaterial({ color: 0x111215 }), 0, 1.17, -0.6, -0.12, -0.05);   // 浮動式中控螢幕
    add(new THREE.PlaneGeometry(0.3, 0.1875), new THREE.MeshBasicMaterial({ map: this.navTex }), 0.0, 1.171, -0.586, -0.12, -0.05);
    add(new THREE.BoxGeometry(0.06, 0.06, 0.04), new THREE.MeshLambertMaterial({ color: 0x15171a }), 0, 1.08, -0.62);
    // 車內後照鏡
    this.mirrorRT = new THREE.WebGLRenderTarget(384, 112);
    add(new THREE.BoxGeometry(0.27, 0.085, 0.02), dark, 0.02, CB.mirrorY, -0.47);
    const mg = new THREE.PlaneGeometry(0.25, 0.07);
    const uv = mg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    add(mg, new THREE.MeshBasicMaterial({ map: this.mirrorRT.texture }), 0.02, CB.mirrorY, -0.458, 0, -0.1);
    this.mirrorCam = new THREE.PerspectiveCamera(26, 384 / 112, 1.2, 260);
    this.lookYaw = 0; this.lookPitch = 0; this._idle = 0; this._t = 0;
    this.autoCenter = false; this.followPitch = false; this._center = false;
    this.root.position.y = dy; this.eye.y += dy; this.root.position.z = CB.z; this.eye.z += CB.z;
    this.eyeBase = this.eye.clone();
    for (const m of [this.mirrorL, this.mirrorR]) { m.y += dy; m.z += CB.z; }
    this.mirrorLift = dy;
  }

  look(dx, dy, dt, moving) {
    if (dx || dy) { this.lookYaw -= dx * 0.0026; this.lookPitch -= dy * 0.0022; this._idle = 0; this._center = false; }
    else this._idle += dt;
    this.lookYaw = Math.max(-2.3, Math.min(2.3, this.lookYaw)); this.lookPitch = Math.max(-0.55, Math.min(0.45, this.lookPitch));
    // 自動回正（預設關閉：玩家沒操作、畫面卻自己轉，是頭暈的常見原因；要回正就按 R 或「回正」鈕）
    const auto = this.autoCenter && moving && this._idle > 1.4;
    if (auto || this._center) {
      const k = Math.min(1, dt * 4); this.lookYaw -= this.lookYaw * k; this.lookPitch -= this.lookPitch * k;
      if (Math.abs(this.lookYaw) < 0.002 && Math.abs(this.lookPitch) < 0.002) { this.lookYaw = 0; this.lookPitch = 0; this._center = false; }
    }
  }
  /** 視線慢慢轉回正前方（玩家按 R 或「回正」時）。 */
  recenter() { this._center = true; }

  /** 讓世界攝影機對準駕駛的眼睛位置。 */
  applyTo(worldCam, car) {
    const c = Math.cos(car.psi), s = Math.sin(car.psi), e = this.eye;
    worldCam.position.set(car.x + e.x * c + e.z * s, car.y + e.y, car.z - e.x * s + e.z * c);
    const bp = this.basePitch || 0;
    // 鎖定地平線（預設）：鏡頭不跟著車身上下坡前後傾，跟賽車遊戲的「Lock to horizon」相同
    const chassis = this.followPitch ? car.pitch * Math.cos(this.lookYaw) : 0;
    worldCam.rotation.set(chassis + this.lookPitch + bp, car.psi + this.lookYaw, 0, 'YXZ');
    this.cam.position.copy(e); this.cam.rotation.set(this.lookPitch + bp, this.lookYaw, 0, 'YXZ');
    this.cam.fov = worldCam.fov; this.cam.aspect = worldCam.aspect; this.cam.updateProjectionMatrix();
    this.wheel.rotation.z = car.steer * 6.5;
    this.mirrorCam.position.set(car.x + 0.3 * s, car.y + 1.35 + this.mirrorLift, car.z + 0.3 * c);
    this.mirrorCam.rotation.set(-0.03, car.psi + Math.PI, 0, 'YXZ');
    for (const m of [this.mirrorL, this.mirrorR]) {
      // 鏡頭在後照鏡位置，看向車後方、稍微往外
      const lx = m.x, lz = m.z, dx = m.out, dz = 1;
      m.cam.position.set(car.x + lx * c + lz * s, car.y + m.y, car.z - lx * s + lz * c);
      m.cam.rotation.set(-0.04, car.psi + Math.atan2(-dx, -dz) + 0, 0, 'YXZ');
    }
  }

  drawDash(car, dt) {
    this._t -= dt; if (this._t > 0) return; this._t = 0.12;
    const g = this.dashCv.getContext('2d'), W = 384, H = 128, spec = this.spec;
    g.fillStyle = '#07090c'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#eef3f5'; g.font = '700 84px "Barlow Semi Condensed", "Noto Sans TC", sans-serif'; g.textAlign = 'right';
    g.fillText(String(Math.round(car.kmh)), 196, 96);
    g.fillStyle = '#8b96a1'; g.font = '500 20px "Barlow Semi Condensed", sans-serif'; g.textAlign = 'left'; g.fillText('km/h', 204, 96);
    g.fillStyle = car.gear === 'R' ? '#ff7a6b' : '#f5c518'; g.font = '700 34px "Barlow Semi Condensed", sans-serif'; g.fillText(car.gear, 206, 58);
    const frac = car.energy / spec.capacity, ev = spec.unit === 'kWh';
    g.fillStyle = '#20252b'; g.fillRect(268, 34, 100, 14);
    g.fillStyle = frac < 0.15 ? '#ff5d4f' : (ev ? '#43d08a' : '#f0a23a'); g.fillRect(268, 34, 100 * frac, 14);
    g.fillStyle = '#aab4bd'; g.font = '500 17px "Noto Sans TC", sans-serif'; g.fillText(ev ? '電量 ' + Math.round(frac * 100) + '%' : '油量 ' + Math.round(frac * 100) + '%', 268, 26);
    g.fillStyle = '#8b96a1'; g.font = '500 16px "Noto Sans TC", sans-serif'; g.fillText('可行駛 ' + Math.round(car.energy / spec.perKm) + ' km', 268, 72);
    g.fillText(car.airText || ('里程 ' + (car.odo / 1000).toFixed(1) + ' km'), 268, 96);   // 飛天跑車：顯示壓縮空氣
    this.dashTex.needsUpdate = true;
  }

  /** 中控螢幕：沒有導航，只顯示目的地的方位與直線距離。 */
  drawNav(info) {
    const g = this.navCv.getContext('2d'), W = 320, H = 200;
    g.fillStyle = '#0b1014'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0b6b4f'; g.fillRect(0, 0, W, 34);
    g.fillStyle = '#fff'; g.font = '700 19px "Noto Sans TC", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    // 標題列：目的地（左）＋車速（右）。儀表放低了，車速改看這裡
    let title = info.title || ''; g.font = '700 19px "Noto Sans TC", sans-serif';
    while (title.length > 1 && g.measureText(title).width > W - 118) title = title.slice(0, -1);
    g.fillText(title === (info.title || '') ? title : title + '…', 10, 18);
    if (info.kmh !== undefined) {
      g.textAlign = 'right'; g.font = '700 26px "Barlow Semi Condensed", sans-serif'; g.fillText(String(info.kmh), W - 44, 18);
      g.font = '500 13px "Noto Sans TC", sans-serif'; g.fillText('km/h', W - 8, 19); g.textAlign = 'left';
    }
    if (info.nav) {
      // 有導航：螢幕上是會跟著轉的地圖（藍線是路線），左上角是下一個轉彎（箭頭、距離、路名），右下角是剩餘路程
      if (info.map) info.map(g, 0, 34, W, H - 34);
      g.fillStyle = 'rgba(8, 12, 15, .86)'; g.fillRect(0, 34, 168, 82);
      g.save(); g.translate(6, 18); g.scale(0.55, 0.55);
      const t = info.turn, cx = 64, cy = 112;
      g.strokeStyle = '#4fb4ff'; g.fillStyle = '#4fb4ff'; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      if (!t || t.dist > 600) { g.moveTo(cx, cy + 40); g.lineTo(cx, cy - 26); g.stroke(); g.beginPath(); g.moveTo(cx - 22, cy - 18); g.lineTo(cx, cy - 46); g.lineTo(cx + 22, cy - 18); g.fill(); }
      else if (t.turn === 'uturn') { g.moveTo(cx + 18, cy + 40); g.lineTo(cx + 18, cy - 14); g.arc(cx, cy - 14, 18, 0, Math.PI, true); g.lineTo(cx - 18, cy + 8); g.stroke(); g.beginPath(); g.moveTo(cx - 38, cy + 4); g.lineTo(cx - 18, cy + 30); g.lineTo(cx + 2, cy + 4); g.fill(); }
      else { const s = t.turn === 'right' ? 1 : -1; g.moveTo(cx - s * 10, cy + 40); g.lineTo(cx - s * 10, cy - 8); g.lineTo(cx + s * 22, cy - 8); g.stroke(); g.beginPath(); g.moveTo(cx + s * 18, cy - 30); g.lineTo(cx + s * 46, cy - 8); g.lineTo(cx + s * 18, cy + 14); g.fill(); }
      g.restore();
      g.textAlign = 'left'; g.fillStyle = '#eef3f5'; g.font = '700 28px "Barlow Semi Condensed", sans-serif';
      g.fillText(t && t.dist <= 600 ? Math.max(10, Math.round(t.dist / 10) * 10) + ' m' : '直走', 74, 62);
      g.fillStyle = '#cfe6ff'; g.font = '700 15px "Noto Sans TC", sans-serif';
      const label = t && t.dist <= 600 ? (t.turn === 'right' ? '右轉' : t.turn === 'left' ? '左轉' : '迴轉') + (info.road ? ' ' + info.road : '') : '';
      g.fillText(label.length > 6 ? label.slice(0, 6) + '…' : label, 74, 94);
      const rest = `剩 ${info.rest || ''}`; g.font = '700 15px "Noto Sans TC", sans-serif'; const rw = g.measureText(rest).width + 14;
      g.fillStyle = 'rgba(8, 12, 15, .86)'; g.fillRect(W - rw, H - 26, rw, 26); g.fillStyle = '#eef3f5'; g.fillText(rest, W - rw + 7, H - 13);
      if (info.energy) { const ew = g.measureText(info.energy).width + 14; g.fillStyle = 'rgba(8, 12, 15, .86)'; g.fillRect(0, H - 26, ew, 26); g.fillStyle = '#aab4bd'; g.fillText(info.energy, 7, H - 13); }
      this.navTex.needsUpdate = true;
      return;
    }
    g.save(); g.translate(64, 116); g.rotate(info.bearing || 0);
    g.fillStyle = '#f5c518'; g.beginPath(); g.moveTo(0, -42); g.lineTo(26, 30); g.lineTo(0, 16); g.lineTo(-26, 30); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#eef3f5'; g.font = '700 40px "Barlow Semi Condensed", sans-serif'; g.fillText(info.dist || '', 126, 100);
    g.fillStyle = '#8b96a1'; g.font = '500 16px "Noto Sans TC", sans-serif'; g.fillText('直線距離', 126, 136);
    g.fillStyle = '#5f6b76'; g.font = '500 14px "Noto Sans TC", sans-serif'; g.fillText('自動導航：尚未安裝', 126, 170);
    if (info.energy) { g.fillStyle = '#aab4bd'; g.font = '700 14px "Noto Sans TC", sans-serif'; g.fillText(info.energy, 10, 186); }
    this.navTex.needsUpdate = true;
  }
}

export function carSpec(key) { return CARS[key] || CARS.gas; }
