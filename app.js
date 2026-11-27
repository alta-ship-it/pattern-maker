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
    $("models").innerHTML = "";
    for (const [id, M] of Object.entries(MODELS)) {
      const b = document.createElement("button");
      b.textContent = M.name; b.className = id === modelId ? "on" : "";
      b.onclick = () => { modelId = id; store.set("pola:model", id); state = load(id); renderAll(); };
      $("models").appendChild(b);
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

  function update() {
    const M = MODELS[modelId];
    $("err").textContent = "";
    const sizes = Object.keys(state.chart);
    const sel = $("pvSize"), cur = sel.value;
    sel.innerHTML = `<option value="">Semua size (bertumpuk)</option>` + sizes.map((s) => `<option ${s === cur ? "selected" : ""}>${s}</option>`).join("");
    $("legend").innerHTML = sizes.map((s, i) => `<span style="--c:${P.COLORS[i % P.COLORS.length]}">${s}</span>`).join("");
    try {
      $("preview").innerHTML = P.previewSVG(M, state.chart, state.params, { width: 150, size: sel.value || null });
      const run = P.runModel(M, state.chart, state.params);
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
  const fname = (kind) => `Pola_${MODELS[modelId].name.replace(/\s+/g, "_")}_${Object.keys(state.chart).join("-")}_${kind}.pdf`;
  $("dlPlot").onclick = () => {
    try { P.plotterPDF(MODELS[modelId], state.chart, state.params, parseFloat($("plotW").value)).doc.save(fname("PLOTTER")); }
    catch (e) { $("err").textContent = "Gagal membuat PDF: " + e.message; }
  };
  $("dlA4").onclick = () => {
    try { P.a4PDF(MODELS[modelId], state.chart, state.params).doc.save(fname("A4")); }
    catch (e) { $("err").textContent = "Gagal membuat PDF: " + e.message; }
  };

  renderAll();
})();
