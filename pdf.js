/* Pola Jahit — layout + PDF export (jsPDF). Works in browser (window.jspdf) and node. */
(function (root) {
  "use strict";
  const COLORS = ["#d62728", "#1f5fbf", "#2ca02c", "#e07b00", "#8e44ad", "#00838f", "#c2185b", "#5d4037"];
  const DASHES = [[], [0.6, 0.25], [0.9, 0.2, 0.15, 0.2], [0.15, 0.2], [1.4, 0.35], [0.4, 0.4], [1.0, 0.2, 0.2, 0.2, 0.2, 0.2], [0.25, 0.1]];
  const PT = 1 / 28.3465;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // run all sizes of a model: returns {sizes, results:{size:{pieces,checks}}, keys}
  function runModel(model, chart, params) {
    const sizes = Object.keys(chart);
    const results = {};
    for (const s of sizes) results[s] = model.draft(chart[s], params);
    const keys = Object.keys(results[sizes[0]].pieces);
    return { sizes, results, keys };
  }

  function pieceBBox(run, key) {
    let b = [1e9, 1e9, -1e9, -1e9];
    for (const s of run.sizes) {
      const q = run.results[s].pieces[key].bbox();
      b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])];
    }
    return b;
  }

  // shelf packing; returns {pos:{key:[dx,dy]}, W, H} in layout coords (y up, origin bottom-left)
  function layout(run, width, gap = 3) {
    const items = run.keys.map((k) => ({ k, b: pieceBBox(run, k) })).concat([{ k: "__test", b: [0, 0, 7, 7] }]);
    const rows = []; let row = [], x = 0, rowH = 0;
    for (const it of items) {
      const w = it.b[2] - it.b[0], h = it.b[3] - it.b[1];
      if (x + w > width && x > 0) { rows.push({ row, rowH }); row = []; x = 0; rowH = 0; }
      row.push({ ...it, x }); x += w + gap; rowH = Math.max(rowH, h);
    }
    rows.push({ row, rowH });
    const H = rows.reduce((a, r) => a + r.rowH, 0) + gap * (rows.length - 1);
    const pos = {}; let top = H, maxW = 0;
    for (const r of rows) {
      for (const it of r.row) { pos[it.k] = [it.x - it.b[0], top - it.b[3]]; maxW = Math.max(maxW, it.x + it.b[2] - it.b[0]); }
      top -= r.rowH + gap;
    }
    return { pos, W: maxW, H };
  }

  // ---------- drawing on a jsPDF doc via a pen (layout coords -> page) ----------
  function makePen(doc, pageH, ox, oy) {
    const T = (p) => [ox + p[0], pageH - (oy + p[1])];
    return {
      T,
      poly(pts, closed) {
        if (pts.length < 2) return;
        const a = T(pts[0]); const d = [];
        for (let i = 1; i < pts.length; i++) { const p = T(pts[i]), q = T(pts[i - 1]); d.push([p[0] - q[0], p[1] - q[1]]); }
        doc.lines(d, a[0], a[1], [1, 1], "S", !!closed);
      },
      seg(a, b) { const A = T(a), B = T(b); doc.line(A[0], A[1], B[0], B[1]); },
      circle(p, r) { const A = T(p); doc.circle(A[0], A[1], r, "S"); },
      text(p, s, size, bold, color, angle) {
        const A = T(p);
        doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
        doc.setTextColor(...hex(color || "#000000"));
        doc.text(String(s), A[0], A[1], angle ? { angle } : undefined);
      },
    };
  }
  const setStroke = (doc, color, wPt, dash) => {
    doc.setDrawColor(...hex(color)); doc.setLineWidth(wPt * PT); doc.setLineDashPattern(dash || [], 0);
  };

  function arrow(pen, doc, a, b) {
    pen.seg(a, b);
    for (const [p, q] of [[b, a], [a, b]]) {
      const d = [p[0] - q[0], p[1] - q[1]], l = Math.hypot(...d), u = [d[0] / l, d[1] / l], n = [-u[1], u[0]];
      pen.seg(p, [p[0] - 0.6 * u[0] + 0.25 * n[0], p[1] - 0.6 * u[1] + 0.25 * n[1]]);
      pen.seg(p, [p[0] - 0.6 * u[0] - 0.25 * n[0], p[1] - 0.6 * u[1] - 0.25 * n[1]]);
    }
  }
  const sh = (pts, d) => pts.map((p) => [p[0] + d[0], p[1] + d[1]]);
  const shp = (p, d) => [p[0] + d[0], p[1] + d[1]];

  function drawTest(doc, pen, at) {
    setStroke(doc, "#000000", 0.8, []);
    pen.poly([shp([1, 1], at), shp([6, 1], at), shp([6, 6], at), shp([1, 6], at)], true);
    pen.text(shp([1.3, 4.6], at), "KOTAK UJI", 9, true);
    pen.text(shp([1.3, 3.8], at), "5 x 5 cm", 9);
    pen.text(shp([1.3, 3.0], at), "harus pas!", 7);
  }

  function drawPiece(doc, pen, run, key, at, modelName) {
    if (key === "__test") return drawTest(doc, pen, at);
    const ref = run.results[run.sizes[Math.floor(run.sizes.length / 2)]].pieces[key];
    run.sizes.forEach((s, i) => {
      const pc = run.results[s].pieces[key], d = shp(pc.align, at), col = COLORS[i % COLORS.length];
      setStroke(doc, col, 0.35, [0.25, 0.2]); pen.poly(sh(pc.net, d), true);
      setStroke(doc, col, 1.0, DASHES[i % DASHES.length]); pen.poly(sh(pc.cutLine, d), true);
      setStroke(doc, col, 0.8, []);
      for (const [a, b] of pc.notchLines()) pen.seg(shp(a, d), shp(b, d));
      for (const mk of pc.marks) {
        setStroke(doc, col, 0.6, []);
        if (mk.t === "btn") { const p = shp(mk.p, d); pen.circle(p, 0.45); pen.seg([p[0] - 0.3, p[1]], [p[0] + 0.3, p[1]]); pen.seg([p[0], p[1] - 0.3], [p[0], p[1] + 0.3]); }
        else if (mk.t === "poly") { setStroke(doc, col, 0.6, [0.3, 0.2]); pen.poly(sh(mk.pts, d), false); }
        else if (mk.t === "welt") {
          const a = shp(mk.a, d), b = shp(mk.b, d), u = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...u), n = [-u[1] / l * 0.5, u[0] / l * 0.5];
          pen.seg(a, b); pen.seg([a[0] - n[0], a[1] - n[1]], [a[0] + n[0], a[1] + n[1]]); pen.seg([b[0] - n[0], b[1] - n[1]], [b[0] + n[0], b[1] + n[1]]);
        } else if (mk.t === "line" && pc === run.results[s].pieces[key] && i === Math.floor(run.sizes.length / 2)) {
          setStroke(doc, "#000000", 0.6, [0.8, 0.2, 0.1, 0.2]); pen.poly(sh(mk.pts, d), false);
          const m0 = mk.pts[0], m1 = mk.pts[mk.pts.length - 1];
          pen.text(shp([(m0[0] + m1[0]) / 2 + 0.2, (m0[1] + m1[1]) / 2 + 0.2], d), mk.s, 7);
        } else if (mk.t === "text" && i === Math.floor(run.sizes.length / 2)) pen.text(shp(mk.p, d), mk.s, 7);
      }
    });
    // grain, fold, label from the middle size
    const d = shp(ref.align, at);
    setStroke(doc, "#000000", 0.8, []);
    const g0 = shp(ref.grain[0], d), g1 = shp(ref.grain[1], d);
    arrow(pen, doc, g0, g1);
    const ang = Math.atan2(g1[1] - g0[1], g1[0] - g0[0]) * 180 / Math.PI;
    pen.text([(g0[0] + g1[0]) / 2 + 0.35, (g0[1] + g1[1]) / 2], "ARAH SERAT", 6, false, "#000000", ang);
    if (ref.fold) {
      const f0 = shp(ref.fold[0], d), f1 = shp(ref.fold[1], d);
      const f0i = [f0[0] + 1.2, f0[1]], f1i = [f1[0] + 1.2, f1[1]];
      setStroke(doc, "#000000", 1.2, []);
      const L = [f1i[0] - f0i[0], f1i[1] - f0i[1]];
      arrow(pen, doc, [f0i[0] + L[0] * 0.15, f0i[1] + L[1] * 0.15], [f1i[0] - L[0] * 0.15, f1i[1] - L[1] * 0.15]);
      pen.seg(f0, f0i); pen.seg(f1, f1i);
      const fang = Math.atan2(f1[1] - f0[1], f1[0] - f0[0]) * 180 / Math.PI;
      const mid = [(f0i[0] + f1i[0]) / 2 + 0.35, (f0i[1] + f1i[1]) / 2 - 1.5];
      pen.text(mid, "LIPAT KAIN (FOLD)", 6.5, true, "#000000", Math.abs(fang) > 45 ? 90 : 0);
    }
    const lab = shp(ref.label, d), rot = ref.labelRot || 0;
    const off = (dx, dy) => rot === 90 ? [lab[0] - dy, lab[1] + dx] : [lab[0] + dx, lab[1] + dy];
    pen.text(off(0, 0), ref.name, 16, true, "#000000", rot);
    pen.text(off(0, -0.6), ref.cut, 9, false, "#000000", rot);
    pen.text(off(0, -1.1), `${modelName} - kampuh & kelim sudah termasuk`, 7, false, "#000000", rot);
    run.sizes.forEach((s, i) => {
      const col = COLORS[i % COLORS.length];
      setStroke(doc, col, 1.4, DASHES[i % DASHES.length]);
      pen.seg(off(i * 2.4, -1.65), off(i * 2.4 + 1.0, -1.65));
      pen.text(off(i * 2.4 + 1.15, -1.8), s, 8, true, col, rot);
    });
    doc.setLineDashPattern([], 0);
  }

  function drawLayout(doc, pen, run, lay, modelName, view) {
    for (const [k, d] of Object.entries(lay.pos)) {
      if (view) {
        const b = k === "__test" ? [0, 0, 7, 7] : pieceBBox(run, k);
        if (b[2] + d[0] < view[0] || b[0] + d[0] > view[2] || b[3] + d[1] < view[1] || b[1] + d[1] > view[3]) continue;
      }
      drawPiece(doc, pen, run, k, d, modelName);
    }
  }

  function getJsPDF() {
    if (root.jspdf && root.jspdf.jsPDF) return root.jspdf.jsPDF;
    if (typeof require !== "undefined") return require("jspdf").jsPDF;
    throw new Error("jsPDF tidak ditemukan");
  }

  function infoLines(model, chart) {
    const f = model.fields;
    return Object.keys(chart).map((s) => `${s}: ` + f.map((x) => `${x.label.split(" (")[0].toLowerCase()} ${chart[s][x.k]}`).join(", "));
  }

  // ---------- PLOTTER ----------
  function plotterPDF(model, chart, params, width = 150, opts = {}) {
    const run = runModel(model, chart, params);
    const lay = layout(run, width - 6);
    const lines = infoLines(model, chart);
    const ref = (opts.refs || [])[0];
    const infoH = Math.max(4 + lines.length * 0.7, ref ? 14 : 0);
    const W = width, H = lay.H + 6 + infoH;
    const jsPDF = getJsPDF();
    const doc = new jsPDF({ unit: "cm", format: [W, H], orientation: W > H ? "l" : "p", compress: true });
    const pen = makePen(doc, H, 3, 3);
    drawLayout(doc, pen, run, lay, model.name);
    const tp = makePen(doc, H, 0, 0);
    tp.text([3, H - 3], `POLA ${model.name.toUpperCase()}  |  ${run.sizes.join(" - ")}  |  SKALA 1:1 (PLOTTER)`, 28, true);
    tp.text([3, H - 3.9], `Cetak 100% / actual size, cek KOTAK UJI 5x5 cm. Kampuh ${params.sa} cm${params.hem ? `, kelim ${params.hem} cm` : ""} sudah termasuk. Garis putus tipis = garis jahit.`, 14);
    lines.forEach((l, i) => tp.text([3, H - 4.8 - i * 0.7], l, 13));
    if (ref) {
      const ih = infoH - 2, iw = Math.min(ih * ref.w / ref.h, W * 0.4);
      const h2 = iw * ref.h / ref.w;
      try { doc.addImage(ref.data, ref.type || "JPEG", W - 3 - iw, 1.5, iw, h2); } catch (e) { /* skip broken image */ }
      tp.text([W - 3 - iw, H - 1.5 - h2 - 0.4], "Referensi dari client", 11, true);
    }
    return { doc, run, W, H };
  }

  // ---------- A4 ----------
  const A4W = 21, A4H = 29.7, MG = 1, TW = A4W - 2 * MG, TH = A4H - 2 * MG;
  function a4PDF(model, chart, params, opts = {}) {
    const run = runModel(model, chart, params);
    const LW = TW * 6 - 4;
    const lay = layout(run, LW);
    const cols = Math.ceil((lay.W + 2) / TW), rows = Math.ceil((lay.H + 2) / TH);
    const totalH = rows * TH;
    const ox = 1, oy = totalH - lay.H - 1; // anchor layout to the top-left
    // occupied tiles (bbox test per piece)
    const boxes = Object.entries(lay.pos).map(([k, d]) => {
      const b = k === "__test" ? [0, 0, 7, 7] : pieceBBox(run, k);
      return [b[0] + d[0] + ox, b[1] + d[1] + oy, b[2] + d[0] + ox, b[3] + d[1] + oy];
    });
    const tiles = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = c * TW, y1 = totalH - r * TH, y0 = y1 - TH;
      if (boxes.some((b) => b[0] < x0 + TW && b[2] > x0 && b[1] < y1 && b[3] > y0)) tiles.push([r, c]);
    }
    const jsPDF = getJsPDF();
    const doc = new jsPDF({ unit: "cm", format: "a4", compress: true });
    const refs = opts.refs || [];
    const first = refs.length ? 4 : 3; // page number of the first tile
    cover(doc, model, chart, params, run);
    if (refs.length) { doc.addPage(); refPage(doc, refs); }
    doc.addPage();
    mapPage(doc, run, lay, rows, cols, tiles, ox, oy, first);
    tiles.forEach(([r, c], n) => {
      doc.addPage();
      const x0 = c * TW, y0 = totalH - (r + 1) * TH;
      doc.saveGraphicsState();
      doc.rect(MG, MG, TW, TH, null); doc.clip(); doc.discardPath();
      // layout point (lx,ly) -> page: x = MG + lx + ox - x0 ; y_up = MG + ly + oy - y0
      const pen = makePen(doc, A4H, MG + ox - x0, MG + oy - y0);
      const vx = x0 - ox, vy = y0 - oy; // tile window in layout coords
      drawLayout(doc, pen, run, lay, model.name, [vx - 3, vy - 3, vx + TW + 3, vy + TH + 3]);
      doc.restoreGraphicsState();
      setStroke(doc, "#999999", 0.5, [0.2, 0.2]); doc.rect(MG, MG, TW, TH, "S");
      setStroke(doc, "#999999", 0.5, []);
      for (const [x, y] of [[MG + TW / 2, MG], [MG + TW / 2, MG + TH], [MG, MG + TH / 2], [MG + TW, MG + TH / 2]]) doc.circle(x, y, 0.35, "S");
      const lab = `${String.fromCharCode(65 + r)}${c + 1}`;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(85, 85, 85);
      doc.text(`${model.name} ${run.sizes.join("-")}  |  hal. ${n + first}  |  posisi ${lab}`, MG + 0.2, 0.7);
      doc.setFont("helvetica", "bold"); doc.setFontSize(14);
      doc.text(lab, A4W - MG - 1.6, A4H - 0.25);
    });
    return { doc, run, pages: tiles.length + first - 1 };
  }

  function cover(doc, model, chart, params, run) {
    const t = (x, y, s, size, bold, color) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...hex(color || "#000000")); doc.text(String(s), x, y); };
    t(1.5, 2.4, `POLA ${model.name.toUpperCase()}`, 24, true);
    t(1.5, 3.2, `Size ${run.sizes.join(" - ")}  |  semua size bertumpuk (nested)`, 11);
    let y = 4.4;
    t(1.5, y, "CARA CETAK", 12, true); y += 0.6;
    ["1. Print ukuran asli: 100% / 'Actual size' (JANGAN 'Fit to page').", "2. Ukur KOTAK UJI 5x5 cm (kanan bawah). Kalau meleset, cek setting printer.",
      "3. Potong tepi kertas, sambung sesuai kode A1, A2, B1... (lihat halaman PETA).", "   Tepatkan bulatan di tiap tepi kertas, lalu selotip.", "4. Untuk konveksi lebih praktis pakai file PLOTTER (skala 1:1)."]
      .forEach((l) => { t(1.5, y, l, 9); y += 0.5; });
    y += 0.4; t(1.5, y, "UKURAN JADI (flat), cm", 12, true); y += 0.65;
    const xs = [1.5].concat(model.fields.map((_, i) => 3.6 + i * 3.1));
    t(xs[0], y, "Size", 8, true);
    model.fields.forEach((f, i) => t(xs[i + 1], y, f.label.split(" (")[0], 7.5, true));
    y += 0.5;
    run.sizes.forEach((s, j) => {
      t(xs[0], y, s, 9, true, COLORS[j % COLORS.length]);
      model.fields.forEach((f, i) => t(xs[i + 1], y, chart[s][f.k], 9));
      y += 0.45;
    });
    y += 0.4; t(1.5, y, "DAFTAR POTONGAN", 12, true); y += 0.6;
    const mid = run.results[run.sizes[Math.floor(run.sizes.length / 2)]].pieces;
    for (const k of run.keys) { t(1.5, y, mid[k].name, 9, true); t(6.5, y, mid[k].cut, 9); y += 0.45; }
    y += 0.4; t(1.5, y, "CEK UKURAN POLA", 12, true); y += 0.6;
    const checks = run.sizes.map((s) => run.results[s].checks);
    checks[0].forEach((c, i) => {
      t(1.5, y, c[0], 8, true);
      run.sizes.forEach((s, j) => t(8.2 + j * 2.5, y, checks[j][i][1], 8, false, COLORS[j % COLORS.length]));
      y += 0.42;
    });
    y += 0.4; t(1.5, y, "KETERANGAN", 12, true); y += 0.6;
    [`- Kampuh ${params.sa} cm${params.hem ? `, kelim ${params.hem} cm` : ""} sudah termasuk. Garis putus tipis = garis jahit.`,
      "- Garis tebal = garis potong (warna & pola garis beda per size).", "- Takik: 1 garis = depan, 2 garis = belakang.",
      `- ${model.desc}`, "- WAJIB jahit sampel 1 size dulu sebelum produksi massal."].forEach((l) => { t(1.5, y, l, 8); y += 0.45; });
    const pen = makePen(doc, A4H, 0, 0);
    drawTest(doc, pen, [13, 0.6]);
  }

  function refPage(doc, refs) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(0, 0, 0);
    doc.text("REFERENSI DARI CLIENT", 1.5, 2.4);
    let y = 3.2;
    const maxW = 18, gap = 0.6, list = refs.slice(0, 3);
    const avail = 29.7 - 1.2 - y - gap * (list.length - 1);
    for (const r of list) {
      let w = maxW, h = w * r.h / r.w;
      const hMax = avail / list.length;
      if (h > hMax) { h = hMax; w = h * r.w / r.h; }
      try { doc.addImage(r.data, r.type || "JPEG", 1.5, y, w, h); } catch (e) { /* skip */ }
      y += h + gap;
    }
  }

  function mapPage(doc, run, lay, rows, cols, tiles, ox, oy, first = 3) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(0, 0, 0);
    doc.text("PETA SAMBUNGAN HALAMAN", 1.5, 2.4);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text("Halaman kosong tidak dicetak. Kotak merah bernomor = halaman di file ini.", 1.5, 3.1);
    const sc = Math.min(18 / (cols * TW), 23 / (rows * TH));
    const baseX = 1.5, baseY = 4.0; // top-left of grid on page (y down)
    const totalH = rows * TH;
    const P = (x, y) => [baseX + x * sc, baseY + (totalH - y) * sc];
    setStroke(doc, "#000000", 0.5, []);
    for (const [k, d] of Object.entries(lay.pos)) {
      const b = k === "__test" ? [0, 0, 7, 7] : pieceBBox(run, k);
      const a = P(b[0] + d[0] + ox, b[3] + d[1] + oy), c = P(b[2] + d[0] + ox, b[1] + d[1] + oy);
      doc.rect(a[0], a[1], c[0] - a[0], c[1] - a[1], "S");
      if (k !== "__test") {
        doc.setFontSize(6); doc.setTextColor(0, 0, 0);
        const nm = run.results[run.sizes[0]].pieces[k].name;
        doc.text(nm, a[0] + 0.1, a[1] + 0.35, { maxWidth: c[0] - a[0] - 0.2 });
      }
    }
    const idx = new Map(tiles.map((t, i) => [t.join(","), i + first]));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const on = idx.has(`${r},${c}`);
      const a = P(c * TW, totalH - r * TH);
      setStroke(doc, on ? "#d62728" : "#cccccc", 0.6, on ? [] : [0.1, 0.1]);
      doc.rect(a[0], a[1], TW * sc, TH * sc, "S");
      if (on) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(214, 39, 40);
        doc.text(`${String.fromCharCode(65 + r)}${c + 1}`, a[0] + 0.15, a[1] + 0.95);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6);
        doc.text(`hal ${idx.get(`${r},${c}`)}`, a[0] + 0.15, a[1] + 1.3);
      }
    }
    doc.setLineDashPattern([], 0);
  }

  // ---------- SVG preview (one size or all) ----------
  function previewSVG(model, chart, params, opts = {}) {
    const run = runModel(model, chart, params);
    const lay = layout(run, opts.width || 150);
    const only = opts.size;
    const W = lay.W, H = lay.H, out = [];
    const Y = (y) => (H - y).toFixed(2);
    const path = (pts, closed) => "M" + pts.map((p) => `${p[0].toFixed(2)},${Y(p[1])}`).join("L") + (closed ? "Z" : "");
    for (const [k, d] of Object.entries(lay.pos)) {
      if (k === "__test") continue;
      run.sizes.forEach((s, i) => {
        if (only && s !== only) return;
        const pc = run.results[s].pieces[k], dd = [d[0] + pc.align[0], d[1] + pc.align[1]], col = COLORS[i % COLORS.length];
        out.push(`<path d="${path(sh(pc.cutLine, dd), true)}" fill="${only ? col + "14" : "none"}" stroke="${col}" stroke-width="0.25"/>`);
        out.push(`<path d="${path(sh(pc.net, dd), true)}" fill="none" stroke="${col}" stroke-width="0.12" stroke-dasharray="0.4 0.3"/>`);
      });
      const ref = run.results[run.sizes[0]].pieces[k];
      const b = pieceBBox(run, k);
      out.push(`<text x="${(b[0] + d[0] + 1).toFixed(1)}" y="${Y(b[3] + d[1] - 2.5)}" font-size="2.2" font-family="sans-serif" font-weight="bold">${ref.name}</text>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${(W + 2).toFixed(1)} ${(H + 2).toFixed(1)}">${out.join("")}</svg>`;
  }

  root.PolaPDF = { runModel, layout, plotterPDF, a4PDF, previewSVG, COLORS };
})(typeof window !== "undefined" ? window : globalThis);
