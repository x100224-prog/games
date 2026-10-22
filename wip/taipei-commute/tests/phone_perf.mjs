// 手機卡頓量測：手機尺寸（390×844、DPR 3、觸控），在市區開車，比較每一格的時間（遊戲邏輯／畫面）與畫面資訊。
// 無頭瀏覽器用 CPU 模擬 GPU，絕對數字比手機慢很多，看的是「哪一項占多少」。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const LAND = process.env.LAND === '1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: LAND ? { width: 844, height: 390 } : { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
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
// 忠孝東路四段（東區，建物、招牌、車流都多）
const SPOT = process.env.SPOT ? JSON.parse(process.env.SPOT) : null;
await ev((S) => { const { car, world } = window.__tc; let x = 1200, z = 1180; if (S) { x = S.x; z = S.z; }
  const o = {}; world.nearestEdge(x, z, 400, (e) => e.cls <= 3, o); }, SPOT);
await ev((S) => { const { car, world } = window.__tc; const x = S ? S.x : 1200, z = S ? S.z : 1180; car.place(x, z, 1.57, world.groundAt(x, z)); car.v = 0; }, SPOT);
await page.waitForFunction(() => { const { world, car } = window.__tc; return world.readyAround(car.x, car.z, 500); }, null, { timeout: 300000 });
await ev(() => { const { car, world } = window.__tc; const o = {}; const e = world.nearestEdge(car.x, car.z, 300, (e) => e.cls <= 3 && !e.tunnel && !e.bridge, o); if (e) { const i = 0; const p = e.pts; car.place(o.x, o.z, Math.atan2(-(p[2] - p[0]), -(p[3] - p[1])) + Math.PI, world.groundAt(o.x, o.z)); car.v = 0; window.__road = e.name; } });
await wait(3000);
console.log('road', await ev(() => window.__road), 'car', await ev(() => [Math.round(window.__tc.car.x), Math.round(window.__tc.car.z)]), 'traffic cars', await ev(() => window.__tc.traffic.cars ? window.__tc.traffic.cars.length : -1));
// 每一格：把 renderer.render 包起來量時間
await ev(() => {
  const { renderer } = window.__tc; const r0 = renderer.render.bind(renderer); window.__rt = 0; window.__rn = 0;
  renderer.render = (s, c) => { const t = performance.now(); r0(s, c); const gl = renderer.getContext(); gl.finish(); window.__rt += performance.now() - t; window.__rn++; };
});
const measure = (label, setup) => ev(async ([label, setup]) => {
  const T = window.__tc, { renderer, G, sun } = T;
  new Function('T', setup)(T);
  window.__tc.manual = true;
  for (let i = 0; i < 6; i++) window.__tc.advance(1 / 30, 1);   // 熱身
  let tot = 0, rt = 0, calls = 0, tris = 0, passes = 0; const N = 12;
  for (let i = 0; i < N; i++) {
    window.__rt = 0; window.__rn = 0; renderer.info.reset();
    const t = performance.now(); window.__tc.advance(1 / 30, 1); renderer.getContext().finish(); tot += performance.now() - t;
    rt += window.__rt; passes += window.__rn; calls += renderer.info.render.calls; tris += renderer.info.render.triangles;
  }
  window.__tc.manual = false;
  const px = renderer.getPixelRatio();
  return `${label.padEnd(34)} 每格 ${(tot / N).toFixed(0).padStart(4)} ms：畫面 ${(rt / N).toFixed(0).padStart(4)}、其他 ${((tot - rt) / N).toFixed(0).padStart(3)}｜render ${passes / N} 次、draw calls ${Math.round(calls / N)}、三角形 ${Math.round(tris / N / 1000)}k｜像素比 ${px}、陰影 ${renderer.shadowMap.enabled && sun.castShadow ? sun.shadow.mapSize.x : '關'}`;
}, [label, setup]);
await ev(() => { window.__tc.renderer.info.autoReset = false; });
console.log(await measure('駕駛座＋後照鏡（現在手機預設）', "T.G.cam='cockpit'; T.renderer.setPixelRatio(1.5); T.sun.castShadow=true; T.renderer.shadowMap.enabled=true;"));
console.log(await measure('第三人稱（同樣畫質）', "T.G.cam='chase';"));
console.log(await measure('第三人稱＋陰影 1024', "T.G.cam='chase'; T.sun.shadow.mapSize.set(1024,1024); if (T.sun.shadow.map) { T.sun.shadow.map.dispose(); T.sun.shadow.map = null; }"));
console.log(await measure('第三人稱＋不畫陰影', "T.G.cam='chase'; T.sun.castShadow=false;"));
console.log(await measure('第三人稱＋不畫陰影＋像素比 1', "T.G.cam='chase'; T.sun.castShadow=false; T.renderer.setPixelRatio(1);"));
console.log(await measure('駕駛座＋不畫陰影＋像素比 1', "T.G.cam='cockpit'; T.sun.castShadow=false; T.renderer.setPixelRatio(1);"));
await ev(() => { window.__tc.G.cam = 'chase'; window.__tc.renderer.setPixelRatio(1.5); window.__tc.sun.castShadow = true; window.__tc.sun.shadow.mapSize.set(2048, 2048); if (window.__tc.sun.shadow.map) { window.__tc.sun.shadow.map.dispose(); window.__tc.sun.shadow.map = null; } });
// 場景裡的東西數量
console.log('scene:', await ev(() => { const { scene } = window.__tc; let meshes = 0, inst = 0, vis = 0, shadowCast = 0; scene.traverse(o => { if (o.isMesh) { meshes++; if (o.isInstancedMesh) inst += o.count; if (o.visible) vis++; if (o.castShadow) shadowCast++; } }); return { meshes, vis, instances: inst, shadowCast, cells: window.__tc.world.cells.size }; }));
console.log(errs.slice(0, 4).join(' | ') || 'no page errors');
await browser.close();
