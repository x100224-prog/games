import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const ev = (f, a) => page.evaluate(f, a);
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu');
await ev(() => { const G = window.__tc.G; G.cfg.di = 6; G.cfg.home = G.meta.homes[6][0]; const h = G.cfg.home; G.cfg.work = G.meta.works.find(w => Math.hypot(w.x - h.x, w.z - h.z) > 2000); G.cfg.car = 'gas'; G.carPicked = true; document.getElementById('btnGo').disabled = false; document.getElementById('btnGo').click(); });
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 120000 });
await ev(() => { const P = window.__tc.P; P.x = 1.2; P.z = -2.2; }); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk');
await ev(() => { const { P, G } = window.__tc; P.x = G.car.x - Math.cos(G.car.psi) * 1.8; P.z = G.car.z + Math.sin(G.car.psi) * 1.8; });
await page.waitForTimeout(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive');
await ev(() => { const { G } = window.__tc; const pj = G.meta.proj; G.car.place((121.5585 - pj.lon0) * pj.mlon, -(25.0335 - pj.lat0) * pj.mlat, 0, 30); });
await page.waitForFunction(() => { const { G } = window.__tc; return G.world.readyAround(G.car.x, G.car.z, 500); }, null, { timeout: 120000 });
for (const k of [3, 7]) {
  await ev((k) => { const { G } = window.__tc; let e = null; for (const x of G.world.edges.values()) if (x.name === '基隆路車行地下道' && x.cover && x.cover[0] < 0.5 && Math.max(...x.cover) > 5) { e = x; break; }
    const dx = e.pts[k * 2 + 2] - e.pts[k * 2], dz = e.pts[k * 2 + 3] - e.pts[k * 2 + 1]; G.car.place(e.pts[k * 2], e.pts[k * 2 + 1], Math.atan2(-dx, -dz), e.hs[k]); G.car.edge = e; G.car._segI = k; G.cam = 'cockpit'; }, k);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `shots/t2_${k}.png` });
}
await browser.close();
