// 环己烷:6 个碳逐轮位置与每轮位移
const path = require('path');
const t = require(path.join(process.env.TEMP || '.', 'opencode', 'ethane_trace.json'));
const tr = t.traces;
const m = {};
for (const i of [0, 1, 2, 3, 4, 5, 8, 12, 20, 30, 39]) {
  const x = tr[i]; if (!x) continue;
  const atoms = x.atoms.filter(a => a.type === 'C');
  const key = atoms.map(a => a.id).join(',');
  const pos = atoms.map(a => `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`);
  if (!m[key]) m[key] = [];
  console.log('iter' + i, 'C ids:', key, '->', pos.join(' | '));
}
