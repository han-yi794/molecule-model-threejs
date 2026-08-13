// verify_sphingomyelin.js — 鞘磷脂输入诊断
const { chromium } = require('playwright');
const PORT = 8013;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=sph1`;
const http = require('http');
async function probe(url) {
    return new Promise(res => {
        const req = http.get(url, r => { r.resume(); res(r.statusCode >= 200 && r.statusCode < 500); });
        req.on('error', () => res(false));
        req.setTimeout(3000, () => { req.destroy(); res(false); });
    });
}
async function waitPort(ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (await probe(`http://127.0.0.1:${PORT}/`)) return true;
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}
async function ensureServer() {
    if (await waitPort(1000)) return null;
    const { spawn } = require('child_process');
    for (const bin of ['python', 'py']) {
        const proc = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() });
        const ready = await waitPort(15000);
        if (ready) return proc;
        proc.kill();
    }
    return null;
}
const SM_SPH = 'CCCCCCCCCCCCCCCC(=O)N[C@@H](COP(=O)(O)OCC[N+](C)(C)C)[C@@H](O)/C=C/CCCCCCCCCCCCC';
const SM_SPH_SIMPLE = 'CCCCCCCCCCCCCCCC(=O)NCC(O)COP(=O)(O)OCC[N+](C)(C)C';

(async () => {
    const t0 = Date.now();
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__parseSmiles === 'function' && typeof window.__generateFromInput === 'function', null, { timeout: 30000 });

        // 1) 名称路径: 鞘磷脂
        report.results.push({ name: '名称解析 鞘磷脂', data: await page.evaluate(async () => {
            try {
                const r = await window.__resolveNameToSmiles('鞘磷脂');
                return { ok: !!r && !r.error, r: r ? { smiles: (r.smiles||'').slice(0,120), error: r.error || null, cid: r.cid || null } : null };
            } catch (e) { return { ok: false, err: String(e).slice(0,200) }; }
        }) });

        // 2) SMILES 路径: 完整鞘磷脂(含手性/顺反标记)
        report.results.push({ name: 'parseSmiles 完整鞘磷脂', data: await page.evaluate((sm) => {
            const r = window.__parseSmiles(sm);
            return r ? { atoms: r.atoms ? r.atoms.length : null, bonds: r.bonds ? r.bonds.length : null, error: r.error || null } : null;
        }, SM_SPH) });

        // 3) SMILES 路径: 简化鞘磷脂(无手性/顺反)
        report.results.push({ name: 'parseSmiles 简化鞘磷脂', data: await page.evaluate((sm) => {
            const r = window.__parseSmiles(sm);
            return r ? { atoms: r.atoms ? r.atoms.length : null, bonds: r.bonds ? r.bonds.length : null, error: r.error || null } : null;
        }, SM_SPH_SIMPLE) });

        // 4) UI 名称输入点按钮
        {
            const out = {};
            await page.fill('#name-input', '鞘磷脂');
            await page.fill('#smiles-input', '');
            const btn = '#btn-molecule-from-input';
            const before = await page.evaluate(() => document.getElementById('btn-molecule-from-input').textContent);
            out.btnBefore = before;
            await page.click(btn);
            await page.waitForTimeout(8000);
            out.btnAfter = await page.evaluate(() => document.getElementById('btn-molecule-from-input').textContent);
            out.toast = await page.evaluate(() => { const t = document.getElementById('toast-message'); return t ? t.textContent : ''; });
            out.atoms = await page.evaluate(() => { try { return window.__diag.atomPositions().length; } catch (e) { return -1; } });
            out.smilesRefill = await page.evaluate(() => document.getElementById('smiles-input').value);
            report.results.push({ name: 'UI 名称鞘磷脂', data: out });
        }

        // 5) UI SMILES 输入(简化)点按钮
        {
            const out = {};
            await page.fill('#name-input', '');
            await page.fill('#smiles-input', SM_SPH_SIMPLE);
            await page.click('#btn-molecule-from-input');
            await page.waitForTimeout(8000);
            out.toast = await page.evaluate(() => { const t = document.getElementById('toast-message'); return t ? t.textContent : ''; });
            out.atoms = await page.evaluate(() => { try { return window.__diag.atomPositions().length; } catch (e) { return -1; } });
            report.results.push({ name: 'UI SMILES 简化鞘磷脂', data: out });
        }

        // 6) UI SMILES 输入(完整,含手性/顺反)点按钮 —— 应剥除立体标记后生成
        {
            const out = {};
            await page.fill('#name-input', '');
            await page.fill('#smiles-input', SM_SPH);
            await page.click('#btn-molecule-from-input');
            await page.waitForTimeout(12000);
            out.toast = await page.evaluate(() => { const t = document.getElementById('toast-message'); return t ? t.textContent : ''; });
            out.atoms = await page.evaluate(() => { try { return window.__diag.atomPositions().length; } catch (e) { return -1; } });
            out.refill = await page.evaluate(() => document.getElementById('smiles-input').value);
            report.results.push({ name: 'UI SMILES 完整鞘磷脂(含手性标记)', data: out });
        }
    } catch (e) {
        report.results.push({ name: 'FATAL', data: String(e).slice(0, 400) });
    }
    await browser.close();
    if (serverProc) serverProc.kill();
    console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });