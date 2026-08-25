// analyze_styrene_sdf.js — 直接解析 PubChem 苯乙烯 SDF 计算共面性
const https = require('https');
const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/' + encodeURIComponent('C=Cc1ccccc1') + '/record/SDF?record_type=3d';
https.get(url, r => {
    const chunks = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => {
        const s = Buffer.concat(chunks).toString('utf8');
        const lines = s.split(/\r?\n/);
        const nAtoms = parseInt(lines[3].slice(0, 3), 10);
        const nBonds = parseInt(lines[3].slice(3, 6), 10);
        const atoms = [];
        for (let i = 0; i < nAtoms; i++) {
            const ln = lines[4 + i];
            atoms.push({ x: +ln.slice(0, 10), y: +ln.slice(10, 20), z: +ln.slice(20, 30), e: ln.slice(31, 34).trim() });
        }
        const bonds = [];
        for (let i = 0; i < nBonds; i++) {
            const ln = lines[4 + nAtoms + i];
            bonds.push({ a: +ln.slice(0, 3) - 1, b: +ln.slice(3, 6) - 1, t: +ln.slice(6, 9) });
        }
        console.log('原子:', atoms.map(a => a.e).join(''), ' | 键序:', bonds.map(b => b.t).join(''));
        atoms.forEach((a, i) => console.log(' ', i, a.e, a.x.toFixed(2), a.y.toFixed(2), a.z.toFixed(2)));
        // 找双键 C=C (苯环外用)
        const dbl = bonds.filter(b => b.t === 2);
        console.log('双键:', dbl.map(b => b.a + '-' + b.b).join(' '));
        // 环: 找 6 元环(键序含 1/2 交替) - 手动: 苯环在 4-9 区?
        // 凯库勒式: 环键 1-2-3-4-5-6
        // 尝试识别: 与双键端点剥离
        // 计算每个原子的 C-C 邻居数
        const ccNbr = {};
        for (const b of bonds) {
            if (atoms[b.a].e === 'C' && atoms[b.b].e === 'C') {
                ccNbr[b.a] = (ccNbr[b.a] || 0) + 1;
                ccNbr[b.b] = (ccNbr[b.b] || 0) + 1;
            }
        }
        console.log('C-C 邻居数:', Object.entries(ccNbr).map(([k, v]) => k + ':' + v).join(' '));
    });
}).on('error', e => console.log('FAIL:', e.message));