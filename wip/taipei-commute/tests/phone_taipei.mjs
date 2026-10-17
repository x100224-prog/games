// 手機版面：直向、橫向，飛天跑車開車中與無人機飛行中的按鈕、特技燃料、避撞面板有沒有互相蓋住。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
  page.setDefaultTimeout(240000);
  await page.goto('http://localhost:8768/index.html#lowq');
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
  await ev(() => { const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 2000 && d < 4000; });
    localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 3, econ: { money: 20000, owned: ['nav', 'roadster', 'drone'], carKey: 'roadster', stuntFuel: 0.8 } })); localStorage.setItem('taipei-commute-tips', '["nav","roadster","drone","ev"]'); });
  await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 180000 });
  await ev(() => { window.__tc.noRender = true; });
  await page.click('#btnContinue');
  await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);   // 觸控介面出現
  await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.tap('#btnAct');
  await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
  await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
  await wait(600); await page.tap('#btnAct');
  await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1200);
  await page.click('#seatGo'); await wait(1200);
  await ev(() => { window.__tc.noRender = false; }); await wait(3500);
  await page.screenshot({ path: `shots/ph_${name}_drive.png` });
  // 檢查按鈕互相重疊
  const overlap = await ev(() => {
    const ids = ['btnGas', 'btnBrake', 'btnAct', 'btnMore', 'btnMirL', 'btnMirR', 'btnCenter', 'btnBoost', 'btnJump', 'btnGrip', 'btnFlip', 'btnDrone', 'joy', 'stunt', 'speedo', 'mini', 'task', 'place', 'btnMusic', 'btnSfx', 'daa'];
    const R = ids.map(id => { const el = document.getElementById(id); if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { id, l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }).filter(Boolean);
    const out = []; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t); if (ox > 2 && oy > 2) out.push(`${a.id}×${b.id}`); }
    const off = R.filter(r => r.l < -1 || r.t < -1 || r.r > innerWidth + 1 || r.b > innerHeight + 1).map(r => r.id);
    return { overlap: out, offscreen: off };
  });
  console.log(name, 'drive', JSON.stringify(overlap), 'visible', await ev(() => [...document.querySelectorAll('#touch button')].filter(b => !b.hidden && b.offsetParent).map(b => b.textContent).join(' ')));
  await page.tap('#btnMore'); await wait(600); await page.screenshot({ path: `shots/ph_${name}_more.png` });
  console.log(name, 'more menu', await ev(() => !document.getElementById('moreMenu').hidden && document.getElementById('moreMenu').innerText.replace(/\n/g, ' | ')));
  await page.tap('#btnMore'); await wait(300);
  // 無人機飛行中
  await ev(() => { window.__tc.noRender = true; }); await page.tap('#btnDrone'); await wait(1500);
  await page.waitForFunction(() => window.__tc.flight.active && window.__tc.flight.phase === 'cruise', null, { timeout: 120000 }).catch(() => {});
  await ev(() => { window.__tc.noRender = false; }); await wait(3500);
  await page.screenshot({ path: `shots/ph_${name}_drone.png` });
  console.log(name, 'drone', JSON.stringify(await ev(() => { const el = document.getElementById('daa'), r = el.getBoundingClientRect(); return { daa: !el.hidden, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], btn: document.getElementById('btnDrone').textContent }; })));
  await ctx.close();
}
await browser.close();
