/**
 * Pattern Maker — Produksi: backend Google Sheets (Google Apps Script)
 *
 * CARA PASANG (sekali saja):
 * 1. Buat Google Sheets baru (mis. "Produksi Konveksi").
 * 2. Menu Ekstensi → Apps Script. Hapus isi Code.gs, tempel SEMUA isi file ini.
 * 3. Ganti PIN di bawah (angka/huruf bebas, minimal 6 karakter). PIN ini juga diisi di aplikasi.
 * 4. Klik Simpan, lalu jalankan fungsi "setup" sekali (pilih setup → Run → izinkan akses).
 * 5. Deploy → New deployment → jenis "Web app"
 *      Execute as: Me        Who has access: Anyone
 *    → Deploy → salin "Web app URL" → tempel di aplikasi (Menu → Pengaturan).
 * Kalau kode ini diubah lagi: Deploy → Manage deployments → Edit → Version: New version → Deploy.
 */

const PIN = 'ganti-pin-ini';

const TABLES = {
  penjahit: ['id', 'nama', 'bagian', 'hp', 'aktif'],
  proses: ['id', 'nama', 'urutan', 'tarif', 'aktif'],
  sk: ['id', 'no_sk', 'tanggal', 'customer', 'no_po', 'model', 'deadline', 'catatan', 'status', 'tarif_json', 'ikat', 'dibuat'],
  sk_item: ['id', 'sk_id', 'warna', 'size', 'qty'],
  marker: ['id', 'sk_id', 'tanggal', 'lebar_kain', 'panjang_marker', 'lapis', 'kain_terpakai', 'catatan'],
  bundle: ['id', 'sk_id', 'no_ikat', 'warna', 'size', 'qty', 'tanggal'],
  scan: ['id', 'waktu', 'bundle_id', 'sk_id', 'proses_id', 'penjahit_id', 'qty', 'tarif', 'nilai', 'oleh', 'catatan'],
};

function setup() {
  Object.keys(TABLES).forEach(sheetFor_);
  if (PIN === 'ganti-pin-ini') throw new Error('Ganti dulu PIN di baris atas, lalu jalankan setup lagi.');
}

function doGet(e) { return handle_(e && e.parameter ? e.parameter : {}); }
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* ignore */ }
  return handle_(body);
}

function handle_(req) {
  try {
    if (PIN === 'ganti-pin-ini') return out_({ ok: false, error: 'PIN di Apps Script belum diganti' });
    if (String(req.pin) !== PIN) return out_({ ok: false, error: 'PIN salah' });
    const a = req.action;
    if (a === 'ping') return out_({ ok: true, name: SpreadsheetApp.getActive().getName() });
    if (a === 'all') {
      const data = {};
      Object.keys(TABLES).forEach(function (t) { data[t] = read_(t); });
      return out_({ ok: true, data: data });
    }
    if (!TABLES[req.table]) return out_({ ok: false, error: 'tabel tidak dikenal' });
    if (a === 'list') return out_({ ok: true, rows: read_(req.table) });
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (a === 'insert') { insert_(req.table, req.rows || []); return out_({ ok: true }); }
      if (a === 'update') { update_(req.table, req.rows || []); return out_({ ok: true }); }
      if (a === 'delete') { delete_(req.table, req.ids || []); return out_({ ok: true }); }
    } finally { lock.releaseLock(); }
    return out_({ ok: false, error: 'aksi tidak dikenal' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function sheetFor_(t) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(t);
  if (!sh) {
    sh = ss.insertSheet(t);
    sh.getRange(1, 1, 1, TABLES[t].length).setValues([TABLES[t]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function read_(t) {
  const sh = sheetFor_(t), cols = TABLES[t];
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const vals = sh.getRange(2, 1, n, cols.length).getValues();
  return vals.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const o = {};
    cols.forEach(function (c, i) {
      o[c] = r[i] instanceof Date ? Utilities.formatDate(r[i], Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss") : r[i];
    });
    return o;
  });
}

// cells must never become formulas
function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function insert_(t, rows) {
  if (!rows.length) return;
  const sh = sheetFor_(t), cols = TABLES[t];
  const vals = rows.map(function (r) { return cols.map(function (c) { return cell_(r[c]); }); });
  sh.getRange(sh.getLastRow() + 1, 1, vals.length, cols.length).setValues(vals);
}

function rowIndex_(sh) {
  const n = sh.getLastRow() - 1, idx = {};
  if (n < 1) return idx;
  sh.getRange(2, 1, n, 1).getValues().forEach(function (r, i) { idx[String(r[0])] = i + 2; });
  return idx;
}

function update_(t, rows) {
  const sh = sheetFor_(t), cols = TABLES[t], idx = rowIndex_(sh);
  rows.forEach(function (r) {
    const row = idx[String(r.id)];
    if (!row) return;
    cols.forEach(function (c, i) { if (c !== 'id' && r.hasOwnProperty(c)) sh.getRange(row, i + 1).setValue(cell_(r[c])); });
  });
}

function delete_(t, ids) {
  const sh = sheetFor_(t), idx = rowIndex_(sh);
  ids.map(function (id) { return idx[String(id)]; }).filter(Boolean).sort(function (a, b) { return b - a; })
    .forEach(function (row) { sh.deleteRow(row); });
}
