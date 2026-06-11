const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const getMode = () => {
    const mode = (process.env.APP_MODE || 'dev').toLowerCase();
    if (mode !== 'dev' && mode !== 'production') {
        console.warn(`[storageService] APP_MODE='${mode}' tidak dikenal, fallback ke 'dev'.`);
        return 'dev';
    }
    return mode;
};

// --- DEV: filesystem lokal ---
const devSavePdf = async (buffer, filename) => {
    const dir = path.resolve(process.env.PDF_STORAGE_DIR || './storage/pdfs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fullPath = path.join(dir, filename);
    await fs.promises.writeFile(fullPath, buffer);
    return { storagePath: fullPath, mode: 'dev' };
};

const devDeleteIfExists = async (filename) => {
    const dir = path.resolve(process.env.PDF_STORAGE_DIR || './storage/pdfs');
    const fullPath = path.join(dir, filename);
    try {
        await fs.promises.unlink(fullPath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
};

const devGetDownloadUrl = (filename) => {
    // Untuk dev: URL relative yang akan di-handle endpoint backend sendiri
    return `/api/doctor/records/pdf/download`;
};

const devGetAbsolutePath = (filename) => {
    const dir = path.resolve(process.env.PDF_STORAGE_DIR || './storage/pdfs');
    return path.join(dir, filename);
};

// --- PRODUCTION: Google Cloud Storage ---
let gcsStorage = null;
const getGcs = () => {
    if (gcsStorage) return gcsStorage;
    const projectId = process.env.GCP_PROJECT_ID;
    const keyFile = process.env.GCP_KEY_FILE_PATH;
    if (!projectId || !keyFile) {
        throw new Error('GCP_PROJECT_ID dan GCP_KEY_FILE_PATH harus diisi untuk mode production.');
    }
    gcsStorage = new Storage({
        projectId,
        keyFilename: path.resolve(keyFile),
    });
    return gcsStorage;
};

const getBucket = () => {
    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) throw new Error('GCP_BUCKET_NAME harus diisi untuk mode production.');
    return getGcs().bucket(bucketName);
};

const prodSavePdf = async (buffer, filename) => {
    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) throw new Error('GCP_BUCKET_NAME harus diisi untuk mode production.');
    const file = getGcs().bucket(bucketName).file(filename);
    await file.save(buffer, {
        resumable: false,
        contentType: 'application/pdf',
        metadata: { cacheControl: 'no-cache' },
    });
    // Public URL langsung — tanpa token, tanpa signed
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
    return { storagePath: publicUrl, mode: 'production' };
};

const prodDeleteIfExists = async (filename) => {
    const file = getBucket().file(filename);
    try {
        await file.delete();
    } catch (err) {
        if (err.code !== 404) throw err;
    }
};

const prodGetDownloadUrl = async (filename) => {
    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) throw new Error('GCP_BUCKET_NAME harus diisi untuk mode production.');
    return `https://storage.googleapis.com/${bucketName}/${filename}`;
};

// --- Public API ---
const savePdf = async (buffer, filename) => {
    const mode = getMode();
    if (mode === 'dev') return devSavePdf(buffer, filename);
    return prodSavePdf(buffer, filename);
};

const deleteIfExists = async (filename) => {
    const mode = getMode();
    if (mode === 'dev') return devDeleteIfExists(filename);
    return prodDeleteIfExists(filename);
};

const getDownloadUrl = async (filename) => {
    const mode = getMode();
    if (mode === 'dev') return devGetDownloadUrl(filename);
    return prodGetDownloadUrl(filename);
};

const getAbsolutePath = (filename) => {
    if (getMode() !== 'dev') return null;
    return devGetAbsolutePath(filename);
};

const getCurrentMode = () => getMode();

module.exports = {
    savePdf,
    deleteIfExists,
    getDownloadUrl,
    getAbsolutePath,
    getCurrentMode,
};
