import express from 'express';
import cors from 'cors';
import session from 'express-session';

import { initDb } from './db.js';

import brandsRouter       from './routes/brands.js';
import sellersRouter      from './routes/sellers.js';
import transactionsRouter from './routes/transactions.js';
import plansRouter        from './routes/plans.js';
import overviewRouter     from './routes/overview.js';
import summaryRouter      from './routes/summary.js';
import authRouter         from './routes/auth.js';
import performanceRouter  from './routes/performance.js';
import activityRouter     from './routes/activity.js';
import ventasRouter, { startVentasAutoSync } from './routes/ventas.js';

import { attachUser, requireAdmin, requireAuth } from './middleware/auth.js';

const app  = express();
const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (process.env.NODE_ENV === 'production' && !SESSION_SECRET) {
  throw new Error('SESSION_SECRET env var is required in production');
}


app.set('etag', false);
app.set('trust proxy', 1); // Required for Railway — allows secure cookies behind reverse proxy

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'https://forecast.dot4sa.com.ar',
    'https://forecast-v2-khaki.vercel.app',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

app.use(express.json());

app.use(session({
  name:   'dot4.sid',
  secret: SESSION_SECRET || 'dot4-forecast-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  },
}));

// Attach session user to req.user on every request
app.use(attachUser);

// ─── No-cache for all /api routes ────────────────────────────────────────────

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);

app.use('/api', requireAuth);

app.use('/api/brands',       brandsRouter);
app.use('/api/sellers',      sellersRouter);
app.use('/api/transactions', transactionsRouter);

// Plans: GET is open; PUT requires admin
app.use('/api/plans', (req, res, next) => {
  if (req.method === 'PUT') return requireAdmin(req, res, next);
  next();
}, plansRouter);

app.use('/api/overview',     overviewRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/activity',   activityRouter);
app.use('/api/ventas',     ventasRouter);

// summary routes: /api/brands/:id/summary and /api/sellers/summary
app.use('/api', summaryRouter);

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Forecast V2 backend running on http://localhost:${PORT}`);
      startVentasAutoSync();
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
