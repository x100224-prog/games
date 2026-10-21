// 配樂：《布丁狗去鶯歌》原創的合成器開車音樂（A 小調、128 BPM），樂器全部用 Web Audio 即時合成；
// 只有一小段饒舌人聲是事先合成好的音檔（audio/rap.mp3，用 tools/make_rap.py 產生，歌詞原創）。
// 段落：前奏 8 小節 → 主歌 16 小節 → 副歌（加主旋律）16 小節 → 間奏 8 小節 → 回到主歌，一直循環。
// 開車越快濾波器越亮、鼓越完整；走路時聲音收小、鼓幾乎只剩鈸。

const BPM = 128, STEP = 60 / BPM / 4;          // 一個十六分音符的秒數
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 和弦進行：Am – F – C – G
const CHORDS = [
  { bass: 33, arp: [57, 60, 64, 69], pad: [57, 60, 64, 69] },
  { bass: 29, arp: [53, 57, 60, 65], pad: [53, 57, 60, 65] },
  { bass: 36, arp: [55, 60, 64, 67], pad: [55, 60, 64, 67] },
  { bass: 31, arp: [55, 59, 62, 67], pad: [55, 59, 62, 67] },
];
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 2];

// 主旋律（原創）：每小節 [十六分音符位置, MIDI 音, 長度]
const N = { A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84 };
const PHRASE1 = [
  [[0, N.E5, 4], [4, N.A5, 2], [6, N.G5, 2], [8, N.E5, 4], [12, N.D5, 2], [14, N.C5, 2]],
  [[0, N.C5, 4], [4, N.A4, 2], [6, N.C5, 2], [8, N.F5, 6], [14, N.E5, 2]],
  [[0, N.E5, 4], [4, N.G5, 4], [8, N.E5, 2], [10, N.D5, 2], [12, N.C5, 4]],
  [[0, N.D5, 6], [6, N.B4, 2], [8, N.D5, 4], [12, N.G5, 4]],
];
const PHRASE2 = [
  [[0, N.A5, 4], [4, N.C6, 2], [6, N.B5, 2], [8, N.A5, 4], [12, N.G5, 2], [14, N.E5, 2]],
  [[0, N.F5, 6], [6, N.E5, 2], [8, N.C5, 4], [12, N.A4, 4]],
  [[0, N.G5, 4], [4, N.E5, 2], [6, N.G5, 2], [8, N.C6, 6], [14, N.B5, 2]],
  [[0, N.B5, 4], [4, N.A5, 2], [6, N.G5, 2], [8, N.D5, 8]],
];
const PHRASE2_END = [PHRASE2[0], PHRASE2[1], PHRASE2[2], [[0, N.B5, 4], [4, N.D5, 4], [8, N.E5, 8]]];
const LEAD = [...PHRASE1, ...PHRASE2, ...PHRASE1, ...PHRASE2_END];

// 饒舌（原創歌詞，只出現在主歌後半 8 小節、一輪一次、只有開車時）：
//   布丁狗 出發　蘆洲 天剛亮／油門 踩下去　國道 一路往南闖／過了 三鶯橋　鶯歌 就在前方／停好車 走進站　準時 不慌張
const RAP_BAR = 8;                              // 主歌第 9 小節開始

const LOOP = 48;                                // 一輪 48 小節
function section(bar) {
  const b = bar < LOOP ? bar : 8 + (bar - 8) % (LOOP - 8);   // 前奏只出現一次
  if (b < 8) return { name: 'intro', i: b };
  if (b < 24) return { name: 'verse', i: b - 8 };
  if (b < 40) return { name: 'chorus', i: b - 24 };
  return { name: 'break', i: b - 40 };
}

