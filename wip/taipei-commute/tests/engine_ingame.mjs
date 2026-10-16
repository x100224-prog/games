// 遊戲內實測引擎聲：真的按「出發」、上車、踩油門，邊開邊讀引擎轉速、檔位與實際輸出音量
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8767/index.html#lowq';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
const ev = (f, a) => page.evaluate(f, a);
page.setDefaultTimeout(180000);
await page.goto(url);
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 90000 });
console.log('button before start:', await ev(() => document.getElementById('btnSfx')?.textContent));
await page.click('#btnStart');
await ev(() => { window.__tc.noRender = true; });
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 150000 });
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await page.waitForTimeout(1200);
const s0 = await ev(() => ({ ctx: window.__tc.engine.ctx && window.__tc.engine.ctx.state, running: window.__tc.engine.running, lvl: window.__tc.engine.level() }));
console.log('walking (engine off):', JSON.stringify(s0));
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 });
const samp = async (tag) => console.log(tag, JSON.stringify(await ev(() => { const e = window.__tc.engine, c = window.__tc.car; return { kmh: +c.kmh.toFixed(1), rpm: Math.round(e.rpm), gear: e.gear, phase: e.phase, level_dB: +(20 * Math.log10(e.level() + 1e-9)).toFixed(1) }; })));
for (let i = 0; i < 5; i++) { await page.waitForTimeout(500); await samp('start ' + i); }
await page.keyboard.press('Enter');           // 關掉座椅調整，開始開車
await page.waitForTimeout(500);
await page.keyboard.down('KeyW');
for (let i = 0; i < 12; i++) { await page.waitForTimeout(600); await samp('gas  ' + i); }
await page.keyboard.up('KeyW');
for (let i = 0; i < 4; i++) { await page.waitForTimeout(600); await samp('coast' + i); }
await page.keyboard.down('KeyS');
await page.waitForFunction(() => window.__tc.car.v < 0.3, null, { timeout: 60000 });
await page.keyboard.up('KeyS');
await samp('stopped');
const fps = await ev(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
console.log('fps (no render):', fps);
await page.keyboard.press('KeyB'); await page.waitForTimeout(400);
console.log('after B:', await ev(() => document.getElementById('btnSfx').textContent), JSON.stringify(await ev(() => +(20 * Math.log10(window.__tc.engine.level() + 1e-9)).toFixed(1))));
await page.keyboard.press('KeyB'); await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 });
for (let i = 0; i < 3; i++) { await page.waitForTimeout(700); await samp('exited ' + i); }
await ev(() => { window.__tc.noRender = false; }); await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/eng_ingame.png' });
console.log(logs.slice(0, 10).join('\n') || 'no page errors');
await browser.close();
