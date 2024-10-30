import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // ganti dengan password MySQL Anda
  database: 'order_management'
});
