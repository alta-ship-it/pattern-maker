/* Produksi — data layer. Two backends with the same interface:
   - "sheets": Google Apps Script web app (Code.gs) on the owner's Google Sheet
   - "demo":   localStorage in this browser only (for trying the app)
   Writes go through an outbox so a scan made with a weak signal is kept and sent later. */
(function (root) {
  "use strict";
  const TABLES = ["penjahit", "proses", "sk", "sk_item", "marker", "bundle", "scan"];
  const ls = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function seedDemo() {
    const p = (nama, urutan, tarif) => ({ id: uid(), nama, urutan, tarif, aktif: true });
    const proses = [p("Cutting", 1, 300), p("Jahit", 2, 3500), p("Obras", 3, 700), p("Overdeck", 4, 600), p("QC", 5, 250), p("Packing", 6, 300)];
    const j = (nama, bagian) => ({ id: uid(), nama, bagian, hp: "", aktif: true });
    const penjahit = [j("Acim", "Jahit"), j("Ahmad", "Jahit"), j("Alo", "Jahit"), j("Rina", "Obras"), j("Dewi", "QC/Packing"), j("Budi", "Cutting")];
    return { penjahit, proses, sk: [], sk_item: [], marker: [], bundle: [], scan: [] };
  }

  class DB {
    constructor() {
      this.cfg = ls.get("prod:cfg", { mode: "demo", url: "", pin: "", nama: "Konveksi", ikat: 12, oleh: "" });
      this.data = {}; TABLES.forEach((t) => (this.data[t] = []));
      this.outbox = ls.get("prod:outbox", []);
      this.listeners = [];
      this.busy = false;
    }
    saveCfg(c) { Object.assign(this.cfg, c); ls.set("prod:cfg", this.cfg); }
    onChange(fn) { this.listeners.push(fn); }
    emit() { this.listeners.forEach((f) => f()); }
    get pending() { return this.outbox.length; }

    async call(body) {
      const res = await fetch(this.cfg.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ pin: this.cfg.pin }, body)), redirect: "follow" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Gagal");
      return j;
    }
    async ping() { if (this.cfg.mode !== "sheets") return { ok: true, name: "Mode coba" }; return this.call({ action: "ping" }); }

    async load() {
      if (this.cfg.mode === "demo") {
        this.data = ls.get("prod:demo", null) || seedDemo();
        ls.set("prod:demo", this.data);
      } else {
        await this.flush();
        const j = await this.call({ action: "all" });
        TABLES.forEach((t) => (this.data[t] = (j.data[t] || []).map(norm)));
        if (!this.data.proses.length) { // fresh sheet: start with the standard processes
          const seed = seedDemo().proses;
          await this.insert("proses", seed);
        }
        // re-apply anything still waiting in the outbox so the screen shows it
        for (const op of this.outbox) this.applyLocal(op);
      }
      this.emit();
    }

    applyLocal(op) {
      const T = this.data[op.table];
      if (op.action === "insert") for (const r of op.rows) { if (!T.some((x) => x.id === r.id)) T.push(Object.assign({}, r)); }
      if (op.action === "update") for (const r of op.rows) { const x = T.find((y) => y.id === r.id); if (x) Object.assign(x, r); }
      if (op.action === "delete") this.data[op.table] = T.filter((x) => !op.ids.includes(x.id));
    }

    async write(op) {
      this.applyLocal(op);
      if (this.cfg.mode === "demo") { ls.set("prod:demo", this.data); this.emit(); return; }
      this.outbox.push(op); ls.set("prod:outbox", this.outbox);
      this.emit();
      await this.flush();
    }
    async flush() {
      if (this.busy || !this.outbox.length || this.cfg.mode !== "sheets") return;
      this.busy = true;
      try {
        while (this.outbox.length) {
          await this.call(this.outbox[0]);
          this.outbox.shift(); ls.set("prod:outbox", this.outbox);
        }
      } catch (e) {
        this.lastError = e.message;
      } finally { this.busy = false; this.emit(); }
    }
    insert(table, rows) { rows = rows.map((r) => Object.assign({ id: uid() }, r)); return this.write({ action: "insert", table, rows }).then(() => rows); }
    update(table, rows) { return this.write({ action: "update", table, rows }); }
    remove(table, ids) { return this.write({ action: "delete", table, ids }); }
    resetDemo() { localStorage.removeItem("prod:demo"); }
  }
  // values from Sheets come back as text/number/ISO date: normalise
  function norm(r) {
    const o = Object.assign({}, r);
    for (const k of ["qty", "tarif", "nilai", "urutan", "no_ikat", "lapis", "lebar_kain", "panjang_marker", "kain_terpakai", "ikat"]) if (o[k] !== "" && o[k] != null) o[k] = Number(o[k]);
    if ("aktif" in o) o.aktif = o.aktif === true || o.aktif === "TRUE" || o.aktif === "true" || o.aktif === 1;
    return o;
  }
  root.ProdDB = new DB();
  root.ProdUID = uid;
})(window);
