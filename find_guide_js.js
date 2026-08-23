// find_guide_js.js
const fs = require('fs');
const s = fs.readFileSync('球棍模型4.html', 'utf8');
const i = s.indexOf('guide-toggle');
// 找紧接着的 JS 代码 (guide-toggle 后面的 JS)
const jsStart = s.indexOf('guide-toggle\');', i);
if (jsStart < 0) {
  // try another pattern
  const jsStart2 = s.indexOf("guide-toggle'", i);
  console.log('alternative:', s.slice(jsStart2 - 200, jsStart2 + 400));
} else {
  console.log(s.slice(jsStart - 200, jsStart + 400));
}