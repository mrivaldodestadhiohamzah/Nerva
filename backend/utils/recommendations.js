const SEVERITY_RANK = {
  stabil: 1,
  ringan: 2,
  sedang: 3,
  tinggi: 4,
  sangat_tinggi: 5,
};

const UNSAFE_PATTERNS = [
  /anda mengalami depresi/i,
  /kamu mengalami depresi/i,
  /diagnosis/i,
  /mendiagnosis/i,
  /pasti sembuh/i,
  /pasti mengalami/i,
  /gangguan jiwa/i,
  /minum obat/i,
];

function t(id, title, explanation, recommendation, intensity = 2) {
  return { id, title, explanation, recommendation, intensity };
}

export const RECOMMENDATION_TEMPLATES = {
  kondisi_stabil: [
    t("stabil_01", "Pertahankan ritme yang membantu", "Hasil menunjukkan kondisi yang relatif stabil saat ini.", "Coba lanjutkan kebiasaan yang sudah terasa membantu, seperti tidur cukup, makan teratur, dan memberi jeda saat aktivitas mulai padat.", 1),
    t("stabil_02", "Rawat kebiasaan kecil", "Kondisi terlihat cukup terkendali, sehingga fokus utama adalah menjaga keseimbangan.", "Pilih satu kebiasaan sederhana yang ingin dipertahankan minggu ini, misalnya berjalan sebentar, merapikan jadwal, atau menulis catatan singkat tentang perasaan.", 1),
    t("stabil_03", "Tetap peka pada perubahan", "Walau hasilnya rendah, perubahan emosi kecil tetap layak diperhatikan.", "Luangkan waktu beberapa menit tiap hari untuk mengenali apa yang membuat tubuh terasa lebih tenang atau lebih tegang.", 1),
    t("stabil_04", "Jaga ruang istirahat", "Kondisi yang baik lebih mudah dipertahankan saat tubuh punya waktu pulih.", "Sisihkan waktu tanpa tuntutan, meski singkat, agar pikiran tidak terus berada dalam mode mengejar tugas.", 1),
    t("stabil_05", "Bangun rutinitas ringan", "Hasil saat ini mengarah pada tekanan yang masih rendah.", "Pertahankan rutinitas sederhana yang realistis, bukan rutinitas yang terlalu banyak sampai terasa seperti beban baru.", 1),
    t("stabil_06", "Gunakan curhat sebagai refleksi", "Curhat dapat membantu mengenali pola emosi sebelum tekanan terasa besar.", "Coba tulis satu hal yang berjalan baik dan satu hal yang perlu diperbaiki agar kamu tetap punya gambaran tentang kondisi diri.", 1),
    t("stabil_07", "Jaga koneksi sosial", "Dukungan ringan dari orang sekitar bisa membantu menjaga suasana hati.", "Tetap terhubung dengan orang yang membuatmu merasa aman, meski hanya lewat obrolan singkat.", 1),
    t("stabil_08", "Beri batas sehat", "Kondisi stabil tetap perlu dijaga dengan batas yang jelas.", "Jika aktivitas mulai menumpuk, coba tentukan prioritas agar energi tidak terkuras oleh semua hal sekaligus.", 1),
    t("stabil_09", "Kenali pemicu kecil", "Tekanan rendah bisa menjadi kesempatan untuk memahami pola diri.", "Catat situasi kecil yang membuatmu lebih mudah lelah atau lebih tenang, lalu gunakan itu untuk mengatur hari berikutnya.", 1),
    t("stabil_10", "Rawat tubuh dan pikiran", "Keseimbangan emosi sering terbantu oleh perawatan tubuh yang konsisten.", "Coba jaga hidrasi, tidur, gerak ringan, dan waktu santai sebagai bagian dari perawatan harian.", 1),
  ],

  stres_ringan: [
    t("ringan_01", "Mulai dari jeda singkat", "Ada tanda tekanan ringan yang masih bisa dikelola secara bertahap.", "Coba berhenti sejenak, tarik napas perlahan, lalu lanjutkan aktivitas dari bagian yang paling mudah dilakukan.", 2),
    t("ringan_02", "Rapikan beban pikiran", "Tekanan ringan sering terasa lebih berat ketika semua hal dipikirkan sekaligus.", "Tuliskan tiga hal yang sedang mengganggu, lalu pilih satu yang paling mungkin ditangani hari ini.", 2),
    t("ringan_03", "Kurangi dorongan buru-buru", "Hasil mengarah pada tekanan ringan yang bisa meningkat jika tubuh terus dipaksa.", "Berikan waktu transisi di antara aktivitas agar pikiran tidak terus merasa dikejar.", 2),
    t("ringan_04", "Gunakan teknik napas sederhana", "Saat tekanan mulai terasa, tubuh biasanya butuh sinyal untuk melambat.", "Coba tarik napas empat hitungan, tahan sebentar, lalu embuskan perlahan beberapa kali.", 2),
    t("ringan_05", "Buat target yang lebih kecil", "Tekanan ringan bisa muncul ketika target terasa terlalu besar.", "Pecah tugas menjadi langkah kecil agar kamu tetap bergerak tanpa merasa harus menyelesaikan semuanya sekaligus.", 2),
    t("ringan_06", "Beri ruang untuk istirahat", "Ada tanda bahwa energi perlu dijaga dengan lebih hati-hati.", "Sisipkan jeda singkat sebelum rasa lelah menumpuk, bukan hanya setelah benar-benar kewalahan.", 2),
    t("ringan_07", "Perhatikan pola tidur", "Tekanan ringan sering berkaitan dengan kurang pulihnya tubuh.", "Coba rapikan jam tidur atau kurangi aktivitas layar menjelang istirahat jika memungkinkan.", 2),
    t("ringan_08", "Pilih aktivitas penenang", "Kondisi ini cocok ditangani dengan cara yang ringan dan konsisten.", "Lakukan aktivitas yang membuat tubuh terasa aman, seperti mandi hangat, berjalan pelan, mendengarkan musik tenang, atau merapikan ruang kecil.", 2),
    t("ringan_09", "Berbicara secukupnya", "Menceritakan sedikit isi pikiran bisa mengurangi tekanan ringan.", "Jika ada orang tepercaya, coba ceritakan bagian yang paling mengganggu tanpa harus menjelaskan semuanya sekaligus.", 2),
    t("ringan_10", "Pantau tanpa menghakimi", "Tekanan ringan bukan kegagalan, tetapi sinyal untuk menyesuaikan ritme.", "Amati kapan tekanan muncul dan apa yang membantu meredakannya, lalu gunakan informasi itu untuk merawat diri.", 2),
  ],

  stres_sedang: [
    t("sedang_01", "Turunkan beban secara bertahap", "Hasil menunjukkan tekanan yang cukup terasa dan perlu ditangani lebih sadar.", "Coba kurangi satu sumber beban yang tidak mendesak, lalu fokus pada langkah yang paling penting terlebih dahulu.", 3),
    t("sedang_02", "Buat rencana pemulihan pendek", "Tekanan sedang biasanya membutuhkan jeda dan susunan aktivitas yang lebih jelas.", "Atur rencana sederhana untuk hari ini: satu tugas utama, satu waktu istirahat, dan satu aktivitas yang membantu menenangkan diri.", 3),
    t("sedang_03", "Validasi perasaan dulu", "Isi curhat dan hasil pengukuran menunjukkan adanya tekanan yang layak diperhatikan.", "Sebelum mencari solusi besar, akui dulu bahwa perasaan lelah, cemas, atau tertekan itu nyata dan perlu diberi ruang.", 3),
    t("sedang_04", "Jangan menanggung sendiri", "Tekanan sedang lebih ringan ketika tidak dipikul sendirian.", "Pertimbangkan untuk berbagi dengan teman, keluarga, atau orang yang kamu percaya agar ada dukungan saat pikiran terasa penuh.", 3),
    t("sedang_05", "Atur ulang prioritas", "Ada kemungkinan energi sedang terbagi ke terlalu banyak hal.", "Pisahkan hal yang wajib, bisa ditunda, dan bisa dibantu orang lain agar beban terasa lebih masuk akal.", 3),
    t("sedang_06", "Gunakan waktu pulih yang jelas", "Tekanan sedang membutuhkan pemulihan yang sengaja direncanakan.", "Tetapkan waktu istirahat tanpa rasa bersalah, meski singkat, agar tubuh punya kesempatan menurunkan ketegangan.", 3),
    t("sedang_07", "Kenali sinyal tubuh", "Tubuh sering memberi tanda saat tekanan emosional mulai meningkat.", "Perhatikan pola seperti sulit tidur, tegang, cepat lelah, atau sulit fokus, lalu gunakan itu sebagai tanda untuk memperlambat ritme.", 3),
    t("sedang_08", "Gunakan langkah praktis", "Saat pikiran terasa penuh, solusi kecil lebih mudah dilakukan daripada perubahan besar.", "Pilih satu tindakan konkret, seperti merapikan meja, membuat daftar tugas pendek, atau menghubungi seseorang yang bisa membantu.", 3),
    t("sedang_09", "Batasi tekanan tambahan", "Hasil menunjukkan kamu mungkin membutuhkan ruang yang lebih aman dari tuntutan baru.", "Jika memungkinkan, hindari mengambil komitmen tambahan sampai kondisi terasa lebih stabil.", 3),
    t("sedang_10", "Pantau beberapa hari ke depan", "Tekanan sedang sebaiknya tidak diabaikan jika terus berulang.", "Coba pantau perubahan suasana hati selama beberapa hari dan cari dukungan lebih lanjut bila tekanan tidak kunjung mereda.", 3),
  ],

  stres_tinggi: [
    t("tinggi_01", "Utamakan rasa aman", "Hasil menunjukkan tekanan emosional yang cukup tinggi dan perlu mendapat perhatian.", "Kurangi aktivitas yang memperberat kondisi, cari tempat yang lebih tenang, dan hubungi orang tepercaya bila kamu merasa kewalahan.", 4),
    t("tinggi_02", "Cari dukungan langsung", "Tekanan tinggi lebih baik tidak ditangani sendirian.", "Pertimbangkan untuk berbicara dengan orang terdekat, konselor, atau tenaga profesional jika kondisi terasa berat atau berulang.", 4),
    t("tinggi_03", "Ambil jeda dari tuntutan besar", "Saat tekanan tinggi, tubuh dan pikiran membutuhkan ruang untuk pulih.", "Tunda keputusan besar jika memungkinkan, lalu fokus pada kebutuhan dasar seperti bernapas lebih pelan, minum, makan, dan beristirahat.", 4),
    t("tinggi_04", "Buat langkah perlindungan diri", "Hasil mengarah pada tekanan yang perlu ditangani dengan lebih serius.", "Jika kamu merasa tidak aman atau muncul dorongan menyakiti diri, segera hubungi orang terdekat atau layanan darurat setempat.", 5),
    t("tinggi_05", "Jangan memaksa terlihat baik-baik saja", "Tekanan tinggi dapat membuat seseorang merasa harus menyembunyikan kondisi.", "Coba ceritakan kondisi secara sederhana kepada orang yang aman, misalnya dengan mengatakan bahwa kamu sedang sangat kewalahan dan butuh ditemani.", 4),
    t("tinggi_06", "Fokus pada satu jam ke depan", "Saat tekanan terasa besar, memikirkan semuanya sekaligus bisa membuat beban makin berat.", "Pilih satu tindakan kecil untuk satu jam ke depan, seperti duduk di tempat tenang, mengatur napas, atau menghubungi seseorang.", 4),
    t("tinggi_07", "Kurangi isolasi", "Tekanan tinggi sering terasa lebih kuat saat dihadapi sendirian.", "Usahakan tetap terhubung dengan satu orang yang kamu percaya, meski hanya untuk memberi kabar singkat.", 4),
    t("tinggi_08", "Berikan perhatian pada tubuh", "Kondisi emosional yang berat sering ikut terasa di tubuh.", "Coba lakukan hal yang membantu tubuh merasa lebih aman, seperti duduk bersandar, minum air, mandi hangat, atau bernapas perlahan.", 4),
    t("tinggi_09", "Pertimbangkan bantuan profesional", "Jika tekanan tinggi menetap, dukungan profesional dapat membantu membuat langkah penanganan lebih jelas.", "Kamu tidak perlu menunggu sampai benar-benar tidak sanggup untuk mencari bantuan.", 4),
    t("tinggi_10", "Kurangi beban hari ini", "Hasil menunjukkan kamu perlu memberi prioritas pada pemulihan.", "Pilih tugas yang benar-benar penting saja dan izinkan diri menunda hal lain yang tidak mendesak.", 4),
  ],

  kondisi_tidak_konsisten: [
    t("inkonsisten_01", "Periksa kembali kondisi diri", "Jawaban kuesioner dan isi curhat menunjukkan gambaran yang tidak sepenuhnya sama.", "Coba isi ulang refleksi saat kondisi lebih tenang, lalu perhatikan apakah hasilnya tetap sama atau berubah.", 2),
    t("inkonsisten_02", "Gunakan hasil sebagai bahan refleksi", "Perbedaan antara jawaban dan curhat bisa terjadi ketika perasaan belum mudah dijelaskan.", "Jangan buru-buru menyimpulkan; gunakan hasil ini untuk mengenali bagian mana yang paling menggambarkan kondisimu.", 2),
    t("inkonsisten_03", "Cek situasi saat mengisi", "Kondisi tidak konsisten bisa dipengaruhi suasana hati, waktu, atau cara menjawab.", "Jika pengisian dilakukan terburu-buru, coba ulangi di waktu yang lebih tenang agar hasil lebih mewakili keadaanmu.", 2),
    t("inkonsisten_04", "Bandingkan dengan pengalaman harian", "Hasil yang berbeda antar sumber perlu dilihat bersama pengalaman sehari-hari.", "Perhatikan pola tidur, energi, fokus, dan suasana hati beberapa hari terakhir untuk membantu membaca kondisi dengan lebih utuh.", 2),
    t("inkonsisten_05", "Ambil saran yang paling aman", "Ketika hasil belum sepenuhnya selaras, saran yang ringan dan aman lebih tepat digunakan.", "Mulailah dari istirahat, pengaturan napas, dan berbicara dengan orang tepercaya bila ada hal yang mengganggu.", 2),
    t("inkonsisten_06", "Hindari menekan diri", "Perbedaan hasil bukan berarti kamu salah menjawab atau salah merasa.", "Coba beri ruang untuk memahami emosi tanpa memaksa diri harus punya penjelasan yang sempurna.", 2),
    t("inkonsisten_07", "Catat pemicu utama", "Kondisi yang tidak selaras bisa muncul karena tekanan hanya terasa pada situasi tertentu.", "Tulis kapan tekanan paling terasa, dengan siapa, dan setelah aktivitas apa, lalu cari pola yang berulang.", 2),
    t("inkonsisten_08", "Gunakan bantuan orang dekat", "Orang yang mengenalmu mungkin bisa membantu melihat perubahan yang tidak kamu sadari.", "Jika nyaman, tanyakan pada orang tepercaya apakah mereka melihat perubahan energi, emosi, atau kebiasaanmu akhir-akhir ini.", 2),
    t("inkonsisten_09", "Pilih langkah netral", "Saat hasil berbeda, langkah perawatan dasar tetap bermanfaat.", "Jaga tidur, makan, hidrasi, dan jeda dari tuntutan berlebih sambil memantau kondisi beberapa hari ke depan.", 2),
    t("inkonsisten_10", "Lihat hasil sebagai sinyal awal", "Hasil yang tidak konsisten sebaiknya dipakai sebagai tanda untuk mengamati diri lebih lanjut.", "Coba ulangi asesmen nanti dan bandingkan dengan catatan perasaanmu agar gambaran menjadi lebih jelas.", 2),
  ],

  curhat_emosional_kuat: [
    t("emosional_01", "Dengarkan sinyal emosi", "Isi curhat menunjukkan emosi yang cukup kuat meski hasil akhir tidak selalu tinggi.", "Beri ruang untuk menenangkan diri dan tuliskan apa yang paling ingin kamu pahami dari perasaan itu.", 3),
    t("emosional_02", "Validasi perasaan yang muncul", "Curhat yang emosional bisa menjadi tanda bahwa ada hal yang perlu diperhatikan.", "Coba katakan pada diri sendiri bahwa perasaan ini layak didengar, lalu pilih satu langkah kecil untuk merawat diri.", 3),
    t("emosional_03", "Jangan abaikan kalimat singkat yang berat", "Teks yang pendek tetap bisa bermakna bila memuat emosi yang jelas.", "Jika satu kalimat terasa sangat mewakili kondisi, gunakan itu sebagai awal untuk bercerita lebih lanjut kepada orang yang aman.", 3),
    t("emosional_04", "Urai emosi satu per satu", "Emosi kuat sering terasa bercampur dan sulit diberi nama.", "Coba pisahkan apakah yang paling dominan adalah lelah, sedih, cemas, marah, atau takut, lalu tangani dari bagian yang paling terasa.", 3),
    t("emosional_05", "Temukan kebutuhan di balik emosi", "Perasaan kuat biasanya membawa pesan tentang kebutuhan yang belum terpenuhi.", "Tanyakan pada diri sendiri apakah kamu sedang butuh istirahat, dukungan, batasan, atau kepastian.", 3),
    t("emosional_06", "Gunakan dukungan yang aman", "Curhat yang menunjukkan tekanan emosional sebaiknya tidak hanya disimpan sendiri.", "Jika memungkinkan, bagikan sebagian cerita kepada orang yang tidak menghakimi dan bisa mendengarkan dengan tenang.", 3),
    t("emosional_07", "Tunda reaksi besar", "Saat emosi sedang kuat, keputusan besar bisa terasa mendesak.", "Beri jeda sebelum mengambil keputusan penting dan lakukan hal yang membantu tubuh lebih stabil terlebih dahulu.", 3),
    t("emosional_08", "Lakukan grounding ringan", "Emosi yang intens sering membuat pikiran terasa berputar.", "Coba sebutkan lima hal yang terlihat, empat hal yang terasa, tiga hal yang terdengar, dua hal yang tercium, dan satu hal yang bisa disyukuri.", 3),
    t("emosional_09", "Buat kalimat bantuan", "Saat sulit menjelaskan perasaan, kalimat sederhana bisa membantu meminta dukungan.", "Kamu bisa mulai dengan, 'Aku lagi tidak baik-baik saja dan butuh ditemani sebentar.'", 3),
    t("emosional_10", "Pantau intensitas emosi", "Emosi yang kuat perlu diperhatikan bila berulang atau makin berat.", "Coba beri nilai 1 sampai 10 pada intensitas perasaan hari ini dan lihat apakah naik atau turun dalam beberapa hari.", 3),
  ],

  dass_mencurigakan: [
    t("mencurigakan_01", "Isi dengan ritme yang lebih tenang", "Pola jawaban kuesioner terlihat kurang stabil untuk dijadikan satu-satunya dasar.", "Coba ulangi pengisian saat tidak terburu-buru dan jawab sesuai pengalaman beberapa hari terakhir.", 2),
    t("mencurigakan_02", "Periksa pola jawaban", "Jawaban yang terlalu seragam bisa membuat hasil kurang mewakili kondisi sebenarnya.", "Saat mengisi ulang, baca setiap pertanyaan perlahan dan pilih jawaban yang paling dekat dengan pengalamanmu.", 2),
    t("mencurigakan_03", "Gabungkan dengan refleksi curhat", "Kuesioner tetap berguna, tetapi hasilnya perlu dibaca bersama isi curhat.", "Gunakan curhat sebagai pembanding agar gambaran kondisimu tidak hanya bergantung pada pilihan angka.", 2),
    t("mencurigakan_04", "Hindari jawaban ekstrem otomatis", "Memilih jawaban paling tinggi atau paling rendah secara berulang bisa mengurangi ketepatan hasil.", "Coba beri jarak sebentar sebelum menjawab dan tanyakan apakah tiap pilihan benar-benar sesuai pengalamanmu.", 2),
    t("mencurigakan_05", "Utamakan kejujuran pada diri sendiri", "Hasil akan lebih membantu bila jawaban menggambarkan kondisi nyata, bukan kondisi yang ingin terlihat.", "Tidak apa-apa jika beberapa jawaban berbeda; variasi justru sering lebih mendekati pengalaman sehari-hari.", 2),
    t("mencurigakan_06", "Gunakan hasil sebagai tanda awal", "Karena pola jawaban terlihat kurang meyakinkan, hasil sebaiknya dipakai sebagai bahan refleksi awal.", "Amati kembali kondisi dalam beberapa hari dan ulangi asesmen bila perlu.", 2),
    t("mencurigakan_07", "Berhenti sejenak sebelum melanjutkan", "Pengisian yang terlalu cepat bisa membuat beberapa jawaban tidak terbaca dengan baik.", "Ambil napas sebentar, baca ulang pertanyaan, lalu jawab berdasarkan pengalaman paling dekat.", 2),
    t("mencurigakan_08", "Jangan mengejar hasil tertentu", "Asesmen ini lebih berguna saat tidak diarahkan untuk menghasilkan kategori tertentu.", "Coba gunakan hasil sebagai cermin, bukan sebagai penilaian terhadap dirimu.", 2),
    t("mencurigakan_09", "Perhatikan pertanyaan yang mirip", "Beberapa pertanyaan DASS-21 memang terasa mirip, tetapi maknanya tidak selalu sama.", "Jawab satu per satu tanpa menyalin pola jawaban sebelumnya secara otomatis.", 2),
    t("mencurigakan_10", "Cari gambaran yang lebih utuh", "Jika pola jawaban kurang konsisten, informasi tambahan dari curhat dan aktivitas harian menjadi penting.", "Catat kejadian yang membuat tekanan naik atau turun agar hasil berikutnya lebih mudah dipahami.", 2),
  ],

  confidence_rendah: [
    t("confidence_01", "Lengkapi cerita perlahan", "Hasil analisis teks belum cukup kuat untuk membaca keadaan secara rinci.", "Jika nyaman, tulis curhat dengan sedikit lebih lengkap: apa yang terjadi, apa yang kamu rasakan, dan apa yang paling mengganggu.", 2),
    t("confidence_02", "Tambahkan konteks utama", "Informasi yang terbatas bisa membuat saran menjadi lebih umum.", "Coba tambahkan situasi, durasi, dan dampaknya pada tidur, fokus, atau aktivitas harian.", 2),
    t("confidence_03", "Gunakan bahasa yang jelas", "Teks yang terlalu acak atau terlalu singkat dapat mengurangi ketepatan analisis.", "Tulis dengan kalimat sederhana dan hindari terlalu banyak singkatan agar pesan emosinya lebih mudah terbaca.", 2),
    t("confidence_04", "Fokus pada perasaan paling dominan", "Jika sulit bercerita panjang, mulai dari satu emosi utama saja.", "Misalnya, jelaskan apakah kamu lebih merasa lelah, cemas, sedih, marah, atau takut.", 2),
    t("confidence_05", "Ceritakan dampak yang terasa", "Saran akan lebih sesuai jika ada gambaran tentang dampak pada keseharian.", "Tambahkan apakah kondisi ini memengaruhi tidur, nafsu makan, hubungan, tugas, atau energi.", 2),
    t("confidence_06", "Ulangi saat lebih siap", "Tidak semua orang mudah menuliskan perasaan dalam satu kali percobaan.", "Kamu bisa kembali menulis saat lebih tenang agar cerita lebih mewakili kondisi sebenarnya.", 2),
    t("confidence_07", "Gunakan contoh kejadian", "Contoh konkret membantu sistem memahami konteks curhat dengan lebih baik.", "Coba tuliskan satu kejadian yang membuat perasaan itu muncul atau makin kuat.", 2),
    t("confidence_08", "Hindari teks berulang", "Kata yang diulang berkali-kali bisa membuat makna curhat sulit dibaca.", "Tulis isi pikiran dengan kalimat yang berbeda agar gambaran emosinya lebih jelas.", 2),
    t("confidence_09", "Tetap gunakan saran dasar", "Saat keyakinan analisis rendah, langkah perawatan dasar tetap aman dilakukan.", "Mulailah dari istirahat, minum air, bernapas perlahan, dan mengurangi tekanan yang tidak mendesak.", 2),
    t("confidence_10", "Perjelas kebutuhanmu", "Curhat akan lebih membantu jika memuat apa yang sedang kamu butuhkan.", "Coba tambahkan apakah kamu butuh didengar, ditemani, diberi solusi, atau hanya ingin melepas beban.", 2),
  ],

  burnout: [
    t("burnout_01", "Kurangi beban yang tidak mendesak", "Ada tanda kelelahan akibat tekanan yang menumpuk.", "Pilih satu hal yang bisa ditunda atau dibantu orang lain agar energi tidak terus terkuras.", 3),
    t("burnout_02", "Pulihkan energi secara nyata", "Kelelahan tidak selalu selesai hanya dengan memaksa diri tetap produktif.", "Jadwalkan waktu pulih yang jelas, seperti tidur lebih awal, mengurangi layar, atau melakukan aktivitas yang tidak menuntut hasil.", 3),
    t("burnout_03", "Buat batas kerja atau tugas", "Kondisi lelah bisa makin berat jika tidak ada batas antara tugas dan waktu pribadi.", "Tentukan jam berhenti yang realistis dan hindari menambah tugas baru setelah batas itu.", 3),
    t("burnout_04", "Pilih satu prioritas utama", "Saat energi rendah, terlalu banyak target bisa membuat semuanya terasa buntu.", "Tentukan satu tugas paling penting hari ini dan biarkan tugas lain menunggu jika tidak mendesak.", 3),
    t("burnout_05", "Isi ulang dengan aktivitas ringan", "Kelelahan emosional butuh kegiatan yang mengembalikan rasa aman.", "Coba aktivitas sederhana seperti berjalan pelan, merapikan ruang kecil, mandi hangat, atau mendengarkan musik yang menenangkan.", 3),
    t("burnout_06", "Bicarakan beban yang menumpuk", "Beban yang lama disimpan sendiri bisa membuat lelah terasa semakin berat.", "Jika memungkinkan, sampaikan kepada orang terkait bahwa kamu butuh penyesuaian waktu atau dukungan.", 3),
    t("burnout_07", "Pisahkan istirahat dari rasa bersalah", "Istirahat adalah bagian dari pemulihan, bukan tanda malas.", "Berikan izin pada diri untuk berhenti sejenak sebelum tubuh benar-benar kehabisan tenaga.", 3),
    t("burnout_08", "Perhatikan sinyal jenuh", "Jenuh yang terus dibiarkan bisa membuat motivasi makin turun.", "Catat aktivitas yang paling menguras energi dan cari cara mengurangi intensitasnya sedikit demi sedikit.", 3),
    t("burnout_09", "Susun ulang ekspektasi", "Kelelahan sering bertambah ketika standar diri terlalu tinggi.", "Coba turunkan target menjadi versi yang cukup baik dan mungkin dilakukan, bukan versi sempurna.", 3),
    t("burnout_10", "Minta bantuan lebih awal", "Jika lelah berlangsung lama, dukungan dari luar bisa membantu meringankan beban.", "Pertimbangkan berbicara dengan orang tepercaya atau profesional bila kelelahan terus mengganggu aktivitas harian.", 4),
  ],

  kecemasan: [
    t("cemas_01", "Tenangkan tubuh terlebih dahulu", "Ada tanda kecemasan atau kekhawatiran yang cukup terasa.", "Sebelum menyelesaikan masalah, coba bantu tubuh lebih tenang dengan napas perlahan atau duduk di tempat yang nyaman.", 3),
    t("cemas_02", "Pisahkan fakta dan kemungkinan", "Kecemasan sering membuat pikiran melompat ke banyak kemungkinan buruk.", "Tulis mana yang benar-benar sedang terjadi dan mana yang masih berupa kekhawatiran.", 3),
    t("cemas_03", "Batasi lingkaran pikiran", "Pikiran cemas bisa terasa berulang tanpa memberi jalan keluar.", "Tentukan waktu singkat untuk memikirkan masalah, lalu alihkan ke tindakan kecil yang bisa dilakukan sekarang.", 3),
    t("cemas_04", "Gunakan grounding", "Saat cemas, perhatian sering terseret ke hal yang belum terjadi.", "Coba kembali ke saat ini dengan memperhatikan napas, pijakan kaki, dan benda di sekitarmu.", 3),
    t("cemas_05", "Kurangi pemicu tambahan", "Kecemasan bisa meningkat saat tubuh terlalu banyak menerima rangsangan.", "Jika memungkinkan, kurangi kafein, layar, atau informasi yang membuat pikiran makin tegang.", 3),
    t("cemas_06", "Buat rencana kecil", "Kecemasan biasanya lebih mudah ditangani jika ada langkah yang jelas.", "Tentukan satu tindakan yang bisa dilakukan dalam 10 menit, bukan semua solusi sekaligus.", 3),
    t("cemas_07", "Cari kepastian yang sehat", "Wajar ingin merasa aman saat cemas, tetapi mencari kepastian terus-menerus bisa melelahkan.", "Coba pilih satu sumber informasi atau satu orang tepercaya, lalu beri jeda dari pengecekan berulang.", 3),
    t("cemas_08", "Beri nama pada rasa khawatir", "Menamai emosi dapat membantu jarak antara diri dan pikiran cemas.", "Katakan dalam hati, 'Aku sedang merasa cemas,' lalu lanjutkan dengan satu tindakan yang menenangkan.", 3),
    t("cemas_09", "Perlambat respons", "Saat cemas, tubuh cenderung ingin bereaksi cepat.", "Berikan jeda sebelum membalas pesan, mengambil keputusan, atau menilai situasi.", 3),
    t("cemas_10", "Gunakan dukungan bila perlu", "Jika cemas terasa mengganggu tidur, fokus, atau aktivitas, dukungan tambahan bisa membantu.", "Ceritakan kepada orang tepercaya atau pertimbangkan bantuan profesional bila rasa cemas terus menetap.", 4),
  ],

  kelelahan_emosional: [
    t("lelah_01", "Akui rasa lelah", "Ada tanda kelelahan emosional yang perlu diberi ruang.", "Coba berhenti menuntut diri untuk langsung kuat dan mulai dari kebutuhan paling dasar: makan, minum, tidur, dan tenang.", 3),
    t("lelah_02", "Kurangi beban batin", "Kelelahan emosional sering muncul ketika terlalu banyak hal dipendam.", "Tulis isi pikiran tanpa harus rapi, lalu pilih satu bagian yang ingin kamu ceritakan kepada orang yang aman.", 3),
    t("lelah_03", "Jangan memaksa produktif", "Saat emosi lelah, produktivitas biasanya ikut menurun.", "Buat target minimal yang realistis dan beri ruang untuk pulih tanpa menyalahkan diri.", 3),
    t("lelah_04", "Cari sumber kehangatan", "Kelelahan emosional bisa berkurang saat kamu merasa didukung.", "Dekati hal atau orang yang membuatmu merasa lebih aman, meski hanya sebentar.", 3),
    t("lelah_05", "Beri jeda dari tekanan sosial", "Kadang rasa lelah datang dari terlalu banyak memenuhi harapan orang lain.", "Izinkan diri membatasi percakapan atau aktivitas yang menguras energi jika memungkinkan.", 3),
    t("lelah_06", "Pulihkan dengan hal sederhana", "Pemulihan tidak harus besar atau sempurna.", "Lakukan satu aktivitas kecil yang memberi rasa nyaman, seperti mandi, merapikan tempat tidur, atau duduk di tempat yang tenang.", 3),
    t("lelah_07", "Kenali batas hari ini", "Kondisi lelah membutuhkan batas yang lebih lembut.", "Tanyakan pada diri sendiri apa yang benar-benar sanggup dilakukan hari ini, lalu mulai dari sana.", 3),
    t("lelah_08", "Lepaskan kewajiban yang bisa ditunda", "Tidak semua hal perlu diselesaikan saat energi sedang rendah.", "Tunda hal yang tidak mendesak agar kamu punya ruang untuk mengembalikan tenaga.", 3),
    t("lelah_09", "Minta ditemani", "Saat lelah secara emosional, kehadiran orang lain kadang lebih membantu daripada nasihat panjang.", "Jika ada orang tepercaya, minta ditemani atau didengarkan tanpa harus langsung mencari solusi.", 3),
    t("lelah_10", "Cari bantuan bila berlarut", "Jika kelelahan terasa panjang dan mengganggu aktivitas, dukungan lebih terarah bisa membantu.", "Pertimbangkan berbicara dengan konselor atau profesional agar kamu tidak menanggung semuanya sendiri.", 4),
  ],
};

