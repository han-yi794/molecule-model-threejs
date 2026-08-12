// SMILES 解析器验证脚本 —— 针对 球棍模型4.html 的 window.__parseSmiles
// 运行方式（必须先起静态服务器，或脚本会自动拉起）:
//   python -m http.server 8000
//   cmd /c "node verify_smiles.js > verify_smiles.json 2>&1"
// 输出 JSON 报告到 stdout; 有用例失败时 process.exitCode = 1。
const { chromium } = require('playwright-core');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8000;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1`;

// ---------- 服务器保障（已运行则复用，否则拉起 python http.server） ----------
function probe(url) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: 2500 }, (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 500); // 404 也算端口活着
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
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
    if (await waitPort(1000)) return null; // 已有服务器
    for (const bin of ['python', 'py']) {
        const proc = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() });
        const ready = await waitPort(15000);
        if (ready) return proc;
        proc.kill();
    }
    return null; // 起不来也不抛，让 page.goto 自然失败并报 FATAL
}

// ---------- 断言收集器 ----------
class AssertionCollector {
    constructor() { this.passed = 0; this.failed = 0; this.failures = []; }
    ok(cond, label) {
        if (cond) this.passed++;
        else { this.failed++; this.failures.push(label); }
    }
    eq(got, want, label) { this.ok(got === want, `${label}（期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}）`); }
    deepEqBond(got, want, label) {
        const ok = Array.isArray(got) && got.length === 3 &&
            got[0] === want[0] && got[1] === want[1] && got[2] === want[2];
        this.ok(ok, `${label}（期望 [${want}]，实际 ${JSON.stringify(got)}）`);
    }
    noError(r) { this.ok(!r.error, '不应返回 error（' + (r.error ? r.error.msg : '') + '）'); }
    hasError(r) {
        this.ok(!!r.error, '应返回 error 对象');
        if (r.error) {
            this.ok(typeof r.error.pos === 'number' && isFinite(r.error.pos), `error.pos 应为数字（实际 ${JSON.stringify(r.error.pos)}）`);
            this.ok(typeof r.error.msg === 'string' && r.error.msg.length > 0, `error.msg 应为非空字符串（实际 ${JSON.stringify(r.error.msg)}）`);
        }
    }
}

// 键查找辅助
function bond(bs, a, b) { return bs.find(x => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a)); }
const countOrder = (bs, o) => bs.filter(x => x[2] === o).length;

// ---------- 用例定义（21 个编号条目，12/15 拆分为子用例，共 23 个） ----------
const CASES = [
    { name: '01 甲烷 C：单原子无键', smiles: 'C', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 1, '原子数');
        a.eq(r.atoms[0].type, 'C', '原子类型');
        a.eq(r.bonds.length, 0, '键数');
    }},
    { name: '02 乙醇 CCO：2C+1O 线性', smiles: 'CCO', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.map(x => x.type).join(''), 'CCO', '原子类型序列');
        a.eq(r.bonds.length, 2, '键数');
        a.deepEqBond(r.bonds[0], [0, 1, 1], '键 0-1');
        a.deepEqBond(r.bonds[1], [1, 2, 1], '键 1-2');
    }},
    { name: '03 乙酸 CC(=O)O：羰基/羟基', smiles: 'CC(=O)O', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 4, '重原子数');
        a.eq(r.atoms.map(x => x.type).join(''), 'CCOO', '原子类型序列');
        a.eq(r.bonds.length, 3, '键数');
        a.deepEqBond(bond(r.bonds, 0, 1), [0, 1, 1], 'C0-C1 单键');
        a.deepEqBond(bond(r.bonds, 1, 2), [1, 2, 2], 'C1=O2 双键');
        a.deepEqBond(bond(r.bonds, 1, 3), [1, 3, 1], 'C1-O3 单键');
    }},
    { name: '04 氢氰酸 C#N：三键', smiles: 'C#N', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 2, '原子数');
        a.eq(r.atoms.map(x => x.type).join(''), 'CN', '原子类型序列');
        a.eq(r.bonds.length, 1, '键数');
        a.deepEqBond(r.bonds[0], [0, 1, 3], 'C#N 键序 3');
    }},
    { name: '05 环丙烷 C1CC1：3 元环', smiles: 'C1CC1', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 3, '原子数');
        a.eq(r.atoms.filter(x => x.type === 'C').length, 3, '全 C');
        a.eq(r.bonds.length, 3, '键数');
        a.deepEqBond(bond(r.bonds, 0, 1), [0, 1, 1], '键 0-1');
        a.deepEqBond(bond(r.bonds, 1, 2), [1, 2, 1], '键 1-2');
        a.deepEqBond(bond(r.bonds, 0, 2), [0, 2, 1], '环闭合键 0-2');
        a.ok(r.bonds.every(b => b[2] === 1), '全部单键');
    }},
    { name: '06 %12 环闭合 C%12CC%12', smiles: 'C%12CC%12', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 3, '原子数');
        a.eq(r.bonds.length, 3, '键数');
        a.deepEqBond(bond(r.bonds, 0, 2), [0, 2, 1], '%12 闭合键 0-2');
    }},
    { name: '07 苯 c1ccccc1：芳香 6C×1.5', smiles: 'c1ccccc1', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 6, '原子数');
        a.ok(r.atoms.every(x => x.type === 'C' && x.aromatic === true), '6 C 全 aromatic');
        a.eq(r.bonds.length, 6, '键数');
        a.ok(r.bonds.every(b => b[2] === 1.5), '6 条键序 1.5');
    }},
    { name: '08 吡啶 n1ccccc1：1N+5C', smiles: 'n1ccccc1', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 6, '原子数');
        a.eq(r.atoms.filter(x => x.type === 'N' && x.aromatic).length, 1, '1 个芳香 N');
        a.eq(r.atoms.filter(x => x.type === 'C').length, 5, '5 个 C');
        a.eq(r.bonds.length, 6, '键数');
        a.ok(r.bonds.every(b => b[2] === 1.5), '6 条键序 1.5');
    }},
    { name: '09 呋喃 c1ccoc1：1O+4C', smiles: 'c1ccoc1', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 5, '原子数');
        a.eq(r.atoms.filter(x => x.type === 'O' && x.aromatic).length, 1, '1 个芳香 O');
        a.eq(r.atoms.filter(x => x.type === 'C').length, 4, '4 个 C');
        a.eq(r.bonds.length, 5, '键数');
        a.ok(r.bonds.every(b => b[2] === 1.5), '5 条键序 1.5');
    }},
    { name: '10 噻吩 c1ccsc1：1S+4C', smiles: 'c1ccsc1', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 5, '原子数');
        a.eq(r.atoms.filter(x => x.type === 'S' && x.aromatic).length, 1, '1 个芳香 S');
        a.eq(r.atoms.filter(x => x.type === 'C').length, 4, '4 个 C');
        a.eq(r.bonds.length, 5, '键数');
        a.ok(r.bonds.every(b => b[2] === 1.5), '5 条键序 1.5');
    }},
    { name: '11 吡咯 [nH]1cccc1：N 显式 H', smiles: '[nH]1cccc1', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 5, '原子数');
        a.eq(r.atoms[0].type, 'N', '首原子 N');
        a.ok(r.atoms[0].aromatic === true, 'N 为芳香');
        a.eq(r.atoms[0].explicitH, 1, 'N 显式 H 计数 1');
        a.eq(r.bonds.length, 5, '键数');
        a.ok(r.bonds.every(b => b[2] === 1.5), '5 条键序 1.5');
    }},
    { name: '12a 氨基 [NH2]：方括号原子', smiles: '[NH2]', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 1, '原子数');
        a.eq(r.atoms[0].type, 'N', '原子类型');
        a.eq(r.atoms[0].explicitH, 2, '显式 H 计数 2');
        a.eq(r.bonds.length, 0, '无键');
    }},
    { name: '12b 氧负离子 [O-]：电荷忽略', smiles: '[O-]', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 1, '原子数');
        a.eq(r.atoms[0].type, 'O', '原子类型');
        a.eq(r.bonds.length, 0, '无键');
    }},
    { name: '12c 铵离子 [NH4+]：电荷忽略', smiles: '[NH4+]', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 1, '原子数');
        a.eq(r.atoms[0].type, 'N', '原子类型');
        a.eq(r.atoms[0].explicitH, 4, '显式 H 计数 4');
        a.eq(r.bonds.length, 0, '无键');
    }},
    { name: '13 阿司匹林 CC(=O)Oc1ccccc1C(=O)O：13 重原子', smiles: 'CC(=O)Oc1ccccc1C(=O)O', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 13, '重原子数');
        a.eq(r.atoms.filter(x => x.type === 'C').length, 9, 'C 数 9');
        a.eq(r.atoms.filter(x => x.type === 'O').length, 4, 'O 数 4');
        a.eq(r.atoms.filter(x => x.aromatic).length, 6, '芳香原子数 6');
        a.eq(countOrder(r.bonds, 1.5), 6, '苯环 6 条 1.5 键');
        a.eq(countOrder(r.bonds, 2), 2, '两个 =O 双键');
    }},
    { name: '14 Kekulé 苯 C1=CC=CC=C1：交替键序', smiles: 'C1=CC=CC=C1', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.length, 6, '原子数');
        a.ok(r.atoms.every(x => x.type === 'C' && x.aromatic === false), '6 C 非芳香');
        a.eq(r.bonds.length, 6, '键数');
        a.eq(countOrder(r.bonds, 2), 3, '3 条双键');
        a.eq(countOrder(r.bonds, 1), 3, '3 条单键');
    }},
    { name: '15a 氯代 ClC：双字符元素', smiles: 'ClC', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.map(x => x.type).join(''), 'ClC', '原子类型序列');
        a.eq(r.bonds.length, 1, '键数');
        a.deepEqBond(r.bonds[0], [0, 1, 1], 'Cl-C 单键');
    }},
    { name: '15b 溴代 BrC：双字符元素', smiles: 'BrC', check(r, a) {
        a.noError(r);
        a.eq(r.atoms.map(x => x.type).join(''), 'BrC', '原子类型序列');
        a.eq(r.bonds.length, 1, '键数');
        a.deepEqBond(r.bonds[0], [0, 1, 1], 'Br-C 单键');
    }},
    { name: '16 空串：报错不抛异常', smiles: '', check(r, a) { a.hasError(r); }},
    { name: '17 未闭合括号 C(：报错', smiles: 'C(', check(r, a) { a.hasError(r); }},
    { name: '18 未闭合环 C1C：报错', smiles: 'C1C', check(r, a) { a.hasError(r); }},
    { name: '19 自环 C11：报错', smiles: 'C11', check(r, a) { a.hasError(r); }},
    { name: '20 断键 C.C：报错', smiles: 'C.C', check(r, a) { a.hasError(r); }},
    { name: '21 不支持的芳香原子 b1ccccc1：报错', smiles: 'b1ccccc1', check(r, a) { a.hasError(r); }},
];

(async () => {
    const t0 = Date.now();
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { passed: 0, failed: 0, total: 0, results: [], consoleErrors: [], elapsedMs: 0 };

    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200)); });

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__parseSmiles === 'function', null, { timeout: 30000 });

        // 一次性把全部 SMILES 送进页面解析，回传原始结果，在 Node 侧断言
        const parsed = await page.evaluate((smilesList) => {
            const out = {};
            for (const sm of smilesList) {
                try { out[sm] = window.__parseSmiles(sm); }
                catch (e) { out[sm] = { atoms: [], bonds: [], error: { pos: -1, msg: '抛异常: ' + String(e) } }; }
            }
            return out;
        }, CASES.map(c => c.smiles));

        for (const c of CASES) {
            const ac = new AssertionCollector();
            try { c.check(parsed[c.smiles], ac); }
            catch (e) { ac.ok(false, '断言执行抛异常: ' + String(e).slice(0, 200)); }
            const pass = ac.failed === 0;
            report.total++;
            pass ? report.passed++ : report.failed++;
            report.results.push({
                name: c.name,
                pass,
                detail: pass
                    ? `通过 ${ac.passed} 个断言`
                    : `失败 ${ac.failed} 个断言: ${ac.failures.join('；')}`,
                assertions: { passed: ac.passed, failed: ac.failed },
            });
        }
    } catch (e) {
        report.failed = report.total = 1;
        report.results.push({ name: '页面加载/执行', pass: false, detail: 'FATAL: ' + String(e).slice(0, 400) });
    }

    report.elapsedMs = Date.now() - t0;
    await browser.close();
    if (serverProc) { try { serverProc.kill(); } catch (e) {} }

    console.log(JSON.stringify(report, null, 1));
    if (report.failed > 0) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
