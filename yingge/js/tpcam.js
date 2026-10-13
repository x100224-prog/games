// 第三人稱攝影機：繞著主角轉，滑鼠／拖曳改角度，碰到牆會自動拉近。
export class ThirdPersonCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0.22; this.dist = 4.4; this.minPitch = -0.35; this.maxPitch = 1.1;
    this.curDist = this.dist; this.height = 1.55;
  }

  /** 視角輸入（像素位移）。 */
  input(dx, dy) {
    this.yaw -= dx * 0.0042; this.pitch += dy * 0.0032;
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
  }

  /** 攝影機往前看的水平方向。 */
  get fwdX() { return -Math.sin(this.yaw); }
  get fwdZ() { return -Math.cos(this.yaw); }

  /**
   * blocked(x, y, z) 回傳 true 代表攝影機不能放在那裡（牆裡、地底）。
   * groundAt(x, z) 回傳地面高度。
   */
  update(dt, tx, ty, tz, blocked, groundAt) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const hx = tx, hy = ty + this.height, hz = tz;
    const dx = Math.sin(this.yaw) * cp, dy = sp, dz = Math.cos(this.yaw) * cp;
    let free = this.dist;
    const N = 18;
    for (let i = 1; i <= N; i++) {
      const d = this.dist * i / N;
      const x = hx + dx * d, y = hy + dy * d, z = hz + dz * d;
      if (blocked(x, y, z) || (groundAt && y < groundAt(x, z) + 0.25)) { free = Math.max(0.6, this.dist * (i - 1) / N - 0.15); break; }
    }
    // 拉近要快、退回要慢，避免鏡頭抖動
    this.curDist += (free - this.curDist) * Math.min(1, dt * (free < this.curDist ? 18 : 3));
    const d = this.curDist;
    this.camera.position.set(hx + dx * d, hy + dy * d, hz + dz * d);
    this.camera.lookAt(hx, hy - 0.15, hz);
  }
}
