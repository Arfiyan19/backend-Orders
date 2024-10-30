import express, { Express } from 'express';
import { createOrder } from './orderController';

const app: Express = express();
const port = 3000;

app.use(express.json());

app.post('/order', createOrder); // Pastikan path dan handler benar

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
