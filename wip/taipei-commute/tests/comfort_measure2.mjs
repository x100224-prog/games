// 第二部分：①開車時鏡頭俯仰變化的分布 ②走路 40 秒（沿巷子、一邊轉視角）第三人稱鏡頭忽遠忽近的次數
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const ev = (f, a) => page.evaluate(f, a);
page.setDefaultTimeout(180000);
await page.goto('http://localhost:8767/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 90000 });
await ev(() => { window.__tc.noRender = true; });
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 150000 });
await ev(() => { window.__rec = []; let lastT = performance.now(); const f = (now) => { const { tp, P, G } = window.__tc; window.__rec.push({ dt: (now - lastT) / 1000, d: tp.curDist, want: tp.dist, x: P.x, z: P.z, st: G.state }); lastT = now; requestAnimationFrame(f); }; requestAnimationFrame(f); });
// 走：沿著巷子跑，每 4 秒換方向（像玩家一樣轉視角）
for (let k = 0; k < 10; k++) {
  await ev((k) => { const { tp } = window.__tc; tp.yaw += (k % 2 ? -1 : 1) * 1.2; }, k);
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(4000);
}
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
const rec = await ev(() => window.__rec.filter(r => r.st === 'walk'));
let changes = 0, big = 0, minD = 9; for (let i = 1; i < rec.length; i++) { const dd = rec[i].d - rec[i - 1].d; if (Math.abs(dd) > 0.05) changes++; if (dd < -0.25) big++; minD = Math.min(minD, rec[i].d); }
const T = rec.reduce((a, r) => a + r.dt, 0);
let walked = 0; for (let i = 1; i < rec.length; i++) walked += Math.hypot(rec[i].x - rec[i - 1].x, rec[i].z - rec[i - 1].z);
console.log(`WALK ${T.toFixed(0)}s walked ${walked.toFixed(0)} m  cam distance changing in ${(100 * changes / rec.length).toFixed(0)}% of frames, sudden pull-ins ${big} (${(big / T * 60).toFixed(1)}/min), closest ${minD.toFixed(2)} m (normal ${rec[0].want})`);
await browser.close();
