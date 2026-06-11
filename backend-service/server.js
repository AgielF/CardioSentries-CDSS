require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Untuk nembak ke Python
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { Doctor, PatientRecord, PrintHistory } = require('./models');
const swaggerUi = require('swagger-ui-express'); // Nanti untuk dokumentasi
const { generatePatientReport } = require('./services/pdfService');
const storageService = require('./services/storageService');

const app = express();
app.use(cors());
app.use(express.json());

// --- MIDDLEWARE (Module 11: Security) ---
// Mendukung dua cara kirim token:
// 1. Header "Authorization: Bearer <token>" (default axios/fetch)
// 2. Query string "?token=<token>" (untuk window.open tab baru / link <a>)
const verifyToken = (req, res, next) => {
    let raw = null;
    const auth = req.headers['authorization'];
    if (auth) {
        raw = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    } else if (req.query && req.query.token) {
        raw = String(req.query.token);
    }

    if (!raw) return res.status(403).json({ msg: "No token provided" });

    jwt.verify(raw, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ msg: "Unauthorized" });
        req.user = decoded;
        next();
    });
};

const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: "Admin Access Only" });
    next();
};

// --- AUTHENTICATION ROUTES ---

// Login (Bisa Admin atau Dokter)
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    // 1. Cek apakah Admin (Hardcode .env)
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin', name: 'Super Admin' }, process.env.JWT_SECRET);
        return res.json({ token, role: 'admin', user: { name: 'Super Admin' } });
    }

    // 2. Jika bukan admin, Cek Tabel Dokter
    const doctor = await Doctor.findOne({ where: { nip: username } });
    if (doctor && doctor.password === password) {
        const token = jwt.sign({ role: 'doctor', nip: doctor.nip, name: doctor.name }, process.env.JWT_SECRET);
        return res.json({ token, role: 'doctor', user: { name: doctor.name, nip: doctor.nip } });
    }

    return res.status(401).json({ msg: "Username atau Password Salah" });
});

// --- ADMIN ROUTES (Manage Doctors) ---

// Get All Doctors (Admin Only)
app.get('/api/admin/doctors', verifyToken, verifyAdmin, async (req, res) => {
    const doctors = await Doctor.findAll();
    res.json(doctors);
});

// Add Doctor (Admin Only)
app.post('/api/admin/doctors', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { nip, name, password } = req.body;
        const newDoc = await Doctor.create({ nip, name, password });
        res.json({ msg: "Dokter berhasil didaftarkan", data: newDoc });
    } catch (err) {
        res.status(400).json({ msg: "Gagal, mungkin NIP sudah ada?" });
    }
});

// UPDATE DOCTOR (Edit Data)
app.put('/api/admin/doctors/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nip, name, password } = req.body;
        
        const doctor = await Doctor.findByPk(id);
        if (!doctor) return res.status(404).json({ msg: "Dokter tidak ditemukan" });

        // Update data
        doctor.nip = nip;
        doctor.name = name;
        doctor.password = password;
        await doctor.save();

        res.json({ msg: "Data dokter berhasil diperbarui", data: doctor });
    } catch (err) {
        res.status(500).json({ msg: "Gagal update, NIP mungkin bentrok" });
    }
});

// DELETE DOCTOR (Hapus Data)
app.delete('/api/admin/doctors/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await Doctor.destroy({ where: { id } });
        res.json({ msg: "Dokter berhasil dihapus" });
    } catch (err) {
        res.status(500).json({ msg: "Gagal menghapus dokter" });
    }
});

// View All Records (Admin View - Read Only)
app.get('/api/admin/all-records', verifyToken, verifyAdmin, async (req, res) => {
    const records = await PatientRecord.findAll();
    res.json(records);
});


// --- DOCTOR ROUTES (Operational) ---

// Get My Records (Hanya pasien milik dokter yang login)
app.get('/api/doctor/records', verifyToken, async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ msg: "Doctor Only" });
    
    const records = await PatientRecord.findAll({ where: { doctor_nip: req.user.nip } });
    res.json(records);
});

