// 玩法「全城無人機・路空總控」：選單、車流與天上的分配、按 U 問總控、核准後升空、排好的降落時段、預估 vs 實際。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const URL = 'http://localhost:8768/index.html#lowq';
const PAIR = +(process.argv[2] || 6), LEAVE = process.argv[3] || '';   // LEAVE：'late' = 先在家等到 8:10 才出門
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push('CONSOLE ' + m.text()); });
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const boot = async () => { await page.goto('about:blank'); await page.goto(URL); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu' && window.__tc.drones, null, { timeout: 180000 }); };
await boot();
await ev(([di, near]) => { localStorage.clear(); localStorage.setItem('taipei-commute-unlock', '1'); localStorage.setItem('taipei-commute-mode', 'hybrid'); localStorage.setItem('taipei-commute-tips', JSON.stringify(['nav', 'ev', 'roadster', 'drone', 'ctl']));
  const m = window.__tc.meta, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return near ? d > 1100 && d < 1600 : d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2-hybrid', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: ['roadster', 'drone'], carKey: 'roadster' } })); }, [PAIR, LEAVE === 'near']);
await boot();
console.log('menu:', JSON.stringify(await ev(() => ({ modes: [...document.querySelectorAll('#modeOpts button')].map(b => b.querySelector('b').textContent + (b.disabled ? '[鎖]' : '') + (b.classList.contains('on') ? '[選]' : '')), demos: [...document.querySelectorAll('#demoOpts button')].map(b => b.querySelector('b').textContent).slice(-2), mode: window.__tc.G.mode, cont: document.getElementById('btnContinue').textContent.slice(0, 40) }))));
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
if (LEAVE === 'late') { await ev(() => { window.__tc.steps = 12; }); await page.waitForFunction(() => window.__tc.G.clock > 8 * 60 + 5, null, { timeout: 300000 }); await ev(() => { window.__tc.steps = 1; }); }
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await page.keyboard.press('Enter'); try { await page.waitForFunction(() => !window.__tc.G.seatAdj, null, { timeout: 30000 }); } catch (e) { const c1 = await ev(() => window.__tc.G.clock); await wait(1500); console.log('seat stuck', JSON.stringify(await ev(() => ({ seat: window.__tc.G.seatAdj, tip: document.getElementById('tipCard').hidden, st: window.__tc.G.state, clock: window.__tc.G.clock, hit: [...window.__tc.input.hit], mode: window.__tc.G.mode, ctl: !!window.__tc.ctl }))), 'clock0', c1, errs.filter(e => !e.includes('toNonIndexed')).slice(0, 5).join('\n')); process.exit(1); } await wait(500);
const state = () => ev(() => { const T = window.__tc, c = T.ctl, s = T.droneSky; const f = (m) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  return { clock: f(T.G.clock), p: c && +c.p.toFixed(2), factor: +T.traffic.factor.toFixed(2), roadCars: T.traffic.cars.length, sky: s && s.list.length, skyTarget: s && s.target, share: s && +s.share.toFixed(2), dense: T.drones.dense, hybridHooks: !!(s && s.hybrid), fromRoad: s && s.stats.fromRoad, toRoad: s && s.stats.toRoad, landed: s && s.stats.landed, help: document.getElementById('help').innerText.includes('問路空總控') }; });
console.log('start:', JSON.stringify(await state()));
await ev(() => { window.__tc.steps = 6; }); await wait(9000); await ev(() => { window.__tc.steps = 1; });
console.log('after warmup:', JSON.stringify(await state()));
// 開一下，開著按 U 問總控
await page.keyboard.down('KeyW'); await wait(2500);
await page.keyboard.press('KeyU'); await wait(400);
const card = await ev(() => ({ hidden: document.getElementById('ctlCard').hidden, text: document.getElementById('ctlCard').innerText.replace(/\n/g, ' | '), ev: (() => { const e = window.__tc.G.ctl && window.__tc.G.ctl.ev; if (!e) return null; return { fly: e.fly, hold: e.holdGround, roadMin: e.road && +(e.road.sec / 10).toFixed(1), airMin: +(e.air.sec / 10).toFixed(1), queueMin: +(e.air.queue / 10).toFixed(1), ahead: e.air.ahead, cross: +e.air.cross.toFixed(1), v: +e.air.v.toFixed(1), stopS: +e.air.stop.toFixed(0), gapS: +e.air.gap.toFixed(0), climbS: +e.air.climb.toFixed(0), cruiseS: +e.air.cruise.toFixed(0), downS: +e.air.down.toFixed(0), queueS: +e.air.queue.toFixed(0), skyN: e.air.skyN, spots: e.air.spots, A: +e.air.A.toFixed(2), live: e.road && e.road.live }; })(), btn: document.getElementById('btnDrone').textContent, sub: document.getElementById('taskSub').textContent }));
console.log('ask (moving):', JSON.stringify(card, null, 0));
await page.keyboard.up('KeyW');
await page.screenshot({ path: '/tmp/claude-0/hyb/card.png' }).catch(() => {});
const e0 = card.ev;
if (LEAVE === 'near' && !e0.fly) {
  // 建議繼續開：交給自動駕駛照路線開，看「開到目的地附近」時總控預估準不準
  await ev(() => { window.__tc.setAuto({ t: 0 }); window.__tc.steps = 6; });
  let msg = '';
  for (let i = 0; i < 240 && !msg; i++) { await wait(2000); msg = await ev(() => !window.__tc.G.ctlDrive && /總控預估/.test(document.getElementById('toast').textContent) ? document.getElementById('toast').textContent : ''); }
  console.log('drive report:', msg || 'NO REPORT', JSON.stringify(await state()));
  console.log(errs.filter(e => !/toNonIndexed|ERR_TUNNEL|tile failed/.test(e)).slice(0, 8).join('\n') || 'no page errors');
  await browser.close(); process.exit(0);
}
// 地面等待：交給自動駕駛往公司開，等總控提醒「起飛時段到了」（或改判直接開比較快），再停車自動升空
if (LEAVE === 'late' && e0.fly && e0.hold) {
  await ev(() => { window.__tc.setAuto({ t: 0 }); window.__tc.steps = 6; });
  let got = null;
  for (let i = 0; i < 300 && !got; i++) {
    await wait(2000);
    got = await ev(() => { const G = window.__tc.G; return G.ctlAuto ? 'auto' : G.ctlDrive ? 'drive' : null; });
    if (i % 10 === 0) console.log('  hold', JSON.stringify(await ev(() => ({ clock: window.__tc.G.clock.toFixed(1), sub: document.getElementById('taskSub').textContent, hold: !!window.__tc.G.ctlHold }))));
  }
  console.log('hold result:', got, await ev(() => document.getElementById('toast').textContent));
  await ev(() => { window.__tc.setAuto(null); window.__tc.steps = 1; window.__tc.input.keys.clear(); });
  if (got === 'drive') { console.log(errs.filter(e => !/toNonIndexed|ERR_TUNNEL|tile failed/.test(e)).slice(0, 8).join('\n') || 'no page errors'); await browser.close(); process.exit(0); }
}
// 不是直接核准的話：10 秒內再按一次 U＝堅持現在升空
else if (!e0.fly || e0.hold) { await page.keyboard.press('KeyU'); await wait(300); console.log('insist:', await ev(() => [!!window.__tc.G.ctlAuto, window.__tc.flight.active, document.getElementById('toast').textContent])); }
// 停下來：自動升空
await page.keyboard.down('KeyS'); await page.waitForFunction(() => window.__tc.flight.active || Math.abs(window.__tc.car.v) < 0.3, null, { timeout: 30000 }); await wait(1500); await page.keyboard.up('KeyS');
console.log('lift:', JSON.stringify(await ev(() => { const f = window.__tc.flight; return { active: f.active, phase: f.phase, plan: f.plan && { slotIn: +((f.plan.slotAt - window.__tc.ctl.t) / 10).toFixed(1), pred: +(f.plan.predSec / 10).toFixed(1), ahead: f.plan.ahead }, toast: document.getElementById('toast').textContent }; })));
// 快轉看飛完
await ev(() => { window.__tc.steps = 8; });
let seenHold = false, last = '';
for (let i = 0; i < 200; i++) {
  await wait(2000);
  const s = await ev(() => { const f = window.__tc.flight; return { a: f.active, ph: f.phase, hold: f.slotHold, held: f.held, blocked: f.blocked, task: document.getElementById('taskText').textContent, sub: document.getElementById('taskSub').textContent, r: f.result }; });
  if (s.hold) seenHold = true;
  const k = s.ph + (s.hold ? '+slot' : '') + (s.blocked ? '+blocked' : '');
  if (k !== last) { last = k; console.log('  phase', k, '|', s.task, '|', s.sub); }
  if (!s.a) { console.log('landed:', JSON.stringify(s.r), 'sawSlotHold', seenHold, 'toast:', await ev(() => document.getElementById('toast').textContent));
    console.log('phases (s):', JSON.stringify(await ev(() => { const f = window.__tc.flight; const o = {}; for (const k in f.tPh) o[k] = +f.tPh[k].toFixed(0); return { ...o, d0: Math.round(f.d0), liftWait: +f.liftWait.toFixed(0), crossWait: +f.crossWait.toFixed(0), jam: +f.jamSec.toFixed(0), slot: +f.slotSec.toFixed(0) }; }))); break; }
}
await ev(() => { window.__tc.steps = 1; });
console.log('end:', JSON.stringify(await state()));
console.log(errs.filter(e => !/toNonIndexed|ERR_TUNNEL|tile failed/.test(e)).slice(0, 8).join('\n') || 'no page errors');
await browser.close();
