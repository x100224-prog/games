// 導航省多少時間（離線估算）：同一組住家→公司，比較「最快路線（A*，有導航）」與「沒有導航的駕駛」。
// 沒有導航的駕駛模型：只知道目的地的方向與直線距離（中控螢幕的箭頭），每到一個路口，往前看 2 個路口，
// 選「開過去的時間 + 剩下的直線距離 ÷ 30 km/h」最小的路；不迴轉、盡量不走回頭路。
import fs from 'fs';
import { Nav } from '../web/js/nav.js';
const nav = new Nav(JSON.parse(fs.readFileSync('web/data/nav.json', 'utf8')));
const meta = JSON.parse(fs.readFileSync('web/data/meta.json', 'utf8'));
const VREF = 30 / 3.6;
function out(n) { const r = []; for (let p = nav.off[n]; p < nav.off[n + 1]; p++) { const k = nav.adjE[p], d = nav.adjD[p]; r.push({ k, to: d > 0 ? nav.eb[k] : nav.ea[k] }); } return r; }
function greedy(s, g, look = 2) {
  const gx = nav.nx[g], gz = nav.nz[g], H = (n) => Math.hypot(nav.nx[n] - gx, nav.nz[n] - gz) / VREF;
  const visits = new Map(); let n = s, prevK = -1, t = 0, steps = 0;
  const best = (n, depth, prevK) => {   // 往前看 depth 個路口的最小估計
    if (depth === 0 || n === g) return H(n);
    let b = Infinity; for (const o of out(n)) { if (o.k === prevK) continue; b = Math.min(b, nav.cost(o.k) + best(o.to, depth - 1, o.k)); }
    return b === Infinity ? H(n) + 600 : b;
  };
  while (steps++ < 4000) {
    if (Math.hypot(nav.nx[n] - gx, nav.nz[n] - gz) < 120) return { t, steps };
    let opts = out(n).filter(o => o.k !== prevK); if (!opts.length) opts = out(n);
    if (!opts.length) return null;
    let pick = null, pv = Infinity;
    for (const o of opts) { const v = nav.cost(o.k) + best(o.to, look - 1, o.k) + (visits.get(o.to) || 0) * 400; if (v < pv) { pv = v; pick = o; } }
    visits.set(n, (visits.get(n) || 0) + 1);
    t += nav.cost(pick.k); prevK = pick.k; n = pick.to;
  }
  return null;
}
let seed = 777; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const rows = [];
for (let k = 0; rows.length < 300 && k < 5000; k++) {
  const di = k % meta.districts.length, hs = meta.homes[di]; if (!hs || !hs.length) continue;
  const h = hs[Math.floor(rnd() * hs.length)];
  const ws = meta.works.filter(w => { const d = Math.hypot(w.x - h.x, w.z - h.z); return d >= 1800 && d <= 4800; }); if (!ws.length) continue;
  const w = ws[Math.floor(rnd() * ws.length)];
  const s = nav.nearestNode(h.x, h.z, 400), g = nav.nearestNode(w.x, w.z, 600); if (s < 0 || g < 0) continue;
  const opt = nav.route({ x: nav.nx[s], z: nav.nz[s] }, { x: nav.nx[g], z: nav.nz[g] }); if (!opt) continue;
  const gr = greedy(s, g, 2), gr3 = greedy(s, g, 3);
  if (!gr || !gr3) { rows.push({ fail: true }); continue; }
  rows.push({ opt: opt.time, g2: gr.t, g3: gr3.t, straight: Math.hypot(w.x - h.x, w.z - h.z) });
}
const ok = rows.filter(r => !r.fail), fail = rows.length - ok.length;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const gm = (sec) => sec / 60 * 6;   // 現實秒數 → 遊戲分鐘（遊戲時間跑 6 倍快）
const d2 = ok.map(r => r.g2 - r.opt), d3 = ok.map(r => r.g3 - r.opt);
console.log(JSON.stringify({ pairs: ok.length, lost: fail, optGameMin: +gm(mean(ok.map(r => r.opt))).toFixed(1),
  savedGameMin_look2: { mean: +gm(mean(d2)).toFixed(1), median: +gm(med(d2)).toFixed(1) },
  savedGameMin_look3: { mean: +gm(mean(d3)).toFixed(1), median: +gm(med(d3)).toFixed(1) } }, null, 1));