// 賽博龐克電子樂（原創，給「看示範」用）：D 小調 Dm – B♭ – Gm – A，十六分音符滾動貝斯、半拍感的大鼓、
// 快速琶音、鋸齒波主旋律，每 24 小節一輪：前奏 4 → 主段 8 → 加主旋律 8 → 間奏 4（最後兩小節噪音上升）。
const CY_CHORDS = [
  { bass: 38, arp: [62, 65, 69, 74] },   // Dm
  { bass: 34, arp: [58, 62, 65, 70] },   // B♭
  { bass: 31, arp: [55, 58, 62, 67] },   // Gm
  { bass: 33, arp: [57, 61, 64, 69] },   // A
];
const CY_ARP = [0, 1, 2, 3, 1, 2, 3, 2, 0, 1, 2, 3, 3, 2, 1, 0];
const CY_LEAD = [
  [[0, 69, 6], [6, 74, 2], [8, 77, 4], [12, 76, 4]],
  [[0, 74, 6], [6, 77, 2], [8, 70, 4], [12, 69, 4]],
  [[0, 67, 4], [4, 70, 4], [8, 74, 6], [14, 72, 2]],
  [[0, 73, 8], [8, 76, 4], [12, 69, 4]],
];
const CY_LOOP = 24;
function cySection(bar) {
  const b = bar < CY_LOOP ? bar : 4 + (bar - 4) % (CY_LOOP - 4);
  if (b < 4) return { name: 'intro', i: b };
  if (b < 12) return { name: 'a', i: b - 4 };
  if (b < 20) return { name: 'b', i: b - 12 };
  return { name: 'break', i: b - 20 };
}

const CYBER_LOOP = [14.88372, 89.30234];   // 「鉻色脈衝」循環：從第 8 小節到第 48 小節（129 BPM）
const HOME_LOOP = [14.4, 91.2];            // 在家配樂「小巷裡的祕密」（tools/town_render.js）：從第 6 小節循環到第 38 小節（32 小節，100 BPM）

// 居家曲（即時合成的備用版，在家配樂的音檔還沒載入時用）：F 大調、92 BPM，溫暖的城鎮曲風格 —— 長笛主旋律、豎琴琶音、弦樂墊、
// 輕輕的沙鈴和木魚。段落：前奏 4 小節（只有豎琴和弦樂）→ A 8 小節 → B 8 小節 → A' 8 小節（加鐵琴），之後 A B A' 循環。
const HOME_BPM = 92, HOME_STEP = 60 / HOME_BPM / 4, HG = 2.1;   // HG：居家曲各樂器的音量倍數（跟開車音樂差不多大聲）
const HC = {
  F: { bass: 41, n: [53, 57, 60, 65] }, Dm: { bass: 38, n: [50, 53, 57, 62] }, Bb: { bass: 46, n: [50, 53, 58, 62] },
  C: { bass: 48, n: [52, 55, 60, 64] }, Am: { bass: 45, n: [52, 57, 60, 64] }, Gm: { bass: 43, n: [50, 55, 58, 62] },
};
const H_INTRO = ['F', 'Dm', 'Bb', 'C'];
const H_A = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C'];
const H_B = ['Gm', 'C', 'F', 'Dm', 'Gm', 'Bb', 'C', 'C'];
// 主旋律（原創）：每小節 [十六分音符位置, MIDI 音, 長度]
const H_MEL_A = [
  [[0, 72, 4], [4, 69, 2], [6, 72, 2], [8, 77, 6], [14, 76, 2]],
  [[0, 74, 4], [4, 77, 4], [8, 81, 6], [14, 79, 2]],
  [[0, 77, 4], [4, 74, 2], [6, 77, 2], [8, 70, 4], [12, 74, 4]],
  [[0, 72, 6], [6, 76, 2], [8, 79, 8]],
  [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 72, 6], [14, 77, 2]],
  [[0, 76, 4], [4, 72, 2], [6, 76, 2], [8, 81, 8]],
  [[0, 79, 4], [4, 77, 2], [6, 74, 2], [8, 70, 4], [12, 74, 4]],
  [[0, 76, 4], [4, 74, 2], [6, 76, 2], [8, 77, 8]],
];
const H_MEL_B = [
  [[0, 70, 4], [4, 74, 4], [8, 79, 6], [14, 77, 2]],
  [[0, 76, 4], [4, 79, 4], [8, 84, 6], [14, 82, 2]],
  [[0, 81, 6], [6, 77, 2], [8, 72, 8]],
  [[0, 74, 4], [4, 76, 2], [6, 77, 2], [8, 81, 8]],
  [[0, 79, 4], [4, 82, 4], [8, 79, 4], [12, 77, 4]],
  [[0, 77, 4], [4, 74, 4], [8, 70, 8]],
  [[0, 72, 4], [4, 74, 2], [6, 76, 2], [8, 79, 6], [14, 81, 2]],
  [[0, 79, 12]],
];
const H_ARP = [0, 1, 2, 3, 2, 1, 2, 3];   // 八分音符的豎琴琶音
function homeSection(bar) {
  if (bar < 4) return { name: 'intro', i: bar, ch: H_INTRO[bar] };
  const b = (bar - 4) % 24;
  if (b < 8) return { name: 'a', i: b, ch: H_A[b] };
  if (b < 16) return { name: 'b', i: b - 8, ch: H_B[b - 8] };
  return { name: 'a2', i: b - 16, ch: H_A[b - 16] };
}

