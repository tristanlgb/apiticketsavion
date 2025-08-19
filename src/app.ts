import 'dotenv/config';
import express from 'express';
import flightsRouter from './routes/flights';

const app = express();
app.use(express.json());

app.use('/flights', flightsRouter);

app.use((err: any, _req, res, _next) => {
  console.error('Unhandled error:', err);
  return res.status(400).json({ code: 400, errors: err?.message ?? 'unexpected_error' });
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`API listening on :${port}`));
