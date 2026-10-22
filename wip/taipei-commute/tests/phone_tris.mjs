// 手機畫面裡的三角形來源（依物件種類分類），找出最耗 GPU 的東西。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a), wait = (ms) => page.waitForTimeout(ms);
page.setDefaultTimeout(300000);
await page.goto('http://localhost:8768/index.html');
await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { localStorage.clear(); localStorage.setItem('taipei-commute-tips', '["nav","ev","roadster","drone","ctl"]'); const m = window.__tc.meta, di = 6, home = m.homes[di][0]; const work = m.works.find(w => { const d = Math.hypot(w.x - home.x, w.z - home.z); return d > 3000 && d < 4800; });
  localStorage.setItem('taipei-commute-v2', JSON.stringify({ v: 2, cfg: { di, home, work }, day: 2, econ: { money: 500000, owned: ['nav'], carKey: 'gas' } })); });
await page.reload(); await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
await ev(() => { window.__tc.noRender = true; }); await page.click('#btnContinue');
await page.waitForFunction(() => window.__tc.G.state === 'room', null, { timeout: 200000 });
await ev(() => { const { P } = window.__tc; P.x = 1.2; P.z = -2.0; }); await wait(400); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'walk', null, { timeout: 60000 }); await wait(800);
await ev(() => { const { P, car } = window.__tc; P.x = car.x - Math.cos(car.psi) * 2; P.z = car.z + Math.sin(car.psi) * 2; }); await wait(600); await page.tap('#btnAct');
await page.waitForFunction(() => window.__tc.G.state === 'drive', null, { timeout: 60000 }); await wait(1000);
await ev(() => { if (window.__tc.G.seatAdj) document.getElementById('seatGo').click(); }); await wait(600);
await ev(() => { const { car, world } = window.__tc; car.place(1290, 1182, 0, world.groundAt(1290, 1182)); car.v = 0; });
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 500); }, null, { timeout: 300000 });
await wait(5000);
await ev(() => { window.__tc.noRender = false; }); await wait(1500);
console.log('cam', await ev(() => window.__tc.G.camMode), 'cells', await ev(() => window.__tc.world.cells.size));
const r = await ev(() => {
  const { scene, camera, THREE } = window.__tc; camera.updateMatrixWorld(); const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const by = {}; let total = 0;
  scene.traverseVisible(o => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry, tri = (g.index ? g.index.count : g.attributes.position.count) / 3, n = o.isInstancedMesh ? o.count : 1;
    if (o.frustumCulled !== false) { if (!g.boundingSphere) g.computeBoundingSphere(); const s = g.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!o.isInstancedMesh && !fr.intersectsSphere(s)) return; }
    const W = window.__tc.world; let mk = ''; for (const k in W) if (W[k] === o.material) { mk = k; break; }
    const tr = window.__tc.traffic; let inTraffic = false; for (let p = o; p; p = p.parent) if (p === tr.group || p === tr.root) inTraffic = true;
    let key = mk || o.name || (o.parent && o.parent.name) || (o.material && o.material.name) || (inTraffic ? 'traffic' : o.type);
    if (o.isInstancedMesh) key = 'inst:' + key;
    key += o.castShadow ? ' [影]' : '';
    by[key] = by[key] || { tris: 0, draws: 0 }; by[key].tris += tri * n; by[key].draws++; total += tri * n;
  });
  return { total: Math.round(total), top: Object.entries(by).sort((a, b) => b[1].tris - a[1].tris).slice(0, 18).map(([k, v]) => `${k}: ${Math.round(v.tris / 1000)}k tris, ${v.draws} draws`) };
});
console.log('in view total', r.total); for (const l of r.top) console.log('  ', l);
console.log(errs.slice(0, 3).join(' | ') || 'no page errors');
await browser.close();
