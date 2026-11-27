require('../engine.js'); require('../pdf.js');
const {MODELS}=globalThis.PolaEngine, P=globalThis.PolaPDF, fs=require('fs');
fs.mkdirSync('out',{recursive:true});
for (const [id,M] of Object.entries(MODELS)){
  const p={}; M.params.forEach(x=>p[x.k]=x.def);
  const a=P.plotterPDF(M,M.chart,p,150); fs.writeFileSync(`out/${id}_plotter.pdf`, Buffer.from(a.doc.output('arraybuffer')));
  const b=P.a4PDF(M,M.chart,p); fs.writeFileSync(`out/${id}_a4.pdf`, Buffer.from(b.doc.output('arraybuffer')));
  fs.writeFileSync(`out/${id}.svg`, P.previewSVG(M,M.chart,p));
  console.log(id, 'plotter', a.W, a.H.toFixed(0), 'a4 pages', b.pages);
}
