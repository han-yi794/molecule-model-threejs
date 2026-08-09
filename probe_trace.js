// 单例追踪：seed 固定 RNG，观察 optimizeAllAtoms 每轮键长/键角演化
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const seed = parseInt(process.argv[2] || '12345', 10);
  const ex = process.argv[3] || 'ethane';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B2.html');
  await page.waitForFunction(() => window.__AUTOTEST_DONE__ === true, { timeout: 900000 }).catch(() => {});
  const out = await page.evaluate(({ seed, ex }) => {
    const s = seed;
    Math.random = (() => { let x = s; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; })();
    let err = null;
    try { window.__diag.generate(ex); } catch (e) { err = 'generate: ' + e.message; }
    try { window.__diag.perturb(0.45); } catch (e) { err = (err || '') + ' perturb: ' + e.message; }
    if (err) return { err, traceLen: 0, traces: [] };
    window.__TRACE_OPT = { traces: [], limit: 300 };    const preCC = window.__diag.bonds().filter(b => b.types[0] === 'C' && b.types[1] === 'C').map(b => b.len);
    const preCH = window.__diag.bonds().filter(b => b.types.includes('H')).map(b => b.len);
    const preStd = window.__diag.angleStds();
    window.__diag.runOpt();
    const postCC = window.__diag.bonds().filter(b => b.types[0] === 'C' && b.types[1] === 'C').map(b => b.len);
    const postCH = window.__diag.bonds().filter(b => b.types.includes('H')).map(b => b.len);
    const postStd = window.__diag.angleStds();
    const traces = (window.__TRACE_OPT.traces || []).map(t => ({
      iter: t.iter,
      lens: t.bonds.map(b => ({ p: b.pair, l: b.len })),
      atoms: (t.atoms || []).map(a => ({ id: a.id, type: a.type, x: a.x, y: a.y, z: a.z }))
    }));
    return { preCC, preCH, preStd, postCC, postCH, postStd, traceLen: traces.length, traces, err };
  }, { seed, ex });
  fs.writeFileSync(path.join(process.env.TEMP || '.', 'opencode', 'ethane_trace.json'), JSON.stringify(out, null, 1));
  console.log('preCC', out.preCC, 'preCH', out.preCH, 'preStd', out.preStd.map(x=>+x.toFixed(2)));
  console.log('postCC', out.postCC, 'postCH', out.postCH, 'postStd', out.postStd.map(x=>+x.toFixed(2)));
  console.log('traces', out.traceLen);
  await browser.close();
})();
