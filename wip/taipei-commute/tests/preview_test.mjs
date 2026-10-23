// 路線預覽：商店（要先有導航）、上車按 P、影子車照路線開到目的地附近、路口路名牌、結束回到車上、遊戲時間不走。
// 用法：node tests/preview_test.mjs [phone]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const PHONE = process.argv[2] === 'phone';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(400000);
const tag = PHONE ? 'phone' : 'pc';
await page.goto('http://localhost:8768/index.html' + (process.env.LOWQ ? '#lowq' : ''));
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl","preview"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 2200 && d < 3200; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 2000000, owned: [], carKey: 'gas' } })); });
await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
// 商店：沒導航不能買
const shopRow = () => ev(() => { const it = [...document.querySelectorAll('#shopList .item')].find(d => d.querySelector('b').textContent === '路線預覽'); return it && { price: it.querySelector('.price').textContent, btn: it.querySelector('button').textContent, disabled: it.querySelector('button').disabled }; });
await ev(() => window.__tc.openShop ? window.__tc.openShop() : null);
const before = await ev(() => { const { econ } = window.__tc; return econ.buy('preview'); });
console.log('buy without nav:', JSON.stringify(before));
await ev(() => { const { econ } = window.__tc; econ.buy('nav'); });
console.log('buy with nav:', JSON.stringify(await ev(() => window.__tc.econ.buy('preview'))), 'money', await ev(() => window.__tc.econ.money));
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400);
if (PHONE) await page.tap('#btnAct'); else await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600);
if (PHONE) await page.tap('#btnAct'); else await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1500);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(800);
await ev(() => { const t = document.getElementById('tipOk'); if (t && !document.getElementById('tipCard').hidden) t.click(); });
await page.waitForFunction(() => !!window.__tc.G.routePoly, null, { timeout: 60000 });
console.log('prompt:', await ev(() => document.getElementById('prompt').innerText));
const clock0 = await ev(() => window.__tc.G.clock), car0 = await ev(() => [window.__tc.car.x, window.__tc.car.z]);
if (PHONE) { await page.tap('#btnMore'); await wait(400); console.log('menu:', await ev(() => [...document.querySelectorAll('#moreMenu button')].filter(b => !b.hidden).map(b => b.textContent).join('|'))); await page.tap('#morePreview'); }
else await page.keyboard.press('KeyP');
await page.waitForFunction(() => window.__tc.G.state === 'preview', null, { timeout: 30000 });
console.log('preview started: total', await ev(() => Math.round(window.__tc.G.preview.total)), 'm, nodes', await ev(() => window.__tc.G.preview.nodes.length));
await ev(() => { document.querySelector('#pvCtl [data-sp="4"]').click(); });
// 跑：大部分不畫畫面，路名牌出現時拍幾張
const seen = [], marks = [], shots = []; let lastSign = '', lastMark = '', markShot = false, t0 = Date.now(), maxStall = 0, stall = 0, lastS = 0;
for (let k = 0; k < 4000; k++) {
  const r = await ev(() => { const T = window.__tc; T.manual = true; T.advance(1 / 30, 15); T.manual = false; T.noRender = true;   // 15 格遊戲邏輯，只畫最後一格
    const pv = T.G.preview, sg = document.getElementById('pvSign'), h = document.getElementById('pvHint');
    return { state: T.G.state, s: pv ? Math.round(pv.s) : -1, total: pv ? Math.round(pv.total) : -1, sign: sg.hidden ? '' : document.getElementById('pvArrow').textContent + ' ' + document.getElementById('pvName').textContent + (document.getElementById('pvEn').textContent ? ' / ' + document.getElementById('pvEn').textContent : ''), hint: h.hidden ? '' : h.textContent, mark: document.getElementById('pvMark').hidden ? '' : document.getElementById('pvMark').innerText.replace(/\n/g, ' '), road: document.getElementById('pvRoad').textContent, ghostSpeed: pv ? Math.round(pv.v * 3.6) : 0 }; });
  if (r.state !== 'preview') { console.log('preview ended, state', r.state); break; }
  if (process.env.QUICK && shots.length >= 1 && markShot) break;
  if (k % 25 === 0) console.log('progress', k, r.s, '/', r.total, 'm |', r.hint, '|', r.road, Math.round((Date.now() - t0) / 1000) + 's');
  if (r.s === lastS) stall++; else { maxStall = Math.max(maxStall, stall); stall = 0; } lastS = r.s;
  if (r.mark && r.mark !== lastMark) { marks.push(`${r.s} m  ${r.mark}`); lastMark = r.mark;
    if (!markShot && /前方 \d+ m/.test(r.mark)) { markShot = true; await ev(() => { window.__tc.noRender = false; }); await wait(2500); await page.screenshot({ path: `shots/preview_${tag}_mark.png` }); await ev(() => { window.__tc.noRender = true; }); } }
  if (r.sign && r.sign !== lastSign) { seen.push(`${r.s}/${r.total} m  [${r.sign}]  ${r.hint}  (${r.road}, ${r.ghostSpeed} km/h)`); lastSign = r.sign;
    if (shots.length < 2 && /前方 [4-9]\d m/.test(r.hint)) { await ev(() => { window.__tc.noRender = false; }); await wait(2500); const f = `shots/preview_${tag}_${shots.length}.png`; await page.screenshot({ path: f }); shots.push(f); await ev(() => { window.__tc.noRender = true; }); } }
}
if (process.env.QUICK) await ev(() => window.__tc.endPreview());
console.log('signs seen:\n  ' + seen.join('\n  '));
console.log('landmarks seen:\n  ' + marks.join('\n  '));
console.log('longest wait (loading):', maxStall, 'steps; real time', Math.round((Date.now() - t0) / 1000), 's');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 120000 });
await ev(() => { window.__tc.noRender = false; }); await wait(2000);
const after = await ev(() => { const T = window.__tc; return { state: T.G.state, clockSame: T.G.clock, car: [T.car.x, T.car.z], pvHidden: document.getElementById('pv').hidden, hud: !document.getElementById('hud').hidden, traffic: T.traffic.cars.length, factor: T.traffic.factor, toast: document.getElementById('toast').textContent }; });
console.log('after:', JSON.stringify({ ...after, clockSame: Math.abs(after.clockSame - clock0) < 0.5, carSame: Math.hypot(after.car[0] - car0[0], after.car[1] - car0[1]) < 0.1 }));
await page.screenshot({ path: `shots/preview_${tag}_back.png` });
console.log(errs.slice(0, 4).join(' | ') || 'no page errors');
await browser.close();
