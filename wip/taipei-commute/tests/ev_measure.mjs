// 電動車省多少時間：停車走路的距離。公司附近（450 m 內）最近的空「路邊車格」（油車只能停這種，遊戲保證 260 m 內至少 3 個空格）
// vs 最近的空「電動車格」（電動車可以停，沒有就一樣停路邊）。走路距離 = 直線 × 1.25，速度 3.3 m/s（走路 1.9、跑步 4.8 的中間）。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const N = +(process.argv[2] || 20);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const ev = (f, a) => page.evaluate(f, a);
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true).catch(() => false);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 180000 });
await ev(() => { window.__tc.noRender = true; window.__tc.steps = 3; });
const works = await ev((n) => { const m = window.__tc.meta; let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; const out = []; for (let k = 0; k < n; k++) out.push(m.works[Math.floor(rnd() * m.works.length)]); return out; }, N);
const rows = [];
for (let day = 1; day <= 2; day++) for (const w of works) {
  await ev((w) => { const { G } = window.__tc; Object.assign(G.menuTarget, { x: w.x, z: w.z, r: 200, h: 120 }); G.menuCenter.x = w.x; G.menuCenter.z = w.z; }, w);
  const ok = await until((w) => window.__tc.world.readyAround(w.x, w.z, 470) && window.__tc.parking.readyAround(w.x, w.z, 460), w, 60000);
  if (!ok) { console.log('skip (not ready)', w.n); continue; }
  const r = await ev(([w, day]) => {
    const { parking } = window.__tc; parking.setDay(day); parking.rushNear(w.x, w.z, 110); parking.ensureFreeNear(w.x, w.z, 3, 110);
    let road = Infinity, evb = Infinity, nev = 0;
    parking.forBaysNear(w.x, w.z, 450, (b, d2) => { const d = Math.sqrt(d2); if (b.occupied || b.reserved) return; if (b.type === 'road') road = Math.min(road, d); if (b.type === 'ev') { evb = Math.min(evb, d); nev++; } });
    return { n: w.n, road: Math.round(road), ev: isFinite(evb) ? Math.round(evb) : null, freeEv: nev };
  }, [w, day]);
  rows.push(r); console.log(JSON.stringify(r));
}
const walk = (d) => d * 1.25 / 3.3 / 10;   // 遊戲分鐘
const sav = rows.filter(r => isFinite(r.road)).map(r => r.ev === null ? 0 : Math.max(0, walk(r.road) - walk(r.ev)));
const evNear = rows.filter(r => r.ev !== null).length;
const sum = { samples: rows.length, withEvBay: evNear, roadMeanM: Math.round(rows.reduce((s, r) => s + (isFinite(r.road) ? r.road : 0), 0) / rows.length), evMeanM: Math.round(rows.filter(r => r.ev !== null).reduce((s, r) => s + r.ev, 0) / Math.max(1, evNear)), savedGameMinMean: +(sav.reduce((s, x) => s + x, 0) / sav.length).toFixed(2) };
console.log('SUMMARY', JSON.stringify(sum));
fs.writeFileSync('build/ev_measure.json', JSON.stringify({ rows, sum }, null, 1));
await browser.close();