// CREATE NEW PREDICTION (Input Pasien -> Hitung ke Python -> Simpan DB)
app.post('/api/doctor/predict', verifyToken, async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ msg: "Doctor Only" });

    const { patient_number, patient_name, medical_data } = req.body;

    try {
        // 1. Kirim data medis ke Python AI Service
        const aiResponse = await axios.post(process.env.AI_SERVICE_URL, medical_data);
        
        // --- PERBAIKAN DI SINI ---
        // Python mengirim key "probability_percent", bukan "probability"
        const result_text = aiResponse.data.result_text;
        const probability = aiResponse.data.probability_percent; // <--- INI KUNCINYA

        // 2. Simpan hasil ke Database Node.js
        const newRecord = await PatientRecord.create({
            patient_number,
            patient_name,
            medical_data, 
            prediction_result: result_text,
            probability: probability, // Simpan nilai yang benar
            doctor_nip: req.user.nip
        });

        res.json({ msg: "Prediksi Selesai & Disimpan", data: newRecord });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Gagal menghubungi AI Service" });
    }
});

// EDIT RECORD (Update Data Pasien -> Hitung Ulang ke Python -> Update DB)
app.put('/api/doctor/records/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ msg: "Doctor Only" });
    
    const { id } = req.params;
    const { medical_data } = req.body; // Dokter update kondisi medis

    try {
        const record = await PatientRecord.findOne({ where: { id, doctor_nip: req.user.nip } });
        if (!record) return res.status(404).json({ msg: "Record tidak ditemukan" });

        // 1. Hitung Ulang di Python
        const aiResponse = await axios.post(process.env.AI_SERVICE_URL, medical_data);
        
        // 2. Update DB
        record.medical_data = medical_data;
        record.prediction_result = aiResponse.data.result_text;
        record.probability = aiResponse.data.probability_percent;
        await record.save();

        res.json({ msg: "Data Updated & Re-Predicted", data: record });

    } catch (err) {
        res.status(500).json({ msg: "Error update" });
    }
});

app.delete('/api/doctor/records/:id', verifyToken, async (req, res) => {
    // Logic delete here...
    await PatientRecord.destroy({ where: { id: req.params.id, doctor_nip: req.user.nip }});
    res.json({ msg: "Deleted" });
});

// --- PUBLIC API (Untuk Tamu / RS Lain) - Module 10 ---
// Dokumentasi Swagger sederhana (JSON)
app.get('/api/public/docs', (req, res) => {
    res.json({
        endpoint: "/api/public/predict",
        method: "POST",
        body: "JSON Object (age, sex, cp...)",
        description: "Open API for external hospital integration"
    });
});

// Proxy Public
app.post('/api/public/predict', async (req, res) => {
    try {
        const aiResponse = await axios.post(process.env.AI_SERVICE_URL, req.body);
        res.json(aiResponse.data);
    } catch (err) {
        res.status(500).json({ msg: "AI Service Error" });
    }
});

// --- PDF: Generate & Print Rekapan Pasien Dokter ---
// Generate PDF (auto overwrite file lama + catat riwayat)
app.get('/api/doctor/records/pdf', verifyToken, async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ msg: "Doctor Only" });

    try {
        const records = await PatientRecord.findAll({
            where: { doctor_nip: req.user.nip },
            order: [['updatedAt', 'DESC']],
        });
        const doctor = await Doctor.findOne({ where: { nip: req.user.nip } });
        const doctorInfo = doctor
            ? { nip: doctor.nip, name: doctor.name }
            : { nip: req.user.nip, name: req.user.name };

        const safeNip = String(req.user.nip).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `dokter_${safeNip}_patients.pdf`;

        // 1. Generate PDF Buffer
        const pdfBuffer = await generatePatientReport(records, doctorInfo);

        // 2. Hapus file lama (best-effort) lalu simpan yang baru
        await storageService.deleteIfExists(filename);
        const saveResult = await storageService.savePdf(pdfBuffer, filename);

        // 3. Catat / update riwayat (1 baris per dokter)
        const now = new Date();
        const [history] = await PrintHistory.findOrCreate({
            where: { doctor_nip: req.user.nip },
            defaults: {
                doctor_nip: req.user.nip,
                filename,
                storage_path: saveResult.storagePath,
                mode: storageService.getCurrentMode(),
                last_printed_at: now,
            },
        });
        // Update field supaya selalu merefleksikan print terbaru
        await history.update({
            filename,
            storage_path: saveResult.storagePath,
            mode: storageService.getCurrentMode(),
            last_printed_at: now,
        });

        res.json({
            msg: 'PDF berhasil dibuat',
            mode: storageService.getCurrentMode(),
            filename,
            storagePath: saveResult.storagePath,
            count: records.length,
            lastPrintedAt: now,
        });
    } catch (err) {
        console.error('[PDF] Gagal generate:', err);
        res.status(500).json({ msg: 'Gagal membuat PDF', error: err.message });
    }
});

