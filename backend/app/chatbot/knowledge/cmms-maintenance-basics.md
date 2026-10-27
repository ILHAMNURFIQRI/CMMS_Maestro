# Dasar CMMS dan maintenance untuk MAESTRO

Dokumen ini berisi pengetahuan umum untuk membantu menjawab pertanyaan dasar
tentang CMMS, pemeliharaan, sensor, dan analisis data. Isinya bukan spesifikasi
mesin, SOP fasilitas, atau batas alarm MAESTRO. Untuk keputusan operasional,
gunakan dokumentasi OEM, prosedur lokasi, dan personel yang berwenang.

## Identitas proyek MAESTRO

MAESTRO (Manufacturing Execution & Synchronization Tracker) dibuat oleh tim
"TIm Restu Mamah Papah". Jika ditanya siapa pencipta atau pembuat MAESTRO,
jawab bahwa proyek ini dibuat oleh tim tersebut. Nama anggota tim terdiri dari Bintang Sobri, Ilham Nur Fiqri, Fauzan Nafizha dan Muhammad Daffi Izzudin. Mereka adalah mahasiswa Politeknik Manufaktur Bandung.

## Apa itu CMMS
CMMS adalah Computerized Maintenance Management System, yaitu sistem untuk
mencatat aset, aktivitas pemeliharaan, permintaan pekerjaan, work order, suku
cadang, dan riwayat pekerjaan. Tujuannya membantu tim menjaga keterlacakan
pekerjaan dan membuat keputusan berdasarkan catatan yang konsisten.

CMMS dapat membantu menjawab pertanyaan seperti:

- Mesin apa saja yang terdaftar dan di area mana mesin berada?
- Pekerjaan maintenance apa yang masih terbuka?
- Kapan inspeksi atau perawatan terakhir dicatat?
- Gangguan apa yang sering muncul pada periode tertentu?
- Berapa lama mesin tercatat tidak beroperasi?

Jawaban faktual tentang isi MAESTRO harus menggunakan data terkini dari
database. Jangan menyimpulkan jumlah mesin, work order, atau kondisi aktual
hanya dari dokumen pengetahuan umum.

## Aset dan hierarki mesin

Aset adalah mesin atau komponen yang dikelola dan memiliki identitas unik.
Informasi aset yang bermanfaat dapat meliputi ID, nama, jenis, area, lini
produksi, status, dan hubungan dengan aset induk. Gunakan ID mesin yang tepat
ketika meminta data agar catatan beberapa mesin tidak tercampur.

Jumlah aset terdaftar dapat berbeda dari jumlah mesin yang sedang beroperasi.
Status seperti aktif, tidak aktif, rusak, atau dalam perawatan harus dibaca
dari definisi status aplikasi dan data terkini, bukan diasumsikan dari jumlah
aset.

## Jenis pemeliharaan

### Pemeliharaan korektif

Pemeliharaan korektif dilakukan untuk memperbaiki gangguan atau kerusakan yang
telah ditemukan. Prioritas dan waktu pengerjaan ditentukan oleh dampak,
risiko keselamatan, kebutuhan produksi, ketersediaan teknisi, dan prosedur
fasilitas.

### Pemeliharaan preventif

Pemeliharaan preventif dijadwalkan berdasarkan interval waktu, jam operasi,
siklus, atau rekomendasi pabrikan. Contohnya inspeksi berkala atau penggantian
komponen sesuai jadwal resmi. Interval tidak boleh ditentukan oleh chatbot
tanpa data OEM atau SOP yang sesuai.

### Pemeliharaan prediktif

Pemeliharaan prediktif menggunakan pengamatan kondisi dan tren untuk membantu
mengenali perubahan sebelum kegagalan. Sumbernya dapat mencakup data sensor,
inspeksi, analisis oli, histori gangguan, dan catatan operasi. Prediksi adalah
bahan untuk verifikasi dan perencanaan, bukan jaminan bahwa kegagalan akan
terjadi pada waktu tertentu.

### Pemeliharaan berbasis kondisi

Pemeliharaan berbasis kondisi meninjau keadaan aktual aset untuk menentukan
apakah inspeksi atau tindakan diperlukan. Interpretasi perlu mempertimbangkan
konteks operasi, sensor dan pemasangannya, kualitas data, tren, serta
rekomendasi pabrikan.

## Work order dan catatan pekerjaan

