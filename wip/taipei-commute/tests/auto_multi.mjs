// 自動示範跑 N 次（只跑邏輯），統計：開了多遠、擦撞次數、卡住時間
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const N = +(process.argv[2] || 3);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (let run = 0; run < N; run++) {
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a);
  page.setDefaultTimeout(180000);
  await page.goto('http://localhost:8767/index.html#lowq');
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 90000 });
  await ev(() => { window.__tc.noRender = true; window.__trk = []; const f = () => { const c = window.__tc.car; if (c && window.__tc.G.state === 'drive' && !window.__tc.G.seatAdj) window.__trk.push([c.x, c.z, c.v, c.bumps, window.__tc.engine.gear, Math.round(window.__tc.engine.rpm)]); requestAnimationFrame(f); }; f(); });
  await page.click('#btnAuto');
  await page.waitForFunction(() => window.__trk.length > 0, null, { timeout: 120000 });
  await page.waitForTimeout(26000);
  const r = await ev(() => { const t = window.__trk; let dist = 0, slow = 0, maxv = 0; for (let i = 1; i < t.length; i++) { dist += Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]); maxv = Math.max(maxv, t[i][2]); } const gears = [...new Set(t.map(x => x[4]))];
    return { frames: t.length, dist: +dist.toFixed(0), bumps: t.length ? t[t.length - 1][3] - t[0][3] : 0, maxKmh: +(maxv * 3.6).toFixed(0), gears, maxRpm: Math.max(...t.map(x => x[5])) }; });
  console.log('run', run + 1, JSON.stringify(r), errs.length ? 'ERR ' + errs[0] : '');
  await page.close();
}
await browser.close();
