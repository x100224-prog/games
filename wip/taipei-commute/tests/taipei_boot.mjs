import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.setDefaultTimeout(120000);
await page.goto('http://localhost:8768/index.html');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 120000 });
console.log('taipei menu ok', errs.length ? errs : 'no page errors');
await browser.close();
