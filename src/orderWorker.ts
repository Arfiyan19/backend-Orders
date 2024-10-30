import fs from 'fs';
import path from 'path';

const customerOrderDir = path.join(__dirname, 'database', 'customer-order');
const deliveredOrderDir = path.join(__dirname, 'database', 'delivered-order');
const MAX_CONCURRENT_FILES = 10;
const RETRY_LIMIT = 3;
const INTERVAL = 10000; // 10 detik

// Fungsi untuk mengupdate status order dan memindahkan file
const processOrderFile = async (filePath: string, retries = 0): Promise<void> => {
  try {
    // Baca isi file order
    const data = await fs.promises.readFile(filePath, 'utf-8');
    const order = JSON.parse(data);

    // Update status order
    order.status = 'Dikirim ke customer';

    // Tentukan path tujuan di folder delivered-order
    const deliveredFilePath = path.join(deliveredOrderDir, path.basename(filePath));

    // Pastikan tidak ada file dengan nama yang sama di folder tujuan
    if (fs.existsSync(deliveredFilePath)) {
      console.error(`File ${deliveredFilePath} sudah ada di folder delivered-order. Melewati file.`);
      return;
    }

    // Tulis file yang sudah diupdate ke folder delivered-order
    await fs.promises.writeFile(deliveredFilePath, JSON.stringify(order, null, 2));

    // Hapus file asli dari folder customer-order
    await fs.promises.unlink(filePath);

    console.log(`Order ${path.basename(filePath)} berhasil diupdate dan dipindahkan ke delivered-order.`);
  } catch (error) {
    if (retries < RETRY_LIMIT) {
      console.error(`Gagal memproses ${filePath}. Mencoba ulang (${retries + 1}/${RETRY_LIMIT})...`);
      await processOrderFile(filePath, retries + 1);
    } else {
      console.error(`Gagal memproses ${filePath} setelah ${RETRY_LIMIT} kali. Error: ${(error as Error).message}`);
    }
  }
};

// Fungsi utama worker
const worker = async () => {
  try {
    // Baca semua file di folder customer-order
    const files = await fs.promises.readdir(customerOrderDir);

    // Batasi jumlah file yang diproses secara bersamaan
    const filesToProcess = files.slice(0, MAX_CONCURRENT_FILES);

    // Proses setiap file secara bersamaan dengan Promise.all
    await Promise.all(
      filesToProcess.map(file => {
        const filePath = path.join(customerOrderDir, file);
        return processOrderFile(filePath);
      })
    );
  } catch (error) {
    console.error(`Terjadi kesalahan pada worker: ${(error as Error).message}`);
  }
};

// Jalankan worker setiap 10 detik
setInterval(worker, INTERVAL);

console.log('Worker berjalan setiap 10 detik untuk memproses order...');
