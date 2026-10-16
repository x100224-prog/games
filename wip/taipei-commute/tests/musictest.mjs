// 檢查配樂：用 OfflineAudioContext 無法直接重用，所以在真的頁面裡錄 6 秒輸出、量音量與頻譜
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ' ' + m.text()); });
page.setDefaultTimeout(200000);
await page.goto('http://localhost:8766/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title');
const r = await page.evaluate(async () => {
  const { Music } = await import('./js/music.js');
  const m = new Music(); m.on = true; m.start();
  const ctx = m.ctx, an = ctx.createAnalyser(); an.fftSize = 2048; m.master.connect(an);
  const out = [];
  for (const [mode, sp, sec] of [['walk', 0, 3], ['drive', 20, 3]]) {
    m.update(mode, sp); const buf = new Float32Array(an.fftSize); let peak = 0, sum = 0, n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < sec * 1000) { await new Promise(r => setTimeout(r, 50)); an.getFloatTimeDomainData(buf); for (const v of buf) { peak = Math.max(peak, Math.abs(v)); sum += v * v; n++; } }
    out.push({ mode, state: ctx.state, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4), step: m.step });
  }
  return out;
});
console.log(JSON.stringify(r)); console.log(logs.join('\n')); await browser.close();
