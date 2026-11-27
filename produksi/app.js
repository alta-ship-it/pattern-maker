(function () {
  "use strict";
  const db = window.ProdDB, R = window.ProdReports;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rp = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
  const num = (n) => Math.round(n || 0).toLocaleString("id-ID");
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  const nowLocal = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const day = (s) => String(s || "").slice(0, 10);
  const tgl = (s) => { const d = day(s); if (!d) return "-"; const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y.slice(2)}`; };
  const view = $("#view");
  let cleanup = null;

  function toast(msg, ms = 2200) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  function title(t, back) { $("#hTitle").textContent = t; $("#hBack").hidden = !back; $("#hBack").onclick = () => (location.hash = back); }
  function syncBadge() {
    const p = db.pending;
    $("#sync").textContent = db.cfg.mode === "demo" ? "mode coba" : p ? `⏳ ${p} belum terkirim` : db.lastError ? "⚠ offline" : "✓ tersimpan";
  }
  db.onChange(syncBadge);

  // ---------- data helpers ----------
  const D = () => db.data;
  const proses = () => D().proses.filter((p) => p.aktif !== false).sort((a, b) => a.urutan - b.urutan);
  const penjahitAktif = () => D().penjahit.filter((p) => p.aktif !== false).sort((a, b) => String(a.nama).localeCompare(b.nama));
  const byId = (t, id) => D()[t].find((x) => x.id === id);
  const items = (skId) => D().sk_item.filter((i) => i.sk_id === skId);
  const total = (skId) => items(skId).reduce((a, i) => a + (+i.qty || 0), 0);
  const bundles = (skId) => D().bundle.filter((b) => b.sk_id === skId).sort((a, b) => a.no_ikat - b.no_ikat);
  const scans = (f) => D().scan.filter(f);
  function tarifFor(sk, p) {
    try { const o = JSON.parse(sk.tarif_json || "{}"); if (o[p.id] != null && o[p.id] !== "") return +o[p.id]; } catch (e) { /* ignore */ }
    return +p.tarif || 0;
  }
  function doneBySk(skId) { const o = {}; for (const s of scans((x) => x.sk_id === skId)) o[s.proses_id] = (o[s.proses_id] || 0) + (+s.qty || 0); return o; }
  function doneByBundle(bId) { const o = {}; for (const s of scans((x) => x.bundle_id === bId)) o[s.proses_id] = (o[s.proses_id] || 0) + (+s.qty || 0); return o; }
  function bundleState(b) {
    const d = doneByBundle(b.id), ps = proses();
    const next = ps.find((p) => (d[p.id] || 0) < b.qty);
    const last = [...ps].reverse().find((p) => (d[p.id] || 0) >= b.qty);
    return { next, last, done: d };
  }
  function skProgress(sk) {
    const ps = proses(), tot = total(sk.id) || 1, d = doneBySk(sk.id);
    const lastP = ps[ps.length - 1];
    const pct = lastP ? Math.min(100, Math.round(((d[lastP.id] || 0) / tot) * 100)) : 0;
    const cur = [...ps].reverse().find((p) => (d[p.id] || 0) > 0);
    return { pct, cur, d, tot };
  }
  function skStatusPill(sk) {
    if (sk.status === "Selesai") return `<span class="pill ok">Selesai</span>`;
    const late = sk.deadline && day(sk.deadline) < today();
    const pr = skProgress(sk);
    if (!bundles(sk.id).length) return `<span class="pill ${late ? "bad" : ""}">Belum cutting</span>`;
    const curPct = pr.cur ? Math.min(100, Math.round(((pr.d[pr.cur.id] || 0) / pr.tot) * 100)) : 0;
    return `<span class="pill ${late ? "bad" : pr.pct >= 100 ? "ok" : "warn"}">${pr.pct >= 100 ? "Selesai produksi" : pr.cur ? h(pr.cur.nama) + " · " + curPct + "%" : "Siap produksi"}</span>`;
  }
  function nextNoSK() {
    const d = new Date(), pre = `SK${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}-`;
    const n = D().sk.map((s) => String(s.no_sk)).filter((s) => s.startsWith(pre)).map((s) => parseInt(s.slice(pre.length), 10) || 0);
    return pre + String((n.length ? Math.max(...n) : 0) + 1).padStart(3, "0");
  }
  function sizeOrder(a, b) {
    const L = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL"];
    const ia = L.indexOf(String(a).toUpperCase()), ib = L.indexOf(String(b).toUpperCase());
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (!isNaN(a) && !isNaN(b)) return a - b;
    return String(a).localeCompare(String(b));
  }
  function matrix(skId) {
    const it = items(skId);
    const warna = [...new Set(it.map((i) => i.warna))], size = [...new Set(it.map((i) => String(i.size)))].sort(sizeOrder);
    const q = (w, s) => it.filter((i) => i.warna === w && String(i.size) === s).reduce((a, i) => a + (+i.qty || 0), 0);
    return { warna, size, q };
  }
  function matrixTable(skId) {
    const m = matrix(skId);
    if (!m.warna.length) return `<p class="muted">Belum ada jumlah per warna/size.</p>`;
    return `<div class="scroll"><table><tr><th>Warna</th>${m.size.map((s) => `<th class="n">${h(s)}</th>`).join("")}<th class="n">Total</th></tr>` +
      m.warna.map((w) => `<tr><td>${h(w)}</td>${m.size.map((s) => `<td class="n">${m.q(w, s) || "-"}</td>`).join("")}<td class="n"><b>${m.size.reduce((a, s) => a + m.q(w, s), 0)}</b></td></tr>`).join("") +
      `<tr><th>Total</th>${m.size.map((s) => `<th class="n">${m.warna.reduce((a, w) => a + m.q(w, s), 0)}</th>`).join("")}<th class="n">${total(skId)}</th></tr></table></div>`;
  }

  // ---------- views ----------
  const routes = {};

  routes.sk = () => {
    title(db.cfg.nama || "Produksi");
    const list = [...D().sk].sort((a, b) => String(b.dibuat || b.tanggal).localeCompare(String(a.dibuat || a.tanggal)));
    view.innerHTML = demoBanner() + `
      <div class="row" style="margin-bottom:10px"><input id="q" placeholder="Cari SK / model / customer / PO" class="grow"><a class="btn solid" href="#sk-baru">+ SK baru</a></div>
      <div class="card list" id="list"></div>`;
    const draw = () => {
      const q = $("#q").value.toLowerCase();
      const rows = list.filter((s) => !q || [s.no_sk, s.model, s.customer, s.no_po].join(" ").toLowerCase().includes(q));
      $("#list").innerHTML = rows.length ? rows.map((s) => `<a class="item" href="#sk/${h(s.id)}">
        <div class="row"><span class="t grow">${h(s.no_sk)} · ${h(s.model)}</span>${skStatusPill(s)}</div>
        <div class="s">${h(s.customer || "-")}${s.no_po ? " · PO " + h(s.no_po) : ""} · ${num(total(s.id))} pcs · deadline ${tgl(s.deadline)}</div></a>`).join("")
        : `<p class="muted">Belum ada SK. Tekan “+ SK baru”.</p>`;
    };
    $("#q").oninput = draw; draw();
  };

  function demoBanner() {
    return db.cfg.mode === "demo" ? `<div class="demo">Mode coba — data hanya tersimpan di HP ini. Sambungkan ke Google Sheets di <a href="#menu">Menu → Pengaturan</a>.</div>` : "";
  }

  // SK form (new / edit)
  function skForm(sk) {
    const isNew = !sk;
    sk = sk || { no_sk: nextNoSK(), tanggal: today(), customer: "", no_po: "", model: "", deadline: "", catatan: "", tarif_json: "{}", ikat: db.cfg.ikat || 12 };
    title(isNew ? "SK baru" : "Edit " + sk.no_sk, isNew ? "#sk" : "#sk/" + sk.id);
    const m = isNew ? { warna: [""], size: ["S", "M", "L", "XL", "XXL"], q: () => "" } : matrix(sk.id);
    if (!m.warna.length) { m.warna = [""]; m.size = ["S", "M", "L", "XL", "XXL"]; }
    let tarif = {}; try { tarif = JSON.parse(sk.tarif_json || "{}"); } catch (e) { /* ignore */ }
    view.innerHTML = `
      <div class="card"><h2>Data SK</h2>
        <div class="grid2">
          <div><label class="f">No. SK</label><input id="no_sk" value="${h(sk.no_sk)}"></div>
          <div><label class="f">Tanggal</label><input id="tanggal" type="date" value="${h(day(sk.tanggal))}"></div>
          <div><label class="f">Customer</label><input id="customer" value="${h(sk.customer)}"></div>
          <div><label class="f">No. PO</label><input id="no_po" value="${h(sk.no_po)}"></div>
          <div><label class="f">Model / artikel</label><input id="model" value="${h(sk.model)}" placeholder="mis. Kaos Oversize 24s"></div>
          <div><label class="f">Deadline</label><input id="deadline" type="date" value="${h(day(sk.deadline))}"></div>
        </div>
        <label class="f">Catatan (bahan, sablon, rib, label, dll.)</label><textarea id="catatan" rows="3">${h(sk.catatan)}</textarea>
      </div>
      <div class="card"><h2>Jumlah per warna & size</h2>
        <label class="f">Size (pisahkan dengan koma)</label><input id="sizes" value="${h(m.size.join(", "))}">
        <div class="scroll mx" id="mx" style="margin-top:10px"></div>
        <div class="row" style="margin-top:8px"><button class="btn small" id="addW">+ Warna</button><span class="muted grow" id="mxTot"></span></div>
      </div>
      <div class="card"><h2>Tarif borongan untuk SK ini (Rp/pcs)</h2>
        <p class="muted">Kosongkan untuk pakai tarif standar di Menu → Proses & tarif.</p>
        <div class="grid2">${proses().map((p) => `<div><label class="f">${h(p.nama)} (standar ${rp(p.tarif)})</label><input type="number" inputmode="numeric" data-tarif="${h(p.id)}" value="${tarif[p.id] != null ? h(tarif[p.id]) : ""}"></div>`).join("")}</div>
      </div>
      <p class="err" id="err"></p>
      <button class="btn solid block" id="save">${isNew ? "Simpan SK" : "Simpan perubahan"}</button>`;
    let warna = m.warna.slice(), qty = {};
    m.warna.forEach((w) => m.size.forEach((s) => { const v = m.q(w, s); if (v) qty[w + "|" + s] = v; }));
    const sizes = () => $("#sizes").value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const drawMx = () => {
      const S = sizes();
      $("#mx").innerHTML = `<table><tr><th>Warna</th>${S.map((s) => `<th class="n">${h(s)}</th>`).join("")}<th></th></tr>` +
        warna.map((w, i) => `<tr><td><input data-w="${i}" value="${h(w)}" placeholder="Warna" style="width:110px;text-align:left"></td>` +
          S.map((s) => `<td class="n"><input type="number" inputmode="numeric" data-i="${i}" data-s="${h(s)}" value="${h(qty[w + "|" + s] || "")}"></td>`).join("") +
          `<td><button class="btn small danger" data-del="${i}">×</button></td></tr>`).join("") + `</table>`;
      $$("input[data-w]", $("#mx")).forEach((inp) => inp.onchange = () => {
        const i = +inp.dataset.w, old = warna[i], nw = inp.value.trim();
        for (const k of Object.keys(qty)) if (k.startsWith(old + "|")) { qty[nw + k.slice(old.length)] = qty[k]; delete qty[k]; }
        warna[i] = nw; sum();
      });
      $$("input[data-i]", $("#mx")).forEach((inp) => inp.oninput = () => { qty[warna[+inp.dataset.i] + "|" + inp.dataset.s] = +inp.value || 0; sum(); });
      $$("button[data-del]", $("#mx")).forEach((b) => b.onclick = () => { warna.splice(+b.dataset.del, 1); if (!warna.length) warna = [""]; drawMx(); });
      sum();
    };
    const sum = () => { const S = sizes(); let t = 0; warna.forEach((w) => S.forEach((s) => (t += +qty[w + "|" + s] || 0))); $("#mxTot").textContent = `Total ${num(t)} pcs`; };
    $("#sizes").onchange = drawMx;
    $("#addW").onclick = () => { warna.push(""); drawMx(); };
    drawMx();
    $("#save").onclick = async () => {
      const v = (id) => $("#" + id).value.trim();
      if (!v("no_sk") || !v("model")) { $("#err").textContent = "No. SK dan model wajib diisi."; return; }
      if (D().sk.some((s) => s.no_sk === v("no_sk") && (!sk.id || s.id !== sk.id))) { $("#err").textContent = "No. SK sudah dipakai."; return; }
      const S = sizes();
      const rows = [];
      warna.forEach((w) => S.forEach((s) => { const q = +qty[w + "|" + s] || 0; if (w && q > 0) rows.push({ warna: w, size: s, qty: q }); }));
      if (!rows.length) { $("#err").textContent = "Isi minimal satu warna dan jumlahnya."; return; }
      const t = {}; $$("input[data-tarif]").forEach((i) => { if (i.value !== "") t[i.dataset.tarif] = +i.value; });
      const data = { no_sk: v("no_sk"), tanggal: v("tanggal"), customer: v("customer"), no_po: v("no_po"), model: v("model"), deadline: v("deadline"), catatan: $("#catatan").value, tarif_json: JSON.stringify(t) };
      $("#save").disabled = true;
      try {
        let id = sk.id;
        if (isNew) { const [r] = await db.insert("sk", [Object.assign(data, { status: "Proses", ikat: db.cfg.ikat || 12, dibuat: nowLocal() })]); id = r.id; }
        else {
          await db.update("sk", [Object.assign({ id }, data)]);
          const old = items(id).map((i) => i.id);
          if (old.length) await db.remove("sk_item", old);
        }
        await db.insert("sk_item", rows.map((r) => Object.assign({ sk_id: id }, r)));
        toast("SK tersimpan");
        location.hash = "#sk/" + id;
      } catch (e) { $("#err").textContent = "Gagal menyimpan: " + e.message; $("#save").disabled = false; }
    };
  }
  routes["sk-baru"] = () => skForm(null);
  routes["sk-edit"] = (id) => { const sk = byId("sk", id); if (!sk) return (location.hash = "#sk"); if (bundles(id).length) toast("Ikat sudah dibuat: perubahan jumlah tidak mengubah ikat yang ada.", 3500); skForm(sk); };

  // SK detail
  routes.skd = (id) => {
    const sk = byId("sk", id);
    if (!sk) { location.hash = "#sk"; return; }
    title(sk.no_sk, "#sk");
    const bs = bundles(id), pr = skProgress(sk), ms = D().marker.filter((m) => m.sk_id === id);
    const tot = total(id), mk = ms.reduce((a, m) => a + (+m.kain_terpakai || 0), 0);
    view.innerHTML = `
      <div class="card">
        <div class="row"><div class="grow"><div class="big">${h(sk.model)}</div><div class="muted">${h(sk.customer || "-")}${sk.no_po ? " · PO " + h(sk.no_po) : ""}</div></div>${skStatusPill(sk)}</div>
        <div class="kpi" style="margin-top:10px"><div><b>${num(tot)}</b><span>pcs</span></div><div><b>${bs.length}</b><span>ikat</span></div><div><b>${tgl(sk.deadline)}</b><span>deadline</span></div></div>
        ${sk.catatan ? `<p style="white-space:pre-wrap;margin:10px 0 0">${h(sk.catatan)}</p>` : ""}
        <div class="row" style="margin-top:10px"><a class="btn small" href="#sk-edit/${h(id)}">Edit</a>
          <button class="btn small" id="done">${sk.status === "Selesai" ? "Buka lagi" : "Tandai selesai"}</button>
          <button class="btn small danger" id="del">Hapus</button></div>
      </div>
      <div class="card"><h2>Jumlah per warna & size</h2>${matrixTable(id)}</div>
      <div class="card"><h2>Progres produksi</h2>${proses().map((p) => {
        const v = pr.d[p.id] || 0, pc = Math.min(100, Math.round((v / (tot || 1)) * 100));
        return `<div class="prog"><span>${h(p.nama)}</span><div class="bar ${pc >= 100 ? "ok" : ""}"><i style="width:${pc}%"></i></div><span class="v">${num(v)}/${num(tot)}</span></div>`;
      }).join("")}</div>
      <div class="card"><h2>Cutting & marker</h2>
        ${ms.length ? `<table><tr><th>Tgl</th><th class="n">Lebar</th><th class="n">Marker</th><th class="n">Lapis</th><th class="n">Kain (m)</th></tr>${ms.map((m) => `<tr><td>${tgl(m.tanggal)}</td><td class="n">${h(m.lebar_kain)}</td><td class="n">${h(m.panjang_marker)} m</td><td class="n">${h(m.lapis)}</td><td class="n">${h(m.kain_terpakai)}</td></tr>`).join("")}</table>
          <p class="muted">Total kain ${mk.toFixed(2)} m · ${tot ? ((mk / tot) * 100).toFixed(1) : "-"} cm/pcs</p>` : `<p class="muted">Belum ada catatan marker.</p>`}
        <details><summary>+ Catat marker / gelaran</summary>
          <div class="grid2"><div><label class="f">Lebar kain (cm)</label><input id="mLebar" type="number" inputmode="decimal"></div>
          <div><label class="f">Panjang marker (m)</label><input id="mPanjang" type="number" step="0.01" inputmode="decimal"></div>
          <div><label class="f">Jumlah lapis</label><input id="mLapis" type="number" inputmode="numeric"></div>
          <div><label class="f">Catatan</label><input id="mCat" placeholder="mis. warna hitam"></div></div>
          <button class="btn small" id="mSave" style="margin-top:8px">Simpan marker</button></details>
        <hr style="border:none;border-top:1px solid var(--line);margin:12px 0">
        ${bs.length ? `<p><b>${bs.length} ikat</b> sudah dibuat (${num(bs.reduce((a, b) => a + b.qty, 0))} pcs).</p>
          <div class="row"><button class="btn solid small" id="lblA4">🖨 Label QR (A4)</button><button class="btn small" id="lblTh">Label thermal 50×30</button></div>
          <details style="margin-top:8px"><summary>Lihat daftar ikat</summary><div class="scroll"><table><tr><th>Kode</th><th>Warna</th><th>Size</th><th class="n">Qty</th><th>Posisi</th></tr>${bs.map((b) => {
            const st = bundleState(b);
            return `<tr><td><a href="#scan/${h(b.id)}">${h(b.id)}</a></td><td>${h(b.warna)}</td><td>${h(b.size)}</td><td class="n">${b.qty}</td><td>${st.next ? "→ " + h(st.next.nama) : '<span class="pill ok">Selesai</span>'}</td></tr>`;
          }).join("")}</table></div></details>`
          : `<p class="muted">Setelah kain dipotong, bagi per ikat lalu cetak label QR untuk ditempel di tiap ikat.</p>
          <div class="row"><label class="f" style="margin:0">Isi per ikat</label><input id="ikat" type="number" value="${h(sk.ikat || db.cfg.ikat || 12)}" style="width:90px"><button class="btn solid" id="mkB">Buat ikat</button></div>`}
      </div>
      <div class="card"><h2>Laporan</h2><div class="row">
        <button class="btn small" id="rCut">Laporan cutting & marker</button>
        <button class="btn small" id="rProd">Laporan produksi</button>
        <a class="btn small" href="../" target="_blank" rel="noopener">Pola (Pattern Maker)</a></div></div>`;
    $("#done").onclick = async () => { await db.update("sk", [{ id, status: sk.status === "Selesai" ? "Proses" : "Selesai" }]); routes.skd(id); };
    $("#del").onclick = async () => {
      if (scans((s) => s.sk_id === id).length) { toast("Tidak bisa dihapus: sudah ada scan produksi."); return; }
      if (!confirm(`Hapus ${sk.no_sk}?`)) return;
      await db.remove("bundle", bs.map((b) => b.id)); await db.remove("sk_item", items(id).map((i) => i.id));
      await db.remove("marker", ms.map((m) => m.id)); await db.remove("sk", [id]);
      location.hash = "#sk";
    };
    $("#mSave").onclick = async () => {
      const L = +$("#mLebar").value, P = +$("#mPanjang").value, N = +$("#mLapis").value;
      if (!P || !N) { toast("Isi panjang marker & jumlah lapis"); return; }
      await db.insert("marker", [{ sk_id: id, tanggal: today(), lebar_kain: L || "", panjang_marker: P, lapis: N, kain_terpakai: Math.round(P * N * 100) / 100, catatan: $("#mCat").value }]);
      toast("Marker tersimpan"); routes.skd(id);
    };
    if ($("#mkB")) $("#mkB").onclick = async () => {
      const per = Math.max(1, +$("#ikat").value || 12);
      const m = matrix(id), rows = []; let n = 0;
      for (const w of m.warna) for (const s of m.size) {
        let q = m.q(w, s);
        while (q > 0) { const take = Math.min(per, q); n++; rows.push({ id: `${sk.no_sk}-${String(n).padStart(3, "0")}`, sk_id: id, no_ikat: n, warna: w, size: s, qty: take, tanggal: today() }); q -= take; }
      }
      if (!confirm(`Buat ${rows.length} ikat (isi ${per} pcs)?`)) return;
      await db.update("sk", [{ id, ikat: per }]);
      await db.insert("bundle", rows);
      toast(`${rows.length} ikat dibuat`); routes.skd(id);
    };
    const ctx = () => ({ sk, items: items(id), bundles: bundles(id), markers: D().marker.filter((m) => m.sk_id === id), proses: proses(), scans: scans((s) => s.sk_id === id), nama: db.cfg.nama, matrix: matrix(id), penjahit: D().penjahit });
    if ($("#lblA4")) $("#lblA4").onclick = () => R.labelsA4(ctx());
    if ($("#lblTh")) $("#lblTh").onclick = () => R.labelsThermal(ctx());
    $("#rCut").onclick = () => R.cutting(ctx());
    $("#rProd").onclick = () => R.produksi(ctx());
  };

  // ---------- SCAN ----------
  function stopCam() { if (cleanup) { cleanup(); cleanup = null; } }
  routes.scan = () => {
    title("Scan ikat");
    view.innerHTML = demoBanner() + `
      <div class="card"><div class="scanbox"><video id="video" playsinline muted></video><div class="frame"></div></div>
        <p class="muted" id="camMsg" style="margin:8px 0 0">Arahkan kamera ke QR di label ikat.</p>
        <button class="btn solid block" id="camBtn" style="margin-top:8px">Nyalakan kamera</button></div>
      <div class="card"><h2>Atau ketik kode ikat</h2><div class="row"><input id="code" class="grow" placeholder="mis. SK2611-001-004" autocapitalize="characters"><button class="btn" id="go">Cari</button></div></div>
      <div class="card"><h2>Scan terakhir</h2>${recentScans(8)}</div>`;
    const open = (code) => {
      code = String(code || "").trim().toUpperCase();
      const b = D().bundle.find((x) => String(x.id).toUpperCase() === code);
      if (!b) { toast("Kode tidak ditemukan: " + code); return false; }
      if (navigator.vibrate) navigator.vibrate(80);
      location.hash = "#scan/" + b.id; return true;
    };
    $("#go").onclick = () => open($("#code").value);
    $("#code").onkeydown = (e) => { if (e.key === "Enter") open($("#code").value); };
    $("#camBtn").onclick = () => startCam(open);
    if (sessionStorage.getItem("camOn")) startCam(open);
  };
  async function startCam(onCode) {
    const video = $("#video"), msg = $("#camMsg");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = "Kamera tidak tersedia di browser ini. Ketik kode ikat di bawah."; return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false }); }
    catch (e) { msg.textContent = "Izin kamera ditolak. Izinkan kamera di pengaturan browser, atau ketik kode ikat."; return; }
    sessionStorage.setItem("camOn", "1");
    video.srcObject = stream; await video.play().catch(() => {});
    $("#camBtn").hidden = true; msg.textContent = "Mencari QR…";
    const det = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
    const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
    let alive = true, timer = null;
    cleanup = () => { alive = false; clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); };
    const tick = async () => {
      if (!alive) return;
      if (video.readyState >= 2) {
        let code = null;
        try {
          if (det) { const r = await det.detect(video); if (r[0]) code = r[0].rawValue; }
          else {
            const w = 640, hh = Math.round((video.videoHeight / video.videoWidth) * 640) || 480;
            c.width = w; c.height = hh; g.drawImage(video, 0, 0, w, hh);
            const r = window.jsQR(g.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: "dontInvert" });
            if (r) code = r.data;
          }
        } catch (e) { /* keep trying */ }
        if (code && onCode(code)) return;
      }
      timer = setTimeout(tick, 180);
    };
    tick();
  }
  function recentScans(n, filter) {
    const rows = [...D().scan].filter(filter || (() => true)).sort((a, b) => String(b.waktu).localeCompare(String(a.waktu))).slice(0, n);
    if (!rows.length) return `<p class="muted">Belum ada scan.</p>`;
    return `<div class="list">${rows.map((s) => {
      const p = byId("proses", s.proses_id), j = byId("penjahit", s.penjahit_id);
      return `<div class="item"><div class="row"><span class="t grow">${h(s.bundle_id)}</span><span class="pill">${h(p ? p.nama : "?")}</span></div>
        <div class="s">${h(j ? j.nama : "-")} · ${s.qty} pcs · ${rp(s.nilai)} · ${tgl(s.waktu)} ${String(s.waktu).slice(11, 16)}</div></div>`;
    }).join("")}</div>`;
  }

  routes.bundle = (bid) => {
    const b = byId("bundle", bid);
    if (!b) { location.hash = "#scan"; return; }
    const sk = byId("sk", b.sk_id) || {};
    title(b.id, "#scan");
    const st = bundleState(b), ps = proses();
    const lastPen = JSON.parse(sessionStorage.getItem("lastPen") || "{}");
    let selP = st.next ? st.next.id : ps.length ? ps[ps.length - 1].id : null;
    view.innerHTML = `
      <div class="card"><div class="row"><div class="grow"><div class="big">${h(b.warna)} · ${h(b.size)}</div>
        <div class="muted">${h(sk.no_sk)} · ${h(sk.model)} · ikat #${b.no_ikat}</div></div><div class="big">${b.qty}<span class="muted"> pcs</span></div></div>
        <div style="margin-top:8px">${ps.map((p) => { const v = st.done[p.id] || 0; return `<span class="pill ${v >= b.qty ? "ok" : v ? "warn" : ""}" style="margin:2px">${h(p.nama)} ${v >= b.qty ? "✓" : v ? v + "/" + b.qty : ""}</span>`; }).join("")}</div></div>
      <div class="card"><h2>Catat pekerjaan</h2>
        <label class="f">Proses</label><div class="chips" id="pChips">${ps.map((p) => `<button data-p="${h(p.id)}">${h(p.nama)}</button>`).join("")}</div>
        <label class="f">Dikerjakan oleh</label><select id="pen"></select>
        <div class="grid2"><div><label class="f">Jumlah (pcs)</label><input id="qty" type="number" inputmode="numeric"></div>
        <div><label class="f">Tarif</label><input id="tarif" disabled></div></div>
        <label class="f">Catatan (reject, dll.)</label><input id="cat">
        <p class="err" id="err"></p>
        <button class="btn solid block" id="save">Simpan</button>
      </div>
      <div class="card"><h2>Riwayat ikat ini</h2>${recentScans(50, (s) => s.bundle_id === b.id)}</div>`;
    const drawP = () => {
      $$("#pChips button").forEach((x) => x.classList.toggle("on", x.dataset.p === selP));
      const p = byId("proses", selP);
      const left = Math.max(0, b.qty - (st.done[selP] || 0));
      $("#qty").value = left || b.qty;
      $("#tarif").value = p ? rp(tarifFor(sk, p)) + "/pcs" : "";
      const pens = penjahitAktif();
      const pref = pens.filter((j) => p && String(j.bagian || "").toLowerCase().includes(String(p.nama).toLowerCase().slice(0, 4)));
      const order = pref.concat(pens.filter((j) => !pref.includes(j)));
      $("#pen").innerHTML = `<option value="">— pilih —</option>` + order.map((j) => `<option value="${h(j.id)}" ${lastPen[selP] === j.id ? "selected" : ""}>${h(j.nama)}${j.bagian ? " (" + h(j.bagian) + ")" : ""}</option>`).join("");
      $("#err").textContent = left ? "" : "Proses ini sudah selesai untuk ikat ini.";
    };
    $$("#pChips button").forEach((x) => x.onclick = () => { selP = x.dataset.p; drawP(); });
    drawP();
    $("#save").onclick = async () => {
      const p = byId("proses", selP), pen = $("#pen").value, q = +$("#qty").value;
      if (!p) return ($("#err").textContent = "Pilih proses.");
      if (!pen) return ($("#err").textContent = "Pilih siapa yang mengerjakan.");
      if (!(q > 0)) return ($("#err").textContent = "Isi jumlah.");
      const left = b.qty - (st.done[selP] || 0);
      if (q > left && !confirm(`Jumlah melebihi sisa (${Math.max(0, left)} pcs). Tetap simpan?`)) return;
      lastPen[selP] = pen; sessionStorage.setItem("lastPen", JSON.stringify(lastPen));
      const t = tarifFor(sk, p);
      $("#save").disabled = true;
      await db.insert("scan", [{ waktu: nowLocal(), bundle_id: b.id, sk_id: b.sk_id, proses_id: p.id, penjahit_id: pen, qty: q, tarif: t, nilai: q * t, oleh: db.cfg.oleh || "", catatan: $("#cat").value }]);
      toast(`✓ ${p.nama} ${q} pcs — ${byId("penjahit", pen).nama}`);
      location.hash = "#scan";
    };
  };

  // ---------- STATUS ----------
  routes.status = () => {
    title("Status produksi");
    const t = today(), wk = weekRange(new Date());
    const qtyOn = (f) => scans(f).reduce((a, s) => a + (+s.qty || 0), 0);
    const ps = proses(), lastP = ps[ps.length - 1];
    const active = D().sk.filter((s) => s.status !== "Selesai");
    view.innerHTML = demoBanner() + `
      <div class="kpi" style="margin-bottom:12px"><div><b>${active.length}</b><span>SK berjalan</span></div>
        <div><b>${num(qtyOn((s) => day(s.waktu) === t && lastP && s.proses_id === lastP.id))}</b><span>${h(lastP ? lastP.nama : "selesai")} hari ini</span></div>
        <div><b>${num(qtyOn((s) => day(s.waktu) >= wk[0] && day(s.waktu) <= wk[1] && lastP && s.proses_id === lastP.id))}</b><span>minggu ini</span></div></div>
      <div class="card"><h2>Per SK</h2>${active.length ? active.map((sk) => {
        const pr = skProgress(sk);
        return `<a href="#sk/${h(sk.id)}" style="text-decoration:none;color:inherit;display:block;padding:8px 0;border-bottom:1px solid var(--line)">
          <div class="row"><b class="grow">${h(sk.no_sk)} · ${h(sk.model)}</b>${skStatusPill(sk)}</div>
          ${ps.map((p) => { const v = pr.d[p.id] || 0, pc = Math.min(100, Math.round((v / (pr.tot || 1)) * 100)); return `<div class="prog"><span>${h(p.nama)}</span><div class="bar ${pc >= 100 ? "ok" : ""}"><i style="width:${pc}%"></i></div><span class="v">${pc}%</span></div>`; }).join("")}</a>`;
      }).join("") : `<p class="muted">Tidak ada SK yang sedang berjalan.</p>`}</div>
      <div class="card"><h2>Hari ini per proses</h2><table>${ps.map((p) => `<tr><td>${h(p.nama)}</td><td class="n">${num(qtyOn((s) => day(s.waktu) === t && s.proses_id === p.id))} pcs</td></tr>`).join("")}</table></div>
      <div class="card"><h2>Scan terakhir</h2>${recentScans(15)}
        <details><summary>Hapus scan yang salah</summary><p class="muted">Ketuk untuk menghapus (hanya scan hari ini).</p><div id="undo"></div></details></div>`;
    const todays = [...D().scan].filter((s) => day(s.waktu) === t).sort((a, b) => String(b.waktu).localeCompare(String(a.waktu)));
    $("#undo").innerHTML = todays.map((s) => `<button class="btn small danger" data-id="${h(s.id)}" style="margin:3px">${h(s.bundle_id)} · ${h((byId("proses", s.proses_id) || {}).nama)} · ${s.qty}</button>`).join("") || `<p class="muted">-</p>`;
    $$("#undo button").forEach((b) => b.onclick = async () => { if (confirm("Hapus scan ini?")) { await db.remove("scan", [b.dataset.id]); routes.status(); } });
  };

  // ---------- GAJI ----------
  function weekRange(d) {
    const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow);
    const y = new Date(x); y.setDate(x.getDate() + 6);
    return [ymd(x), ymd(y)];
  }
  routes.gaji = () => {
    title("Gaji borongan");
    const saved = JSON.parse(sessionStorage.getItem("gajiRange") || "null") || weekRange(new Date());
    view.innerHTML = demoBanner() + `
      <div class="card"><div class="grid2"><div><label class="f">Dari</label><input type="date" id="g1" value="${saved[0]}"></div><div><label class="f">Sampai</label><input type="date" id="g2" value="${saved[1]}"></div></div>
        <div class="row" style="margin-top:8px"><button class="btn small" id="thisW">Minggu ini</button><button class="btn small" id="lastW">Minggu lalu</button><button class="btn small" id="thisM">Bulan ini</button></div></div>
      <div id="gOut"></div>`;
    const draw = () => {
      const a = $("#g1").value, b = $("#g2").value;
      sessionStorage.setItem("gajiRange", JSON.stringify([a, b]));
      const rows = scans((s) => day(s.waktu) >= a && day(s.waktu) <= b);
      const per = {};
      for (const s of rows) { const k = s.penjahit_id; (per[k] = per[k] || { pcs: 0, rp: 0, list: [] }); per[k].pcs += +s.qty || 0; per[k].rp += +s.nilai || 0; per[k].list.push(s); }
      const ids = Object.keys(per).sort((x, y) => per[y].rp - per[x].rp);
      const tot = ids.reduce((t, k) => t + per[k].rp, 0);
      $("#gOut").innerHTML = `<div class="card"><div class="row"><div class="grow"><div class="muted">Total ${tgl(a)} – ${tgl(b)}</div><div class="big">${rp(tot)}</div></div>
          <button class="btn solid small" id="pdfAll" ${ids.length ? "" : "disabled"}>PDF rekap</button></div></div>
        <div class="card">${ids.length ? ids.map((k) => {
          const j = byId("penjahit", k) || { nama: "(dihapus)" }, g = {};
          for (const s of per[k].list) { const key = s.sk_id + "|" + s.proses_id; (g[key] = g[key] || { sk: byId("sk", s.sk_id), p: byId("proses", s.proses_id), qty: 0, rp: 0, tarif: s.tarif }); g[key].qty += +s.qty; g[key].rp += +s.nilai; }
          return `<details class="item"><summary><div class="row"><span class="t grow">${h(j.nama)}</span><b>${rp(per[k].rp)}</b></div><div class="s">${num(per[k].pcs)} pcs</div></summary>
            <table>${Object.values(g).map((x) => `<tr><td>${h(x.sk ? x.sk.no_sk : "-")}<div class="muted">${h(x.p ? x.p.nama : "-")} · ${rp(x.tarif)}/pcs</div></td><td class="n">${num(x.qty)}</td><td class="n">${rp(x.rp)}</td></tr>`).join("")}</table>
            <button class="btn small" data-slip="${h(k)}" style="margin-top:6px">Slip PDF</button></details>`;
        }).join("") : `<p class="muted">Belum ada pekerjaan tercatat di periode ini.</p>`}</div>`;
      const ctx = { a, b, per, nama: db.cfg.nama, byId };
      if ($("#pdfAll")) $("#pdfAll").onclick = () => R.gajiRekap(ctx);
      $$("button[data-slip]").forEach((x) => x.onclick = () => R.gajiSlip(ctx, x.dataset.slip));
    };
    $("#g1").onchange = $("#g2").onchange = draw;
    $("#thisW").onclick = () => { const r = weekRange(new Date()); $("#g1").value = r[0]; $("#g2").value = r[1]; draw(); };
    $("#lastW").onclick = () => { const d = new Date(); d.setDate(d.getDate() - 7); const r = weekRange(d); $("#g1").value = r[0]; $("#g2").value = r[1]; draw(); };
    $("#thisM").onclick = () => { const d = new Date(); $("#g1").value = ymd(new Date(d.getFullYear(), d.getMonth(), 1)); $("#g2").value = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); draw(); };
    draw();
  };

  // ---------- MENU ----------
  routes.menu = () => {
    title("Menu");
    view.innerHTML = `
      <div class="card list">
        <a class="item" href="#penjahit"><div class="t">👷 Penjahit & karyawan</div><div class="s">${penjahitAktif().length} aktif</div></a>
        <a class="item" href="#proses"><div class="t">🧵 Proses & tarif borongan</div><div class="s">${proses().map((p) => h(p.nama)).join(" → ")}</div></a>
        <a class="item" href="#pengaturan"><div class="t">⚙️ Pengaturan & Google Sheets</div><div class="s">${db.cfg.mode === "demo" ? "Mode coba (belum tersambung)" : "Tersambung ke Google Sheets"}</div></a>
        <a class="item" href="../" target="_blank" rel="noopener"><div class="t">✂️ Pattern Maker</div><div class="s">Buat pola dari size chart</div></a>
        <a class="item" href="https://github.com/alta-ship-it/pattern-maker/blob/main/produksi/PANDUAN.md" target="_blank" rel="noopener"><div class="t">📖 Panduan pasang Google Sheets</div><div class="s">Langkah sambung ke Sheets</div></a>
      </div>`;
  };
  routes.penjahit = () => {
    title("Penjahit & karyawan", "#menu");
    const all = [...D().penjahit].sort((a, b) => (b.aktif !== false) - (a.aktif !== false) || String(a.nama).localeCompare(b.nama));
    view.innerHTML = `<div class="card"><h2>Tambah</h2><div class="grid2"><div><label class="f">Nama</label><input id="n"></div><div><label class="f">Bagian</label><input id="b" placeholder="Jahit / Obras / QC…"></div></div>
      <button class="btn solid" id="add" style="margin-top:8px">Tambah</button></div>
      <div class="card list">${all.map((j) => `<div class="item row"><div class="grow"><div class="t">${h(j.nama)}</div><div class="s">${h(j.bagian || "-")}</div></div>
        <button class="btn small" data-tog="${h(j.id)}">${j.aktif !== false ? "Nonaktifkan" : "Aktifkan"}</button></div>`).join("") || `<p class="muted">Belum ada.</p>`}</div>`;
    $("#add").onclick = async () => { const n = $("#n").value.trim(); if (!n) return; await db.insert("penjahit", [{ nama: n, bagian: $("#b").value.trim(), hp: "", aktif: true }]); routes.penjahit(); };
    $$("button[data-tog]").forEach((b) => b.onclick = async () => { const j = byId("penjahit", b.dataset.tog); await db.update("penjahit", [{ id: j.id, aktif: j.aktif === false }]); routes.penjahit(); });
  };
  routes.proses = () => {
    title("Proses & tarif", "#menu");
    const all = [...D().proses].sort((a, b) => a.urutan - b.urutan);
    view.innerHTML = `<div class="card"><p class="muted">Urutan proses dipakai untuk status ikat. Tarif = Rp per pcs (bisa diganti per SK).</p>
      <table><tr><th>Urutan</th><th>Proses</th><th class="n">Tarif</th><th></th></tr>${all.map((p) => `<tr>
        <td><input type="number" data-k="urutan" data-id="${h(p.id)}" value="${h(p.urutan)}" style="width:60px"></td>
        <td><input data-k="nama" data-id="${h(p.id)}" value="${h(p.nama)}"></td>
        <td class="n"><input type="number" data-k="tarif" data-id="${h(p.id)}" value="${h(p.tarif)}" style="width:90px"></td>
        <td><button class="btn small" data-tog="${h(p.id)}">${p.aktif !== false ? "Aktif" : "Nonaktif"}</button></td></tr>`).join("")}</table>
      <button class="btn small" id="add" style="margin-top:8px">+ Proses</button></div>`;
    $$("input[data-k]").forEach((i) => i.onchange = async () => { const v = i.dataset.k === "nama" ? i.value.trim() : +i.value; await db.update("proses", [{ id: i.dataset.id, [i.dataset.k]: v }]); toast("Tersimpan"); });
    $$("button[data-tog]").forEach((b) => b.onclick = async () => { const p = byId("proses", b.dataset.tog); await db.update("proses", [{ id: p.id, aktif: p.aktif === false }]); routes.proses(); });
    $("#add").onclick = async () => { const nama = prompt("Nama proses (mis. Lubang kancing):"); if (!nama) return; await db.insert("proses", [{ nama, urutan: all.length + 1, tarif: 0, aktif: true }]); routes.proses(); };
  };
  routes.pengaturan = () => {
    title("Pengaturan", "#menu");
    const c = db.cfg;
    view.innerHTML = `<div class="card"><h2>Umum</h2>
        <label class="f">Nama konveksi (muncul di laporan)</label><input id="nama" value="${h(c.nama)}">
        <div class="grid2"><div><label class="f">Nama pencatat / mandor</label><input id="oleh" value="${h(c.oleh)}"></div>
        <div><label class="f">Isi per ikat (default)</label><input id="ikat" type="number" value="${h(c.ikat)}"></div></div></div>
      <div class="card"><h2>Penyimpanan data</h2>
        <div class="chips"><button data-m="demo">Mode coba (HP ini saja)</button><button data-m="sheets">Google Sheets</button></div>
        <div id="sheetsBox"><label class="f">Web app URL (dari Apps Script)</label><input id="url" value="${h(c.url)}" placeholder="https://script.google.com/macros/s/…/exec">
        <label class="f">PIN</label><input id="pin" type="password" value="${h(c.pin)}" autocomplete="off">
        <p class="muted">Cara pasang ada di <a href="https://github.com/alta-ship-it/pattern-maker/blob/main/produksi/PANDUAN.md" target="_blank" rel="noopener">Panduan</a>.</p></div>
        <p id="msg" class="muted"></p>
        <button class="btn solid block" id="save">Simpan & tes koneksi</button></div>
      <div class="card"><h2>Mode coba</h2><button class="btn small danger" id="reset">Hapus data mode coba</button></div>`;
    let mode = c.mode;
    const drawM = () => { $$(".chips button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode)); $("#sheetsBox").hidden = mode !== "sheets"; };
    $$(".chips button").forEach((b) => b.onclick = () => { mode = b.dataset.m; drawM(); });
    drawM();
    $("#save").onclick = async () => {
      db.saveCfg({ nama: $("#nama").value.trim() || "Konveksi", oleh: $("#oleh").value.trim(), ikat: +$("#ikat").value || 12, mode, url: $("#url").value.trim(), pin: $("#pin").value });
      $("#msg").textContent = "Menghubungkan…";
      try { const r = await db.ping(); await db.load(); $("#msg").innerHTML = `<b style="color:var(--ok)">✓ Tersambung: ${h(r.name)}</b>`; }
      catch (e) { $("#msg").innerHTML = `<span class="err">Gagal: ${h(e.message)}. Cek URL & PIN.</span>`; }
    };
    $("#reset").onclick = () => { if (confirm("Hapus semua data mode coba di HP ini?")) { db.resetDemo(); db.load().then(() => toast("Data coba direset")); } };
  };

  // ---------- router ----------
  function route() {
    stopCam();
    const [r, arg] = location.hash.replace(/^#/, "").split("/");
    $$("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === (r === "skd" || r === "sk-baru" || r === "sk-edit" ? "sk" : r === "bundle" ? "scan" : r || "sk")));
    if (r === "sk" && arg) return routes.skd(decodeURIComponent(arg));
    if (r === "scan" && arg) return routes.bundle(decodeURIComponent(arg));
    if (r !== "scan") sessionStorage.removeItem("camOn");
    (routes[r] || routes.sk)(arg && decodeURIComponent(arg));
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  $("#hRefresh").onclick = async () => { try { await db.load(); route(); toast("Data dimuat ulang"); } catch (e) { toast("Gagal memuat: " + e.message); } };
  window.addEventListener("online", () => db.flush());
  setInterval(() => db.flush(), 30000);

  (async () => {
    view.innerHTML = `<p class="muted">Memuat data…</p>`;
    try { await db.load(); }
    catch (e) { toast("Gagal memuat dari Google Sheets: " + e.message, 4000); }
    syncBadge(); route();
  })();
})();
