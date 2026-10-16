// 離線算出引擎聲（試聽），並輸出轉速／檔位紀錄，用來檢查聲音是否跟著轉速走
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const kind = process.argv[2] || 'gas', out = process.argv[3] || 'shots/engine.wav', cockpit = process.argv[4] === 'cockpit';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.setDefaultTimeout(300000);
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto('http://localhost:8766/tests/_t.html');
const res = await page.evaluate(async ({ kind, cockpit }) => {
  const { EngineSound } = await import('/web/js/engine.js');
  // 0.5 s 發動 → 怠速 → 4 s 起全油門 10 秒 → 放油門滑行 → 煞車 → 半油門 → 熄火
  const script = kind === 'tap' ? (t) => ({ ignite: t >= 0.5 && t < 0.52, cockpit, throttle: t >= 3 && t < 9 ? 1 : t >= 9 && (Math.floor((t - 9) / 0.6) % 2 === 0) ? 1 : 0, brake: 0 }) : (t) => ({
    ignite: t >= 0.5 && t < 0.52, shutdown: t >= 21 && t < 21.02, cockpit,
    throttle: t >= 4 && t < 14 ? 1 : t >= 18.5 && t < 21 ? 0.4 : 0,
    brake: t >= 16.5 && t < 18.5 ? 0.5 : 0,
  });
  const { buffer, log } = await EngineSound.render(22.5, script, kind === 'tap' ? 'gas' : kind);
  const L = buffer.getChannelData(0), n = L.length;
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 44100, true); out.setUint32(28, 88200, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
  let pk = 0; for (let i = 0; i < n; i++) { pk = Math.max(pk, Math.abs(L[i])); out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, L[i])) * 32767, true); }
  let bin = ''; const u8 = new Uint8Array(out.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(bin), log, peak: pk };
}, { kind, cockpit });
fs.writeFileSync(out, Buffer.from(res.b64, 'base64'));
fs.writeFileSync(out.replace(/\.wav$/, '.json'), JSON.stringify(res.log));
console.log('peak', res.peak.toFixed(3), 'frames', res.log.length);
await browser.close();
