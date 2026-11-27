/* Pola Jahit — parametric sewing pattern engine.
   Units: cm. x to the right, y up. Every piece is described by its NET (stitch) outline,
   as a list of edges in counter-clockwise order, each with its own seam allowance. */
(function (root) {
  "use strict";

  // ---------------- geometry ----------------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const len = (a) => Math.hypot(a[0], a[1]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };

  function bez(p0, p1, p2, p3, n = 48) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    return out;
  }
  const line = (a, b) => [a.slice(), b.slice()];
  const rev = (pts) => pts.slice().reverse();
  function plen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += len(sub(pts[i], pts[i - 1])); return s; }
  function pointAt(pts, d) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const sl = len(sub(pts[i], pts[i - 1]));
      if (acc + sl >= d || i === pts.length - 1) {
        const f = sl ? Math.min(1, Math.max(0, (d - acc) / sl)) : 0;
        return add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), f));
      }
      acc += sl;
    }
    return pts[pts.length - 1];
  }
  function splitAtY(pts, y) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
        const p = add(a, mul(sub(b, a), (y - a[1]) / (b[1] - a[1])));
        return [pts.slice(0, i + 1).concat([p]), [p].concat(pts.slice(i + 1))];
      }
    }
    throw new Error("splitAtY: no crossing");
  }
  function arc(cx, cy, r, a0, a1, n = 10) {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  // U-shape (left side down, bottom, right side up) with rounded bottom corners
  function uShape(w, h, r, x0 = 0, y0 = 0) {
    return [[x0, y0 + h]].concat(arc(x0 + r, y0 + r, r, 180, 270), arc(x0 + w - r, y0 + r, r, 270, 360), [[x0 + w, y0 + h]]);
  }
  function signedArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

  // offset polyline to the RIGHT by d (outside of a CCW outline)
  function offsetRight(pts, d) {
    const n = pts.length, out = [];
    const segN = [];
    for (let i = 0; i < n - 1; i++) { const t = norm(sub(pts[i + 1], pts[i])); segN.push([t[1], -t[0]]); }
    for (let i = 0; i < n; i++) {
      let nv;
      if (i === 0) nv = segN[0];
      else if (i === n - 1) nv = segN[n - 2];
      else {
        const a = segN[i - 1], b = segN[i];
        const m = norm(add(a, b));
        const c = Math.max(0.3, m[0] * a[0] + m[1] * a[1]);
        nv = mul(m, 1 / c);
      }
      out.push(add(pts[i], mul(nv, d)));
    }
    return out;
  }
  function lineIntersect(p1, p2, q1, q2) {
    const d1 = sub(p2, p1), d2 = sub(q2, q1);
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((q1[0] - p1[0]) * d2[1] - (q1[1] - p1[1]) * d2[0]) / den;
    return add(p1, mul(d1, t));
  }
  function dedupe(pts) {
    const out = [];
    for (const p of pts) if (!out.length || len(sub(p, out[out.length - 1])) > 1e-4) out.push(p);
    return out;
  }
  function nearestOnPoly(poly, p) {
    let best = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ab = sub(b, a);
      const L2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2));
      const q = add(a, mul(ab, t)), d = len(sub(p, q));
      if (!best || d < best.d) best = { d, q, t: norm(ab) };
    }
    return best;
  }

  // tiny solvers
  function solve1(f, x0) {
    let x = x0;
    for (let i = 0; i < 60; i++) { const fx = f(x), h = 1e-4, d = (f(x + h) - fx) / h; if (Math.abs(fx) < 1e-6 || !d) break; x -= fx / d; }
    return x;
  }
  function solve2(f, x0) {
    let x = x0.slice();
    for (let i = 0; i < 80; i++) {
      const F = f(x); if (Math.hypot(F[0], F[1]) < 1e-6) break;
      const h = 1e-4, J = [[0, 0], [0, 0]];
      for (let j = 0; j < 2; j++) { const xh = x.slice(); xh[j] += h; const Fh = f(xh); J[0][j] = (Fh[0] - F[0]) / h; J[1][j] = (Fh[1] - F[1]) / h; }
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]; if (!det) break;
      x = [x[0] - (J[1][1] * F[0] - J[0][1] * F[1]) / det, x[1] - (-J[1][0] * F[0] + J[0][0] * F[1]) / det];
    }
    return x;
  }

  // ---------------- piece ----------------
  class Piece {
    constructor(o) {
      Object.assign(this, { cut: "", fold: null, labelRot: 0, notches: [], marks: [], align: [0, 0] }, o);
      // edges: [[pts, sa], ...] CCW
      this.net = dedupe([].concat(...this.edges.map((e) => e[0].slice(0, -1))));
      if (signedArea(this.net) < 0) throw new Error(this.name + ": edges must be counter-clockwise");
      this.cutLine = this.buildCut();
    }
    buildCut() {
      const offs = this.edges.map(([pts, sa]) => (sa > 0 ? offsetRight(pts, sa) : pts.map((p) => p.slice())));
      let out = [];
      for (let i = 0; i < offs.length; i++) {
        const a = offs[i], b = offs[(i + 1) % offs.length];
        out = out.concat(a);
        const X = lineIntersect(a[a.length - 2], a[a.length - 1], b[0], b[1]);
        if (X && len(sub(X, a[a.length - 1])) < 8) out.push(X);
      }
      return dedupe(out);
    }
    notch(p, count = 1) { this.notches.push({ p, count }); return this; }
    bbox() {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of this.cutLine) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return [x0 + this.align[0], y0 + this.align[1], x1 + this.align[0], y1 + this.align[1]];
    }
    // notch drawing data: list of [from, to] in piece coords
    notchLines() {
      const res = [];
      for (const { p, count } of this.notches) {
        const nb = nearestOnPoly(this.cutLine, p);
        const inward = [-nb.t[1], nb.t[0]];
        for (const off of count === 1 ? [0] : [-0.3, 0.3]) {
          const q = add(nb.q, mul(nb.t, off));
          res.push([q, add(q, mul(inward, 0.6))]);
        }
      }
      return res;
    }
  }

  // ---------------- shared blocks ----------------
  // bodice half: HPS level at y=0, centre line at x=0
  function bodiceCurves(o) {
    const { nw, bnd, fnd, slope, S, C, AH } = o;
    const hps = [nw, 0], sp = [S / 2, -slope], ua = [C / 2, -AH], dx = C / 2 - S / 2;
    const fit = dx < 2; // set-in sleeve: armhole scoops inward
    return {
      hps, sp, ua,
      frontNeck: bez([nw, 0], [nw, -fnd * 0.55], [nw * 0.55, -fnd], [0, -fnd]),
      backNeck: bez([0, -bnd], [nw * 0.5, -bnd], [nw * 0.88, -bnd * 0.45], [nw, 0]),
      backAH: fit
        ? bez(sp, [S / 2 - 0.4, -slope - (AH - slope) * 0.35], [S / 2 - 0.6 + (C / 2 - S / 2) * 0.1, -AH + 1.0], [ua[0] - 2.5, -AH], 24).concat(bez([ua[0] - 2.5, -AH], [ua[0] - 1.6, -AH], [ua[0] - 0.6, -AH], ua, 8).slice(1))
        : bez(sp, [S / 2 + 0.3, -slope - (AH - slope) * 0.5], [S / 2 + dx * 0.35, -AH], ua),
      frontAH: fit
        ? bez(sp, [S / 2 - 1.2, -slope - (AH - slope) * 0.35], [S / 2 - 1.6 + (C / 2 - S / 2) * 0.1, -AH + 1.0], [ua[0] - 3.0, -AH], 24).concat(bez([ua[0] - 3.0, -AH], [ua[0] - 2.0, -AH], [ua[0] - 0.8, -AH], ua, 8).slice(1))
        : bez(sp, [S / 2 - 0.8, -slope - (AH - slope) * 0.45], [S / 2 + dx * 0.15, -AH], ua),
    };
  }

  // one-piece sleeve. cap top at (sx, capH), bicep line y=0, front on the left (-x)
  function sleeveDraft({ fAH, bAH, ease, capH, SL, cuff, name, cut, sa, hem, extraMarks }) {
    const tf = fAH + ease / 2, tb = bAH + ease / 2;
    const caps = (B, sx) => [
      bez([-B / 2, 0], [-B / 2 + 0.38 * (sx + B / 2), 0], [sx - 0.28 * (sx + B / 2), capH], [sx, capH]),
      bez([sx, capH], [sx + 0.30 * (B / 2 - sx), capH], [B / 2 - 0.42 * (B / 2 - sx), 0], [B / 2, 0]),
    ];
    const [B, sx] = solve2((v) => { const [f, b] = caps(v[0], v[1]); return [plen(f) - tf, plen(b) - tb]; }, [tf + tb - capH * 0.6, 0.3]);
    const [fc, bc] = caps(B, sx);
    const yH = capH - SL;
    const pc = new Piece({
      name, cut,
      edges: [
        [line([-cuff, yH], [cuff, yH]), hem],
        [line([cuff, yH], [B / 2, 0]), sa],
        [rev(bc), sa],
        [rev(fc), sa],
        [line([-B / 2, 0], [-cuff, yH]), sa],
      ],
      grain: [[sx, capH - 5], [sx, yH + 6]],
      label: [sx + 1, Math.max(yH + 4, -8)],
      align: [-sx, -capH],
    });
    pc.notch(pointAt(fc, 8.0 * tf / fAH), 1).notch(pointAt(rev(bc), 9.0 * tb / bAH), 2).notch([sx, capH], 1);
    pc.marks.push({ t: "text", p: [-B / 2 + 2, 1.2], s: "DEPAN" }, { t: "text", p: [B / 2 - 6.5, 1.2], s: "BELAKANG" });
    (extraMarks || []).forEach((m) => pc.marks.push(m));
    return { piece: pc, B, sx, capF: plen(fc), capB: plen(bc), yH };
  }

  function bodyAH(c) { return { f: plen(c.frontAH), b: plen(c.backAH) }; }
  const r1 = (x) => Math.round(x * 10) / 10;

  // ---------------- MODELS ----------------
  const MODELS = {};

  // ===== KAOS =====
  MODELS.kaos = {
    name: "Kaos Oblong",
    desc: "Kaos lengan pendek, leher O dengan rib, badan depan & belakang cut on fold.",
    fields: [
      { k: "chest", label: "Lebar dada" }, { k: "length", label: "Panjang badan" },
      { k: "shoulder", label: "Lebar bahu" }, { k: "sleeve", label: "Panjang lengan" },
      { k: "opening", label: "Lebar ujung lengan" },
    ],
    chart: {
      S: { chest: 48, length: 68, shoulder: 44, sleeve: 19, opening: 16 },
      M: { chest: 50, length: 70, shoulder: 46, sleeve: 20, opening: 17 },
      L: { chest: 52, length: 72, shoulder: 48, sleeve: 21, opening: 18 },
      XL: { chest: 54, length: 74, shoulder: 50, sleeve: 22, opening: 19 },
      XXL: { chest: 56, length: 76, shoulder: 52, sleeve: 23, opening: 20 },
    },
    params: [{ k: "sa", label: "Kampuh", def: 1 }, { k: "hem", label: "Kelim bawah & lengan", def: 2.5 }, { k: "rib", label: "Lebar rib leher jadi", def: 1.8 }],
    draft(m, p) {
      const C = m.chest, L = m.length, S = m.shoulder, sa = p.sa, hem = p.hem;
      const nw = 0.14 * C + 1, bnd = 2.0, fnd = 0.1 * C + 4, slope = 4.0, AH = 0.44 * C + 2.5;
      const c = bodiceCurves({ nw, bnd, fnd, slope, S, C, AH });
      const fr = new Piece({
        name: "BADAN DEPAN", cut: "Potong 1 lipat",
        edges: [[line([0, -L], [C / 2, -L]), hem], [line([C / 2, -L], c.ua), sa], [rev(c.frontAH), sa], [line(c.sp, c.hps), sa], [c.frontNeck, sa], [line([0, -fnd], [0, -L]), 0]],
        grain: [[C / 5, -AH - 6], [C / 5, -L + 8]], label: [C / 5 + 1.5, -AH - 10], fold: [[0, -fnd], [0, -L]],
      });
      fr.notch(pointAt(rev(c.frontAH), 7), 1).notch([0, -fnd], 1);
      const bk = new Piece({
        name: "BADAN BELAKANG", cut: "Potong 1 lipat",
        edges: [[line([0, -L], [C / 2, -L]), hem], [line([C / 2, -L], c.ua), sa], [rev(c.backAH), sa], [line(c.sp, c.hps), sa], [rev(c.backNeck), sa], [line([0, -bnd], [0, -L]), 0]],
        grain: [[C / 5, -AH - 6], [C / 5, -L + 8]], label: [C / 5 + 1.5, -AH - 10], fold: [[0, -bnd], [0, -L]],
      });
      bk.notch(pointAt(rev(c.backAH), 8), 2).notch([0, -bnd], 1);
      const ah = bodyAH(c);
      const sl = sleeveDraft({ fAH: ah.f, bAH: ah.b, ease: 0, capH: 0.17 * (ah.f + ah.b), SL: m.sleeve, cuff: m.opening, name: "LENGAN", cut: "Potong 2", sa, hem });
      const neckFull = 2 * (plen(c.frontNeck) + plen(c.backNeck));
      const ribL = r1(neckFull * 0.85), ribH = 2 * p.rib;
      const rib = new Piece({
        name: "RIB LEHER", cut: "Potong 1 (bahan rib, serat melintang)",
        edges: [[line([0, 0], [ribL, 0]), sa], [line([ribL, 0], [ribL, ribH]), sa], [line([ribL, ribH], [0, ribH]), sa], [line([0, ribH], [0, 0]), sa]],
        grain: [[ribL * 0.55, 0.6], [ribL * 0.85, 0.6]], label: [1, ribH * 0.62],
      });
      rib.marks.push({ t: "line", pts: line([0, ribH / 2], [ribL, ribH / 2]), s: "lipat" });
      return {
        pieces: { front: fr, back: bk, sleeve: sl.piece, rib },
        checks: [["Lebar dada", C], ["Panjang", L], ["Lebar bahu", S], ["Panjang lengan", m.sleeve],
          ["Lebar lengan atas (flat)", r1(sl.B / 2)], ["Kerung lengan vs puncak lengan", `${r1(ah.f + ah.b)} / ${r1(sl.capF + sl.capB)}`],
          ["Lingkar leher / panjang rib", `${r1(neckFull)} / ${ribL}`]],
      };
    },
  };

  // ===== KEMEJA =====
  MODELS.kemeja = {
    name: "Kemeja Lengan Panjang",
    desc: "Kemeja basic: kerah + kaki kerah, plaket kancing lipat, yoke belakang, manset, kantong dada.",
    fields: [
      { k: "chest", label: "Lebar dada" }, { k: "length", label: "Panjang badan" },
      { k: "shoulder", label: "Lebar bahu" }, { k: "sleeve", label: "Panjang lengan (incl. manset)" },
      { k: "cuff", label: "Lebar manset (flat)" },
    ],
    chart: {
      S: { chest: 51, length: 71, shoulder: 44, sleeve: 59, cuff: 12 },
      M: { chest: 53, length: 73, shoulder: 45.5, sleeve: 60, cuff: 12.5 },
      L: { chest: 55, length: 75, shoulder: 47, sleeve: 61, cuff: 13 },
      XL: { chest: 57, length: 77, shoulder: 48.5, sleeve: 62, cuff: 13.5 },
      XXL: { chest: 59, length: 79, shoulder: 50, sleeve: 63, cuff: 14 },
    },
    params: [{ k: "sa", label: "Kampuh", def: 1 }, { k: "hem", label: "Kelim bawah", def: 1.5 }, { k: "cuffH", label: "Tinggi manset jadi", def: 6 }],
    draft(m, p) {
      const C = m.chest, L = m.length, S = m.shoulder, sa = p.sa, hem = p.hem;
      const nw = 0.13 * C + 0.8, bnd = 2.0, fnd = 0.13 * C + 1.0, slope = 4.5, AH = 0.42 * C + 2.0;
      const ext = 1.5, fac = 3.5; // button stand + folded facing (grown-on)
      const c = bodiceCurves({ nw, bnd, fnd, slope, S, C, AH });
      const YD = 0.15 * C + 1; // yoke depth at CB from HPS level
      const fr = new Piece({
        name: "BADAN DEPAN", cut: "Potong 2 (kiri-kanan berpasangan)",
        edges: [[line([-ext - fac, -L], [C / 2, -L]), hem], [line([C / 2, -L], c.ua), sa], [rev(c.frontAH), sa], [line(c.sp, c.hps), sa], [c.frontNeck, sa],
          [line([0, -fnd], [-ext - fac, -fnd]), sa], [line([-ext - fac, -fnd], [-ext - fac, -L]), 0]],
        grain: [[C / 4, -AH - 6], [C / 4, -L + 10]], label: [C / 4 + 1.2, -AH - 12],
      });
      fr.marks.push({ t: "line", pts: line([0, -fnd], [0, -L]), s: "CF" }, { t: "line", pts: line([-ext, -fnd], [-ext, -L]), s: "lipat" });
      const nBtn = 7, top = -fnd - 1.2, bot = -L + 14;
      for (let i = 0; i < nBtn; i++) fr.marks.push({ t: "btn", p: [0, top + (bot - top) * i / (nBtn - 1)] });
      const pw = 0.2 * C + 1.2, ph = pw + 1.5, px = 0.1 * C, py = -(0.37 * C + 1);
      fr.marks.push({ t: "poly", pts: uShape(pw, ph, 0.01, px, py - ph).concat([[px, py]]) }, { t: "text", p: [px + 0.5, py - ph / 2], s: "kantong (kiri)" });
      fr.notch(pointAt(rev(c.frontAH), 8), 1);
      const [ahTop, ahBot] = splitAtY(c.backAH, -YD);
      const yx = ahTop[ahTop.length - 1][0];
      const yk = new Piece({
        name: "YOKE BELAKANG", cut: "Potong 2 lipat (luar + dalam)",
        edges: [[line([0, -YD], [yx, -YD]), sa], [rev(ahTop), sa], [line(c.sp, c.hps), sa], [rev(c.backNeck), sa], [line([0, -bnd], [0, -YD]), 0]],
        grain: [[S / 4, -bnd - 2], [S / 4, -YD + 1.5]], label: [S / 4 + 1.3, -YD + 3.3], fold: [[0, -bnd], [0, -YD]],
      });
      yk.notch([0, -bnd]);
      const pleat = 2.0; // box pleat at CB (half)
      const bk = new Piece({
        name: "BADAN BELAKANG", cut: "Potong 1 lipat",
        edges: [[line([0, -L], [C / 2 + pleat, -L]), hem], [line([C / 2 + pleat, -L], [c.ua[0] + pleat, c.ua[1]]), sa],
          [rev(ahBot).map(([x, y]) => [x + pleat, y]), sa], [line([yx + pleat, -YD], [0, -YD]), sa], [line([0, -YD], [0, -L]), 0]],
        grain: [[C / 4, -YD - 8], [C / 4, -L + 10]], label: [C / 4 + 1.2, -AH - 6], fold: [[0, -YD], [0, -L]],
      });
      bk.notch([pleat, -YD]).notch(pointAt(rev(c.backAH).map(([x, y]) => [x + pleat, y]), 9), 2);
      bk.marks.push({ t: "text", p: [0.3, -YD - 2], s: "lipit 2cm" });
      const ah = bodyAH(c);
      const cuffL = 2 * m.cuff + 2.5, slitX = 0;
      const sl = sleeveDraft({ fAH: ah.f, bAH: ah.b, ease: 1.0, capH: 0.2 * (ah.f + ah.b), SL: m.sleeve - p.cuffH, cuff: m.cuff + 3.0, name: "LENGAN", cut: "Potong 2 (berpasangan)", sa, hem: sa });
      const yH = sl.yH, bx = (m.cuff + 3.0) / 2;
      sl.piece.marks.push({ t: "line", pts: line([sl.sx + bx, yH], [sl.sx + bx, yH + 12]), s: "belahan" });
      sl.piece.marks.push({ t: "text", p: [sl.sx - 3, yH + 2], s: "2 lipit" });
      // collar stand + collar (half, CB fold)
      const bnl = plen(c.backNeck), fnl = plen(c.frontNeck), stH = 3.0;
      const SLN = bnl + fnl, rise = 1.0;
      const stNeck = (s) => bez([0, 0], [SLN * s * 0.5, 0], [SLN * s * 0.85, 0.1], [SLN * s, rise]);
      const ss = solve1((s) => plen(stNeck(s)) - SLN, 1);
      const sn = stNeck(ss), end = sn[sn.length - 1];
      const stTopEnd = [end[0] - 0.4, end[1] + stH - 0.5];
      const stEdge = [end, [end[0] + ext * 0.7, end[1] + 0.2]].concat(bez([end[0] + ext * 0.7, end[1] + 0.2], [end[0] + ext + 0.2, end[1] + 1.2], [end[0] + ext, stTopEnd[1]], [end[0] + ext * 0.3, stTopEnd[1] + 0.2], 10).slice(1));
      const stTop = bez(stEdge[stEdge.length - 1], [SLN * 0.7, stH + rise * 0.5], [SLN * 0.3, stH], [0, stH]);
      const st = new Piece({
        name: "KAKI KERAH", cut: "Potong 2 lipat + 1 kain keras",
        edges: [[sn, sa], [stEdge, sa], [stTop, sa], [line([0, stH], [0, 0]), 0]],
        grain: [[2, 0.6], [2, stH - 0.6]], label: [3, stH * 0.45], fold: [[0, 0], [0, stH]],
      });
      st.notch(pointAt(sn, bnl)).notch(pointAt(sn, SLN)).notch(pointAt(stTop, plen(stTop) - 0.01 - 0)).notch([0, 0]);
      const topLen = plen(stTop) - 0; // collar attaches to stand top up to CF
      const cW = 4.5, cRise = 0.8;
      const cNeck = bez([0, 0], [topLen * 0.5, 0], [topLen * 0.8, -0.1], [topLen, -cRise]);
      const cEnd = cNeck[cNeck.length - 1], tip = [cEnd[0] + 2.2, cEnd[1] + cW + 1.8];
      const cOut = bez(tip, [tip[0] * 0.7, cW + 0.6], [tip[0] * 0.3, cW], [0, cW]);
      const co = new Piece({
        name: "KERAH", cut: "Potong 2 lipat + 1 kain keras",
        edges: [[cNeck, sa], [line(cEnd, tip), sa], [cOut, sa], [line([0, cW], [0, 0]), 0]],
        grain: [[2, 0.8], [2, cW - 0.8]], label: [3, cW * 0.5], fold: [[0, 0], [0, cW]],
      });
      co.notch(pointAt(cNeck, bnl)).notch([0, 0]);
      const ch = p.cuffH;
      const cf = new Piece({
        name: "MANSET", cut: "Potong 4 + 2 kain keras",
        edges: [[line([0, 0], [cuffL, 0]), sa], [line([cuffL, 0], [cuffL, ch - 1.2]), sa],
          [bez([cuffL, ch - 1.2], [cuffL, ch - 0.4], [cuffL - 0.4, ch], [cuffL - 1.2, ch], 8), sa],
          [line([cuffL - 1.2, ch], [1.2, ch]), sa], [bez([1.2, ch], [0.4, ch], [0, ch - 0.4], [0, ch - 1.2], 8), sa], [line([0, ch - 1.2], [0, 0]), sa]],
        grain: [[cuffL * 0.5, 0.8], [cuffL * 0.85, 0.8]], label: [3.2, ch * 0.62],
      });
      cf.marks.push({ t: "btn", p: [1.25, ch / 2] }, { t: "text", p: [cuffL - 3.5, ch / 2], s: "lubang" });
      const pk = new Piece({
        name: "KANTONG DADA", cut: "Potong 1",
        edges: [[uShape(pw, ph, 0.01), sa], [line([pw, ph], [0, ph]), 3.0]],
        grain: [[pw / 2, 1.5], [pw / 2, ph - 1.5]], label: [0.8, ph * 0.6],
      });
      pk.notch([0, ph]).notch([pw, ph]);
      const plk = new Piece({
        name: "PLAKET BELAHAN", cut: "Potong 2 (berpasangan)",
        edges: [[line([0, 0], [5, 0]), sa], [line([5, 0], [5, 13]), sa], [line([5, 13], [2.5, 15]), sa], [line([2.5, 15], [0, 13]), sa], [line([0, 13], [0, 0]), sa]],
        grain: [[1.2, 2], [1.2, 11]], label: [3.4, 1.5], labelRot: 90,
      });
      return {
        pieces: { front: fr, back: bk, yoke: yk, sleeve: sl.piece, collar: co, stand: st, cuff: cf, pocket: pk, placket: plk },
        checks: [["Lebar dada", C], ["Panjang", L], ["Lebar bahu", S], ["Panjang lengan (lengan + manset)", r1(m.sleeve - ch + ch)],
          ["Lebar lengan atas (flat)", r1(sl.B / 2)], ["Kerung lengan vs puncak lengan", `${r1(ah.f + ah.b)} / ${r1(sl.capF + sl.capB)}`],
          ["Leher (setengah) vs kaki kerah", `${r1(SLN)} / ${r1(plen(sn))}`], ["Panjang manset", r1(cuffL)]],
      };
    },
  };

  // ===== COACH JACKET =====
  MODELS.coach = {
    name: "Coach Jacket",
    desc: "Drop shoulder, kerah satu lapis, kancing jepret, yoke belakang, kantong tempel dada + bis samping.",
    fields: [
      { k: "chest", label: "Lebar dada" }, { k: "length", label: "Panjang badan" },
      { k: "shoulder", label: "Lebar bahu" }, { k: "sleeve", label: "Panjang lengan" },
      { k: "opening", label: "Lebar ujung lengan" },
    ],
    chart: {
      S: { chest: 57, length: 66, shoulder: 48, sleeve: 61, opening: 13 },
      M: { chest: 59, length: 68, shoulder: 50, sleeve: 62, opening: 13.5 },
      L: { chest: 61, length: 70, shoulder: 52, sleeve: 63, opening: 14 },
      XL: { chest: 63, length: 72, shoulder: 54, sleeve: 64, opening: 14.5 },
      XXL: { chest: 65, length: 74, shoulder: 56, sleeve: 65, opening: 15 },
    },
    params: [{ k: "sa", label: "Kampuh", def: 1 }, { k: "hem", label: "Kelim bawah & lengan", def: 3 }, { k: "snaps", label: "Jumlah kancing jepret", def: 6 }],
    draft(m, p) {
      const C = m.chest, L = m.length, S = m.shoulder, SA = p.sa, HEM = p.hem, EXT = 2.0;
      const g = (C - 57) / 2; // grade steps from base size
      const nw = 8.0 + 0.2 * g, bnd = 2.3, fnd = 8.0 + 0.25 * g, slope = 3.0;
      const AH = Math.max(25.0 + 0.75 * g, S / 2 > C / 2 - 1 ? 22 : 0);
      const YD = 11.0 + 0.4 * g;
      const c = bodiceCurves({ nw, bnd, fnd, slope, S, C, AH });
      const fr = new Piece({
        name: "BADAN DEPAN", cut: "Potong 2 (kiri-kanan berpasangan)",
        edges: [[line([-EXT, -L], [C / 2, -L]), HEM], [line([C / 2, -L], c.ua), SA], [rev(c.frontAH), SA], [line(c.sp, c.hps), SA], [c.frontNeck, SA],
          [line([0, -fnd], [-EXT, -fnd]), SA], [line([-EXT, -fnd], [-EXT, -L]), SA]],
        grain: [[C / 4, -AH - 8], [C / 4, -L + 10]], label: [C / 4 + 1, -AH - 14],
      });
      fr.notch(pointAt(rev(c.frontAH), 8));
      fr.marks.push({ t: "line", pts: line([0, -fnd], [0, -L]), s: "CF" });
      const n = Math.max(2, Math.round(p.snaps)), top = -fnd - 1.6, bot = -L + HEM + 5.5;
      for (let i = 0; i < n; i++) fr.marks.push({ t: "btn", p: [0, top + (bot - top) * i / (n - 1)] });
      const pw = 12 + 0.25 * g, ph = 13.5 + 0.25 * g, px = 6 + 0.25 * g, py = -(20 + 0.5 * g);
      fr.marks.push({ t: "poly", pts: uShape(pw, ph, 2, px, py - ph).concat([[px, py]]) }, { t: "text", p: [px + 0.5, py - ph / 2], s: "kantong dada (kiri)" });
      const wb = [C / 2 - 10.5, -L + 12], wt = [C / 2 - 7.5, -L + 28];
      fr.marks.push({ t: "welt", a: wb, b: wt });
      const weltLen = r1(len(sub(wt, wb)));
      const [ahTop, ahBot] = splitAtY(c.backAH, -YD);
      const yx = ahTop[ahTop.length - 1][0];
      const yk = new Piece({
        name: "YOKE BELAKANG", cut: "Potong 1 lipat (+1 furing bila double)",
        edges: [[line([0, -YD], [yx, -YD]), SA], [rev(ahTop), SA], [line(c.sp, c.hps), SA], [rev(c.backNeck), SA], [line([0, -bnd], [0, -YD]), 0]],
        grain: [[S / 4, -bnd - 2.5], [S / 4, -YD + 2]], label: [S / 4 + 1.5, -YD + 3.5], fold: [[0, -bnd], [0, -YD]],
      });
      yk.notch([0, -YD]).notch([0, -bnd]);
      const bk = new Piece({
        name: "BADAN BELAKANG", cut: "Potong 1 lipat",
        edges: [[line([0, -L], [C / 2, -L]), HEM], [line([C / 2, -L], c.ua), SA], [rev(ahBot), SA], [line([yx, -YD], [0, -YD]), SA], [line([0, -YD], [0, -L]), 0]],
        grain: [[C / 4, -YD - 8], [C / 4, -L + 10]], label: [C / 4 + 1, -AH - 6], fold: [[0, -YD], [0, -L]],
      });
      bk.notch(pointAt(rev(c.backAH), 9), 2).notch([0, -YD]);
      const ah = bodyAH(c);
      const sl = sleeveDraft({ fAH: ah.f, bAH: ah.b, ease: 0.8, capH: 10 + 0.25 * g, SL: m.sleeve, cuff: m.opening, name: "LENGAN", cut: "Potong 2 (kiri-kanan berpasangan)", sa: SA, hem: HEM });
      const bnl = plen(c.backNeck), fnl = plen(c.frontNeck), NL = bnl + fnl + EXT, W = 7.0, rise = 1.2;
      const ne0 = (s) => bez([0, 0], [NL * s * 0.5, 0], [NL * s * 0.8, 0.15], [NL * s, rise]);
      const ne = ne0(solve1((s) => plen(ne0(s)) - NL, 1)), end = ne[ne.length - 1], tip = [end[0] + 1.8, end[1] + W + 0.6];
      const co = new Piece({
        name: "KERAH", cut: "Potong 2 lipat (atas+bawah) + 1 kain keras",
        edges: [[ne, SA], [line(end, tip), SA], [bez(tip, [tip[0] * 0.7, W + 0.3], [tip[0] * 0.3, W], [0, W]), SA], [line([0, W], [0, 0]), 0]],
        grain: [[NL * 0.75, 1.5], [NL * 0.75, W - 1.5]], label: [2.5, W * 0.55], fold: [[0, 0], [0, W]],
      });
      co.notch(pointAt(ne, bnl)).notch(pointAt(ne, bnl + fnl)).notch([0, 0]);
      const fw = 7.5, d = norm(sub(c.sp, c.hps)), Q = add(c.hps, mul(d, 4)), perp = [d[1], -d[0]];
      const inner = bez([-EXT + fw, -fnd - 14], [-EXT + fw, -fnd - 6], add(Q, mul(perp, 5)), Q);
      const fa = new Piece({
        name: "FACING DEPAN", cut: "Potong 2 berpasangan + 2 kain keras",
        edges: [[line([-EXT, -L], [-EXT + fw, -L]), HEM], [[[-EXT + fw, -L]].concat(inner), SA], [line(Q, c.hps), SA], [c.frontNeck, SA],
          [line([0, -fnd], [-EXT, -fnd]), SA], [line([-EXT, -fnd], [-EXT, -L]), SA]],
        grain: [[-EXT + fw / 2 - 1.5, -fnd - 20], [-EXT + fw / 2 - 1.5, -L + 12]], label: [-EXT + fw / 2 + 0.8, -fnd - 36], labelRot: 90,
      });
      const pk = new Piece({
        name: "KANTONG DADA", cut: "Potong 1",
        edges: [[uShape(pw, ph, 2), SA], [line([pw, ph], [0, ph]), HEM]],
        grain: [[pw / 2, 2], [pw / 2, ph - 2]], label: [1.2, ph * 0.6],
      });
      pk.notch([0, ph]).notch([pw, ph]);
      const we = new Piece({
        name: "BIS KANTONG", cut: "Potong 2 + kain keras",
        edges: [[line([0, 0], [weltLen, 0]), SA], [line([weltLen, 0], [weltLen, 5]), SA], [line([weltLen, 5], [0, 5]), SA], [line([0, 5], [0, 0]), SA]],
        grain: [[2, 1.2], [weltLen - 2, 1.2]], label: [1.5, 3.4],
      });
      we.marks.push({ t: "line", pts: line([0, 2.5], [weltLen, 2.5]), s: "lipat" });
      const bw = 18, bh = 24 + 0.5 * g;
      const pb = new Piece({
        name: "KANTONG DALAM", cut: "Potong 4 (furing/drill)",
        edges: [[uShape(bw, bh, 4), SA], [line([bw, bh], [0, bh]), SA]],
        grain: [[bw / 2, 3], [bw / 2, bh - 3]], label: [1.5, bh * 0.6],
      });
      return {
        pieces: { front: fr, back: bk, sleeve: sl.piece, facing: fa, yoke: yk, collar: co, bag: pb, pocket: pk, welt: we },
        checks: [["Lebar dada", C], ["Panjang", L], ["Lebar bahu", S], ["Panjang lengan", m.sleeve],
          ["Lebar lengan atas (flat)", r1(sl.B / 2)], ["Kerung lengan vs puncak lengan", `${r1(ah.f + ah.b)} / ${r1(sl.capF + sl.capB)}`],
          ["Leher (setengah) vs kerah", `${r1(NL)} / ${r1(plen(ne))}`]],
      };
    },
  };

  // ===== CELANA KARET =====
  MODELS.celana = {
    name: "Celana Pinggang Karet",
    desc: "Celana pull-on (jogger/kulot/straight tergantung lebar bawah), ban pinggang karet, kantong samping.",
    fields: [
      { k: "waist", label: "Lingkar pinggang (flat, karet)" }, { k: "hip", label: "Lebar pinggul" },
      { k: "length", label: "Panjang celana" }, { k: "rise", label: "Pesak depan" },
      { k: "thigh", label: "Lebar paha" }, { k: "opening", label: "Lebar bawah" },
    ],
    chart: {
      S: { waist: 32, hip: 50, length: 96, rise: 28, thigh: 31, opening: 20 },
      M: { waist: 34, hip: 52, length: 98, rise: 29, thigh: 32, opening: 21 },
      L: { waist: 36, hip: 54, length: 100, rise: 30, thigh: 33, opening: 22 },
      XL: { waist: 38, hip: 56, length: 102, rise: 31, thigh: 34, opening: 23 },
      XXL: { waist: 40, hip: 58, length: 104, rise: 32, thigh: 35, opening: 24 },
    },
    params: [{ k: "sa", label: "Kampuh", def: 1 }, { k: "hem", label: "Kelim bawah", def: 3 }, { k: "band", label: "Tinggi ban pinggang jadi", def: 4 }],
    draft(m, p) {
      const H = m.hip, sa = p.sa, hem = p.hem, band = p.band;
      const CD = m.rise - band;                 // crotch depth below waist seam
      const hipY = -CD * 0.62, LB = m.length - band;
      const fw = H / 2 - 1, bw = H / 2 + 1;    // widths at hip (quarter circumference ±1)
      const extTot = Math.max(2 * m.thigh - H, H * 0.12);
      const fe = extTot * 0.36, be = extTot * 0.64;
      const fCrease = (fw - fe) / 2, bCrease = (bw - be) / 2;
      const fo = m.opening - 1, bo = m.opening + 1; // hem widths (pattern)
      const pocketTop = -3, pocketBot = -19;
      // FRONT: CF at x=0, side at x=fw, crotch toward -x
      const fCrotch = bez([0, hipY], [0, -CD + 3], [-fe * 0.3, -CD], [-fe, -CD]);
      const fHemL = [fCrease - fo / 2, -LB], fHemR = [fCrease + fo / 2, -LB];
      const fKneeY = hipY - (LB + hipY) * 0.55;
      const fIn = bez([-fe, -CD], [-fe + 2.5, -CD - 6], [fHemL[0] - 0.3, fKneeY], fHemL);
      const fr = new Piece({
        name: "CELANA DEPAN", cut: "Potong 2 (berpasangan)",
        edges: [[line(fHemL, fHemR), hem], [[fHemR, [fw, hipY]], sa], [line([fw, hipY], [fw, 0]), sa], [line([fw, 0], [0, 0]), sa], [[[0, 0]].concat(fCrotch), sa], [fIn, sa]],
        grain: [[fCrease, hipY - 4], [fCrease, -LB + 10]], label: [fCrease + 1, hipY - 8],
      });
      fr.notch([fw, pocketTop]).notch([fw, pocketBot]).notch(pointAt(fCrotch, plen(fCrotch) * 0.45));
      fr.marks.push({ t: "text", p: [fw - 5.5, (pocketTop + pocketBot) / 2], s: "kantong" });
      // BACK
      const cbTop = [2.0, 2.5];
      const bCrotch = bez([0, hipY], [0, -CD + 2.5], [-be * 0.35, -CD - 0.7], [-be, -CD - 0.7]);
      const bHemL = [bCrease - bo / 2, -LB], bHemR = [bCrease + bo / 2, -LB];
      const bIn = bez([-be, -CD - 0.7], [-be + 3.5, -CD - 6], [bHemL[0] - 0.3, fKneeY], bHemL);
      const bk = new Piece({
        name: "CELANA BELAKANG", cut: "Potong 2 (berpasangan)",
        edges: [[line(bHemL, bHemR), hem], [[bHemR, [bw, hipY]], sa], [line([bw, hipY], [bw, 0]), sa], [line([bw, 0], cbTop), sa], [[cbTop, [0, hipY]].concat(bCrotch.slice(1)), sa], [bIn, sa]],
        grain: [[bCrease, hipY - 4], [bCrease, -LB + 10]], label: [bCrease + 1, hipY - 8],
      });
      bk.notch([bw, pocketTop]).notch([bw, pocketBot]).notch(pointAt(bCrotch, plen(bCrotch) * 0.45), 2);
      const topLen = 2 * (fw + len(sub([bw, 0], cbTop)));
      const wbL = r1(topLen), wbH = 2 * band;
      const wbp = new Piece({
        name: "BAN PINGGANG", cut: "Potong 1 (lipat 2 memanjang)",
        edges: [[line([0, 0], [wbL / 2, 0]), sa], [line([wbL / 2, 0], [wbL / 2, wbH]), sa], [line([wbL / 2, wbH], [0, wbH]), sa], [line([0, wbH], [0, 0]), 0]],
        grain: [[wbL / 4, 1], [wbL / 4, wbH - 1]], label: [2.5, wbH * 0.62], fold: [[0, 0], [0, wbH]],
      });
      wbp.marks.push({ t: "line", pts: line([0, band], [wbL / 2, band]), s: "lipat" });
      const bag = pocketBag(sa);
      const fIns = plen(fIn), bIns = plen(bIn);
      return {
        pieces: { front: fr, back: bk, waistband: wbp, bag },
        checks: [["Lebar pinggul", r1(fw + bw)], ["Lebar paha (perkiraan, di garis pesak)", r1((fw + fe + bw + be) / 2)], ["Panjang (incl. ban)", r1(LB + band)],
          ["Pesak depan (incl. ban)", r1(CD + band)], ["Lebar bawah", r1((fo + bo) / 2)], ["Inseam depan / belakang", `${r1(fIns)} / ${r1(bIns)}`],
          ["Karet pinggang (panjang potong)", r1(2 * m.waist)]],
      };
    },
  };
  function pocketBag(sa) {
    // side-seam pocket bag: straight edge on the left (side seam), x right
    const curve = bez([0, -20], [0, -26], [8, -27], [13, -22], 12);
    const pts = [[0, 0]].concat(curve).concat([[15, -6], [12, 0]]);
    // make CCW: pts currently go down the left, around bottom, up right => CCW already
    const edges = [[pts, sa], [line([12, 0], [0, 0]), sa]];
    const pc = new Piece({ name: "KANTONG SAMPING", cut: "Potong 4 (furing/drill)", edges, grain: [[6, -3], [6, -18]], label: [1.2, -9] });
    pc.notch([0, -3]).notch([0, -19]);
    return pc;
  }

  // ===== ROK A =====
  MODELS.rok = {
    name: "Rok A-Line",
    desc: "Rok A ban pinggang karet, depan & belakang cut on fold.",
    fields: [
      { k: "waist", label: "Lingkar pinggang (flat, karet)" }, { k: "hip", label: "Lebar pinggul" },
      { k: "length", label: "Panjang rok" }, { k: "hemw", label: "Lebar bawah (flat)" },
    ],
    chart: {
      S: { waist: 32, hip: 48, length: 90, hemw: 80 },
      M: { waist: 34, hip: 50, length: 90, hemw: 82 },
      L: { waist: 36, hip: 52, length: 92, hemw: 84 },
      XL: { waist: 38, hip: 54, length: 92, hemw: 86 },
      XXL: { waist: 40, hip: 56, length: 94, hemw: 88 },
    },
    params: [{ k: "sa", label: "Kampuh", def: 1 }, { k: "hem", label: "Kelim bawah", def: 3 }, { k: "band", label: "Tinggi ban pinggang jadi", def: 4 }],
    draft(m, p) {
      const sa = p.sa, hem = p.hem, band = p.band;
      const top = m.hip / 2 + 1, hipY = -18, LB = m.length - band, hw = m.hemw / 2;
      const flare = Math.max(0, hw - top);
      const ang = Math.atan2(flare, LB + hipY);
      const rise = Math.min(4, Math.sin(ang) * hw * 0.9);
      const side = [hw, -LB + rise];
      const hemCurve = bez([0, -LB], [hw * 0.5, -LB], [hw - Math.sin(ang) * 3, -LB + rise - Math.cos(ang) * 0.5 - 0.1], side);
      const mk = (name) => new Piece({
        name, cut: "Potong 1 lipat",
        edges: [[hemCurve, hem], [[side, [top, hipY]], sa], [line([top, hipY], [top, 0]), sa], [line([top, 0], [0, 0]), sa], [line([0, 0], [0, -LB]), 0]],
        grain: [[top * 0.45, -8], [top * 0.45, -LB + 12]], label: [top * 0.45 + 1.3, -14], fold: [[0, 0], [0, -LB]],
      });
      const fr = mk("ROK DEPAN"), bk = mk("ROK BELAKANG");
      fr.notch([top, hipY]); bk.notch([top, hipY], 2);
      const wbL = r1(4 * top), wbH = 2 * band;
      const wbp = new Piece({
        name: "BAN PINGGANG", cut: "Potong 1 (lipat 2 memanjang)",
        edges: [[line([0, 0], [wbL / 2, 0]), sa], [line([wbL / 2, 0], [wbL / 2, wbH]), sa], [line([wbL / 2, wbH], [0, wbH]), sa], [line([0, wbH], [0, 0]), 0]],
        grain: [[wbL / 4, 1], [wbL / 4, wbH - 1]], label: [2.5, wbH * 0.62], fold: [[0, 0], [0, wbH]],
      });
      wbp.marks.push({ t: "line", pts: line([0, band], [wbL / 2, band]), s: "lipat" });
      return {
        pieces: { front: fr, back: bk, waistband: wbp },
        checks: [["Lebar pinggul (flat)", r1(2 * top)], ["Panjang (incl. ban)", r1(LB + band)], ["Lebar bawah (flat)", r1(2 * hw)], ["Karet pinggang (panjang potong)", r1(2 * m.waist)]],
      };
    },
  };

  root.PolaEngine = { MODELS, Piece, geom: { bez, line, plen, pointAt, add, sub, mul, len } };
})(typeof window !== "undefined" ? window : globalThis);
