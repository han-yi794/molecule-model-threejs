// verify_inline_offline.js — 内联 Three.js 后的完全离线验证(file:// + 全网络拦截)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errs = [];
    let blockedNet = 0;
    // 拦截一切 http/https 请求 → 模拟断网
    await page.route('**/*', route => {
        const u = route.request().url();
        if (u.startsWith('http')) { blockedNet++; return route.abort(); }
        return route.continue();
    });
    page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
    const fileUrl = 'file:///' + path.resolve('球棍模型4.html').replace(/\\/g, '/') + '?noauto=1&v=inline1';
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // 等 app 初始化(模块加载 + 默认分子)
    await page.waitForFunction(() => typeof window.__diag !== 'undefined' && window.__diag && document.querySelector('canvas'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => {
        const atoms = (window.__diag && window.__diag.atomPositions) ? window.__diag.atomPositions() : [];
        return {
            diagReady: typeof window.__diag !== 'undefined',
            canvas: !!document.querySelector('canvas'),
            atomCount: atoms.length,
            parseSmilesReady: typeof window.__parseSmiles === 'function',
            generateInputReady: typeof window.__generateFromInput === 'function'
        };
    }).catch(e => ({ evalFail: String(e).slice(0, 200) }));
    // 离线冒烟:SMILES 生成乙醇(纯本地管线)
    let smoke = null;
    try {
        smoke = await page.evaluate(async () => {
            const r = await window.__generateFromSmiles('CCO');
            return { ok: r && r.ok, atoms: r && r.atomCount };
        });
    } catch (e) { smoke = { fail: String(e).slice(0, 150) }; }
    console.log(JSON.stringify({ fileUrl: fileUrl.slice(0, 60) + '...', state, smoke, blockedHttpRequests: blockedNet, errors: errs.slice(0, 6) }, null, 1));
    await browser.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });