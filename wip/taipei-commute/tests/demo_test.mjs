// 示範模式實測：每一段從選單開始，看能不能跑完（字幕出現「示範結束」），途中截圖。
// 用法：node tests/demo_test.mjs boost,hop,...  [hash]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const KEYS = (process.argv[2] || 'boost,hop,flip,wall,under,empty,drone,allfly,alldrone').split(',');
const HASH = process.argv[3] || '#lowq';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_TUNNEL|fonts|net::/.test(m.text())) errs.push(m.type() + ' ' + m.text()); });
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8768/index.html' + HASH);
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 });
console.log('demo buttons', await ev(() => [...document.querySelectorAll('#demoOpts button b')].map(b => b.textContent).join(' / ')));
await page.screenshot({ path: 'shots/demo_menu.png' });
for (const key of KEYS) {
  const t0 = Date.now(), caps = [];
  await ev((k) => { window.__tc.noRender = true; window.__tc.startDemo(k); }, key);
  let done = false, shots = 0, lastCap = '';
  for (let i = 0; i < 400 && !done; i++) {
    await wait(700);
    const s = await ev(() => ({ cap: document.getElementById('demoCap').textContent, st: window.__tc.G.state, mode: window.__tc.stunts && window.__tc.stunts.mode, fl: window.__tc.flight && window.__tc.flight.phase, kmh: window.__tc.car ? Math.round(window.__tc.car.kmh) : 0, spd: window.__tc.steps }));
    if (s.cap !== lastCap) { caps.push(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s.cap} [${s.mode}/${s.fl} ${s.kmh}km/h x${s.spd}]`); lastCap = s.cap;
      if (shots < 4 && !/載入/.test(s.cap)) { await ev(() => { window.__tc.noRender = false; }); await wait(1200); await page.screenshot({ path: `shots/demo_${key}_${shots++}.png` }); await ev(() => { window.__tc.noRender = true; }); } }
    done = /示範結束|示範中斷/.test(s.cap);
  }
  console.log(`== ${key}: ${done ? 'done' : 'NOT DONE'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const c of caps) console.log('   ', c);
  await ev(() => window.__tc.endDemo());
  await page.waitForFunction(() => window.__tc.G.state === 'menu', null, { timeout: 30000 });
}
console.log('mode after', await ev(() => window.__tc.G.mode), 'continue btn', await ev(() => document.getElementById('btnContinue').hidden));
console.log(errs.slice(0, 10).join('\n') || 'no page errors');
await browser.close();
