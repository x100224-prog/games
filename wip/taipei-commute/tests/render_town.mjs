// 算出在家配樂「小巷裡的祕密」（tools/town_render.js）→ web/audio/home.mp3，並印出循環點與音量。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
const ROOT = '/home/claude/taipei-commute', TMP = '/tmp/claude-0/preview';
execFileSync('mkdir', ['-p', TMP]);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ path: `${ROOT}/tools/town_render.js` });
const t0 = Date.now();
const r = await page.evaluate(async () => {
  const buf = await window.renderTown(), T = window.TOWN, BAR = 60 / T.BPM * 4;
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
  let pk = 0, sq = 0, clip = 0; for (let i = 0; i < n; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (v > pk) pk = v; if (v > 0.99) clip++; sq += L[i] * L[i]; }
  // 每段的音量（看各段有沒有太大或太小聲）
  const seg = (b0, b1) => { let s = 0; const a = Math.floor(b0 * BAR * 44100), b = Math.floor(b1 * BAR * 44100); for (let i = a; i < b; i++) s += L[i] * L[i]; return +(10 * Math.log10(s / (b - a))).toFixed(1); };
  const parts = { intro: seg(0, 4), A: seg(4, 12), A2: seg(12, 20), B: seg(20, 28), A2back: seg(28, 36) };
  // 循環接縫：循環終點前後跟起點前後應該一模一樣
  const i0 = Math.round(T.LOOP_BARS[0] * BAR * 44100), i1 = Math.round(T.LOOP_BARS[1] * BAR * 44100); let dmax = 0; for (let k = -2000; k < 2000; k++) dmax = Math.max(dmax, Math.abs(L[i0 + k] - L[i1 + k]));
  parts.seamMaxDiff = +dmax.toFixed(4);
  const ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab); let o = 0;
  const w4 = (s) => { for (const ch of s) dv.setUint8(o++, ch.charCodeAt(0)); };
  w4('RIFF'); dv.setUint32(o, 36 + n * 4, true); o += 4; w4('WAVEfmt '); dv.setUint32(o, 16, true); o += 4; dv.setUint16(o, 1, true); o += 2; dv.setUint16(o, 2, true); o += 2;
  dv.setUint32(o, 44100, true); o += 4; dv.setUint32(o, 44100 * 4, true); o += 4; dv.setUint16(o, 4, true); o += 2; dv.setUint16(o, 16, true); o += 2; w4('data'); dv.setUint32(o, n * 4, true); o += 4;
  for (let i = 0; i < n; i++) { dv.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); o += 2; dv.setInt16(o, Math.max(-1, Math.min(1, R[i])) * 32767, true); o += 2; }
  let bin = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(bin), sec: +(n / 44100).toFixed(2), peak: +pk.toFixed(3), clip, rmsDb: +(10 * Math.log10(sq / n)).toFixed(1), parts, loop: [T.LOOP_BARS[0] * BAR, T.LOOP_BARS[1] * BAR] };
});
console.log('rendered in', Math.round((Date.now() - t0) / 1000), 's:', JSON.stringify({ sec: r.sec, peak: r.peak, clip: r.clip, rmsDb: r.rmsDb, parts: r.parts, loop: r.loop }));
writeFileSync(`${TMP}/home_town.wav`, Buffer.from(r.b64, 'base64'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${TMP}/home_town.wav`, '-codec:a', 'libmp3lame', '-b:a', '128k', `${ROOT}/web/audio/home.mp3`]);
// 試聽版：前奏＋一整輪（到循環點）
const once = r.loop[1] - (r.loop[1] - r.loop[0]) / 32 * 2;   // 前奏＋整整一輪（第 36 小節）
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${TMP}/home_town.wav`, '-t', String(once + 3), '-af', `afade=t=out:st=${once}:d=3`, '-codec:a', 'libmp3lame', '-b:a', '160k', `${TMP}/home_town_preview.mp3`]);
console.log('wrote web/audio/home.mp3', execFileSync('du', ['-h', `${ROOT}/web/audio/home.mp3`]).toString().trim());
await browser.close();
