// 原創配樂「鉻色脈衝」：參考使用者給的曲子前奏的「概念」重新寫的（不取用原曲的聲音、旋律或樂句）。
// 概念：F 為中心的弗里吉亞屬音階（F G♭ A B♭ C D♭ E♭，暗、帶異國感）、129 BPM、一開始一聲重擊、
// 中音域一直在跑的十六分音符序列、低音 F 持續，慢慢打開濾波器再進鼓。和聲只有 F ↔ G♭（I ↔ ♭II）兩小節一換循環，沒有主旋律。
// 段落：前奏 8 小節（只播一次）→ A 16 小節 → 間奏 8 小節 → B（加咆哮貝斯、更兇）16 小節 → 回到 A 循環。
window.renderPulse = async function (opts = {}) {
  const BPM = 129, SR = 44100, S16 = 60 / BPM / 4, BAR = S16 * 16, BARS = opts.bars || 50;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * BAR * BARS), SR);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const at = (bar, step = 0) => bar * BAR + step * S16;
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const jit = (t, ms) => Math.max(0, t + (rnd() - 0.5) * 2 * ms / 1000);   // 拍點微微前後（像真人／類比機器）
  const vel = (v, r) => v * (1 - r / 2 + rnd() * r);                      // 每一下力道不一樣

  // ---------------------------------------------------------------- 匯流排與效果
  const master = ctx.createGain(); master.gain.value = 0.8;
  const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 30;
  const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 260; mud.Q.value = 1; mud.gain.value = -3;
  const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3200; pres.Q.value = 0.8; pres.gain.value = 2.5;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 7000; air.gain.value = 2.5;
  const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -15; glue.ratio.value = 3; glue.attack.value = 0.008; glue.release.value = 0.12;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.05;
  // 類比感：磁帶的微小音高晃動（wow/flutter）＋輕微飽和＋很小的底噪，避免太乾淨、太「MIDI」
  const tape = ctx.createDelay(0.05); tape.delayTime.value = 0.006;
  const wow = ctx.createOscillator(), wowG = ctx.createGain(); wow.frequency.value = 0.55; wowG.gain.value = 0.00045; wow.connect(wowG); wowG.connect(tape.delayTime); wow.start(0);
  const flut = ctx.createOscillator(), flutG = ctx.createGain(); flut.frequency.value = 6.8; flutG.gain.value = 0.00004; flut.connect(flutG); flutG.connect(tape.delayTime); flut.start(0);
  const sat = (() => { const w = ctx.createWaveShaper(), cv = new Float32Array(4096); for (let i = 0; i < 4096; i++) { const x = i / 2047.5 - 1; cv[i] = Math.tanh(1.5 * x) / Math.tanh(1.5) * 0.98 + 0.02 * x * x; } w.curve = cv; w.oversample = '2x'; return w; })();
  master.connect(tape); tape.connect(sat); sat.connect(hpf); hpf.connect(mud); mud.connect(pres); pres.connect(air); air.connect(glue); glue.connect(lim); lim.connect(ctx.destination);
  const pump = ctx.createGain(); pump.connect(master);
  const drums = ctx.createGain(); drums.gain.value = 0.95; drums.connect(master);
  const noiseBuf = (() => { const b = ctx.createBuffer(2, SR * 2, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return b; })();
  const ir = (sec, decay) => { const n = Math.floor(SR * sec), b = ctx.createBuffer(2, n, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; };
  { const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noiseBuf; n.loop = true; lp.type = 'lowpass'; lp.frequency.value = 6000; g.gain.value = 0.004; n.connect(lp); lp.connect(g); g.connect(master); n.start(0); }   // 底噪
  const verb = ctx.createConvolver(); verb.buffer = ir(2.6, 3); const verbOut = ctx.createGain(); verbOut.gain.value = 0.28; verb.connect(verbOut); verbOut.connect(master);
  const room = ctx.createConvolver(); room.buffer = ir(0.6, 2.2); const roomOut = ctx.createGain(); roomOut.gain.value = 0.4; room.connect(roomOut); roomOut.connect(drums);
  const dIn = ctx.createGain(), dL = ctx.createDelay(2), dR = ctx.createDelay(2), fbL = ctx.createGain(), fbR = ctx.createGain(), dHp = ctx.createBiquadFilter(), mg = ctx.createChannelMerger(2), dOut = ctx.createGain();
  dL.delayTime.value = S16 * 3; dR.delayTime.value = S16 * 3; fbL.gain.value = 0.38; fbR.gain.value = 0.38; dHp.type = 'highpass'; dHp.frequency.value = 500; dOut.gain.value = 0.28;
  dIn.connect(dHp); dHp.connect(dL); dL.connect(fbL); fbL.connect(dR); dR.connect(fbR); fbR.connect(dL); dL.connect(mg, 0, 0); dR.connect(mg, 0, 1); mg.connect(dOut); dOut.connect(pump);
  const shaper = (amt) => { const w = ctx.createWaveShaper(), cv = new Float32Array(4096); for (let i = 0; i < 4096; i++) { const x = i / 2047.5 - 1; cv[i] = Math.tanh(amt * x) / Math.tanh(amt); } w.curve = cv; w.oversample = '4x'; return w; };
  const crusher = (levels) => { const w = ctx.createWaveShaper(), cv = new Float32Array(4096); for (let i = 0; i < 4096; i++) { const x = i / 2047.5 - 1; cv[i] = Math.round(x * levels) / levels; } w.curve = cv; return w; };
  const env = (g, t, a, hold, r, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r); };

  // ---------------------------------------------------------------- 咆哮貝斯（reese：兩個走音的鋸齒波＋方波，濾波器有節奏地開合，再重度失真）
  const growlDist = shaper(5.5), growlCrush = crusher(24), growlPost = ctx.createBiquadFilter(), growlOut = ctx.createGain();
  growlPost.type = 'lowpass'; growlPost.frequency.value = 7000; growlOut.gain.value = 0.26;
  growlDist.connect(growlCrush); growlCrush.connect(growlPost); growlPost.connect(growlOut); growlOut.connect(pump);
  function growl(m, t, dur, shape) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p1 = ctx.createStereoPanner(), p2 = ctx.createStereoPanner();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'square'; o1.frequency.value = mtof(m); o2.frequency.value = mtof(m); o3.frequency.value = mtof(m + 12); o1.detune.value = -16 + (rnd() - 0.5) * 8; o2.detune.value = 16 + (rnd() - 0.5) * 8; o3.detune.value = (rnd() - 0.5) * 6;
    p1.pan.value = -0.5; p2.pan.value = 0.5; const g3 = ctx.createGain(); g3.gain.value = 0.35;
    f.type = 'lowpass'; f.Q.value = 9;
    // 濾波器的開合（咆哮的「嘴形」）：shape 決定一個音裡開合幾次
    const n = shape || 2, seg = dur / n;
    const fv = 0.8 + rnd() * 0.4;
    for (let k = 0; k < n; k++) { const t0 = t + k * seg; f.frequency.setValueAtTime((k % 2 ? 2600 : 380) * fv, t0); f.frequency.exponentialRampToValueAtTime((k % 2 ? 420 : 3200) * fv, t0 + seg * 0.9); }
    env(g, t, 0.004, dur * 0.85, dur * 0.12 + 0.02, 0.9);
    o1.connect(p1); o2.connect(p2); o3.connect(g3); p1.connect(f); p2.connect(f); g3.connect(f); f.connect(g); g.connect(growlDist);
    for (const o of [o1, o2, o3]) { o.start(t); o.stop(t + dur + 0.05); }
  }
  const subG = ctx.createGain(); subG.gain.value = 0.11; subG.connect(pump);
  function sub(m, t, dur) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(m); env(g, t, 0.006, dur * 0.85, 0.05, 1); o.connect(g); g.connect(subG); o.start(t); o.stop(t + dur + 0.1); }

  // ---------------------------------------------------------------- 其他音色
  function pad(notes, t, dur, gain, cut) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.3); g.gain.setValueAtTime(gain, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
    f.connect(g); g.connect(pump); const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(verb);
    for (const m of notes) for (const det of [-14, -5, 6, 15]) {
      const o = ctx.createOscillator(), p = ctx.createStereoPanner(), vg = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det + (rnd() - 0.5) * 6; p.pan.value = det / 20; vg.gain.value = 0.25 / notes.length;
      const dr = ctx.createOscillator(), dg = ctx.createGain(); dr.frequency.value = 0.1 + rnd() * 0.3; dg.gain.value = 3 + rnd() * 4; dr.connect(dg); dg.connect(o.detune); dr.start(t); dr.stop(t + dur + 0.5);   // 類比的音高漂移
      o.connect(vg); vg.connect(p); p.connect(f); o.start(t); o.stop(t + dur + 0.5);
    }
  }
  function pluck(m, t, v = 1) {
    t = jit(t, 5); v = vel(v, 0.35);
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = mtof(m); o.detune.value = (rnd() - 0.5) * 10;
    const fc = 4000 + rnd() * 3000; f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(fc, t); f.frequency.exponentialRampToValueAtTime(600 + rnd() * 300, t + 0.1 + rnd() * 0.05);
    env(g, t, 0.001, 0.01, 0.11 + rnd() * 0.05, 0.12 * v); o.connect(f); f.connect(g); g.connect(pump); const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(dIn); o.start(t); o.stop(t + 0.2);
  }
  let leadPrev = null;
  function lead(m, t, dur, bend) {
    const f = ctx.createBiquadFilter(), d = shaper(2.2), g = ctx.createGain(); f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(2200, t); f.frequency.linearRampToValueAtTime(4800, t + 0.06);
    env(g, t, 0.01, dur - 0.02, 0.2, 0.17); f.connect(d); d.connect(g); g.connect(pump);
    const sv = ctx.createGain(); sv.gain.value = 0.35; g.connect(sv); sv.connect(verb); const sd = ctx.createGain(); sd.gain.value = 0.3; g.connect(sd); sd.connect(dIn);
    for (const det of [-10, 0, 10]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      if (leadPrev !== null && Math.abs(leadPrev - m) <= 5) { o.frequency.setValueAtTime(mtof(leadPrev), t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.06); } else o.frequency.value = mtof(m);
      if (bend) o.frequency.setTargetAtTime(mtof(m - 1), t + dur * 0.6, dur * 0.15);   // 尾巴往下滑半音：不安
      o.detune.value = det; const vg = ctx.createGain(); vg.gain.value = 0.4; o.connect(vg); vg.connect(f); o.start(t); o.stop(t + dur + 0.25);
    }
    leadPrev = m;
  }
  function kick(t, v = 1) {
    t = jit(t, 1.5); v = vel(v, 0.1);
    const o = ctx.createOscillator(), g = ctx.createGain(), d = shaper(2.6); o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    env(g, t, 0.002, 0.07, 0.32, 0.95 * v); o.connect(d); d.connect(g); g.connect(drums); o.start(t); o.stop(t + 0.5);
    const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 3000; env(ng, t, 0.001, 0.002, 0.015, 0.35 * v); n.connect(hp); hp.connect(ng); ng.connect(drums); n.start(t, rnd()); n.stop(t + 0.04);
    pump.gain.setValueAtTime(0.28, t); pump.gain.setTargetAtTime(1, t + 0.03, 0.09);
  }
  function snare(t, v = 1) {   // 工業感的大軍鼓：噪音＋鼓身＋拍手＋金屬聲
    t = jit(t, 3); v = vel(v, 0.15);
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), d = shaper(3); n.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.6;
    env(g, t, 0.001, 0.02, 0.22, 0.85 * v); n.connect(bp); bp.connect(d); d.connect(g); g.connect(drums); n.start(t, rnd()); n.stop(t + 0.35);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.07); env(og, t, 0.001, 0.015, 0.1, 0.7 * v); o.connect(og); og.connect(drums); o.start(t); o.stop(t + 0.16);
    for (const dt of [0, 0.009, 0.019]) { const c = ctx.createBufferSource(), cf = ctx.createBiquadFilter(), cg = ctx.createGain(); c.buffer = noiseBuf; cf.type = 'bandpass'; cf.frequency.value = 1200; cf.Q.value = 1.4; env(cg, t + dt, 0.001, 0.004, 0.06, 0.45 * v); c.connect(cf); cf.connect(cg); cg.connect(drums); c.start(t + dt, rnd()); c.stop(t + dt + 0.1); }
    metal(t, 0.5 * v, 820);
    const s = ctx.createGain(); s.gain.value = 0.7 * v; g.connect(s); s.connect(room); const s2 = ctx.createGain(); s2.gain.value = 0.2 * v; g.connect(s2); s2.connect(verb);
  }
  function metal(t, v = 1, base = 1500) {   // 金屬敲擊（FM）
    t = jit(t, 7); v = vel(v, 0.4); base *= 0.97 + rnd() * 0.06;
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), hp = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
    c.type = 'square'; m.type = 'sine'; c.frequency.value = base; m.frequency.value = base * 1.414; mg.gain.setValueAtTime(base * 3, t); mg.gain.exponentialRampToValueAtTime(base * 0.2, t + 0.12);
    hp.type = 'highpass'; hp.frequency.value = 600; p.pan.value = (rnd() - 0.5) * 0.8; env(g, t, 0.001, 0.005, 0.14, 0.11 * v);
    m.connect(mg); mg.connect(c.frequency); c.connect(hp); hp.connect(g); g.connect(p); p.connect(drums); const s = ctx.createGain(); s.gain.value = 0.35; g.connect(s); s.connect(dIn);
    for (const o of [c, m]) { o.start(t); o.stop(t + 0.2); }
  }
  function hat(t, open, v = 1) { t = jit(t, 6); v = vel(v, 0.45); const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner(); n.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = open ? 7500 : 9500; p.pan.value = open ? -0.25 : 0.3; env(g, t, 0.001, 0.004, open ? 0.2 : 0.03, (open ? 0.32 : 0.24) * v); n.connect(hp); hp.connect(g); g.connect(p); p.connect(drums); n.start(t, rnd()); n.stop(t + 0.25); }
  function glitch(t, dur) {   // 數位故障：很快的連打
    for (let k = 0; k < 8; k++) { const tt = t + k * dur / 8, n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 900 + k * 500; bp.Q.value = 5; env(g, tt, 0.001, 0.005, dur / 10, 0.3); n.connect(bp); bp.connect(g); g.connect(drums); n.start(tt, rnd()); n.stop(tt + dur / 8 + 0.02); }
  }
  function impact(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2); env(g, t, 0.001, 0.05, 1.4, 0.9 * v); o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.6);
    const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noiseBuf; lp.type = 'lowpass'; lp.frequency.value = 2200; env(ng, t, 0.001, 0.03, 0.9, 0.7 * v); n.connect(lp); lp.connect(ng); ng.connect(master); const s = ctx.createGain(); s.gain.value = 0.7; ng.connect(s); s.connect(verb); n.start(t); n.stop(t + 1.1);
    metal(t, 1.2 * v, 640);
  }
  function riser(t, dur) {
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noiseBuf; n.loop = true; bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(10000, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03);
    n.connect(bp); bp.connect(g); g.connect(master); n.start(t); n.stop(t + dur + 0.1);
    const o = ctx.createOscillator(), og = ctx.createGain(), d = shaper(3); o.type = 'sawtooth'; o.frequency.setValueAtTime(mtof(36), t); o.frequency.exponentialRampToValueAtTime(mtof(72), t + dur);   // 警報般往上滑
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.06, t + dur); og.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03); o.connect(d); d.connect(og); og.connect(master); o.start(t); o.stop(t + dur + 0.1);
  }
  function siren(t, dur) {   // 間奏裡的警報聲：兩個走音的鋸齒波上下滑
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 25;
    for (const x of [o, o2]) { x.frequency.setValueAtTime(mtof(67), t); for (let k = 0; k < 4; k++) { x.frequency.linearRampToValueAtTime(mtof(k % 2 ? 67 : 73), t + dur * (k + 1) / 4); } }
    f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.5; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(pump); const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(verb);
    for (const x of [o, o2]) { x.start(t); x.stop(t + dur + 0.05); }
  }

  // ---------------------------------------------------------------- 這首另外的音色
  const rollDrive = shaper(3.4), rollOut = ctx.createGain(); rollOut.gain.value = 0.2; rollDrive.connect(rollOut); rollOut.connect(pump);
  function roll(m, t, accent) {   // 十六分音符滾動貝斯
    t = jit(t, 2);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = mtof(m); o2.frequency.value = mtof(m); o1.detune.value = (rnd() - 0.5) * 8; o2.detune.value = -9 + (rnd() - 0.5) * 6;
    const fc = (accent ? 3600 : 2400) * (0.85 + rnd() * 0.3); f.type = 'lowpass'; f.Q.value = 5; f.frequency.setValueAtTime(fc, t); f.frequency.exponentialRampToValueAtTime(380, t + S16 * 0.85);
    env(g, t, 0.003, S16 * 0.5, S16 * 0.4, vel(accent ? 0.95 : 0.75, 0.15));
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(rollDrive); for (const o of [o1, o2]) { o.start(t); o.stop(t + S16 + 0.05); }
  }
  function seq(m, t, cut, v = 1) {   // 中音域的十六分音符序列（質感，不是旋律）
    t = jit(t, 4); v = vel(v, 0.3);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m); o.detune.value = (rnd() - 0.5) * 10; o2.detune.value = 7 + (rnd() - 0.5) * 6; p.pan.value = (rnd() - 0.5) * 0.5;
    f.type = 'lowpass'; f.Q.value = 7; f.frequency.setValueAtTime(cut * (0.9 + rnd() * 0.2), t); f.frequency.exponentialRampToValueAtTime(Math.max(300, cut * 0.18), t + 0.11 + rnd() * 0.03);
    env(g, t, 0.002, 0.012, 0.12, 0.14 * v); o.connect(f); o2.connect(f); f.connect(g); g.connect(p); p.connect(pump);
    const sd = ctx.createGain(); sd.gain.value = 0.5; g.connect(sd); sd.connect(dIn); const sv = ctx.createGain(); sv.gain.value = 0.18; g.connect(sv); sv.connect(verb);
    for (const x of [o, o2]) { x.start(t); x.stop(t + 0.2); }
  }

  // ---------------------------------------------------------------- 編曲
  const CH = [ // F（I）兩小節 ↔ G♭（♭II）兩小節
    { r: 29, drone: [41, 48, 53, 57, 60], seq: [65, 72, 69, 72, 65, 72, 69, 77, 65, 72, 69, 72, 66, 72, 69, 77] },
    { r: 30, drone: [42, 49, 54, 58, 61], seq: [66, 73, 70, 73, 66, 73, 70, 78, 66, 73, 70, 73, 65, 73, 70, 78] },
  ];
  const sec = (b) => { const k = b < 48 ? b : 8 + (b - 48); return k < 8 ? ['intro', k] : k < 24 ? ['A', k - 8] : k < 32 ? ['brk', k - 24] : ['B', k - 32]; };
  impact(at(0));
  for (let b = 0; b < BARS; b++) {
    const [name, i] = sec(b), q = b % 4, t = at(b), full = name === 'A' || name === 'B', ch = CH[q >= 2 ? 1 : 0], R = ch.r;
    // 低音持續（兩小節一個）
    if (q % 2 === 0) pad(ch.drone, t, BAR * 2, name === 'intro' ? 0.07 : name === 'brk' ? 0.08 : 0.05, name === 'intro' ? 800 + i * 160 : name === 'brk' ? 2000 : 1600);
    // 序列：前奏濾波器慢慢打開
    const cut = name === 'intro' ? 700 + i * 520 : name === 'brk' ? (i < 4 ? 1400 : 1400 + (i - 3) * 600) : name === 'B' ? 5200 : 4200;
    for (let s = 0; s < 16; s++) seq(ch.seq[s] + (name === 'B' && (b % 2) && s >= 8 ? 12 : 0), at(b, s), cut, name === 'intro' && i < 2 ? 0.7 : 1);
    // 低音：前奏是持續的 F，之後是十六分音符滾動貝斯
    if ((name === 'intro' && i >= 2) || (name === 'brk' && i < 4)) sub(R + 12, t, BAR);
    if (full || (name === 'intro' && i >= 4) || (name === 'brk' && i >= 4)) { for (let s = 0; s < 16; s++) roll(R + 12 + (s % 4 === 2 ? 12 : 0), at(b, s), s % 4 === 0); sub(R + 12, t, BAR); }
    if (name === 'B' && b % 2 === 1) { growl(R + 24, at(b, 8), S16 * 6, 4); }   // B 段：每兩小節後半一聲咆哮
    // 鼓
    if (full || (name === 'brk' && i >= 4)) {
      for (let s = 0; s < 16; s += 4) kick(at(b, s));
      snare(at(b, 4), 0.95); snare(at(b, 12), 1);
      for (let s = 0; s < 16; s++) hat(at(b, s), s % 4 === 2, s % 2 ? 0.75 : 0.5);
      if (name === 'B') for (const s of [3, 7, 11, 15]) metal(at(b, s), 0.8, 1450 + q * 90);
      if (full && i % 8 === 0) impact(t, 0.45);
      if (full && i % 8 === 7) glitch(at(b, 12), S16 * 4);
    } else if (name === 'intro' && i >= 4) { kick(at(b, 0), 0.75); kick(at(b, 8), 0.65); for (let s = 2; s < 16; s += 4) hat(at(b, s), true, 0.55); }
    else if (name === 'brk') { for (const s of [6, 14]) metal(at(b, s), 0.7, 1150); }
    if ((name === 'intro' || name === 'brk') && i === 7) for (let s = 8; s < 16; s++) snare(at(b, s), 0.3 + (s - 8) * 0.08);
    if (name === 'brk' && i === 0) siren(t, BAR * 4);
    if ((name === 'intro' && i === 6) || (name === 'brk' && i === 6)) riser(t, BAR * 2);
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  const bytes = new Uint8Array(out.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return { b64: btoa(bin), peak, sec: n / SR, bar: BAR };
};
