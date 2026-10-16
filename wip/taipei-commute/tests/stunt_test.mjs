// 飛天跑車特技實測：推進器 0→100、飛越距離、空中翻轉、大樓外牆垂直開上屋頂、屋頂飛下、高架橋底倒著開、燃料與花費、車流裡的飛天跑車。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const only = process.argv[2] || 'all';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | '))); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts/.test(m.text())) errs.push('console ' + m.text()); });
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name, ms = 2500) => { await ev(() => { window.__tc.noRender = false; }); await wait(ms); await page.screenshot({ path: `shots/st_${name}.png` }); await ev(() => { window.__tc.noRender = true; }); };
page.setDefaultTimeout(240000);
await page.goto('http://localhost:8768/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 120000 });
// 存檔：已經買了導航與飛天跑車
await ev(() => {
  const m = window.__tc.meta, di = 6, home = m.homes[di][0];
  const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 1800 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 3, econ: { money: 20000, owned: ['nav', 'roadster'], carKey: 'roadster', stuntFuel: 1 } }));
});
await page.reload();
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 120000 });
await ev(() => { window.__tc.noRender = true; });
await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; });
await wait(600); await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1200);
await page.keyboard.press('Enter'); await wait(500);
console.log('car', await ev(() => ({ key: window.__tc.car.spec.key, stunts: !!window.__tc.stunts, fuel: window.__tc.econ.stuntFuel })));

await ev(() => { const s = window.__tc.stunts, t = s.h.toast; window.__toasts = []; s.h.toast = (m, sec) => { window.__toasts.push(m + ' @mode=' + s.mode + (s.un ? ' s=' + s.un.s.toFixed(1) + '/' + s.un.e.len.toFixed(0) + ' lat=' + s.un.lat.toFixed(1) : '')); t(m, sec); }; });
await ev(() => { const s = window.__tc.stunts, o = s.h.crash; window.__crashes = []; s.h.crash = (f, m) => { window.__crashes.push(m + ' ' + f + ' mode=' + s.mode + ' vy=' + s.vel.y.toFixed(1) + ' roll=' + s.roll.toFixed(2) + ' att=' + (s.att ? (s.att.t / s.att.T).toFixed(2) : '-')); o(f, m); }; });
const st = () => ev(() => { const { car, stunts, econ } = window.__tc; return { mode: stunts.mode, x: +car.x.toFixed(1), y: +car.y.toFixed(2), z: +car.z.toFixed(1), kmh: Math.round(car.kmh), fuel: +econ.stuntFuel.toFixed(3), cost: Math.round(econ.day.stunt), repair: econ.day.repair || 0, cam: window.__tc.G.camMode }; });
const teleport = async (x, z, psi) => {
  await ev(([x, z, psi]) => { const { car, world, stunts } = window.__tc; stunts.reset(); car.place(x, z, psi, world.groundAt(x, z)); }, [x, z, psi]);
  await page.waitForFunction(([x, z]) => window.__tc.world.readyAround(x, z, 250), [x, z], { timeout: 200000 });
  await wait(600);
};
const simT = () => ev(() => window.__tc.G.clock * 10);   // 遊戲裡經過的秒數（時鐘 1 分鐘 = 現實 10 秒）
const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 40 }).then(() => true).catch(() => false);
const clearTraffic = () => ev(() => { window.__tc.traffic.clear(); window.__tc.traffic.factor = 0; });
// 找一段筆直的大路（cls ≤ 3、不在高架上、前後 120 m 都沒有建物擋），把車放在上面
const findRoad = () => ev(() => {
  const { world, car } = window.__tc; let best = null;
  world.forEdgesNear(car.x, car.z, 700, (e) => {
    if (best || e.cls > 3 || e.bridge || e.tunnel || e.len < 160) return;
    const p = e.pts, n = p.length / 2, dx = p[n * 2 - 2] - p[0], dz = p[n * 2 - 1] - p[1], L = Math.hypot(dx, dz);
    if (L < e.len * 0.97) return;   // 要直
    const ux = dx / L, uz = dz / L; let ok = true;
    for (let s = 10; s < L - 10; s += 5) { const x = p[0] + ux * s, z = p[1] + uz * s; if (world.buildingAt(x, z)) { ok = false; break; } }
    if (ok) best = { x: p[0] + ux * 15, z: p[1] + uz * 15, psi: Math.atan2(-ux, -uz), len: L };
  });
  return best;
});

