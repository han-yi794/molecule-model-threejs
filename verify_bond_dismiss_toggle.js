// 验证：键菜单/单键旋转「点击别处」即时收起 + 检查器视图开关整行可点（球棍模型4.html）
// 运行: cmd /c "node verify_bond_dismiss_toggle.js > verify_dismiss.json 2>&1"
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=dismiss1';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const report = { cases: [], consoleErrors: [] };
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

    function check(name, pass, detail) {
        report.cases.push({ name, pass: !!pass, detail: String(detail === undefined ? '' : detail).slice(0, 500) });
        console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' | ' + String(detail).slice(0, 300) : ''));
    }

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__diag && window.__setInputPanelOpen, null, { timeout: 30000 });
    await page.evaluate(() => window.__setInputPanelOpen(false));
    await page.waitForFunction(() => {
        const el = document.getElementById('input-panel');
        return el && !el.classList.contains('open') && getComputedStyle(el).visibility === 'hidden';
    }, null, { timeout: 5000 });
    await page.waitForTimeout(300);

    const resetToggles = () => page.evaluate(() => {
        try { window.__setHydrogenate(false); } catch (e) {}
        try { window.__toggleLonePairs(false); } catch (e) {}
        try { if (window.__atomLabels && !window.__atomLabels.get()) window.__atomLabels.set(true); } catch (e) {}
        const g = document.getElementById('chk-grid');
        if (g && g.checked) { g.checked = false; g.dispatchEvent(new Event('change', { bubbles: true })); }
        const p = document.getElementById('chk-pi');
        if (p && p.checked) { try { window.__togglePiSystems(); } catch (e) {} }
        if (window.__delocPiMode && window.__delocPiMode()) { try { window.__setDelocPiMode(false); } catch (e) {} }
    });

    const stateOf = (id) => page.evaluate((id) => {
        const inp = document.getElementById(id);
        const row = inp.closest('.toggle-row');
        return {
            checked: inp.checked,
            on: row.classList.contains('on'),
            disabled: row.classList.contains('disabled'),
            hydro: window.__hydrogenateAuto(),
            lp: window.__lpVisualMode(),
            labels: window.__atomLabels ? window.__atomLabels.get() : null,
            grid: window.__dragMode.gridSnap(),
            deloc: window.__delocPiMode()
        };
    }, id);

    const rowInfo = await page.evaluate(() => [...document.querySelectorAll('#inspect-body .toggle-row')].map(r => {
        const input = r.querySelector('input');
        const sw = r.querySelector('.switch');
        const name = r.querySelector('.toggle-name');
        const rb = r.getBoundingClientRect();
        const sb = sw.getBoundingClientRect();
        const nb = name.getBoundingClientRect();
        return {
            id: input.id,
            row: { x: rb.x, y: rb.y, w: rb.width, h: rb.height },
            sw: { x: sb.x, y: sb.y, w: sb.width, h: sb.height },
            nb: { x: nb.x, y: nb.y, w: nb.width, h: nb.height }
        };
    }));
    check('T0 检查器视图段共 6 个开关行', rowInfo.length === 6, JSON.stringify(rowInfo.map(r => r.id)));

    const pointsOf = (r) => [
        { at: '左内边距', x: r.row.x + 3, y: r.row.y + r.row.h / 2 },
        { at: '名称中部', x: r.nb.x + r.nb.w / 2, y: r.nb.y + r.nb.h / 2 },
        { at: '名称与开关间隙', x: r.sw.x - 8, y: r.row.y + r.row.h / 2 },
        { at: '开关中心', x: r.sw.x + r.sw.w / 2, y: r.sw.y + r.sw.h / 2 },
        { at: '右侧内边距', x: r.row.x + r.row.w - 2, y: r.row.y + r.row.h / 2 }
    ];

    // ---------- T1. 视图开关：整行 5 个点位都能翻转一次 ----------
    for (const id of ['chk-hydro', 'chk-lp', 'chk-labels', 'chk-grid', 'chk-deloc']) {
        const r = rowInfo.find(x => x.id === id);
        let all = true; const details = [];
        for (const p of pointsOf(r)) {
            await resetToggles();
            await page.waitForTimeout(180);
            const before = await stateOf(id);
            const hit = await page.evaluate(({ x, y }) => {
                const e = document.elementFromPoint(x, y);
                return e ? (e.id || e.className || e.tagName) : null;
            }, p);
            await page.mouse.click(p.x, p.y);
            await page.waitForTimeout(id === 'chk-deloc' ? 500 : 260);
            const after = await stateOf(id);
            const flipped = after.checked === !before.checked && after.on === after.checked;
            const apiOk = (id === 'chk-hydro') ? after.hydro === after.checked
                : (id === 'chk-lp') ? after.lp === after.checked
                : (id === 'chk-labels') ? after.labels === after.checked
                : (id === 'chk-grid') ? after.grid === after.checked
                : after.deloc === after.checked;
            if (!flipped || !apiOk) all = false;
            details.push(`${p.at}@${Math.round(p.x)},${Math.round(p.y)} hit=${hit} ${before.checked}→${after.checked} api=${apiOk}`);
        }
        check(`T1 ${id} 整行 5 个点位单击都翻转一次`, all, details.join(' ; '));
    }
    await resetToggles();
    await page.waitForTimeout(300);

    // ---------- T2. π 高亮行：离域π关闭时禁用且有提示；开启后整行可点 ----------
    {
        const r = rowInfo.find(x => x.id === 'chk-pi');
        const namePt = pointsOf(r)[1];
        await page.mouse.click(namePt.x, namePt.y);
        await page.waitForTimeout(220);
        const s1 = await stateOf('chk-pi');
        const toast1 = await page.evaluate(() => document.getElementById('toast-message').textContent);
        const swPt = pointsOf(r)[3];
        await page.mouse.click(swPt.x, swPt.y);
        await page.waitForTimeout(220);
        const s2 = await stateOf('chk-pi');
        const toast2 = await page.evaluate(() => document.getElementById('toast-message').textContent);
        check('T2a 离域π关闭时 π 高亮行点击不翻转且提示先开启',
            s1.checked === false && s1.disabled === true && /请先开启离域π键/.test(toast1)
            && s2.checked === false && /请先开启离域π键/.test(toast2),
            `name=${s1.checked}/${s1.disabled}/"${toast1}" switch=${s2.checked}/"${toast2}"`);

        await page.evaluate(() => { if (!window.__delocPiMode()) window.__setDelocPiMode(true); });
        await page.waitForTimeout(500);
        const r2 = await page.evaluate(() => {
            const r = document.getElementById('chk-pi').closest('.toggle-row');
            const sw = r.querySelector('.switch'), name = r.querySelector('.toggle-name');
            const rb = r.getBoundingClientRect(), sb = sw.getBoundingClientRect(), nb = name.getBoundingClientRect();
            return {
                disabled: r.classList.contains('disabled'),
                row: { x: rb.x, y: rb.y, w: rb.width, h: rb.height },
                sw: { x: sb.x, y: sb.y, w: sb.width, h: sb.height },
                nb: { x: nb.x, y: nb.y, w: nb.width, h: nb.height }
            };
        });
        let all = !r2.disabled; const details = [];
        for (const p of pointsOf(r2)) {
            await page.evaluate(() => { const p = document.getElementById('chk-pi'); if (p.checked) window.__togglePiSystems(); });
            await page.waitForTimeout(120);
            const before = await stateOf('chk-pi');
            await page.mouse.click(p.x, p.y);
            await page.waitForTimeout(220);
            const after = await stateOf('chk-pi');
            const flipped = after.checked === !before.checked && after.on === after.checked;
            if (!flipped) all = false;
            details.push(`${p.at} ${before.checked}→${after.checked}`);
        }
        await page.evaluate(() => { const p = document.getElementById('chk-pi'); if (p.checked) window.__togglePiSystems(); });
        check('T2b 离域π开启后 π 高亮行整行 5 个点位可点', all, details.join(' ; '));
        await page.evaluate(() => { if (window.__delocPiMode()) window.__setDelocPiMode(false); });
        await page.waitForTimeout(400);
    }

    // ---------- 工具：生成分子 / 找屏幕上的单键 ----------
    const genButane = async () => {
        await page.evaluate(() => { window.__diag.generateSpec('butane'); window.__setInputPanelOpen(false); });
        await page.waitForTimeout(700);
    };
    const findBond = () => page.evaluate(() => {
        const bonds = window.__diag.bonds();
        const atoms = window.__diag.atomPositions();
        const byId = new Map(atoms.map(a => [a.id, a]));
        for (const b of bonds) {
            if (b.type >= 1.6) continue;
            const a = byId.get(b.pair[0]), c = byId.get(b.pair[1]);
            if (!a || !c) continue;
            const sa = window.__dragMode.project(a.x, a.y, a.z);
            const sc = window.__dragMode.project(c.x, c.y, c.z);
            const mid = { x: (sa.x + sc.x) / 2, y: (sa.y + sc.y) / 2 };
            const hit = window.__dragMode.pickAt(mid.x, mid.y);
            if (hit && hit.kind === 'bond') return {
                mid, endA: { x: sa.x, y: sa.y, id: a.id }, endB: { x: sc.x, y: sc.y, id: c.id },
                pair: b.pair, type: b.type
            };
        }
        return null;
    });
    const menuState = () => page.evaluate(() => ({
        display: getComputedStyle(document.getElementById('bond-type-menu')).display,
        selected: window.__dragMode.selectedBond()
    }));
    const torsionState = () => page.evaluate(() => ({
        active: window.__torsion.active(),
        axis: window.__torsion.axisVisible(),
        hudOpacity: getComputedStyle(document.getElementById('torsion-hud')).opacity,
        selected: window.__dragMode.selectedBond(),
        dragging: window.__torsion.dragging ? window.__torsion.dragging() : null
    }));
    const waitAnim = () => page.waitForFunction(() => window.__ddAnim && window.__ddAnim.idle(), null, { timeout: 5000 });

    const box = await page.locator('canvas[data-engine]').boundingBox();
    const blank = { x: box.x + 60, y: box.y + 60 };

    // ---------- T3. 键菜单：点画布空白立即收起并清键选中 ----------
    await genButane();
    let b = await findBond();
    check('T3a 丁烷找到可点单键', !!b, b ? JSON.stringify(b.pair) : 'none');
    if (b) {
        await page.mouse.click(b.mid.x, b.mid.y);
        await page.waitForTimeout(250);
        const opened = await menuState();
        await page.mouse.click(blank.x, blank.y);
        await waitAnim();
        await page.waitForTimeout(150);
        const closed = await menuState();
        check('T3b 点空白：菜单收起 + selectedBond 清空',
            opened.display === 'flex' && !!opened.selected && closed.display === 'none' && closed.selected === null,
            `opened=${JSON.stringify(opened)} closed=${JSON.stringify(closed)}`);
        // 再点同一根键：必须能重新弹出（旧逻辑会因 selectedBond 残留而“反选不弹”）
        await page.mouse.click(b.mid.x, b.mid.y);
        await page.waitForTimeout(250);
        const reopened = await menuState();
        check('T3c 空白收起后再次点键仍能重新弹出菜单',
            reopened.display === 'flex' && !!reopened.selected, JSON.stringify(reopened));
    }

    // ---------- T4. 键菜单：点顶栏/检查器也收起 ----------
    if (b) {
        await page.mouse.click(b.mid.x, b.mid.y);
        await page.waitForTimeout(250);
        await page.mouse.click(720, 22);   // 顶栏空白
        await waitAnim();
        const topbar = await menuState();
        await page.mouse.click(b.mid.x, b.mid.y);
        await page.waitForTimeout(250);
        await page.mouse.click(1370, 700); // 检查器空白
        await waitAnim();
        const inspector = await menuState();
        check('T4 点顶栏/检查器：菜单收起 + 键选中清空',
            topbar.display === 'none' && topbar.selected === null && inspector.display === 'none' && inspector.selected === null,
            `topbar=${JSON.stringify(topbar)} inspector=${JSON.stringify(inspector)}`);
    }

    // ---------- T5. 键菜单：点非端点原子也收起 ----------
    if (b) {
        await page.mouse.click(b.mid.x, b.mid.y);
        await page.waitForTimeout(250);
        const atomPt = await page.evaluate(({ pair, blankX, blankY }) => {
            const menu = document.getElementById('bond-type-menu').getBoundingClientRect();
            const atoms = window.__diag.atomPositions();
            for (const a of atoms) {
                if (pair.includes(a.id)) continue;
                const s = window.__dragMode.project(a.x, a.y, a.z);
                if (s.x > menu.left - 8 && s.x < menu.right + 8 && s.y > menu.top - 8 && s.y < menu.bottom + 8) continue;
                if (Math.hypot(s.x - blankX, s.y - blankY) < 40) continue;
                return { x: s.x, y: s.y, id: a.id };
            }
            return null;
        }, { pair: b.pair, blankX: blank.x, blankY: blank.y });
        if (atomPt) {
            await page.mouse.click(atomPt.x, atomPt.y);
            await waitAnim();
            await page.waitForTimeout(150);
            const st = await menuState();
            check('T5 点非端点原子：菜单收起 + 键选中清空',
                st.display === 'none' && st.selected === null, JSON.stringify(st));
        } else {
            check('T5 点非端点原子：菜单收起 + 键选中清空', false, 'no atom point outside menu');
        }
    }

    // ---------- T6. 单键旋转：空白单击立即退出 ----------
    await genButane();
    b = await findBond();
    if (b) {
        await page.mouse.click(b.mid.x, b.mid.y);
        await page.waitForTimeout(250);
        await page.mouse.click(b.endB.x, b.endB.y);
        await page.waitForTimeout(300);
        const on = await torsionState();
        await page.mouse.click(blank.x, blank.y);
        await page.waitForTimeout(350);
        const off = await torsionState();
        check('T6 旋转模式：空白单击退出（轴/HUD/键选中一并清空）',
            on.active === true && on.axis === true && off.active === false && off.axis === false && off.hudOpacity === '0' && off.selected === null,
            `on=${JSON.stringify(on)} off=${JSON.stringify(off)}`);
    } else {
        check('T6 旋转模式：空白单击退出（轴/HUD/键选中一并清空）', false, 'no bond');
    }

    // ---------- T7. 单键旋转：空白拖动仍旋转，松手保持旋转模式 ----------
    await genButane();
    b = await findBond();
    if (b) {
        await page.mouse.click(b.mid.x, b.mid.y);
        await page.waitForTimeout(250);
        await page.mouse.click(b.endB.x, b.endB.y);
        await page.waitForTimeout(300);
        const before = await page.evaluate(() => window.__diag.atomPositions().map(a => [a.id, a.x, a.y, a.z]));
        await page.mouse.move(blank.x, blank.y);
        await page.mouse.down();
        await page.mouse.move(blank.x + 140, blank.y, { steps: 16 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => window.__diag.atomPositions().map(a => [a.id, a.x, a.y, a.z]));
        let maxMove = 0;
        for (let i = 0; i < before.length; i++) {
            const d = Math.hypot(after[i][1] - before[i][1], after[i][2] - before[i][2], after[i][3] - before[i][3]);
            if (d > maxMove) maxMove = d;
        }
        const st = await torsionState();
        check('T7 旋转模式：空白拖动仍旋转且松手不退出',
            maxMove > 0.5 && st.active === true && st.axis === true && !!st.selected,
            `maxMove=${maxMove.toFixed(3)} state=${JSON.stringify(st)}`);
        // 再空白单击 → 退出
        await page.mouse.click(blank.x, blank.y);
        await page.waitForTimeout(350);
        const off = await torsionState();
        check('T7b 拖动后再空白单击仍能退出旋转', off.active === false && off.axis === false && off.selected === null,
            JSON.stringify(off));
    } else {
        check('T7 旋转模式：空白拖动仍旋转且松手不退出', false, 'no bond');
        check('T7b 拖动后再空白单击仍能退出旋转', false, 'no bond');
    }

    // ---------- T8. 单键旋转：点检查器退出 ----------
    await genButane();
    b = await findBond();
    if (b) {
        await page.mouse.click(b.mid.x, b.mid.y);
        await page.waitForTimeout(250);
        await page.mouse.click(b.endB.x, b.endB.y);
        await page.waitForTimeout(300);
        const on = await torsionState();
        await page.mouse.click(1370, 700);
        await page.waitForTimeout(350);
        const off = await torsionState();
        check('T8 旋转模式：点检查器/其它 UI 退出', on.active === true && off.active === false && off.axis === false,
            `on=${on.active} off=${JSON.stringify(off)}`);
    } else {
        check('T8 旋转模式：点检查器/其它 UI 退出', false, 'no bond');
    }

    // ---------- T9. 无 console 错误 ----------
    check('T9 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors.join(' | '));

    const pass = report.cases.filter(c => c.pass).length;
    report.summary = { pass, total: report.cases.length };
    console.log(`\nSUMMARY ${pass}/${report.cases.length}`);
    await browser.close();
    process.exit(pass === report.cases.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