Work order adalah catatan formal tentang pekerjaan maintenance yang perlu
dilakukan atau sudah dilakukan. Work order yang berguna biasanya mencatat:

- ID mesin dan lokasi.
- Gejala atau permintaan pekerjaan.
- Prioritas dan alasan penetapannya.
- Waktu dibuat, mulai, selesai, atau ditunda.
- Teknisi atau tim yang bertanggung jawab.
- Temuan inspeksi, tindakan, dan komponen yang digunakan.
- Status pekerjaan dan verifikasi setelah pekerjaan.

Status work order dapat berbeda antarorganisasi. Contoh alur umum adalah
permintaan, peninjauan, disetujui, dijadwalkan, dikerjakan, menunggu material,
selesai, dan diverifikasi. Gunakan status yang benar-benar didefinisikan di
MAESTRO; jangan menganggap semua status contoh tersebut tersedia.

Catatan pekerjaan sebaiknya memisahkan gejala yang dilaporkan, temuan yang
diamati, tindakan yang dilakukan, dan hasil verifikasi. Hindari menulis
kesimpulan root cause sebagai fakta jika belum diperiksa atau dibuktikan.

## Prioritas pemeliharaan

Prioritas pekerjaan sebaiknya ditetapkan berdasarkan aturan organisasi dan
penilaian personel berwenang. Faktor yang dapat dipertimbangkan antara lain:

- Risiko terhadap keselamatan dan lingkungan.
- Dampak terhadap produksi dan kualitas.
- Tingkat keparahan dan perkembangan gangguan.
- Ketersediaan redundansi atau mesin pengganti.
- Kebutuhan suku cadang dan kompetensi teknisi.
- Kewajiban regulasi atau inspeksi.

Label prioritas seperti rendah, sedang, tinggi, atau kritis tidak memiliki
arti universal. Ikuti matriks prioritas resmi fasilitas dan jangan menyamakan
label prediksi model dengan persetujuan otomatis untuk menghentikan atau
mengoperasikan mesin.

## Data sensor dan kualitas pembacaan

Sensor mengukur besaran tertentu. Arus listrik, suhu, RPM, dan getaran dapat
memberi petunjuk tentang kondisi operasi, tetapi satu nilai saja biasanya
tidak cukup untuk memastikan penyebab gangguan.

- Arus menunjukkan besaran arus listrik yang terukur pada kondisi dan titik
  pengukuran tertentu. Beban, tegangan, jenis motor, pemasangan, dan alat ukur
  dapat memengaruhi interpretasinya.
- Suhu menunjukkan temperatur pada lokasi sensor. Temperatur lingkungan,
  beban, aliran pendingin, lokasi sensor, dan waktu stabilisasi perlu
  dipertimbangkan.
- RPM adalah jumlah putaran per menit. Nilai dapat dipengaruhi set point,
  beban, rasio transmisi, dan metode pengukuran.
- Getaran adalah gerakan osilasi yang terukur pada titik dan arah tertentu.
  Dudukan sensor, arah ukur, kecepatan mesin, kondisi beban, dan metode
  pengolahan dapat memengaruhi hasil.

Sebelum menafsirkan nilai yang tidak biasa, periksa apakah timestamp dan ID
mesin benar, satuan konsisten, sensor terpasang dan berfungsi, sumber data
sesuai, serta pembacaan diambil pada kondisi operasi yang sebanding. Periksa
tren dan catatan inspeksi sebelum menyimpulkan perubahan kondisi.

Nilai sensor yang lebih tinggi atau lebih rendah tidak otomatis berarti mesin
rusak. MAESTRO tidak menetapkan ambang universal dalam dokumen ini. Gunakan
batas yang disahkan untuk model mesin dan kondisi operasinya.

## Tren, baseline, dan anomali

Baseline adalah gambaran kondisi normal yang dibentuk dari pengamatan yang
representatif dan tervalidasi. Baseline perlu mencakup kondisi operasi yang
relevan; membandingkan mesin berbeda atau kondisi beban berbeda dapat
menyesatkan.

Tren menunjukkan perubahan nilai sepanjang waktu. Tren dapat membantu
menentukan kapan inspeksi lebih lanjut diperlukan, tetapi korelasi atau
perubahan bersamaan bukan bukti penyebab. Catat perubahan beban, set point,
lingkungan, perawatan, dan penggantian sensor saat membandingkan periode.

Anomali adalah pola yang berbeda dari perilaku yang diharapkan oleh metode
deteksi yang digunakan. Anomali bukan diagnosis kerusakan. Verifikasi alarm
dengan pengukuran, inspeksi yang aman, dan sumber teknis yang sesuai.

## Downtime dan metrik keandalan

Definisi downtime, planned production time, dan failure harus disepakati
sebelum menghitung atau membandingkan kinerja. Perusahaan dapat menggunakan
aturan pencatatan yang berbeda.

Contoh metrik yang umum:

- Downtime adalah durasi mesin tidak tersedia sesuai definisi operasi yang
  digunakan organisasi. Catatan sebaiknya menyimpan waktu mulai dan selesai
  beserta alasan dan status yang konsisten.
- MTBF (Mean Time Between Failures) umumnya dihitung sebagai total waktu
  operasi dalam periode dibagi jumlah kegagalan yang memenuhi definisi.
- MTTR (Mean Time To Repair) umumnya dihitung sebagai total durasi perbaikan
  dalam periode dibagi jumlah pekerjaan perbaikan yang dihitung.
- Availability sering dihitung sebagai waktu tersedia dibagi waktu yang
  dijadwalkan untuk operasi. Rumus dan perlakuan planned downtime harus
  ditetapkan oleh organisasi.

Metrik hanya bermakna jika periode, unit, definisi kegagalan, dan kelengkapan
data jelas. Jangan membuat angka downtime, MTBF, MTTR, atau availability jika
catatan sumber tidak tersedia atau definisinya belum diketahui.

## Analisis data maintenance

Analisis historis dapat mengelompokkan gangguan berdasarkan mesin, kategori,
periode, area, atau status work order. Analisis membantu menemukan pola untuk
ditinjau, tetapi hasilnya tidak otomatis membuktikan hubungan sebab-akibat.

Sebelum mempercayai analisis, periksa:

- Apakah data mencakup seluruh periode dan mesin yang dimaksud?
- Apakah kategori dan status digunakan secara konsisten?
- Apakah timestamp, satuan, dan zona waktu seragam?
- Apakah data kosong atau duplikat memengaruhi hasil?
- Apakah perubahan operasi atau kebijakan pencatatan terjadi selama periode?

Untuk membandingkan periode, gunakan rentang waktu dan aturan yang sama.
Laporkan keterbatasan data dan hindari menyatakan hubungan sebab-akibat hanya
berdasarkan korelasi.

## Cara meminta bantuan chatbot

Pertanyaan yang menyertakan konteks biasanya lebih mudah dijawab. Sertakan
topik atau nama fitur MAESTRO, ID mesin bila relevan, periode waktu, nilai
sensor beserta satuannya, status yang ditampilkan, dan informasi yang ingin
diketahui.

Contoh pertanyaan:

- "Berapa mesin yang terdaftar di MAESTRO saat ini?"
- "Apa perbedaan pemeliharaan preventif dan prediktif?"
- "Apa arti nilai RPM dan informasi apa yang perlu dicek sebelum
  membandingkannya?"
- "Apa informasi yang sebaiknya dicatat pada work order gangguan?"
- "Ringkas pembacaan sensor terbaru mesin M-16." Pilih M-16 di dropdown agar
  chatbot dapat membaca konteks mesin.
- "Apa arti hasil WARNING pada model MAESTRO dan apa batas interpretasinya?"

Jika pertanyaan meminta data terbaru tetapi belum menyebut mesin atau periode,
chatbot mungkin perlu meminta klarifikasi atau meminta pengguna memilih mesin.
Jangan memasukkan kredensial, token API, data pribadi, atau informasi rahasia
ke percakapan.

## Batas jawaban chatbot

Chatbot membantu menjelaskan konsep dan merangkum dokumen atau data yang
tersedia. Chatbot tidak menggantikan teknisi, operator berwenang, manual OEM,
SOP fasilitas, inspeksi, atau sistem keselamatan.

Jika bukti tidak tersedia, jawaban harus menyatakan keterbatasan dan meminta
informasi yang diperlukan. Chatbot tidak boleh mengarang angka, status
terkini, penyebab pasti, batas alarm, jadwal perawatan, atau prosedur
perbaikan.

Jangan meminta chatbot menjalankan tindakan pada mesin. Jangan membuka
pelindung, menyentuh bagian bergerak, atau bekerja pada peralatan berenergi
berdasarkan jawaban chatbot. Isolasi energi dan lockout/tagout hanya dilakukan
oleh personel terlatih sesuai prosedur resmi lokasi.
