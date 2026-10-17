// 試看版用：照遊戲裡同一套「路空總控」估算（web/js/control.js），40 組住家→公司在不同時間出門，總控會建議飛的有幾組。
// 這是估算（沒有真的開完），輸出到 build/hybrid_model.json。
import fs from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
const { Nav } = await import(ROOT + 'web/js/nav.js');
const { Control } = await import(ROOT + 'web/js/control.js');
const nav = new Nav(JSON.parse(fs.readFileSync(ROOT + 'web/data/nav.json')));
const meta = JSON.parse(fs.readFileSync(ROOT + 'web/data/meta.json'));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pairs = [];
while (pairs.length < 40) {   // 跟遊戲一樣：公司離家直線 1.8～4.8 km
  const hs = meta.homes[Math.floor(rnd() * meta.homes.length)], h = hs[Math.floor(rnd() * hs.length)];
  const ws = meta.works.filter(w => { const d = Math.hypot(w.x - h.x, w.z - h.z); return d > 1800 && d < 4800; }); if (!ws.length) continue;
  const w = ws[Math.floor(rnd() * ws.length)], rt = nav.route({ x: h.x, z: h.z }, { x: w.x, z: w.z }); if (rt) pairs.push({ h, w, rt });
}
const C = new Control(nav); for (const p of pairs) C.area(p.w.x, p.w.z);
const gmps = 0.1, checks = [7 * 60 + 40, 7 * 60 + 50, 8 * 60, 8 * 60 + 15, 8 * 60 + 30, 8 * 60 + 45], rows = [];
let min = 7 * 60 + 30; C.startLeg('am', min);
for (let s = 0; s <= 900; s++) {
  if (checks.some(c => Math.abs(c - min) < 0.05)) {
    let fly = 0, hold = 0; const save = [];
    for (const pr of pairs) { const e = C.evaluate({ x: pr.h.x, z: pr.h.z, g: 0, dest: pr.w, route: pr.rt, traffic: null, sky: null, min, gmps }); if (e.fly) fly++; if (e.holdGround) hold++; save.push((e.road.sec - e.air.sec) * gmps); }
    save.sort((a, b) => a - b);
    rows.push({ t: `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`, fly, hold, p: +C.p.toFixed(2), medSave: +save[save.length >> 1].toFixed(1) });
  }
  C.tick(1, min); min += gmps;
}
fs.writeFileSync(ROOT + 'build/hybrid_model.json', JSON.stringify({ pairs: pairs.length, rows }, null, 1));
console.log(JSON.stringify(rows));
