// verify_favicon.js — 页面 favicon + 标题验证（2026-10）
// F1 标题简化为「球棍模型」  F2 favicon link 为 SVG base64 data URI
// F3 data URI 解码为合法原子 SVG（3 椭圆轨道 + 1 原子核 + 主题配色）  F4 浏览器可解码渲染（naturalWidth>0）
// F5 theme-color 匹配深色场景底  F6 零 console 错误
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8052;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=fav1`;

async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }

(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const report = { results: [], consoleErrors: [] };
    const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 250)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__diag && window.__diag.generateSpec), null, { timeout: 30000 });

        // F1 标题（简略）
        const title = await page.title();
        step('F1 标题简化为「球棍模型」', title === '球棍模型', { title });

        // F2 favicon link 属性
        const fav = await page.evaluate(() => {
            const l = document.querySelector('link[rel="icon"]');
            if (!l) return null;
            return { rel: l.rel, type: l.type, href: l.href, isSvgData: l.href.startsWith('data:image/svg+xml;base64,') };
        });
        step('F2 favicon 为 SVG base64 data URI（无网络请求）', !!(fav && fav.type === 'image/svg+xml' && fav.isSvgData), fav ? { rel: fav.rel, type: fav.type, len: fav.href.length } : null);

        // F3 解码为合法原子 SVG
        let svgText = null;
        if (fav && fav.isSvgData) svgText = Buffer.from(fav.href.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8');
        const ellipses = svgText ? (svgText.match(/<ellipse/g) || []).length : 0;
        const circles = svgText ? (svgText.match(/<circle/g) || []).length : 0;
        const f3ok = !!(svgText && svgText.startsWith('<svg') && svgText.endsWith('</svg>')
            && svgText.includes('width="64"') && svgText.includes('viewBox="0 0 64 64"')
            && ellipses === 3 && circles === 1
            && svgText.includes('#00e0ff') && svgText.includes('#ffd78c'));
        step('F3 解码为合法原子 SVG（3 轨道 + 1 核 + 主题配色 #00e0ff/#ffd78c）', f3ok, { len: svgText ? svgText.length : 0, ellipses, circles });

        // F4 浏览器实际解码渲染
        const f4 = await page.evaluate(async () => {
            const href = document.querySelector('link[rel="icon"]').href;
            return await new Promise(res => {
                const img = new Image();
                img.onload = () => res({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
                img.onerror = () => res({ ok: false });
                img.src = href;
            });
        });
        step('F4 favicon 可被浏览器解码渲染（naturalWidth=64）', !!(f4 && f4.ok && f4.w === 64 && f4.h === 64), f4);

        // F5 theme-color
        const tc = await page.evaluate(() => { const m = document.querySelector('meta[name="theme-color"]'); return m ? m.content : null; });
        step('F5 theme-color 匹配深色场景底 #080a0d', tc === '#080a0d', { tc });
    } catch (e) {
        step('F1-F5 FATAL', false, String(e).slice(0, 400));
    }
    await page.close();

    step('F6 零 console 错误', report.consoleErrors.length === 0, { errors: report.consoleErrors.slice(0, 5) });

    report.summary = { total: report.results.length, fail: report.results.filter(r => !r.ok).length };
    console.log(JSON.stringify(report, null, 1));
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
