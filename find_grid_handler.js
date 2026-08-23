// find_grid_handler.js
const fs = require('fs');
const s = fs.readFileSync('球棍模型4.html', 'utf8');
const i = s.indexOf('btn-toggle-grid');
console.log(s.slice(i, i + 2000));