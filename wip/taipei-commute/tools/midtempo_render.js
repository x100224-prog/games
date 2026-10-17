// 原創配樂「鋼鐵雨夜」：aggressive midtempo／industrial／dark electro（C 小調，和聲只有 Im ↔ ♭II 兩小節一換一直循環，沒有明顯旋律，105 BPM、半拍感）。
// 用 OfflineAudioContext 一次算好存成音檔。旋律、貝斯樂句、和聲、音色都是原創。
// 段落：前奏 8 小節（只播一次）→ 爆發 A 16 小節 → 間奏 8 小節 → 爆發 B（更密、更兇）16 小節 → 回到爆發 A 循環。
// 張力靠貝斯樂句裡的半音（D♭）和三全音（G♭）、金屬打擊、噪音和警報聲，不靠和弦變化。
window.renderMidtempo = async function (opts = {}) {
  const BPM = 105, SR = 44100, S16 = 60 / BPM / 4, BAR = S16 * 16, BARS = opts.bars || 50;
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
  const subG = ctx.createGain(); subG.gain.value = 0.16; subG.connect(pump);
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

  // ---------------------------------------------------------------- 編曲
  // 和聲：Cm（Im）兩小節 ↔ D♭（♭II）兩小節，一直循環
  const ROOT = [36, 36, 37, 37];
  // 貝斯樂句：每小節 [十六分音符位置, 音（相對根音）, 長度, 濾波開合次數]
  const RIFF = [
    [[0, 0, 3, 2], [3, 0, 1, 1], [4, 12, 2, 1], [6, 0, 2, 2], [10, 0, 2, 1], [12, 1, 2, 1], [14, 0, 2, 2]],
    [[0, 0, 3, 3], [3, 0, 1, 1], [4, 0, 2, 2], [8, 12, 1, 1], [9, 6, 1, 1], [10, 0, 4, 4], [14, 1, 2, 1]],
  ];
  const DRONE = [[36, 43, 48, 51, 55], [37, 44, 49, 53, 56]];   // Cm、D♭
  const DRONE_DARK = [[36, 43, 48, 49, 55], [37, 44, 48, 49, 56]];   // 間奏：C 和 D♭ 疊在一起（只差半音），刺、不安
  const TICK = [[72, 79, 75, 79], [73, 80, 77, 80]];               // 高音的節奏敲擊（和弦音），當成質感，不是旋律
  const sec = (b) => { const k = b < 48 ? b : 8 + (b - 48); return k < 8 ? ['intro', k] : k < 24 ? ['A', k - 8] : k < 32 ? ['brk', k - 24] : ['B', k - 32]; };
  impact(at(0));
  for (let b = 0; b < BARS; b++) {
    const [name, i] = sec(b), q = b % 4, t = at(b), drop = name === 'A' || name === 'B';
    const root = ROOT[q];
    // 低音持續（每 4 小節換一次聲音，避免重新觸發的斷點）
    const ci = q >= 2 ? 1 : 0;
    if (q % 2 === 0) pad((name === 'brk' ? DRONE_DARK : DRONE)[ci], t, BAR * 2, name === 'intro' ? 0.16 : name === 'brk' ? 0.1 : 0.055, name === 'intro' ? 900 + i * 150 : name === 'brk' ? 2200 : 1500);
    // 高音敲擊：節奏質感（前奏後半、間奏、爆發 B）
    if (name === 'intro' || name === 'brk' || name === 'B') for (let s = 0; s < 16; s++) { if (name !== 'B' && s % 2) continue; if (name === 'intro' && i < 4 && s % 4) continue; pluck(TICK[ci][s % 4] + (name === 'B' && s % 8 >= 6 ? 12 : 0), at(b, s), name === 'intro' ? 0.6 : 0.8); }
    // 咆哮貝斯（爆發段）：爆發 B 的濾波開合更快、更兇
    if (drop) {
      const riff = RIFF[(i >> 1) % 2 ? 1 : 0];
      for (const [s, iv, len, shp] of riff) growl(root + (iv === 1 && ci ? -1 : iv), at(b, s), len * S16, shp + (name === 'B' ? 2 : 0));
      sub(root - 12, t, BAR * 0.5); sub(root - 12, at(b, 8), BAR * 0.5);
    }
    if (name === 'brk' && i >= 4) { growl(root, t, BAR * 0.5, 4); growl(root, at(b, 8), BAR * 0.5, 6); }
    if (name === 'brk') sub(root - 12, t, BAR);
    if (name === 'intro' && i >= 2) growl(root, t, BAR * (i === 7 ? 0.5 : 1), 2 + i);   // 前奏：低沉的咆哮慢慢加快
    if (name === 'intro') sub(root - 12, t, BAR);
    // 鼓：半拍感（大鼓第 1 拍＋切分，軍鼓第 3 拍）
    if (drop) {
      kick(at(b, 0)); kick(at(b, 10), 0.85); if (q === 1 || q === 3) kick(at(b, 7), 0.7);
      snare(at(b, 8), 1); if (q === 3) snare(at(b, 14), 0.45);
      for (let s = 0; s < 16; s++) hat(at(b, s), s === 6 || s === 14, s % 2 ? 0.8 : 0.5);
      for (const s of name === 'B' ? [3, 5, 11, 13] : [3, 11]) metal(at(b, s), 0.9, 1500 + q * 120);
      if (name === 'B' && q === 2) glitch(at(b, 4), S16 * 2);
      if (i % 4 === 0) impact(t, 0.5);
      if (i % 8 === 7) glitch(at(b, 12), S16 * 4);
    } else if (name === 'intro' && i >= 4) { kick(at(b, 0), 0.7); for (const s of [3, 7, 11, 15]) metal(at(b, s), 0.6, 1300); }
    else if (name === 'brk') { kick(at(b, 0), i >= 4 ? 0.8 : 0.6); if (i >= 4) snare(at(b, 8), 0.7); for (const s of [6, 14]) metal(at(b, s), 0.7, 1100); if (i === 7) for (let s = 8; s < 16; s++) snare(at(b, s), 0.3 + (s - 8) * 0.08); }
    if ((name === 'brk' && i === 0) || (name === 'B' && i % 8 === 4)) siren(t, BAR * 4);
    // 往上衝
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
