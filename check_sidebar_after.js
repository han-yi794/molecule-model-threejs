// check_sidebar_after.js
const fs = require('fs');
const s = fs.readFileSync('球棍模型4.html', 'utf8');
const i = s.indexOf('id="btn-optimize-all"');
// 看看当前 sidebar 中 optimize 附近的代码
const seg = s.slice(i, i + 1500);
console.log(seg);