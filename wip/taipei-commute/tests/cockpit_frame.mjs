// 駕駛座畫面截圖：node tests/cockpit_shot.mjs gas|roadster  '[{"name":"a","seat":{...},"wheel":{...}}]'
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const CAR = process.argv[2] || 'gas', VARS = JSON.parse(process.argv[3] || '[{"name":"now"}]');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [VW, VH] = (process.env.VP || '960x540').split('x').map(Number), TOUCH = !!process.env.TOUCH;
const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: TOUCH, isMobile: TOUCH })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const URL = 'http://localhost:8768/index.html#lowq';
await page.goto(URL); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
await ev((car) => { localStorage.clear(); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: car === 'gas' ? ['nav'] : car === 'ev' ? ['nav', 'ev'] : ['nav', 'roadster'], carKey: car } })); localStorage.setItem('taipei-commute-tips', '["nav","roadster","ev","drone"]'); }, CAR);
await page.goto('about:blank'); await page.goto(URL); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await page.keyboard.press('Enter'); await page.waitForFunction(() => !window.__tc.G.seatAdj, null, { timeout: 30000 });
// 移到一條直的大路上（看得到前面）
await ev(() => { const { world, car } = window.__tc; let best = null; world.forEdgesNear(car.x, car.z, 700, (e) => { if (best || e.cls > 3 || e.bridge || e.len < 160) return; const p = e.pts, L = Math.hypot(p[2] - p[0], p[3] - p[1]); if (L < 60) return; const ux = (p[2] - p[0]) / L, uz = (p[3] - p[1]) / L; best = { x: p[0] + ux * 15, z: p[1] + uz * 15, psi: Math.atan2(-ux, -uz) }; }); if (best) car.place(best.x, best.z, best.psi, world.groundAt(best.x, best.z)); });
await wait(4000);

const VPS = (process.env.VPS || '960x540,1280x720').split(',').map(s => s.split('x').map(Number));
await ev(() => { window.__tc.noRender = false; for (const id of ['help', 'tipCard']) document.getElementById(id).hidden = true; });
if (TOUCH) { await page.touchscreen.tap(40, 200); await wait(300); }
console.log(CAR, 'seat', JSON.stringify(await ev(() => window.__tc.setSeat({}))), 'wheel visible', await ev(() => window.__tc.cockpit.wheelPivot.visible));
for (const [w, h] of VPS) {
  await page.setViewportSize({ width: w, height: h }); await wait(2500);
  const tag = `${CAR}_${w}x${h}${TOUCH ? 't' : ''}`;
  await page.screenshot({ path: `shots/cf_${tag}.png` });
  const mini = await ev(() => { const m = document.getElementById('navMini'); return !m.hidden && JSON.stringify(m.getBoundingClientRect().toJSON(), ['left', 'top', 'width', 'height']); });
  // 量擋風玻璃：外面的世界全部塗成洋紅色、收起介面，數洋紅色占多少
  await ev(() => { const T = window.__tc, sc = T.scene, nav = (() => { let f = null; T.cockpit.scene.traverse(o => { if (!f && o.material && o.material.map === T.cockpit.navTex) f = o; }); return f; })();
    const m = nav.material.clone(); m.map = null; m.color.set(0xff00ff); m.fog = false;
    window.__keep = { bg: sc.background, fog: sc.fog }; sc.overrideMaterial = m; sc.background = m.color.clone(); sc.fog = null;
    for (const id of ['hud', 'touch', 'osm']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } });
  await wait(1200); await page.screenshot({ path: `shots/cfm_${tag}.png` });
  await ev(() => { const sc = window.__tc.scene; sc.overrideMaterial = null; sc.background = window.__keep.bg; sc.fog = window.__keep.fog;
    for (const id of ['hud', 'touch', 'osm']) { const e = document.getElementById(id); if (e) e.style.visibility = ''; } });
  console.log(tag, 'navMini', mini);
}
console.log(errs.join('\n') || 'no errors'); await browser.close();
