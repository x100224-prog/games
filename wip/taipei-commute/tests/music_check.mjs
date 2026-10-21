// 配樂檔案：看示範時播「鉻色脈衝」、回選單停掉。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await page.evaluate(() => window.__tc.startDemo('boost'));
await page.waitForFunction(() => { const m = window.__tc.music; return m && m.fileSrc && m.fileSrc.style === 'cyber'; }, null, { timeout: 200000 }).catch(() => {});
console.log('demo music:', JSON.stringify(await page.evaluate(() => { const m = window.__tc.music; return { style: m.style, file: m.fileSrc && m.fileSrc.style, loop: m.fileSrc && [+m.fileSrc.src.loopStart.toFixed(2), +m.fileSrc.src.loopEnd.toFixed(2)] }; })));
await page.evaluate(() => window.__tc.endDemo && window.__tc.endDemo()); await page.waitForTimeout(2000);
console.log('after demo:', JSON.stringify(await page.evaluate(() => ({ state: window.__tc.G.state, style: window.__tc.music.style, file: window.__tc.music.fileSrc && window.__tc.music.fileSrc.style }))));
console.log(errs.slice(0, 4).join(' | ') || 'no page errors');
await browser.close();
