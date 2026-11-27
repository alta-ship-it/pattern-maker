(function () {
  "use strict";
  const { MODELS } = window.PolaEngine;
  const P = window.PolaPDF;
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  let modelId = store.get("pola:model") || "coach";
  if (!MODELS[modelId]) modelId = "coach";
  let state = load(modelId);

  function load(id) {
    const M = MODELS[id];
    const saved = store.get("pola:" + id);
    const params = {}; M.params.forEach((p) => (params[p.k] = p.def));
    if (saved && saved.chart && Object.keys(saved.chart).length) return { chart: saved.chart, params: Object.assign(params, saved.params || {}) };
    return { chart: clone(M.chart), params };
  }
  const save = () => store.set("pola:" + modelId, state);

  function renderModels() {
    const groups = [["Pola FreeSewing (sudah teruji)", (M) => M.source === "FreeSewing"], ["Pola Pattern Maker", (M) => M.source !== "FreeSewing"]];
    $("models").innerHTML = "";
    for (const [title, test] of groups) {
      const h = document.createElement("div"); h.className = "grp"; h.textContent = title; $("models").appendChild(h);
      const row = document.createElement("div"); row.className = "pills"; $("models").appendChild(row);
      for (const [id, M] of Object.entries(MODELS)) {
        if (!test(M)) continue;
        const b = document.createElement("button");
        b.textContent = M.name.replace(/ \(FreeSewing (\w+)\)/, " · $1"); b.className = id === modelId ? "on" : "";
        b.onclick = () => { modelId = id; store.set("pola:model", id); state = load(id); renderAll(); };
        row.appendChild(b);
        if (id === modelId) requestAnimationFrame(() => { row.scrollLeft = Math.max(0, b.offsetLeft - row.offsetLeft - 16); });
      }
    }
    $("desc").textContent = MODELS[modelId].desc;
  }

  function renderChart() {
    const M = MODELS[modelId], t = $("chart");
    let h = "<tr><th>Size</th>" + M.fields.map((f) => `<th>${f.label}</th>`).join("") + "<th></th></tr>";
    for (const s of Object.keys(state.chart)) {
      h += `<tr><td><input class="sz" data-size="${s}" value="${s}"></td>` +
        M.fields.map((f) => `<td><input type="number" step="0.5" inputmode="decimal" data-s="${s}" data-k="${f.k}" value="${state.chart[s][f.k]}"></td>`).join("") +
        `<td><button class="x" data-del="${s}" title="Hapus size">×</button></td></tr>`;
    }
    t.innerHTML = h;
    t.querySelectorAll("input[data-k]").forEach((inp) => inp.addEventListener("change", () => {
      const v = parseFloat(inp.value.replace(",", "."));
      if (!isNaN(v)) { state.chart[inp.dataset.s][inp.dataset.k] = v; save(); update(); }
    }));
    t.querySelectorAll("input.sz").forEach((inp) => inp.addEventListener("change", () => {
      const old = inp.dataset.size, nw = inp.value.trim().toUpperCase();
      if (!nw || (nw !== old && state.chart[nw])) { inp.value = old; return; }
      const next = {};
      for (const [k, v] of Object.entries(state.chart)) next[k === old ? nw : k] = v;
      state.chart = next; save(); renderChart(); update();
    }));
    t.querySelectorAll("button[data-del]").forEach((b) => b.onclick = () => {
      if (Object.keys(state.chart).length <= 1) return;
      delete state.chart[b.dataset.del]; save(); renderChart(); update();
    });
  }

  function renderParams() {
    const M = MODELS[modelId];
    $("params").innerHTML = M.params.map((p) => `<div><label>${p.label} (${p.k === "snaps" ? "buah" : "cm"})</label><input type="number" step="0.5" data-p="${p.k}" value="${state.params[p.k]}"></div>`).join("");
    $("params").querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
      const v = parseFloat(inp.value.replace(",", "."));
      if (!isNaN(v)) { state.params[inp.dataset.p] = v; save(); update(); }
    }));
  }

  let lastRun = null, upTimer = null;
  function update() {
    clearTimeout(upTimer);
    $("checks").style.opacity = $("preview").style.opacity = 0.4;
    upTimer = setTimeout(updateNow, 30);
  }
  function updateNow() {
    $("checks").style.opacity = $("preview").style.opacity = 1;
    const M = MODELS[modelId];
    $("err").textContent = "";
    const sizes = Object.keys(state.chart);
    const sel = $("pvSize"), cur = sel.value;
    sel.innerHTML = `<option value="">Semua size (bertumpuk)</option>` + sizes.map((s) => `<option ${s === cur ? "selected" : ""}>${s}</option>`).join("");
    $("legend").innerHTML = sizes.map((s, i) => `<span style="--c:${P.COLORS[i % P.COLORS.length]}">${s}</span>`).join("");
    try {
      const run = P.runModel(M, state.chart, state.params);
      lastRun = { run, key: JSON.stringify([modelId, state]) };
      $("preview").innerHTML = P.previewSVG(M, state.chart, state.params, { width: 150, size: sel.value || null, run });
      const rows = run.results[sizes[0]].checks.map((c, i) => `<tr><td>${c[0]}</td>` + sizes.map((s) => `<td>${run.results[s].checks[i][1]}</td>`).join("") + "</tr>");
      $("checks").innerHTML = "<tr><th>Ukuran</th>" + sizes.map((s, i) => `<th style="color:${P.COLORS[i % P.COLORS.length]}">${s}</th>`).join("") + "</tr>" + rows.join("");
      $("dlPlot").disabled = $("dlA4").disabled = false;
    } catch (e) {
      $("preview").innerHTML = "";
      $("err").textContent = "Pola tidak bisa dibuat dengan ukuran ini. Cek lagi angka di size chart.\n(" + e.message + ")";
      $("dlPlot").disabled = $("dlA4").disabled = true;
    }
  }

  function renderAll() { renderModels(); renderChart(); renderParams(); update(); }

  $("pvSize").onchange = update;
  $("addSize").onclick = () => {
    const sizes = Object.keys(state.chart), last = state.chart[sizes[sizes.length - 1]];
    const name = (prompt("Nama size baru (mis. 3XL):", "") || "").trim().toUpperCase();
    if (!name || state.chart[name]) return;
    const prev = sizes.length > 1 ? state.chart[sizes[sizes.length - 2]] : last;
    const row = {};
    for (const k of Object.keys(last)) row[k] = Math.round((last[k] + (last[k] - prev[k])) * 10) / 10;
    state.chart[name] = row; save(); renderChart(); update();
  };
  $("reset").onclick = () => {
    if (!confirm("Kembalikan size chart & pengaturan ke contoh awal?")) return;
    store.set("pola:" + modelId, null); state = load(modelId); renderAll();
  };
  const runFor = () => (lastRun && lastRun.key === JSON.stringify([modelId, state]) ? lastRun.run : undefined);
  const fname = (kind) => `Pola_${MODELS[modelId].name.replace(/\s+/g, "_")}_${Object.keys(state.chart).join("-")}_${kind}.pdf`;
  $("dlPlot").onclick = () => {
    try { P.plotterPDF(MODELS[modelId], state.chart, state.params, parseFloat($("plotW").value), { refs, run: runFor() }).doc.save(fname("PLOTTER")); }
    catch (e) { $("err").textContent = "Gagal membuat PDF: " + e.message; }
  };
  $("dlA4").onclick = () => {
    try { P.a4PDF(MODELS[modelId], state.chart, state.params, { refs, run: runFor() }).doc.save(fname("A4")); }
    catch (e) { $("err").textContent = "Gagal membuat PDF: " + e.message; }
  };

  // ================= UPLOAD FROM CLIENT =================
  const I = window.PolaImport;
  const LIBS = {
    xlsx: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
    tess: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    pdf: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
    pdfWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  };
  const loaded = {};
  function loadScript(url) {
    if (!loaded[url]) loaded[url] = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = url; s.onload = res;
      s.onerror = () => { delete loaded[url]; rej(new Error("Gagal memuat " + url.split("/")[2] + " — cek koneksi internet")); };
      document.head.appendChild(s);
    });
    return loaded[url];
  }
  let refs = [];      // reference pictures for the PDFs: {data, w, h, type, name}
  let undoState = null;
  let ocrWorker = null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function status(msg, prog) {
    $("upStatus").innerHTML = msg ? esc(msg) + (prog != null ? `<div class="bar"><i style="width:${Math.round(prog * 100)}%"></i></div>` : "") : "";
  }

  function canvasFromImage(img, minW, maxW) {
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    let sc = 1;
    if (minW && w < minW) sc = minW / w;
    if (maxW && w * sc > maxW) sc = maxW / w;
    const c = document.createElement("canvas"); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function refFromCanvas(c, name) {
    const small = c.width > 1400 ? canvasFromImage(c, 0, 1400) : c;
    return { data: small.toDataURL("image/jpeg", 0.85), w: small.width, h: small.height, type: "JPEG", name };
  }
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { res(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      img.onerror = () => rej(new Error("Gambar tidak bisa dibuka: " + file.name));
      img.src = url;
    });
  }
  async function ocr(canvas, label) {
    await loadScript(LIBS.tess);
    if (!ocrWorker) {
      status("Menyiapkan pembaca tulisan (OCR)… pertama kali agak lama", 0);
      ocrWorker = await window.Tesseract.createWorker("eng", 1, {
        logger: (m) => { if (m.status === "recognizing text") status(`Membaca tulisan di ${label}…`, m.progress); },
      });
      await ocrWorker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    }
    status(`Membaca tulisan di ${label}…`, 0);
    const { data } = await ocrWorker.recognize(canvas);
    return data.text || "";
  }
  function pdfLines(content) {
    const rows = new Map();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push([it.transform[4], it.str.trim()]);
    }
    return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(" ")).join("\n");
  }

  async function readFile(f, out) {
    const name = f.name || "file", ext = name.toLowerCase().split(".").pop();
    if (["xlsx", "xls", "csv", "ods"].includes(ext)) {
      status(`Membaca ${name}…`);
      await loadScript(LIBS.xlsx);
      const wb = ext === "csv" ? window.XLSX.read(await f.text(), { type: "string" }) : window.XLSX.read(await f.arrayBuffer());
      for (const sn of wb.SheetNames) {
        const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: "" });
        const text = grid.map((r) => r.join(" ")).join("\n");
        out.texts.push(sn + "\n" + text);
        const t = I.parseGrid(grid) || I.parseText(text);
        if (t) out.tables.push({ t, text, src: `${name} (${sn})` });
      }
    } else if (ext === "pdf" || f.type === "application/pdf") {
      status(`Membuka PDF ${name}…`);
      await loadScript(LIBS.pdf);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
      const pdf = await window.pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
      const pages = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
        const page = await pdf.getPage(i);
        const text = pdfLines(await page.getTextContent());
        out.texts.push(text);
        const t = I.parseText(text);
        if (t) out.tables.push({ t, text, src: `${name} hal. ${i}` });
        const vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(3, 1800 / vp0.width) });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        pages.push(c);
        if (i === 1) out.refs.push(refFromCanvas(c, `${name} hal. 1`));
      }
      if (!out.tables.length) {
        for (let i = 0; i < Math.min(pages.length, 2); i++) {
          const text = await ocr(pages[i], `${name} hal. ${i + 1}`);
          out.texts.push(text);
          const t = I.parseText(text);
          if (t) { out.tables.push({ t, text, src: `${name} hal. ${i + 1} (foto)` }); break; }
        }
      }
    } else if (f.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "gif", "bmp"].includes(ext)) {
      const img = await loadImage(f);
      const text = await ocr(canvasFromImage(img, 1600, 3000), name);
      out.texts.push(text);
      const t = I.parseText(text);
      if (t) out.tables.push({ t, text, src: name });
      else out.refs.push(refFromCanvas(canvasFromImage(img, 0, 1400), name)); // no table: treat as mockup
    } else {
      out.skipped.push(name);
    }
  }

  async function handleFiles(files) {
    files = [...files];
    if (!files.length) return;
    const out = { texts: files.map((f) => f.name), tables: [], refs: [], skipped: [] };
    $("upResult").innerHTML = "";
    try {
      for (const f of files) {
        try { await readFile(f, out); }
        catch (e) { out.skipped.push(`${f.name} (${e.message})`); }
      }
    } finally { status(""); }
    refs = refs.concat(out.refs).slice(-6);
    renderRefs();
    const allText = out.texts.join("\n");
    const best = out.tables.sort((a, b) => b.t.rows.length - a.t.rows.length)[0];
    const guess = I.guessModel(allText, best && best.t, MODELS);
    const before = { modelId, state: clone(state) };
    let html = "";
    if (guess && guess.id !== modelId) { modelId = guess.id; store.set("pola:model", modelId); state = load(modelId); }
    const M = MODELS[modelId];
    if (best) {
      const unit = I.detectUnit(best.text);
      const res = I.toChart(best.t, M, { unit });
      state.chart = res.chart; save();
      html += `<div class="result${res.notes.length ? " warn" : ""}"><b>✓ Size chart terbaca</b> dari ${esc(best.src)}: size ${esc(Object.keys(res.chart).join(", "))}.<br>` +
        `Model: <b>${esc(M.name)}</b> ${guess ? `(${esc(guess.why)})` : "(tidak terdeteksi, pakai model yang dipilih — ganti di langkah 1 kalau salah)"}.` +
        (res.notes.length ? `<ul>${res.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "") +
        `<div class="row"><button class="btn" id="undo">Batalkan</button></div></div>`;
    } else {
      html += `<div class="result warn"><b>Size chart tidak terbaca otomatis.</b> Silakan isi angkanya manual di tabel.` +
        (guess ? `<br>Model diganti ke <b>${esc(M.name)}</b> (${esc(guess.why)}).` : "") +
        (out.refs.length ? `<br>Gambar disimpan sebagai referensi dan ikut dicetak di PDF.` : "") +
        (guess ? `<div class="row"><button class="btn" id="undo">Batalkan</button></div>` : "") + `</div>`;
    }
    if (out.skipped.length) html += `<p class="err">Tidak bisa dibaca: ${esc(out.skipped.join(", "))}</p>`;
    $("upResult").innerHTML = html;
    undoState = before;
    const u = $("undo");
    if (u) u.onclick = () => {
      modelId = undoState.modelId; state = undoState.state; store.set("pola:model", modelId); save();
      $("upResult").innerHTML = ""; renderAll();
    };
    renderAll();
  }

  function renderRefs() {
    $("refs").innerHTML = refs.map((r, i) => `<figure><img src="${r.data}" alt="${esc(r.name)}"><button data-i="${i}" title="Hapus">×</button></figure>`).join("");
    $("refs").querySelectorAll("button").forEach((b) => b.onclick = () => { refs.splice(+b.dataset.i, 1); renderRefs(); });
  }

  $("file").addEventListener("change", (e) => { handleFiles(e.target.files); e.target.value = ""; });
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));

  renderAll();
})();
