// 手機版面（路空總控）：開車中按「問總控」，總控卡片跟按鈕有沒有互相蓋住；直向、橫向各一次。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
  page.setDefaultTimeout(240000);
  await page.goto('http://localhost:8768/index.html#lowq');
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
  await ev(() => { const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
    localStorage.setItem('taipei-commute-unlock', '1'); localStorage.setItem('taipei-commute-mode', 'hybrid');
    localStorage.setItem('taipei-commute-tips', JSON.stringify(['nav', 'ev', 'roadster', 'drone', 'ctl']));
    localStorage.setItem('taipei-commute-v2-hybrid', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: ['roadster', 'drone'], carKey: 'roadster' } })); });
  await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 180000 });
  await ev(() => { window.__tc.noRender = true; });
  await page.click('#btnContinue');
  await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.tap('#btnAct');
  await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
  await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
  await wait(600); await page.tap('#btnAct');
  await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1200);
  await page.click('#seatGo'); await wait(1200);
  console.log(name, 'drone button:', await ev(() => { const b = document.getElementById('btnDrone'); return !b.hidden && b.offsetParent ? b.textContent : 'hidden'; }));
  await page.tap('#btnDrone'); await wait(500);
  await ev(() => { window.__tc.noRender = false; }); await wait(3000);
  await page.screenshot({ path: `shots/ph_hyb_${name}.png` });
  const r = await ev(() => {
    const ids = ['ctlCard', 'toast', 'daa', 'btnGas', 'btnBrake', 'btnAct', 'btnMore', 'btnBoost', 'btnJump', 'btnDrone', 'joy', 'stunt', 'speedo', 'task', 'place', 'btnMusic', 'btnSfx'];
    const R = ids.map(id => { const el = document.getElementById(id); if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; const b = el.getBoundingClientRect(); return b.width && b.height ? { id, l: b.left, t: b.top, r: b.right, b: b.bottom } : null; }).filter(Boolean);
    const card = R.find(x => x.id === 'ctlCard'), hit = [];
    if (card) for (const o of R) { if (o === card) continue; const ox = Math.min(card.r, o.r) - Math.max(card.l, o.l), oy = Math.min(card.b, o.b) - Math.max(card.t, o.t); if (ox > 2 && oy > 2) hit.push(o.id); }
    return { card: card ? { l: Math.round(card.l), t: Math.round(card.t), r: Math.round(card.r), b: Math.round(card.b) } : null, covers: hit, off: card ? (card.l < -1 || card.r > innerWidth + 1 || card.b > innerHeight + 1) : null, text: document.getElementById('ctlVerdict').textContent };
  });
  console.log(name, JSON.stringify(r));
  console.log(name, errs.slice(0, 4).join(' | ') || 'no page errors');
  await ctx.close();
}
await browser.close();
