/* Pattern Maker — read a client's size chart (Excel/CSV/OCR text) and guess the model.
   Pure functions: no DOM. Used by app.js (browser) and tools/ (node tests). */
(function (root) {
  "use strict";

  const SIZE_RE = /^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|[2-6]L|ALL ?SIZE|ALLSIZE|FREE ?SIZE|FS)$/i;

  // measurement words -> candidate field keys (the first key the model has wins)
  const SYN = [
    { keys: ["opening"], words: ["sleeve opening", "lebar lengan", "lebar ujung", "ujung lengan", "lebar ujung lengan", "lingkar ujung lengan", "leg opening", "bottom opening", "lingkar bawah celana"] },
    { keys: ["cuff", "opening"], words: ["cuff", "manset"] },
    { keys: ["chest"], words: ["lebar badan", "lebar dada", "lingkar dada", "chest", "dada", "bust", "pit to pit", "p2p", "body width", "width", "ld", "lebar"] },
    { keys: ["shoulder"], words: ["lebar bahu", "pundak bahu", "pundak", "shoulder", "bahu", "lb"] },
    { keys: ["sleeve"], words: ["panjang lengan", "panjang tangan", "pjg lengan", "pjg tangan", "sleeve length", "sleeve", "lengan", "tangan", "pl"] },
    { keys: ["waist"], words: ["lingkar pinggang", "pinggang", "waist", "lp"] },
    { keys: ["hip"], words: ["lingkar pinggul", "lebar pinggul", "pinggul", "panggul", "hips", "hip"] },
    { keys: ["rise"], words: ["pesak depan", "front rise", "pesak", "rise"] },
    { keys: ["thigh"], words: ["lebar paha", "lingkar paha", "paha", "thigh"] },
    { keys: ["hemw", "opening"], words: ["lebar bawah", "lingkar bawah", "bottom width", "hem width", "sweep", "hem", "bawah"] },
    { keys: ["length"], words: ["panjang badan", "pjg badan", "panjang baju", "panjang celana", "panjang rok", "body length", "total length", "length", "panjang", "pb"] },
  ];

  const MODEL_WORDS = [
    ["coach", ["coach jacket", "coach", "jaket coach", "windbreaker"]],
    ["fs_hugo", ["hoodie", "hoody", "jaket hoodie", "sweater hoodie"]],
    ["fs_sven", ["sweatshirt", "crewneck", "crew neck", "sweater"]],
    ["fs_simon", ["kemeja", "shirt lengan panjang", "button up", "button-up", "long sleeve shirt", "flannel", "flanel"]],
    ["fs_teagan", ["kaos", "t-shirt", "tshirt", "t shirt", "tee", "oblong", "jersey"]],
    ["fs_charlie", ["chino", "chinos", "celana bahan", "trouser", "trousers", "slack"]],
    ["fs_paco", ["celana karet", "jogger", "kulot", "sweatpants", "celana", "pants", "cargo"]],
    ["fs_penelope", ["rok pensil", "pencil skirt", "rok span", "rok spam"]],
    ["fs_sandy", ["rok lingkar", "rok payung", "circle skirt", "rok mekar"]],
    ["rok", ["rok a", "a-line", "a line", "rok", "skirt"]],
    ["coach", ["jacket", "jaket"]],
    ["fs_simon", ["shirt"]],
  ];

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  // "57cm" "57,5" "élcm" (OCR) -> number | null
  function num(tok) {
    let t = norm(tok).toLowerCase();
    if (!t) return null;
    const hadDigit = /\d/.test(t);
    const stripped = t.replace(/(cm|crn|em|cn|om|inch|in|"|”)$/g, "");
    if (!hadDigit && (stripped === t || stripped.length > 3 || !stripped)) return null; // OCR digits only when a unit follows
    t = stripped;
    t = t.replace(/[éèêë]/g, "6").replace(/[lI|!]/g, "1").replace(/[oO]/g, "0").replace(/[zZ]/g, "2").replace(/[bB]/g, "8").replace(/[sS§]/g, "5").replace(/[gq]/g, "9");
    t = t.replace(",", ".").replace(/[^0-9.\-]/g, "");
    if (!/\d/.test(t)) return null;
    const range = t.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    const v = parseFloat(t);
    return isFinite(v) ? v : null;
  }
  const isSize = (t) => SIZE_RE.test(norm(t).replace(/\s+/g, " "));
  const sizeName = (t) => norm(t).toUpperCase().replace(/\s+/g, "");

  // find a measurement label inside text -> {keys, word, pos}
  function matchLabel(text) {
    const s = " " + norm(text).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ") + " ";
    let best = null;
    for (const e of SYN) for (const w of e.words) {
      const i = s.indexOf(" " + w + " ");
      if (i >= 0 && (!best || w.length > best.word.length)) best = { keys: e.keys, word: w, pos: i };
    }
    return best;
  }
  function allLabels(text) {
    const s = " " + norm(text).toLowerCase().replace(/[^a-z0-9 ]/g, " ") + " ";
    const found = [];
    const cand = [];
    for (const e of SYN) for (const w of e.words) cand.push([e, w]);
    cand.sort((a, b) => b[1].length - a[1].length);
    for (const [e, w] of cand) {
      let i = s.indexOf(" " + w + " ");
      while (i >= 0) {
        if (!found.some((f) => i < f.pos + f.word.length + 1 && f.pos < i + w.length + 1)) found.push({ keys: e.keys, word: w, pos: i });
        i = s.indexOf(" " + w + " ", i + 1);
      }
    }
    return found.sort((a, b) => a.pos - b.pos);
  }

  // ---------- grid (from Excel/CSV) ----------
  // grid: array of rows, each an array of cell strings
  function parseGrid(grid) {
    grid = grid.map((r) => (r || []).map(norm)).filter((r) => r.some((c) => c));
    // A) sizes across a header row, measurements down
    for (let r = 0; r < grid.length; r++) {
      const cols = [];
      const numHdr = /^(size|sizes|ukuran|uk|no)$/i.test(grid[r][0] || "");
      grid[r].forEach((c, j) => { if (isSize(c) || (numHdr && j > 0 && /^(2[4-9]|3\d|4[0-8])$/.test(c))) cols.push(j); });
      if (cols.length >= 1 && (cols.length >= 2 || grid[r].length <= 3)) {
        const rows = [];
        for (let k = r + 1; k < grid.length; k++) {
          const labelCell = grid[k].slice(0, cols[0]).join(" ") || grid[k][0];
          const lab = matchLabel(labelCell);
          if (!lab) continue;
          rows.push({ lab, label: labelCell, values: cols.map((j) => num(grid[k][j])) });
        }
        if (rows.length) return { sizes: cols.map((j) => sizeName(grid[r][j])), rows };
      }
    }
    // B) sizes down a column, measurements across
    for (let j = 0; j < 4; j++) {
      const sizeRows = [];
      grid.forEach((row, i) => { if (isSize(row[j])) sizeRows.push(i); });
      if (sizeRows.length >= 2) {
        const hr = sizeRows[0] - 1;
        if (hr < 0) continue;
        const rows = [];
        grid[hr].forEach((h, c) => {
          if (c === j) return;
          const lab = matchLabel(h);
          if (lab) rows.push({ lab, label: h, values: sizeRows.map((i) => num(grid[i][c])) });
        });
        if (rows.length) return { sizes: sizeRows.map((i) => sizeName(grid[i][j])), rows };
      }
    }
    return null;
  }

  // ---------- OCR text ----------
  const LADDER = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL"];
  const LADDER2 = { XXL: "2XL", XXXL: "3XL" };
  function extendSizes(sizes, n) {
    if (sizes.length >= n) return sizes.slice(0, n);
    const norm2 = (x) => ({ "2XL": "XXL", "3XL": "XXXL" }[x] || x);
    const i = LADDER.indexOf(norm2(sizes[0]));
    if (i < 0) return sizes;
    const use2 = sizes.some((x) => /^\dXL$/.test(x));
    const out = LADDER.slice(i, i + n).map((x) => (use2 && LADDER2[x] ? LADDER2[x] : x));
    return out.length === n ? out : sizes;
  }
  const UNIT_WORDS = /^(size|sizes|ukuran|uk|cm|em|crn|inch|in|:|-|—|tabel|chart)$/i;

  function parseText(text) {
    const lines = String(text).split(/\r?\n/).map((l) => norm(l.replace(/[|[\]{}()“”"_=:;]/g, " "))).filter(Boolean);
    // A) a line holding the sizes, then "LABEL v v v" lines
    for (let i = 0; i < lines.length; i++) {
      const toks = lines[i].split(" ");
      const numHdr = /^(size|sizes|ukuran|uk|no)\b/i.test(toks[0] || "");
      const sz = toks.filter((t) => isSize(t) || (numHdr && /^(2[4-9]|3\d|4[0-8])$/.test(t)));
      const other = toks.filter((t) => !isSize(t) && !UNIT_WORDS.test(t) && !(numHdr && /^\d+$/.test(t)));
      if (sz.length >= 2 && other.length <= Math.max(2, sz.length - 1)) {
        let sizes = sz.map(sizeName);
        if (new Set(sizes).size < sizes.length) sizes = extendSizes([sizes[0]], sizes.length);
        const rows = [];
        for (let k = i + 1; k < lines.length; k++) {
          const t = lines[k].split(" ");
          const vals = [];
          let p = t.length - 1;
          while (p >= 0 && vals.length < 12 && num(t[p]) !== null) { vals.unshift(num(t[p])); p--; }
          const label = t.slice(0, p + 1).join(" ");
          const lab = matchLabel(label);
          if (!lab || vals.length < 2) continue;
          rows.push({ lab, label, values: vals });
        }
        if (rows.length) {
          // more numbers than readable size names (OCR noise in the header): extend the size ladder
          const counts = rows.map((r) => r.values.length).sort((a, b) => a - b);
          const n = counts[Math.floor(counts.length / 2)];
          if (n > sizes.length) sizes = extendSizes(sizes, n);
          for (const r of rows) { r.values = r.values.slice(-sizes.length); while (r.values.length < sizes.length) r.values.unshift(null); }
          return { sizes, rows };
        }
      }
    }
    // C) no readable size header: labelled rows with the same count of numbers -> S, M, L, ...
    {
      const rows = [];
      for (const l of lines) {
        const t = l.split(" "), vals = [];
        let p = t.length - 1;
        while (p >= 0 && vals.length < 12 && num(t[p]) !== null) { vals.unshift(num(t[p])); p--; }
        const lab = matchLabel(t.slice(0, p + 1).join(" "));
        if (lab && vals.length >= 3) rows.push({ lab, label: t.slice(0, p + 1).join(" "), values: vals });
      }
      if (rows.length >= 2) {
        const counts = rows.map((r) => r.values.length).sort((a, b) => a - b);
        const n = counts[Math.floor(counts.length / 2)];
        const good = rows.filter((r) => r.values.length === n);
        if (good.length >= 2) return { sizes: extendSizes(["S"], n), rows: good, guessedSizes: true };
      }
    }
    // B) lines starting with a size: "M 59 68 50 62", header line before them
    const sizeLines = lines.map((l, i) => [l, i]).filter(([l]) => isSize(l.split(" ")[0]));
    if (sizeLines.length >= 2) {
      const first = sizeLines[0][1];
      for (let h = first - 1; h >= Math.max(0, first - 3); h--) {
        const heads = allLabels(lines[h]);
        if (heads.length < 1) continue;
        const sizes = [], cols = heads.map(() => []);
        for (const [l] of sizeLines) {
          const t = l.split(" ");
          sizes.push(sizeName(t[0]));
          const nums = t.slice(1).map(num).filter((v) => v !== null);
          heads.forEach((_, c) => cols[c].push(nums[c] != null ? nums[c] : null));
        }
        return { sizes, rows: heads.map((hd, c) => ({ lab: hd, label: hd.word, values: cols[c] })) };
      }
    }
    return null;
  }

  // ---------- model guess ----------
  function guessModel(text, table, models) {
    const s = " " + String(text || "").toLowerCase().replace(/[^a-z0-9\- ]/g, " ") + " ";
    for (const [id, words] of MODEL_WORDS) for (const w of words) if (models[id] && s.includes(" " + w + " ")) return { id, why: `ada tulisan "${w}"` };
    if (table) {
      const ks = new Set(table.rows.flatMap((r) => r.lab.keys.slice(0, 1)));
      if (ks.has("rise") || ks.has("thigh")) return { id: models.fs_paco ? "fs_paco" : "celana", why: "ada ukuran pesak/paha" };
      if (ks.has("waist") && ks.has("hip")) return { id: "rok", why: "ada ukuran pinggang & pinggul" };
      if (ks.has("cuff")) return { id: models.fs_simon ? "fs_simon" : "kemeja", why: "ada ukuran manset" };
      if (ks.has("chest") && ks.has("sleeve")) return null;
    }
    return null;
  }

  // plausible raw values per field (before halving a full circumference)
  const RANGE = { chest: [25, 180], waist: [20, 160], hip: [30, 180], thigh: [15, 100], opening: [8, 90], cuff: [8, 40], length: [15, 140], shoulder: [25, 75], sleeve: [5, 95], rise: [15, 50], hemw: [20, 200] };
  // OCR slips like "230" for 23 or "558" for 58: repair using the field range and the neighbours
  function repairRow(vals, key) {
    const [lo, hi] = RANGE[key] || [0, 1e9];
    const cands = (v) => { const s = String(v).replace(".", ""); return [v, v / 10, parseFloat(s.slice(1)), parseFloat(s.slice(0, -1)), v / 100].filter((c) => isFinite(c) && c > 0); };
    const expect = (arr, i) => {
      const L = arr.slice(0, i).filter((x) => x != null), R = arr.slice(i + 1).filter((x) => x != null);
      const l = L[L.length - 1], r = R[0];
      if (l != null && r != null) return (l + r) / 2;
      const ok = arr.filter((x) => x != null).sort((a, b) => a - b);
      return l != null ? l : r != null ? r : ok[Math.floor(ok.length / 2)];
    };
    let fixed = 0;
    let out = vals.map((v) => (v != null && (v < lo || v > hi) ? NaN : v));
    // 1) out-of-range values
    out = out.map((v, i) => {
      if (!Number.isNaN(v)) return v;
      fixed++;
      const e = expect(out.map((x) => (Number.isNaN(x) ? null : x)), i);
      const ok = cands(vals[i]).filter((c) => c >= lo && c <= hi);
      if (!ok.length) return null;
      return e == null ? ok[0] : ok.sort((p, q) => Math.abs(p - e) - Math.abs(q - e))[0];
    });
    // 2) values far from the row median
    const good = out.filter((x) => x != null).sort((p, q) => p - q);
    if (good.length >= 3) {
      const med = good[Math.floor(good.length / 2)], bad = (x) => x > med * 1.35 || x < med * 0.7;
      out = out.map((v, i) => {
        if (v == null || !bad(v)) return v;
        fixed++;
        const e = expect(out.map((x, j) => (j === i || (x != null && bad(x)) ? null : x)), i);
        const ok = cands(vals[i] != null ? vals[i] : v).filter((c) => c >= lo && c <= hi && !bad(c));
        return ok.length ? ok.sort((p, q) => Math.abs(p - e) - Math.abs(q - e))[0] : null;
      });
    }
    fixed = out.filter((v, i) => v != null && v !== vals[i]).length;
    return { vals: out, fixed };
  }

  // ---------- table -> model chart ----------
  // returns {chart, notes[]}; fills missing fields from the model's example chart
  function toChart(table, model, opts = {}) {
    const notes = [];
    if (table.guessedSizes) notes.push(`Nama size tidak terbaca → ditebak ${table.sizes.join(", ")}. Ganti di tabel kalau beda.`);
    const fieldKeys = model.fields.map((f) => f.k);
    const byKey = {};
    for (const r of table.rows) {
      const k = r.lab.keys.find((x) => fieldKeys.includes(x));
      if (!k || byKey[k]) continue;
      byKey[k] = r;
    }
    let factor = 1;
    if (opts.unit === "inch") { factor = 2.54; notes.push("Angka dikonversi dari inch ke cm."); }
    const sizes = table.sizes;
    const ex = model.chart, exSizes = Object.keys(ex);
    const exFor = (s, i) => ex[s] || ex[exSizes[Math.min(exSizes.length - 1, Math.round(i * (exSizes.length - 1) / Math.max(1, sizes.length - 1)))]];
    const chart = {};
    sizes.forEach((s, i) => (chart[s] = {}));
    for (const f of model.fields) {
      const r = byKey[f.k];
      if (!r) {
        sizes.forEach((s, i) => (chart[s][f.k] = exFor(s, i)[f.k]));
        notes.push(`"${f.label}" tidak ada di file → diisi angka contoh, mohon dicek.`);
        continue;
      }
      const rep = repairRow(r.values, f.k);
      if (rep.fixed) notes.push(`"${f.label}": ${rep.fixed} angka sepertinya salah baca → sudah dikoreksi, mohon dicek.`);
      let v = rep.vals.map((x) => (x == null ? null : Math.round(x * factor * 10) / 10));
      // fill gaps by interpolation
      const gaps = v.map((x, i) => (x == null ? i : -1)).filter((i) => i >= 0);
      if (gaps.length && gaps.length < v.length) {
        v = v.map((x, i) => {
          if (x != null) return x;
          let a = i - 1; while (a >= 0 && v[a] == null) a--;
          let b = i + 1; while (b < v.length && v[b] == null) b++;
          if (a >= 0 && b < v.length) return Math.round((v[a] + (v[b] - v[a]) * (i - a) / (b - a)) * 10) / 10;
          if (a >= 1) return Math.round((2 * v[a] - v[a - 1]) * 10) / 10;
          if (b < v.length - 1) return Math.round((2 * v[b] - v[b + 1]) * 10) / 10;
          return v[a >= 0 ? a : b];
        });
        notes.push(`"${f.label}": ${gaps.length} angka tidak terbaca → diisi perkiraan, mohon dicek.`);
      }
      // circumference given instead of flat?
      const flatMax = { chest: 78, waist: 52, hip: 75, thigh: 45, opening: 45, cuff: 18 }[f.k];
      const isLingkar = /lingkar|circumference|keliling/i.test(r.label) && !/flat/i.test(f.label + r.label) && f.k !== "length";
      if ((flatMax && v.every((x) => x != null) && v.reduce((a, b) => a + b, 0) / v.length > flatMax) || (isLingkar && v.every((x) => x != null) && v[0] > 20)) {
        v = v.map((x) => Math.round(x / 2 * 10) / 10);
        notes.push(`"${f.label}" sepertinya lingkar penuh → dibagi 2 jadi ukuran flat.`);
      }
      sizes.forEach((s, i) => (chart[s][f.k] = v[i] != null ? v[i] : exFor(s, i)[f.k]));
    }
    return { chart, notes, matched: Object.keys(byKey) };
  }

  function detectUnit(text) {
    const t = String(text || "").toLowerCase();
    const cm = (t.match(/\d\s*cm\b/g) || []).length, inch = (t.match(/\d\s*(inch|in\b|")/g) || []).length;
    return inch > cm ? "inch" : "cm";
  }

  root.PolaImport = { parseGrid, parseText, guessModel, toChart, detectUnit, num, isSize };
})(typeof window !== "undefined" ? window : globalThis);
