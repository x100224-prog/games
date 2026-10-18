// 選單分頁的版面：手機直向和電腦各截一次（標題、選區、選住址、選工作），檢查有沒有超出畫面、選的時候有沒有出現錢。
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, vp, touch] of [['phone', { width: 390, height: 844 }, true], ['desk', { width: 1280, height: 720 }, false]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const ev = (f, a) => page.evaluate(f, a);
  page.setDefaultTimeout(240000);
  await page.goto('http://localhost:8768/index.html#lowq');
  await page.waitForFunction(() => window.__tc && window.__tc.G.state === 'menu', null, { timeout: 200000 });
  const check = async (tag) => {
    await page.waitForTimeout(800); await page.screenshot({ path: `shots/menu_${name}_${tag}.png` });
    return ev(() => { const P = document.getElementById('menuPanel'), vis = [...P.querySelectorAll('.page')].filter(p => !p.hidden).map(p => p.id);
      const t = P.innerText; return { vis, wide: P.scrollWidth > P.clientWidth + 1, money: /萬(?!華)|元|薪|房租|房貸|收入/.test(t) ? t.match(/.{0,10}(萬(?!華)|元|薪|房租|房貸|收入).{0,10}/g) : null, focus: document.activeElement && document.activeElement.className }; });
  };
  console.log(name, 'title', JSON.stringify(await check('0title')));
  await page.click('#btnNew'); console.log(name, 'dist', JSON.stringify(await check('1dist')));
  await page.click('#distMap path[data-i="1"]'); console.log(name, 'home', JSON.stringify(await check('2home')));
  await page.click('#homeOpts .opt'); console.log(name, 'work', JSON.stringify(await check('3work')));
  await page.click('#workOpts .opt'); console.log(name, 'picked', JSON.stringify(await check('4picked')), 'go enabled', await ev(() => !document.getElementById('btnGo').disabled));
  console.log(name, errs.slice(0, 3).join(' | ') || 'no page errors');
  await ctx.close();
}
await browser.close();
