# Smart Audit di Vercel

Jalankan proyek dari folder induk **Smart Audit**. Vercel Functions menangani permintaan aplikasi, Neon Postgres menyimpan data bersama, dan Vercel Blob Private menyimpan lampiran. Pengunjung langsung masuk Dashboard dan dapat membaca, menambah, mengubah, serta menghapus data bersama.

## Persiapan

1. Hubungkan proyek Vercel ke **Neon Free** dan pastikan variabel `DATABASE_URL` tersedia.
2. Hubungkan penyimpanan **Vercel Blob Private** untuk mengisi `BLOB_READ_WRITE_TOKEN`.

Jalankan `npm ci`, `npm test`, dan `npm run build` untuk menguji paket lokal. Vercel membaca konfigurasi build dari `vercel.json`. Aplikasi menyiapkan tabel pada permintaan pertama dan menampilkan klien berlabel **Contoh BKI** di ruang kerja baru.

## Memindahkan data

Buka Smart Audit tempat data tersimpan, pilih **Cadangkan Data**, lalu impor JSON lewat **Impor Cadangan** di situs Vercel. Klien dengan ID yang sudah ada dilewati. Berkas diunggah langsung ke Blob Private dengan izin sementara. Pengunjung bisa mengunduhnya melalui aplikasi. Batasnya 10 MB per berkas.

Paket Vercel Hobby ditujukan untuk proyek pribadi nonkomersial. Pilih Neon Free dan periksa paket setiap layanan saat menyiapkan proyek. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Postgres](https://vercel.com/docs/postgres) · [Vercel Blob Private](https://vercel.com/docs/vercel-blob/private-storage)
