// build_inline_smilesdrawer.js — 把 SmilesDrawer v1.2.0（MIT）内联进 球棍模型4.html
// （键线式缩略图/大图的本地渲染，file:// 双击离线可用；不内联则需外链，违背单文件原则）
// 前提：先运行 node download_smilesdrawer.js（产物 vendor_tmp/smiles-drawer.min.js，不入库）
// 幂等：已存在 <script id="smiles-drawer-inline"> 块时整块替换，否则插入到 <script type="module"> 之前
const fs = require('fs');
const LIB = 'vendor_tmp/smiles-drawer.min.js';
if (!fs.existsSync(LIB)) { console.error('缺少 ' + LIB + '，请先运行: node download_smilesdrawer.js'); process.exit(1); }
const buf = fs.readFileSync('球棍模型4.html');
const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
const s = buf.toString('utf8');
let lib = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
lib = lib.replace(/\n?\/\/# sourceMappingURL=[^\n]*\n?/g, '\n').trim();   // 去掉 sourcemap 注释（避免请求不存在的 .map）
if (lib.includes('</script')) { console.error('lib 含 </script，无法直接内联'); process.exit(1); }
const block = `<script id="smiles-drawer-inline" data-version="1.2.0">
/* SmilesDrawer v1.2.0 — (c) Reymond Group — MIT License — https://github.com/reymond-group/smilesDrawer
   内联用于键线式缩略图/大图的本地渲染（离线可用；羟基/氨基等按教材习惯合并为 OH/NH₂ 标签）。
   重建：node download_smilesdrawer.js && node build_inline_smilesdrawer.js */
${lib}
    </script>`;
let out, where;
const START = '<script id="smiles-drawer-inline"';
const i = s.indexOf(START);
if (i >= 0) {
    const j = s.indexOf('</script>', i);
    if (j < 0) { console.error('已有内联块未闭合'); process.exit(1); }
    out = s.slice(0, i) + block + s.slice(j + '</script>'.length);
    where = '替换已有块 ' + i + '-' + j;
} else {
    const anchor = '<script type="module">';
    const k = s.indexOf(anchor);
    if (k < 0) { console.error('未找到 <script type="module"> 锚点'); process.exit(1); }
    out = s.slice(0, k) + block + '\n    ' + s.slice(k);
    where = '插入到偏移 ' + k + ' 之前';
}
console.log('BOM:', hasBom, '|', where, '| lib bytes:', Buffer.byteLength(lib, 'utf8'));
fs.writeFileSync('球棍模型4.html', Buffer.from(out, 'utf8'));
const st = fs.statSync('球棍模型4.html');
console.log('written:', st.size, 'bytes (' + (st.size / 1024 / 1024).toFixed(2) + ' MB)');
const check = fs.readFileSync('球棍模型4.html', 'utf8');
console.log('smiles-drawer-inline blocks:', (check.match(/id="smiles-drawer-inline"/g) || []).length,
    '| 残留 sourceMappingURL:', (check.match(/sourceMappingURL/g) || []).length,
    '| BOM:', check.charCodeAt(0) === 0xFEFF);
