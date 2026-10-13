// 輸入：鍵盤、滑鼠（視角）、觸控（虛擬搖桿與按鈕）。
export class Input {
  constructor(canvas, touchRoot) {
    this.keys = new Set(); this.hit = new Set();
    this.lookX = 0; this.lookY = 0;
    this.joyX = 0; this.joyY = 0; this.tGas = 0; this.tBrake = 0;
    this.touch = false; this.locked = false; this.enabled = false;
    const down = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.hit.add(e.code);
      this.keys.add(e.code);
      if (this.enabled && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // 滑鼠：能鎖定游標就鎖定，否則按住拖曳
    let dragging = false;
    canvas.addEventListener('mousedown', () => {
      dragging = true;
      if (this.enabled && !this.noLock && !this.touch && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* 不支援就用拖曳 */ } }
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', (e) => { if (this.locked || dragging) { this.lookX += e.movementX || 0; this.lookY += e.movementY || 0; } });
    // 觸控
    const joy = touchRoot.querySelector('#joy'), knob = touchRoot.querySelector('#joyKnob');
    let joyId = null, lookId = null, lx = 0, ly = 0, jx0 = 0, jy0 = 0;
    const showTouch = () => { if (!this.touch) { this.touch = true; touchRoot.hidden = false; document.body.classList.add('touch'); } };
    canvas.addEventListener('touchstart', (e) => {
      showTouch();
      for (const t of e.changedTouches) if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      e.preventDefault();
    }, { passive: false });
    joy.addEventListener('touchstart', (e) => { showTouch(); const t = e.changedTouches[0]; joyId = t.identifier; const r = joy.getBoundingClientRect(); jx0 = r.left + r.width / 2; jy0 = r.top + r.height / 2; move(t); e.preventDefault(); }, { passive: false });
    const move = (t) => {
      const R = 46; let dx = (t.clientX - jx0) / R, dy = (t.clientY - jy0) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      this.joyX = dx; this.joyY = dy; knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
    };
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) move(t);
        else if (t.identifier === lookId) { this.lookX += (t.clientX - lx) * 2.2; this.lookY += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { joyId = null; this.joyX = this.joyY = 0; knob.style.transform = ''; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    const hold = (id, on, off) => {
      const el = touchRoot.querySelector(id); if (!el) return;
      el.addEventListener('touchstart', (e) => { showTouch(); on(); e.preventDefault(); }, { passive: false });
      el.addEventListener('touchend', (e) => { off(); e.preventDefault(); }, { passive: false });
      el.addEventListener('touchcancel', off);
    };
    hold('#btnGas', () => { this.tGas = 1; }, () => { this.tGas = 0; });
    hold('#btnBrake', () => { this.tBrake = 1; }, () => { this.tBrake = 0; });
    hold('#btnAct', () => { this.hit.add('KeyE'); }, () => {});
    hold('#btnCam', () => { this.hit.add('KeyC'); }, () => {});
    hold('#btnMap', () => { this.hit.add('KeyM'); }, () => {});
  }

  has(...codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }
  /** 這一幀剛按下（只回報一次）。 */
  pressed(code) { return this.hit.has(code); }
  endFrame() { this.hit.clear(); this.lookX = 0; this.lookY = 0; }

  get forward() { return (this.has('KeyW', 'ArrowUp') ? 1 : 0) - (this.has('KeyS', 'ArrowDown') ? 1 : 0) - this.joyY; }
  get strafe() { return (this.has('KeyD', 'ArrowRight') ? 1 : 0) - (this.has('KeyA', 'ArrowLeft') ? 1 : 0) + this.joyX; }
  get run() { return this.has('ShiftLeft', 'ShiftRight'); }
  releaseLock() { if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (err) { /* ignore */ } } }
}
