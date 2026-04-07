import express from 'express';
import cors from 'cors';

// Initialize DB (runs schema on first start)
import './db.js';

import brandsRouter       from './routes/brands.js';
import sellersRouter      from './routes/sellers.js';
import transactionsRouter from './routes/transactions.js';
import plansRouter        from './routes/plans.js';
import overviewRouter     from './routes/overview.js';
import summaryRouter      from './routes/summary.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.set('etag', false);

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// ─── No-cache for all /api routes ────────────────────────────────────────────

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/brands',       brandsRouter);
app.use('/api/sellers',      sellersRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/plans',        plansRouter);
app.use('/api/overview',     overviewRouter);

// summary routes: /api/brands/:id/summary and /api/sellers/summary
app.use('/api', summaryRouter);

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Forecast V2 backend running on http://localhost:${PORT}`);
});
