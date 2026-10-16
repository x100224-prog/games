import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ' ' + m.text()); });
const ev = (f, a) => page.evaluate(f, a); page.setDefaultTimeout(180000);
await page.goto('http://localhost:8766/index.html');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 60000 });
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/hq00_start.png' });
console.log('avatar', await ev(() => !!window.__tc.avatar));
const views = [[1, 0.35, -1.0], [-1, 0.35, 1.0], [0.2, 0.5, -1], [1, 0.2, 0.1]];
let i = 1;
for (const [ax, ay, az] of views) {
  await ev(([ax, ay, az]) => { const c = window.__tc.car; const s = Math.sin(c.psi), co = Math.cos(c.psi);
    // 車身座標 → 世界：車頭 -z
    const lx = ax * 6, lz = az * 6; const wx = c.x + lx * co + lz * s, wz = c.z - lx * s + lz * co;
    window.__tc.debugCam = { x: wx, y: c.y + 1 + ay * 6, z: wz, tx: c.x, ty: c.y + 0.9, tz: c.z }; }, [ax, ay, az]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/hq0${i++}.png` });
}
console.log(logs.slice(0, 10).join('\n'));
await browser.close();
