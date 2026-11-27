// npm install && npm run samples  -> out/<model>_plotter.pdf, out/<model>_a4.pdf
const fs = require('fs'), vm = require('vm');
vm.runInThisContext(fs.readFileSync(__dirname + '/../lib/freesewing.js', 'utf8'));
globalThis.FreeSewing = FreeSewing;
require('../engine.js'); require('../fsmodels.js'); require('../pdf.js');
const { MODELS } = globalThis.PolaEngine, P = globalThis.PolaPDF;
const only = process.argv[2];
fs.mkdirSync('out', { recursive: true });
for (const [id, M] of Object.entries(MODELS)) {
  if (only && id !== only) continue;
  const p = {}; M.params.forEach(x => p[x.k] = x.def);
  const a = P.plotterPDF(M, M.chart, p, 150); fs.writeFileSync(`out/${id}_plotter.pdf`, Buffer.from(a.doc.output('arraybuffer')));
  const b = P.a4PDF(M, M.chart, p); fs.writeFileSync(`out/${id}_a4.pdf`, Buffer.from(b.doc.output('arraybuffer')));
  console.log(id, 'plotter', a.W, a.H.toFixed(0), 'a4 pages', b.pages);
}
