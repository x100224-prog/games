import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + e.stack));
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8766/index.html#lowq');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'title');
await page.click('#btnStart');
await page.waitForFunction(() => window.__tc.G.state === 'walk');
await page.waitForTimeout(3000);
const n = +(process.argv[2] || 0);
const info = await page.evaluate(([n, n2]) => {
  const { signs, P } = window.__tc; const arr = [];
  for (const list of signs.all.values()) for (const s of list) if (s.road && !s.vertical && s.arrows !== undefined && s.y - window.__tc.world.groundAt(s.x, s.z) > 5) arr.push(s);
  arr.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
  const s = arr[n]; if (!s) return { count: arr.length };
  // 駕駛位置：沿著招牌法線往後 28 m、再往右（駕駛右手邊）挪 2 m
  const D = n2; const gx = s.x + s.nx * D + s.tx * 0.5, gz = s.z + s.nz * D + s.tz * 0.5; if (window.__tc.avatar) { window.__tc.avatar.group.scale.set(0.001, 0.001, 0.001); }
  P.x = gx; P.z = gz;
  window.__tc.debugCam = { x: gx, y: window.__tc.world.groundAt(gx, gz) + 1.6, z: gz, tx: s.x, ty: s.y - 1.8, tz: s.z };
  document.getElementById('hud').hidden = true;
  window.__S = s; return { count: arr.length, text: s.text, en: s.en, arrows: s.arrows, x: s.x, y: s.y, z: s.z, n: [s.nx, s.nz], w: s.w, slot: null };
}, [n, +(process.argv[3] || 20)]);
console.log(JSON.stringify(info));
await page.waitForFunction(() => window.__tc.signs.pages[0].active.has(window.__S), null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `shots/g0${n}.png` });
console.log(JSON.stringify(await page.evaluate(async () => {
  const THREE = await import('./lib/three.module.min.js'); const { camera, scene } = window.__tc, S = window.__S;
  const rc = new THREE.Raycaster(); const o = camera.position.clone(); const t = new THREE.Vector3(S.x, S.y, S.z); const dir = t.clone().sub(o); const dist = dir.length(); dir.normalize();
  rc.set(o, dir); rc.far = dist + 2;
  const hits = rc.intersectObjects(scene.children, true).slice(0, 6).map(h => ({ d: +h.distance.toFixed(2), type: h.object.type, mat: h.object.material && h.object.material.type, name: h.object.name, inst: h.object.isInstancedMesh, verts: h.object.geometry.attributes.position.count, sigPage: window.__tc.signs.pages.some(p => p.mesh === h.object) }));
  return { dist: +dist.toFixed(2), hits };
})));
if (process.argv[4]) { await page.evaluate(async () => { const THREE = await import('./lib/three.module.min.js'); for (const pg of window.__tc.signs.pages) { const old = pg.mesh.material; pg.mesh.material = new THREE.MeshBasicMaterial({ map: old.map, side: THREE.DoubleSide }); } }); await page.waitForTimeout(3000); await page.screenshot({ path: `shots/g0${n}_dbg.png` }); }
console.log(JSON.stringify(await page.evaluate(() => { const { signs, P } = window.__tc; const pg = signs.pages[0]; let road = 0, tot = 0, nearRoad = 0;
  for (const s of pg.active.keys()) { tot++; if (s.road) road++; }
  for (const list of signs.all.values()) for (const s of list) if (s.road && !s.vertical && Math.hypot(s.x - P.x, s.z - P.z) < 40) nearRoad++;
  return { active: tot, activeRoad: road, nearRoad, P: [P.x, P.z], targetActive: pg.active.has(window.__S), geoN: pg.mesh.geometry.attributes.position ? pg.mesh.geometry.attributes.position.count : -1, near: (() => { const a = pg.mesh.geometry.attributes.position.array, S = window.__S; let best = 1e9; for (let i = 0; i < a.length; i += 3) best = Math.min(best, Math.hypot(a[i] - S.x, a[i+1] - S.y, a[i+2] - S.z)); return best; })(), meshPos: pg.mesh.position.toArray(), vis: pg.mesh.visible, inScene: !!pg.mesh.parent, slot: pg.active.get(window.__S), ap: window.__tc.traffic.approaches.slice(0,4).map(a => [a.x.toFixed(1), a.z.toFixed(1), a.arm.toFixed(1), a.e.name]) }; })));
console.log(logs.join('\n')); await browser.close();
