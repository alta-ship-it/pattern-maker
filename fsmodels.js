/* Pattern Maker — FreeSewing designs (MIT, https://freesewing.eu) driven by a finished-garment size chart.
   Each size row (flat, cm) is turned into body measurements + ease options, the design is drafted,
   key results are measured and refined, then FreeSewing parts are converted into Pattern Maker pieces. */
(function (root) {
  "use strict";
  const FS = root.FreeSewing;
  const E = root.PolaEngine;
  if (!FS || !E) return;
  const { Piece } = E;

  // ---------- path sampling (FreeSewing mm, y down) -> cm, y up ----------
  const cv = (p) => [p.x / 10, -p.y / 10];
  function samplePath(path, n = 16) {
    const subs = []; let cur = null, last = null, start = null;
    for (const op of path.ops) {
      if (op.type === "move") { if (cur && cur.length > 1) subs.push(cur); cur = [cv(op.to)]; last = op.to; start = op.to; }
      else if (op.type === "line") { cur.push(cv(op.to)); last = op.to; }
      else if (op.type === "curve") {
        const a = last, b = op.cp1, c = op.cp2, d = op.to;
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          cur.push([(u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x) / 10,
            -(u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y) / 10]);
        }
        last = op.to;
      } else if (op.type === "close" && start) { cur.push(cv(start)); last = start; }
    }
    if (cur && cur.length > 1) subs.push(cur);
    return subs;
  }
  function area(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
  function clean(pts) {
    const out = [];
    for (const p of pts) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 1e-3) out.push(p);
    if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-3) out.pop();
    return out;
  }
  const ccw = (p) => (area(p) < 0 ? p.slice().reverse() : p);
  function offsetPoly(poly, d) { // simple mitred outward offset of a CCW polygon
    const n = poly.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
      const t1 = norm([b[0] - a[0], b[1] - a[1]]), t2 = norm([c[0] - b[0], c[1] - b[1]]);
      const n1 = [t1[1], -t1[0]], n2 = [t2[1], -t2[0]], m = norm([n1[0] + n2[0], n1[1] + n2[1]]);
      const k = Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
      out.push([b[0] + m[0] * d / k, b[1] + m[1] * d / k]);
    }
    return out;
  }
  function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
  function bboxMM(part) {
    const s = samplePath(part.paths.seam).flat();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, -y); y1 = Math.max(y1, -y); }
    return { x0: x0 * 10, x1: x1 * 10, y0: y0 * 10, y1: y1 * 10, w: (x1 - x0) * 10, h: (y1 - y0) * 10 };
  }
  // horizontal width of a part's seam polygon at FreeSewing y (mm)
  function widthAt(part, y) {
    const poly = samplePath(part.paths.seam).flat().map(([x, yy]) => [x * 10, -yy * 10]);
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
    }
    return xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0;
  }

  // ---------- part names / cutting text ----------
  const NAMES = {
    front: "BADAN DEPAN", back: "BADAN BELAKANG", sleeve: "LENGAN", collar: "KERAH", collarStand: "KAKI KERAH",
    cuff: "MANSET / RIB LENGAN", yoke: "YOKE BELAKANG", frontRight: "BADAN DEPAN KANAN", frontLeft: "BADAN DEPAN KIRI",
    sleevePlacketOverlap: "PLAKET LENGAN ATAS", sleevePlacketUnderlap: "PLAKET LENGAN BAWAH", buttonPlacket: "PLAKET KANCING",
    buttonholePlacket: "PLAKET LUBANG KANCING", waistband: "BAN PINGGANG", pocket: "KANTONG", pocketFacing: "FACING KANTONG",
    hoodSide: "TUDUNG SAMPING", hoodCenter: "TUDUNG TENGAH", neckBinding: "BIS LEHER", skirt: "ROK",
    frontPocketBag: "KANTONG DEPAN", frontPocketFacing: "FACING KANTONG DEPAN", backPocketBag: "KANTONG BELAKANG",
    backPocketFacing: "FACING KANTONG BELAKANG", backPocketInterfacing: "KAIN KERAS KANTONG BLK", backPocketWelt: "BIS KANTONG BELAKANG",
    flyFacing: "FACING RESLETING", flyExtension: "LIDAH RESLETING", beltLoops: "TALI IKAT PINGGANG",
  };
  const MAT = { fabric: "bahan utama", lining: "furing", interfacing: "kain keras", ribbing: "rib", contrast: "bahan kombinasi" };
  function cutText(cl) {
    if (!cl || !cl.materials) return "";
    const parts = [];
    for (const [mat, list] of Object.entries(cl.materials)) {
      for (const c of list) parts.push(`${c.cut}x ${MAT[mat] || mat}${c.onFold ? " (lipat)" : ""}${c.onBias ? " (serong)" : ""}`);
    }
    return "Potong " + parts.join(" + ");
  }

  // ---------- convert one drafted pattern into pieces ----------
  function toPieces(pattern) {
    const parts = pattern.parts[0], cut = pattern.setStores[0].get("cutlist") || {};
    const out = {};
    for (const [full, part] of Object.entries(parts)) {
      if (part.hidden || !part.paths.seam || part.paths.seam.hidden) continue;
      const short = full.split(".").pop();
      const net = ccw(clean(samplePath(part.paths.seam).flat()));
      if (net.length < 3) continue;
      let cutLine;
      if (part.paths.sa && !part.paths.sa.hidden) {
        const subs = samplePath(part.paths.sa);
        cutLine = ccw(clean(subs.flat()));
        if (Math.abs(area(cutLine)) < Math.abs(area(net))) cutLine = null; // open/partial SA: fall back
      }
      if (!cutLine) cutLine = offsetPoly(net, pattern.settings[0].sa / 10);
      const pc = Object.create(Piece.prototype);
      Object.assign(pc, { name: NAMES[short] || short.replace(/([A-Z])/g, " $1").toUpperCase(), cut: cutText(cut[full]), net, cutLine, notches: [], marks: [], align: [0, 0], labelRot: 0, fold: null });
      for (const s of Object.values(part.snippets)) {
        const p = cv(s.anchor);
        if (s.def === "notch") pc.notches.push({ p, count: 1 });
        else if (s.def === "bnotch") pc.notches.push({ p, count: 2 });
        else if (s.def === "button" || s.def === "buttonhole" || s.def === "snap-stud" || s.def === "snap-socket") pc.marks.push({ t: "btn", p });
      }
      for (const [k, path] of Object.entries(part.paths)) {
        if (path.hidden || k === "seam" || k === "sa") continue;
        if (/fold/i.test(k) && !/cutonfold/i.test(k)) { const s = samplePath(path)[0]; if (s && s.length > 1) pc.marks.push({ t: "line", pts: s, s: "lipat" }); }
      }
      const c = cut[full] || {};
      if (c.cutOnFold && c.cutOnFold.length === 2) {
        pc.fold = [cv(c.cutOnFold[0]), cv(c.cutOnFold[1])];
        if (pc.fold[0][1] < pc.fold[1][1]) pc.fold.reverse();
      }
      const b = pc.bbox();
      const gl = Object.entries(part.paths).find(([k]) => /grainline/.test(k));
      if (gl) { const s = samplePath(gl[1])[0]; pc.grain = [s[0], s[s.length - 1]]; }
      else { const cx = (b[0] + b[2]) / 2 + (pc.fold ? (b[2] - b[0]) * 0.15 : 0); pc.grain = [[cx, b[3] - Math.min(6, (b[3] - b[1]) * 0.2)], [cx, b[1] + Math.min(6, (b[3] - b[1]) * 0.2)]]; }
      const w = b[2] - b[0], h = b[3] - b[1];
      pc.label = [b[0] + Math.min(4, w * 0.15) + (pc.fold ? 1.5 : 0), b[1] + h * 0.55];
      if (w < 12 && h > w * 1.5) { pc.labelRot = 90; pc.label = [b[0] + w * 0.6, b[1] + Math.min(4, h * 0.1)]; }
      out[short] = pc;
    }
    return out;
  }

  // ---------- body measurements from a garment row ----------
  function baseModel(set, key, targetMM) {
    let best = null;
    for (const m of Object.values(set)) if (!best || Math.abs(m[key] - targetMM) < Math.abs(best[key] - targetMM)) best = m;
    return Object.assign({}, best);
  }
  const CIRC = ["chest", "neck", "biceps", "wrist", "waist", "hips", "seat", "knee", "heel", "head", "upperLeg", "ankle", "highBust", "underbust", "waistBack", "seatBack"];
  function scaleCirc(m, k) { for (const c of CIRC) if (m[c]) m[c] = Math.round(m[c] * k); return m; }

  function draft(Design, measurements, options, sa) {
    const p = new Design({ measurements, options, sa, complete: true, paperless: false });
    p.draft();
    return p;
  }
  const visPart = (p, short) => Object.entries(p.parts[0]).find(([k, v]) => k.endsWith("." + short) && !v.hidden && v.paths.seam)?.[1];
  const anyPart = (p, short) => Object.entries(p.parts[0]).find(([k, v]) => k.endsWith("." + short) && v.points && Object.keys(v.points).length)?.[1];
  const opt = (D, k) => { const o = D.patternConfig.options[k]; return o && typeof o === "object" ? (o.pct != null ? o.pct / 100 : o.mm != null ? o.mm : o.deg) : undefined; };

  // tops: fit chest ease, shoulder width, length, sleeve length
  function fitTop(D, row, p, cfg) {
    const ce0 = opt(D, "chestEase") || 0.1;
    const chestBody = (2 * row.chest * 10) / (1 + ce0);
    const m = baseModel(FS.cisMaleAdult, "chest", chestBody);
    scaleCirc(m, chestBody / m.chest);
    m.chest = Math.round(chestBody);
    const se = opt(D, "shoulderEase") || 0;
    if (row.shoulder) m.shoulderToShoulder = Math.round((row.shoulder * 10) / (1 + se));
    const o = Object.assign({}, cfg.options || {});
    const sa = p.sa * 10;
    let pat;
    const got = {};
    const measure = () => {
      pat = draft(D, m, o, sa);
      const back = visPart(pat, "back"), yoke = visPart(pat, "yoke");
      const fB = anyPart(pat, "back"), fF = anyPart(pat, cfg.frontPart || "front");
      got.length = (back ? bboxMM(back).h : 0) + (yoke ? bboxMM(yoke).h : 0);
      if (cfg.lengthFromHps && fB && fB.points.hps) got.length = (back ? bboxMM(back).y1 : 0) - fB.points.hps.y;
      const sl = visPart(pat, "sleeve"), cuff = visPart(pat, "cuff");
      got.sleeve = (sl ? bboxMM(sl).h : 0) + (cuff ? bboxMM(cuff).h * (cfg.cuffFolded ? 0.5 : 1) : 0);
      got.chest = fF && fB && fF.points.armhole && fB.points.armhole ? Math.abs(fF.points.armhole.x) + Math.abs(fB.points.armhole.x) : null;
      got.shoulder = fB && fB.points.shoulder ? 2 * Math.abs(fB.points.shoulder.x) : null;
    };
    // phase 1: body (chest, shoulder, length)
    for (let it = 0; it < 5; it++) {
      measure();
      let done = true;
      if (row.length && Math.abs(got.length - row.length * 10) > 2) { m.hpsToWaistBack = Math.round(m.hpsToWaistBack + (row.length * 10 - got.length)); done = false; }
      if (got.chest && Math.abs(got.chest - row.chest * 10) > 2) { o.chestEase = (1 + (o.chestEase != null ? o.chestEase : ce0)) * (row.chest * 10 / got.chest) - 1; done = false; }
      if (row.shoulder && got.shoulder && Math.abs(got.shoulder - row.shoulder * 10) > 2) { m.shoulderToShoulder = Math.round(m.shoulderToShoulder * row.shoulder * 10 / got.shoulder); done = false; }
      if (done) break;
    }
    // phase 2: sleeve length (secant on the sleeve option or on shoulderToWrist)
    if (row.sleeve) {
      const get = () => (cfg.sleeveOpt ? (o[cfg.sleeveOpt] != null ? o[cfg.sleeveOpt] : opt(D, cfg.sleeveOpt)) : m.shoulderToWrist);
      const set = (v) => { if (cfg.sleeveOpt) o[cfg.sleeveOpt] = Math.max(0.02, v); else m.shoulderToWrist = Math.round(v); };
      let prev = null;
      for (let it = 0; it < 6; it++) {
        if (it) measure(); else if (!pat) measure();
        const err = row.sleeve * 10 - got.sleeve;
        if (Math.abs(err) <= 2) break;
        const v = get();
        let nv = cfg.sleeveOpt ? v * (row.sleeve * 10 / got.sleeve) : v + err;
        if (prev && prev.v !== v && prev.h !== got.sleeve) nv = v + err * (v - prev.v) / (got.sleeve - prev.h);
        prev = { v, h: got.sleeve };
        set(nv);
      }
      measure();
    }
    return { pat, got };
  }

  // bottoms (pants & skirts)
  function fitBottom(D, row, p, cfg) {
    const se = opt(D, "seatEase") || 0.05, we = opt(D, "waistEase") || 0.02;
    const set = cfg.female ? FS.cisFemaleAdult : FS.cisMaleAdult;
    const key = row.hip ? (set[Object.keys(set)[0]].seat ? "seat" : "hips") : "waist";
    const target = row.hip ? (2 * row.hip * 10) / (1 + se) : (2 * row.waist * 10) / (1 + we);
    const m = baseModel(set, key, target);
    scaleCirc(m, target / m[key]);
    if (row.hip) { m.seat = Math.round((2 * row.hip * 10) / (1 + se)); m.hips = Math.round(m.seat * 0.92); }
    if (row.waist) m.waist = Math.round((2 * row.waist * 10) / (1 + we));
    const o = Object.assign({}, cfg.options || {});
    const sa = p.sa * 10;
    let pat, got = {}, prevL = null;
    for (let it = 0; it < 6; it++) {
      pat = draft(D, m, o, sa);
      const main = visPart(pat, cfg.mainPart || "front"), wb = visPart(pat, "waistband");
      const bandH = wb ? Math.min(bboxMM(wb).w, bboxMM(wb).h) / (cfg.bandFolded === false ? 1 : 2) : 0;
      const bb = bboxMM(main);
      got.length = (cfg.lengthFn ? cfg.lengthFn(main, bb) : bb.h) + bandH;
      let done = true;
      if (row.length && Math.abs(got.length - row.length * 10) > 3) {
        const k = cfg.lengthKey || "waistToFloor", v = m[k], err = row.length * 10 - got.length;
        let nv = v + err;
        if (prevL && prevL.v !== v && prevL.h !== got.length) nv = v + err * (v - prevL.v) / (got.length - prevL.h); // secant
        prevL = { v, h: got.length };
        m[k] = Math.round(nv); done = false;
      }
      const fork = main.points.fork;
      if (row.rise && fork) {
        got.rise = fork.y - bb.y0 + bandH;
        if (Math.abs(got.rise - row.rise * 10) > 3) { const k = row.rise * 10 / got.rise; m.crossSeamFront = Math.round(m.crossSeamFront * k); m.crossSeam = Math.round(m.crossSeam * k); done = false; }
      }
      if (row.opening && cfg.openingKey) {
        const back = visPart(pat, "back");
        const yHem = bb.y1 - 5;
        got.opening = (widthAt(main, yHem) + (back ? widthAt(back, bboxMM(back).y1 - 5) : 0)) / 2;
        if (got.opening && Math.abs(got.opening - row.opening * 10) > 3) { m[cfg.openingKey] = Math.round(m[cfg.openingKey] * row.opening * 10 / got.opening); done = false; }
      }
      if (done) break;
    }
    // waist & hip as implemented by the design's ease formula (flat = circumference / 2)
    if (row.waist) got.waist = (m.waist * (1 + (o.waistEase != null ? o.waistEase : we))) / 2;
    if (row.hip && m.seat) got.hip = (m.seat * (1 + (o.seatEase != null ? o.seatEase : se))) / 2;
    return { pat, got };
  }

  const r1 = (x) => (x == null ? "-" : Math.round(x * 10) / 10);
  function make(def) {
    return {
      name: def.name, desc: def.desc + " (pola FreeSewing, lisensi MIT)", source: "FreeSewing", fields: def.fields, chart: def.chart,
      params: [{ k: "sa", label: "Kampuh", def: 1 }],
      draft(row, p) {
        const D = FS[def.design];
        const { pat, got } = def.kind === "top" ? fitTop(D, row, p, def) : fitBottom(D, row, p, def);
        const pieces = toPieces(pat);
        const checks = def.fields.map((f) => [f.label + " (target / hasil)", got[f.k] != null ? `${row[f.k]} / ${r1(got[f.k] / 10)}` : `${row[f.k]} / -`]);
        return { pieces, checks };
      },
    };
  }

  const TOP = (extra) => [{ k: "chest", label: "Lebar dada" }, { k: "length", label: "Panjang badan" }].concat(extra);
  const MODELS = E.MODELS;
  Object.assign(MODELS, {
    fs_teagan: make({
      design: "Teagan", kind: "top", name: "Kaos (FreeSewing Teagan)", desc: "Kaos lengan pendek leher O, badan cut on fold",
      fields: TOP([{ k: "shoulder", label: "Lebar bahu" }, { k: "sleeve", label: "Panjang lengan" }]), sleeveOpt: "sleeveLength",
      chart: { S: { chest: 48, length: 68, shoulder: 44, sleeve: 19 }, M: { chest: 50, length: 70, shoulder: 46, sleeve: 20 }, L: { chest: 52, length: 72, shoulder: 48, sleeve: 21 }, XL: { chest: 54, length: 74, shoulder: 50, sleeve: 22 }, XXL: { chest: 56, length: 76, shoulder: 52, sleeve: 23 } },
    }),
    fs_simon: make({
      design: "Simon", kind: "top", name: "Kemeja (FreeSewing Simon)", desc: "Kemeja lengan panjang: yoke, kerah + kaki kerah, manset, plaket",
      fields: TOP([{ k: "shoulder", label: "Lebar bahu" }, { k: "sleeve", label: "Panjang lengan (incl. manset)" }]),
      chart: { S: { chest: 51, length: 71, shoulder: 44, sleeve: 59 }, M: { chest: 53, length: 73, shoulder: 45.5, sleeve: 60 }, L: { chest: 55, length: 75, shoulder: 47, sleeve: 61 }, XL: { chest: 57, length: 77, shoulder: 48.5, sleeve: 62 }, XXL: { chest: 59, length: 79, shoulder: 50, sleeve: 63 } },
    }),
    fs_sven: make({
      design: "Sven", kind: "top", name: "Sweater (FreeSewing Sven)", desc: "Sweatshirt crewneck dengan rib lengan & bawah", cuffFolded: true,
      fields: TOP([{ k: "shoulder", label: "Lebar bahu" }, { k: "sleeve", label: "Panjang lengan (incl. rib)" }]),
      chart: { S: { chest: 52, length: 66, shoulder: 46, sleeve: 60 }, M: { chest: 54, length: 68, shoulder: 48, sleeve: 61 }, L: { chest: 56, length: 70, shoulder: 50, sleeve: 62 }, XL: { chest: 58, length: 72, shoulder: 52, sleeve: 63 }, XXL: { chest: 60, length: 74, shoulder: 54, sleeve: 64 } },
    }),
    fs_hugo: make({
      design: "Hugo", kind: "top", name: "Hoodie (FreeSewing Hugo)", desc: "Hoodie raglan dengan kantong kanguru & tudung", cuffFolded: true, lengthFromHps: true,
      fields: TOP([{ k: "sleeve", label: "Panjang lengan raglan (incl. rib)" }]),
      chart: { S: { chest: 54, length: 66, sleeve: 78 }, M: { chest: 56, length: 68, sleeve: 80 }, L: { chest: 58, length: 70, sleeve: 82 }, XL: { chest: 60, length: 72, sleeve: 84 }, XXL: { chest: 62, length: 74, sleeve: 86 } },
    }),
    fs_charlie: make({
      design: "Charlie", kind: "bottom", name: "Celana Chino (FreeSewing Charlie)", desc: "Chino: resleting depan, kantong miring, kantong bobok belakang",
      fields: [{ k: "waist", label: "Lingkar pinggang (flat)" }, { k: "hip", label: "Lebar pinggul" }, { k: "length", label: "Panjang celana" }, { k: "rise", label: "Pesak depan" }, { k: "opening", label: "Lebar bawah" }],
      openingKey: "knee",
      chart: { "28": { waist: 37, hip: 49, length: 100, rise: 26, opening: 17 }, "30": { waist: 39.5, hip: 51, length: 101, rise: 26.5, opening: 17.5 }, "32": { waist: 42, hip: 53, length: 102, rise: 27, opening: 18 }, "34": { waist: 44.5, hip: 55, length: 103, rise: 27.5, opening: 18.5 }, "36": { waist: 47, hip: 57, length: 104, rise: 28, opening: 19 } },
    }),
    fs_paco: make({
      design: "Paco", kind: "bottom", name: "Celana Karet (FreeSewing Paco)", desc: "Celana pinggang karet/tali, kaki lurus atau jogger",
      fields: [{ k: "waist", label: "Lingkar pinggang (flat)" }, { k: "hip", label: "Lebar pinggul" }, { k: "length", label: "Panjang celana" }, { k: "rise", label: "Pesak depan" }, { k: "opening", label: "Lebar bawah" }],
      openingKey: "heel",
      chart: { S: { waist: 36, hip: 52, length: 98, rise: 29, opening: 20 }, M: { waist: 38, hip: 54, length: 100, rise: 30, opening: 21 }, L: { waist: 40, hip: 56, length: 102, rise: 31, opening: 22 }, XL: { waist: 42, hip: 58, length: 104, rise: 32, opening: 23 }, XXL: { waist: 44, hip: 60, length: 106, rise: 33, opening: 24 } },
    }),
    fs_penelope: make({
      design: "Penelope", kind: "bottom", name: "Rok Pensil (FreeSewing Penelope)", desc: "Rok pensil dengan kup, ban pinggang & belahan belakang", female: true, lengthKey: "waistToKnee",
      fields: [{ k: "waist", label: "Lingkar pinggang (flat)" }, { k: "hip", label: "Lebar pinggul" }, { k: "length", label: "Panjang rok" }],
      chart: { S: { waist: 35, hip: 47, length: 60 }, M: { waist: 37, hip: 49, length: 61 }, L: { waist: 39, hip: 51, length: 62 }, XL: { waist: 41, hip: 53, length: 63 }, XXL: { waist: 43, hip: 55, length: 64 } },
    }),
    fs_sandy: make({
      design: "Sandy", kind: "bottom", name: "Rok Lingkar (FreeSewing Sandy)", desc: "Rok lingkar/payung dengan ban pinggang", female: true, mainPart: "skirt",
      lengthFn: (main) => { // ring sector: hem radius - waist radius
        const P = main.points, c = P.centerRotated || P.center, i = P.in1Rotated || P.in1, e = P.ex1Rotated || P.ex1;
        return Math.hypot(e.x - c.x, e.y - c.y) - Math.hypot(i.x - c.x, i.y - c.y);
      },
      fields: [{ k: "waist", label: "Lingkar pinggang (flat)" }, { k: "length", label: "Panjang rok" }],
      chart: { S: { waist: 35, length: 70 }, M: { waist: 37, length: 70 }, L: { waist: 39, length: 72 }, XL: { waist: 41, length: 72 }, XXL: { waist: 43, length: 74 } },
    }),
  });
})(typeof window !== "undefined" ? window : globalThis);
