// 房間裡的吉他和鋼琴：照《雞不可失》的練琴方式和曲目（同一份譜、同一套「彈得順不順」的算法）。
//   吉他：泰雷加〈阿爾罕布拉宮的回憶〉開頭八小節（公有領域），放慢到原本約四分之三的速度、輪指音量小一點。
//   鋼琴：布拉姆斯〈匈牙利舞曲第五號〉第 1–16 小節（公有領域），彈兩遍，第二遍升兩個半音。
//   level 0 = 第一天（很不順，只彈得到前面）、1 = 第二天（好一點）、2 = 第三天以後（順）。
// 瀏覽器沒有內建樂器音源，也不能連外部音色庫，所以每個音都是現場算出來的。

// ==================== 吉他 ====================
// 3/4 拍、四分音符 = 61.5（原本 82 的四分之三）。每半拍四個三十二分音符：拇指一個音 + 輪指同音三下。
// bars 每小節 12 個數字 = 6 組 [拇指音, 輪指音]，數字是 MIDI 音高。
const GTR_SONG = { bpm: 61.5, bars: [
  [45, 64, 52, 64, 60, 64, 52, 64, 59, 62, 52, 62],
  [45, 60, 52, 60, 57, 60, 52, 60, 59, 62, 52, 62],
  [45, 64, 52, 64, 60, 64, 52, 64, 60, 64, 52, 64],
  [45, 64, 52, 64, 60, 64, 52, 64, 62, 65, 55, 65],
  [48, 67, 55, 67, 64, 67, 55, 67, 62, 65, 55, 65],
  [48, 64, 55, 64, 60, 64, 55, 64, 62, 65, 55, 65],
  [48, 67, 55, 67, 64, 67, 55, 67, 64, 67, 55, 67],
  [48, 67, 55, 67, 64, 67, 55, 67, 64, 67, 55, 67],
] };

/* 撥弦音色：Karplus-Strong。 */
const ksCache = {};
function ksBuffer(ctx, midi, bright) {
  const sr = ctx.sampleRate, key = sr + ':' + midi + ':' + (bright ? 1 : 0);
  if (ksCache[key]) return ksCache[key];
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  // 迴圈裡平均的是「這一格」跟「下一格」，所以實際週期是 N-0.5 個取樣；N 只能是整數，剩下的誤差用播放速率補到準
  const N = Math.max(2, Math.round(sr / f + 0.5));
  const t60 = 2.6 - Math.min(1, Math.max(0, (midi - 45) / 22)) * 1.1;     // 低音弦響得久，高音弦短
  const secs = t60 * 0.95, len = Math.floor(sr * secs);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const ring = new Float32Array(N);
  // 起始波形：雜訊過兩次低通，尼龍弦才不會像鋼弦那麼刺
  const lp = bright ? 0.62 : 0.36;
  let a = 0, b = 0, mean = 0, pk = 0;
  for (let i = 0; i < N; i++) { const w = Math.random() * 2 - 1; a += lp * (w - a); b += lp * (a - b); ring[i] = b; mean += b; }
  mean /= N;
  for (let i = 0; i < N; i++) { ring[i] -= mean; pk = Math.max(pk, Math.abs(ring[i])); }
  for (let i = 0; i < N; i++) ring[i] /= (pk || 1);
  const damp = Math.pow(10, -3 / (t60 * f));
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx], nx = ring[idx + 1 < N ? idx + 1 : 0];
    d[i] = cur;
    ring[idx] = damp * 0.5 * (cur + nx);
    idx = idx + 1 < N ? idx + 1 : 0;
  }
  const fade = Math.floor(sr * 0.06);
  for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  const o = { buf, rate: f * (N - 0.5) / sr };
  ksCache[key] = o; return o;
}