function clamp(value, min = 0, max = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function normalizePercent(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, 0), 100);
}

function severityFromPercent(percent) {
  if (percent >= 82) return "sangat_tinggi";
  if (percent >= 66) return "tinggi";
  if (percent >= 33) return "sedang";
  if (percent >= 15) return "ringan";
  return "stabil";
}

function categoryFromSeverity(severity) {
  const map = {
    sangat_tinggi: "stres_tinggi",
    tinggi: "stres_tinggi",
    sedang: "stres_sedang",
    ringan: "stres_ringan",
    stabil: "kondisi_stabil",
  };
  return map[severity] || "stres_sedang";
}

function normalizeLabel(label = "") {
  const lower = String(label).toLowerCase();
  if (["high", "tinggi", "severe", "very high"].some(item => lower.includes(item))) return "tinggi";
  if (["medium", "moderate", "sedang"].some(item => lower.includes(item))) return "sedang";
  if (["low", "rendah", "normal", "stabil"].some(item => lower.includes(item))) return "stabil";
  return "";
}

function includesAny(text, terms) {
  const lowerText = String(text || "").toLowerCase();
  return terms.some(term => lowerText.includes(term));
}

function hashString(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function buildSeed(context, category, offset = 0) {
  return hashString([
    category,
    offset,
    context.finalSeverity,
    Math.round(context.finalPercent),
    Math.round(context.dassPercent),
    Math.round(context.mlPercent),
    context.dominantScale,
    context.suspiciousPatterns.join("|"),
    context.contradictionType,
    context.textLength,
    context.textFingerprint,
  ].join(":"));
}

function buildContext({ text = "", stressLabel, dass = {}, fusion = {}, mlResult = {} } = {}) {
  const curhatQuality = fusion.curhatQuality || fusion.reliability?.text || {};
  const finalPercent = normalizePercent(fusion.fusedStressPercent ?? mlResult.stress_level?.stress_level, 50);
  const dassPercent = normalizePercent(dass.stressPercent ?? fusion.dassStressPercent, finalPercent);
  const mlPercent = normalizePercent(fusion.mlStressPercent ?? mlResult.stress_level?.stress_level, finalPercent);
  const finalSeverity = severityFromPercent(finalPercent);
  const dassSeverity = severityFromPercent(dassPercent);
  const mlSeverity = severityFromPercent(mlPercent);
  const finalRank = SEVERITY_RANK[finalSeverity] || 3;
  const dassRank = SEVERITY_RANK[dassSeverity] || 3;
  const mlRank = SEVERITY_RANK[mlSeverity] || 3;
  const suspiciousPatterns = Array.isArray(fusion.suspiciousPatterns) ? fusion.suspiciousPatterns : [];
  const hasContradiction = Boolean(fusion.contradiction?.hasContradiction);
  const mlConfidence = clamp(fusion.mlConfidence ?? mlResult.predicted_stress?.confidence ?? 0.5);
  const fusionConfidence = clamp(fusion.fusionConfidence ?? 0.5);
  const textReliability = clamp(fusion.curhatReliabilityScore ?? curhatQuality.R_text ?? 0.5);
  const dassReliability = clamp(fusion.questionnaireReliabilityScore ?? fusion.reliability?.dass?.R_dass ?? 0.5);
  const lowerText = String(text || "").toLowerCase();
  const dominantScale = String(dass.dominantScale || "").toLowerCase();
  const emotionalDistress = Boolean(curhatQuality.emotionallyDistressed) || mlPercent >= 66;
  const emotionalPositive = Boolean(curhatQuality.emotionallyPositive) || normalizeLabel(mlResult.predicted_stress?.label) === "stabil";
  const lowConfidence = mlConfidence < 0.55 || textReliability < 0.38 || fusionConfidence < 0.35;
  const inconsistentHighDassPositiveText =
    dassPercent >= 66 &&
    (mlPercent <= 35 || emotionalPositive) &&
    suspiciousPatterns.length > 0;
  const lowDassNegativeCurhat = dassPercent <= 33 && (mlPercent >= 66 || emotionalDistress);
  const burnoutSignal = includesAny(lowerText, ["burnout", "jenuh", "capek", "lelah", "muak", "terkuras", "tidak sanggup", "kewalahan"]);
  const anxietySignal = dominantScale === "anxiety" || includesAny(lowerText, ["cemas", "khawatir", "panik", "takut", "gelisah", "deg-degan"]);
  const exhaustionSignal = dominantScale === "depression" || includesAny(lowerText, ["sedih", "kosong", "hampa", "tidak berharga", "menangis", "sendiri", "kesepian"]);
  const curhatStrong =
    Boolean(curhatQuality.shortButEmotional) ||
    curhatQuality.emotionalIntensity >= 0.35 ||
    lowDassNegativeCurhat;
  const softConflict = inconsistentHighDassPositiveText || (hasContradiction && emotionalPositive && dassRank > mlRank);
  const adjustedSeverity = softConflict && finalRank >= 4 ? "sedang" : finalSeverity;

  return {
    text,
    stressLabel,
    finalPercent,
    dassPercent,
    mlPercent,
    finalSeverity,
    adjustedSeverity,
    dassSeverity,
    mlSeverity,
    finalRank,
    dassRank,
    mlRank,
    dominantScale,
    suspiciousPatterns,
    hasSuspiciousDass: suspiciousPatterns.length > 0,
    hasContradiction,
    contradictionType: fusion.contradiction?.type || "none",
    lowConfidence,
    mlConfidence,
    fusionConfidence,
    textReliability,
    dassReliability,
    emotionalDistress,
    emotionalPositive,
    burnoutSignal,
    anxietySignal,
    exhaustionSignal,
    curhatStrong,
    textSpam: Boolean(curhatQuality.spamLike),
    lowDassNegativeCurhat,
    softConflict,
    targetIntensity: SEVERITY_RANK[adjustedSeverity] || 3,
    textLength: String(text || "").length,
    textFingerprint: hashString(String(text || "").slice(0, 160)),
  };
}

function selectCategoryOrder(context) {
  const severityCategory = categoryFromSeverity(context.adjustedSeverity);
  const contextual = [];

  if (context.hasContradiction) contextual.push("kondisi_tidak_konsisten");
  if (context.hasSuspiciousDass) contextual.push("dass_mencurigakan");
  if (context.lowConfidence) contextual.push("confidence_rendah");
  if (context.burnoutSignal) contextual.push("burnout");
  if (context.anxietySignal) contextual.push("kecemasan");
  if (context.exhaustionSignal) contextual.push("kelelahan_emosional");
  if (context.curhatStrong && !context.textSpam) contextual.push("curhat_emosional_kuat");

  if (context.finalRank >= 4 && !context.softConflict) {
    return unique([severityCategory, ...contextual, "stres_sedang"]);
  }

  if (context.lowDassNegativeCurhat) {
    return unique(["curhat_emosional_kuat", severityCategory, ...contextual]);
  }

  if (context.hasContradiction || context.hasSuspiciousDass) {
    return unique([...contextual, severityCategory]);
  }

  if (context.burnoutSignal || context.anxietySignal || context.exhaustionSignal || context.curhatStrong) {
    return unique([...contextual, severityCategory]);
  }

  return unique([severityCategory, ...contextual]);
}

function isTemplateSafe(template) {
  const combined = `${template.title} ${template.explanation} ${template.recommendation}`;
  return !UNSAFE_PATTERNS.some(pattern => pattern.test(combined));
}

function isTemplateAppropriate(template, context) {
  if (!isTemplateSafe(template)) return false;
  if (context.softConflict && template.intensity >= 5) return false;
  if (context.targetIntensity <= 2 && template.intensity >= 5) return false;
  if (context.textSpam && template.id.startsWith("emosional_")) return false;
  return template.intensity <= Math.min(5, context.targetIntensity + 2);
}

function selectTemplateFromCategory(category, context, usedIds, offset = 0) {
  const group = RECOMMENDATION_TEMPLATES[category] || [];
  if (group.length === 0) return null;

  const start = buildSeed(context, category, offset) % group.length;
  for (let step = 0; step < group.length; step += 1) {
    const candidate = group[(start + step) % group.length];
    if (!usedIds.has(candidate.id) && isTemplateAppropriate(candidate, context)) {
      return { ...candidate, category };
    }
  }

  return null;
}

function validateSelectedTemplates(templates, context) {
  const seenIds = new Set();
  const seenText = new Set();
  const accepted = [];
  const rejected = [];

  for (const template of templates) {
    if (!template) continue;
    const normalizedText = `${template.title} ${template.recommendation}`.toLowerCase().replace(/\s+/g, " ").trim();
    const shouldReject =
      seenIds.has(template.id) ||
      seenText.has(normalizedText) ||
      !isTemplateAppropriate(template, context);

    if (shouldReject) {
      rejected.push(template.id);
      continue;
    }

    seenIds.add(template.id);
    seenText.add(normalizedText);
    accepted.push(template);
  }

  return { accepted, rejected };
}

function selectRecommendations(context, maxItems = 3) {
  const categories = selectCategoryOrder(context);
  const usedIds = new Set();
  const selected = [];

  categories.forEach((category, index) => {
    if (selected.length >= maxItems) return;
    const template = selectTemplateFromCategory(category, context, usedIds, index);
    if (template) {
      usedIds.add(template.id);
      selected.push(template);
    }
  });

  const severityCategory = categoryFromSeverity(context.adjustedSeverity);
  let offset = 10;
  while (selected.length < Math.min(maxItems, 2)) {
    const fallback = selectTemplateFromCategory(severityCategory, context, usedIds, offset);
    if (!fallback) break;
    usedIds.add(fallback.id);
    selected.push(fallback);
    offset += 1;
  }

  const validation = validateSelectedTemplates(selected, context);
  return {
    categories,
    selected: validation.accepted,
    rejectedTemplateIds: validation.rejected,
  };
}

function formatRecommendationAnalysis(templates) {
  if (!templates.length) {
    return "Saran:\nAmbil jeda singkat, perhatikan kebutuhan dasar seperti istirahat dan makan, lalu coba ceritakan kondisi kepada orang tepercaya bila tekanan terasa mengganggu.";
  }

  const body = templates
    .map(template => `${template.title}: ${template.explanation} ${template.recommendation}`)
    .join("\n\n");

  return `Saran:\n${body}`;
}

function buildSelectionReason(context, categories) {
  const reasons = [`Kategori utama dipilih dari hasil akhir ${context.finalSeverity}.`];

  if (context.hasContradiction) {
    reasons.push("Sistem menambahkan kategori tidak konsisten karena kuesioner dan curhat tidak sepenuhnya selaras.");
  }

  if (context.hasSuspiciousDass) {
    reasons.push("Sistem menambahkan kategori pola kuesioner karena jawaban menunjukkan pola yang perlu dibaca hati-hati.");
  }

  if (context.lowConfidence) {
    reasons.push("Sistem menambahkan kategori keyakinan rendah karena sebagian data belum cukup kuat.");
  }

  if (context.burnoutSignal) reasons.push("Sistem mendeteksi tema kelelahan atau beban yang menumpuk.");
  if (context.anxietySignal) reasons.push("Sistem mendeteksi tema kecemasan atau kekhawatiran.");
  if (context.exhaustionSignal) reasons.push("Sistem mendeteksi tema kelelahan emosional atau suasana hati menurun.");
  if (context.curhatStrong) reasons.push("Sistem memberi perhatian tambahan pada curhat yang memuat emosi kuat.");

  return `${reasons.join(" ")} Kategori yang dipertimbangkan: ${categories.join(", ")}.`;
}

export function buildRecommendationAnalysis(input = {}) {
  const context = buildContext(input);
  const { categories, selected, rejectedTemplateIds } = selectRecommendations(context);

  return {
    analysis: formatRecommendationAnalysis(selected),
    selectedTemplates: selected.map(template => ({
      id: template.id,
      category: template.category,
      title: template.title,
      intensity: template.intensity,
    })),
    categories,
    validation: {
      rejectedTemplateIds,
      unsafePatternsChecked: UNSAFE_PATTERNS.length,
    },
    context: {
      finalSeverity: context.finalSeverity,
      adjustedSeverity: context.adjustedSeverity,
      dassSeverity: context.dassSeverity,
      mlSeverity: context.mlSeverity,
      finalPercent: Math.round(context.finalPercent),
      dassPercent: Math.round(context.dassPercent),
      mlPercent: Math.round(context.mlPercent),
      hasContradiction: context.hasContradiction,
      hasSuspiciousDass: context.hasSuspiciousDass,
      lowConfidence: context.lowConfidence,
      dominantScale: context.dominantScale,
      emotionalDistress: context.emotionalDistress,
      emotionalPositive: context.emotionalPositive,
      targetIntensity: context.targetIntensity,
    },
    selectionReason: buildSelectionReason(context, categories),
  };
}
