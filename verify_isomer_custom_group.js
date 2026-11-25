// 同分异构体筛选：酚/醇羟基区分 + 自定义 SMILES 基团 + SMILES 小键盘（2026-11）
// A 纯函数电池 / M 真实 UI（结果面板 + 检索前筛选 + 小键盘）/ D1 33 例几何回归 / E1 零 console
const { chromium } = require('playwright');
(async () => {
    const results = [];
    const ok = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1');
    await page.waitForFunction(() => window.__isomerFilter && window.__smilesKeypad && window.__setInputPanelOpen, null, { timeout: 30000 });
    await page.evaluate(() => window.__setInputPanelOpen(false));

    // ============ A1 酚羟基 / 醇羟基 区分 ============
    const a1 = await page.evaluate(() => {
        const F = window.__isomerFilter;
        const cases = {
            phenol: 'Oc1ccccc1',
            ethanol: 'CCO',
            acetic: 'CC(=O)O',
            vinylAlcohol: 'C=CO',
            cyclohexanol: 'OC1CCCCC1',
            anisole: 'COC',
            cresol: 'Cc1ccccc1O',
            naphthol: 'Oc1ccc2ccccc2c1'
        };
        const out = {};
        Object.keys(cases).forEach(k => {
            const an = F.analyze(cases[k]);
            out[k] = an ? {
                oh: an.groups.indexOf('oh') >= 0,
                phoh: an.groups.indexOf('phoh') >= 0,
                aloh: an.groups.indexOf('aloh') >= 0
            } : null;
        });
        return out;
    });
    ok('A1 酚羟基只命中酚/萘酚、醇羟基只命中醇/环醇',
        a1.phenol && a1.phenol.oh && a1.phenol.phoh && !a1.phenol.aloh
        && a1.cresol && a1.cresol.phoh && !a1.cresol.aloh
        && a1.naphthol && a1.naphthol.phoh && !a1.naphthol.aloh
        && a1.ethanol && a1.ethanol.aloh && !a1.ethanol.phoh
        && a1.cyclohexanol && a1.cyclohexanol.aloh && !a1.cyclohexanol.phoh
        && a1.acetic && a1.acetic.oh && !a1.acetic.aloh && !a1.acetic.phoh
        && a1.vinylAlcohol && a1.vinylAlcohol.oh && !a1.vinylAlcohol.aloh && !a1.vinylAlcohol.phoh
        && a1.anisole && !a1.anisole.oh, a1);

    // ============ A2 compileCustom 电池 ============
    const a2 = await page.evaluate(() => {
        const F = window.__isomerFilter;
        const c = (s) => { const r = F.compileCustom(s); return r.ok ? { ok: true, n: r.query.n, smiles: r.smiles } : { ok: false, error: r.error }; };
        return {
            benzene: c('c1ccccc1'),
            kekule: c('C1=CC=CC=C1'),
            oh: c('[OH]'),
            ch3: c('[CH3]'),
            cco: c('CCO'),
            dot: c('CCO.CCO'),
            openRing: c('C1CC'),
            badArom: c('x'),
            tooBig: c('C'.repeat(26)),
            empty: c('   '),
            again: F.compileCustom('c1ccccc1') === F.compileCustom('c1ccccc1')
        };
    });
    ok('A2 compileCustom：合法/芳香等价/显式氢/错误与缓存',
        a2.benzene.ok && a2.benzene.n === 6
        && a2.kekule.ok && a2.kekule.n === 6
        && a2.oh.ok && a2.ch3.ok && a2.cco.ok
        && !a2.dot.ok && a2.dot.error.indexOf('单个片段') >= 0
        && !a2.openRing.ok && a2.openRing.error.indexOf('解析失败') >= 0
        && !a2.badArom.ok && !a2.tooBig.ok && a2.tooBig.error.indexOf('过大') >= 0
        && !a2.empty.ok && a2.again === true, a2);

    // ============ A3 子图匹配电池 ============
    const a3 = await page.evaluate(() => {
        const F = window.__isomerFilter;
        const an = (s) => F.analyze(s);
        const m = (s, q) => F.matchCustom(an(s), q);
        return {
            phenolBenzene: m('Oc1ccccc1', 'c1ccccc1'),
            phenolOh: m('Oc1ccccc1', '[OH]'),
            phenolCC: m('Oc1ccccc1', 'CC'),
            anisoleOh: m('COc1ccccc1', '[OH]'),
            anisolePhenolQuery: m('COc1ccccc1', 'c1ccccc1O'),
            benzeneKekule: m('c1ccccc1', 'C1=CC=CC=C1'),
            benzeneCyclohex: m('c1ccccc1', 'C1CCCCC1'),
            cyclohexBenzene: m('C1CCCCC1', 'c1ccccc1'),
            tolueneCH3: m('Cc1ccccc1', '[CH3]'),
            benzeneCH3: m('c1ccccc1', '[CH3]'),
            ethanolCH2: m('CCO', '[CH2]'),
            benzeneCH2: m('c1ccccc1', '[CH2]'),
            acidCarbonyl: m('CC(=O)O', 'C=O'),
            ethanolCarbonyl: m('CCO', 'C=O'),
            badQuery: m('CCO', 'C1CC')
        };
    });
    ok('A3 子结构匹配：芳环等价/显式氢下限/键级与错误查询',
        a3.phenolBenzene === true && a3.phenolOh === true && a3.phenolCC === false
        && a3.anisoleOh === false && a3.anisolePhenolQuery === true
        && a3.benzeneKekule === true && a3.benzeneCyclohex === false && a3.cyclohexBenzene === false
        && a3.tolueneCH3 === true && a3.benzeneCH3 === false
        && a3.ethanolCH2 === true && a3.benzeneCH2 === false
        && a3.acidCarbonyl === true && a3.ethanolCarbonyl === false && a3.badQuery === false, a3);

    // ============ M 真实 UI：C2H6O ============
    const openPanel = async (formula, titleSub) => {
        await page.evaluate(() => window.__setInputPanelOpen(true));
        await page.fill('#formula-input', formula);
        await page.press('#formula-input', 'Enter');
        await page.waitForFunction((sub) => {
            const p = document.getElementById('isomer-panel');
            const t = document.getElementById('isomer-panel-title');
            return p && p.style.display === 'flex' && t && t.textContent.indexOf(sub) >= 0
                && document.querySelectorAll('#isomer-list label').length >= 2;
        }, titleSub, { timeout: 60000 });
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(350);
    };
    const panelState = () => page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        return {
            vis: rows.filter(r => r.style.display !== 'none').length,
            total: rows.length,
            status: document.getElementById('isomer-filter-status').textContent,
            custom: (window.__isomerFilter.state().custom || []).slice(),
            chips: Array.from(document.querySelectorAll('#isomer-custom-chips .isof-custom-chip')).map(c => c.dataset.smiles)
        };
    });
    await openPanel('C2H6O', 'C\u2082H\u2086O');
    const m1 = await page.evaluate(() => {
        const chip = (k) => document.querySelector('#isomer-group-chips .isof-chip[data-key="' + k + '"]');
        return {
            chipsG: document.querySelectorAll('#isomer-group-chips .isof-chip').length,
            hasOh: !!chip('oh'), hasPh: !!chip('phoh'), hasAl: !!chip('aloh'),
            labelPh: chip('phoh') ? chip('phoh').textContent : '',
            labelAl: chip('aloh') ? chip('aloh').textContent : '',
            labelOh: chip('oh') ? chip('oh').textContent : '',
            tipOh: chip('oh') ? chip('oh').title : '',
            rows: document.querySelectorAll('#isomer-list label').length
        };
    });
    ok('M1 结果面板 19 个官能团含 酚羟基/醇羟基/任意羟基', m1.chipsG === 19 && m1.hasOh && m1.hasPh && m1.hasAl
        && m1.labelPh.indexOf('酚羟基') >= 0 && m1.labelAl.indexOf('醇羟基') >= 0
        && m1.labelOh === '羟基' && m1.tipOh.indexOf('任意') >= 0 && m1.rows === 2, m1);

    // 酚羟基 → 0/2；醇羟基 → 1/2（乙醇）
    await page.click('#isomer-group-chips .isof-chip[data-key="phoh"]');
    const m2a = await panelState();
    await page.click('#isomer-group-chips .isof-chip[data-key="phoh"]');
    await page.click('#isomer-group-chips .isof-chip[data-key="aloh"]');
    const m2b = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        const vis = rows.filter(r => r.style.display !== 'none');
        return { vis: vis.length, names: vis.map(r => r.textContent), status: document.getElementById('isomer-filter-status').textContent };
    });
    ok('M2 酚羟基过滤 0/2、醇羟基过滤 1/2（乙醇）', m2a.vis === 0 && m2a.status.indexOf('显示 0 / 2') >= 0
        && m2b.vis === 1 && m2b.status.indexOf('显示 1 / 2') >= 0 && m2b.names[0].indexOf('ethanol') >= 0, { m2a, m2b });
    await page.click('#isomer-filter-reset');

    // ============ M3 自定义基团：输入框 + 添加 + chip 删除 ============
    await page.fill('#isomer-custom-input', 'CCO');
    await page.click('#isomer-custom-add');
    const m3a = await panelState();
    await page.click('#isomer-custom-chips .isof-custom-chip');
    const m3b = await panelState();
    ok('M3 输入 CCO 添加 → 1/2 且 chip 显示；点 chip 移除 → 2/2',
        m3a.vis === 1 && m3a.custom.length === 1 && m3a.custom[0] === 'CCO' && m3a.chips[0] === 'CCO'
        && m3b.vis === 2 && m3b.custom.length === 0 && m3b.chips.length === 0, { m3a, m3b });

    // ============ M4 多个自定义基团 + 满足全部/任一 ============
    await page.fill('#isomer-custom-input', 'CO');
    await page.click('#isomer-custom-add');
    const m4a = await panelState();
    await page.fill('#isomer-custom-input', 'CCO');
    await page.click('#isomer-custom-add');
    const m4b = await panelState();
    await page.selectOption('#isomer-filter-mode', 'any');
    const m4c = await panelState();
    await page.selectOption('#isomer-filter-mode', 'all');
    const m4d = await panelState();
    await page.click('#isomer-filter-reset');
    const m4e = await panelState();
    ok('M4 两个自定义基团：全部=1/2、任一=2/2、重置清空',
        m4a.vis === 2 && m4a.custom.length === 1
        && m4b.vis === 1 && m4b.custom.length === 2 && m4b.status.indexOf('显示 1 / 2') >= 0
        && m4c.vis === 2 && m4d.vis === 1
        && m4e.vis === 2 && m4e.custom.length === 0, { m4a, m4b, m4c, m4d, m4e });

    // ============ M5 SMILES 小键盘：真实鼠标输入 + 退格 + 确定 ============
    await page.click('#isomer-custom-keypad-btn');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('smiles-keypad')).display !== 'none', null, { timeout: 5000 });
    const m5a = await page.evaluate(() => ({
        owner: window.__smilesKeypad.owner(),
        keys: document.querySelectorAll('#smiles-keypad .fkp-key').length,
        visible: getComputedStyle(document.getElementById('smiles-keypad')).display !== 'none',
        inView: (() => {
            const r = document.getElementById('smiles-keypad').getBoundingClientRect();
            return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5;
        })()
    }));
    await page.click('#smiles-keypad .fkp-key[data-smiles-key="C"]');
    await page.click('#smiles-keypad .fkp-key[data-smiles-key="C"]');
    await page.click('#smiles-keypad .fkp-key[data-smiles-key="O"]');
    const m5b = await page.evaluate(() => document.getElementById('isomer-custom-input').value);
    await page.click('#smiles-keypad-backspace');
    const m5c = await page.evaluate(() => document.getElementById('isomer-custom-input').value);
    await page.click('#smiles-keypad .fkp-key[data-smiles-key="O"]');
    await page.click('#smiles-keypad-ok');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('smiles-keypad')).display === 'none', null, { timeout: 5000 });
    const m5d = await panelState();
    const m5e = await page.evaluate(() => document.getElementById('isomer-custom-input').value);
    ok('M5 小键盘真实输入 CCO、退格、确定 → chip + 收起 + 清空输入',
        m5a.owner === 'isomer' && m5a.keys === 32 && m5a.visible && m5a.inView
        && m5b === 'CCO' && m5c === 'CC' && m5d.custom[0] === 'CCO' && m5d.vis === 1 && m5e === '', { m5a, m5b, m5c, m5d, m5e });
    await page.click('#isomer-filter-reset');

    // ============ M6 Escape 分层：小键盘 → 面板 ============
    await page.click('#isomer-custom-keypad-btn');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('smiles-keypad')).display !== 'none', null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('smiles-keypad')).display === 'none', null, { timeout: 5000 });
    const m6a = await page.evaluate(() => ({
        kp: getComputedStyle(document.getElementById('smiles-keypad')).display,
        panel: getComputedStyle(document.getElementById('isomer-panel')).display
    }));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__ddAnim.idle(), null, { timeout: 8000 });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('isomer-panel')).display === 'none', null, { timeout: 8000 });
    const m6b = await page.evaluate(() => getComputedStyle(document.getElementById('isomer-panel')).display);
    ok('M6 Esc 一次只关一层：先小键盘（面板仍在）再面板', m6a.kp === 'none' && m6a.panel === 'flex' && m6b === 'none', { m6a, m6b });
    await openPanel('C2H6O', 'C\u2082H\u2086O');

    // ============ M7 小键盘拖动 + 视口夹取 + resetPosition ============
    await page.click('#isomer-custom-keypad-btn');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('smiles-keypad')).display !== 'none', null, { timeout: 5000 });
    const kpBefore = await page.evaluate(() => {
        const r = document.getElementById('smiles-keypad').getBoundingClientRect();
        return { x: r.left, y: r.top };
    });
    const headBox = await page.locator('#smiles-keypad .fkp-head').boundingBox();
    let m7 = null;
    if (headBox) {
        await page.mouse.move(headBox.x + 40, headBox.y + 12);
        await page.mouse.down();
        await page.mouse.move(headBox.x + 120, headBox.y + 72, { steps: 8 });
        await page.mouse.up();
        m7 = await page.evaluate(() => {
            const r = document.getElementById('smiles-keypad').getBoundingClientRect();
            return {
                moved: window.__smilesKeypad.isMoved(),
                x: r.left, y: r.top,
                inView: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5,
                focused: document.activeElement ? document.activeElement.id : ''
            };
        });
    }
    ok('M7 拖动标题栏移动小键盘且不出视口',
        !!m7 && m7.moved === true && (Math.abs(m7.x - kpBefore.x) > 20 || Math.abs(m7.y - kpBefore.y) > 20) && m7.inView,
        { kpBefore, m7 });
    await page.evaluate(() => window.__smilesKeypad.resetPosition());
    const m7b = await page.evaluate(() => window.__smilesKeypad.isMoved());
    ok('M7b resetPosition 清除“用户已移动”标记', m7b === false, m7b);

    // ============ M8 点面板其它位置 → 小键盘收起、面板保留 ============
    await page.click('#isomer-panel-title');
    const m8 = await page.evaluate(() => ({
        kp: getComputedStyle(document.getElementById('smiles-keypad')).display,
        panel: getComputedStyle(document.getElementById('isomer-panel')).display
    }));
    ok('M8 点面板其它位置收起小键盘（面板仍在）', m8.kp === 'none' && m8.panel === 'flex', m8);

    // ============ M9 非法自定义 SMILES → 提示且不加 chip ============
    await page.fill('#isomer-custom-input', 'x');
    await page.click('#isomer-custom-add');
    const m9 = await page.evaluate(() => ({
        hint: document.getElementById('isomer-custom-hint').textContent,
        invalid: document.getElementById('isomer-custom-input').classList.contains('isof-invalid'),
        chips: document.querySelectorAll('#isomer-custom-chips .isof-custom-chip').length,
        custom: window.__isomerFilter.state().custom.length
    }));
    ok('M9 非法 SMILES 提示错误、输入框标红、不产生 chip', m9.hint.length > 0 && m9.invalid === true && m9.chips === 0 && m9.custom === 0, m9);
    await page.fill('#isomer-custom-input', '');

    // ============ M10 检索前筛选面板：自定义输入 + 小键盘 owner=pre ============
    await page.evaluate(() => { window.__isomerPresearch.open('C12H13N3O2'); });
    await page.waitForFunction(() => window.__isomerPresearch.visible(), null, { timeout: 15000 });
    const m10a = await page.evaluate(() => ({
        input: !!document.getElementById('isomer-pre-custom-input'),
        kpBtn: !!document.getElementById('isomer-pre-custom-keypad-btn'),
        chips: document.querySelectorAll('#isomer-pre-group-chips .isof-chip').length,
        rows: document.querySelectorAll('#isomer-list label').length
    }));
    await page.click('#isomer-pre-custom-keypad-btn');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('smiles-keypad')).display !== 'none', null, { timeout: 5000 });
    const m10b = await page.evaluate(() => window.__smilesKeypad.owner());
    for (const k of ['c', '1', 'c', 'c', 'c', 'c', 'c', '1']) {
        await page.click('#smiles-keypad .fkp-key[data-smiles-key="' + k + '"]');
    }
    const m10c = await page.evaluate(() => document.getElementById('isomer-pre-custom-input').value);
    await page.click('#smiles-keypad-ok');
    const m10d = await page.evaluate(() => ({
        custom: window.__isomerPresearch.custom(),
        chips: Array.from(document.querySelectorAll('#isomer-pre-custom-chips .isof-custom-chip')).map(c => c.dataset.smiles),
        kp: getComputedStyle(document.getElementById('smiles-keypad')).display
    }));
    ok('M10 检索前筛选：小键盘 owner=pre、输入 c1ccccc1 → chip',
        m10a.input && m10a.kpBtn && m10a.chips === 19
        && m10b === 'pre' && m10c === 'c1ccccc1'
        && m10d.custom.length === 1 && m10d.custom[0] === 'c1ccccc1'
        && m10d.chips[0] === 'c1ccccc1' && m10d.kp === 'none', { m10a, m10b, m10c, m10d });

    // Esc：先关键盘（已关则关面板），再关面板
    await page.click('#isomer-pre-custom-keypad-btn');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('smiles-keypad')).display !== 'none', null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('smiles-keypad')).display === 'none', null, { timeout: 5000 });
    const m10e = await page.evaluate(() => ({ kp: getComputedStyle(document.getElementById('smiles-keypad')).display, panel: window.__isomerPresearch.visible() }));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__isomerPresearch.visible(), null, { timeout: 8000 });
    const m10f = await page.evaluate(() => window.__isomerPresearch.visible());
    ok('M10b Esc 分层：先小键盘（预筛选面板仍在）再面板', m10e.kp === 'none' && m10e.panel === true && m10f === false, { m10e, m10f });

    // ============ M11 opts.filter 带入自定义条件（结果面板） ============
    const m11 = await page.evaluate(async () => {
        const res = await window.__fetchFormulaIsomers('C2H6O');
        if (!res || !res.ok) return { fetch: res && res.error };
        window.__showIsomerPanel('C2H6O', res.items, { filter: { custom: ['CCO', 'x'], groups: [], types: [], countRaw: '', noExch: false, mode: 'all' } });
        await new Promise(r => setTimeout(r, 500));
        return {
            fetch: 'ok',
            custom: window.__isomerFilter.state().custom.slice(),
            chips: Array.from(document.querySelectorAll('#isomer-custom-chips .isof-custom-chip')).map(c => c.dataset.smiles),
            status: document.getElementById('isomer-filter-status').textContent,
            vis: Array.from(document.querySelectorAll('#isomer-list label')).filter(r => r.style.display !== 'none').length
        };
    });
    ok('M11 预筛选条件带入：CCO 生效、非法查询丢弃、1/2',
        m11.fetch === 'ok' && m11.custom.length === 1 && m11.custom[0] === 'CCO'
        && m11.chips[0] === 'CCO' && m11.vis === 1 && m11.status.indexOf('显示 1 / 2') >= 0, m11);
    await page.evaluate(() => window.__isomerFilter.set({ custom: [], groups: [], types: [], countRaw: '', mode: 'all' }));

    // ============ M12 手机 375×667：小键盘不超屏、键位可点 ============
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => { window.__smilesKeypad.resetPosition(); });
    await page.evaluate(() => window.__smilesKeypad.show('isomer'));
    await page.waitForTimeout(250);
    const m12 = await page.evaluate(() => {
        const kp = document.getElementById('smiles-keypad');
        const r = kp.getBoundingClientRect();
        const key = kp.querySelector('.fkp-key');
        const kr = key ? key.getBoundingClientRect() : null;
        return {
            inView: r.left >= -0.5 && r.top >= -0.5 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5,
            w: Math.round(r.width), keyH: kr ? Math.round(kr.height) : 0
        };
    });
    ok('M12 375×667 小键盘不超屏且键位高度 ≥32', m12.inView && m12.keyH >= 32, m12);
    await page.evaluate(() => window.__smilesKeypad.hide());
    await page.setViewportSize({ width: 1280, height: 860 });

    // ============ D1 页面 33 例几何自测回归 ============
    await page.evaluate(() => { document.getElementById('isomer-panel-close').click(); });
    await page.evaluate(() => { window.lastRunResults = null; setTimeout(() => { try { runAllExamplesAndTests(); } catch (e) {} }, 0); });
    await page.waitForFunction(() => !!window.lastRunResults && Array.isArray(window.lastRunResults.results) && window.lastRunResults.results.length >= 33, null, { timeout: 240000 }).catch(() => {});
    const auto = await page.evaluate(() => {
        const lrr = window.lastRunResults;
        if (!lrr || !Array.isArray(lrr.results)) return null;
        return { n: lrr.results.length, fails: lrr.results.filter(r => !r.pass).map(r => r.example) };
    });
    if (auto) {
        ok('D1 页面 33 例自测全过（' + (auto.n - auto.fails.length) + '/' + auto.n + '）', auto.n >= 33 && auto.fails.length === 0, auto.fails.length ? auto.fails : undefined);
    } else ok('D1 页面自测结果可读', false, { lastRunResults: 'missing' });

    ok('E1 零 console 错误', errs.length === 0, errs.slice(0, 3));
    console.log(results.join('\n'));
    const failed = results.filter(r => r.startsWith('FAIL'));
    console.log(failed.length ? ('RESULT: ' + failed.length + ' FAILED') : 'RESULT: ALL PASS');
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
