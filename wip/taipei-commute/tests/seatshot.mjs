// 截圖：駕駛座調整畫面（展開舒適設定）、手機轉開視線後出現的「回正」鈕
import { chromium, devices } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const mode of (process.argv[2] ? [process.argv[2]] : ['desk', 'phone'])) {
  const ctx = mode === 'desk' ? await browser.newContext({ viewport: { width: 1280, height: 720 } }) : await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const ev = (f) => page.evaluate(f); page.setDefaultTimeout(300000);
  await page.goto('http://localhost:8767/index.html#lowq');
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title');
  if (mode === 'desk') await page.click('#btnStart'); else await page.tap('#btnStart');
  await page.waitForFunction(() => window.__tc.G.state === 'walk');
  if (mode === 'phone') { await page.tap('#view'); await page.waitForTimeout(500); }
  await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 1.8; P.z = car.z + Math.sin(car.psi) * 1.8; });
  await page.waitForTimeout(1200);
  if (mode === 'desk') await page.keyboard.press('KeyE'); else await page.tap('#btnAct');
  await page.waitForFunction(() => window.__tc.G.state === 'drive' && window.__tc.G.seatAdj);
  await ev(() => { document.getElementById('comfort').open = true; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/seat_${mode}.png` });
  if (mode === 'phone') {
    await page.tap('#seatGo'); await page.waitForTimeout(800);
    // 模擬手指拖曳轉視角
    await page.evaluate(() => { const v = document.getElementById('view'); const mk = (type, x) => new TouchEvent(type, { changedTouches: [new Touch({ identifier: 7, target: v, clientX: x, clientY: 150 })], bubbles: true, cancelable: true }); v.dispatchEvent(mk('touchstart', 600)); window.dispatchEvent(mk('touchmove', 560)); window.dispatchEvent(mk('touchend', 560)); });
    await page.waitForTimeout(1500);
    console.log('center button visible after looking away:', await ev(() => !document.getElementById('btnCenter').hidden));
    await page.screenshot({ path: `shots/center_phone.png` });
    console.log('before tap lookYaw', await ev(() => window.__tc.cockpitObj ? 0 : 0), await ev(() => JSON.stringify(window.__dbgLook && window.__dbgLook())));
    const fr0 = await ev(() => performance.now()); await page.tap('#btnCenter'); await page.waitForTimeout(9000);
    console.log('fps', await ev(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r((n / 3).toFixed(2)); }; requestAnimationFrame(f); })));
    console.log('after tapping 回正: button hidden =', await ev(() => document.getElementById('btnCenter').hidden), await ev(() => JSON.stringify(window.__dbgLook && window.__dbgLook())));
  }
  console.log(mode, errs.length ? errs.join(' | ') : 'no page errors');
  await ctx.close();
}
await browser.close();
