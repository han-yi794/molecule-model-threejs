// download_three.js — 下载 three@0.148.0 三个模块文件到 vendor_tmp/ 并检查内部 import
const https = require('https');
const fs = require('fs');
if (!fs.existsSync('vendor_tmp')) fs.mkdirSync('vendor_tmp');
const FILES = [
    ['https://unpkg.com/three@0.148.0/build/three.module.js', 'three.module.js'],
    ['https://unpkg.com/three@0.148.0/examples/jsm/controls/OrbitControls.js', 'OrbitControls.js'],
    ['https://unpkg.com/three@0.148.0/examples/jsm/renderers/CSS2DRenderer.js', 'CSS2DRenderer.js']
];
function get(url) {
    return new Promise((res, rej) => {
        https.get(url, r => {
            if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { get(r.headers.location).then(res, rej); return; }
            if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' ' + url)); return; }
            const chunks = [];
            r.on('data', c => chunks.push(c));
            r.on('end', () => res(Buffer.concat(chunks)));
        }).on('error', rej);
    });
}
(async () => {
    for (const [url, name] of FILES) {
        const buf = await get(url);
        fs.writeFileSync('vendor_tmp/' + name, buf);
        const s = buf.toString('utf8');
        const imports = [...s.matchAll(/(?:^|[\s;}])(?:import[\s\S]*?from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
        console.log(name, 'bytes:', buf.length, 'imports:', JSON.stringify([...new Set(imports)]));
    }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });