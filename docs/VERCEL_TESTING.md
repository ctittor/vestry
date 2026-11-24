# Vercel testing without domain-specific setup

The app uses Vercel + Neon PostgreSQL for synthetic testing. TEST_DEPLOYMENT=true enables the limited test profile. Original register uploads/downloads, OCR and outgoing email are unavailable; normal records, in-app alerts and parish/forane isolation remain active.

## Domain changes

APP_ORIGIN and domain allowlists are no longer required for login or dashboard requests. Every mutating request checks the browser Origin against the actual destination scheme/Host, and authenticated changes still require the session CSRF token. Unrelated origins and forged X-Forwarded-Host values are rejected. Vercel supplies the destination host and HTTPS transport. There are no hardcoded project domains or wildcard vercel.app permissions.

For another server behind a TLS reverse proxy, preserve the incoming Host and configure TRUST_PROXY with the proxy's IP/CIDR (or loopback for a local proxy). Forward X-Forwarded-Proto only from that trusted proxy. This is infrastructure configuration, independent of the domain name.

Vercel background email links use VERCEL_PROJECT_PRODUCTION_URL automatically. For production SMTP on a self-hosted server/worker without platform metadata, PUBLIC_APP_URL supplies the public email-link base. APP_ORIGIN remains a legacy fallback for those links only. Incoming Host headers are never used to generate password-reset email URLs.

## Database setup

1. Import ctittor/vestry in Vercel with framework Vite, Node 24.x and the repository root.
2. Create an isolated PostgreSQL 18 database in Neon. Copy its direct owner connection URL.
3. Configure local MIGRATION_DATABASE_URL with that owner URI, DB_APP_PASSWORD with a random URL-safe password (20–128 characters), and DATABASE_URL with the same database using vestry_app and that password.
4. From your computer run npm run db:migrate. This creates the restricted role and schema; do not use a provider owner role in the API.
5. For a fresh synthetic database, set a private SEED_PASSWORD (14+ characters), keep local NODE_ENV=development and run npm run db:seed. Existing accounts keep their original passwords. Never seed real production records.

## Vercel settings

| Variable | Value |
| --- | --- |
| NODE_ENV | production |
| TEST_DEPLOYMENT | true |
| STORAGE_DRIVER | disabled |
| DATABASE_URL | Hosted TLS PostgreSQL URL using vestry_app, preferably the supported pooled endpoint |
| COOKIE_SECURE | true |
| MFA_ENCRYPTION_KEY | Existing private 64-hex-character key, preserved when moving records |
| CRON_SECRET | Independent random secret, at least 32 characters |

Do not add owner/migration/bootstrap/seed credentials to Vercel. No AWS, Redis, SMTP or scanner is required for this limited profile. Use npm ci --include=dev for the install command, npm run build for the build, and dist for output. Deploy the latest main commit. Build logs identify the source revision with [Vestry build v2]. Retrying an older deployment rebuilds that older source; create a new deployment from main if needed.

Small re-encoded church, building and account photos are stored privately in PostgreSQL and work in this profile. See DIRECTORY_GUIDE.md. Apply migration 016 before deploying the directory update.

## Navigation and MFA

Synthetic test deployments allow privileged demo accounts to navigate without mandatory MFA enrollment. An account that already enabled MFA must still supply its authenticator code at login. Full production (TEST_DEPLOYMENT=false) retains mandatory MFA for privileged roles. It displays an explicit setup banner and locked navigation until enrollment instead of silently showing My account for every tab.

## Verify

Open /api/v1/health, then sign in with a seeded account. The test emails include operator@vestry.example, archdiocese@vestry.example, forane@vestry.example, admin@stmary.example and admin@stjoseph.example, using the private seed password. Click every permitted sidebar module; the breadcrumb and content must change. Production/test policies are covered separately in API and browser regression tests.

The runtime returns useful JSON setup errors for missing keys, unsafe database roles, missing migrations and unavailable databases. Passwords and connection URLs are never included in public diagnostics.

Before using real church records, use a separate production database, set TEST_DEPLOYMENT=false, and configure persistent object storage, scanning, SMTP and the worker as described in VERCEL_DEPLOYMENT.md.
