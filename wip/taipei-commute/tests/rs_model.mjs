import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
page.on('pageerror', e => console.log('ERR', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto('http://localhost:8768/_test_rs.html');
await page.waitForFunction(() => window.done, null, { timeout: 60000 });
await page.screenshot({ path: 'shots/rs_model.png' });
await browser.close();
