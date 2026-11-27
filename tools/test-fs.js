// node tools/test-fs.js  — draft every FreeSewing model for its example chart and print target/result
const fs = require('fs'), vm = require('vm');
vm.runInThisContext(fs.readFileSync(__dirname + '/../lib/freesewing.js', 'utf8'));
globalThis.FreeSewing = FreeSewing;
require('../engine.js'); require('../fsmodels.js');
const { MODELS } = PolaEngine;
const only = process.argv[2];
for (const [id, M] of Object.entries(MODELS)) {
  if (!id.startsWith('fs_') || (only && id !== only)) continue;
  const p = {}; M.params.forEach(x => p[x.k] = x.def);
  for (const [s, row] of Object.entries(M.chart)) {
    const t = Date.now();
    try {
      const r = M.draft(row, p);
      console.log(id, s, Date.now() - t + 'ms', Object.keys(r.pieces).join(','), '|', r.checks.map(c => c[1]).join(' ; '));
    } catch (e) { console.log('ERR', id, s, e.stack.split('\n').slice(0, 3).join(' | ')); }
  }
}
