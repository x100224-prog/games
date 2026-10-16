// 回歸檢查：把之前的要求一項一項在「舊版（第一次上架）」與「新版」上跑，比對結果
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const [port, tag] = [process.argv[2], process.argv[3]];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const shot = async (path) => { await ev(() => { window.__tc.noRender = false; }); await page.waitForTimeout(2500); await page.screenshot({ path }); await ev(() => { window.__tc.noRender = true; }); };
page.setDefaultTimeout(240000);
await page.goto(`http://localhost:${port}/index.html#lowq`);
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 120000 });
await ev(() => { window.__tc.noRender = true; });
const R = {};
R.路線選項 = await ev(() => [...document.querySelectorAll('#routePick label span')].map(s => s.firstChild.textContent));
R.標題按鈕 = await ev(() => ['btnStart', 'btnAuto', 'btnMusic'].filter(id => document.getElementById(id)).length + ' 個（出發、自動示範、音樂）');
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 150000 });
await page.waitForTimeout(1500);
R.走路視角 = await ev(() => ({ 第三人稱人物: !!(window.__tc.avatar && window.__tc.avatar.group.visible), 鏡頭距離: window.__tc.tp.dist, 車款: window.__tc.car.spec.model }));
R.音樂 = await ev(() => { const m = document.getElementById('btnMusic'); return m.textContent; });
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await page.waitForTimeout(1500);
R.上車提示 = await ev(() => document.getElementById('prompt').innerText);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 });
await page.waitForTimeout(2500);
R.上車後 = await ev(() => ({ 座椅面板打開: !document.getElementById('seat').hidden, 駕駛座視角: window.__tc.G.cam, 視野: document.getElementById('seatV').value, 視線上下: document.getElementById('seatT').value, 座椅高低: document.getElementById('seatH').value }));
await shot(`shots/rg_${tag}_seat.png`);
await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
await shot(`shots/rg_${tag}_cockpit.png`);
// Z／X 看後照鏡（按住轉頭、放開回來）
await page.keyboard.down('KeyZ'); await page.waitForTimeout(2500);
const z = await ev(() => { const d = new window.__tc.camera.position.constructor(); window.__tc.camera.getWorldDirection(d); return Math.atan2(d.x, -d.z); });
await page.keyboard.up('KeyZ'); await page.waitForTimeout(3000);
const z0 = await ev(() => { const d = new window.__tc.camera.position.constructor(); window.__tc.camera.getWorldDirection(d); return Math.atan2(d.x, -d.z); });
const carYaw = await ev(() => Math.atan2(window.__tc.car.fwdX, -window.__tc.car.fwdZ));
R.按住Z看左鏡 = { 按住時轉了_度: +((z - carYaw) * 180 / Math.PI).toFixed(0), 放開後_度: +((z0 - carYaw) * 180 / Math.PI).toFixed(1) };
// 滑鼠左右轉視角（按住滑鼠拖曳）
await page.mouse.move(550, 300); await page.mouse.down(); await page.mouse.move(350, 300, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(800);
const m1 = await ev(() => { const d = new window.__tc.camera.position.constructor(); window.__tc.camera.getWorldDirection(d); return Math.atan2(d.x, -d.z); });
R.滑鼠轉視角 = { 拖曳後轉了_度: +((m1 - carYaw) * 180 / Math.PI).toFixed(0) };
await page.waitForTimeout(3000);
const m2 = await ev(() => { const d = new window.__tc.camera.position.constructor(); window.__tc.camera.getWorldDirection(d); return Math.atan2(d.x, -d.z); });
R.滑鼠轉視角.停車時3秒後_度 = +((m2 - carYaw) * 180 / Math.PI).toFixed(0);
await page.keyboard.press('KeyR'); await page.waitForTimeout(2500);
const m3 = await ev(() => { const d = new window.__tc.camera.position.constructor(); window.__tc.camera.getWorldDirection(d); return Math.atan2(d.x, -d.z); });
R.滑鼠轉視角.按R後_度 = +((m3 - carYaw) * 180 / Math.PI).toFixed(0);
// 路牌、招牌
R.路牌招牌 = await ev(() => { let road = 0, shop = 0; for (const l of window.__tc.signs.all.values()) for (const s of l) { if (s.road) road++; else shop++; } return { 路名牌: road, 店家招牌: shop }; });
// 引擎聲／C 切換車外
await page.keyboard.press('KeyC'); await page.waitForTimeout(2000);
R.C切換視角 = await ev(() => window.__tc.G.cam);
await shot(`shots/rg_${tag}_chase.png`);
await page.keyboard.press('KeyC'); await page.waitForTimeout(1000);
// 停車格判定與下車（直接把車放到最近的空車格）
await ev(() => { const { parking, car } = window.__tc; let best = null; parking.forBaysNear(car.x, car.z, 200, (b, d2) => { if (!b.occupied && !b.reserved && b.type === 'road' && (!best || d2 < best.d2)) best = { b, d2 }; }); const b = best.b; car.place(b.x, b.z, b.psi, b.y); });
await page.waitForTimeout(2000);
R.停進車格提示 = await ev(() => document.getElementById('prompt').innerText);
R.頁面錯誤 = errs.length ? errs.slice(0, 3) : '無';
console.log(tag, JSON.stringify(R, null, 1));
await browser.close();
