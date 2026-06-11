const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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
    return `/api/doctor/records/pdf/download`;
};

const devGetAbsolutePath = (filename) => {
    const dir = path.resolve(process.env.PDF_STORAGE_DIR || './storage/pdfs');
    return path.join(dir, filename);
};

// --- PRODUCTION: SUPABASE STORAGE ---
let supabaseClient = null;
const getSupabase = () => {
    if (supabaseClient) return supabaseClient;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
        throw new Error('SUPABASE_URL dan SUPABASE_KEY harus diisi untuk mode production.');
    }
    supabaseClient = createClient(url, key);
    return supabaseClient;
};

const prodSavePdf = async (buffer, filename) => {
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'cardiosentries';
    const supabase = getSupabase();

    // Upload ke Supabase (upsert: true agar file direplace jika dokter print ulang)
    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filename, buffer, {
            contentType: 'application/pdf',
            upsert: true,
            cacheControl: '0' 
        });

    if (error) throw new Error(`Supabase Upload Error: ${error.message}`);

    // Generate URL Publik langsung
    const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filename);

    return { storagePath: publicUrlData.publicUrl, mode: 'production' };
};

const prodDeleteIfExists = async (filename) => {
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'rekam-medis';
    const supabase = getSupabase();
    
    const { error } = await supabase.storage
        .from(bucketName)
        .remove([filename]);
        
    if (error) console.error(`[Supabase] Gagal hapus ${filename}:`, error.message);
};

const prodGetDownloadUrl = async (filename) => {
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'rekam-medis';
    const supabase = getSupabase();
    
    const { data } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filename);
        
    return data.publicUrl;
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