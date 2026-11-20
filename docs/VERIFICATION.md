# Local verification — 20 November 2026

All fixtures and uploaded test documents were synthetic. The independently installed PostgreSQL and other Docker projects were not changed. Dedicated PostgreSQL/Redis services run under the `vestry` Compose project.

| Check | Observed result |
| --- | --- |
| TypeScript and production Vite build | Passed; production React runtime, separate vendor chunk, Brotli/gzip assets |
| Unit + real PostgreSQL/API tests | 12 tests passed; includes forane scope/RLS, private parish reporting, review/return/completion, visitation checklists, concurrent edits, head-church protection, reassignment, account reset/archival and production forane MFA; includes archdiocese bounds, super/parish provisioning, forged scope rejection, central actor integrity, transactional warnings, dependency-protected deletion, immutable alerts, account revocation and production central MFA; existing origin, register, archive and parish/photo regressions pass |
| Browser acceptance | 10 scenarios passed, including forane provisioning/login/dashboard, parish-private catechesis reports and forane review/completion, and mobile visitation observations/follow-up. Existing regressions pass: parish units/households/member photos/register years; desktop navigation/search/drafts; mobile layout; original upload/review/draft import; central directory/account navigation; super administrator parish provisioning followed by an isolated parish login and mobile alerts; register form builder/version preservation |
| Automated accessibility | No detected WCAG-tagged axe violations on tested desktop/mobile dashboard, household directory, member photo form, mobile year-filtered register view, register form builder new mobile warning alerts, forane dashboards and mobile visitation forms. Pagination/history contrast and keyboard access to forane parish tables corrected. |
| PDF/worker integration | Two synthetic pages rasterised and recognised locally; text, normalised word regions/confidence and original checksum verified; zero official entries created |
| Database recovery | Custom-format dump restored to a separate temporary database; original, derived-page, OCR result, audit, version, relationship, membership and outbox row counts matched |
| Development privacy | API health and app returned 200; unauthenticated `.env` and `.qa` file requests returned 403 |
| Docker | Production image built successfully with unprivileged runtime, PDF fonts and Poppler; Compose hardening configured |
| Dependency audit | npm reported zero known vulnerabilities at installation/build time; this is not a security certification |
| Lighthouse | Accessibility 100, best practices 100. Performance is **unverified**: local Chrome and Edge navigation traces failed with `NO_NAVSTART`; no performance score is asserted |

Security regressions additionally cover departed staff reset/invitation token invalidation, prevention of inactive-account reactivation, per-user permission denials, session revocation, minimal person data on register responses and omission of certificate snapshots from listing responses. Draft register-type changes and human overrides of OCR register type preserve their selected version and are tested.

Evidence lives in ignored `.qa/`, `test-results/` and `data/backups/` folders. The restore database is retained for inspection; the source database was not overwritten. Use `npm run build`, `npm test`, `npm run test:e2e`, `node tools/backup-drill.mjs` and the PDF fixture/check helpers to reproduce the appropriate checks. The browser runner owns and stops only a preview it started, and avoids Windows shell-dependent process-tree teardown.

This evidence does not establish full production readiness. See RELEASE_STATUS.md for remaining P0/P1/P2 work and external release gates. Production-host PageSpeed Insights, realistic load/failure tests, approved handwriting samples, SMTP/scanner/object-store integration qualification, off-site full-system recovery, independent security/privacy review and church acceptance remain required. Automated accessibility checks do not replace manual assistive-technology review.

Forane extension evidence: migrations 014-015 applied locally; both forane demonstration logins verified against their own dashboard. Docker image rebuilt with shared definitions and API import smoke-tested. Full browser suite passed all 10 scenarios with no detected axe violations in the tested new views. The existing AWS environment was not modified. See [FORANE_GUIDE.md](FORANE_GUIDE.md) for primary research, scope and operational steps.

## Vercel preparation ? 20 November 2026

Production build, 13 API/security tests (including serverless entry and protected cron), 10 browser scenarios, and portable migration completed locally. A PostgreSQL custom-format archive was fully restored into an isolated database and all 36 public tables counted; checksum and counts are in its private manifest. Staged source was checked against local secret values; no matches. Live Vercel infrastructure, SMTP/scanner connectivity and target database restore require account configuration described in VERCEL_DEPLOYMENT.md and have not been verified remotely.

## AWS-free testing mode

Normal and Vercel test builds passed, along with all 15 API/security tests. Ten targeted isolation/security tests also passed with TEST_DEPLOYMENT=true. Test mode keeps HTTPS, cookie, MFA-key and access-control requirements, rejects file persistence and OCR, and leaves outgoing messages queued without claiming delivery. A loading-message contrast issue surfaced during the browser accessibility check and its foreground was darkened.

All four targeted test-mode browser scenarios passed after the contrast correction: forane provisioning, parish reporting/review, mobile visitation and test-banner login at mobile/desktop widths. Live Neon/Vercel provisioning remains a user-account step.

## Live Vercel startup diagnosis

The public website returned HTTP 200 while /api/v1/health returned FUNCTION_INVOCATION_FAILED. The supplied function log confirmed an invalid/missing MFA_ENCRYPTION_KEY. The API now validates settings per invocation before loading the application, returns structured JSON setup errors without secret values, and distinguishes database/schema failures. The client reports non-JSON serverless failures and incorrect HTML routing explicitly. Non-secret build/runtime defaults target vestry-j794.vercel.app in AWS-free test mode. Secrets remain in project environment settings. Normal build and all 19 API/security tests passed locally.

The Vercel-specific build, seven targeted deployment/client/configuration checks and three login/navigation/parish-isolation browser scenarios also passed. The private import file was verified ignored by Git; staged source contains none of its secret values.

## Vercel production install correction

The build log reported missing node_modules/typescript/bin/tsc. Vercel installation now explicitly uses npm ci --include=dev so NODE_ENV=production cannot omit TypeScript, Vite and build-time type definitions. A completely separate workspace, without pre-existing node_modules or .env files, successfully completed npm ci --include=dev and npm run build with NODE_ENV=production and VERCEL=1. No application or database behavior changed.

## Vercel mapped origins ? 21 November 2026

Live health at vestry-xi.vercel.app returned 200; an empty login request with that Origin returned 403 before the change. Updated canonical origin and exact mapped alias handling, with current deployment/branch origins sourced from Vercel system variables. Normal build and all 23 API/security tests passed; tests verify shown domains reach credential validation and unrelated/lookalike origins remain forbidden. Private credentials/import files remain ignored.
