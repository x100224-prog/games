import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + ' ' + e.stack)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
const ev = (f, a) => page.evaluate(f, a);
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu');
await ev(() => { const G = window.__tc.G; G.cfg.di = 6; G.cfg.home = G.meta.homes[6][3]; const h = G.cfg.home; G.cfg.work = G.meta.works.find(w => w.k === '學校' && Math.hypot(w.x - h.x, w.z - h.z) > 1800 && Math.hypot(w.x - h.x, w.z - h.z) < 4500); G.cfg.car = 'ev'; G.carPicked = true; document.getElementById('btnGo').disabled = false; document.getElementById('btnGo').click(); });
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 90000 });
await ev(() => { const { G } = window.__tc; G.state = 'drive'; G.phase = 'drive'; const w = G.cfg.work; G.car.place(w.x + 60, w.z + 60, 0); });
for (let k = 0; k < 6; k++) {
  await page.waitForTimeout(10000);
  console.log(JSON.stringify(await ev(() => {
    const { G } = window.__tc; const w = G.cfg.work, C = G.world.CELL; const miss = [];
    for (let cx = Math.floor((w.x - 260) / C); cx <= Math.floor((w.x + 260) / C); cx++) for (let cz = Math.floor((w.z - 260) / C); cz <= Math.floor((w.z + 260) / C); cz++) { const c = G.world.cells.get(cx + ',' + cz); miss.push(cx + ',' + cz + ':' + (c ? c.state + (c.bays ? '/b' : '/nob') : 'none')); }
    return { q: G.world.pending, pp: G.parking.pending.length, cells: G.world.cells.size, miss, tiles: [...G.world.tiles.entries()].map(([k, t]) => k + ':' + t.state).join(' '), fps: null };
  })));
}
console.log(logs.slice(0, 10).join('\n'));
await browser.close();
