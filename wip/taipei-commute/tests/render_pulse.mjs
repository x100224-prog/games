// 算出原創配樂「夜行高架」→ build/music/night.wav（50 小節）→ 處理循環接縫 → web/audio/cyber.mp3
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('about:blank'); await p.addScriptTag({ content: fs.readFileSync('tools/pulse_render.js', 'utf8') });
const t0 = Date.now();
const r = await p.evaluate(async () => await window.renderPulse({ bars: 50 }));
fs.writeFileSync('build/music/pulse_raw.wav', Buffer.from(r.b64, 'base64'));
console.log('rendered', r.sec.toFixed(1), 's, peak', r.peak.toFixed(3), 'bar', r.bar.toFixed(4), 'in', ((Date.now() - t0) / 1000).toFixed(0), 's', errs.join(' ') || 'no errors');
fs.writeFileSync('build/music/pulse_meta.json', JSON.stringify({ bar: r.bar }));
await b.close();
