# Pattern Maker ✂️

Link aplikasi: **https://alta-ship-it.github.io/pattern-maker/**

Aplikasi web untuk membuat **pola jahit otomatis dari size chart**. Isi ukuran jadi (flat) per size, lalu semua size langsung jadi pola bertumpuk (nested). Polanya bisa didownload sebagai:

- **PDF Plotter 1:1**: satu lembar panjang untuk plotter konveksi (lebar 90 / 120 / 150 / 165 / 183 cm)
- **PDF A4**: untuk print di rumah, lengkap dengan halaman petunjuk, peta sambungan halaman, dan kotak uji 5×5 cm

Aplikasi ini jalan sepenuhnya di browser (HP atau laptop) tanpa server dan tanpa login. Size chart yang diisi tersimpan otomatis di browser.

## Model yang tersedia

| Model | Potongan |
|---|---|
| Kaos Oblong | badan depan, badan belakang, lengan, rib leher |
| Kemeja Lengan Panjang | badan depan (plaket lipat), badan belakang (lipit), yoke, lengan, kerah, kaki kerah, manset, plaket belahan, kantong dada |
| Coach Jacket | badan depan, badan belakang, yoke, lengan, kerah, facing, kantong dada, bis kantong, kantong dalam |
| Celana Pinggang Karet | celana depan, celana belakang, ban pinggang, kantong samping |
| Rok A-Line | rok depan, rok belakang, ban pinggang |

Semua pola sudah termasuk kampuh, kelim, takik (1 = depan, 2 = belakang), arah serat, tanda lipat kain, dan posisi kancing atau kantong.

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
- `app.js`, `index.html`: tampilan aplikasi.
- `lib/jspdf.umd.min.js`: jsPDF 2.5.1 (MIT).
- `tools/generate-samples.js`: membuat contoh PDF semua model lewat Node (`npm install && npm run samples`).

### Menambah model baru

Tambahkan entri di `MODELS` dalam `engine.js` dengan isi `name`, `desc`, `fields` (kolom size chart), `chart` (contoh ukuran), `params`, dan `draft(m, p)`. Fungsi `draft` mengembalikan `{ pieces, checks }`. Setiap potongan adalah `new Piece({ name, cut, edges, grain, label, fold })`. `edges` berisi daftar `[titik-titik, kampuh]` yang berurutan **berlawanan arah jarum jam**, dan garis potongnya dihitung otomatis.
