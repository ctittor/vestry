# AWS-free Vercel test deployment

Use Vercel for the website/API and Neon for PostgreSQL. No AWS, S3, Redis, SMTP or external worker is needed for this limited test mode. Use synthetic data only and keep a separate database from any real deployment.

Works: logins, role/parish/forane isolation, archdiocese/forane/parish management, units, households, members without photos, registers, reports, audit history and in-app change alerts.

Unavailable: uploads, original-file downloads, profile-photo uploads, OCR, invitation/reset email delivery and email change warnings. File operations fail explicitly rather than saving temporary files. Encrypted email requests remain queued and are not marked delivered. Use seeded accounts to test logins. MFA, secure cookies, change reasons, permissions and row-level security remain enabled. The interface shows a test banner.

## 1. Import the repository in Vercel

Add New → Project → import ctittor/vestry. Choose the repository root, Vite and Node.js 24.x. The checked-in configuration supplies npm ci, npm run build and output dist. Choose a project name and record its production domain. If the first build is already deployed without variables, the API will remain unavailable until you add variables and redeploy.

## 2. Create the test PostgreSQL database

Create a Neon project with PostgreSQL 18 and a fresh empty database such as vestry_test, either through Vercel Marketplace or the Neon console. In Connect select the owner role, turn connection pooling OFF and copy the direct owner PostgreSQL URI. A blank test database is simpler than restoring a development dump and does not create references to missing originals.

On your computer open F:\church-records\.env. Keep a private backup if changing an existing local setup. Set:

```dotenv
NODE_ENV=development
MIGRATION_DATABASE_URL=YOUR_DIRECT_NEON_OWNER_URI
DB_APP_PASSWORD=YOUR_NEW_RANDOM_URL_SAFE_RUNTIME_PASSWORD
DATABASE_URL=YOUR_DIRECT_NEON_URI_USING_vestry_app_AND_THE_RUNTIME_PASSWORD
SEED_PASSWORD=YOUR_PRIVATE_TEST_PASSWORD_AT_LEAST_14_CHARACTERS
```

Generate independent passwords/keys with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Initially vestry_app does not exist; that is expected. The migration connects using the owner URI and creates the restricted role. Construct DATABASE_URL using the same host/database/SSL parameters as the owner URI, with username vestry_app and password matching DB_APP_PASSWORD. Do not create vestry_app in the provider console with elevated provider-role membership. An existing vestry_app password is not changed by migrations.

Run from PowerShell:

```powershell
Set-Location F:\church-records
npm ci
npm run db:migrate
npm run db:seed
```

Seed only this isolated test database. Keep NODE_ENV=development in this local shell for seeding; Vercel itself must use NODE_ENV=production. If you already restored the dump, do not restore again: apply migrations and use the retained account passwords. Seeding does not reset existing passwords.

## 3. Add Vercel environment variables

In the Vercel project → Settings → Environment Variables, add these for the Production deployment:

| Name | Value |
| --- | --- |
| NODE_ENV | production |
| TEST_DEPLOYMENT | true |
| STORAGE_DRIVER | disabled |
| DATABASE_URL | Neon TLS connection URI for restricted vestry_app, not the owner |
| APP_ORIGIN | Exact production HTTPS origin, e.g. https://YOUR-PROJECT.vercel.app, without trailing slash |
| COOKIE_SECURE | true |
| MFA_ENCRYPTION_KEY | Your current private 64-hex-character key from .env |
| CRON_SECRET | Another independent random secret, at least 32 characters |

For DATABASE_URL use the provider's pooled endpoint for vestry_app if available and supported. Confirm any URL added automatically by the Neon integration is replaced with the restricted runtime role, not the owner. Never add owner/migration/bootstrap/seed credentials or DB_APP_PASSWORD as separate Vercel variables. The runtime password is already inside DATABASE_URL. Do not put secrets in VITE_ variables.

You do not need S3 credentials, REDIS_URL, SMTP settings or CLAMAV settings in this mode. Do not set NODE_ENV=development in Vercel. The test flag explicitly disables file/OCR/email services while keeping normal production authentication safeguards.

## 4. Redeploy and sign in

Deployments → latest deployment → Redeploy so the runtime and compiled banner use the new variables. Open /api/v1/health and expect {"status":"ok"}.

Use these seeded emails with the private SEED_PASSWORD selected before the first seed:

- Super administrator: operator@vestry.example
- Archdiocese: archdiocese@vestry.example
- Forane: forane@vestry.example
- Parish: admin@stmary.example
- Second isolated parish: admin@stjoseph.example

Production privileged roles still require MFA enrollment. Set it up through the account/security interface when prompted. Keep this test database separate; do not use real parish/member data. Test accounts have password login and do not need invitation email to be delivered.

## 5. Troubleshooting

- Missing SMTP/S3 startup error: confirm TEST_DEPLOYMENT=true is set for the deployment's environment and redeploy the current main branch.
- Database/authentication error: ensure DATABASE_URL uses vestry_app with the password created by db:migrate, the correct test database and TLS options.
- Origin error: APP_ORIGIN must exactly match the address in the browser. Use the stable production domain; preview domains need their own settings and isolated services.
- Login password fails after re-seeding: seed does not change an existing account password. Use its original password; email resets are unavailable in this mode.
- Upload/OCR/email does not work: these services are deliberately unavailable in this test mode; the banner lists the limitation.

For a complete production installation later, use a fresh production database and follow VERCEL_DEPLOYMENT.md with persistent object storage, scanner, SMTP and a worker, then remove TEST_DEPLOYMENT. Do not enable delivery of an old test database's queued messages to real recipients.

References: https://vercel.com/docs/marketplace-storage and https://neon.com/docs/connect/connect-from-any-app.
