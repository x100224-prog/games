// 手機：一開始就是觸控介面、沒有電腦按鍵的說明；「橫向玩」把畫面轉成橫的（鎖不了方向就轉 90 度），搖桿方向要跟著轉。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const vp = { width: 390, height: 844 };
const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 200000 });
await ev(() => { const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: ['nav', 'roadster'], carKey: 'roadster' } })); });
await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
const keyWords = /(?:^|[^A-Za-z])(?:Shift|Enter|Esc|WASD|[FGTUCMVRZXE])(?:[：:\s）)]|$)|Z／X|<kbd>/;
console.log('menu: body classes', await ev(() => document.body.className), '| land button', await ev(() => { const b = document.getElementById('btnLand'); return !b.hidden && getComputedStyle(b).display !== 'none' && b.textContent; }));
console.log('demo list keys?', await ev((re) => [...document.querySelectorAll('#demoOpts .sub')].map(e => e.textContent).filter(t => new RegExp(re).test(t)), keyWords.source));
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await wait(800);
console.log('room: touch controls shown', await ev(() => !document.getElementById('touch').hidden), '| act', await ev(() => document.getElementById('btnAct').textContent), '| help visible', await ev(() => getComputedStyle(document.getElementById('help')).display !== 'none' && !document.getElementById('help').hidden));
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await wait(600); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1200);
// 手機開車是車外視角：不會跳出座椅調整
console.log('phone drive view:', await ev(() => ({ cam: window.__tc.G.cam, seatPanel: !document.getElementById('seat').hidden })));
console.log('prompt:', await ev(() => document.getElementById('prompt').innerText));
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(1500);
const texts = await ev(() => ({ toast: document.getElementById('toast').textContent, prompt: document.getElementById('prompt').innerText, tip: !document.getElementById('tipCard').hidden && document.getElementById('tipCard').innerText.replace(/\n/g, ' | ') }));
console.log('drive texts:', JSON.stringify(texts));
const all = Object.values(texts).join(' ');
console.log('keyboard words left:', (all.match(new RegExp(keyWords.source, 'g')) || []).join(' ') || 'none');
const tips = [];
for (let i = 0; i < 6; i++) { const t = await ev(() => !document.getElementById('tipCard').hidden && document.getElementById('tipCard').innerText.replace(/\n/g, ' | ')); if (!t) break; tips.push(t); await ev(() => document.getElementById('tipOk').click()); await wait(300); }
console.log('tip cards on phone:', JSON.stringify(tips));
await ev(() => { window.__tc.noRender = false; }); await wait(2500); await page.screenshot({ path: 'shots/rot_0_portrait.png' });
// 橫向玩（在「⋯」裡）
await page.tap('#btnMore'); await wait(400);
console.log('more menu:', await ev(() => document.getElementById('moreMenu').innerText.replace(/\n/g, ' | ')));
await page.tap('#moreLand'); await wait(2000);
const st = await ev(() => { const a = document.getElementById('app').getBoundingClientRect(), c = document.querySelector('#app canvas'); return { rot90: document.documentElement.classList.contains('rot90'), fullscreen: !!document.fullscreenElement, orient: screen.orientation && screen.orientation.type, appBox: [a.left, a.top, a.width, a.height].map(Math.round), canvas: [c.clientWidth, c.clientHeight], aspect: +window.__tc.camera.aspect.toFixed(2), btn: document.getElementById('moreLand').textContent, toast: document.getElementById('toast').textContent }; });
console.log('after 橫向玩:', JSON.stringify(st));
await wait(2000); await page.screenshot({ path: 'shots/rot_1_land.png' });
// 搖桿：手指往螢幕下方拖（轉 90 度後＝遊戲的右邊）→ joyX 應該是正的（往右轉）
const joy = await ev(() => {
  const j = document.getElementById('joy'), r = j.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const mk = (x, y) => new Touch({ identifier: 7, target: j, clientX: x, clientY: y });
  j.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(cx, cy)], changedTouches: [mk(cx, cy)], bubbles: true, cancelable: true }));
  window.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(cx, cy + 40)], changedTouches: [mk(cx, cy + 40)], bubbles: true }));
  const a = { joyX: +window.__tc.input.joyX.toFixed(2), joyY: +window.__tc.input.joyY.toFixed(2) };
  window.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(cx + 40, cy)], changedTouches: [mk(cx + 40, cy)], bubbles: true }));
  const b = { joyX: +window.__tc.input.joyX.toFixed(2), joyY: +window.__tc.input.joyY.toFixed(2) };
  window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(cx + 40, cy)], bubbles: true }));
  return { dragScreenDown: a, dragScreenRight: b };
});
console.log('joystick in rotated view (screen down should be game right = joyX +1; screen right should be game up = joyY -1):', JSON.stringify(joy));
// 回到直向
console.log('more button hit test:', JSON.stringify(await ev(() => { const b = document.getElementById('btnMore'), r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y); return { rect: [r.left, r.top, r.width, r.height].map(Math.round), hit: e && (e.id || e.className || e.tagName) }; })));
await page.tap('#btnMore'); await wait(500);
console.log('menu after tap:', JSON.stringify(await ev(() => { const m = document.getElementById('moreMenu'), l = document.getElementById('moreLand'), r = m.getBoundingClientRect(), q = l.getBoundingClientRect(); return { hidden: m.hidden, menu: [r.left, r.top, r.width, r.height].map(Math.round), land: [q.left, q.top, q.width, q.height].map(Math.round), landHidden: l.hidden, scroll: [m.scrollTop, m.scrollHeight, m.clientHeight] }; })));
await page.screenshot({ path: 'shots/rot_2_land_more.png' });
 await wait(300); await page.tap('#moreLand'); await wait(1500);
console.log('back to portrait:', JSON.stringify(await ev(() => ({ rot90: document.documentElement.classList.contains('rot90'), aspect: +window.__tc.camera.aspect.toFixed(2), btn: document.getElementById('moreLand').textContent }))));
console.log(errs.slice(0, 5).join(' | ') || 'no page errors');
await browser.close();
