# Local development and recovery

Install Node 24, npm dependencies (npm ci --include=dev), and Docker Desktop. Create private local settings once with node tools/setup-env.mjs if .env is absent.

Run:

```powershell
npm run dev
```

For the standard local database at localhost:55432, startup starts PostgreSQL/Redis while preserving volumes, waits for health, applies migrations only when the owner URL matches that same local database, and seeds only an empty local users table when SEED_PASSWORD is configured. Remote databases are never automatically migrated or seeded. SKIP_LOCAL_SERVICES=true skips automatic Docker startup.

Open **http://localhost:4000**. The development API redirects its root to the Vite website at **http://localhost:5173**, preserving password-reset query strings. API health is http://localhost:4000/api/v1/health. Production containers serve the built website directly; Vercel serves the compiled website with its API function.

Existing healthy frontend/API processes are reused. Stop the owning development terminal to restart those processes; do not start multiple copies on the same ports. If Docker Desktop is stopped, startup reports that problem before launching the site. For manual recovery:

```powershell
docker compose up -d --wait db redis
npm run dev
```

The local API requires a working database. Port 5173 alone can display the login form while database-backed requests are unavailable. Health now distinguishes those situations. Mail polling backs off during database outages, logs the first failure with its code and logs recovery; it does not start overlapping polling runs. The API handles idle database disconnects without an unhandled pool error.

APP_ORIGIN is not needed for request validation. Development accepts same-origin browser requests and loopback aliases on the same port/scheme. Keep private .env files and DUMMY_LOGIN_CREDENTIALS.md out of Git and deployment uploads.
