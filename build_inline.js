// build_inline.js — 把 three 三模块以 importmap data:URL 内联进 球棍模型4.html
const fs = require('fs');
const buf = fs.readFileSync('球棍模型4.html');
const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
const s = buf.toString('utf8');
const nRefs = (s.match(/unpkg\.com/g) || []).length;
const START = '<script type="importmap">';
const END = '</script>';
const i = s.indexOf(START);
const j = s.indexOf(END, i);
if (i < 0 || j < 0) { console.error('importmap block not found'); process.exit(1); }
console.log('BOM:', hasBom, 'unpkg refs:', nRefs, 'span:', i, '-', j + END.length);

function b64Of(file) {
    return fs.readFileSync('vendor_tmp/' + file).toString('base64');
}
const b64Three = b64Of('three.module.js');
const b64OC = b64Of('OrbitControls.js');
const b64CSS = b64Of('CSS2DRenderer.js');

const newBlock = `<!-- Three.js r0.148 已内联（2026-08-13）：file:// 双击离线可用，不再依赖 unpkg CDN。
     原始 CDN 配置（如需还原）：
<script type="importmap">
{
    "imports": {
        "three": "https://unpkg.com/three@0.148.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.148.0/examples/jsm/"
    }
}
</script>
-->
    <script type="importmap">
    {
        "imports": {
            "three": "data:text/javascript;base64,${b64Three}",
            "three/addons/controls/OrbitControls.js": "data:text/javascript;base64,${b64OC}",
            "three/addons/renderers/CSS2DRenderer.js": "data:text/javascript;base64,${b64CSS}"
        }
    }
    </script>`;

const out = s.slice(0, i) + newBlock + s.slice(j + END.length);
// 确认无残留 unpkg 引用（注释里的除外）
const residual = (out.match(/https:\/\/unpkg\.com/g) || []).length;
console.log('residual https unpkg refs (should be 0):', residual);
fs.writeFileSync('球棍模型4.html', Buffer.from(out, 'utf8'));
const newSize = fs.statSync('球棍模型4.html').size;
console.log('written. new size:', newSize, 'bytes (' + (newSize / 1024 / 1024).toFixed(2) + ' MB)');
// 校验：新文件里 data: URL 出现 3 次
const check = fs.readFileSync('球棍模型4.html', 'utf8');
console.log('data:text/javascript count:', (check.match(/data:text\/javascript;base64,/g) || []).length);