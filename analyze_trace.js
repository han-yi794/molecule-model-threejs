const fs = require('fs');
const path = require('path');
const t = JSON.parse(fs.readFileSync(path.join(process.env.TEMP || '.', 'opencode', 'probe_trace.json'), 'utf8'));

// atoms present in trace snapshots
function posOf(iter, id) {
    const tr = t.traces.find(x => x.iter === iter);
    if (!tr) return null;
    const a = tr.atoms.find(a => a.id === id);
    return a ? { x: a.x, y: a.y, z: a.z } : null;
}
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
function norm(v) { const l = len(v); return { x: v.x / l, y: v.y / l, z: v.z / l }; }

for (let i = 0; i < t.traces.length; i++) {
    const iter = t.traces[i].iter;
    if (!t.traces[i + 1]) break;
    const next = t.traces[i + 1].iter;
    // bond vectors
    const b_cur = sub(posOf(iter, 7), posOf(iter, 6));   // C=O (7-6)
    const b_next = sub(posOf(next, 7), posOf(next, 6));
    const h_cur = sub(posOf(iter, 10), posOf(iter, 6));  // C-H10
    const h_next = sub(posOf(next, 10), posOf(next, 6));
    const o_cur = sub(posOf(iter, 8), posOf(iter, 6));   // C-O8
    const o_next = sub(posOf(next, 8), posOf(next, 6));
    console.log(`iter ${iter}->${next}:`);
    console.log(`  C=O  len ${len(b_cur).toFixed(3)} -> ${len(b_next).toFixed(3)}  dir ${b_cur.x.toFixed(2)},${b_cur.y.toFixed(2)},${b_cur.z.toFixed(2)} -> ${b_next.x.toFixed(2)},${b_next.y.toFixed(2)},${b_next.z.toFixed(2)}`);
    console.log(`  C-H  len ${len(h_cur).toFixed(3)} -> ${len(h_next).toFixed(3)}  dir ${h_cur.x.toFixed(2)},${h_cur.y.toFixed(2)},${h_cur.z.toFixed(2)} -> ${h_next.x.toFixed(2)},${h_next.y.toFixed(2)},${h_next.z.toFixed(2)}`);
    console.log(`  C-O  len ${len(o_cur).toFixed(3)} -> ${len(o_next).toFixed(3)}  dir ${o_cur.x.toFixed(2)},${o_cur.y.toFixed(2)},${o_cur.z.toFixed(2)} -> ${o_next.x.toFixed(2)},${o_next.y.toFixed(2)},${o_next.z.toFixed(2)}`);
    // C6 movement
    const c6m = sub(posOf(next, 6), posOf(iter, 6));
    const o7m = sub(posOf(next, 7), posOf(iter, 7));
    const h10m = sub(posOf(next, 10), posOf(iter, 10));
    console.log(`  moved: C6(${c6m.x.toFixed(2)},${c6m.y.toFixed(2)},${c6m.z.toFixed(2)})|${len(c6m).toFixed(2)}  O7(${o7m.x.toFixed(2)},${o7m.y.toFixed(2)},${o7m.z.toFixed(2)})|${len(o7m).toFixed(2)}  H10(${h10m.x.toFixed(2)},${h10m.y.toFixed(2)},${h10m.z.toFixed(2)})|${len(h10m).toFixed(2)}`);
    // radial component of O7's move along C6->O7
    const radialDir = norm(b_cur);
    const o7radial = o7m.x * radialDir.x + o7m.y * radialDir.y + o7m.z * radialDir.z;
    console.log(`  O7 move radial-along-C=O: ${o7radial.toFixed(3)}  (tangential ${(len(o7m) - Math.abs(o7radial)).toFixed(3)})`);
}
