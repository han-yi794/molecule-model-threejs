const { chromium } = require('playwright-core');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { consoleErrors: [], cases: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200)); });

    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);

    const cases = await page.evaluate(() => {
        const out = [];
        function snapshot() {
            return window.__diag.atomPositions();
        }
        function Hcount(t) { return window.__diag.atomPositions().filter(a => a.type === t).length; }

        // === 场景1:甲酸 C=O 中间放置 H ===
        (() => {
            document.getElementById('btn-clear-molecule').click();
            window.__diag.generateSpec('formicAcid');
            window.__diag.runOpt();
            const atoms = window.__diag.atomPositions();
            // 找羰基 O(与 C 双键)
            const c = atoms.find(a => a.type === 'C');
            const oC = atoms.filter(a => a.type === 'O');
            const ox = oC[0];
            // 放置 H 在 C 与羰基 O 之间中点
            const mid = { x: (c.x + ox.x) / 2, y: (c.y + ox.y) / 2, z: (c.z + ox.z) / 2 };
            const h = window.__createHeavyAtom('H', mid);
            window.__diag.updateBonds(); // 模拟拖放后建键流程（不含 isOptimizing 保护）
            // 新 H 的键数
            const hb = window.__diag.bonds().filter(b => b.pair.includes(h.userData._id));
            out.push({ name: 'formicAcid_mid_H', hBonds: hb.length, partners: hb.map(b => b.types[0] + '-' + b.types[1]), lens: hb.map(b => b.len) });
        })();

        // === 场景2:甲酸 C=O 附近(偏向 O)放 Cl ===
        (() => {
            document.getElementById('btn-clear-molecule').click();
            window.__diag.generateSpec('formicAcid');
            window.__diag.runOpt();
            const atoms = window.__diag.atomPositions();
            const c = atoms.find(a => a.type === 'C');
            const ox = atoms.find(a => a.type === 'O');
            // Cl 放在 C-O 中点偏向 O 一点
            const p = { x: c.x + (ox.x - c.x) * 0.65, y: c.y + (ox.y - c.y) * 0.65, z: c.z + (ox.z - c.z) * 0.65 };
            const cl = window.__createHeavyAtom('Cl', p);
            window.__diag.updateBonds();
            const cb = window.__diag.bonds().filter(b => b.pair[0] === cl.userData._id || b.pair[1] === cl.userData._id);
            out.push({ name: 'formicAcid_mid_Cl', clBonds: cb.length, partners: cb.map(b => b.types[0] + '-' + b.types[1]) });
        })();

        // === 场景3:苯环上放 H(与两个环碳等距)——双邻位 ===
        (() => {
            document.getElementById('btn-clear-molecule').click();
            window.__diag.generateSpec('benzene');
            window.__diag.runOpt();
            const atoms = window.__diag.atomPositions();
            const cs = atoms.filter(a => a.type === 'C');
            const a0 = cs[0], a1 = cs[1];
            const mid = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2, z: (a0.z + a1.z) / 2 };
            // 稍微向环中心外移(远离环心)让 H 同时在 a0/a1 阈值内
            const hh = window.__createHeavyAtom('H', mid);
            window.__diag.updateBonds();
            const hb = window.__diag.bonds().filter(b => b.pair[0] === hh.userData._id || b.pair[1] === hh.userData._id);
            out.push({ benzenemidH_hBonds: hb.length, partners: hb.map(b => b.types[0] + '-' + b.types[1]) });
        })();

        // === 场景4:正常连单个原子仍应能成键(乙烷端放 H) ===
        (() => {
            document.getElementById('btn-clear-molecule').click();
            window.__diag.generateSpec('ethane');
            window.__diag.runOpt();
            const atoms = window.__diag.atomPositions();
            const c = atoms.find(a => a.type === 'C');
            // 放 H 于 C 外侧 1.09 处(沿 +X)
            const h = window.__createHeavyAtom('H', { x: c.x + 1.09, y: c.y, z: c.z });
            window.__diag.updateBonds();
            const hb = window.__diag.bonds().filter(b => b.pair[0] === h.userData._id || b.pair[1] === h.userData._id);
            out.push({ name: 'ethane_end_H', hBonds: hb.length, partners: hb.map(b => b.types[0] + '-' + b.types[1]) });
        })();

        return out;
    });
    report.cases = cases;
    await browser.close();
    console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });