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

- [ ] Replace `better-sqlite3` with `pg` in the backend
- [ ] Rewrite `backend/db.js` — pg connection pool instead of SQLite singleton
- [ ] Convert `backend/schema.sql` to PostgreSQL syntax (no `PRAGMA`, `SERIAL` instead of `AUTOINCREMENT`, `NOW()` instead of `datetime('now')`)
- [ ] Convert all routes (`brands`, `overview`, `plans`, `sellers`, `summary`, `transactions`) from synchronous SQLite API to `async/await` with `pg`
- [ ] Convert `enforceSellerIdentity` in `backend/routes/transactions.js` to async (uses synchronous SQLite today — must use `await pool.query()` after pg migration)
- [ ] Update `backend/scripts/import-datadot.js` for PostgreSQL
- [ ] Add `/health` endpoint to `backend/server.js`
- [ ] Fix session cookie settings in `backend/server.js` for cross-origin production use:
  ```js
  cookie: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   8 * 60 * 60 * 1000,
  }
  ```
- [ ] Update CORS in `backend/server.js` to allow production origin `https://forecast.dot4sa.com.ar` (keep localhost origins for dev)
- [ ] Fix `frontend/src/utils/api.js` line 1: change hardcoded `http://localhost:3001` to use `VITE_API_URL` environment variable
- [ ] Verify frontend login screen uses `credentials: 'include'` in all fetch calls (required for session cookies to be sent)

---

## Deploy Steps (in order)

1. **Backup** — copy `backend/forecast.db` to a safe location before touching anything
2. **Code migration** — Claude handles all items in the pre-deploy checklist above
3. **Railway setup** — create project, add PostgreSQL (Railway provides `DATABASE_URL` automatically), connect GitHub repo
4. **Migrate data** — two options:
   - If all data came from Excel imports: run the updated import script against Railway PostgreSQL
   - If there are manually created transactions in the app: the SQLite DB must be exported and migrated directly to PostgreSQL (the import script only restores Excel data — manual transactions would be lost). Ask Claude to write a migration script from `forecast.db` → PostgreSQL before this step.
5. **Deploy backend** — Railway auto-deploys from GitHub on push
6. **Deploy frontend** — connect repo to Vercel, set `VITE_API_URL` env var
7. **DNS** — add two CNAME records in the hosting panel (Claude provides exact values)

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

Two records to add in the hosting DNS panel. Claude will provide the exact values once Railway and Vercel deployments are live:

| Subdomain | Type | Points to |
|---|---|---|
| `forecast` | CNAME | Vercel domain (provided after deploy) |
| `api` | CNAME | Railway domain (provided after deploy) |

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

- Railway account: exists
- GitHub repo: public (`https://github.com/Alejorro/forecast-v2`)
- The migration has not started yet
- Data is still being loaded into the local SQLite database
- All code changes will be done by Claude before any deployment step
