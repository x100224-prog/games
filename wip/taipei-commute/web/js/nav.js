// 導航：在全市路網（data/nav.json，約 4 萬個路口、5 萬段路）上找最快路線（A*，依道路速限估時間，遵守單行道）。
// 路線經過已載入的小格時用真實道路形狀，還沒載入的部分用路口連線。
// 也提供「下一個轉彎」的提示（左轉／右轉、距離、路名）。

export class Nav {
  static async load(url = 'data/nav.json') {
    const r = await fetch(url); if (!r.ok) throw new Error('nav ' + r.status);
    return new Nav(await r.json());
  }

  constructor(d) {
    const N = d.nodes.length / 2, E = d.edges.length / 6;
    this.N = N; this.E = E;
    this.nx = new Float32Array(N); this.nz = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.nx[i] = d.nodes[i * 2]; this.nz[i] = d.nodes[i * 2 + 1]; }
    this.ea = new Int32Array(E); this.eb = new Int32Array(E); this.elen = new Float32Array(E);
    this.ecls = new Uint8Array(E); this.eow = new Uint8Array(E); this.espd = new Float32Array(E);
    for (let k = 0; k < E; k++) {
      const o = k * 6; this.ea[k] = d.edges[o]; this.eb[k] = d.edges[o + 1]; this.elen[k] = d.edges[o + 2];
      this.ecls[k] = d.edges[o + 3]; this.eow[k] = d.edges[o + 4]; this.espd[k] = d.edges[o + 5] || 30;
    }
    // 鄰接表（CSR）：每個路口可以走出去的 (路段, 方向)
    const deg = new Int32Array(N + 1);
    for (let k = 0; k < E; k++) { deg[this.ea[k] + 1]++; if (!this.eow[k]) deg[this.eb[k] + 1]++; }
    for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
    this.off = deg; this.adjE = new Int32Array(deg[N]); this.adjD = new Int8Array(deg[N]);
    const fill = deg.slice(0, N);
    for (let k = 0; k < E; k++) {
      let p = fill[this.ea[k]]++; this.adjE[p] = k; this.adjD[p] = 1;
      if (!this.eow[k]) { p = fill[this.eb[k]]++; this.adjE[p] = k; this.adjD[p] = -1; }
    }
    // 找最近路口用的格網（100 m）
    this.grid = new Map();
    for (let i = 0; i < N; i++) { const key = Math.floor(this.nx[i] / 100) * 100003 + Math.floor(this.nz[i] / 100); let a = this.grid.get(key); if (!a) this.grid.set(key, a = []); a.push(i); }
  }

  /** 走這段路要幾秒（巷弄、服務道路加權，避免一直鑽小巷）。 */
  cost(k) {
    const v = Math.max(15, this.espd[k]) / 3.6, c = this.ecls[k];
    return this.elen[k] / v * (c >= 6 ? 1.6 : c === 5 ? 1.15 : 1) + 2.5;   // 每過一個路口約多 2.5 秒
  }

  nearestNode(x, z, maxD = 400) {
    let best = -1, bd = maxD * maxD;
    const gx = Math.floor(x / 100), gz = Math.floor(z / 100), r = Math.ceil(maxD / 100);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const a = this.grid.get((gx + dx) * 100003 + gz + dz); if (!a) continue;
      for (const i of a) { const d = (this.nx[i] - x) ** 2 + (this.nz[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    return best;
  }

  /**
   * 從 start 到 goal 的最快路線。start：{ edge, s, fwdOK, backOK }（目前所在的路段）或 { x, z }。
   * goal：{ x, z }。回傳 { steps: [{ k, dir }], time, len } 或 null。
   */
  route(start, goal) {
    const N = this.N, g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), fromD = new Int8Array(N);
    const heap = [], push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const goalN = this.nearestNode(goal.x, goal.z, 600); if (goalN < 0) return null;
    const gx = this.nx[goalN], gz = this.nz[goalN], H = (i) => Math.hypot(this.nx[i] - gx, this.nz[i] - gz) / (110 / 3.6);
    const seed = [];
    if (start.edge && start.edge.id < this.E) {
      const k = start.edge.id, frac = Math.max(0, Math.min(1, start.s / Math.max(1, this.elen[k]))), c = this.cost(k);
      if (start.fwdOK !== false) seed.push([this.eb[k], c * (1 - frac), k, 1]);
      if (start.backOK !== false && !this.eow[k]) seed.push([this.ea[k], c * frac, k, -1]);
    }
    if (!seed.length) { const n0 = this.nearestNode(start.x, start.z, 300); if (n0 < 0) return null; seed.push([n0, 0, -1, 0]); }
    const startEdge = new Map();
    for (const [n, c, k, d] of seed) { if (c < g[n]) { g[n] = c; from[n] = -2; startEdge.set(n, [k, d]); push(c + H(n), n); } }
    let it = 0;
    while (heap.length) {
      const [, i] = pop(); if (i === goalN) break;
      if (++it > 400000) break;
      for (let p = this.off[i]; p < this.off[i + 1]; p++) {
        const k = this.adjE[p], d = this.adjD[p], j = d > 0 ? this.eb[k] : this.ea[k], ng = g[i] + this.cost(k);
        if (ng < g[j]) { g[j] = ng; from[j] = k; fromD[j] = d; push(ng + H(j), j); }
      }
    }
    if (!isFinite(g[goalN])) return null;
    const steps = []; let n = goalN, guard = 0;
    while (from[n] !== -2 && guard++ < 100000) { const k = from[n], d = fromD[n]; steps.push({ k, dir: d }); n = d > 0 ? this.ea[k] : this.eb[k]; }
    const se = startEdge.get(n); if (se && se[0] >= 0) steps.push({ k: se[0], dir: se[1], first: true });
    steps.reverse();
    let len = 0; for (const s of steps) len += this.elen[s.k];
    return { steps, time: g[goalN], len, goalNode: goalN, goal: { x: goal.x, z: goal.z } };
  }

  /** 路線畫成折線 [x,z,...]：已載入的路段用真實形狀。 */
  polyline(rt, world, startPos, startS) {
    const out = []; if (startPos) out.push(startPos.x, startPos.z);
    for (const st of rt.steps) {
      const e = world && world.edges.get(st.k);
      if (e && !e.dead) {
        const p = e.pts, n = p.length / 2;
        // 第一段：只取車子前方的部分（不要把車子後面那段也算進路線）
        const keep = (i) => !(st.first && startS !== undefined) || (st.dir > 0 ? e.cum[i] > startS + 1 : e.cum[i] < startS - 1);
        if (st.dir > 0) { for (let i = 0; i < n; i++) if (keep(i)) out.push(p[i * 2], p[i * 2 + 1]); }
        else for (let i = n - 1; i >= 0; i--) if (keep(i)) out.push(p[i * 2], p[i * 2 + 1]);
      } else {
        const a = st.dir > 0 ? this.ea[st.k] : this.eb[st.k], b = st.dir > 0 ? this.eb[st.k] : this.ea[st.k];
        out.push(this.nx[a], this.nz[a], this.nx[b], this.nz[b]);
      }
    }
    out.push(rt.goal.x, rt.goal.z);
    return out;
  }
}

/** 沿折線找最近點的位置（回傳索引與到折線的距離），只往前找。 */
export function polyProgress(poly, x, z, i0 = 0, window = 400) {
  let bi = i0, bd = Infinity, bt = 0;
  for (let i = Math.max(0, i0); i + 3 < poly.length && i < i0 + window; i += 2) {
    const ax = poly[i], az = poly[i + 1], bx = poly[i + 2], bz = poly[i + 3], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  return { i: bi, t: bt, d: bd };
}

/** 從折線上的位置往前找下一個轉彎（轉向超過 35 度的點）。回傳 { turn: 'left'|'right'|'uturn', dist, x, z } 或 null。 */
export function nextTurn(poly, prog, maxLook = 1500) {
  const seg = (i) => { const dx = poly[i + 2] - poly[i], dz = poly[i + 3] - poly[i + 1]; return [dx, dz, Math.hypot(dx, dz)]; };
  let i = prog.i, [dx0, dz0, L0] = seg(i), acc = L0 * (1 - prog.t);
  // 用 15 m 以上的長度判斷方向，避免路口小折角誤判
  let hx = dx0, hz = dz0;
  for (i += 2; i + 3 < poly.length && acc < maxLook; i += 2) {
    const [dx, dz, L] = seg(i); if (L < 0.5) continue;
    const a0 = Math.atan2(hz, hx), a1 = Math.atan2(dz, dx); let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 0.61) {
      // 地圖座標 z 往南，所以 da > 0 是往右轉
      return { turn: Math.abs(da) > 2.6 ? 'uturn' : da > 0 ? 'right' : 'left', dist: acc, x: poly[i], z: poly[i + 1], idx: i };
    }
    if (L > 15) { hx = dx; hz = dz; }
    acc += L;
  }
  return null;
}
