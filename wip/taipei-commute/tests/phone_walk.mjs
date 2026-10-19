// 手機走路：提示（toast、prompt）的位置會不會擋到人物；跑步。VP=portrait|land
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VP = process.env.VP || 'port', land = VP === 'land', desk = VP === 'desk', TAG = process.env.TAG || 'a';
const vp = desk ? { width: 1280, height: 720 } : land ? { width: 844, height: 390 } : { width: 390, height: 844 };
const ctx = await browser.newContext({ viewport: vp, hasTouch: !desk, isMobile: !desk, deviceScaleFactor: 1 });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 200000 });
await ev(() => { localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: [], carKey: 'gas' } })); });
await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { window.__tc.noRender = false; }); await wait(2500);
const box = (id) => ev((id) => { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); }, id);
// 人物在畫面上的範圍：把角色的包圍盒投影到螢幕
const who = () => ev(() => { const { camera, avatar } = window.__tc; const THREE = window.__tc.THREE; if (!avatar || !THREE) return null;
  const b = new THREE.Box3().setFromObject(avatar.group), c = document.querySelector('#app canvas').getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { const v = new THREE.Vector3(x, y, z).project(camera); const sx = c.left + (v.x + 1) / 2 * c.width, sy = c.top + (1 - v.y) / 2 * c.height; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
  return [x0, y0, x1 - x0, y1 - y0].map(Math.round); });
const over = (a, b) => !!(a && b) && a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const report = async (tag) => { const t = await box('toast'), p = await box('prompt'), w = await who(), tc = await box('tipCard');
  console.log(tag, JSON.stringify({ person: w, toast: t, prompt: p, tip: tc, toastOverPerson: over(t, w), promptOverPerson: over(p, w), toastText: await ev(() => document.getElementById('toast').textContent.slice(0, 40)), promptText: await ev(() => document.getElementById('prompt').innerText.slice(0, 30)) })); };
await report('room');
await page.screenshot({ path: `shots/pw_${TAG}_${VP}_0room.png` });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await (desk ? page.keyboard.press('KeyE') : page.tap('#btnAct'));
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(2500);
await report('walk');
await page.screenshot({ path: `shots/pw_${TAG}_${VP}_1walk.png` });
// 跑步：搖桿推到底 vs 推一半；有沒有「跑步」按鈕
const runBtn = await box('btnRun'), gasBtn = await box('btnGas');
console.log('gas button while walking:', JSON.stringify(gasBtn));
console.log('run button:', JSON.stringify(runBtn), await ev(() => { const b = document.getElementById('btnRun'); return b && b.textContent; }));
const speed = async (frac, tapRun) => ev(async ([frac, tapRun]) => { const { P, input } = window.__tc; window.__tc.noRender = true; if (tapRun) document.getElementById('btnRun').dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [], changedTouches: [] }));
  input.joyX = 0; input.joyY = -frac; const x0 = P.x, z0 = P.z, t0 = performance.now(); await new Promise(r => setTimeout(r, 1500)); input.joyY = 0; const v = Math.hypot(P.x - x0, P.z - z0) / ((performance.now() - t0) / 1000);
  if (tapRun) document.getElementById('btnRun').dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [], changedTouches: [] }));
  window.__tc.noRender = false; return +v.toFixed(2); }, [frac, tapRun]);
console.log('walk speed m/s: half', await speed(0.5, false), '| full', await speed(1, false), runBtn ? '| full + 跑步 ' + await speed(1, true) : '');
// 走到車子旁邊：prompt「上車」
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(2000);
await report('nearCar');
await page.screenshot({ path: `shots/pw_${TAG}_${VP}_2car.png` });
console.log(errs.slice(0, 5).join(' | ') || 'no page errors');
await browser.close();
