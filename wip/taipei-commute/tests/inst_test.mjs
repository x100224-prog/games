// 房間：居家配樂、鋼琴和吉他（一天算一次練習：第一天不順 → 第三天順）、彈的時候配樂收起來、走開或按 E 停。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
const boot = async () => { await page.goto('about:blank'); await page.goto('http://localhost:8768/index.html#lowq'); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 }); };
await boot();
await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0];
  const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: [], carKey: 'gas' } })); });
await boot();
await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 }); await wait(1500);
const st = () => ev(() => { const { G } = window.__tc, m = window.__tc.music; return { style: m && m.style, held: !!(m && m.held), inst: G.inst ? G.inst.kind + G.inst.level : null, prac: JSON.stringify(G.prac || {}), prompt: document.getElementById('prompt').innerText, toast: document.getElementById('toast').textContent, clock: Math.round(G.clock) }; });
await page.waitForFunction(() => { const m = window.__tc.music; return m && m.files.home.buf; }, null, { timeout: 60000 }).catch(() => {});
await wait(1500);
console.log('home track:', JSON.stringify(await ev(() => { const m = window.__tc.music, F = m.files.home; return { loaded: !!F.buf, dur: F.buf && +F.buf.duration.toFixed(2), off: F.off && +F.off.toFixed(3), playing: m.fileSrc && m.fileSrc.style, loop: m.fileSrc && [+m.fileSrc.src.loopStart.toFixed(2), +m.fileSrc.src.loopEnd.toFixed(2)], ctx: m.ctx && m.ctx.state }; })));
console.log('room start:', JSON.stringify(await st()));
await page.screenshot({ path: 'shots/inst_0_room.png' });
const goTo = async (k) => { await ev((k) => { const { P } = window.__tc, r = window.__tc.room[k]; P.x = r.x + 0.1; P.z = r.z + (k === 'piano' ? -0.2 : 0); }, k); await wait(700); };
// 鋼琴：第一天
await goTo('piano'); console.log('near piano:', (await st()).prompt);
await page.keyboard.press('KeyE'); await wait(800); console.log('piano day1 start:', JSON.stringify(await st()));
await page.screenshot({ path: 'shots/inst_1_piano.png' });
await page.waitForFunction(() => !window.__tc.G.inst, null, { timeout: 120000 }); await wait(300);
console.log('piano day1 end:', JSON.stringify(await st())); await wait(4800); console.log('reminder:', (await st()).toast);
// 同一天再彈：還是第一天的程度
await page.keyboard.press('KeyE'); await wait(600); console.log('same day again:', JSON.stringify(await st()));
await page.keyboard.press('KeyE'); await wait(600); console.log('stopped with E:', JSON.stringify(await st()));
// 隔天、再隔天
for (const d of [1, 2]) {
  await ev(() => { window.__tc.G.dayN++; }); await page.keyboard.press('KeyE'); await wait(600);
  console.log(`piano day${d + 1}:`, JSON.stringify(await st()));
  await page.keyboard.press('KeyE'); await wait(500);
}
// 吉他：拿起來、走開就停
await goTo('guitar'); console.log('near guitar:', (await st()).prompt);
await page.keyboard.press('KeyE'); await wait(1500); console.log('guitar start:', JSON.stringify(await st()));
console.log('guitar held at:', JSON.stringify(await ev(() => { const g = window.__tc.room.gtr.position, P = window.__tc.P; return { g: [g.x, g.y, g.z].map(v => +v.toFixed(2)), me: [+P.x.toFixed(2), +P.z.toFixed(2)] }; })));
await page.screenshot({ path: 'shots/inst_2_guitar.png' });
await page.keyboard.down('KeyS'); await wait(500); await page.keyboard.up('KeyS'); await wait(400);
console.log('walked away:', JSON.stringify(await st()), 'guitar back', await ev(() => +window.__tc.room.gtr.position.x.toFixed(2)));
console.log('saved prac:', await ev(() => JSON.stringify(JSON.parse(localStorage.getItem('taipei-commute-v2')).prac)));
// 出門：配樂換回開車的
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await wait(1500); console.log('outside:', JSON.stringify(await ev(() => ({ style: window.__tc.music.style, held: window.__tc.music.held, file: window.__tc.music.fileSrc && window.__tc.music.fileSrc.style }))));
console.log(errs.slice(0, 6).join('\n') || 'no page errors');
await browser.close();
