import { computeBands, DAA } from '../web/js/drone.js';
const own = { x: 0, y: 150, z: 0, vx: 0, vy: 0, vz: 50, track: 0 };
const deg = (r) => Math.round(r * 180 / Math.PI);
for (const [name, intr] of [
  ['head-on 1400 m', { x: 0, y: 150, z: 1400, vx: 0, vy: 0, vz: -50 }],
  ['head-on 3000 m', { x: 0, y: 150, z: 3000, vx: 0, vy: 0, vz: -50 }],
  ['crossing from right', { x: 900, y: 150, z: 900, vx: -50, vy: 0, vz: 0 }],
  ['same heading slower ahead', { x: 0, y: 150, z: 300, vx: 0, vy: 0, vz: 20 }],
  ['other layer (20 m above)', { x: 0, y: 170, z: 1400, vx: 0, vy: 0, vz: -50 }],
]) {
  const r = computeBands(own, 50, 0, [intr], null);
  const red = r.bands.filter(b => b.t !== Infinity).map(b => deg(b.h));
  // 選到的航向飛下去，最近距離
  let min = 1e9; const vx = Math.sin(r.pick) * 50, vz = Math.cos(r.pick) * 50;
  for (let t = 0; t < 80; t += 0.1) { const dx = intr.x + intr.vx * t - vx * t, dz = intr.z + intr.vz * t - vz * t; min = Math.min(min, Math.hypot(dx, dz)); }
  console.log(name.padEnd(28), 'alert', r.alert, 'pick', deg(r.pick) + '°', 'red bands', red.length ? `${red.length} (${Math.min(...red.map(d => d > 180 ? d - 360 : d))}..${Math.max(...red.map(d => d > 180 ? d - 360 : d))})` : 0, 'miss if flown', Math.round(min), 'm');
}
// 超高大樓：正前方 800 m
const st = [{ x: 0, z: 800, r: 40, top: 508 }];
const r2 = computeBands(own, 50, 0, [], st);
console.log('skyscraper ahead 800 m        pick', deg(r2.pick) + '°', 'red', r2.bands.filter(b => b.t !== Infinity).length);