/* 把同一份譜「彈」成一串事件。 */
function gtrPerform(level) {
  const S = GTR_SONG, step = 60 / S.bpm / 8;
  const bars = level <= 0 ? S.bars.slice(0, 4) : S.bars;      // 第一天只練得到前四小節
  const P = level <= 0 ? { tempo: 0.55, jit: 0.30, wrong: 0.09, dead: 0.10, barPause: [0.25, 0.60], chg: 0.45, restarts: 2 }
    : level === 1 ? { tempo: 0.80, jit: 0.10, wrong: 0.025, dead: 0.04, barPause: [0.00, 0.14], chg: 0.12, restarts: 1 }
      : { tempo: 1.00, jit: 0.012, wrong: 0, dead: 0, barPause: [0, 0], chg: 0, restarts: 0 };
  const st = step / P.tempo, ev = [];
  let t = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function note(midi, voice) {
    const gain = (voice === 't' ? 0.50 : 0.26) * (1 + (Math.random() * 2 - 1) * (level >= 2 ? 0.07 : 0.25));
    if (voice === 'm' && Math.random() < P.wrong) {
      // 按錯格：先彈出錯的音，愣一下，再補上對的
      const off = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
      ev.push({ t, midi: midi + off, gain, voice, dead: false });
      t += st * rnd(1.6, 3.6);
      ev.push({ t, midi, gain, voice, dead: false });
      t += st * (1 + (Math.random() * 2 - 1) * P.jit);
      return;
    }
    const dead = Math.random() < P.dead;                         // 沒按好，悶掉的音
    ev.push({ t, midi, gain: dead ? gain * 0.5 : gain, voice, dead });
    t += st * (1 + (Math.random() * 2 - 1) * P.jit);
  }
  function playBar(bi, halves) {
    const bar = bars[bi];
    for (let k = 0; k < halves; k++) {
      if (k > 0 && bar[2 * k + 1] !== bar[2 * k - 1] && Math.random() < P.chg) t += rnd(0.12, 0.40);   // 左手要換位置的地方，猶豫一下
      note(bar[2 * k], 't');
      for (let j = 0; j < 3; j++) note(bar[2 * k + 1], 'm');
    }
  }
  const stops = [];
  for (let i = 0; i < P.restarts; i++) {
    if (level === 1 && Math.random() < 0.4) continue;
    stops.push({ bar: Math.floor(Math.random() * bars.length), halves: 2 + Math.floor(Math.random() * 4), done: false });
  }
  for (let bi = 0; bi < bars.length; bi++) {
    if (bi > 0) t += rnd(P.barPause[0], P.barPause[1]);
    const s = stops.find(x => x.bar === bi && !x.done);
    if (s) { s.done = true; playBar(bi, s.halves); t += rnd(0.5, 0.9); }   // 彈到一半卡住，這一小節重來
    playBar(bi, 6);
  }
  return { events: ev, dur: t + 1.4 };
}

function gtrSchedule(ctx, perf, t0, out) {
  const bus = ctx.createGain(); bus.gain.value = 0.9;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
  bus.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(out);
  const last = {}, srcs = [];
  perf.events.forEach((e) => {
    const k = ksBuffer(ctx, e.midi, e.voice === 'm');
    const src = ctx.createBufferSource(); src.buffer = k.buf;
    src.playbackRate.value = k.rate * (e.dead ? 1.012 : 1);
    const gn = ctx.createGain(); const at = t0 + e.t;
    gn.gain.setValueAtTime(e.gain, at);
    if (e.dead) gn.gain.setTargetAtTime(0, at + 0.03, 0.025);
    src.connect(gn); gn.connect(bus); src.start(at);
    // 同一條弦再撥一次，前一個音就被切掉：輪指那條弦算一條，拇指同音高算同一條
    const key = e.voice === 'm' ? 'm' : 't' + e.midi;
    if (last[key]) last[key].gain.setTargetAtTime(0, at, 0.012);
    last[key] = gn; srcs.push(src);
  });
  return { dur: perf.dur, stop() {
    try { bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03); } catch (err) { /* ignore */ }
    setTimeout(() => srcs.forEach((s) => { try { s.stop(); } catch (err) { /* ignore */ } }), 200);
  } };
}

