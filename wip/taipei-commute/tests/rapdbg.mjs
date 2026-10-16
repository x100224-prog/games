import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage(); const logs = []; page.on('console', m => logs.push(m.type() + ' ' + m.text()));
await page.goto('http://localhost:8766/_t.html');
console.log(JSON.stringify(await page.evaluate(async () => {
  const { Music } = await import('./js/music.js');
  const ctx = new OfflineAudioContext(2, 44100, 44100), m = new Music(); m._build(ctx); await m._loadRap(ctx);
  return { buf: !!m.rapBuf, dur: m.rapBuf && m.rapBuf.duration, rapOn: m.rapOn };
})));
console.log(logs.join('\n')); await browser.close();
