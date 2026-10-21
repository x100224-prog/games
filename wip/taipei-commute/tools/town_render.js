// 原創配樂「小巷裡的祕密」（在家時的配樂）：照使用者描述的風格寫的 —— 1990 年代日式奇幻 RPG 的城鎮曲，
// 輕鬆、好奇、帶一點神祕，淡淡的爵士融合味。旋律、和聲、編曲都是原創，不取用任何現成曲子的聲音或樂句。
//   樂器：長笛主旋律（短而好記的樂句）、靈活的指彈電貝斯（很突出）、柔和的電鋼琴、鐵琴點綴、溫暖的弦樂墊、
//         輕巧的切分節奏和細碎的腳踏鈸。（使用者要求拿掉木吉他那一軌）
//   和聲：D 多利亞為主（Dm9、G13、B♭maj7♯11、A7sus4→A7♭9），中間借 Gm9、E♭maj7♯11 轉暗；
//         B 段轉到 F 大調一帶再走 E♭、D♭ 的調式色彩（大調、小調交錯），最後 C7♭9 回到主題。
//   段落：前奏 4 小節（只播一次）→ A 8 → A' 8 → B（對比的中段）8 → A' 8（主題回來）→ 循環。100 BPM。
//   聲音：模仿超任（SNES）取樣音源 —— 樂器先過低通、整體降位元、加超任式的回音和大空間殘響。
// 用法：在瀏覽器頁面裡 await window.renderTown() 取得 AudioBuffer；tests/render_town.mjs 會存成 web/audio/home.mp3。
window.TOWN = { BPM: 100, INTRO: 4, LOOP: 32, LOOP_BARS: [6, 38] };
window.renderTown = async function (opts = {}) {
  const BPM = 100, SR = 44100, S16 = 60 / BPM / 4, BAR = S16 * 16, T = window.TOWN;
  // 循環：前奏後的 32 小節，最後再接 5 小節的 A（跟循環開頭完全一樣，連人彈的微小誤差都一樣）。
  // 遊戲從第 6 小節循環到第 38 小節：兩端前面兩小節的內容一模一樣，殘響、回音也就一模一樣，接起來不會有縫。
  const TAIL = 5, BARS = T.INTRO + T.LOOP + TAIL;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * BAR * BARS), SR);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let seed = 20261021;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const reseed = (k) => { seed = 1 + (k * 7919 + 104729) % 2147483646; for (let i = 0; i < 3; i++) rnd(); };   // 每小節依「段落、第幾小節」重設，同一段落每次都彈得一模一樣
  const rnd2 = (() => { let z = 777; return () => (z = (z * 16807) % 2147483647) / 2147483647; })();          // 音色（雜訊、殘響）用另一組，不影響上面
  const swing = (step) => (step % 2 === 1 ? S16 * 0.14 : 0);              // 十六分音符的後半拍稍微拖一點（爵士味）
  const at = (bar, step = 0) => bar * BAR + step * S16 + swing(step);
  const hum = (t, ms) => Math.max(0, t + (rnd() - 0.5) * 2 * ms / 1000);   // 人在彈的微小前後

  // ---------------------------------------------------------------- 匯流排、超任式的回音和殘響
  const master = ctx.createGain(); master.gain.value = 0.9;
  const crush = ctx.createWaveShaper(); { const n = 8192, cv = new Float32Array(n), q = 1536; for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.round(Math.tanh(1.15 * x) / Math.tanh(1.15) * q) / q; } crush.curve = cv; }   // 降位元＋一點飽和
  const snesLp = ctx.createBiquadFilter(); snesLp.type = 'lowpass'; snesLp.frequency.value = 12500; snesLp.Q.value = 0.5;   // 超任 32 kHz 取樣的高頻比較圓
  const snesLp2 = ctx.createBiquadFilter(); snesLp2.type = 'lowpass'; snesLp2.frequency.value = 14500; snesLp2.Q.value = 0.4;
  const warm = ctx.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 180; warm.gain.value = 2;
  const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -16; glue.ratio.value = 2.5; glue.attack.value = 0.01; glue.release.value = 0.2;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
  master.connect(warm); warm.connect(crush); crush.connect(snesLp); snesLp.connect(snesLp2); snesLp2.connect(glue); glue.connect(lim); lim.connect(ctx.destination);
  // 超任的回音：一個有濾波的回授延遲（像 SNES DSP 的 echo），再加一個大空間殘響
  const echoIn = ctx.createGain(), echo = ctx.createDelay(1), echoFb = ctx.createGain(), echoLp = ctx.createBiquadFilter(), echoOut = ctx.createGain();
  echo.delayTime.value = BAR / 8 * 1.5;   // 附點八分
  echoLp.type = 'lowpass'; echoLp.frequency.value = 2600; echoFb.gain.value = 0.38; echoOut.gain.value = 0.42;
  echoIn.connect(echo); echo.connect(echoLp); echoLp.connect(echoFb); echoFb.connect(echo); echoLp.connect(echoOut); echoOut.connect(master);
  const verb = ctx.createConvolver(); {
    const n = Math.floor(SR * 3.4), b = ctx.createBuffer(2, n, SR);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { lp += 0.45 * ((rnd2() * 2 - 1) - lp); const tt = i / SR; d[i] = lp * Math.exp(-tt / 0.95) * (tt < 0.012 ? tt / 0.012 : 1); } }
    verb.buffer = b;
  }
  const verbIn = ctx.createGain(), verbOut = ctx.createGain(); verbOut.gain.value = 0.55; const verbHp = ctx.createBiquadFilter(); verbHp.type = 'highpass'; verbHp.frequency.value = 220;
  verbIn.connect(verbHp); verbHp.connect(verb); verb.connect(verbOut); verbOut.connect(master);
  const pan = (p) => { const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(master); return s; };
  const send = (node, rv, ec) => { if (rv) { const g = ctx.createGain(); g.gain.value = rv; node.connect(g); g.connect(verbIn); } if (ec) { const g = ctx.createGain(); g.gain.value = ec; node.connect(g); g.connect(echoIn); } };
  const busFlute = pan(0.05), busBass = pan(0), busEp = pan(0.3), busGlock = pan(0.42), busStr = pan(0), busDr = pan(0), busHat = pan(0.25);
  const noise = (() => { const b = ctx.createBuffer(1, SR * 2, SR), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd2() * 2 - 1; return b; })();

  // ---------------------------------------------------------------- 樂器（像取樣音源：每種都先過自己的低通）
  function flute(t, m, dur, v = 1) {
    const f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.12;
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.3; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(0, t + 0.22); vg.gain.linearRampToValueAtTime(13, t + Math.max(0.3, Math.min(0.6, dur)));
    vib.connect(vg); vg.connect(o.detune); vg.connect(o2.detune);
    lp.type = 'lowpass'; lp.frequency.value = 3800;
    const end = t + dur, pk = 0.2 * v;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.05); g.gain.linearRampToValueAtTime(pk * 0.82, t + 0.18);
    g.gain.setValueAtTime(pk * 0.8, Math.max(t + 0.19, end - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.14);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(busFlute); send(lp, 0.5, 0.32);
    // 吹氣聲：音頭比較明顯，整個音也帶一點點氣
    const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noise; n.loop = true;
    nf.type = 'bandpass'; nf.frequency.value = Math.min(9000, f * 3); nf.Q.value = 0.9;
    ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.028 * v, t + 0.025); ng.gain.exponentialRampToValueAtTime(0.006 * v, t + 0.14); ng.gain.setValueAtTime(0.006 * v, end); ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.1);
    n.connect(nf); nf.connect(ng); ng.connect(busFlute); n.start(t, rnd()); n.stop(end + 0.15);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(end + 0.2); }
  }
  // 指彈電貝斯：圓潤的撥弦（低通隨時間關起來）＋正弦低音，ghost 音短而悶
  function bass(t, m, dur, v = 1, ghost = false) {
    const f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f;
    const og = ctx.createGain(); og.gain.value = ghost ? 0.15 : 0.32; const o2g = ctx.createGain(); o2g.gain.value = 0.85;
    lp.type = 'lowpass'; lp.Q.value = 2.2; lp.frequency.setValueAtTime(ghost ? 500 : 1700 + v * 700, t); lp.frequency.exponentialRampToValueAtTime(ghost ? 220 : 420, t + Math.min(0.35, dur));
    const end = t + (ghost ? 0.07 : dur), pk = (ghost ? 0.18 : 0.42) * v;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.006); g.gain.exponentialRampToValueAtTime(pk * 0.55, t + 0.25); g.gain.setValueAtTime(pk * 0.5, Math.max(t + 0.26, end - 0.03)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);
    o.connect(og); og.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(g); g.connect(busBass); send(g, 0.06, 0);
    // 手指碰弦的一點點聲音
    const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noise; nf.type = 'bandpass'; nf.frequency.value = 1200; nf.Q.value = 1;
    ng.gain.setValueAtTime(0.02 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03); n.connect(nf); nf.connect(ng); ng.connect(busBass); n.start(t, rnd()); n.stop(t + 0.04);
    for (const x of [o, o2]) { x.start(t); x.stop(end + 0.1); }
  }
  // 柔和的電鋼琴：FM（載波：調變 1:1，調變量很快變小）＋一點琴槌的高音，左右顫音
  function ep(t, notes, dur, v = 1) {
    const out = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const trem = ctx.createOscillator(), tg = ctx.createGain(), tb = ctx.createGain(); trem.frequency.value = 4.6; tg.gain.value = 0.16; tb.gain.value = 1;
    trem.connect(tg); tg.connect(tb.gain); out.connect(tb); tb.connect(lp); lp.connect(busEp); send(lp, 0.35, 0.1);
    const end = t + dur;
    notes.forEach((m, j) => {
      const s = hum(t, 6) + j * 0.004, f = mtof(m), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      car.type = 'sine'; mod.type = 'sine'; car.frequency.value = f; mod.frequency.value = f;
      mg.gain.setValueAtTime(f * 1.4, s); mg.gain.exponentialRampToValueAtTime(f * 0.18, s + 0.5); mod.connect(mg); mg.connect(car.frequency);
      const tine = ctx.createOscillator(), tgn = ctx.createGain(); tine.type = 'sine'; tine.frequency.value = f * 7.1; tgn.gain.setValueAtTime(0.03 * v, s); tgn.gain.exponentialRampToValueAtTime(0.0001, s + 0.12); tine.connect(tgn); tgn.connect(out);
      const pk = 0.085 * v; g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(pk, s + 0.006); g.gain.exponentialRampToValueAtTime(pk * 0.45, s + 0.9); g.gain.setValueAtTime(pk * 0.45, Math.max(s + 0.91, end)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
      car.connect(g); g.connect(out);
      for (const x of [car, mod, tine]) { x.start(s); x.stop(end + 0.3); }
    });
    trem.start(t); trem.stop(end + 0.3);
  }
  // 鐵琴：清脆的金屬泛音，很快消失
  function glock(t, m, v = 1) {
    const f = mtof(m), g = ctx.createGain();
    for (const [r, a, d] of [[1, 1, 1.3], [2.76, 0.32, 0.35], [5.4, 0.12, 0.14]]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * r;
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(a, t + 0.002); og.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(og); og.connect(g); o.start(t); o.stop(t + d + 0.05);
    }
    g.gain.value = 0.07 * v; g.connect(busGlock); send(g, 0.55, 0.3);
  }
  // 溫暖的弦樂墊：去諧的鋸齒波過低通、慢慢出來
  function strings(t, notes, dur, v = 1) {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.4;
    const pk = 0.03 * v; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.7); g.gain.setValueAtTime(pk, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    lp.connect(g); g.connect(busStr); send(g, 0.6, 0);
    for (const m of notes) for (const det of [-7, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.7); }
  }
  // 鼓：輕的大鼓、邊擊（side stick）、細碎的腳踏鈸
  function kick(t, v = 1) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(busDr); o.start(t); o.stop(t + 0.32); }
  function rim(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = 1750; bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(bp); bp.connect(g); g.connect(busDr); send(g, 0.2, 0); o.start(t); o.stop(t + 0.07);
    const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noise; nf.type = 'highpass'; nf.frequency.value = 3000; ng.gain.setValueAtTime(0.05 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); n.connect(nf); nf.connect(ng); ng.connect(busDr); n.start(t, rnd()); n.stop(t + 0.05);
  }
  function hat(t, v = 1, open = false) {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noise; f.type = 'highpass'; f.frequency.value = open ? 6500 : 8200;
    const d = open ? 0.26 : 0.035; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime((open ? 0.06 : 0.05) * v, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f); f.connect(g); g.connect(busHat); n.start(t, rnd() * 1.5); n.stop(t + d + 0.02);
  }

  // ---------------------------------------------------------------- 和聲（根音、去掉根音的爵士和聲配置、性質）
  const C = {
    Dm9: { r: 38, v: [53, 57, 60, 64], q: 'm' }, G13: { r: 43, v: [53, 59, 64, 69], q: '7' }, 'Bbmaj7#11': { r: 46, v: [57, 62, 64, 69], q: 'M' },
    A7sus: { r: 45, v: [55, 62, 64, 67], q: 's' }, A7b9: { r: 45, v: [55, 61, 64, 70], q: '7' }, Gm9: { r: 43, v: [53, 57, 58, 62], q: 'm' },
    'Ebmaj7#11': { r: 39, v: [55, 58, 62, 69], q: 'M' }, Fmaj7: { r: 41, v: [52, 57, 60, 64], q: 'M' }, Em7b5: { r: 40, v: [50, 55, 58, 62], q: 'h' },
    Ebmaj7: { r: 39, v: [55, 58, 62, 67], q: 'M' }, Dbmaj7: { r: 37, v: [53, 56, 60, 63], q: 'M' }, C7sus: { r: 36, v: [53, 58, 62, 67], q: 's' },
    Am7: { r: 45, v: [55, 60, 64, 67], q: 'm' }, Bbmaj7: { r: 46, v: [57, 62, 65, 69], q: 'M' }, C9sus: { r: 36, v: [53, 58, 62, 64], q: 's' }, C7b9: { r: 36, v: [52, 58, 61, 64], q: '7' },
  };
  const third = (q) => (q === 'm' || q === 'h' ? 3 : q === 's' ? 5 : 4), seventh = (q) => (q === 'M' ? 11 : 10), fifth = (q) => (q === 'h' ? 6 : 7);
  const SEC = {
    intro: [['Dm9'], ['G13'], ['Bbmaj7#11'], ['A7sus', 'A7b9']],
    A: [['Dm9'], ['G13'], ['Bbmaj7#11'], ['A7sus', 'A7b9'], ['Dm9'], ['Gm9'], ['Ebmaj7#11'], ['A7sus', 'A7b9']],
    A2: [['Dm9'], ['G13'], ['Bbmaj7#11'], ['A7sus', 'A7b9'], ['Fmaj7'], ['Em7b5', 'A7b9'], ['Dm9'], ['Dm9']],
    B: [['Fmaj7'], ['Ebmaj7'], ['Dbmaj7'], ['C7sus'], ['Am7'], ['Bbmaj7'], ['C9sus'], ['C7b9']],
  };
  // 長笛主旋律（原創）：每小節 [十六分音符位置, MIDI, 長度]
  const MEL = {
    A: [
      [[2, 69, 2], [4, 74, 2], [6, 76, 1], [7, 77, 3], [10, 76, 2], [12, 72, 4]],
      [[0, 74, 3], [3, 71, 1], [4, 69, 4], [12, 76, 2], [14, 77, 2]],
      [[0, 79, 3], [3, 77, 1], [4, 76, 2], [6, 74, 2], [8, 76, 6]],
      [[0, 74, 4], [4, 73, 2], [6, 76, 2], [8, 81, 6]],
      [[2, 69, 2], [4, 74, 2], [6, 76, 1], [7, 77, 3], [10, 81, 2], [12, 79, 4]],
      [[0, 77, 3], [3, 74, 1], [4, 70, 4], [12, 69, 2], [14, 70, 2]],
      [[0, 79, 2], [2, 81, 2], [4, 82, 4], [8, 79, 2], [10, 77, 2], [12, 74, 4]],
      [[0, 76, 4], [4, 74, 2], [6, 73, 2], [8, 76, 8]],
    ],
    A2end: [
      [[2, 69, 2], [4, 72, 2], [6, 76, 1], [7, 79, 3], [10, 77, 2], [12, 76, 4]],
      [[0, 74, 3], [3, 70, 1], [4, 73, 4], [8, 76, 4], [12, 79, 4]],
      [[0, 77, 6], [6, 76, 2], [8, 74, 8]],
      [],
    ],
    B: [
      [[0, 84, 4], [4, 81, 2], [6, 79, 2], [8, 76, 8]],
      [[0, 82, 4], [4, 79, 2], [6, 77, 2], [8, 74, 8]],
      [[0, 80, 4], [4, 77, 2], [6, 75, 2], [8, 72, 6], [14, 75, 2]],
      [[0, 77, 6], [6, 79, 2], [8, 82, 8]],
      [[0, 84, 3], [3, 81, 1], [4, 79, 4], [8, 76, 4], [12, 79, 4]],
      [[0, 77, 4], [4, 74, 4], [8, 81, 6], [14, 79, 2]],
      [[0, 77, 4], [4, 79, 2], [6, 81, 2], [8, 82, 4], [12, 81, 4]],
      [[0, 79, 4], [4, 76, 2], [6, 73, 2], [8, 76, 4], [12, 69, 4]],
    ],
  };
  const melFor = (name, i) => name === 'B' ? MEL.B[i] : (name === 'A2' && i >= 4 ? MEL.A2end[i - 4] : MEL.A[i]);

  // ---------------------------------------------------------------- 排出整首
  const plan = [];   // [段落, 第幾小節]
  for (let i = 0; i < 4; i++) plan.push(['intro', i]);
  for (const s of ['A', 'A2', 'B', 'A2']) for (let i = 0; i < 8; i++) plan.push([s, i]);
  for (let i = 0; i < TAIL; i++) plan.push(['A', i]);   // 尾巴：跟循環開頭一樣的 A
  const SKEY = { intro: 1, A: 2, A2: 3, B: 4 };
  plan.forEach(([name, i], bar) => {
    reseed(SKEY[name] * 100 + i + (name === 'A2' && bar >= 28 ? 50 : 0));   // 主題回來的那一段（第二個 A'）稍微不一樣
    const chs = SEC[name][i].map(k => C[k]), ch0 = chs[0], chAt = (s) => (chs.length > 1 && s >= 8 ? chs[1] : ch0);
    const nextName = plan[bar + 1] ? plan[bar + 1][0] : 'A', nextI = plan[bar + 1] ? plan[bar + 1][1] : 0, next = C[SEC[nextName][nextI][0]];
    const isB = name === 'B', intro = name === 'intro', last = false, v = 1;
    // 電鋼琴：A 段切分的短和弦，B 段長的
    if (isB) { ep(at(bar, 0), chs[0].v, BAR * 0.62, 0.9 * v); ep(at(bar, 10), chAt(10).v, BAR * 0.33, 0.6 * v); }
    else for (const [s, len, vv] of [[0, 3, 0.85], [6, 2, 0.6], [11, 3, 0.7]]) ep(at(bar, s), chAt(s).v, S16 * len, vv * (intro ? 0.8 : 1) * v);
    // 弦樂墊
    if (!(intro && i < 2)) strings(at(bar, 0), chs[0].v.map(m => m - 12).concat([chs[0].v[3]]), BAR * (chs.length > 1 ? 0.5 : 1), (isB ? 1.4 : 0.8) * v);
    if (chs.length > 1 && !(intro && i < 2)) strings(at(bar, 8), chs[1].v.map(m => m - 12).concat([chs[1].v[3]]), BAR * 0.5, (isB ? 1.4 : 0.8) * v);
    // 電貝斯（很突出、很靈活）：前奏第三小節才進來
    if (!(intro && i < 2)) {
      const pat = isB
        ? [[0, 'r', 6, 1], [6, '5', 2, 0.8], [8, 'o', 3, 0.9], [11, '7', 1, 0.6], [12, '3o', 2, 0.75], [14, 'ap', 2, 0.85]]
        : [[0, 'r', 3, 1], [3, 'o', 1, 0.7], [4, '5', 2, 0.85], [6, 'g', 1, 0.5], [7, '7', 2, 0.8], [10, 'r', 2, 0.9], [12, '5', 1, 0.65], [13, 'o', 1, 0.75], [14, 'ap', 2, 0.85]];
      for (const [s, kind, len, vv] of pat) {
        const c = chAt(s), r = c.r;
        let m = kind === 'r' ? r : kind === 'o' ? r + 12 : kind === '5' ? r + fifth(c.q) : kind === '7' ? r + seventh(c.q) : kind === '3o' ? r + 12 + third(c.q) : kind === 'g' ? r + 12 : next.r + (rnd() < 0.5 ? -1 : 1);
        if (kind === 'ap' && chs.length > 1 && s >= 8) m = next.r - 1;
        if (!isB && kind === '5' && s === 12 && rnd() < 0.35) { bass(hum(at(bar, 12), 4), r + third(c.q), S16 * 0.9, 0.6 * v); continue; }   // 偶爾換成三度的小過門
        bass(hum(at(bar, s), 4), m, S16 * len * 0.92, vv * v, kind === 'g');
      }
    }
    // 鼓：A 段輕的切分；B 段半拍感；前奏只有腳踏鈸
    if (!intro || i >= 2) {
      for (let s = 0; s < 16; s++) { if (isB && s % 2) continue; hat(hum(at(bar, s), 3), (s % 4 === 2 ? 1 : s % 2 === 0 ? 0.75 : 0.45) * (intro ? 0.6 : 1) * v, !isB && s === 14 && i % 4 === 3); }
    }
    if (!intro) {
      if (isB) { kick(at(bar, 0), 0.8 * v); kick(at(bar, 10), 0.55 * v); rim(at(bar, 8), 0.9 * v); }
      else { kick(at(bar, 0), 0.85 * v); kick(at(bar, 7), 0.45 * v); kick(at(bar, 10), 0.6 * v); rim(at(bar, 4), 0.8 * v); rim(at(bar, 12), 0.8 * v); if (rnd() < 0.4) rim(at(bar, 15), 0.3 * v); }
    }
    // 長笛主旋律；B 段鐵琴疊高八度
    if (!intro && !last) for (const [s, m, len] of melFor(name, i)) { flute(hum(at(bar, s), 6), m, S16 * len, 1); if (isB) glock(at(bar, s), m + 12, 0.45); }
    // 鐵琴點綴：樂句的空檔撒一串亮亮的音
    if ((intro && i === 3) || (!isB && !intro && !last && (i === 3 || i === 7) && name !== 'A2') || (name === 'A2' && i === 7 && !last)) {
      const c = chAt(8); [0, 1, 2, 3, 2, 3].forEach((k, j) => glock(at(bar, 8 + j), c.v[k] + 24, 0.7 - j * 0.06));
    }
    if (bar === 0) glock(0, 76 + 12, 0.8);   // 曲子一開始的一聲（也讓遊戲找得到第 0 秒）
  });
  return ctx.startRendering();
};
