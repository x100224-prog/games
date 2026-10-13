// 引擎音效：全部用 Web Audio 即時合成（沒有用任何錄音檔）。
//   油車：四缸引擎，一個工作循環（曲軸轉兩圈）點火 4 次 → 點火頻率 = 轉速 / 30 Hz。
//         用一組諧波模擬點火脈衝（第 4、8、12… 次諧波最強，其他次諧波讓聲音粗糙一點），
//         再加進氣／排氣噪音、低頻震動、變速箱齒輪聲。
//         轉速由「車速 × 檔位齒比」決定，6 速自動變速箱：油門踩越深越晚換檔，換檔瞬間轉速往下掉。
//   電動車：馬達與變頻器的嗡嗡聲，音高跟車速走，沒有換檔。
//   兩種都有路噪（跟車速成正比）；坐在車內聲音比較悶。

const PREF_KEY = 'drive-sfx';
const IDLE = 760, RED = 6200;
const KG = [0, 470, 268, 176, 134, 110, 92];   // 各檔位：每 1 m/s 車速對應的引擎轉速（含終傳比、輪胎半徑）
const KR = 420;                                  // 倒車檔

export class EngineSound {
  constructor(kind = 'gas') {
    this.kind = kind;
    let p = {}; try { p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (err) { p = {}; }
    this.on = p.on !== false; this.volume = typeof p.vol === 'number' ? p.vol : 0.45;
    this.ctx = null; this.onChange = null;
    this.running = false; this.phase = 'off'; this.phaseT = 0;
    this.rpm = 0; this.gear = 1; this.load = 0; this.shiftT = 0; this.v = 0;
  }

  /** 接上 AudioContext（跟配樂共用同一個）。 */
  attach(ctx) {
    if (this.ctx === ctx) return;
    this.ctx = ctx; this._build();
  }

  setKind(kind) { this.kind = kind; }
  toggle() { this.setOn(!this.on); return this.on; }
  setOn(on) {
    this.on = on;
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ on, vol: this.volume })); } catch (err) { /* 存不了就算了 */ }
    if (this.ctx) { const t = this.ctx.currentTime; this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(on ? this.volume : 0, t, 0.05); if (on) this.ctx.resume(); }
    if (this.onChange) this.onChange(on);
  }

  /** 上車：發動引擎（油車有啟動馬達的聲音）。 */
  ignite() {
    if (this.running) return;
    this.running = true; this.gear = 1; this.shiftT = 0;
    this.phase = this.kind === 'ev' ? 'run' : 'crank'; this.phaseT = 0;
  }
  /** 下車：熄火。 */
  shutdown() { this.running = false; this.phase = 'off'; }

  _build() {
    const ctx = this.ctx;
    this.out = ctx.createGain(); this.out.gain.value = this.on ? this.volume : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
    this.out.connect(comp); comp.connect(ctx.destination);
    this.cabin = ctx.createBiquadFilter(); this.cabin.type = 'lowpass'; this.cabin.frequency.value = 9000; this.cabin.Q.value = 0.5;   // 車內／車外
    this.cabin.connect(this.out);
    this.tap = ctx.createAnalyser(); this.tap.fftSize = 2048; this.out.connect(this.tap);   // 測試用：量音量

    // ---- 油車：點火脈衝（工作循環的諧波）
    const H = 48, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let n = 1; n <= H; n++) {
      let a;
      if (n % 4 === 0) a = 1.0 / Math.pow(n / 4, 0.85);           // 點火頻率與其倍頻
      else if (n % 2 === 0) a = 0.22 / Math.pow(n / 2, 0.7);       // 半階：各缸不平均
      else a = 0.08 / Math.pow(n, 0.5);                            // 雜散：粗糙感
      const ph = rnd() * Math.PI * 2; re[n] = a * Math.cos(ph); im[n] = a * Math.sin(ph);
    }
    this.cycle = ctx.createOscillator(); this.cycle.setPeriodicWave(ctx.createPeriodicWave(re, im, { disableNormalization: false })); this.cycle.frequency.value = 6;
    this.pre = ctx.createGain(); this.pre.gain.value = 0.8;
    const sh = ctx.createWaveShaper(), cv = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; cv[i] = Math.tanh(2.0 * x) / Math.tanh(2.0); }
    sh.curve = cv; sh.oversample = '2x';
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 1.1; this.lp.frequency.value = 600;
    this.lp2 = ctx.createBiquadFilter(); this.lp2.type = 'lowpass'; this.lp2.Q.value = 0.5; this.lp2.frequency.value = 900;   // 兩段濾波，高頻收得乾淨，不會像電動刮鬍刀
    this.body = ctx.createGain(); this.body.gain.value = 0;
    this.cycle.connect(this.pre); this.pre.connect(sh); sh.connect(this.lp); this.lp.connect(this.lp2); this.lp2.connect(this.body); this.body.connect(this.cabin);
    // 低頻震動（點火頻率的正弦波）
    this.sub = ctx.createOscillator(); this.sub.type = 'sine'; this.sub.frequency.value = 25;
    this._jitTargets = [this.cycle.detune, this.sub.detune];
    this.subG = ctx.createGain(); this.subG.gain.value = 0; this.sub.connect(this.subG); this.subG.connect(this.out);
    // 進氣／排氣噪音：帶通噪音，用點火頻率做振幅調變（一陣一陣的）
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource(); this.noise.buffer = nb; this.noise.loop = true;
    this.bp = ctx.createBiquadFilter(); this.bp.type = 'bandpass'; this.bp.Q.value = 0.9; this.bp.frequency.value = 400;
    this.roar = ctx.createGain(); this.roar.gain.value = 0;
    this.am = ctx.createOscillator(); this.am.type = 'sine'; this.am.frequency.value = 25;
    this._jitTargets.push(this.am.detune);
    this.amDepth = ctx.createGain(); this.amDepth.gain.value = 0; this.am.connect(this.amDepth); this.amDepth.connect(this.roar.gain);
    this.noise.connect(this.bp); this.bp.connect(this.roar); this.roar.connect(this.cabin);
    // 不規則感：真的引擎每一下點火都不完全一樣，用很慢的隨機訊號讓音高、音量微微飄動
    const jit = ctx.createBufferSource(); jit.buffer = nb; jit.loop = true; jit.playbackRate.value = 0.37;
    const jf = ctx.createBiquadFilter(); jf.type = 'lowpass'; jf.frequency.value = 7; jf.Q.value = 0.3;
    const jg = ctx.createGain(); jg.gain.value = 1400;      // 約 ±15 音分
    jit.connect(jf); jf.connect(jg); for (const p of this._jitTargets) jg.connect(p);
    // 音量的微動接在失真前的增益上（熄火時 body 音量是 0，就不會漏出聲音）
    this.jitter = jit; this.jitAmp = ctx.createGain(); this.jitAmp.gain.value = 3;
    jf.connect(this.jitAmp); this.jitAmp.connect(this.pre.gain);
    // 變速箱齒輪聲（很小聲，倒車時明顯）
    this.whine = ctx.createOscillator(); this.whine.type = 'triangle'; this.whine.frequency.value = 300;
    this.whineG = ctx.createGain(); this.whineG.gain.value = 0; this.whine.connect(this.whineG); this.whineG.connect(this.cabin);
    // 啟動馬達：約 10 Hz 的方波調變中頻噪音
    this.starterF = ctx.createBiquadFilter(); this.starterF.type = 'bandpass'; this.starterF.frequency.value = 520; this.starterF.Q.value = 1.4;
    this.starterG = ctx.createGain(); this.starterG.gain.value = 0;
    this.starterLfo = ctx.createOscillator(); this.starterLfo.type = 'square'; this.starterLfo.frequency.value = 10.5;
    this.starterDepth = ctx.createGain(); this.starterDepth.gain.value = 0; this.starterLfo.connect(this.starterDepth); this.starterDepth.connect(this.starterG.gain);
    this.noise.connect(this.starterF); this.starterF.connect(this.starterG); this.starterG.connect(this.out);

    // ---- 電動車：馬達與變頻器
    this.mot = ctx.createOscillator(); this.mot.type = 'triangle'; this.mot.frequency.value = 40;
    this.inv = ctx.createOscillator(); this.inv.type = 'sine'; this.inv.frequency.value = 120;
    this.motG = ctx.createGain(); this.motG.gain.value = 0; this.invG = ctx.createGain(); this.invG.gain.value = 0;
    this.mot.connect(this.motG); this.inv.connect(this.invG); this.motG.connect(this.cabin); this.invG.connect(this.cabin);

    // ---- 路噪（兩種車都有）
    this.roadF = ctx.createBiquadFilter(); this.roadF.type = 'lowpass'; this.roadF.frequency.value = 500; this.roadF.Q.value = 0.4;
    this.roadG = ctx.createGain(); this.roadG.gain.value = 0;
    this.noise.connect(this.roadF); this.roadF.connect(this.roadG); this.roadG.connect(this.cabin);

    for (const o of [this.cycle, this.sub, this.noise, this.am, this.whine, this.starterLfo, this.mot, this.inv, this.jitter]) o.start();
  }

  /**
   * 每幀呼叫。s = { v: 車速 m/s（倒車為負）, throttle 0..1, brake 0..1, cockpit: 是否在車內視角 }
   * at：排程時間（預設現在；離線算音檔時由外部給）
   */
  update(dt, s, at) {
    // ---- 轉速與檔位（就算沒接上音訊也算，方便測試）
    const v = s.v || 0, av = Math.abs(v), thr = this.running ? Math.max(0, Math.min(1, s.throttle || 0)) : 0;
    this.v = v; this.phaseT += dt; this.shiftT = Math.max(0, this.shiftT - dt);
    this.load += (thr - this.load) * Math.min(1, dt * 7);
    // 換檔判斷用比較慢的油門平均：鍵盤一下按一下放，不會一直跳檔
    this.shThr = (this.shThr || 0) + (thr - (this.shThr || 0)) * Math.min(1, dt * 0.9);
    this.sinceShift = (this.sinceShift || 0) + dt;
    let target = 0;
    if (this.kind === 'ev') {
      target = this.running ? av : 0;
    } else if (this.phase === 'crank') {
      target = 230 + Math.sin(this.phaseT * 60) * 30;
      if (this.phaseT > 0.75) { this.phase = 'catch'; this.phaseT = 0; }
    } else if (this.phase === 'catch') {
      target = this.phaseT < 0.35 ? 1450 : IDLE + 120;
      if (this.phaseT > 1.4) { this.phase = 'run'; this.phaseT = 0; }
    } else if (this.phase === 'run') {
      if (v < -0.3) { this.gear = -1; target = Math.max(IDLE + thr * 600, av * KR); }
      else {
        if (this.gear < 1) this.gear = 1;
        for (let k = 0; k < 6; k++) {
          // 升檔點：輕踩約 1900 轉、全油門約 5200 轉；降檔點要夠低，降完不會馬上又升回去
          const st = this.shThr, g = KG[this.gear] * Math.max(0, v), up = 1900 + st * 3300, down = 1000 + st * 1100;
          if (this.gear < 6 && (g > up && this.sinceShift > 0.9 || g > RED - 150)) { this.gear++; this.shiftT = 0.4; this.sinceShift = 0; }
          else if (this.gear > 1 && (g < down && this.sinceShift > 0.9 || g < 850)) { this.gear--; this.shiftT = 0.25; this.sinceShift = 0; }
          else break;
        }
        const rg = KG[this.gear] * Math.max(0, v);
        // 一檔起步時液體扭力轉換器打滑，轉速先衝上去；其他檔位只有一點點滑差
        const slip = this.gear === 1 ? IDLE + thr * (1500 + 900 * thr) : IDLE + thr * 350;
        target = Math.max(IDLE, rg * (1 + 0.05 * thr), slip);
      }
      target = Math.min(RED, target);
    }
    if (this.kind !== 'ev') {
      const up = target > this.rpm;
      this.rpm += (target - this.rpm) * Math.min(1, dt * (this.phase === 'catch' ? 7 : up ? 5 : (this.shiftT > 0.2 ? 14 : 6)));
      if (!this.running) this.rpm += (0 - this.rpm) * Math.min(1, dt * 3);
    } else this.rpm = av;
    if (!this.ctx) return;

    // ---- 送到音訊節點
    const t = at !== undefined ? at : this.ctx.currentTime, k = 0.035;
    const set = (p, val, tc = k) => p.setTargetAtTime(val, t, tc);
    set(this.cabin.frequency, s.cockpit ? 1500 : 9000, 0.15);
    const road = Math.min(1, av / 30);
    set(this.roadG.gain, 0.12 * road * road + 0.02 * road, 0.1);
    set(this.roadF.frequency, 260 + av * 22, 0.2);
    if (this.kind === 'ev') {
      for (const g of [this.body, this.subG, this.roar, this.amDepth, this.whineG, this.starterG, this.starterDepth]) set(g.gain || g, 0);
      const on = this.running ? 1 : 0, ld = 0.35 + 0.65 * this.load;
      set(this.mot.frequency, 32 + av * 36); set(this.inv.frequency, 680 + av * 95);
      set(this.motG.gain, on * (0.03 + 0.12 * Math.min(1, av / 12)) * ld, 0.08);
      set(this.invG.gain, on * (0.01 + 0.04 * Math.min(1, av / 20)) * ld, 0.08);
      return;
    }
    set(this.motG.gain, 0); set(this.invG.gain, 0);
    const rpm = Math.max(1, this.rpm), fire = rpm / 30, rn = Math.min(1, rpm / RED);
    // 換檔瞬間：扭力中斷，聲音稍微收小
    const ld = this.load * (this.shiftT > 0.25 ? 0.45 : 1), alive = this.phase === 'off' ? Math.min(1, rpm / IDLE) : 1;
    set(this.cycle.frequency, rpm / 120); set(this.sub.frequency, fire); set(this.am.frequency, fire);
    set(this.whine.frequency, rpm / 60 * 7.3);
    set(this.pre.gain, 0.55 + ld * 1.5);
    set(this.lp.frequency, 220 + rpm * 0.26 + ld * 850); set(this.lp2.frequency, 400 + rpm * 0.4 + ld * 1200);
    set(this.body.gain, alive * (0.13 + 0.2 * ld + 0.1 * rn));
    set(this.subG.gain, alive * (0.10 * (1 - rn * 0.6) + 0.05 * ld));
    set(this.bp.frequency, 300 + rpm * 0.35 + ld * 500);
    const roar = alive * (0.012 + 0.11 * ld * (0.35 + rn));
    set(this.roar.gain, roar * 0.55); set(this.amDepth.gain, roar * 0.45);
    set(this.whineG.gain, alive * (this.gear === -1 ? 0.03 : 0.004 + 0.008 * rn));
    const cr = this.phase === 'crank' ? 1 : 0;
    set(this.starterG.gain, cr * 0.09, 0.02); set(this.starterDepth.gain, cr * 0.08, 0.02);
  }

  /** 目前輸出音量（RMS，測試用）。 */
  level() {
    if (!this.tap) return 0;
    const a = new Float32Array(this.tap.fftSize); this.tap.getFloatTimeDomainData(a);
    let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length);
  }

  /**
   * 離線算一段引擎聲（測試、試聽用）。script(t) 回傳 { throttle, brake, ignite?, shutdown?, cockpit }，
   * 車速用跟遊戲一樣的加速公式模擬。回傳 { buffer, log }。
   */
  static async render(sec, script, kind = 'gas', spec = { accel: 3.1, maxSpeed: 160 / 3.6 }) {
    const sr = 44100, ctx = new OfflineAudioContext(1, Math.ceil(sr * sec), sr), e = new EngineSound(kind);
    e.on = true; e.attach(ctx);
    const dt = 1 / 60, log = []; let v = 0;
    for (let t = 0; t < sec; t += dt) {
      const c = script(t);
      if (c.ignite) e.ignite(); if (c.shutdown) e.shutdown();
      const thr = e.running ? c.throttle || 0 : 0, br = c.brake || 0;
      let a = thr > 0 ? spec.accel * thr * Math.max(0, 1 - Math.pow(Math.max(0, v) / spec.maxSpeed, 1.4)) : 0;
      if (br > 0) a -= 9.5 * br;
      if (!thr && !br) a -= 0.35 + 0.012 * v * v * 0.25;
      v = Math.max(0, v + a * dt);
      e.update(dt, { v, throttle: thr, brake: br, cockpit: !!c.cockpit }, t);
      if (Math.round(t * 60) % 6 === 0) log.push({ t: +t.toFixed(2), kmh: +(v * 3.6).toFixed(1), rpm: Math.round(e.rpm), gear: e.gear, phase: e.phase });
    }
    return { buffer: await ctx.startRendering(), log };
  }
}
