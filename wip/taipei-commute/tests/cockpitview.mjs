import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8766/index.html#lowqm');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title');
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk');
console.log('car dist from start', await page.evaluate(() => { const { car, M } = window.__tc; return Math.hypot(car.x - M.start.x, car.z - M.start.z).toFixed(1); }));
await page.waitForTimeout(2000);
await page.screenshot({ path: 'shots/v00_start.png' });
await page.evaluate(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await page.waitForTimeout(1500);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive');
await page.waitForTimeout(4000);
await page.screenshot({ path: 'shots/v01_seat.png' });
await page.click('#seatGo');
await page.waitForTimeout(4000);
await page.screenshot({ path: 'shots/v02_drive.png' });


console.log(logs.join('\n')); await browser.close();
