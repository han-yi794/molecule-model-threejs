// verify_group_label.js — 基团原子标签与其他原子一致
// 2026-11-27 起标签可被前方原子遮挡（透视关系，见 setAtomLabelsVisible/updateAtomLabelOcclusion）：
// 标签对象数仍应等于原子数，但 DOM 里「可见」标签可能少于对象数（被挡住的标签由
// CSS2DRenderer 从 DOM 摘除）。因此 S2/S3 以对象数为准，DOM 只验「可见且无杂化后缀」。
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8039;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=glbl1`;
async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }
(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 250)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__createCompleteGroup === 'function' && typeof window.__diag === 'object', null, { timeout: 30000 });
        // 等渲染循环把 CSS2D label 挂进 DOM
        await page.waitForTimeout(1500);
        const out = {};
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

        out.S1 = await page.evaluate(() => {
            window.__diag.generateSpec('methane');
            window.__diag.runOpt();
            const meshes = window.__createCompleteGroup('methyl', { x: 3, y: 0, z: 0 });
            if (!meshes || !meshes.length) return { fail: 'not placed' };
            return {
                groupAtoms: meshes.length,
                withLabel: meshes.filter(m => m.userData.label).length,
                texts: meshes.map(m => m.userData.label ? m.userData.label.element.textContent : '(none)')
            };
        });
        step('S1 基团4原子全部带标签', out.S1.withLabel === out.S1.groupAtoms && out.S1.groupAtoms >= 4, out.S1);

        // 等一帧让 labelRenderer 渲染,再从 DOM 统计可见标签文本
        await page.waitForTimeout(800);
        out.S2 = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('[data-role="atom-label"]')];
            const st = window.__atomLabels ? window.__atomLabels.state() : null;
            return {
                allTexts: divs.map(d => d.textContent),
                count: divs.length,
                labelObjects: st ? st.labels : null,
                hiddenLabels: st ? st.hiddenLabels : null
            };
        });
        // 甲烷 C+4H + 甲基 C+3H = 9 个标签对象；可见标签 ≥8（允许 1 个被遮挡），
        // 且全部为纯元素符号（无 (spX) 杂化后缀）
        const cCount = out.S2.allTexts.filter(t => t === 'C').length;
        const hCount = out.S2.allTexts.filter(t => t === 'H').length;
        const noHybSuffix = out.S2.allTexts.every(t => !t.includes('('));
        step('S2 标签对象共9个；可见标签无杂化后缀',
            out.S2.labelObjects === 9 && out.S2.count >= 8 && cCount >= 1 && hCount >= 6 && noHybSuffix, out.S2);

        // S3:优化后标签对象仍在且可见者保持纯元素符号
        out.S3 = await page.evaluate(() => {
            window.__diag.runOpt();
            const divs = [...document.querySelectorAll('[data-role="atom-label"]')];
            const st = window.__atomLabels ? window.__atomLabels.state() : null;
            return { afterOpt: divs.map(d => d.textContent).sort(), labelObjects: st ? st.labels : null };
        });
        step('S3 优化后标签保留且仍无杂化后缀',
            out.S3.labelObjects === 9 && out.S3.afterOpt.length >= 8
            && out.S3.afterOpt.every(t => !t.includes('(')), out.S3);

        await page.screenshot({ path: 'd_glbl.png' });
        console.log(JSON.stringify(report, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, data: String(e).slice(0, 400) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });