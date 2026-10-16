// 一次性工具：从 unpkg/jsdelivr 下载 Lucide 图标 SVG 到 lucide_tmp/（用于把图标内联进单文件 HTML）
// 运行：node download_lucide.js
const fs = require('fs');
const path = require('path');

const NAMES = ['book-open', 'settings', 'sparkles', 'trash-2', 'flask-conical', 'keyboard', 'circle-help', 'x',
    'delete', 'shapes', 'atom', 'arrow-left-right', 'mouse', 'hand', 'lightbulb', 'smartphone',
    'chevron-down', 'chevron-up', 'cloud', 'grid-3x3', 'orbit', 'eye', 'wand-sparkles', 'palette'];

const MIRRORS = [
    n => `https://unpkg.com/lucide-static@latest/icons/${n}.svg`,
    n => `https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${n}.svg`,
];

(async () => {
    const outDir = path.join(__dirname, 'lucide_tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const results = [];
    for (const name of NAMES) {
        let ok = false, lastErr = '';
        for (const mk of MIRRORS) {
            const url = mk(name);
            try {
                const res = await fetch(url, { redirect: 'follow' });
                if (!res.ok) { lastErr = 'HTTP ' + res.status; continue; }
                const text = await res.text();
                if (!text.includes('<svg')) { lastErr = 'not svg'; continue; }
                fs.writeFileSync(path.join(outDir, name + '.svg'), text);
                results.push({ name, ok: true, bytes: text.length });
                ok = true;
                break;
            } catch (e) { lastErr = String((e && e.message) || e); }
        }
        if (!ok) results.push({ name, ok: false, err: lastErr });
    }
    console.log(JSON.stringify(results, null, 1));
    const failed = results.filter(r => !r.ok);
    if (failed.length) { console.error('FAILED: ' + failed.map(f => f.name).join(', ')); process.exitCode = 1; }
})();