if (only === 'all' || only === 'ground') {
  await clearTraffic();
  const r = await findRoad(); console.log('straight road', r);
  if (r) {
    await teleport(r.x, r.z, r.psi); await clearTraffic();
    // ---- 推進器 0 → 100 km/h
    const f0 = (await st()).fuel;
    await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
    let t0 = await simT();
    const ok100 = await until(() => window.__tc.car.kmh >= 100, null, 60000);
    const t100 = (await simT()) - t0;
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    console.log('boost 0-100 km/h (game seconds, includes 0.35 s pedal ramp):', ok100 && +t100.toFixed(2), 'fuel used', +(f0 - (await st()).fuel).toFixed(3));
    // 沒推進器：同樣的油門，0 → 100 要多久
    await teleport(r.x, r.z, r.psi); await clearTraffic();
    await page.keyboard.down('KeyW'); t0 = await simT();
    const okN = await until(() => window.__tc.car.kmh >= 100, null, 90000);
    await page.keyboard.up('KeyW');
    console.log('no boost 0-100 km/h (game seconds):', okN && +((await simT()) - t0).toFixed(2));
    // ---- 停著飛越（塞車時）
    await teleport(r.x, r.z, r.psi); await clearTraffic();
    const s0 = await st(); const fA = s0.fuel;
    await page.keyboard.press('KeyF');
    await until(() => window.__tc.stunts.mode === 'air' && window.__tc.stunts.hopT > 1.1 && window.__tc.stunts.hopT < 5, null, 30000);
    const mid = await st(); await shot('hop_mid', 1800);
    await until(() => window.__tc.stunts.mode !== 'air', null, 60000);
    const land = await st(), maxY = mid.y, modes = new Set([s0.mode, mid.mode, land.mode]), sawExt = mid.cam === 'stunt';
    const sim = await ev(() => window.__tc.stunts.hopT);
    console.log('hop from standstill:', { dist: land ? +Math.hypot(land.x - s0.x, land.z - s0.z).toFixed(1) : null, apex: +(maxY - s0.y).toFixed(1), simFlight: +sim.toFixed(2), landMode: land && land.mode, extCam: sawExt, fuelUsed: +(fA - (land || s0).fuel).toFixed(3), repair: land && land.repair, modes: [...modes] });
    await wait(1500); console.log('after landing cam:', (await st()).cam);
    // ---- 飛越＋空中翻轉
    await teleport(r.x, r.z, r.psi); await clearTraffic();
    const s1 = await st();
    await page.keyboard.press('KeyF'); await until(() => window.__tc.stunts.mode === 'air' && window.__tc.stunts.hopT > 0.3, null, 30000); await page.keyboard.press('KeyT');
    const rolls = [];
    for (let i = 0; i < 400; i++) { const m = await ev(() => [window.__tc.stunts.mode, +window.__tc.stunts.roll.toFixed(2)]); rolls.push(m[1]); if (m[0] !== 'air' && i > 3) break; await wait(30); }
    const land2 = await st();
    console.log('hop + flip:', { landed: land2 && land2.mode, repair: land2 && land2.repair, flips: await ev(() => window.__tc.stunts.stats.flips), maxRoll: Math.max(...rolls.map(Math.abs)).toFixed(2), dist: land2 ? +Math.hypot(land2.x - s1.x, land2.z - s1.z).toFixed(1) : null });
    // ---- 太晚翻轉：落地時還沒轉正 → 翻車＋修車費
    await teleport(r.x, r.z, r.psi); await clearTraffic();
    const rep0 = (await st()).repair;
    await page.keyboard.press('KeyF');
    await until(() => window.__tc.stunts.mode === 'air', null, 30000);
    // 快落地（離地 3 m 內、往下掉）才翻轉 → 來不及轉正
    await until(() => { const s = window.__tc.stunts; return s.mode === 'air' && s.vel.y < 0 && s.pos.y - s._below(s.pos.x, s.pos.z, s.pos.y).y < 3; }, null, 30000);
    await page.keyboard.press('KeyT');
    await until(() => window.__tc.stunts.mode !== 'air', null, 30000);
    console.log('late flip → crash fee:', (await st()).repair - rep0, 'crashes', await ev(() => window.__tc.stunts.stats.crashes));
    // ---- 塞車：前面排 10 台車，飛越後落地（看會不會壓到）
    await teleport(r.x, r.z, r.psi);
    const q = await ev(() => {
      const { car, traffic, world } = window.__tc; traffic.clear(); traffic.factor = 0;
      const o = {}; const e = world.nearestEdge(car.x, car.z, 10, null, o); if (!e) return null;
      // 在玩家前方同一條路上，每 6 m 一台
      const placed = [];
      for (let k = 1; k <= 10; k++) {
        const x = car.x + car.fwdX * (k * 6), z = car.z + car.fwdZ * (k * 6), o2 = {}; const e2 = world.nearestEdge(x, z, 10, null, o2); if (!e2) continue;
        const col = window.__tc.scene.children.find(o => o.isHemisphereLight).color.clone().setRGB(0.85, 0.85, 0.85);
        const c = { e: e2, dir: 1, lane: 0, s: o2.s, v: 0, fac: 1, x, y: world.groundAt(x, z), z, psi: car.psi, turn: null, next: null, wait: 0, color: col, scale: 1, flyer: false, hop: null, hopCd: 99, wreck: 999, pitch: 0 };
        e2.cars.push(c); traffic.cars.push(c); placed.push(k * 6);
      }
      return placed.length;
    });
    const s2 = await st(); console.log('queue placed', q);
    await shot('queue_before', 1800);
    await page.keyboard.press('KeyF');
    await until(() => window.__tc.stunts.mode === 'air' && window.__tc.stunts.hopT > 1.4 && window.__tc.stunts.hopT < 5, null, 30000);
    await shot('queue_over', 1800);
    await until(() => window.__tc.stunts.mode !== 'air', null, 60000);
    const land3 = await st();
    console.log('jump over 10-car queue:', { dist: land3 ? +Math.hypot(land3.x - s2.x, land3.z - s2.z).toFixed(1) : null, repair: land3 && land3.repair - s2.repair });
    await wait(1200); await shot('queue_after', 1800);
  }
}

if (only === 'all' || only === 'wall') {
  // ---- 大樓外牆：找一棟 25 m 以上、正面有路的大樓
  const tgt = await ev(() => {
    const { world, car } = window.__tc; let best = null;
    for (const c of world.cells.values()) {
      if (c.state !== 'ready' || !c.blds) continue;
      for (const b of c.blds) {
        if (b.h < 25 || b.h > 60 || Math.hypot((b.minx + b.maxx) / 2 - car.x, (b.minz + b.maxz) / 2 - car.z) > 800) continue;
        const p = b.pts, n = p.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1], L = Math.hypot(bx - ax, bz - az); if (L < 12) continue;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2; let nx = -(bz - az) / L, nz = (bx - ax) / L;
          if (world.buildingAt(mx + nx * 0.6, mz + nz * 0.6) === b) { nx = -nx; nz = -nz; }
          const px = mx + nx * 6.5, pz = mz + nz * 6.5;
          if (world.buildingAt(px, pz) || world.buildingAt(mx + nx * 3, mz + nz * 3)) continue;
          const s = world.surfaceAt(px, pz, world.groundAt(px, pz), {});
          if (!s || s.edge.bridge || s.edge.tunnel) continue;
          if (!best || b.h > best.h) best = { x: px, z: pz, psi: Math.atan2(nx, nz), h: b.h, top: b.y0 + b.h };
        }
      }
    }
    return best;
  });
  console.log('wall target', tgt);
  if (tgt) {
    await teleport(tgt.x, tgt.z, tgt.psi); await clearTraffic();
    const f0 = (await st()).fuel;
    await page.keyboard.press('KeyG'); await wait(300);
    console.log('after G', await st());
    await page.keyboard.down('KeyW');
    const t0 = await simT(), ss = [];
    const gotHigh = await until((top) => window.__tc.stunts.mode === 'wall' && window.__tc.car.y > top - 12, tgt.top, 90000);
    ss.push(JSON.stringify(await st()));
    if (gotHigh) { await page.keyboard.up('KeyW'); await wait(300); await shot('wall_climb', 2200); await page.keyboard.down('KeyW'); }
    const gotRoof = await until(() => window.__tc.stunts.mode === 'roof', null, 60000);
    const roof = gotRoof ? await st() : null; ss.push(JSON.stringify(await st()));
    await page.keyboard.up('KeyW');
    console.log('wall climb:', { reachedRoof: !!roof, roofY: roof && roof.y, buildingTop: +tgt.top.toFixed(1), gameSec: +((await simT()) - t0).toFixed(1), trace: ss, fuelUsed: +(f0 - (await st()).fuel).toFixed(3), wallUp: await ev(() => +window.__tc.stunts.stats.wallUp.toFixed(1)) });
    if (roof) {
      await wait(1500); await shot('roof', 2200);
      // 屋頂上往前開到邊緣，衝出去 → 反推減速落地
      await page.keyboard.down('KeyW');
      await until(() => window.__tc.stunts.mode !== 'roof', null, 60000); const left = await st();
      await page.keyboard.up('KeyW');
      await until(() => ['ground', 'roof'].includes(window.__tc.stunts.mode), null, 60000); const land = await st();
      console.log('drive off roof:', { left: left && left.mode, land: land && land.mode, y: land && land.y, repair: land && land.repair });
    }
    // 再試一次：吸上牆後在半路按 G 跳離牆面
    await teleport(tgt.x, tgt.z, tgt.psi); await clearTraffic();
    await page.keyboard.press('KeyG'); await wait(300); await page.keyboard.down('KeyW');
    await until(() => window.__tc.stunts.mode === 'wall' && window.__tc.car.y > window.__tc.world.groundAt(window.__tc.car.x, window.__tc.car.z) + 14, null, 60000);
    await page.keyboard.up('KeyW'); await page.keyboard.press('KeyG');
    await until(() => ['ground', 'roof'].includes(window.__tc.stunts.mode), null, 60000); const l2 = await st();
    console.log('leave wall at 12 m:', { land: l2 && l2.mode, repair: l2 && l2.repair });
  }
}

if (only === 'all' || only === 'under') {
  // ---- 高架橋底：先到市民大道／建國高架附近，找下面有路、橋底夠高的地方
  const pj = await ev(() => window.__tc.meta.proj);
  const P = (lon, lat) => ({ x: (lon - pj.lon0) * pj.mlon, z: -(lat - pj.lat0) * pj.mlat });
  const spots = [P(121.5375, 25.0400), P(121.5375, 25.0300), P(121.5300, 25.0447), P(121.5200, 25.0480)];
  let tgt = null;
  for (const sp of spots) {
    await teleport(sp.x, sp.z, 0);
    tgt = await ev(() => {
      const { world, stunts, car } = window.__tc; let best = null;
      world.forEdgesNear(car.x, car.z, 500, (e) => {
        if (!e.bridge || e.dead || e.len < 120) return;
        for (let s = 30; s < e.len - 60; s += 10) {
          const o = { i: 0 }; const pt = (function () { const cum = e.cum; let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++; const t = (s - cum[i]) / (cum[i + 1] - cum[i]); return { x: e.pts[i * 2] + (e.pts[i * 2 + 2] - e.pts[i * 2]) * t, z: e.pts[i * 2 + 1] + (e.pts[i * 2 + 3] - e.pts[i * 2 + 1]) * t, dx: e.pts[i * 2 + 2] - e.pts[i * 2], dz: e.pts[i * 2 + 3] - e.pts[i * 2 + 1], y: e.hs[i] + (e.hs[i + 1] - e.hs[i]) * t, rel: e.rel[i] + (e.rel[i + 1] - e.rel[i]) * t }; })();
          if (pt.rel < 6) continue;
          const g = pt.y - pt.rel, sf = world.surfaceAt(pt.x, pt.z, g, {});
          if (!sf || sf.edge.bridge || Math.abs(sf.y - g) > 1.5) continue;
          const L = Math.hypot(pt.dx, pt.dz), d = stunts._deckAbove(pt.x, pt.z, sf.y, 3.9);
          if (!d || d.e !== e) continue;
          const score = e.len - s;
          if (!best || score > best.score) best = { x: pt.x, z: pt.z, psi: Math.atan2(-pt.dx / L, -pt.dz / L), rel: +pt.rel.toFixed(1), name: e.name, score, id: e.id };
        }
      });
      return best;
    });
    if (tgt) break;
  }
  console.log('under target', tgt);
  if (tgt) {
    await teleport(tgt.x, tgt.z, tgt.psi); await clearTraffic();
    const f0 = (await st()).fuel, s0 = await st();
    await page.keyboard.press('KeyG'); await wait(1200);
    const s1 = await st(); console.log('after G under:', s1);
    await page.keyboard.down('KeyW');
    const modes = new Set([s1.mode]);
    await until(() => window.__tc.stunts.mode === 'under' && window.__tc.stunts.stats.underM > 25, null, 60000);
    let sm = await st(); modes.add(sm.mode);
    await page.keyboard.up('KeyW'); await wait(1500); await shot('under', 2200); await page.keyboard.down('KeyW');
    const dropped = !(await until(() => window.__tc.stunts.stats.underM > 110, null, 60000));
    sm = await st(); modes.add(sm.mode); const maxD = Math.hypot(sm.x - s0.x, sm.z - s0.z), drop = dropped ? sm : null;
    await page.keyboard.up('KeyW');
    if (sm.mode === 'under') { await page.keyboard.press('KeyG'); }
    await until(() => window.__tc.stunts.mode === 'ground', null, 60000); const land = await st();
    console.log('under viaduct:', { modes: [...modes], distUnder: +maxD.toFixed(1), underM: await ev(() => +window.__tc.stunts.stats.underM.toFixed(1)), autoDrop: !!drop, land: land && land.mode, repair: land && land.repair, fuelUsed: +(f0 - (await st()).fuel).toFixed(3) });
  }
}

if (only === 'look') {
  const r = await findRoad(); if (r) await teleport(r.x, r.z, r.psi);
  await ev(() => { window.__tc.traffic.factor = 1.8; });
  await wait(3000);
  await shot('cockpit', 3000);
  await ev(() => { window.__tc.G.cam = 'chase'; }); await shot('chase', 3000); await ev(() => { window.__tc.G.cam = 'cockpit'; });
}

if (only === 'all' || only === 'ai') {
  // ---- 車流裡的飛天跑車
  await ev(() => { const { traffic } = window.__tc; traffic.factor = 1.8; traffic.flyerRate = 0.03; });
  const r = await findRoad(); if (r) await teleport(r.x, r.z, r.psi);
  await ev(() => { window.__tc.traffic.factor = 1.8; });
  await ev(() => { const t = window.__tc.traffic; t.hops = 0; window.__evs = []; const push = t.events.push.bind(t.events); t.events.push = (e) => { window.__evs.push(e.type); return push(e); }; });
  const t0 = await simT();
  for (let k = 0; k < 6; k++) {
    await wait(15000);
    console.log('AI flyers:', +((await simT()) - t0).toFixed(0) + ' s', await ev(() => { const t = window.__tc.traffic; return { cars: t.cars.length, flyers: t.cars.filter(c => c.flyer).length, hopping: t.cars.filter(c => c.hop).length, hopsStarted: t.hops, wrecks: t.cars.filter(c => c.wreck > 0).length, events: window.__evs.slice() }; }));
    if (k === 2) { const h = await ev(() => { const t = window.__tc.traffic, c = t.cars.find(c => c.hop); return c ? { x: c.x, z: c.z, psi: c.psi } : null; }); if (h) { await ev((h) => { const { car } = window.__tc; car.place(h.x + Math.sin(h.psi) * 25, h.z + Math.cos(h.psi) * 25, h.psi, car.y); }, h); await shot('ai_hop', 1500); } }
  }
}

console.log('crash log', await ev(() => window.__crashes));
console.log('toast log', await ev(() => window.__toasts));
console.log('day costs', await ev(() => JSON.stringify(window.__tc.econ.day)));
console.log(errs.slice(0, 10).join('\n') || 'no page errors');
await browser.close();
