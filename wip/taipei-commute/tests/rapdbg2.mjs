import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8766/_t.html');
console.log(JSON.stringify(await page.evaluate(async () => {
  const { Music } = await import('./js/music.js');
  const go = async (rap) => {
    const sr = 44100, ctx = new OfflineAudioContext(1, sr * 20, sr), m = new Music(); m.on = true; m.rapOn = rap; m._build(ctx); m.update('drive', 20); m.mode = 'drive'; await m._loadRap(ctx);
    let called = 0; const orig = m._rap.bind(m); m._rap = (t) => { called++; orig(t); };
    for (let step = 15 * 16, t = 0.05; t < 19.9; step++, t += 60 / 128 / 4) m._play(step, t);
    const b = await ctx.startRendering(); return { called, d: b.getChannelData(0) };
  };
  const a = await go(true), b = await go(false);
  let e = 0, ea = 0; for (let i = 0; i < a.d.length; i++) { const x = a.d[i] - b.d[i]; e += x * x; ea += a.d[i] * a.d[i]; }
  return { calledWith: a.called, diffDb: 10 * Math.log10(e / ea) };
})));
await browser.close();
