# Smart Audit Online

Smart Audit Online menjalankan tampilan web yang sama dengan backend JavaScript. Data audit dibagikan di satu ruang kerja. Semua orang bisa membuka alamat situs. Anggota tim memakai kode masuk yang sama untuk melihat dan menyunting isi ruang kerja.

Salinan lokal HTML masih memakai penyimpanan browser. Ruang kerja online yang baru akan memuat klien berlabel **Contoh BKI** saat anggota pertama masuk. Lampiran baru disimpan di server versi online dengan batas 10 MB per berkas.

## Pindahkan data lokal mentor

1. Di laptop mentor, buka HTML versi terbaru dari nama file, folder, dan profil browser yang biasa dipakai untuk melihat data asli.
2. Pastikan klien yang ingin dipindah muncul. Klik **Cadangkan Data** untuk mengunduh satu file JSON.
3. Masuk ke Smart Audit online dengan kode tim, lalu klik **Impor Cadangan** dan pilih JSON tersebut. Klien dengan ID yang sudah ada akan dilewati.

Cadangan mencakup profil, audit, dan lampiran yang tersedia di browser, hingga 80 MB per file cadangan. Arsip dari versi yang hanya mencatat nama berkas akan tetap muncul dengan nama yang tersimpan. Simpan file cadangan di tempat yang hanya bisa diakses orang yang berwenang.

## Coba di komputer sendiri

Buka terminal di folder `online`. Dengan Node.js 22.12 atau yang lebih baru, jalankan `npm start`. Buka [Smart Audit lokal](http://127.0.0.1:8787/). Kode masuk lokal ada di `online/.data/access-code.txt`. Aplikasi memakai SQLite lokal, dan data tetap ada setelah server dimulai ulang. Folder `.data` berisi data pribadi untuk pengembangan lokal dan dikecualikan dari Git.

Jalankan `npm test` dari folder `online` untuk memeriksa login, akses lintas sesi, konflik penyimpanan, dan lampiran. Jalankan `npm run build` setelah mengubah HTML jika hendak menerbitkan versi baru.

## Terbitkan dengan Cloudflare Workers Free

1. Buka terminal di folder `online` dan masuk ke akun Cloudflare pemilik situs.

   ```powershell
   npx wrangler@4 login
   ```

2. Buat paket web dan terbitkan. Wrangler menyiapkan D1 dan KV yang terhubung ke aplikasi.

   ```powershell
   npm run build
   npx wrangler@4 deploy
   ```

3. Tambahkan kode masuk produksi.

   ```powershell
   npx wrangler@4 secret put TEAM_ACCESS_CODE
   ```

   Masukkan kode masuk produksi yang baru saat Wrangler meminta nilai rahasia. Gunakan minimal 20 karakter. Kode masuk produksi tersimpan sebagai secret Cloudflare. Aplikasi menyiapkan tabel database saat percobaan masuk pertama. Bagikan alamat `workers.dev` yang ditampilkan Wrangler kepada pengguna, dan sampaikan kode kepada anggota tim yang boleh mengakses data.

GitHub bisa digunakan untuk menyimpan kode proyek. Cloudflare menjalankan backend, D1, dan KV. Paket gratis memiliki batas pemakaian. Perubahan data bisa dibaca sesi lain dengan tombol **Muat Ulang**. Berkas yang baru diunggah bisa memerlukan waktu untuk muncul di lokasi lain.

[Deploy Worker](https://developers.cloudflare.com/workers/get-started/guide/) · [Harga D1](https://developers.cloudflare.com/d1/platform/pricing/) · [Harga KV](https://developers.cloudflare.com/kv/platform/pricing/) · [Cara kerja KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
