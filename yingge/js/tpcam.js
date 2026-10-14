// 第三人稱攝影機：繞著主角轉，滑鼠／拖曳改角度，碰到牆會自動拉近。
export class ThirdPersonCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0.22; this.dist = 4.4; this.minPitch = -0.35; this.maxPitch = 1.1;
    this.curDist = this.dist; this.height = 1.55; this.minDist = 1.4;
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
    const N = 18;
    // 沿著某個方向找「從人物到鏡頭之間第一個被擋住的位置」
    const freeAt = (yaw) => {
      const ex = Math.sin(yaw) * cp, ez = Math.cos(yaw) * cp;
      for (let i = 1; i <= N; i++) {
        const d = this.dist * i / N, x = hx + ex * d, y = hy + dy * d, z = hz + ez * d;
        if (blocked(x, y, z) || (groundAt && y < groundAt(x, z) + 0.25)) return Math.max(this.minDist, this.dist * (i - 1) / N - 0.15);
      }
      return this.dist;
    };
    // 預判：正在轉視角時，先看「0.3 秒後」鏡頭會轉到哪裡，提早慢慢拉近，不要等撞進牆才猛拉
    const yawVel = dt > 0 ? Math.atan2(Math.sin(this.yaw - (this._yawPrev ?? this.yaw)), Math.cos(this.yaw - (this._yawPrev ?? this.yaw))) / dt : 0;
    this._yawPrev = this.yaw;
    const lead = Math.max(-0.7, Math.min(0.7, yawVel * 0.3));
    let free = freeAt(this.yaw);
    if (Math.abs(lead) > 0.05) free = Math.min(free, freeAt(this.yaw + lead), freeAt(this.yaw + lead / 2));
    // 鏡頭被牆擋住時拉近、空出來再退回。原本拉近是「瞬間」，在巷子裡走一分鐘會突然拉近十幾次，
    // 這種玩家沒操作的鏡頭跳動容易讓人暈。改成：
    //   ・拉近有速度上限（每秒最多 7 m）、退回很慢（每秒 1.2 m）
    //   ・空出來後要持續 0.5 秒才開始退回（避免走過門口、轉角時一下近一下遠）
    //   ・最近只拉到 1.4 m，不會鑽進人物頭裡
    //   ・只有鏡頭本身已經在牆裡（會看到建物內部）才快速拉近
    const cd = this.curDist, inWall = blocked(hx + dx * cd, hy + dy * cd, hz + dz * cd);
    if (free < this.curDist) { this.curDist = Math.max(free, this.curDist - (inWall ? 30 : 7) * dt); this._clearT = 0; }
    else if (free > this.curDist + 0.05) { this._clearT = (this._clearT || 0) + dt; if (this._clearT > 0.5) this.curDist = Math.min(free, this.curDist + 1.2 * dt); }
    else this._clearT = 0;
    const d = this.curDist;
    this.camera.position.set(hx + dx * d, hy + dy * d, hz + dz * d);
    this.camera.lookAt(hx, hy - 0.15, hz);
  }
}
