# Forecast V2 — Deployment Guide

## Goal

Any DOT4 employee can access the app at `forecast.dot4sa.com.ar` from anywhere.

---

## Architecture

| Layer | Service | URL |
|---|---|---|
| Frontend | Vercel | `forecast.dot4sa.com.ar` |
| Backend API | Railway | `api.dot4sa.com.ar` |
| Database | Railway (PostgreSQL) | internal to Railway |

The current dot4sa.com.ar hosting is used for DNS management only. It does not run any service.

---

## How It Works

- Railway provides a public URL for the backend (e.g. `forecast-api.up.railway.app`)
- A CNAME record in the hosting DNS panel points the subdomain to that Railway URL
- `api.dot4sa.com.ar` is just a stable alias — the server is Railway

```
forecast.dot4sa.com.ar  →  CNAME  →  Vercel deployment
api.dot4sa.com.ar       →  CNAME  →  forecast-api.up.railway.app (Railway)
```

Always use `api.dot4sa.com.ar` as the backend endpoint. The Railway-generated URL may change on redeploy.

---

## Local → Production Workflow (after go-live)

```
local: develop + test
    ↓
git commit + git push
    ↓
Railway detects the push → redeploys backend automatically
Vercel detects the push → redeploys frontend automatically
```

No extra steps. Every push to `main` updates production.

---

## Pre-deploy Checklist (code changes required — Claude handles these)

- [x] Replace `better-sqlite3` with `pg` in the backend
- [x] Rewrite `backend/db.js` — pg connection pool instead of SQLite singleton
- [x] Convert `backend/schema.sql` to PostgreSQL syntax (no `PRAGMA`, `SERIAL` instead of `AUTOINCREMENT`, `NOW()` instead of `datetime('now')`)
- [x] Convert all routes (`brands`, `overview`, `plans`, `sellers`, `summary`, `transactions`) from synchronous SQLite API to `async/await` with `pg`
- [x] Convert `enforceSellerIdentity` in `backend/routes/transactions.js` to async
- [x] Update `backend/scripts/import-datadot.js` for PostgreSQL
- [x] Add `/health` endpoint to `backend/server.js`
- [x] Fix session cookie settings in `backend/server.js` for cross-origin production use
- [x] Update CORS in `backend/server.js` to allow production origin `https://forecast.dot4sa.com.ar` (and `https://forecast-v2-khaki.vercel.app` for testing)
- [x] Fix `frontend/src/utils/api.js` line 1: now reads from `VITE_API_URL` with fallback to localhost
- [x] Verify frontend login screen uses `credentials: 'include'` in all fetch calls
- [x] Write `backend/scripts/migrate-sqlite-to-pg.js` — migrates SQLite data to PostgreSQL preserving manual transactions

---

## Deploy Steps (in order)

1. **Backup** ✅ — `backend/forecast.db` copied to safe location
2. **Code migration** ✅ — all items in pre-deploy checklist done (2026-04-08)
3. **Railway setup** ✅ — project created, PostgreSQL added, GitHub repo connected, env vars set (`DATABASE_URL` auto-linked, `NODE_ENV=production`, `SESSION_SECRET` set)
4. **Migrate data** ✅ — ran `backend/scripts/migrate-sqlite-to-pg.js --clear` with public DATABASE_URL. Migrated: 5 brands, 15 sellers, 5 plans, 308 transactions.
5. **Deploy backend** ✅ — Railway auto-deploys from GitHub. Backend running at `https://forecast-v2-production.up.railway.app`
6. **Deploy frontend** ✅ — Vercel connected to repo, `VITE_API_URL=https://api.dot4sa.com.ar` set, deployed at `https://forecast.dot4sa.com.ar`
7. **DNS** ✅ — two CNAME records added in Ferozo (hosting provider):
   - `forecast.dot4sa.com.ar` → `forecast-v2-khaki.vercel.app`
   - `api.dot4sa.com.ar` → `afpyu8ii.up.railway.app` (Railway custom domain, DNS propagation pending as of 2026-04-10)

---

## What "backup" means

`backend/forecast.db` is the live SQLite database. It contains everything imported from Excel **plus** all transactions created manually through the app. This file must be copied somewhere safe before the migration starts. It is the source of truth for step 4 (import into PostgreSQL).

---

## What "connecting the repo" means (step 3 and 6)

- Railway: go to Railway dashboard → New Project → Deploy from GitHub → select `forecast-v2` repo → done
- Vercel: go to Vercel dashboard → New Project → Import from GitHub → select `forecast-v2` repo → done

Both platforms watch the `main` branch and redeploy automatically on every push.

---

## Environment Variables

**Railway (backend):**
```
DATABASE_URL=<provided by Railway automatically when PostgreSQL is added>
PORT=<provided by Railway automatically>
SESSION_SECRET=<long random string, generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
NODE_ENV=production
```

**Vercel (frontend):**
```
VITE_API_URL=https://api.dot4sa.com.ar
```

---

## CORS

The backend must allow only this origin:
```
https://forecast.dot4sa.com.ar
```

---

## DNS (step 7)

Hosting provider: **Ferozo**. Two CNAME records added:

| Subdomain | Type | Points to | Status |
|---|---|---|---|
| `forecast.dot4sa.com.ar` | CNAME | `forecast-v2-khaki.vercel.app` | ✅ Active |
| `api.dot4sa.com.ar` | CNAME | `afpyu8ii.up.railway.app` | ⏳ Propagating |

Also added TXT record for Railway domain verification:
- `_railway-verify.api.dot4sa.com.ar` → `railway-verify=48f2cb61af958c34fc0384f19ea9946dd1d28283271d0ae3edf6033ca6...` (full value in Railway dashboard)

---

## Known Code Location

The only hardcoded URL in the frontend is in `frontend/src/utils/api.js`, line 1:
```js
const BASE_URL = 'http://localhost:3001'
```
This must be changed to read from `import.meta.env.VITE_API_URL` before deploying to Vercel.

---

## Notes

- Cloudflare can be added later for SSL, security, and performance. Not required to go live.
- SQLite is not deployed — the database lives only on Railway after migration.
- Future importers (Odoo, JSON) follow the same pattern: separate scripts in `backend/scripts/` writing to the same schema.
- The migration from SQLite to PostgreSQL does not change any business logic — only the database driver and query syntax.

---

## Context for Next Session

- **Status: LIVE** — app is running at `https://forecast.dot4sa.com.ar`
- Railway account: exists, project running
- GitHub repo: `https://github.com/Alejorro/forecast-v2` — pushes to `main` auto-deploy both Railway (backend) and Vercel (frontend)
- Database: PostgreSQL on Railway, fully migrated (308 transactions)
- Pending: `api.dot4sa.com.ar` DNS propagation — once green in Railway, SSL activates automatically. Until then the backend custom domain works but may show cert errors.
- CORS: currently allows `https://forecast.dot4sa.com.ar` and `https://forecast-v2-khaki.vercel.app` (Vercel preview URL, can be removed later)
- Public DB connection string (for running scripts locally): `postgresql://postgres:***@mainline.proxy.rlwy.net:32450/railway`
