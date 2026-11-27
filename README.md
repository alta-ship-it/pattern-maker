# Pattern Maker ✂️

Link aplikasi: **https://alta-ship-it.github.io/pattern-maker/**

Aplikasi web untuk membuat **pola jahit otomatis dari size chart**. Isi ukuran jadi (flat) per size, lalu semua size langsung jadi pola bertumpuk (nested). Polanya bisa didownload sebagai:

- **PDF Plotter 1:1**: satu lembar panjang untuk plotter konveksi (lebar 90 / 120 / 150 / 165 / 183 cm)
- **PDF A4**: untuk print di rumah, lengkap dengan halaman petunjuk, peta sambungan halaman, dan kotak uji 5×5 cm

Aplikasi ini jalan sepenuhnya di browser (HP atau laptop) tanpa server dan tanpa login. Size chart yang diisi tersimpan otomatis di browser.

## Aplikasi Produksi (`/produksi`)

Link: **https://alta-ship-it.github.io/pattern-maker/produksi/**

Aplikasi ini mencakup SK/PO per warna × size, catatan marker, pembuatan ikat + label QR (stiker A4 isi 24 atau thermal 50×30), scan QR pakai kamera HP untuk mencatat proses dan penjahit, status produksi, gaji borongan otomatis (rekap + slip PDF), serta laporan cutting dan laporan produksi. Data disimpan di Google Sheets milik sendiri lewat Apps Script. Cara pasangnya ada di [produksi/PANDUAN.md](produksi/PANDUAN.md). Aplikasinya juga punya mode coba yang langsung bisa dipakai tanpa setup.

## Upload file dari client

Di bagian **Upload file dari client** Kakak bisa memasukkan file dari client:

- **Excel / CSV**: size chart langsung dibaca ke tabel.
- **Foto / screenshot size chart**: tulisannya dibaca otomatis (OCR).
- **PDF (PO / tech pack)**: teksnya dibaca untuk menebak model dan mencari size chart, dan halaman pertamanya disimpan sebagai gambar referensi.
- **Gambar mockup**: disimpan sebagai referensi dan ikut dicetak di PDF pola.

Model ditebak dari tulisan di file (misalnya "coach jacket", "kemeja", "celana"). Ukuran lingkar penuh otomatis dibagi 2 menjadi ukuran flat, dan kolom yang tidak ada diisi angka contoh. Semua hal itu ditampilkan sebagai catatan supaya bisa dicek ulang. Tombol **Batalkan** mengembalikan tabel seperti sebelum upload. Semua file diproses di browser dan tidak dikirim ke server mana pun.

## Model yang tersedia

### Pola FreeSewing (sudah teruji komunitas)

Pola-pola ini memakai desain dari [FreeSewing](https://freesewing.eu) (lisensi MIT, boleh dipakai komersial). Size chart tetap diisi dengan **ukuran jadi (flat)**. Aplikasi mengubahnya otomatis menjadi ukuran badan dan ease, lalu mencocokkan hasilnya dengan size chart. Lebar dada, panjang, bahu, lengan, pesak, dan lebar bawah disetel ulang sampai cocok. Hasilnya bisa dicek di tabel **Cek ukuran pola**.

| Model | Desain FreeSewing |
|---|---|
| Kaos | Teagan |
| Kemeja | Simon |
| Sweater crewneck | Sven |
| Hoodie raglan | Hugo |
| Celana chino | Charlie |
| Celana karet / jogger | Paco |
| Rok pensil | Penelope |
| Rok lingkar / payung | Sandy |

### Pola buatan Pattern Maker

| Model | Potongan |
|---|---|
| Kaos Oversize (drop shoulder) | badan depan, badan belakang, lengan, rib kerah (tanda sambungan di tengah belakang); lebar kerung leher & rib bisa diatur |
| Kaos Oblong | badan depan, badan belakang, lengan, rib leher |
| Kemeja Lengan Panjang | badan depan (plaket lipat), badan belakang (lipit), yoke, lengan, kerah, kaki kerah, manset, plaket belahan, kantong dada |
| Coach Jacket | badan depan, badan belakang, yoke, lengan, kerah, facing, kantong dada, bis kantong, kantong dalam |
| Celana Pinggang Karet | celana depan, celana belakang, ban pinggang, kantong samping |
| Rok A-Line | rok depan, rok belakang, ban pinggang |

Semua pola sudah termasuk kampuh, kelim, takik (1 = depan, 2 = belakang), arah serat, tanda lipat kain, dan posisi kancing atau kantong.

## Toleransi, susut bahan & catatan penjahit

- **Toleransi client** (misalnya −0 / +1 cm): tabel cek ukuran menandai hijau kalau ukuran masuk toleransi dan merah kalau di luar toleransi.
- **Buat pola lebih besar**: semua ukuran ditambah sekian cm supaya aman, misalnya +0,5 cm kalau client tidak mau ukuran kurang.
- **Susut bahan (%)**: pola diperbesar sesuai susut panjang dan lebar dari hasil tes cuci.
- **Catatan penjahit**: ikut tercetak di PDF. Saat file client di-upload, catatan seperti rib, leher, jahitan, dan toleransi diambil otomatis dari guideline.

## Cara pakai

1. Buka aplikasi (GitHub Pages repo ini).
2. Pilih model.
3. Isi size chart. Size bisa ditambah, dihapus, atau diganti namanya.
4. Atur kampuh dan kelim kalau perlu.
5. Cek bagian **Cek ukuran pola**. Bagian ini membandingkan ukuran hasil pola dengan size chart, dan panjang kerung lengan dengan puncak lengan.
6. Download PDF. Saat print, pilih **100% / Actual size**, lalu ukur kotak uji.

> ⚠️ Wajib jahit sampel 1 size dulu sebelum produksi massal. Pola dibuat dengan rumus konstruksi standar, jadi hasilnya perlu dicoba pada bahan dan model yang sebenarnya.

## Struktur kode

- `engine.js`: mesin pola. Isinya geometri, kampuh otomatis, dan rumus tiap model (`MODELS`).
- `pdf.js`: susunan potongan, export PDF plotter dan A4 (jsPDF), dan preview SVG.
- `fsmodels.js`: adaptor FreeSewing yang mengubah size chart ke ukuran badan, menyetel ulang ukuran, lalu mengubah potongan FreeSewing ke format Pattern Maker.
- `lib/freesewing.js`: bundle FreeSewing v4.10.2 (MIT, lihat `lib/FREESEWING-LICENSE.txt`).
- `tools/test-fs.js`: cek target vs hasil semua model FreeSewing (`node tools/test-fs.js`).
- `importer.js`: membaca size chart dari Excel/CSV/OCR dan menebak model.
- `app.js`, `index.html`: tampilan aplikasi. Library SheetJS, Tesseract.js (OCR), dan pdf.js baru dimuat dari CDN saat ada file yang di-upload.
- `lib/jspdf.umd.min.js`: jsPDF 2.5.1 (MIT).
- `tools/generate-samples.js`: membuat contoh PDF semua model lewat Node (`npm install && npm run samples`).

### Menambah model baru

Tambahkan entri di `MODELS` dalam `engine.js` dengan isi `name`, `desc`, `fields` (kolom size chart), `chart` (contoh ukuran), `params`, dan `draft(m, p)`. Fungsi `draft` mengembalikan `{ pieces, checks }`. Setiap potongan adalah `new Piece({ name, cut, edges, grain, label, fold })`. `edges` berisi daftar `[titik-titik, kampuh]` yang berurutan **berlawanan arah jarum jam**, dan garis potongnya dihitung otomatis.
