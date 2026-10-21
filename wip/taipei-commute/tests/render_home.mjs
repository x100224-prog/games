// 離線算出：房間的居家曲（約 70 秒，含前奏和 A、B、A' 一輪）、吉他和鋼琴第一天／第三天的樣子，存成 mp3 試聽，順便量音量。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
const OUT = process.env.OUT || '/tmp/claude-0/preview';
execFileSync('mkdir', ['-p', OUT]);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8768/index.html#lowq');
const jobs = [['home', 'music', 0, 72], ['gtr_day1', 'gtr', 0, 0], ['gtr_day3', 'gtr', 2, 0], ['pno_day1', 'pno', 0, 0], ['pno_day3', 'pno', 2, 0]];
for (const [name, kind, level, sec] of jobs) {
  const r = await page.evaluate(async ([kind, level, sec]) => {
    let buf;
    if (kind === 'music') { const { Music } = await import('./js/music.js'); buf = await Music.render(sec, 'walk', 0, 0, 'home'); }
    else {
      const I = await import('./js/instruments.js'), dur = I.performDur(kind, level) + 0.5;
      const ctx = new OfflineAudioContext(2, Math.ceil(44100 * Math.max(dur, 8)), 44100);
      I.playInstrument(ctx, ctx.destination, kind, level); buf = await ctx.startRendering();
    }
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, n = L.length;
    let pk = 0, sq = 0; for (let i = 0; i < n; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (v > pk) pk = v; sq += L[i] * L[i]; }
    // 16-bit WAV
    const ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab); let o = 0;
    const w4 = (s) => { for (const ch of s) dv.setUint8(o++, ch.charCodeAt(0)); };
    w4('RIFF'); dv.setUint32(o, 36 + n * 4, true); o += 4; w4('WAVEfmt '); dv.setUint32(o, 16, true); o += 4; dv.setUint16(o, 1, true); o += 2; dv.setUint16(o, 2, true); o += 2;
    dv.setUint32(o, 44100, true); o += 4; dv.setUint32(o, 44100 * 4, true); o += 4; dv.setUint16(o, 4, true); o += 2; dv.setUint16(o, 16, true); o += 2; w4('data'); dv.setUint32(o, n * 4, true); o += 4;
    for (let i = 0; i < n; i++) { dv.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); o += 2; dv.setInt16(o, Math.max(-1, Math.min(1, R[i])) * 32767, true); o += 2; }
    let bin = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { b64: btoa(bin), sec: +(n / 44100).toFixed(1), peak: +pk.toFixed(3), rmsDb: +(10 * Math.log10(sq / n + 1e-12)).toFixed(1) };
  }, [kind, level, sec]);
  writeFileSync(`${OUT}/${name}.wav`, Buffer.from(r.b64, 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/${name}.wav`, '-codec:a', 'libmp3lame', '-b:a', '160k', `${OUT}/${name}.mp3`]);
  console.log(name, JSON.stringify({ sec: r.sec, peak: r.peak, rmsDb: r.rmsDb }));
}
await browser.close();
