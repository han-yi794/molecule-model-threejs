// download_smilesdrawer.js — 下载 SmilesDrawer v1.2.0（MIT License，v1 最终版）到 vendor_tmp/
// 用途：键线式缩略图/大图的本地渲染（离线可用；羟基等按教材习惯合并为 OH）。
// 上游：https://github.com/reymond-group/smilesDrawer
const https = require('https');
const fs = require('fs');
if (!fs.existsSync('vendor_tmp')) fs.mkdirSync('vendor_tmp');
const FILES = [
    ['https://unpkg.com/smiles-drawer@1.2.0/dist/smiles-drawer.min.js', 'smiles-drawer.min.js']
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
        console.log(name, 'bytes:', buf.length);
    }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