const PREF_KEY = 'yingge-music';

export class Music {
  constructor(opts = {}) {
    this.ctx = null; this.timer = null;
    this.prefKey = opts.key || PREF_KEY;
    let p = {}; try { p = JSON.parse(localStorage.getItem(this.prefKey) || '{}'); } catch (err) { p = {}; }
    this.on = p.on !== false; this.volume = typeof p.vol === 'number' ? p.vol : 0.6;
    this.mode = 'walk'; this.speed = 0;
    this.step = 0; this.next = 0; this.onChange = null; this.style = 'drive';
    this.rapOn = p.rap !== false; this.rapBuf = null; this.rapSrc = null; this.rapUrl = opts.rapUrl === undefined ? 'audio/rap.mp3' : opts.rapUrl;
    // 事先算好的原創曲（音檔）：看示範用「鉻色脈衝」（tools/pulse_render.js）、在家用「小巷裡的祕密」（tools/town_render.js）。
    // 載入前先用即時合成的版本代替。
    this.files = { cyber: { url: opts.cyberUrl || null, loop: CYBER_LOOP }, home: { url: opts.homeUrl || null, loop: HOME_LOOP, gain: 0.62, startAt: 9.6 } };   // startAt：跳過前奏，從長笛旋律那一小節（第 4 小節）開始   // gain：音檔本身比較大聲，收一點跟其他配樂一樣
    this.fileSrc = null;
  }

  /** 載入饒舌人聲（失敗就只放純音樂）。 */
  async _loadRap(ctx) {
    if (!this.rapUrl) { this.rapBuf = null; return; }   // 沒有饒舌人聲（純音樂）
    try {
      const r = await fetch(this.rapUrl); if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer();
      this.rapBuf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
    } catch (err) { console.warn('rap load failed', err); this.rapBuf = null; }
  }

  _rap(t) {
    if (!this.rapBuf || !this.rapOn || this.mode !== 'drive') return;
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = this.rapBuf; g.gain.value = 1.0;
    src.connect(g); g.connect(this.vox); const vs = ctx.createGain(); vs.gain.value = 0.18; g.connect(vs); vs.connect(this.verb);
    src.start(t); this.rapSrc = { src, g, end: t + this.rapBuf.duration };
    // 念的時候把伴奏稍微收小，人聲比較清楚
    this.bus.gain.setTargetAtTime(0.42, t, 0.15); this.bus.gain.setTargetAtTime(0.9, t + this.rapBuf.duration - 0.3, 0.3);
    src.onended = () => { if (this.rapSrc && this.rapSrc.src === src) this.rapSrc = null; };
  }

  _save() { try { localStorage.setItem(this.prefKey, JSON.stringify({ on: this.on, vol: this.volume, rap: this.rapOn })); } catch (err) { /* 無痕模式存不了就算了 */ } }

  _init() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    this._build(new AC());
    this._loadRap(this.ctx);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.on || (this.keepAlive && this.keepAlive())) this.ctx.resume();
    });
    return true;
  }

  /** 離線算出一段音樂（測試、試聽用），回傳 AudioBuffer。 */
  static async render(sec, mode = 'drive', speed = 20, fromBar = 0, style = 'drive') {
    const sr = 44100, ctx = new OfflineAudioContext(2, Math.ceil(sr * sec), sr), m = new Music({ rapUrl: null }); m.style = style;
    m.on = true; m._build(ctx); m.update(mode, speed); m.mode = mode;
    await m._loadRap(ctx);
    for (let step = fromBar * 16, t = 0.05; t < sec - 0.05; step++, t += style === 'home' ? HOME_STEP : STEP) m._play(step, t);
    return ctx.startRendering();
  }

  _build(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.on ? this.volume : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 85; low.gain.value = 3;   // 低頻加重
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;   // 防爆音
    const trim = ctx.createGain(); trim.gain.value = 0.8;
    this.master.connect(low); low.connect(comp); comp.connect(trim); trim.connect(lim); lim.connect(ctx.destination);
    // 整體濾波：走路時悶一點，開快車時全開
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 1600; this.tone.Q.value = 0.6;
    this.tone.connect(this.master);
    this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
    this.duck = ctx.createGain(); this.duck.gain.value = 1; this.bus.connect(this.duck); this.duck.connect(this.tone);   // 大鼓時把和聲壓下去（側鏈感）
    const sat = ctx.createWaveShaper(), cv = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
    sat.curve = cv; sat.oversample = '2x';
    this.bassBus = ctx.createGain(); this.bassBus.gain.value = 1.0; this.bassBus.connect(sat);
    const satOut = ctx.createGain(); satOut.gain.value = 0.85; sat.connect(satOut); satOut.connect(this.tone);
    this.subBus = ctx.createGain(); this.subBus.gain.value = 1.0; this.subBus.connect(this.master);
    this.fileBus = ctx.createGain(); this.fileBus.gain.value = this.on ? this.volume : 0; this.fileBus.connect(comp);   // 音檔：不經過即時合成用的濾波
    this.vox = ctx.createGain(); this.vox.gain.value = 3.4; this.vox.connect(this.master);   // 人聲不經過濾波   // 超低音不經過濾波，走路時也沉
    this.drums = ctx.createGain(); this.drums.gain.value = 0.25; this.drums.connect(this.tone);
    this.kickBus = ctx.createGain(); this.kickBus.gain.value = 0; this.kickBus.connect(this.drums);
    // 延遲（附點八分）與殘響
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.32; const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 3200;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay);
    const dWet = ctx.createGain(); dWet.gain.value = 0.28; dl.connect(dWet); dWet.connect(this.bus);
    this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(2.4);
    const vWet = ctx.createGain(); vWet.gain.value = 0.22; this.verb.connect(vWet); vWet.connect(this.bus);
    // 白噪音（鼓用）
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
  }

  _impulse(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    return b;
  }

  /** 必須在玩家點擊（例如「出發」）時呼叫，瀏覽器才允許出聲。 */
  start() {
    if (!this.ctx && !this._init()) return;
    if (this.on) this.ctx.resume();
    if (!this.timer) {
      this.step = 0; this.next = this.ctx.currentTime + 0.12;
      this.timer = setInterval(() => this._tick(), 25);
    }
  }

  toggle() { this.setOn(!this.on); return this.on; }
  setOn(on) {
    this.on = on; this._save();

    if (!this.ctx) { if (this.onChange) this.onChange(this.on); return; }
    const t = this.ctx.currentTime;
    const v = on && !this.held ? this.volume : 0;
    this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(v, t, 0.08);
    if (this.fileBus) { this.fileBus.gain.cancelScheduledValues(t); this.fileBus.gain.setTargetAtTime(v, t, 0.08); }
    if (on) this.ctx.resume();
    if (this.onChange) this.onChange(this.on);
  }

  /** 暫時把配樂收起來（彈琴的時候），hold(false) 再慢慢回來。 */
  hold(on) {
    this.held = !!on; if (!this.ctx) return;
    const t = this.ctx.currentTime, v = this.on && !this.held ? this.volume : 0;
    for (const g of [this.master, this.fileBus]) if (g) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(v, t, on ? 0.25 : 0.8); }
  }

  /** 每幀呼叫：mode = 'title' | 'walk' | 'drive' | 'done'，speed 為車速 m/s。 */
  update(mode, speed) {
    if (!this.ctx) return;
    this.mode = mode; this.speed = Math.abs(speed || 0);
    const t = this.ctx.currentTime, k = Math.min(1, this.speed / 22);
    let cut, dr, kick;
    if (this.style === 'home') { cut = 9000; dr = 0.6; kick = 0; }
    else if (mode === 'drive') { cut = 2600 + k * 15000; dr = 0.75 + 0.25 * k; kick = 1; }
    else if (mode === 'done') { cut = 2400; dr = 0.0; kick = 0; }
    else { cut = 1500; dr = 0.32; kick = 0.15; }
    this.tone.frequency.setTargetAtTime(cut, t, 0.4);
    this.drums.gain.setTargetAtTime(dr, t, 0.5);
    this.kickBus.gain.setTargetAtTime(kick, t, 0.5);
    if (this.rapSrc && mode !== 'drive') { this.rapSrc.g.gain.setTargetAtTime(0, t, 0.25); this.bus.gain.setTargetAtTime(0.9, t, 0.3); this.rapSrc = null; }
  }

  _tick() {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return;
    if (this.next < ctx.currentTime - 0.3) this.next = ctx.currentTime + 0.05;   // 分頁被暫停過，重新對齊
    while (this.next < ctx.currentTime + 0.14) { this._play(this.step, this.next); this.next += this.style === 'home' ? HOME_STEP : STEP; this.step++; }
  }

  /** 曲風：'drive'（原本的開車音樂）或 'cyber'（賽博龐克，看示範時用）。換曲風從前奏重新開始。 */
  setStyle(st) {
    if (this.style !== st) {
      this.style = st; this.step = 0; if (this.fileSrc && this.fileSrc.style !== st) this._stopFile();
      if (this.ctx) { this.next = Math.max(this.next, this.ctx.currentTime + 0.08); this.delay.delayTime.setValueAtTime((st === 'home' ? HOME_STEP : STEP) * 3, this.ctx.currentTime); }
    }
    const F = this.files[st];
    if (F && F.url && this.ctx && !F.failed) { if (F.buf) { if (!this.fileSrc) this._startFile(st); } else this._loadFile(st); }
  }
  async _loadFile(st) {
    const F = this.files[st];
    if (!F || !F.url || F.loading || !this.ctx) return; F.loading = true;
    try {
      const r = await fetch(F.url); if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer(); const buf = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
      // 曲子一開始就有一聲：找到它就是第 0 秒（避開壓縮格式前面的空白）
      const d = buf.getChannelData(0); let i0 = 0; while (i0 < d.length && Math.abs(d[i0]) < 0.003) i0++;
      let off = Math.max(0, i0 / buf.sampleRate - 0.002);
      if (off + F.loop[1] > buf.duration) off = Math.max(0, buf.duration - F.loop[1]);   // 瀏覽器已經去掉壓縮格式的空白
      F.buf = buf; F.off = off;
      if (this.style === st && !this.fileSrc) this._startFile(st);
    } catch (err) { console.warn(st + ' music load failed', err); F.failed = true; }
    F.loading = false;
  }
  _startFile(st) {
    const F = this.files[st];
    if (!this.ctx || !F || !F.buf || this.fileSrc) return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), t = this.ctx.currentTime + 0.05;
    src.buffer = F.buf; src.loop = true; src.loopStart = F.off + F.loop[0]; src.loopEnd = F.off + F.loop[1];
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(F.gain || 1, t + (F.startAt ? 0.15 : 0.6));
    src.connect(g); g.connect(this.fileBus); src.start(t, F.off + (F.startAt || 0));
    this.fileSrc = { style: st, src, g };
  }
  _stopFile() {
    if (!this.fileSrc || !this.ctx) return;
    const { src, g } = this.fileSrc, t = this.ctx.currentTime; g.gain.setTargetAtTime(0, t, 0.25); src.stop(t + 1.2); this.fileSrc = null;
  }
  _play(step, t) {
    if (this.fileSrc && this.fileSrc.style === this.style) return;   // 音檔在播就不另外合成
    if (this.style === 'cyber') return this._playCyber(step, t);
    if (this.style === 'home') return this._playHome(step, t);
    const bar = Math.floor(step / 16), s = step % 16, sec = section(bar), ch = CHORDS[bar % 4];
    const isIntro = sec.name === 'intro', isBreak = sec.name === 'break';
    // 鼓
    const drumsOn = !(isIntro && sec.i < 4);
    const lastBarOfSection = (isIntro && sec.i === 7) || (isBreak && sec.i === 7);
    if (drumsOn) {
      if (!isIntro && !isBreak && s % 4 === 0) this._kick(t);
      if (isBreak && sec.i >= 4 && s % 8 === 0) this._kick(t, 0.6);
      if (!isIntro && !isBreak && (s === 4 || s === 12)) this._snare(t, 0.8);
      if (lastBarOfSection && s >= 8) this._snare(t, 0.25 + (s - 8) * 0.07);              // 過門
      if (s % 4 === 2) this._hat(t, true, isBreak ? 0.5 : 1);
      else if (s % 2 === 1) this._hat(t, false, s % 4 === 3 ? 0.8 : 0.5);
    }
    if ((sec.name === 'verse' || sec.name === 'chorus') && sec.i === 0 && s === 0) this._crash(t);
    // 貝斯：八分音符，正拍根音、反拍高八度
    const bassOn = !(isIntro && sec.i < 4) && !(isBreak && sec.i < 4);
    if (bassOn && s % 2 === 0) this._bass(t, ch.bass + (s % 4 === 2 ? 12 : 0), STEP * 1.7, ch.bass);
    // 琶音
    if (s % 1 === 0) this._arp(t, ch.arp[ARP_ORDER[s]] + (sec.name === 'chorus' && s >= 8 ? 12 : 0), isBreak ? 0.7 : 1);
    // 長音和聲墊
    if (s === 0) this._pad(t, ch.pad, STEP * 16);
    // 饒舌：主歌後半
    if (sec.name === 'verse' && sec.i === RAP_BAR && s === 0) this._rap(t);
    // 主旋律
    if (sec.name === 'chorus') {
      for (const [ps, note, len] of LEAD[sec.i]) if (ps === s) this._lead(t, note, len * STEP);
    } else if (isBreak && sec.i < 4) {
      for (const [ps, note, len] of PHRASE1[sec.i]) if (ps === s) this._lead(t, note - 12, len * STEP, 0.6);
    }
  }

  _playCyber(step, t) {
    const bar = Math.floor(step / 16), s = step % 16, sec = cySection(bar), ch = CY_CHORDS[bar % 4];
    const full = sec.name === 'a' || sec.name === 'b';
    if (full) {
      if (s === 0 || s === 8 || (s === 11 && bar % 2 === 1)) this._kick(t);
      if (s === 4 || s === 12) this._snare(t, 0.95);
      if (s % 2 === 1) this._hat(t, false, s % 4 === 3 ? 0.75 : 0.5);
      if (s === 14) this._hat(t, true, 0.55);
      if (sec.i === 0 && s === 0) this._crash(t);
    } else if (sec.name === 'intro' && sec.i >= 2 && s % 4 === 2) this._hat(t, false, 0.45);
    if (sec.name === 'break' && sec.i === 3 && s >= 8) this._snare(t, 0.2 + (s - 8) * 0.08);
    // 十六分音符滾動貝斯（大鼓時被側鏈壓下去）
    if (full || (sec.name === 'break' && sec.i < 2)) this._bass(t, ch.bass + (s % 8 === 6 ? 12 : 0), STEP * 0.85, ch.bass);
    this._arp(t, ch.arp[CY_ARP[s]] + (sec.name === 'b' && s % 8 >= 4 ? 12 : 0), sec.name === 'intro' ? 0.75 : 0.9);
    if (s === 0) this._pad(t, ch.arp.map(n => n - 12), STEP * 16);
    if (sec.name === 'b') for (const [ps, note, len] of CY_LEAD[sec.i % 4]) if (ps === s) this._lead(t, note, len * STEP, 0.95);
    if (sec.name === 'break' && sec.i === 2 && s === 0) this._riser(t, STEP * 32);
  }
  _playHome(step, t) {
    const bar = Math.floor(step / 16), s = step % 16, sec = homeSection(bar), ch = HC[sec.ch], S = HOME_STEP;
    const intro = sec.name === 'intro', isB = sec.name === 'b';
    // 豎琴琶音：八分音符；B 段高八度、比較亮
    if (s % 2 === 0) this._harp(t, ch.n[H_ARP[s / 2]] + (isB ? 12 : 0), intro ? 0.8 : 0.7);
    // 弦樂墊：每小節一個和弦
    if (s === 0) this._strings(t, ch.n, S * 16, intro ? 1 : 0.8);
    if (intro && s === 0) this._bell(t, ch.n[3] + 12, 0.5);
    if (intro) return;
    // 低音：二分音符，根音、五度
    if (s === 0) this._hbass(t, ch.bass, S * 7);
    if (s === 8) this._hbass(t, ch.bass + 7, S * 7);
    // 沙鈴（反拍重一點），B 段加木魚
    if (s % 2 === 0) this._shaker(t, s % 4 === 2 ? 0.9 : 0.5);
    if (isB && (s === 4 || s === 12)) this._wood(t, 0.8);
    if (sec.i === 0 && s === 0 && sec.name !== 'a') this._bell(t, ch.n[3] + 12, 0.6);
    // 長笛主旋律；A' 段加鐵琴高八度
    const mel = isB ? H_MEL_B[sec.i] : H_MEL_A[sec.i];
    for (const [ps, m, len] of mel) if (ps === s) {
      this._flute(t, m, len * S);
      if (sec.name === 'a2') this._bell(t, m + 12, 0.35);
    }
  }
  _harp(t, m, v = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = mtof(m); o2.type = 'sine'; o2.frequency.value = mtof(m) * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.6);
    this._env(g, t, 0.07 * HG * v, 0.003, 1.1);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.bus);
    const vs = ctx.createGain(); vs.gain.value = 0.5; g.connect(vs); vs.connect(this.verb);
    o.start(t); o2.start(t); o.stop(t + 1.3); o2.stop(t + 1.3);
  }
  _strings(t, notes, dur, v = 1) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 1700; f.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.028 * HG * v, t + 0.5); g.gain.setValueAtTime(0.028 * HG * v, t + dur - 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.35);
    f.connect(g); g.connect(this.bus); const vs = ctx.createGain(); vs.gain.value = 0.8; g.connect(vs); vs.connect(this.verb);
    for (const m of notes) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.45);
    }
  }
  _hbass(t, m, dur) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2 * HG, t + 0.02); g.gain.exponentialRampToValueAtTime(0.06 * HG, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.subBus); o.start(t); o.stop(t + dur + 0.05);
  }
  _flute(t, m, dur, v = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sine'; o.frequency.value = mtof(m); o2.type = 'triangle'; o2.frequency.value = mtof(m);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    // 慢慢出來的抖音
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.5, dur));
    lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
    f.type = 'lowpass'; f.frequency.value = 4200;
    const end = t + dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * HG * v, t + 0.07); g.gain.setValueAtTime(0.085 * HG * v, end - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.18);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(this.bus);
    // 吹氣聲
    const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = this.noise; nf.type = 'bandpass'; nf.frequency.value = mtof(m) * 2; nf.Q.value = 1.2;
    this._env(ng, t, 0.012 * v, 0.03, 0.18); n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 0.5); n.stop(t + 0.3);
    const vs = ctx.createGain(); vs.gain.value = 0.55; f.connect(vs); vs.connect(this.verb);
    const ds = ctx.createGain(); ds.gain.value = 0.25; f.connect(ds); ds.connect(this.delay);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(end + 0.25); }
  }
  _bell(t, m, v = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(m); o2.type = 'sine'; o2.frequency.value = mtof(m) * 2.76;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    this._env(g, t, 0.05 * HG * v, 0.002, 1.4);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.bus); const vs = ctx.createGain(); vs.gain.value = 0.6; g.connect(vs); vs.connect(this.verb);
    o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5);
  }
  _shaker(t, v = 1) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 7000; f.Q.value = 1.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * HG * v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(f); f.connect(g); g.connect(this.drums); n.start(t, Math.random() * 0.5); n.stop(t + 0.1);
  }
  _wood(t, v = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1150, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.05);
    this._env(g, t, 0.09 * HG * v, 0.001, 0.07); o.connect(g); g.connect(this.drums); o.start(t); o.stop(t + 0.1);
  }
  _riser(t, dur) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; n.loop = true; f.type = 'bandpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    n.connect(f); f.connect(g); g.connect(this.bus); n.start(t); n.stop(t + dur + 0.1);
  }

  // ---------------------------------------------------------------- 音色
  _env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  _kick(t, v = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    this._env(g, t, 1.0 * v, 0.003, 0.42); o.connect(g); g.connect(this.kickBus); o.start(t); o.stop(t + 0.48);
    if (this.duck && this.kickBus.gain.value > 0.5) { this.duck.gain.setValueAtTime(0.55, t); this.duck.gain.linearRampToValueAtTime(1, t + 0.22); }
    const c = ctx.createOscillator(), cg = ctx.createGain(); c.type = 'square'; c.frequency.value = 900;   // 敲擊感
    this._env(cg, t, 0.06 * v, 0.001, 0.012); c.connect(cg); cg.connect(this.kickBus); c.start(t); c.stop(t + 0.03);
  }
  _snare(t, v = 1) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 1300;
    this._env(g, t, 0.55 * v, 0.002, 0.17); n.connect(f); f.connect(g); g.connect(this.drums); n.start(t, Math.random() * 0.5); n.stop(t + 0.22);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.1);
    this._env(og, t, 0.35 * v, 0.002, 0.1); o.connect(og); og.connect(this.drums); o.start(t); o.stop(t + 0.14);
    const sg = ctx.createGain(); sg.gain.value = 0.25 * v; g.connect(sg); sg.connect(this.verb);
  }
  _hat(t, open, v = 1) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = open ? 7200 : 8500;
    this._env(g, t, (open ? 0.16 : 0.11) * v, 0.001, open ? 0.2 : 0.045); n.connect(f); f.connect(g); g.connect(this.drums);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.26);
  }
  _crash(t) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 4500;
    this._env(g, t, 0.14, 0.002, 1.4); n.connect(f); f.connect(g); g.connect(this.drums); g.connect(this.verb); n.start(t); n.stop(t + 1.5);
  }
  _bass(t, m, dur, root = m) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(m); o2.type = 'square'; o2.frequency.value = mtof(m); o2.detune.value = -7;
    const o2g = ctx.createGain(); o2g.gain.value = 0.5;
    f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(1900, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    this._env(g, t, 0.34, 0.004, dur);
    o.connect(f); o2.connect(o2g); o2g.connect(f); f.connect(g); g.connect(this.bassBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    // 超低音：根音低八度的正弦波（八分音符都打，讓低頻厚實）
    const sub = ctx.createOscillator(), sg = ctx.createGain();
    sub.type = 'sine'; sub.frequency.value = mtof(root);   // 根音（A1 約 55 Hz）
    sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.17, t + 0.01); sg.gain.setValueAtTime(0.15, t + dur * 0.7); sg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    sub.connect(sg); sg.connect(this.subBus); sub.start(t); sub.stop(t + dur + 0.06);
  }
  _arp(t, m, v = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.frequency.value = 3800; f.Q.value = 2;
    this._env(g, t, 0.068 * v, 0.002, 0.13);
    o.connect(f); f.connect(g); g.connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.6; g.connect(send); send.connect(this.delay);
    o.start(t); o.stop(t + 0.18);
  }
  _pad(t, notes, dur) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 1300; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.6); g.gain.setValueAtTime(0.06, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
    f.connect(g); g.connect(this.bus); const vs = ctx.createGain(); vs.gain.value = 0.7; g.connect(vs); vs.connect(this.verb);
    for (const m of notes) for (const det of [-8, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.5);
    }
  }
  _lead(t, m, dur, v = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m); o2.detune.value = 9;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(18, t + Math.min(0.35, dur));
    lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
    f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(1200, t); f.frequency.linearRampToValueAtTime(3600, t + 0.06); f.frequency.exponentialRampToValueAtTime(1800, t + dur);
    const end = t + dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * v, t + 0.012); g.gain.setValueAtTime(0.075 * v, end - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.bus);
    const ds = ctx.createGain(); ds.gain.value = 0.45; g.connect(ds); ds.connect(this.delay);
    const vs = ctx.createGain(); vs.gain.value = 0.5; g.connect(vs); vs.connect(this.verb);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(end + 0.15); }
  }
}
