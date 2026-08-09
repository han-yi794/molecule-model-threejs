const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B2.html', { waitUntil: 'networkidle', timeout: 120000 });
  // 页面加载 900ms 后自动运行全部测试（runAllExamplesAndTests），轮询完成标志
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => window.__AUTOTEST_DONE__ === true)) break;
    await page.waitForTimeout(2000);
  }
  const result = await page.evaluate(() => {
    const pre = document.getElementById('autotest-report');
    let report = null;
    try { report = JSON.parse(pre && pre.textContent ? pre.textContent : ''); } catch (e) { report = null; }
    return {
      done: window.__AUTOTEST_DONE__ === true,
      report,
      localStorageReport: (() => { try { return JSON.parse(localStorage.getItem('LAST_AUTOTEST_REPORT') || 'null'); } catch (e) { return null; } })(),
      initErrors: window._INIT_ERRORS || [],
      initLog: window._INIT_LOG || []
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
