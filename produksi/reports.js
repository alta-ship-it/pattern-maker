/* Produksi — PDF reports and QR labels (jsPDF + qrcode-generator) */
(function (root) {
  "use strict";
  const J = () => root.jspdf.jsPDF;
  const rp = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
  const num = (n) => Math.round(n || 0).toLocaleString("id-ID");
  const day = (s) => String(s || "").slice(0, 10);
  const tgl = (s) => { const d = day(s); if (!d) return "-"; const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
  const safe = (s) => String(s || "").replace(/[^\w\-]+/g, "_");

  function qr(doc, text, x, y, size) {
    const q = root.qrcode(0, "M"); q.addData(String(text)); q.make();
    const n = q.getModuleCount(), m = size / n;
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) doc.rect(x + c * m, y + r * m, m + 0.01, m + 0.01, "F");
  }
  function header(doc, title, ctx, sub) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(title, 15, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`${ctx.nama || ""}  ·  dicetak ${tgl(new Date().toISOString())}`, 15, 24);
    doc.setTextColor(0);
    if (sub) { doc.setFontSize(10); doc.text(sub, 15, 30); }
  }
  function skInfo(doc, ctx, y) {
    const s = ctx.sk;
    const rows = [["No. SK", s.no_sk], ["Model", s.model], ["Customer", s.customer || "-"], ["No. PO", s.no_po || "-"], ["Tanggal", tgl(s.tanggal)], ["Deadline", tgl(s.deadline)]];
    doc.setFontSize(10);
    rows.forEach((r, i) => { const x = 15 + (i % 2) * 95, yy = y + Math.floor(i / 2) * 6; doc.setFont("helvetica", "bold"); doc.text(r[0], x, yy); doc.setFont("helvetica", "normal"); doc.text(String(r[1]), x + 24, yy); });
    y += 20;
    if (s.catatan) { doc.setFontSize(9); const l = doc.splitTextToSize("Catatan: " + s.catatan, 180); doc.text(l, 15, y); y += l.length * 4.2 + 2; }
    return y;
  }
  // simple table: cols [{t, w, a}] rows [[...]]
  function table(doc, x, y, cols, rows, opt = {}) {
    const lh = opt.lh || 6.2;
    const pageH = doc.internal.pageSize.getHeight();
    const head = () => {
      doc.setFillColor(232, 238, 246); doc.rect(x, y - 4.4, cols.reduce((a, c) => a + c.w, 0), lh, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      let cx = x; for (const c of cols) { doc.text(c.t, c.a === "r" ? cx + c.w - 1.5 : cx + 1.5, y, { align: c.a === "r" ? "right" : "left" }); cx += c.w; }
      y += lh;
    };
    head();
    doc.setFont("helvetica", "normal");
    rows.forEach((r, i) => {
      if (y > pageH - 15) { doc.addPage(); y = 20; head(); doc.setFont("helvetica", "normal"); }
      const bold = opt.boldLast && i === rows.length - 1;
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(9);
      let cx = x; r.forEach((v, j) => { const c = cols[j]; doc.text(String(v == null ? "" : v), c.a === "r" ? cx + c.w - 1.5 : cx + 1.5, y, { align: c.a === "r" ? "right" : "left", maxWidth: c.w - 2 }); cx += c.w; });
      doc.setDrawColor(225); doc.line(x, y + 1.8, x + cols.reduce((a, c) => a + c.w, 0), y + 1.8);
      y += lh;
    });
    return y + 3;
  }
  function matrixRows(m) {
    const rows = m.warna.map((w) => [w].concat(m.size.map((s) => m.q(w, s) || "-"), [m.size.reduce((a, s) => a + m.q(w, s), 0)]));
    rows.push(["Total"].concat(m.size.map((s) => m.warna.reduce((a, w) => a + m.q(w, s), 0)), [m.warna.reduce((a, w) => a + m.size.reduce((b, s) => b + m.q(w, s), 0), 0)]));
    const cw = Math.min(18, 120 / (m.size.length + 1));
    return { cols: [{ t: "Warna", w: 45 }].concat(m.size.map((s) => ({ t: String(s), w: cw, a: "r" })), [{ t: "Total", w: 20, a: "r" }]), rows };
  }

  const R = {};
  // ---- QR labels on A4 sticker sheet: 3 x 8 (70 x 37 mm) ----
  R.labelsA4 = (ctx) => {
    const doc = new (J())({ unit: "mm", format: "a4" });
    const W = 70, H = 37, cols = 3, rows = 8, x0 = 0, y0 = (297 - rows * H) / 2;
    ctx.bundles.forEach((b, i) => {
      if (i && i % (cols * rows) === 0) doc.addPage();
      const k = i % (cols * rows), x = x0 + (k % cols) * W, y = y0 + Math.floor(k / cols) * H;
      doc.setDrawColor(210); doc.rect(x + 1, y + 1, W - 2, H - 2);
      qr(doc, b.id, x + 3, y + 3.5, 30);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(b.id, x + 35, y + 8, { maxWidth: 33 });
      doc.setFontSize(13); doc.text(`${b.warna} · ${b.size}`, x + 35, y + 16, { maxWidth: 33 });
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text(`${b.qty} pcs · ikat #${b.no_ikat}`, x + 35, y + 22);
      doc.text(String(ctx.sk.model || "").slice(0, 28), x + 35, y + 27, { maxWidth: 33 });
      doc.setFontSize(7); doc.setTextColor(120); doc.text(`${ctx.sk.customer || ""} ${tgl(b.tanggal)}`.trim(), x + 35, y + 32, { maxWidth: 33 }); doc.setTextColor(0);
    });
    doc.save(`Label_QR_${safe(ctx.sk.no_sk)}_A4.pdf`);
  };
  // ---- thermal labels 50 x 30 mm, one per page ----
  R.labelsThermal = (ctx) => {
    const doc = new (J())({ unit: "mm", format: [50, 30], orientation: "l" });
    ctx.bundles.forEach((b, i) => {
      if (i) doc.addPage([50, 30], "l");
      qr(doc, b.id, 1.5, 2, 26);
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text(b.id, 29, 5.5, { maxWidth: 20 });
      doc.setFontSize(10); doc.text(String(b.size), 29, 12);
      doc.setFontSize(7); doc.text(String(b.warna), 29, 16.5, { maxWidth: 20 });
      doc.setFont("helvetica", "normal"); doc.text(`${b.qty} pcs  #${b.no_ikat}`, 29, 21);
      doc.setFontSize(5.5); doc.text(String(ctx.sk.model || "").slice(0, 22), 29, 25.5, { maxWidth: 20 });
    });
    doc.save(`Label_QR_${safe(ctx.sk.no_sk)}_50x30.pdf`);
  };
  // ---- cutting & marker report ----
  R.cutting = (ctx) => {
    const doc = new (J())({ unit: "mm", format: "a4" });
    header(doc, "LAPORAN CUTTING & MARKER", ctx);
    let y = skInfo(doc, ctx, 34);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Jumlah order (warna × size)", 15, y); y += 6;
    const mt = matrixRows(ctx.matrix); y = table(doc, 15, y, mt.cols, mt.rows, { boldLast: true });
    const tot = ctx.items.reduce((a, i) => a + (+i.qty || 0), 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Marker / gelaran", 15, y); y += 6;
    if (ctx.markers.length) {
      const kain = ctx.markers.reduce((a, m) => a + (+m.kain_terpakai || 0), 0);
      y = table(doc, 15, y, [{ t: "Tanggal", w: 25 }, { t: "Lebar kain (cm)", w: 30, a: "r" }, { t: "Panjang marker (m)", w: 35, a: "r" }, { t: "Lapis", w: 18, a: "r" }, { t: "Kain (m)", w: 22, a: "r" }, { t: "Catatan", w: 50 }],
        ctx.markers.map((m) => [tgl(m.tanggal), m.lebar_kain, m.panjang_marker, m.lapis, m.kain_terpakai, m.catatan]).concat([["Total", "", "", "", kain.toFixed(2), tot ? `${((kain / tot) * 100).toFixed(1)} cm/pcs` : ""]]), { boldLast: true });
    } else { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Belum ada catatan marker.", 15, y); y += 8; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(`Daftar ikat (${ctx.bundles.length} ikat, ${num(ctx.bundles.reduce((a, b) => a + b.qty, 0))} pcs)`, 15, y); y += 6;
    y = table(doc, 15, y, [{ t: "Kode ikat", w: 45 }, { t: "No", w: 12, a: "r" }, { t: "Warna", w: 45 }, { t: "Size", w: 20 }, { t: "Qty", w: 18, a: "r" }, { t: "Tgl potong", w: 30 }],
      ctx.bundles.map((b) => [b.id, b.no_ikat, b.warna, b.size, b.qty, tgl(b.tanggal)]));
    sign(doc, y, ["Bagian cutting", "Mandor", "Admin"]);
    doc.save(`Laporan_Cutting_${safe(ctx.sk.no_sk)}.pdf`);
  };
  // ---- production report per SK ----
  R.produksi = (ctx) => {
    const doc = new (J())({ unit: "mm", format: "a4" });
    header(doc, "LAPORAN PRODUKSI", ctx);
    let y = skInfo(doc, ctx, 34);
    const tot = ctx.items.reduce((a, i) => a + (+i.qty || 0), 0);
    const done = {}; for (const s of ctx.scans) done[s.proses_id] = (done[s.proses_id] || 0) + (+s.qty || 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Progres per proses", 15, y); y += 6;
    y = table(doc, 15, y, [{ t: "Proses", w: 50 }, { t: "Selesai", w: 30, a: "r" }, { t: "Target", w: 30, a: "r" }, { t: "Sisa", w: 30, a: "r" }, { t: "%", w: 20, a: "r" }],
      ctx.proses.map((p) => { const d = done[p.id] || 0; return [p.nama, num(d), num(tot), num(Math.max(0, tot - d)), Math.min(100, Math.round((d / (tot || 1)) * 100)) + "%"]; }));
    // per warna/size for each process
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Selesai per warna & size", 15, y); y += 6;
    const bmap = {}; for (const b of ctx.bundles) bmap[b.id] = b;
    for (const p of ctx.proses) {
      const m = ctx.matrix, q = (w, s) => ctx.scans.filter((x) => x.proses_id === p.id && bmap[x.bundle_id] && bmap[x.bundle_id].warna === w && String(bmap[x.bundle_id].size) === s).reduce((a, x) => a + (+x.qty || 0), 0);
      const mt = matrixRows({ warna: m.warna, size: m.size, q });
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(p.nama, 15, y); y += 5;
      y = table(doc, 15, y, mt.cols, mt.rows, { boldLast: true, lh: 5.6 });
    }
    // who did what
    const per = {};
    for (const s of ctx.scans) { const k = s.penjahit_id + "|" + s.proses_id; (per[k] = per[k] || { j: s.penjahit_id, p: s.proses_id, q: 0 }); per[k].q += +s.qty || 0; }
    const pen = (id) => (ctx.penjahit.find((j) => j.id === id) || {}).nama || "-";
    const pro = (id) => (ctx.proses.find((p) => p.id === id) || {}).nama || "-";
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Dikerjakan oleh", 15, y); y += 6;
    table(doc, 15, y, [{ t: "Nama", w: 60 }, { t: "Proses", w: 50 }, { t: "Pcs", w: 25, a: "r" }], Object.values(per).sort((a, b) => pro(a.p).localeCompare(pro(b.p))).map((x) => [pen(x.j), pro(x.p), num(x.q)]));
    doc.save(`Laporan_Produksi_${safe(ctx.sk.no_sk)}.pdf`);
  };
  function sign(doc, y, names) {
    if (y > 250) { doc.addPage(); y = 25; }
    y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    names.forEach((n, i) => { const x = 20 + i * 62; doc.text(n, x, y); doc.line(x, y + 18, x + 45, y + 18); });
  }
  // ---- wages ----
  R.gajiRekap = (ctx) => {
    const doc = new (J())({ unit: "mm", format: "a4" });
    header(doc, "REKAP GAJI BORONGAN", ctx, `Periode ${tgl(ctx.a)} – ${tgl(ctx.b)}`);
    const ids = Object.keys(ctx.per).sort((x, y) => ctx.per[y].rp - ctx.per[x].rp);
    const tot = ids.reduce((t, k) => t + ctx.per[k].rp, 0), pcs = ids.reduce((t, k) => t + ctx.per[k].pcs, 0);
    let y = table(doc, 15, 38, [{ t: "No", w: 12, a: "r" }, { t: "Nama", w: 70 }, { t: "Pcs", w: 30, a: "r" }, { t: "Total", w: 45, a: "r" }, { t: "Paraf", w: 25 }],
      ids.map((k, i) => [i + 1, (ctx.byId("penjahit", k) || { nama: "-" }).nama, num(ctx.per[k].pcs), rp(ctx.per[k].rp), ""]).concat([["", "TOTAL", num(pcs), rp(tot), ""]]), { boldLast: true, lh: 7 });
    sign(doc, y, ["Dibuat", "Diperiksa", "Disetujui"]);
    doc.save(`Rekap_Gaji_${ctx.a}_${ctx.b}.pdf`);
  };
  R.gajiSlip = (ctx, pid) => {
    const doc = new (J())({ unit: "mm", format: "a5" });
    const j = ctx.byId("penjahit", pid) || { nama: "-" }, d = ctx.per[pid];
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("SLIP GAJI BORONGAN", 12, 15);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`${ctx.nama || ""} · Periode ${tgl(ctx.a)} – ${tgl(ctx.b)}`, 12, 21);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(j.nama + (j.bagian ? ` (${j.bagian})` : ""), 12, 29);
    const g = {};
    for (const s of d.list) { const k = s.sk_id + "|" + s.proses_id + "|" + s.tarif; (g[k] = g[k] || { sk: ctx.byId("sk", s.sk_id), p: ctx.byId("proses", s.proses_id), q: 0, t: s.tarif, r: 0 }); g[k].q += +s.qty; g[k].r += +s.nilai; }
    const y = table(doc, 12, 37, [{ t: "SK", w: 30 }, { t: "Proses", w: 30 }, { t: "Pcs", w: 18, a: "r" }, { t: "Tarif", w: 22, a: "r" }, { t: "Jumlah", w: 26, a: "r" }],
      Object.values(g).map((x) => [x.sk ? x.sk.no_sk : "-", x.p ? x.p.nama : "-", num(x.q), rp(x.t), rp(x.r)]).concat([["TOTAL", "", num(d.pcs), "", rp(d.rp)]]), { boldLast: true });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text("Diterima", 20, y + 8); doc.line(20, y + 26, 60, y + 26);
    doc.text("Dibayar", 88, y + 8); doc.line(88, y + 26, 128, y + 26);
    doc.save(`Slip_Gaji_${safe(j.nama)}_${ctx.a}_${ctx.b}.pdf`);
  };
  root.ProdReports = R;
})(window);
