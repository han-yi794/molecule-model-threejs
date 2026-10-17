const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  // 4 号文件（2/3 号副本已移除）。首屏不自动跑测试（AUTO_RUN_ALL_TESTS=false），需手动触发
  await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => typeof window.runAllExamplesAndTests === 'function', null, { timeout: 60000 });
  await page.evaluate(() => { window.runAllExamplesAndTests(); });
  // 完成状态一律轮询 window.lastRunResults（4 号里 __AUTOTEST_DONE__ 永不置位）
  await page.waitForFunction(
    () => !!(window.lastRunResults && window.lastRunResults.results && window.lastRunResults.results.length === 33),
    null,
    { timeout: 10 * 60 * 1000 }
  ).catch(() => {});
  const result = await page.evaluate(() => {
    const lr = window.lastRunResults;
    return {
      done: !!(lr && lr.results && lr.results.length === 33),
      total: lr && lr.results ? lr.results.length : 0,
      passed: lr && lr.results ? lr.results.filter(r => r.pass).length : 0,
      fails: lr && lr.results ? lr.results.filter(r => !r.pass).map(r => r.example) : [],
      localStorageReport: (() => { try { return JSON.parse(localStorage.getItem('LAST_AUTOTEST_REPORT') || 'null'); } catch (e) { return null; } })(),
      initErrors: window._INIT_ERRORS || [],
      initLog: window._INIT_LOG || []
    };
  });
  result.consoleErrors = consoleErrors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
