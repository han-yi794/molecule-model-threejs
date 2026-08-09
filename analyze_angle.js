// 分析 ethane 追踪：每轮迭代的键角演化 + 最终 H 方向 vs 模板方向
const path = require('path');
const t = require(path.join(process.env.TEMP || '.', 'opencode', 'ethane_trace.json'));
const tr = t.traces;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = a => Math.sqrt(dot(a, a));
const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const angDeg = (u, v) => { const d = Math.max(-1, Math.min(1, dot(u, v))); return Math.acos(d) * 180 / Math.PI; };

function anglesAt(C, nbrs) {
  const dirs = nbrs.map(n => norm(sub(n, C)));
  const out = [];
  for (let i = 0; i < dirs.length; i++)
    for (let j = i + 1; j < dirs.length; j++) out.push(angDeg(dirs[i], dirs[j]));
  return out;
}
function std(arr) { const m = arr.reduce((s, v) => s + v, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); }

for (const i of [0, 1, 2, 4, 6, 8, 10, 15, 20, 39]) {
  const atoms = tr[i].atoms;
  const m = {}; atoms.forEach(a => m[a.id] = a);
  const C6 = m[341], C7 = m[342];
  const n6 = [C7, m[343], m[344], m[345]];
  const n7 = [C6, m[346], m[347], m[348]];
  const a6 = anglesAt(C6, n6), a7 = anglesAt(C7, n7);
  const cc = len(sub(C6, C7));
  console.log(`iter ${i}: C-C=${cc.toFixed(3)} C6angles=[${a6.map(x => x.toFixed(1)).join(',')}] std=${std(a6).toFixed(1)} C7angles=[${a7.map(x => x.toFixed(1)).join(',')}] std=${std(a7).toFixed(1)}`);
}
