import { Request, Response } from 'express';
import { db } from './db';
import { RowDataPacket } from 'mysql2';
import fs from 'fs';
import path from 'path';

const processingCustomers = new Set<number>();

// Fungsi untuk menghasilkan nomor order unik
const generateOrderNumber = async (customerId: number): Promise<string> => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1`,
    [`ORDER-${customerId}-${year}${month}${day}-%`]
  );

  let runningNumber = '00001';

  if (rows.length > 0) {
    const lastOrderNumber = rows[0].order_number;
    const lastRunningNumber = parseInt(lastOrderNumber.split('-').pop() || '0', 10);
    runningNumber = String(lastRunningNumber + 1).padStart(5, '0');
  }

  return `ORDER-${customerId}-${year}${month}${day}-${runningNumber}`;
};

// Fungsi untuk menyimpan data order ke file JSON
const saveOrderToFile = async (orderData: any, fileName: string, retries: number = 3): Promise<void> => {
  const filePath = path.join(__dirname, 'database', 'customer-order', `${fileName}.json`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, JSON.stringify(orderData, null, 2));
      console.log(`Order berhasil disimpan di ${filePath}`);
      return;
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`Gagal menyimpan order setelah ${retries} kali: ${(error as Error).message}`);
      }
      console.log(`Percobaan ${attempt} gagal, mencoba lagi...`);
    }
  }
};

// Fungsi utama untuk membuat order
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  const { customer_id, address, payment_type, item, name, email } = req.body;

  // Concurrency Control: cek jika customer sedang diproses
  if (processingCustomers.has(customer_id)) {
    res.status(409).json({
      message: "Order sedang diproses. Harap tunggu hingga selesai.",
      result: {
        order_number: null
      }
    });
    return; // Menghentikan eksekusi lebih lanjut
  }

  // Tambahkan customer ke dalam set untuk menandakan sedang dalam proses
  processingCustomers.add(customer_id);

  const orderNumber = await generateOrderNumber(customer_id);
  const { id_product, name: itemName, price, qty } = item;

  const orderData = {
    no_order: orderNumber,
    id_customer: customer_id,
    name,
    email,
    address,
    payment_type,
    items: [
      {
        id_product,
        name: itemName,
        price,
        qty
      }
    ],
    total: price * qty,
    status: 'Order Diterima'
  };

  setTimeout(async () => {
    try {
      // Menyimpan order ke database
      const [result] = await db.execute(
        `INSERT INTO orders (order_number, customer_id, address, payment_type, item_id, item_name, item_price, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNumber, customer_id, address, payment_type, id_product, itemName, price, qty]
      );

      // Menyimpan data order ke dalam file JSON
      try {
        await saveOrderToFile(orderData, orderNumber);

        // Hapus customer dari set setelah selesai
        processingCustomers.delete(customer_id);

        // Mengirim respons dengan format lengkap
        res.status(201).json({
          message: 'Order berhasil diproses',
          result: {
            order_number: orderNumber,
            customer_id: customer_id,
            name: name,
            address: address,
            total: price * qty,
            status: 'Order Diterima'
          }
        });
      } catch (error) {
        // Hapus customer dari set jika terjadi error saat penyimpanan file
        processingCustomers.delete(customer_id);
        res.status(500).json({ error: (error as Error).message });
      }
    } catch (error) {
      // Hapus customer dari set jika terjadi error saat penyimpanan ke database
      processingCustomers.delete(customer_id);
      res.status(500).json({ error: (error as Error).message });
    }
  }, 3000);
};
