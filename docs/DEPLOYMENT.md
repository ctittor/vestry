# Deployment runbook
Use Linux, Docker Compose, a TLS reverse proxy and a restricted server account. Keep host time synchronised. Node 24/PostgreSQL 18 baseline. Pin images by digest for a real release; do not blindly deploy `latest` images. Review RELEASE_STATUS.md before treating this build as a release.

1. Install dependencies with `npm ci`; `npm run build`; run tests in an isolated test database.
2. Provision private `.env` with independent strong secrets. Set production DATABASE_URL to the restricted vestry_app role; MIGRATION_DATABASE_URL belongs only to the migration process and must not be injected into app/worker containers.
3. Start `docker compose up -d db redis`. Run migration from a controlled process with `npm run db:migrate`. Migrations are ordered and locked, and the runtime role cannot bypass RLS.
4. Set APP_ORIGIN to the exact HTTPS origin and COOKIE_SECURE=true. Configure disk encryption or S3-compatible storage, backup policy and malware scanner. Production uploads fail closed without scanner access. Redis stays private.
5. Bootstrap a single platform operator using `npx tsx tools/bootstrap.ts` with BOOTSTRAP_EMAIL/PASSWORD; remove those credentials immediately. Do not seed synthetic data into production.
6. Configure SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM before inviting staff. Delivery uses an encrypted transactional outbox, polling every 15 seconds with five bounded attempts and five-minute retry intervals. Monitor failed attempts. Development alone writes a private local outbox. Enroll privileged staff MFA; production refuses private record access until enrolled. Approve register schemas and certificate templates with the diocese.
7. Build/run `docker compose --profile app up -d --build`; proxy the API/app on port 4000 through TLS. Never expose port 55432/56379 publicly. Compose binds these to loopback.
8. Health check `/api/v1/health`; confirm app role is nonsuperuser and RLS enabled; smoke-test two separate tenants; test mail, file scanning and restore; obtain pilot acceptance.

Production serves the compiled SPA and API from one origin. Development Vite uses 5173 with a proxy to 4000. Poll health externally; API logs include request IDs, HTTP error status and error class without document data. Worker logs job IDs only. Add central log/metric shipping, alerts, dead-job reconciliation and dependency scanning before public rollout.

Environment variables: PORT, NODE_ENV, APP_ORIGIN, DATABASE_URL; migration-only MIGRATION_DATABASE_URL/DB_APP_PASSWORD; Docker DB_OWNER_PASSWORD; REDIS_URL; STORAGE_DRIVER=local|s3, STORAGE_PATH; S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY; COOKIE_SECURE; MFA_ENCRYPTION_KEY; OCR_PROVIDER (documented default manual; each job selects its adapter); optional OCR_CACHE_PATH (default data/ocr-cache); CLAMAV_HOST/PORT and REQUIRE_MALWARE_SCAN; SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM; BOOTSTRAP_EMAIL/PASSWORD (single-use); SEED_PASSWORD (development only). Never ship the entire developer .env to containers. Compose explicitly injects runtime variables and excludes migration owner/bootstrap/seed credentials. Configure an external S3 endpoint if selected; no object-storage vendor is silently deployed.

App/worker run as an unprivileged Node user with a read-only root filesystem, bounded temporary storage/memory/PIDs, dropped capabilities and no-new-privileges. Durable writes go only to the data volume. Hash-named static assets are precompressed and cached immutably; API responses remain no-store. Compose app has a database-backed HTTP health check. Review resource limits against real archive sizes before rollout.

For S3, provision the private bucket/versioning/encryption through the storage operator first. Runtime needs only the required GetObject/PutObject operations on its object namespace, not CreateBucket permission. Supply static server-side credentials or leave them blank to use the SDK's IAM credential provider chain. Test the chosen provider's conditional-write support before launch.

## Archdiocese release

Apply migrations 012 and 013 before this build. Bootstrap creates the super administrator; use Parish directory to create parish logins and archdiocese users. Follow [ARCHDIOCESE_GUIDE.md](ARCHDIOCESE_GUIDE.md). Central roles require MFA in production. Configure unit/household/member alert contacts and verify SMTP delivery before onboarding real parishes. Alerts are transactional and immutable; mail delivery is asynchronous, with failed counts in Alerts. No public deployment was made by the local setup.

## Hosting decision

Current requested operation is local development. Keep the existing EC2/S3 environment unchanged. For a future EC2 deployment, use the Compose runbook and configure `STORAGE_DRIVER=s3`, the private bucket, region and an appropriate IAM role. Keep PostgreSQL and Redis private, and back up the database independently from S3 originals.

If Replit or another host is selected later, retain the same database migrations and API authorization. The deployment needs a long-running Node API listening on `PORT`, persistent PostgreSQL, Redis for OCR jobs, S3 or other persistent original storage, SMTP, and an HTTPS `APP_ORIGIN`. Use `npm run build` before `npm start`. A host-specific configuration and validation should be prepared after the target is selected; this revision does not deploy to or verify Replit.

## Forane upgrade

Apply migrations 014 and 015 before this revision. The runtime image includes the shared forane definitions used by the API; retain `shared/` in any non-Docker server package. Create foranes and confirm parish assignments before enabling forane logins. Existing unmapped parishes remain accessible to archdiocese/parish accounts until confirmed. Forane administrators require MFA in production. See FORANE_GUIDE.md. Hosting remains local as requested; existing AWS resources were not changed.
