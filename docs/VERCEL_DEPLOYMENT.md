# Vercel deployment and database migration

For a limited test deployment without AWS, object storage, email or workers, see [Vercel + Neon testing](VERCEL_TESTING.md).

Vercel hosts the React website and Express API. PostgreSQL, S3, Redis, malware scanning and the continuous OCR/email worker remain external. Keep your existing AWS services, or provision equivalents. Docker deployment remains supported.

## 1. Prepare services

- Create a TLS-enabled PostgreSQL 18 database. Its direct owner connection must support creating extensions and an unprivileged `vestry_app` login. Never use the owner role in the deployed API; forced row-level security depends on the restricted role.
- Use a private, encrypted S3 bucket with public access blocked. Grant dedicated application credentials object read/write permissions. Leave S3_ENDPOINT unset for AWS S3.
- For OCR use a BullMQ-compatible Redis TCP service. TLS URLs (`rediss://user:password@host:port`) are supported; HTTP-only Redis is unsuitable.
- Configure authenticated SMTP and an authorized sender.
- Uploads require a malware scanner reachable securely from the API. Production uploads fail closed without one. An EC2-only private scanner needs secure Vercel connectivity; do not expose an unauthenticated ClamAV port publicly.
- Run the persistent worker on EC2 or another container host for OCR, PDF conversion and timely email delivery/retries. Vercel Functions cannot replace this continuous process.

## 2. Choose database migration or fresh installation

For a fresh production installation, use an empty database and proceed to step 3. Do not seed synthetic records/accounts into production.

To preserve existing local records, use the private archive under `data/migration/<timestamp>/vestry.dump`. `data/migration/latest.txt` identifies the latest folder. Its manifest records the SHA-256, server version and restored row counts. The export restores the complete archive into a separate local verification database. Dumps include account hashes, sessions, contact details and encrypted values; keep them outside GitHub and Vercel.

Regenerate a dump with Docker Desktop and the local database running:

```powershell
npm ci
npm run db:export
```

Install PostgreSQL 18 client tools, including pg_restore, and add them to PATH. In a private shell or .env set RESTORE_DATABASE_URL to the **direct owner URL of a new empty target database**, then run:

```powershell
npm run db:restore
```

Optionally specify an archive directory: `npm run db:restore -- "F:\church-records\data\migration\<timestamp>"`. The tool verifies the archive checksum, refuses an existing public schema, restores in one transaction, and compares every table count. Use standard TLS PostgreSQL URLs compatible with node-postgres and PostgreSQL client tools. Use PostgreSQL 18 or a verified compatible newer server, not an older major version.

Keep the source MFA_ENCRYPTION_KEY for existing-data migration: encrypted MFA/outbox values depend on it. Keep a separate encrypted key backup. Review and remove development/test users before real use. Existing migrated accounts retain their passwords.

Database dumps do not contain original files. If originals are local, set STORAGE_DRIVER=s3, target S3 credentials/bucket and SOURCE_STORAGE_PATH (default data/originals) in your private environment, then:

```powershell
npx tsx tools/migrate-storage.ts
npx tsx tools/migrate-storage.ts --upload
```

The first command is a dry run. The second preserves object keys and refuses to overwrite existing objects. Retain the originals until authenticated downloads are verified. Docker named-volume originals must first be exported from that volume; they are not necessarily in the Windows data directory. If originals already use S3, retain that bucket configuration.

## 3. Apply migrations

From your computer, set private variables for the target, never owner credentials in Vercel:

```dotenv
MIGRATION_DATABASE_URL=postgresql://OWNER:OWNER_PASSWORD@DIRECT_HOST:5432/ACTUAL_DATABASE?sslmode=require
DB_APP_PASSWORD=INDEPENDENT_RANDOM_URL_SAFE_PASSWORD
DATABASE_URL=postgresql://vestry_app:SAME_APP_PASSWORD@RUNTIME_HOST:5432/ACTUAL_DATABASE?sslmode=require
```

DB_APP_PASSWORD must contain 20–128 URL-safe letters, numbers, underscores or hyphens. Replace every example. Use the provider's direct endpoint for migrations. A pooled runtime endpoint must support your custom role and PostgreSQL transactions.

```powershell
npm run db:migrate
```

Run this after a dump restore too. It applies missing migrations and grants restricted runtime access to the actual database name. An existing vestry_app password is not changed automatically: reuse it or rotate through your database administrator. Runtime must not have SUPERUSER, BYPASSRLS, CREATEDB or CREATEROLE.

For a fresh installation, set private BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD (14+ characters), then:

```powershell
npm run db:bootstrap
```

Bootstrap uses DATABASE_URL and runs once. Remove bootstrap credentials afterward. Do not bootstrap a restored installation that already has a platform administrator. Do not run db:seed in production.

## 4. Import in Vercel

This repository currently defaults Vercel to the owner?s AWS-free test deployment. For a full production deployment, explicitly set TEST_DEPLOYMENT=false and configure all services below. Set APP_ORIGIN to your actual production domain.

