# Panduan Aplikasi Produksi Konveksi

Link aplikasi: **https://alta-ship-it.github.io/pattern-maker/produksi/**

Aplikasi ini untuk mengatur dan memantau produksi:
**SK/PO → cutting (ikat + label QR) → scan tiap proses → status → gaji borongan → laporan PDF.**

Aplikasinya bisa langsung dicoba dalam **mode coba**. Di mode ini data hanya tersimpan di HP itu saja. Supaya data tersimpan dan bisa dipakai bersama di beberapa HP, sambungkan ke **Google Sheets** dengan langkah di bawah. Cukup dilakukan sekali.

---

## A. Sambungkan ke Google Sheets (±10 menit, sebaiknya pakai laptop)

1. Buka **sheets.google.com**, lalu buat spreadsheet kosong baru. Beri nama, misalnya **Produksi Konveksi**.
2. Di spreadsheet itu, buka menu **Ekstensi → Apps Script**.
3. Hapus semua isi `Code.gs`. Lalu buka file **[Code.gs](./Code.gs)** di GitHub, tekan tombol **Copy raw file**, dan tempel ke Apps Script.
4. Di baris `const PIN = 'ganti-pin-ini';`, ganti `ganti-pin-ini` dengan PIN rahasia Kakak, minimal 6 karakter, misalnya `'pandera2026'`.
5. Tekan **Simpan** (ikon disket).
6. Di bagian atas, pilih fungsi **setup**, lalu tekan **Jalankan (Run)**.
   - Google akan minta izin. Pilih akun Kakak, lalu **Advanced → Go to … (unsafe) → Allow**. Peringatan ini muncul karena skripnya buatan sendiri, bukan dari toko aplikasi Google.
   - Setelah selesai, di spreadsheet muncul tab: penjahit, proses, sk, sk_item, marker, bundle, scan.
7. Tekan **Deploy → New deployment**:
   - Klik ikon roda gigi, lalu pilih **Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Tekan **Deploy**, lalu salin **Web app URL** (berakhiran `/exec`).
8. Buka aplikasi Produksi, lalu masuk ke **Menu → Pengaturan & Google Sheets**:
   - Pilih **Google Sheets**.
   - Tempel **Web app URL** dan isi **PIN** yang sama dengan langkah 4.
   - Tekan **Simpan & tes koneksi**. Kalau berhasil, muncul tulisan **✓ Tersambung**.
9. Di HP mandor dan admin lain, ulangi langkah 8 saja (URL + PIN yang sama).

> **Keamanan:** siapa pun yang tahu **URL + PIN** bisa membaca dan mengubah data produksi. Jangan dibagikan ke luar. Kalau PIN bocor, ganti PIN di Apps Script, lalu lakukan **Deploy → Manage deployments → Edit → Version: New version → Deploy**, dan ganti juga PIN di aplikasi.

> Kalau kode `Code.gs` diperbarui nanti, tempel ulang kodenya, lalu **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy**. URL-nya tetap sama.

---

## B. Alur pemakaian sehari-hari

1. **Menu → Proses & tarif**: atur urutan proses (Cutting, Jahit, Obras, Overdeck, QC, Packing) dan tarif borongan per pcs.
2. **Menu → Penjahit**: masukkan nama penjahit/karyawan dan bagiannya.
3. **SK → + SK baru**: isi customer, PO, model, deadline, catatan, dan jumlah per warna × size. Tarif khusus untuk SK ini juga bisa diisi kalau berbeda dari tarif standar.
4. **Setelah cutting**: buka SK, catat marker (lebar kain, panjang marker, jumlah lapis), lalu tekan **Buat ikat** (misalnya 12 pcs/ikat).
5. **Cetak label QR**: pilih kertas stiker A4 isi 24 (70×37 mm) atau printer label thermal 50×30 mm. Tempel satu label di tiap ikat.
6. **Scan**: tiap kali satu proses selesai, mandor menekan **Scan**, mengarahkan kamera ke label, lalu memilih proses dan nama penjahit, kemudian **Simpan**.
   - Kalau sinyal hilang, scan tetap tersimpan di HP dan dikirim otomatis saat sinyal kembali. Statusnya terlihat di pojok kanan atas: "⏳ belum terkirim".
   - Kalau ada scan yang salah, hapus di **Status → Hapus scan yang salah** (hanya untuk scan hari ini).
7. **Status**: progres tiap SK per proses dan jumlah pcs hari ini.
8. **Gaji**: pilih periode (minggu ini, minggu lalu, atau bulan ini). Total per penjahit terhitung otomatis. Rekap dan slip per orang bisa di-download sebagai PDF.

## C. Laporan PDF

- **Laporan cutting & marker**: jumlah order, pemakaian kain (m dan cm/pcs), serta daftar ikat.
- **Laporan produksi**: progres tiap proses, hasil per warna/size, dan siapa yang mengerjakan.
- **Rekap gaji & slip gaji**: per periode.
- **Pola**: tombol **Pola (Pattern Maker)** membuka aplikasi Pattern Maker.

Semua data juga bisa dilihat langsung di Google Sheets, misalnya untuk dibuat grafik atau pivot.