// ==================== 鋼琴 ====================
// 升 f 小調、2/4 拍。每個音 = [第幾拍開始, 長幾拍, [MIDI 音高…]]，一小節兩拍。
// 彈兩遍；keyMode "second" = 第一遍原調、第二遍升兩個半音。
const PNO_SONG = (() => {
  const run = (a) => a.map((m, i) => [i * 0.25, 0.25, [m]]);
  const A = [[0, .5, [42]], [.5, .5, [45, 49, 57]], [1, .5, [37]], [1.5, .5, [49, 57]]];      // 升f小調：F#2|A2 C#3 A3|C#2|C#3 A3
  const B = [[0, .5, [42]], [.5, .5, [47, 50, 59]], [1, .5, [35]], [1.5, .5, [50, 59]]];      // F#2|B2 D3 B3|B1|D3 B3
  return { bpm: 126, keyUp: 2, keyMode: 'second',
    rh: [
      [[0, 1.5, [61]], [1.5, .5, [66]]],
      [[0, 1.5, [69]], [1.5, .5, [66]]],
      [[0, 1.5, [65]], [1.5, .25, [66]], [1.75, .25, [68]]],
      [[0, 2, [66]]],
      [[0, 1.5, [59, 62]], [1.5, .25, [61, 64]], [1.75, .25, [62, 66]]],
      [[0, 2, [57, 61]]],
      [[0, .25, [59]], [.25, .25, [57]], [.5, .25, [57]], [.75, .25, [56]], [1, .75, [56]], [1.75, .25, [61]]],
      [[0, 2, [54]]],
      [[0, 1.5, [61, 73]], [1.5, .25, [66, 78]], [1.75, .25, [69, 81]]],
      [[0, 1.5, [73, 85]], [1.5, .5, [69, 81]]],
      [[0, 1.5, [68, 74, 77, 80]], [1.5, .25, [69, 81]], [1.75, .25, [71, 83]]],
      [[0, 2, [69, 73, 78, 81]]],
      run([74, 76, 78, 74, 73, 74, 76, 73]),
      run([71, 73, 74, 71, 69, 71, 73, 69]),
      [[0, .25, [71]], [.25, .25, [69]], [.5, .25, [69]], [.75, .25, [68]], [1, .75, [68]], [1.75, .25, [73]]],
      [[0, 1, [66]], [1, .5, [69, 73, 78]]],
    ],
    lh: [A, A, B, A, B, A,
      [[0, .5, [41]], [.5, .5, [49, 53, 61]], [1, .5, [37]], [1.5, .5, [49, 53, 59]]],
      A, A, A, B, A,
      [[0, .5, [54]], [.5, .5, [57]], [1, .5, [52]], [1.5, .5, [56, 61]]],
      [[0, .5, [50]], [.5, .5, [54, 59, 62]], [1, .5, [49]], [1.5, .5, [57, 61, 64]]],
      [[0, .5, [37]], [.5, .5, [56, 59, 65]], [1.5, .5, [49, 53, 59]]],
      [[0, .5, [42]], [.5, .5, [45, 49, 57]], [1, .5, [30, 42]]],
    ],
    // 力度：譜上 f、第 9 小節漸強、13–14 小節 p、最後一個和弦 sf
    rhVel: [.85, .85, .85, .85, .85, .85, .85, .85, .92, 1, 1, 1, .45, .45, .65, .85],
    lhVel: [.55, .55, .55, .55, .55, .55, .55, .55, .6, .6, .6, .6, .36, .36, .5, .6],
    sfBars: 6,                                   // 前六小節左手第二個八分音符有 sf
  };
})();

/* 鋼琴音色：每個音用一疊泛音現場算出來；高泛音衰減得快，兩條弦差一點點音高，聽起來才像琴弦而不是電子琴。 */
const pnoCache = {};
function pnoBuffer(ctx, midi) {
  const SR = ctx.sampleRate >= 44100 ? ctx.sampleRate / 2 : ctx.sampleRate;
  const key = SR + ':' + midi;
  if (pnoCache[key]) return pnoCache[key];
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const x = Math.max(0, Math.min(1, (midi - 28) / 62));          // 0 = 低音區, 1 = 高音區
  const secs = 3.0 - 1.7 * x, len = Math.floor(SR * secs);
  const buf = ctx.createBuffer(1, len, SR), d = buf.getChannelData(0);
  const Bi = 0.00010 * Math.pow(2, (midi - 33) / 9);              // 弦的非諧性：越高音越明顯
  const K = Math.min(26, Math.floor(0.46 * SR / f));
  const tilt = 0.70 + 0.9 * x;                                    // 低音泛音多，高音泛音少
  const tau1 = 2.4 - 1.8 * x;
  function add(fk, amp, tau, ph) {
    const w = 2 * Math.PI * fk / SR, r = Math.exp(-1 / (tau * SR)), c = 2 * r * Math.cos(w), r2 = r * r;
    let y2 = amp * Math.sin(ph - w) / r, y1 = amp * Math.sin(ph);
    d[0] += y1;
    for (let i = 1; i < len; i++) { const y = c * y1 - r2 * y2; y2 = y1; y1 = y; d[i] += y; }
  }
  for (let k = 1; k <= K; k++) {
    const fk = f * k * Math.sqrt((1 + Bi * k * k) / (1 + Bi)); if (fk > 0.47 * SR) break;   // 基音對準，泛音照琴弦的樣子往上偏
    const amp = Math.pow(k, -tilt) * (0.25 + Math.abs(Math.sin(k * Math.PI / 7.6)));       // 琴槌敲在弦的八分之一附近
    const tau = tau1 / (1 + 0.22 * Math.pow(k - 1, 1.15));
    const ph = (k * k * 2.399) % (2 * Math.PI);
    add(fk, amp, tau, ph);
    if (k <= 8) add(fk * 1.0007, amp * 0.55, tau * 1.6, ph + 1.1);  // 第二條弦：差一點點，餘音比較長
  }
  // 琴槌敲下去的那一聲
  let lp = 0, lp2 = 0; const nlen = Math.floor(SR * 0.03);
  for (let i = 0; i < nlen; i++) { const w = Math.random() * 2 - 1; lp += 0.30 * (w - lp); lp2 += 0.04 * (w - lp2); d[i] += (lp - lp2) * 0.3 * (1 - i / nlen) * (1 - i / nlen); }
  const atk = Math.floor(SR * 0.004);
  for (let i = 0; i < atk; i++) d[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / atk);
  const fade = Math.floor(SR * 0.08);
  for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  // 每個音的音量拉齊（看前 0.25 秒的平均能量）
  let sq = 0; const n0 = Math.min(len, Math.floor(SR * 0.25));
  for (let i = 0; i < n0; i++) sq += d[i] * d[i];
  const g = 0.2 / Math.sqrt(sq / n0 || 1);
  for (let i = 0; i < len; i++) d[i] *= g;
  pnoCache[key] = buf; return buf;
}

