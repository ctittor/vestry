# Vestry

**Testing without AWS:** follow the [Vercel + Neon test setup](docs/VERCEL_TESTING.md). It supports core records and role testing; uploads, OCR and outgoing email are unavailable.

For Vercel, follow the [step-by-step deployment and database migration guide](docs/VERCEL_DEPLOYMENT.md). The private verified PostgreSQL dump stays under `data/migration/` and is excluded from Git.

A Roman Catholic archdiocese and parish records workspace. Hierarchy: archdiocese → forane → parish → unit → household → member. React/TypeScript, Express, PostgreSQL with forced row-level security, Redis/BullMQ, local or S3-compatible original storage, and an optional local OCR worker.

See the [archdiocese and parish onboarding guide](docs/ARCHDIOCESE_GUIDE.md) for central roles, adding churches, parish logins, contact alerts and deployment.

The [forane guide and research](docs/FORANE_GUIDE.md) covers Syro-Malabar responsibilities, forane logins, parish assignments, visitations, meetings, catechesis, private office records and report review. Apply migrations through 015. Local forane accounts: `forane@vestry.example` and `forane.stjoseph@vestry.example`, using the same private `SEED_PASSWORD`.

## Local development

1. Install Node 24 and start Docker Desktop.
2. Run `node tools/setup-env.mjs` to create a private `.env` with random local credentials (never overwrites an existing file). Alternatively copy `.env.example` and replace every placeholder. Passwords in database URLs must be URL safe; `MFA_ENCRYPTION_KEY` is 32 random bytes as 64 hex characters. Never commit `.env`.
3. `npm ci`
4. `docker compose up -d db redis`
5. `npm run db:migrate`
6. Set a private `SEED_PASSWORD` in `.env`, then `npm run db:seed` for **synthetic development data only**.
7. `npm run dev`
8. Open **http://localhost:5173**. Use `operator@vestry.example` for super administration, `archdiocese@vestry.example` for archdiocese administration, or `admin@stmary.example`, `priest@stmary.example`, `clerk@stmary.example`, `auditor@stmary.example` for parish access, with the local `SEED_PASSWORD`. The second isolated parish uses `@stjoseph.example`. Central users select a parish from the directory before accessing its records.

The development UI uses port 5173 and exits if it is already occupied, instead of switching to an address rejected by the API's origin protection. If Vestry is already running, reuse **http://localhost:5173**.

For local OCR: enable local OCR in Administration and run `npm run worker`. PDF processing needs Poppler and fonts, included in the Docker image; use the worker service for PDF workloads. The manual route does not require Redis or an OCR provider. First use of Tesseract downloads its English language model; no church image is uploaded. Pre-provision trained data for offline environments.

When the API runs on Windows through `npm run dev`, share its data directory with the Docker PDF worker (PowerShell, from the repository): `docker compose run --rm --no-deps --volume "${PWD}/data:/app/data" worker`. Build the image with `docker compose build app` first. In the production Compose stack, app and worker already share the named data volume.

## Verify

`npm run build`, `npm test`, `npm run test:e2e` (starts/reuses a compiled preview on port 4173; uses installed Microsoft Edge, Chromium in CI). Browser screenshots are saved to `.qa/`. Tests create isolated synthetic tenants in the development database. Never run integration tests against production. The build includes precompressed Brotli/gzip assets.

## Delivery status

This is a working core implementation, not an independently approved production release. See [release status](docs/RELEASE_STATUS.md) for implemented workflows, known limitations and remaining release gates. No production data or public service has been created. Roman Catholic policy and certificate wording remain subject to diocesan approval.

See [verification](docs/VERIFICATION.md), [deployment](docs/DEPLOYMENT.md), [backup and recovery](docs/BACKUP_AND_RECOVERY.md), [architecture](docs/ARCHITECTURE.md) and the role-specific guides in `docs/`.