// Ambil riwayat print terakhir (1 record) untuk dokter yang login
app.get('/api/doctor/print-history', verifyToken, async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ msg: "Doctor Only" });
    try {
        const history = await PrintHistory.findOne({
            where: { doctor_nip: req.user.nip },
        });
        if (!history) return res.json({ history: null });
        res.json({ history });
    } catch (err) {
        console.error('[History] Gagal ambil:', err);
        res.status(500).json({ msg: 'Gagal mengambil riwayat' });
    }
});

// Download PDF — SELALU return JSON dengan URL siap-pakai di browser
// (dev: URL relatif ke /api/doctor/records/pdf/file + ?token=; production: public URL bucket GCS)
app.get('/api/doctor/records/pdf/download', verifyToken, async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ msg: "Doctor Only" });

    try {
        const mode = storageService.getCurrentMode();
        const history = await PrintHistory.findOne({ where: { doctor_nip: req.user.nip } });
        if (!history || !history.filename) {
            return res.status(404).json({ msg: 'Belum ada riwayat print. Klik "Print PDF" dulu.' });
        }
        const filename = history.filename;

        if (mode === 'production') {
            const signedUrl = await storageService.getDownloadUrl(filename);
            return res.json({ mode: 'production', downloadUrl: signedUrl, filename });
        }

        // Dev: kembalikan path ke endpoint yang me-serve file
        return res.json({
            mode: 'dev',
            downloadUrl: `/api/doctor/records/pdf/file?f=${encodeURIComponent(filename)}`,
            filename,
        });
    } catch (err) {
        console.error('[PDF Download] Error:', err);
        res.status(500).json({ msg: 'Gagal mendapatkan URL download', error: err.message });
    }
});

// Serve file PDF biner langsung ke browser (khusus mode dev)
app.get('/api/doctor/records/pdf/file', verifyToken, async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ msg: "Doctor Only" });

    const mode = storageService.getCurrentMode();
    if (mode !== 'dev') {
        return res.status(400).json({ msg: 'Endpoint ini hanya untuk mode dev.' });
    }

    const filename = req.query.f;
    if (!filename) return res.status(400).json({ msg: 'Parameter ?f=<filename> wajib.' });

    // Validasi: filename harus sesuai dengan history dokter (anti path traversal)
    const history = await PrintHistory.findOne({ where: { doctor_nip: req.user.nip } });
    if (!history || history.filename !== filename) {
        return res.status(403).json({ msg: 'Akses ditolak: file bukan milik Anda.' });
    }

    const fullPath = storageService.getAbsolutePath(filename);
    if (!fullPath || !fs.existsSync(fullPath)) {
        return res.status(404).json({ msg: 'File PDF tidak ditemukan. Silakan klik "Print PDF" dulu.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(fullPath).pipe(res);
});

app.listen(process.env.PORT, () => {
    console.log(`🚀 Backend Manager running on port ${process.env.PORT}`);
    console.log(`🔗 Admin Configured: ${process.env.ADMIN_USERNAME}`);
    console.log(`📦 App Mode: ${storageService.getCurrentMode()}`);
});