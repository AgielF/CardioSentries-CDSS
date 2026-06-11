const PDFDocument = require('pdfkit');

const generatePatientReport = (records, doctorInfo) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 },
                info: {
                    Title: 'Rekapan Pasien - CardioSentries CDSS',
                    Author: 'CardioSentries CDSS',
                    Subject: 'Rekapan Data Pasien Dokter'
                }
            });

            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // ===== HEADER =====
            doc.fontSize(16).font('Helvetica-Bold').text('REKAPAN PASIEN', { align: 'center' });
            doc.fontSize(11).font('Helvetica').text('CardioSentries CDSS', { align: 'center' });
            doc.moveDown(0.3);
            doc.strokeColor('#cccccc').lineWidth(0.5)
               .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(0.8);

            // Info Dokter
            doc.fontSize(10).font('Helvetica-Bold').text('Dokter Penanggung Jawab:');
            doc.font('Helvetica').fontSize(10)
               .text(`Nama   : ${doctorInfo?.name || '-'}`)
               .text(`NIP    : ${doctorInfo?.nip || '-'}`)
               .text(`Tanggal Cetak: ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`);
            doc.moveDown(1);

            // ===== TABEL =====
            const tableTop = doc.y;
            const colX = { no: 50, rm: 90, nama: 165, tanggal: 280, hasil: 380, prob: 480 };
            const colWidths = { no: 40, rm: 75, nama: 115, tanggal: 100, hasil: 100, prob: 65 };

            // Header tabel
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
            doc.rect(50, tableTop, 495, 20).fill('#1e3a8a');
            doc.fillColor('#ffffff');
            doc.text('No',      colX.no + 4,     tableTop + 6, { width: colWidths.no });
            doc.text('No. RM',  colX.rm + 4,     tableTop + 6, { width: colWidths.rm });
            doc.text('Nama',    colX.nama + 4,   tableTop + 6, { width: colWidths.nama });
            doc.text('Tgl Periksa', colX.tanggal + 4, tableTop + 6, { width: colWidths.tanggal });
            doc.text('Hasil',   colX.hasil + 4,  tableTop + 6, { width: colWidths.hasil });
            doc.text('Prob.',   colX.prob + 4,   tableTop + 6, { width: colWidths.prob });

            // Baris data
            doc.fillColor('#000000').font('Helvetica').fontSize(8);
            let rowY = tableTop + 22;
            const rowHeight = 18;
            const pageBottom = doc.page.height - doc.page.margins.bottom;

            if (records.length === 0) {
                doc.moveDown(2);
                doc.fontSize(10).fillColor('#666').text('Belum ada data pasien.', 50, rowY, { align: 'center', width: 495 });
            } else {
                records.forEach((rec, idx) => {
                    if (rowY + rowHeight > pageBottom) {
                        doc.addPage();
                        rowY = doc.page.margins.top;
                    }
                    // Striping
                    if (idx % 2 === 0) {
                        doc.rect(50, rowY - 2, 495, rowHeight).fill('#f3f4f6');
                        doc.fillColor('#000000');
                    }
                    const tgl = rec.updatedAt
                        ? new Date(rec.updatedAt).toLocaleDateString('id-ID')
                        : '-';
                    const prob = rec.probability != null ? `${rec.probability.toFixed(1)}%` : '-';
                    const hasil = rec.prediction_result || '-';
                    const tinggi = hasil.toLowerCase().includes('tinggi');

                    doc.text(String(idx + 1),                 colX.no + 4,     rowY + 4, { width: colWidths.no });
                    doc.text(rec.patient_number || '-',       colX.rm + 4,     rowY + 4, { width: colWidths.rm });
                    doc.text(rec.patient_name || '-',         colX.nama + 4,   rowY + 4, { width: colWidths.nama });
                    doc.text(tgl,                             colX.tanggal + 4, rowY + 4, { width: colWidths.tanggal });
                    doc.fillColor(tinggi ? '#b91c1c' : '#15803d')
                       .text(hasil,                            colX.hasil + 4,  rowY + 4, { width: colWidths.hasil });
                    doc.fillColor('#000000').text(prob,       colX.prob + 4,   rowY + 4, { width: colWidths.prob });

                    rowY += rowHeight;
                });
            }

            // ===== FOOTER (di halaman terakhir) =====
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                doc.fontSize(8).fillColor('#666')
                   .text(
                       `Halaman ${i - range.start + 1} dari ${range.count}`,
                       50,
                       doc.page.height - doc.page.margins.bottom + 20,
                       { align: 'center', width: 495 }
                   );
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

module.exports = { generatePatientReport };
