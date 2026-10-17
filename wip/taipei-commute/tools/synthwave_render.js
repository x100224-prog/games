// 原創配樂「夜行高架」：暗色、往前推的 synthwave／cyberpunk（F 小調、118 BPM）。
// 用 Web Audio 的 OfflineAudioContext 一次算好（可以用很多層聲音，不受手機效能限制），存成音檔給遊戲播放。
// 段落：前奏 8 小節（只播一次）→ A 16 小節 → B（加主旋律）16 小節 → 間奏 8 小節（最後 4 小節往上推）→ 回到 A 循環。
// 和弦：Fm – D♭ – B♭m – C ｜ Fm – D♭ – A♭ – C（C 大三和弦帶出不安的導音）。旋律、和弦配置、音色都是原創。
window.renderSynthwave = async function (opts = {}) {
  const BPM = 118, SR = 44100, S16 = 60 / BPM / 4, BAR = S16 * 16, BARS = opts.bars || 50;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * BAR * BARS), SR);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const T0 = 0.0;
  const at = (bar, step = 0) => T0 + bar * BAR + step * S16;

  // ---------------------------------------------------------------- 匯流排
  const master = ctx.createGain(); master.gain.value = 0.8;
  const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -16; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.15;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.06;
  const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 30; hpf.Q.value = 0.7;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6000; air.gain.value = 3;
  const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 220; mud.Q.value = 1; mud.gain.value = -3;
  master.connect(hpf); hpf.connect(mud); mud.connect(air); air.connect(glue); glue.connect(lim); lim.connect(ctx.destination);
  const pump = ctx.createGain(); pump.connect(master);               // 側鏈：大鼓一打，合成器被壓下去再彈回來
  const drums = ctx.createGain(); drums.gain.value = 0.9; drums.connect(master);
  const noiseBuf = (() => { const b = ctx.createBuffer(2, SR * 2, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return b; })();
  const ir = (sec, decay, gate) => { const n = Math.floor(SR * sec), b = ctx.createBuffer(2, n, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) { const u = i / n; d[i] = (Math.random() * 2 - 1) * (gate ? (u < 0.85 ? 0.9 : (1 - u) / 0.15 * 0.9) : Math.pow(1 - u, decay)); } } return b; };
  const verb = ctx.createConvolver(); verb.buffer = ir(3.2, 2.6); const verbOut = ctx.createGain(); verbOut.gain.value = 0.32; verb.connect(verbOut); verbOut.connect(master);
  const gated = ctx.createConvolver(); gated.buffer = ir(0.42, 0, true); const gatedOut = ctx.createGain(); gatedOut.gain.value = 0.55; gated.connect(gatedOut); gatedOut.connect(drums);
  // 乒乓延遲（附點八分）
  const dIn = ctx.createGain(), dL = ctx.createDelay(2), dR = ctx.createDelay(2), fbL = ctx.createGain(), fbR = ctx.createGain(), dLp = ctx.createBiquadFilter(), merger = ctx.createChannelMerger(2), dOut = ctx.createGain();
  dL.delayTime.value = S16 * 3; dR.delayTime.value = S16 * 3; fbL.gain.value = 0.42; fbR.gain.value = 0.42; dLp.type = 'lowpass'; dLp.frequency.value = 3500; dOut.gain.value = 0.3;
  dIn.connect(dLp); dLp.connect(dL); dL.connect(fbL); fbL.connect(dR); dR.connect(fbR); fbR.connect(dL);
  dL.connect(merger, 0, 0); dR.connect(merger, 0, 1); merger.connect(dOut); dOut.connect(pump);
  const shaper = (amt) => { const w = ctx.createWaveShaper(), cv = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; cv[i] = Math.tanh(amt * x) / Math.tanh(amt); } w.curve = cv; w.oversample = '4x'; return w; };

  // ---------------------------------------------------------------- 音色
  const env = (g, t, a, hold, r, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r); };
  function supersaw(notes, t, dur, o) {
    const f = ctx.createBiquadFilter(); f.type = o.hp ? 'highpass' : 'lowpass'; f.Q.value = o.q || 0.8;
    if (o.cut0) { f.frequency.setValueAtTime(o.cut0, t); f.frequency.exponentialRampToValueAtTime(o.cut, t + (o.cutT || 0.3)); } else f.frequency.value = o.cut;
    const g = ctx.createGain(); env(g, t, o.a || 0.01, Math.max(0, dur - (o.a || 0.01)), o.r || 0.2, o.gain);
    f.connect(g); g.connect(o.dest || pump);
    if (o.verb) { const s = ctx.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(verb); }
    if (o.delay) { const s = ctx.createGain(); s.gain.value = o.delay; g.connect(s); s.connect(dIn); }
    const V = o.voices || 7, det = o.det || 20, end = t + dur + (o.r || 0.2) + 0.05;
    for (const m of notes) for (let v = 0; v < V; v++) {
      const osc = ctx.createOscillator(), p = ctx.createStereoPanner(); osc.type = 'sawtooth'; osc.frequency.value = mtof(m); osc.detune.value = V > 1 ? (v / (V - 1) - 0.5) * 2 * det : 0;
      p.pan.value = V > 1 ? (v / (V - 1) - 0.5) * 1.4 : 0; const vg = ctx.createGain(); vg.gain.value = 1 / Math.sqrt(V * notes.length);
      osc.connect(vg); vg.connect(p); p.connect(f); osc.start(t); osc.stop(end);
    }
    return g;
  }
  const bassDrive = shaper(3.2), bassOut = ctx.createGain(); bassOut.gain.value = 0.28; bassDrive.connect(bassOut); bassOut.connect(pump);
  function bass(m, t, dur, accent) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = mtof(m); o2.frequency.value = mtof(m); o2.detune.value = -9;
    f.type = 'lowpass'; f.Q.value = 5; f.frequency.setValueAtTime(accent ? 3800 : 2600, t); f.frequency.exponentialRampToValueAtTime(420, t + dur * 0.9);
    env(g, t, 0.003, dur * 0.55, dur * 0.4, accent ? 0.9 : 0.7);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(bassDrive);
    for (const o of [o1, o2]) { o.start(t); o.stop(t + dur + 0.05); }
  }
  const subG = ctx.createGain(); subG.gain.value = 0.13; subG.connect(pump);
  function sub(m, t, dur) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(m); env(g, t, 0.01, dur - 0.05, 0.05, 1); o.connect(g); g.connect(subG); o.start(t); o.stop(t + dur + 0.1); }
  function arp(m, t, v = 1) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o2.type = 'sawtooth'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m); o2.detune.value = 8;
    f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.14);
    env(g, t, 0.002, 0.02, 0.12, 0.17 * v); o.connect(f); o2.connect(f); f.connect(g); g.connect(pump);
    const s = ctx.createGain(); s.gain.value = 0.55; g.connect(s); s.connect(dIn);
    for (const x of [o, o2]) { x.start(t); x.stop(t + 0.2); }
  }
  let leadPrev = null;
  function lead(m, t, dur) {
    const V = 5, f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.Q.value = 2; f.frequency.setValueAtTime(1800, t); f.frequency.linearRampToValueAtTime(5200, t + 0.05); f.frequency.exponentialRampToValueAtTime(3000, t + dur);
    env(g, t, 0.012, dur - 0.02, 0.18, 0.3); f.connect(g); g.connect(pump);
    const sv = ctx.createGain(); sv.gain.value = 0.38; g.connect(sv); sv.connect(verb); const sd = ctx.createGain(); sd.gain.value = 0.32; g.connect(sd); sd.connect(dIn);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.4, dur)); lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + 0.25);
    for (let v = 0; v < V; v++) {
      const o = ctx.createOscillator(), p = ctx.createStereoPanner(), vg = ctx.createGain(); o.type = v === 2 ? 'square' : 'sawtooth';
      if (leadPrev !== null && Math.abs(leadPrev - m) <= 7) { o.frequency.setValueAtTime(mtof(leadPrev), t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.05); } else o.frequency.value = mtof(m);
      o.detune.value = (v / (V - 1) - 0.5) * 24; lg.connect(o.detune); p.pan.value = (v / (V - 1) - 0.5) * 0.9; vg.gain.value = 0.45;
      o.connect(vg); vg.connect(p); p.connect(f); o.start(t); o.stop(t + dur + 0.25);
    }
    leadPrev = m;
  }
  function kick(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(), d = shaper(1.8); o.type = 'sine'; o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    env(g, t, 0.002, 0.07, 0.3, 0.8 * v); o.connect(d); d.connect(g); g.connect(drums); o.start(t); o.stop(t + 0.55);
    const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 2500; env(ng, t, 0.001, 0.002, 0.012, 0.25 * v); n.connect(hp); hp.connect(ng); ng.connect(drums); n.start(t, Math.random()); n.stop(t + 0.03);
    pump.gain.setValueAtTime(0.32, t); pump.gain.setTargetAtTime(1, t + 0.02, 0.07);
  }
  function snare(t, v = 1, clap) {
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    env(g, t, 0.001, 0.01, 0.17, 0.95 * v); n.connect(bp); bp.connect(g); g.connect(drums); n.start(t, Math.random()); n.stop(t + 0.3);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); env(og, t, 0.001, 0.01, 0.09, 0.5 * v); o.connect(og); og.connect(drums); o.start(t); o.stop(t + 0.15);
    const s = ctx.createGain(); s.gain.value = 0.9 * v; g.connect(s); s.connect(gated); const s2 = ctx.createGain(); s2.gain.value = 0.25 * v; g.connect(s2); s2.connect(verb);
    if (clap) for (const dt of [0, 0.011, 0.023]) { const c = ctx.createBufferSource(), cf = ctx.createBiquadFilter(), cg = ctx.createGain(); c.buffer = noiseBuf; cf.type = 'bandpass'; cf.frequency.value = 1300; cf.Q.value = 1.2; env(cg, t + dt, 0.001, 0.004, 0.05, 0.4 * v); c.connect(cf); cf.connect(cg); cg.connect(drums); c.start(t + dt, Math.random()); c.stop(t + dt + 0.1); }
  }
  function hat(t, open, v = 1) { const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner(); n.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = open ? 7000 : 8800; p.pan.value = open ? -0.2 : 0.25; env(g, t, 0.001, 0.005, open ? 0.24 : 0.035, (open ? 0.36 : 0.26) * v); n.connect(hp); hp.connect(g); g.connect(p); p.connect(drums); n.start(t, Math.random()); n.stop(t + 0.3); }
  function tom(t, f0, v = 1) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.25); env(g, t, 0.002, 0.03, 0.3, 0.7 * v); o.connect(g); g.connect(drums); const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(gated); o.start(t); o.stop(t + 0.4); }
  function crash(t, v = 1) { const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noiseBuf; n.loop = true; hp.type = 'highpass'; hp.frequency.value = 4200; env(g, t, 0.002, 0.05, 2.2, 0.32 * v); n.connect(hp); hp.connect(g); g.connect(drums); const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(verb); n.start(t); n.stop(t + 2.5); }
  function riser(t, dur) {
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noiseBuf; n.loop = true; bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
    n.connect(bp); bp.connect(g); g.connect(master); const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(verb); n.start(t); n.stop(t + dur + 0.1);
    const o = ctx.createOscillator(), og = ctx.createGain(), of = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(mtof(41), t); o.frequency.exponentialRampToValueAtTime(mtof(77), t + dur);
    of.type = 'lowpass'; of.frequency.setValueAtTime(400, t); of.frequency.exponentialRampToValueAtTime(6000, t + dur); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.09, t + dur); og.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03);
    o.connect(of); of.connect(og); og.connect(master); o.start(t); o.stop(t + dur + 0.1);
  }
  function impact(t) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.4); env(g, t, 0.001, 0.05, 1.6, 0.9); o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.8);
    const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain(); n.buffer = noiseBuf; lp.type = 'lowpass'; lp.frequency.value = 1500; env(ng, t, 0.001, 0.02, 0.8, 0.6); n.connect(lp); lp.connect(ng); ng.connect(master); const s = ctx.createGain(); s.gain.value = 0.6; ng.connect(s); s.connect(verb); n.start(t); n.stop(t + 1);
  }
  function revCym(t, dur) { const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noiseBuf; n.loop = true; hp.type = 'highpass'; hp.frequency.value = 5000; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02); n.connect(hp); hp.connect(g); g.connect(drums); n.start(t); n.stop(t + dur + 0.05); }

  // ---------------------------------------------------------------- 編曲
  const CH = [ // 每小節：貝斯根音、和弦（墊音）、琶音音群
    { r: 41, pad: [53, 56, 60, 65], arp: [65, 68, 72, 77] },   // Fm
    { r: 37, pad: [53, 56, 61, 65], arp: [61, 65, 68, 73] },   // D♭
    { r: 34, pad: [53, 58, 61, 65], arp: [58, 61, 65, 70] },   // B♭m
    { r: 36, pad: [52, 55, 60, 64], arp: [60, 64, 67, 72] },   // C
    { r: 41, pad: [53, 56, 60, 65], arp: [65, 68, 72, 77] },   // Fm
    { r: 37, pad: [53, 56, 61, 65], arp: [61, 65, 68, 73] },   // D♭
    { r: 32, pad: [51, 56, 60, 63], arp: [56, 60, 63, 68] },   // A♭
    { r: 36, pad: [52, 55, 60, 64], arp: [60, 64, 67, 72] },   // C
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
  const LEAD = [
    [[0, 72, 4], [4, 68, 2], [6, 72, 2], [8, 75, 8]],
    [[0, 77, 6], [6, 75, 2], [8, 73, 4], [12, 72, 4]],
    [[0, 73, 8], [8, 72, 4], [12, 70, 4]],
    [[0, 72, 6], [6, 76, 2], [8, 79, 8]],
    [[0, 80, 4], [4, 79, 2], [6, 77, 2], [8, 75, 8]],
    [[0, 77, 6], [6, 80, 2], [8, 82, 8]],
    [[0, 80, 4], [4, 79, 4], [8, 75, 8]],
    [[0, 76, 8], [8, 79, 4], [12, 84, 4]],
  ];
  // 第 b 小節屬於哪一段（48 小節之後重複 A 段開頭，給循環接縫用）
  const sec = (b) => { const k = b < 48 ? b : 8 + (b - 48); return k < 8 ? ['intro', k] : k < 24 ? ['A', k - 8] : k < 40 ? ['B', k - 24] : ['brk', k - 40]; };
  impact(at(0));
  for (let b = 0; b < BARS; b++) {
    const [name, i] = sec(b), ch = CH[b % 8], t = at(b), full = name === 'A' || name === 'B', phraseEnd = i % 8 === 7;
    // 和弦墊音
    const padGain = name === 'intro' ? 0.1 + 0.02 * i : name === 'brk' && i < 4 ? 0.14 : 0.1;
    supersaw(ch.pad, t, BAR, { cut: name === 'intro' ? 900 + i * 350 : name === 'B' ? 3200 : 2300, a: name === 'intro' && i === 0 ? 1.2 : 0.25, r: 0.4, gain: padGain, verb: 0.35, voices: 6, det: 22 });
    // 琶音
    if (name !== 'brk' || i >= 4) for (let s = 0; s < 16; s++) { if (name === 'intro' && i < 2 && s % 2) continue; arp(ch.arp[ARP[s]] + (name === 'B' && (s >> 2) % 2 ? 12 : 0), at(b, s), name === 'intro' ? 0.6 + i * 0.05 : 0.9); }
    // 貝斯：十六分音符一直推；第 6、14 步跳高八度
    if (full || (name === 'intro' && i >= 4) || (name === 'brk' && i >= 4)) for (let s = 0; s < 16; s++) bass(ch.r + (s === 6 || s === 14 ? 12 : 0), at(b, s), S16, s % 4 === 2);
    if (name === 'brk' && i < 4) { bass(ch.r, t, S16 * 8, true); bass(ch.r, at(b, 8), S16 * 8, true); }
    if (full || name === 'brk') sub(ch.r - 12, t, BAR);
    // 鼓
    const kickOn = full || (name === 'intro' && i >= 4) || (name === 'brk' && i >= 4);
    if (kickOn) for (let s = 0; s < 16; s += 4) kick(at(b, s), name === 'intro' ? 0.8 : 1);
    if (full || (name === 'brk' && i >= 4)) {
      snare(at(b, 4), 1, name === 'B'); snare(at(b, 12), 1, name === 'B');
      for (let s = 0; s < 16; s++) { if (s % 4 === 2) hat(at(b, s), true, 0.9); else hat(at(b, s), false, s % 2 ? 0.75 : 0.45); }
    } else if (name === 'intro' && i >= 4) for (let s = 2; s < 16; s += 4) hat(at(b, s), true, 0.6);
    if ((name === 'A' || name === 'B') && i % 8 === 0) crash(t);
    // 過門：每 8 小節最後半小節打鼓（A、B 段），間奏最後一小節軍鼓連打
    if (full && phraseEnd) { tom(at(b, 12), 220); tom(at(b, 13), 180); tom(at(b, 14), 140); tom(at(b, 15), 110); }
    if (name === 'brk' && i === 7) for (let s = 8; s < 16; s++) snare(at(b, s), 0.35 + (s - 8) * 0.09);
    // 主旋律（B 段）
    if (name === 'B') for (const [s, m, len] of LEAD[i % 8]) lead(m, at(b, s), len * S16);
    // 間奏前半：短促的和弦刺（反拍），製造緊張
    if (name === 'brk' && i < 4) for (const s of [2, 6, 10, 14]) supersaw(ch.arp.map(n => n - 12), at(b, s), S16 * 0.6, { cut: 4200, r: 0.12, gain: 0.07, verb: 0.4, voices: 5, det: 18 });
    // 段落前往上衝
    if ((name === 'intro' && i === 6) || (name === 'brk' && i === 6)) riser(t, BAR * 2);
    if (name === 'A' && i === 15) revCym(at(b, 8), S16 * 8);
  }
  const buf = await ctx.startRendering();
  // 轉成 16-bit WAV（base64）回傳
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  const bytes = new Uint8Array(out.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return { b64: btoa(bin), peak, sec: n / SR, bar: BAR };
};
