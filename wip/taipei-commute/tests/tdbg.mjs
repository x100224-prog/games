import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const ev = (f, a) => page.evaluate(f, a);
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu');
await ev(() => { const G = window.__tc.G; G.cfg.di = 6; G.cfg.home = G.meta.homes[6][0]; const h = G.cfg.home; G.cfg.work = G.meta.works.find(w => Math.hypot(w.x - h.x, w.z - h.z) > 2000); G.cfg.car = 'gas'; G.carPicked = true; document.getElementById('btnGo').disabled = false; document.getElementById('btnGo').click(); });
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 120000 });
await ev(() => { const { G } = window.__tc; G.state = 'drive'; G.phase = 'drive'; const pj = G.meta.proj; G.car.place((121.5585 - pj.lon0) * pj.mlon, -(25.0335 - pj.lat0) * pj.mlat, 0, 30); });
await page.waitForFunction(() => { const { G } = window.__tc; return G.world.readyAround(G.car.x, G.car.z, 500); }, null, { timeout: 120000 });
const r = await ev(() => {
  const { G } = window.__tc; let e = null;
  for (const x of G.world.edges.values()) if (x.name === '基隆路車行地下道' && x.cover && x.cover[0] < 0.5 && Math.max(...x.cover) > 5) { e = x; break; }
  const dx = e.pts[2] - e.pts[0], dz = e.pts[3] - e.pts[1];
  G.car.place(e.pts[0] + dx * 0.05, e.pts[1] + dz * 0.05, Math.atan2(-dx, -dz), e.hs[0]);
  const out = []; const ctl = { throttle: 1, brake: 0, steer: 0, handbrake: false };
  const surf = {};
  for (let k = 0; k < 240; k++) {
    G.car.update(1 / 30, ctl, []);
    if (k % 20 === 0) { const s = G.world.surfaceAt(G.car.x, G.car.z, G.car.y, surf); out.push([k, G.car.x.toFixed(1), G.car.z.toFixed(1), G.car.y.toFixed(2), G.car.v.toFixed(1), G.car.edge && G.car.edge.name, s && s.edge.name, G.car.bumps].join(' ')); }
  }
  // 附近有哪些路段重疊
  const near = []; G.world.forEdgesNear(e.pts[0], e.pts[1], 60, x => { if (Math.hypot(x.pts[0] - e.pts[0], x.pts[1] - e.pts[1]) < 120) near.push(x.name + ' w' + x.width + ' h' + x.hs[0].toFixed(1) + (x.tunnel ? ' T' : '')); });
  return out.concat(near.slice(0, 15));
});
console.log(r.join('\n'));
await browser.close();