function pnoPerform(level, mode) {
  const S = PNO_SONG, km = mode || S.keyMode;
  const P = level <= 0 ? { tempo: 0.50, jit: 0.20, run: 0.40, wrong: 0.10, split: 0.070, full: false, pause: [0.15, 0.55], restarts: 2, bars: 8, passes: 1, roll: 0.050 }
    : level === 1 ? { tempo: 0.78, jit: 0.07, run: 0.20, wrong: 0.03, split: 0.028, full: true, pause: [0.00, 0.10], restarts: 2, bars: 16, passes: 2, roll: 0.030 }
      : { tempo: 1.00, jit: 0.008, run: 0.012, wrong: 0, split: 0.004, full: true, pause: [0, 0], restarts: 0, bars: 16, passes: 2, roll: 0.012 };
  const bt = 60 / S.bpm / P.tempo, ev = [];
  let t = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function hit(at, mids, tr, vel, dur, roll) {
    const tier = vel < 0.5 ? 0 : vel < 0.8 ? 1 : 2;
    mids.forEach((m, j) => {
      const top = j === mids.length - 1;
      const v = vel * (top ? 1 : 0.82) * (1 + (Math.random() * 2 - 1) * (level >= 2 ? 0.05 : 0.18));
      ev.push({ t: Math.max(0, at + j * roll), midi: m, tr, gain: 0.62 * Math.pow(v, 1.4), dur, tier });
    });
  }
  // 彈一小節；upto = 只彈到第幾拍就卡住
  function playBar(bi, tr, upto, wrongP) {
    const items = [];
    S.lh[bi].forEach((n, k) => {
      if (P.full) items.push({ b: n[0], d: n[1] * 0.62, m: n[2], h: 'l', sf: bi < S.sfBars && k === 1 });
      else if (n[0] % 1 === 0) items.push({ b: n[0], d: 0.8, m: [n[2][0]], h: 'l', sf: false });   // 第一天左手只按得到低音
    });
    S.rh[bi].forEach((n) => items.push({ b: n[0], d: n[1], m: n[2], h: 'r' }));
    items.sort((a, b) => a.b - b.b || (a.h < b.h ? -1 : 1));
    const isRun = S.rh[bi].length >= 6;                       // 十六分音符多的小節，不熟的時候忽快忽慢
    const start = t; let prev = 0, i = 0, stopped = false;
    while (i < items.length) {
      const b = items[i].b;
      if (b >= upto) { stopped = true; break; }
      t += (b - prev) * bt * (1 + (Math.random() * 2 - 1) * (isRun ? P.run : P.jit)); prev = b;
      while (i < items.length && items[i].b === b) {
        const it = items[i++];
        if (it.h === 'l') {
          const vel = it.sf ? 0.82 : (bi === 15 && it.m.length === 2 && it.b === 1 ? 0.85 : S.lhVel[bi]);
          hit(t + (Math.random() * 2 - 1) * P.split, it.m, tr, vel, it.d * bt, it.m.length > 2 ? P.roll : P.roll * 0.4);
        } else {
          const vel = (bi === 15 && it.m.length === 3) ? 1 : S.rhVel[bi];
          if (Math.random() < wrongP) {
            // 按到隔壁的鍵：先出一個錯音，愣一下，再補上對的
            const off = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
            const bad = it.m.slice(); bad[bad.length - 1] += off;
            hit(t, bad, tr, vel, 0.22, P.roll * 0.3);
            t += bt * rnd(0.45, 1.0);
          }
          hit(t, it.m, tr, vel, it.d * bt, it.m.length > 2 ? P.roll * 0.5 : P.roll * 0.15);
        }
      }
    }
    if (!stopped) t += (2 - prev) * bt;
    return t - start;
  }
  for (let pass = 0; pass < P.passes; pass++) {
    const tr = km === 'both' ? S.keyUp : (pass === 1 ? S.keyUp : 0);
    const hard = (pass === 1 && km !== 'both' && level === 1);     // 第二天：一換調就比較容易錯
    if (pass === 1 && level === 1) t += rnd(0.5, 0.9);              // 換調之前先想一下
    const stops = [];
    for (let i = 0; i < P.restarts; i++) {
      if (level === 1 && Math.random() < 0.35) continue;
      stops.push({ bar: Math.floor(Math.random() * P.bars), upto: [0.5, 1, 1.5][Math.floor(Math.random() * 3)], done: false });
    }
    for (let bi = 0; bi < P.bars; bi++) {
      if (bi > 0) t += rnd(P.pause[0], P.pause[1]);
      const s = stops.find(x => x.bar === bi && !x.done);
      const wp = P.wrong * (hard ? 2 : 1);
      if (s) { s.done = true; playBar(bi, tr, s.upto, wp); t += rnd(0.5, 0.9); }   // 彈到一半卡住，這一小節重來
      playBar(bi, tr, 99, wp);
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return { events: ev, dur: t + 1.6 };
}

function pnoSchedule(ctx, perf, t0, out) {
  const seen = {};   // 先把會用到的音都算好，免得一邊算一邊排、開頭的音擠在一起
  perf.events.forEach((e) => { if (!seen[e.midi]) { seen[e.midi] = 1; pnoBuffer(ctx, e.midi); } });
  const master = ctx.createGain(); master.gain.value = 0.72;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 45;
  master.connect(hp); hp.connect(comp); comp.connect(out);
  // 一點點殘響，像在房間裡彈
  const sr = ctx.sampleRate, il = Math.floor(sr * 1.3), ir = ctx.createBuffer(2, il, sr);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < il; i++) { lp += 0.35 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / il, 2.2) * Math.exp(-i / (sr * 0.35)); } }
  const conv = ctx.createConvolver(); conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.22;
  conv.connect(wet); wet.connect(comp);
  // 三段力度：輕的音悶一點，重的音亮一點
  const tiers = [2600, 4800, 9000].map((fc) => {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = fc; lp.Q.value = 0.5;
    lp.connect(master); lp.connect(conv); return lp;
  });
  const srcs = [];
  perf.events.forEach((e) => {
    const src = ctx.createBufferSource(); src.buffer = pnoBuffer(ctx, e.midi);
    src.playbackRate.value = Math.pow(2, (e.tr || 0) / 12);
    const gn = ctx.createGain(), at = t0 + e.t;
    gn.gain.setValueAtTime(e.gain, at);
    gn.gain.setTargetAtTime(0, at + Math.max(0.08, e.dur), 0.06);          // 放開琴鍵，制音器壓下去
    src.connect(gn); gn.connect(tiers[e.tier]);
    src.start(at); src.stop(at + Math.max(0.08, e.dur) + 0.6);
    srcs.push(src);
  });
  return { dur: perf.dur, stop() {
    try { master.gain.setTargetAtTime(0, ctx.currentTime, 0.03); wet.gain.setTargetAtTime(0, ctx.currentTime, 0.03); } catch (err) { /* ignore */ }
    setTimeout(() => srcs.forEach((s) => { try { s.stop(); } catch (err) { /* ignore */ } }), 200);
  } };
}

/** 彈一次：kind = 'gtr' | 'pno'，level 0..2。out 是要接到的音訊節點。回傳 { dur, stop }。 */
export function playInstrument(ctx, out, kind, level) {
  const perf = kind === 'pno' ? pnoPerform(level) : gtrPerform(level);
  return kind === 'pno' ? pnoSchedule(ctx, perf, ctx.currentTime + 0.15, out) : gtrSchedule(ctx, perf, ctx.currentTime + 0.15, out);
}
/** 只算出要彈多久（測試用，不出聲）。 */
export function performDur(kind, level) { return (kind === 'pno' ? pnoPerform(level) : gtrPerform(level)).dur; }
