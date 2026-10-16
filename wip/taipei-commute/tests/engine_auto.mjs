// 遊戲內「自動示範」整段跑一次（只跑邏輯不畫圖），記錄引擎轉速、檔位、實際輸出音量
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8767/index.html#lowq';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
const ev = (f, a) => page.evaluate(f, a);
page.setDefaultTimeout(180000);
await page.goto(url);
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title', null, { timeout: 90000 });
await ev(() => { window.__tc.noRender = true; });
await page.click('#btnAuto');
const t0 = Date.now(); let last = '';
while (Date.now() - t0 < 75000) {
  await page.waitForTimeout(700);
  const s = await ev(() => { const e = window.__tc.engine, c = window.__tc.car, G = window.__tc.G; return { st: G.state + (G.seatAdj ? '/seat' : ''), kmh: c ? +c.kmh.toFixed(0) : 0, rpm: Math.round(e.rpm), gear: e.gear, ph: e.phase, dB: +(20 * Math.log10(e.level() + 1e-9)).toFixed(0), cam: G.cam }; });
  const line = `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${s.st.padEnd(10)} ${String(s.kmh).padStart(3)} km/h ${String(s.rpm).padStart(5)} rpm g${s.gear} ${s.ph.padEnd(5)} ${String(s.dB).padStart(4)} dB ${s.cam}`;
  console.log(line);
}
console.log(logs.slice(0, 10).join('\n') || 'no page errors');
await browser.close();
