// find_toggle_handlers.js
const fs = require('fs');
const s = fs.readFileSync('球棍模型4.html', 'utf8');
// 找 btn-toggle 的各種引用
const ids = ['btn-toggle-hydro', 'btn-toggle-lp', 'btn-toggle-grid', 'btn-toggle-deloc', 'btn-toggle-pi', 'btn-optimize-all', 'btn-set-hybrid-auto', 'btn-set-hybrid-sp3', 'btn-set-hybrid-sp2', 'btn-set-hybrid-sp'];
for (const id of ids) {
  const re = new RegExp(id, 'g');
  let m, count = 0;
  while ((m = re.exec(s))) {
    count++;
    const ctx = s.slice(m.index - 100, m.index + 100);
    console.log(id, '#' + count, ':', ctx.split('\n').pop().trim().slice(0, 120));
  }
}