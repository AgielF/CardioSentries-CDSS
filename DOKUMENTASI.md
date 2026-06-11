# Dokumentasi Fitur Sistem: CardioSentries-CDSS

Sistem Pendukung Keputusan Klinis (*Clinical Decision Support System* / CDSS) berbasis AI untuk deteksi dini risiko penyakit jantung. Terintegrasi, Aman, dan Interoperable.

## Daftar Isi
1. [Arsitektur Sistem](#1-arsitektur-sistem)
2. [Fitur Utama Keseluruhan](#2-fitur-utama-keseluruhan)
3. [Detail Layanan & Endpoint API](#3-detail-layanan--endpoint-api)
   - [AI Service (Python / FastAPI)](#ai-service-python--fastapi)
   - [Backend Service (Node.js / Express / MySQL)](#backend-service-nodejs--express--mysql)
   - [Frontend Client (React.js / Vite)](#frontend-client-reactjs--vite)
4. [Skenario Pengujian Data Pasien](#4-skenario-pengujian-data-pasien)

---

## 1. Arsitektur Sistem
CardioSentries dibangun menggunakan pendekatan *Microservices* yang dibagi menjadi 3 layanan utama untuk menjamin skalabilitas dan isolasi dependensi:
* **AI Service**: Memproses komputasi algoritma *machine learning* untuk melakukan klasifikasi risiko penyakit jantung.
* **Backend Service**: Bertindak sebagai *API Gateway*, mengelola otorisasi, logika bisnis rekam medis, dan sinkronisasi ke database relasional.
* **Frontend Client**: Antarmuka berbasis web (*Single Page Application*) yang menyajikan visualisasi data klinis secara aman dan reaktif.

---

## 2. Fitur Utama Keseluruhan
* **Clinical Decision Support (CDSS)**: Prediksi *real-time* stratifikasi risiko penyakit jantung menggunakan model Logistic Regression yang telah dilatih dan tervalidasi secara klinis.
* **Hospital Interoperability**: Menyediakan arsitektur API terbuka (*Open API Proxy*) yang dirancang *stateless* untuk memfasilitasi pertukaran data medis yang mulus dengan SIMRS atau EHR eksternal.
* **Data Privacy & Compliance (RBAC)**: Keamanan data rekam medis berlapis menggunakan manajemen akses berbasis peran (*Role-Based Access Control*) yang divalidasi via JSON Web Token (JWT).
* **Automated Re-Prediction**: Sinkronisasi dinamis yang otomatis memicu AI Service untuk menghitung ulang probabilitas risiko setiap kali dokter memperbarui parameter klinis pasien.

---

## 3. Detail Layanan & Endpoint API

### AI Service (Python / FastAPI)
Layanan cerdas yang bertanggung jawab atas analisis prediktif rekam medis.
* **Fitur Utama**:
  - Skrip pelatihan terpisah (`train_and_save.py`) untuk memproses dataset mentah (UCI Heart Disease), menangani nilai kosong (*null handling*), menghapus duplikasi, dan melakukan *Label Encoding*.
  - Standarisasi fitur klinis menggunakan `StandardScaler` untuk menjaga performa model linear.
  - Ekspor model otomatis menjadi berkas binari `heart_model.pkl` dan `heart_scaler.pkl`.
  - Evaluasi performa otomatis yang memproduksi grafik Kurva ROC (`static/roc.png`) dan metrik presisi akurasi (`static/metrics.json`).
  - Skema validasi data masukan menggunakan `Pydantic (BaseModel)` untuk menjamin interoperabilitas data (Module 10).
* **Endpoint API**:
  - `POST /predict`
    - **Akses**: Terbuka / Internal Backend
    - **Fungsi**: Menerima 13 parameter klinis pasien dan mengembalikan kelas serta persentase probabilitas risiko.
    - **Struktur Body (JSON)**:
      ```json
      {
        "age": 25.0, "sex": "male", "cp": 0.0, "trestbps": 115.0, "chol": 170.0,
        "fbs": 0.0, "restecg": 0.0, "thalach": 180.0, "exang": 0.0,
        "oldpeak": 0.0, "slope": 0.0, "ca": 0.0, "thal": 0.0
      }
      ```
    - **Struktur Respon (JSON)**:
      ```json
      {
        "status": "success",
        "prediction_class": 0,
        "result_text": "Risiko Rendah",
        "probability_percent": 12.54
      }
      ```

### Backend Service (Node.js / Express / MySQL)
Pusat kendali logika bisnis aplikasi, otorisasi, dan manajemen data presisten.
* **Fitur Utama**:
  - Integrasi database relasional MySQL (didukung XAMPP) melalui Sequelize ORM dengan sinkronisasi tabel dinamis (`{ alter: true }`).
  - Middleware Keamanan (Module 11): `verifyToken` untuk otentikasi header *Bearer Token* JWT dan `verifyAdmin` untuk proteksi rute manajemen.
  - Komunikasi asinkron antar-layanan (*inter-service communication*) menggunakan `axios` untuk menembak AI Service secara *real-time*.
* **Endpoint API**:
  - **Autentikasi**:
    - `POST /api/auth/login` (Public) -> Memvalidasi kredensial Admin (via konfigurasi `.env`) atau Dokter (via tabel database) untuk menerbitkan token JWT.
  - **Manajemen Staf (Admin Only)**:
    - `GET /api/admin/doctors` -> Mengambil seluruh data dokter yang terdaftar.
    - `POST /api/admin/doctors` -> Mendaftarkan akun dokter baru (NIP unik, Nama, dan Password).
    - `PUT /api/admin/doctors/:id` -> Mengubah data kredensial staf dokter.
    - `DELETE /api/admin/doctors/:id` -> Menghapus hak akses login dokter dari sistem.
    - `GET /api/admin/all-records` -> Pemantauan log aktivitas rekam medis global di seluruh unit kardiologi secara *Read-Only*.
  - **Operasional Klinis (Doctor Only)**:
    - `GET /api/doctor/records` -> Mengambil rekam medis pasien yang diperiksa khusus oleh dokter yang sedang login (*Data Isolation*).
    - `POST /api/doctor/predict` -> Mengirim parameter medis pasien baru ke AI, menerima skor risiko, dan menyimpannya ke database.
    - `PUT /api/doctor/records/:id` -> Memperbarui parameter medis, memicu kalkulasi ulang AI, dan memperbarui rekam medis (*Re-Prediction*).
    - `DELETE /api/doctor/records/:id` -> Menghapus rekam medis pasien tertentu.
  - **Interoperabilitas Publik (SIMRS Integration)**:
    - `GET /api/public/docs` -> Menyediakan skema dan spesifikasi integrasi JSON bagi pengembang eksternal.
    - `POST /api/public/predict` -> *Proxy endpoint stateless* yang menjembatani sistem rumah sakit luar langsung ke *engine* AI secara aman.

### Frontend Client (React.js / Vite)
Antarmuka pengguna reaktif yang dibangun menggunakan React Bootstrap untuk memberikan pengalaman kerja klinis yang optimal.
* **Fitur Utama**:
  - **Proteksi Rute Dinamis**:
    - `PrivateRoute`: Menghalangi tamu atau pengguna yang tidak terautentikasi masuk ke dasbor operasional.
    - `GuestRoute`: Mencegah pengguna yang telah memiliki sesi aktif kembali ke halaman login (otomatis melempar ke dasbor masing-masing).
  - **Navigasi Kondisional**: Navbar pintar yang otomatis beradaptasi; menampilkan opsi integrasi publik saat anonim, serta menampilkan profil nama, *role*, dan tombol *logout* saat sesi aktif.
  - **Dasbor Admin Control**: Menyediakan UI tabel interaktif untuk manajemen dokter, pencarian data instan berbasis NIP/Nama, form manajemen warna tematik, serta fitur *Toggle Eye* untuk menyembunyikan/melihat kata sandi dokter.
  - **Dasbor Klinis Dokter**: Dilengkapi dengan komponen modal entri data yang memetakan parameter klinis rumit ke pilihan bahasa industri yang mudah dipahami (*dropdown select* untuk jenis nyeri dada, ECG, dll.), indikator visual berbasis warna (`Badge` merah untuk Risiko Tinggi, hijau untuk Risiko Rendah), serta umpan balik animasi pemrosesan menggunakan `SweetAlert2` saat AI sedang menganalisis data.
* **Rute Navigasi URL (/url)**:
  - `/` -> `LandingPage` (Informasi publik produk, ringkasan keunggulan, dan Developer Hub untuk integrasi pihak ketiga).
  - `/login` -> Portal otentikasi terpusat bagi Admin dan Dokter dengan proteksi *Guest Only*.
  - `/admin` -> Pusat kendali manajemen data dokter dan pengawasan log medis global (Terproteksi *Role Admin*).
  - `/doctor` -> Ruang kerja klinis dokter untuk pengelolaan pasien dan eksekusi prediksi risiko (Terproteksi *Role Doctor*).

---

## 4. Skenario Pengujian Data Pasien
Sebagai acuan pengujian fungsionalitas sistem pendukung keputusan, berikut adalah contoh parameter masukan yang dapat digunakan pada Form Input Pasien:

1. **Profil Risiko Tinggi (Simulasi Positif Risiko Penyakit Jantung)**
   - **No & Nama Pasien**: 113 / Bpk. Haryanto
   - **Umur & Gender**: 62 / Laki-laki (`1`)
   - **Tekanan Darah (trestbps) & Kolesterol (chol)**: 160 mmHg / 286 mg/dl
   - **Detak Jantung Maks (thalach)**: 108 bps *(Kapasitas jantung lemah saat beraktivitas)*
   - **Nyeri Dada (cp)**: Asymptomatic (`3`)
   - **Gula Darah > 120 (fbs)**: Ya (`1`)
   - **ECG (restecg)**: ST-T Abnormality (`1`)
   - **Angina Latihan (exang)**: Ya (`1`)
   - **Oldpeak & Slope**: 2.8 / Downsloping (`2`)
   - **Jml Pembuluh (ca) & Thalassemia**: 2 Pembuluh / Reversable Defect (`2`)

2. **Profil Risiko Rendah (Simulasi Kondisi Sehat)**
   - **No & Nama Pasien**: 112 / Sunandir
   - **Umur & Gender**: 25 / Laki-laki (`1`)
   - **Tekanan Darah (trestbps) & Kolesterol (chol)**: 115 mmHg / 170 mg/dl
   - **Detak Jantung Maks (thalach)**: 180 bps *(Kapasitas kardio prima)*
   - **Nyeri Dada (cp)**: Typical Angina (`0`)
   - **Gula Darah > 120 (fbs)**: Tidak (`0`)
   - **ECG (restecg)**: Normal (`0`)
   - **Angina Latihan (exang)**: Tidak (`0`)
   - **Oldpeak & Slope**: 0.0 / Upsloping (`0`)
   - **Jml Pembuluh (ca) & Thalassemia**: 0 Pembuluh / Normal (`0`)