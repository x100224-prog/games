import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack)); page.on('console', m => { if (m.type() === 'error') logs.push('console ' + m.text()); });
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8766/index.html' + (process.argv[2] || ''));
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title');
await page.click('#btnStart');
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => { const { G, world } = window.__tc; return { st: G.state, loaded: world.loadedCount, q: world.queue.length, fill: document.getElementById('loadFill').style.width }; });
  console.log(JSON.stringify(st)); if (st.st !== 'loading') break;
}
console.log(logs.slice(0, 5).join('\n')); await browser.close();
