import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + ' ' + e.stack)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
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
const spots = { keelung_underpass: [121.5585, 25.0335, 'any'] };
for (const [name, [lon, lat, kind]] of Object.entries(spots)) {
  await ev(([lon, lat]) => { const { G } = window.__tc; const pj = G.meta.proj; G.car.place((lon - pj.lon0) * pj.mlon, -(lat - pj.lat0) * pj.mlat, 0, 30); }, [lon, lat]);
  await page.waitForFunction(() => { const { G } = window.__tc; return G.world.readyAround(G.car.x, G.car.z, 600); }, null, { timeout: 120000 });
  const info = await ev((kind) => {
    const { G } = window.__tc; let best = null;
    for (const e of G.world.edges.values()) { if (!e.tunnel || !e.cover) continue; const mc = Math.max(...e.cover); if (kind === 'mountain' && mc < 20) continue; if (kind !== 'mountain' && (mc > 15 || mc < 5 || e.cover[0] > 0.5)) continue; const d = Math.hypot(e.pts[0] - G.car.x, e.pts[1] - G.car.z); if (!best || d < best.d) best = { e, d }; }
    if (!best) return null; const e = best.e;
    // 從入口往前 25 m 開始
    const pt = {}; let s0 = 0; for (let k = 0; k < e.cover.length; k++) if (e.cover[k] < 2) s0 = e.cum[k]; else break; if (e.cover[0] > 2) return null;
    const s = Math.max(0, s0 - 25);
    const i = Math.min(e.pts.length / 2 - 2, Math.max(0, e.cum.findIndex(c => c > s) - 1));
    const dx = e.pts[i * 2 + 2] - e.pts[i * 2], dz = e.pts[i * 2 + 3] - e.pts[i * 2 + 1], L = Math.hypot(dx, dz);
    const off = e.oneway ? 0 : e.laneW * 0.5;
    G.car.place(e.pts[i * 2] - dz / L * off, e.pts[i * 2 + 1] + dx / L * off, Math.atan2(-dx, -dz), e.hs[i]);
    return { name: e.name, len: e.len, cover: Array.from(e.cover).map(v => v.toFixed(1)).join(' '), hs: Array.from(e.hs).map(v => v.toFixed(1)).join(' '), oneway: e.oneway };
  }, kind);
  console.log(name, JSON.stringify(info));
  if (!info) continue;
  await ev(() => { window.__tc.G.cam = 'cockpit'; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/t_${name}_0.png` });
  await ev(() => { const { G } = window.__tc; const ctl = { throttle: 0.6, brake: 0, steer: 0, handbrake: false }; for (let k = 0; k < 110; k++) G.car.update(1 / 30, ctl, []); G.car.v = 0; });
  await page.waitForTimeout(2500);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/t_${name}_1.png` });
  await ev(() => { const { G } = window.__tc; const ctl = { throttle: 0.8, brake: 0, steer: 0, handbrake: false }; for (let k = 0; k < 90; k++) G.car.update(1 / 30, ctl, []); G.car.v = 0; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/t_${name}_2.png` });
  await page.keyboard.up('KeyW');
  console.log(' car', JSON.stringify(await ev(() => { const c = window.__tc.G.car; return { y: c.y, v: c.v, edge: c.edge && c.edge.name, tun: c.edge && c.edge.tunnel, bumps: c.bumps }; })));
  await ev(() => { const c = window.__tc.G.car; window.__tc.G.cam = 'chase'; window.__tc.debugCam = { x: c.x + 60, y: c.y + 40, z: c.z + 45, tx: c.x, tz: c.z, ty: c.y }; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/t_${name}_over.png` });
  await ev(() => { window.__tc.debugCam = null; });
}
console.log(logs.slice(0, 15).join('\n'));
await browser.close();
