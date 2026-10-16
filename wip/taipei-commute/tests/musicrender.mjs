// 離線算出配樂並存成 WAV（試聽），同時量各段落的音量
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8766/_t.html');
const sec = +(process.argv[2] || 60), fromBar = +(process.argv[3] || 0), mode = process.argv[4] || 'drive';
const res = await page.evaluate(async ({ sec, fromBar, mode }) => {
  const { Music } = await import('./js/music.js');
  const buf = await Music.render(sec, mode, 20, fromBar);
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
  const stats = []; const win = 44100 * 2;
  for (let i = 0; i < n; i += win) { let pk = 0, ss = 0, c = 0; for (let j = i; j < Math.min(n, i + win); j++) { const v = (L[j] + R[j]) / 2; pk = Math.max(pk, Math.abs(L[j]), Math.abs(R[j])); ss += v * v; c++; } stats.push([+(i / 44100).toFixed(0), +pk.toFixed(2), +(20 * Math.log10(Math.sqrt(ss / c) + 1e-9)).toFixed(1)]); }
  // 16-bit WAV
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, 44100, true); out.setUint32(28, 44100 * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let bin = ''; const u8 = new Uint8Array(out.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { stats, b64: btoa(bin) };
}, { sec, fromBar, mode });
fs.writeFileSync(process.argv[5] || 'shots/music.wav', Buffer.from(res.b64, 'base64'));
console.log(JSON.stringify(res.stats));
await browser.close();