1. Sign in to Vercel and choose **Add New → Project**.
2. Connect GitHub and import **ctittor/vestry**: https://github.com/ctittor/vestry.
3. Root directory: repository root. Framework: **Vite**. Node.js: **24.x**. Enable Fluid compute. The checked-in configuration supplies npm ci, npm run build, output dist, API routing and a 60-second API duration. Do not use a Docker start command.
4. Choose your final production domain. Set APP_ORIGIN to its exact HTTPS origin without a trailing slash, for example https://vestry-yourteam.vercel.app.
5. Add the variables below for **Production**. Keep Preview deployments isolated from production databases/storage; use separate test services and a matching origin, or leave previews without live credentials.
6. Click **Deploy**. The build does not run migrations. Pushes to main will trigger future builds. To change domains, update APP_ORIGIN and redeploy.

## 5. Vercel environment variables

| Variable | Value |
| --- | --- |
| NODE_ENV | production |
| APP_ORIGIN | Exact production HTTPS origin |
| DATABASE_URL | TLS URL for vestry_app, preferably a supported pooled endpoint |
| COOKIE_SECURE | true |
| MFA_ENCRYPTION_KEY | Random 64 hex characters; retain source key if migrating records |
| STORAGE_DRIVER | s3 |
| S3_REGION, S3_BUCKET | Your private bucket region and name |
| S3_ACCESS_KEY, S3_SECRET_KEY | Dedicated AWS credentials |
| S3_ENDPOINT | Omit for AWS S3 |
| REDIS_URL | TLS Redis TCP URL shared with worker |
| SMTP_HOST, SMTP_PORT, SMTP_SECURE | Provider host, port and true/false |
| SMTP_USER, SMTP_PASSWORD, SMTP_FROM | Authorized SMTP credentials/sender |
| CLAMAV_HOST, CLAMAV_PORT | Scanner reachable securely from Vercel |
| REQUIRE_MALWARE_SCAN | true |
| CRON_SECRET | Independent random secret, at least 32 characters |

Generate each new secret independently:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never use VITE_ prefixes for secrets: those are public browser build variables. VERCEL is automatically supplied by Vercel; do not add it locally or to the worker. Do not upload local .env. Never add MIGRATION_DATABASE_URL, RESTORE_DATABASE_URL, DB_APP_PASSWORD, owner credentials, SEED_PASSWORD or bootstrap credentials to Vercel. The runtime password is already in DATABASE_URL.

## 6. Start the external worker

Build on your worker host and inject the same production runtime variables through a secret manager/private file:

```sh
docker build -t vestry-worker .
docker run -d --restart unless-stopped --name vestry-worker --env-file /secure/vestry-worker.env vestry-worker node --import tsx server/worker.ts
```

Use external database and Redis addresses, not Compose-only db/redis hostnames. Share the S3 bucket and MFA_ENCRYPTION_KEY with the API. Do not set VERCEL. The image includes Poppler and fonts. Provision a persistent OCR language cache when needed. Monitor worker health and mail rows with attempts >= 5. Each Vercel instance uses at most three PostgreSQL pool connections; each worker uses at most fifteen, so budget provider connections accordingly.

The worker polls email every 15 seconds. Vercel also attempts one email after a mutating API request using waitUntil. A protected daily /api/cron/mail job is a fallback compatible with Hobby scheduling; daily cron alone is insufficient for prompt alerts or draining multiple recipients. Keep the worker running. Outbox locks prevent simultaneous claims, but SMTP delivery can duplicate after a delivery/commit failure.

## 7. Verify deployment

1. Open https://YOUR_DOMAIN/api/v1/health and expect {"status":"ok"}. Check Function Logs and environment variables if it fails.
2. Sign in with your fresh bootstrap account or retained migrated account. Privileged production roles must enroll MFA.
3. Create archdiocese → forane → parish and invite parish users. See [archdiocese onboarding](ARCHDIOCESE_GUIDE.md) and [forane guide](FORANE_GUIDE.md).
4. Test invitations, password resets, change-warning emails, uploads/downloads and OCR completion if enabled. Confirm the external worker and API use the same services.
5. Confirm parish isolation, forane boundaries, change reasons and warning alerts. Test mobile navigation and direct URL refresh.
6. Configure backups, monitoring and deployment-wide edge rate limits/WAF. The Express login limiter is per instance. Review [release status](RELEASE_STATUS.md) before entering real church records.

Vercel limits request/response payloads to 4.5 MB (streamed responses have different rules). This deployment limits uploads/photos to **4 MiB**, with room for normal multipart metadata; the interface shows 4 MB. Larger requests can be rejected by Vercel before reaching the API. Large buffered downloads/exports are also subject to the platform limit. Use a container deployment for larger existing files until direct/streaming downloads are implemented. Docker retains 25 MB archive and 5 MB photo uploads. OCR/PDF processing runs externally.

Official references: [Express](https://vercel.com/docs/frameworks/backend/express), [function limits](https://vercel.com/docs/functions/limitations), [pool lifecycle and background tasks](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

These files do not create a live Vercel project or cloud services; complete the account setup above to publish.

## Build dependencies under NODE_ENV=production

The Vercel install command must be `npm ci --include=dev`. TypeScript, Vite and type definitions are required during the build even though the deployed runtime is production. The repository config sets this explicitly. If the dashboard overrides Install Command, update the override too. Redeploy the latest commit with the existing build cache disabled after an earlier install omitted development dependencies. Keep NODE_ENV=production.
