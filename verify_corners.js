// verify_corners.js — 角落控件统一结构验证（2026-10；含右下角两件 + 撤销/恢复两键）
// C1 桌面五控件统一外框  C2 头部同构（图标+文字+可选caret，含撤销/恢复两键）  C3 caret 翻转/内容区显示
// C4 内容区上分隔线一致  C5 收起恢复  C6 桌面右下角（徽章+帮助）同模板  C7 移动端 375 左四键纯图标行
// C7b 移动端 375 撤销/恢复第二行纯图标键  C8 移动端 375 右下角位置  C9 零 console 错误
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8051;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=corner1`;

async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }

const IDS = ['guide-panel', 'settings-panel', 'btn-optimize-all', 'btn-clear-molecule', 'input-panel'];

(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const report = { results: [], consoleErrors: [] };
    const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

    // ---- 桌面 1289×896 ----
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 250)); });
    let out = {};
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__diag && window.__setInputPanelOpen), null, { timeout: 30000 });
        await page.waitForTimeout(400);
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(150);

        // C1: 五控件统一外框 + 头部字号
        out.C1 = await page.evaluate((ids) => {
            const res = { boxes: {}, headFonts: {} };
            for (const id of ids) {
                const el = document.getElementById(id);
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                res.boxes[id] = { top: Math.round(r.top), h: Math.round(r.height), radius: cs.borderRadius, padT: cs.paddingTop, padL: cs.paddingLeft, border: cs.borderTopWidth };
            }
            for (const id of ['guide-toggle', 'settings-toggle', 'input-panel-toggle', 'btn-optimize-all', 'btn-clear-molecule']) {
                res.headFonts[id] = getComputedStyle(document.getElementById(id)).fontSize;
            }
            return res;
        }, IDS);
        const boxVals = Object.values(out.C1.boxes);
        const c1ok = boxVals.every(v => v.top === 20 && v.h === 32 && v.radius === '18px' && v.padT === '6px' && v.padL === '10px' && v.border === '1px')
            && Object.values(out.C1.headFonts).every(f => f === '12px');
        step('C1 五控件统一外框（top20/高32/圆角18/内边距6×10/描边1px/头部12px）', c1ok, out.C1);

        // C2: 头部结构同构
        out.C2 = await page.evaluate(() => {
            const readHead = (id) => {
                const el = document.getElementById(id);
                const icon = el.querySelector(':scope > .ui-ic:not(.corner-caret) svg');
                const label = el.querySelector(':scope > .corner-label');
                const caretSvg = el.querySelector(':scope > .corner-caret svg');
                return {
                    iconName: icon ? icon.dataset.icon : null,
                    iconSize: icon ? icon.getAttribute('width') : null,
                    label: label ? label.textContent : null,
                    caret: caretSvg ? caretSvg.dataset.icon : null,
                    caretCount: el.querySelectorAll('.corner-caret').length
                };
            };
            return { guide: readHead('guide-toggle'), settings: readHead('settings-toggle'), input: readHead('input-panel-toggle'), opt: readHead('btn-optimize-all'), clear: readHead('btn-clear-molecule'), undo: readHead('btn-undo'), redo: readHead('btn-redo') };
        });
        const c2ok = out.C2.guide.iconName === 'book-open' && out.C2.guide.iconSize === '13' && out.C2.guide.label === '使用说明' && out.C2.guide.caret === 'chevron-down'
            && out.C2.settings.iconName === 'settings' && out.C2.settings.label === '设置' && out.C2.settings.caret === 'chevron-down'
            && out.C2.input.iconName === 'flask-conical' && out.C2.input.label === '名称 / SMILES' && out.C2.input.caret === 'chevron-down'
            && out.C2.opt.iconName === 'sparkles' && out.C2.opt.label === '全局同步优化' && out.C2.opt.caretCount === 0
            && out.C2.clear.iconName === 'trash-2' && out.C2.clear.label === '清空' && out.C2.clear.caretCount === 0
            && out.C2.undo.iconName === 'undo-2' && out.C2.undo.label === '撤销' && out.C2.undo.caretCount === 0
            && out.C2.redo.iconName === 'redo-2' && out.C2.redo.label === '恢复' && out.C2.redo.caretCount === 0;
        step('C2 头部同构：三折叠头=图标+文字+caret，四按钮=图标+文字无caret（含撤销/恢复）', c2ok, out.C2);

        // C3: caret 翻转 + 内容区显示（手风琴：展开一个时其余自动收起）
        const snapPanels = () => page.evaluate(() => {
            const ci = (id) => { const c = document.querySelector('#' + id + ' .corner-caret svg'); return c ? c.dataset.icon : null; };
            const disp = (id) => getComputedStyle(document.getElementById(id)).display;
            return {
                carets: { g: ci('guide-toggle'), s: ci('settings-toggle'), i: ci('input-panel-toggle') },
                bodies: { g: disp('guide-body'), s: disp('settings-body'), i: disp('input-panel-body') }
            };
        });
        out.C3 = { before: await snapPanels(), steps: [] };
        await page.click('#guide-toggle'); await page.waitForTimeout(180);
        out.C3.steps.push(await snapPanels());
        await page.click('#settings-toggle'); await page.waitForTimeout(180);
        out.C3.steps.push(await snapPanels());
        await page.click('#input-panel-toggle'); await page.waitForTimeout(180);
        out.C3.steps.push(await snapPanels());
        const [gStep, sStep, iStep] = out.C3.steps;
        const c3ok = out.C3.before.carets.g === 'chevron-down' && out.C3.before.carets.s === 'chevron-down' && out.C3.before.carets.i === 'chevron-down'
            && gStep.carets.g === 'chevron-up' && gStep.bodies.g !== 'none'
            && sStep.carets.s === 'chevron-up' && sStep.bodies.s !== 'none'
            && sStep.carets.g === 'chevron-down' && sStep.bodies.g === 'none'      // 手风琴：说明自动收起
            && iStep.carets.i === 'chevron-up' && iStep.bodies.i !== 'none'
            && iStep.carets.s === 'chevron-down' && iStep.bodies.s === 'none';     // 手风琴：设置自动收起
        step('C3 展开时 caret 翻上（▾→▴）且内容区显示（同时只展开一个，前一个自动收起）', c3ok, out.C3);

        // C4: 内容区上分隔线/间距一致
        out.C4 = await page.evaluate(() => {
            const p = (id) => { const cs = getComputedStyle(document.getElementById(id)); return { mt: cs.marginTop, pt: cs.paddingTop, bw: cs.borderTopWidth, bc: cs.borderTopColor }; };
            return { guide: p('guide-body'), settings: p('settings-body'), input: p('input-panel-body') };
        });
        const c4ok = ['guide', 'settings', 'input'].every(k => out.C4[k].mt === '8px' && out.C4[k].pt === '8px' && out.C4[k].bw === '1px')
            && out.C4.guide.bc === out.C4.settings.bc && out.C4.settings.bc === out.C4.input.bc;
        step('C4 三内容区上分隔线一致（8px/8px/1px 同色）', c4ok, out.C4);

        // C5: 再收起恢复（逐个开→关）
        await page.click('#input-panel-toggle'); await page.waitForTimeout(150);
        await page.click('#guide-toggle'); await page.waitForTimeout(150);
        await page.click('#guide-toggle'); await page.waitForTimeout(150);
        await page.click('#settings-toggle'); await page.waitForTimeout(150);
        await page.click('#settings-toggle'); await page.waitForTimeout(150);
        out.C5 = await page.evaluate(() => {
            const ci = (id) => { const c = document.querySelector('#' + id + ' .corner-caret svg'); return c ? c.dataset.icon : null; };
            const disp = (id) => getComputedStyle(document.getElementById(id)).display;
            return {
                g: ci('guide-toggle'), s: ci('settings-toggle'), i: ci('input-panel-toggle'),
                bodies: [disp('guide-body'), disp('settings-body'), disp('input-panel-body')]
            };
        });
        step('C5 再收起 caret 恢复朝下（▴→▾）且内容区隐藏', out.C5.g === 'chevron-down' && out.C5.s === 'chevron-down' && out.C5.i === 'chevron-down' && out.C5.bodies.every(d => d === 'none'), out.C5);

        // C6: 右下角两件（模式徽章 + 帮助）与左上/右上同模板
        out.C6 = await page.evaluate(() => {
            const read = (id) => {
                const el = document.getElementById(id);
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return {
                    h: Math.round(r.height), radius: cs.borderRadius, padT: cs.paddingTop, padL: cs.paddingLeft,
                    border: cs.borderTopWidth, bottom: Math.round(innerHeight - r.bottom), right: Math.round(innerWidth - r.right),
                    font: cs.fontSize, blur: cs.backdropFilter, cls: el.className
                };
            };
            const b = document.getElementById('mode-badge').getBoundingClientRect();
            const h = document.getElementById('btn-help').getBoundingClientRect();
            return {
                badge: read('mode-badge'), help: read('btn-help'),
                sameTop: Math.round(b.top) === Math.round(h.top),
                noOverlap: h.left >= b.right - 2,
                dot: !!document.getElementById('mode-badge-dot'),
                badgeText: ((document.getElementById('mode-badge-text') || {}).textContent || ''),
                helpIcon: !!document.querySelector('#btn-help svg[data-icon="circle-help"]')
            };
        });
        const sameShell = (v) => v.h === 32 && v.radius === '18px' && v.padT === '6px' && v.padL === '10px'
            && v.border === '1px' && v.font === '12px' && /blur\(12px\)/.test(v.blur);
        const c6ok = sameShell(out.C6.badge) && sameShell(out.C6.help)
            && out.C6.badge.bottom === 16 && out.C6.badge.right === 60 && out.C6.help.bottom === 16 && out.C6.help.right === 16
            && out.C6.sameTop && out.C6.noOverlap
            && out.C6.badge.cls.includes('corner-widget') && out.C6.badge.cls.includes('corner-head')
            && out.C6.help.cls.includes('corner-widget') && out.C6.help.cls.includes('corner-head')
            && out.C6.dot && out.C6.badgeText.length > 0 && out.C6.helpIcon;
        step('C6 桌面右下角徽章+帮助同模板（高32/圆角18/内边距6×10/12px/blur12，底部对齐16并排不重叠）', c6ok, out.C6);

        await page.screenshot({ path: 'd_corners_desk.png', clip: { x: 0, y: 0, width: 1289, height: 90 } });
        await page.screenshot({ path: 'd_corners_br.png', clip: { x: 989, y: 826, width: 300, height: 70 } });
    } catch (e) {
        step('C1-C6 FATAL', false, String(e).slice(0, 400));
    }
    await page.close();

    // ---- 移动端 375×667 ----
    const m = await browser.newPage({ viewport: { width: 375, height: 667 } });
    m.on('pageerror', e => report.consoleErrors.push('PAGEERROR(mobile): ' + String(e).slice(0, 300)));
    m.on('console', c => { if (c.type() === 'error') report.consoleErrors.push('(m) ' + c.text().slice(0, 250)); });
    try {
        await m.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await m.waitForFunction(() => !!(window.__diag && window.__setInputPanelOpen), null, { timeout: 30000 });
        await m.evaluate(() => window.__setInputPanelOpen(false));
        await m.waitForTimeout(250);
        out.C7 = await m.evaluate((ids) => {
            const rects = ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), h: Math.round(r.height) }; });
            const iconsOnly = ids.slice(0, 4).every(id => {
                const label = document.querySelector('#' + id + ' .corner-label');
                const caret = document.querySelector('#' + id + ' .corner-caret');
                return (!label || getComputedStyle(label).display === 'none') && (!caret || getComputedStyle(caret).display === 'none');
            });
            let overlap = false;
            for (let i = 0; i + 1 < rects.length; i++) if (rects[i].r > rects[i + 1].l) overlap = true;
            const inputLabel = document.querySelector('#input-panel-toggle .corner-label');
            return {
                rects, iconsOnly, overlap,
                sameTop: rects.every(r => r.t === 8), sameH: rects.every(r => r.h === 32),
                inputLabelVisible: !!inputLabel && getComputedStyle(inputLabel).display !== 'none'
            };
        }, IDS);
        const c7ok = out.C7.iconsOnly && !out.C7.overlap && out.C7.sameTop && out.C7.sameH && out.C7.inputLabelVisible;
        step('C7 移动端375：左四纯图标、五控件等高(top8/h32)同行不重叠、输入面板保留标题', c7ok, out.C7);
        await m.screenshot({ path: 'd_corners_mobile.png', clip: { x: 0, y: 0, width: 375, height: 90 } });

        // C7b: 移动端撤销/恢复折为第二行纯图标键（top46、左 8/54、宽 40、高 32、无文字）
        out.C7b = await m.evaluate(() => {
            const rb = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), h: Math.round(r.height) }; };
            const u = rb('btn-undo'), r = rb('btn-redo');
            const uLabel = document.querySelector('#btn-undo .corner-label');
            const rLabel = document.querySelector('#btn-redo .corner-label');
            const input = document.getElementById('input-panel').getBoundingClientRect();
            return {
                u, r,
                labelsHidden: (!uLabel || getComputedStyle(uLabel).display === 'none') && (!rLabel || getComputedStyle(rLabel).display === 'none'),
                sameTop: u.t === r.t && u.t === 46,
                noOverlap: u.r <= r.l && u.r <= Math.round(input.left),
                uIcon: !!document.querySelector('#btn-undo svg[data-icon="undo-2"]'),
                rIcon: !!document.querySelector('#btn-redo svg[data-icon="redo-2"]'),
            };
        });
        const c7bok = out.C7b.labelsHidden && out.C7b.sameTop && out.C7b.noOverlap && out.C7b.uIcon && out.C7b.rIcon
            && out.C7b.u.l === 8 && out.C7b.r.l === 54 && out.C7b.u.h === 32 && out.C7b.r.h === 32;
        step('C7b 移动端375：撤销/恢复第二行纯图标键（top46/左8-54/高32/无文字不重叠）', c7bok, out.C7b);

        // C8: 移动端右下角两件位置（徽章底部居中 bottom8、帮助在其上方 bottom42、互不重叠）
        out.C8 = await m.evaluate(() => {
            const b = document.getElementById('mode-badge').getBoundingClientRect();
            const h = document.getElementById('btn-help').getBoundingClientRect();
            return {
                badgeBottom: Math.round(innerHeight - b.bottom), badgeCenter: Math.round(b.left + b.width / 2),
                helpBottom: Math.round(innerHeight - h.bottom),
                halfW: Math.round(innerWidth / 2),
                noOverlap: h.bottom <= b.top + 2 || h.left >= b.right - 2,
                cls: document.getElementById('mode-badge').className + ' | ' + document.getElementById('btn-help').className
            };
        });
        const c8ok = out.C8.badgeBottom === 8 && Math.abs(out.C8.badgeCenter - out.C8.halfW) <= 2
            && out.C8.helpBottom === 42 && out.C8.noOverlap
            && out.C8.cls.includes('corner-widget') && out.C8.cls.includes('corner-head');
        step('C8 移动端375：徽章底部居中(bottom8)、帮助在其上方(bottom42)不重叠', c8ok, out.C8);
    } catch (e) {
        step('C7-C8 FATAL', false, String(e).slice(0, 400));
    }
    await m.close();

    step('C9 无 console 错误', report.consoleErrors.length === 0, { errors: report.consoleErrors.slice(0, 5) });

    report.summary = { total: report.results.length, fail: report.results.filter(r => !r.ok).length };
    console.log(JSON.stringify(report, null, 1));
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
