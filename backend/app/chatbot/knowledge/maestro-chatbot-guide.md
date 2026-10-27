# Panduan MAESTRO untuk konsultasi maintenance

## Batas kemampuan prediksi kondisi

MAESTRO mengklasifikasikan satu pembacaan empat sensor (arus, suhu, RPM, dan getaran) ke kelas NORMAL, WARNING, atau CRITICAL menggunakan Random Forest yang dilatih dari dataset proyek. Untuk M-16, status akhir juga dapat dinaikkan oleh penyaringan prototipe berbasis suhu dataset dan ambang arus motor yang diberikan. Confidence dan probabilitas tetap merupakan keluaran classifier sebelum penyaringan; keduanya bukan kepastian kondisi mesin. Penyaringan ini bukan batas keselamatan atau batas resmi pabrikan, tidak mengidentifikasi akar kerusakan, dan tidak memperkirakan durasi downtime.

Dataset proyek berisi 654 baris NORMAL, 512 WARNING, dan 514 CRITICAL. Arus 0,4–0,6 A banyak muncul pada ketiga label sehingga arus dataset sendiri tidak memisahkan kelas dengan baik. Rentang suhu pada file pelatihan adalah 25,0–36,0 °C untuk NORMAL, 36,0–38,8 °C untuk WARNING, dan 38,9–45,1 °C untuk CRITICAL. Rentang tersebut dipakai sebagai aturan demo M-16, bukan limit OEM yang tervalidasi. Nilai RPM dan getaran tetap diproses oleh classifier; unit/provenansinya belum dikonfirmasi untuk kalibrasi khusus JGY370.

## Cara menindaklanjuti hasil model

Untuk hasil NORMAL, lanjutkan pemantauan dan inspeksi rutin berdasarkan SOP lokasi. Untuk WARNING, validasi pembacaan sensor dan tinjau tren serta riwayat maintenance sebelum menentukan inspeksi. Untuk CRITICAL, eskalasi kepada teknisi yang bertanggung jawab dan ikuti prosedur keselamatan fasilitas. Keputusan menghentikan atau mengoperasikan mesin harus mengikuti SOP dan penilaian personel yang berwenang.

## Informasi awal saat konsultasi gangguan

Sertakan ID dan jenis mesin, gejala yang terlihat, waktu mulai, kondisi operasi saat gejala muncul, alarm yang tampil, serta perubahan terakhir pada proses atau maintenance. Jika tersedia, lampirkan nilai sensor dan catatan work order. Tanpa manual mesin, SOP, alarm, dan bukti inspeksi yang sesuai, chatbot tidak dapat memastikan root cause atau memberi prosedur perbaikan spesifik.

## Keselamatan

Jangan membuka pelindung, menyentuh bagian bergerak, atau melakukan pekerjaan pada peralatan berenergi berdasarkan jawaban chatbot. Isolasi energi, lockout/tagout, dan tindakan keselamatan lain hanya boleh dilakukan oleh personel terlatih sesuai prosedur resmi lokasi. Dalam kondisi berisiko, hentikan konsultasi dan hubungi teknisi atau supervisor.
