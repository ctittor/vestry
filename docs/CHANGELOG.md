# Changelog
## Parish organisation and year browsing — 20 November 2026

Added event-year grouping/filtering across registers, complete status summaries independent of pagination, First Holy Communion and standalone Burial schemas, admin-managed parish units with migrated household assignments, household review/revision workflow, and optional private member photos with upload/drop, metadata stripping and bounded WebP output. Existing combined death/burial records retain their original forms. Added API isolation/workflow/photo regression coverage and browser/mobile/accessibility coverage. Applied migration 011; see church administrator guide for Indian parish research and policy boundaries.

## 0.1.0 — 20 November 2026
Initial working Roman Catholic pilot core: custom responsive Vestry workspace; session authentication, TOTP setup, tenant administration, roles, PostgreSQL RLS/migrations, synthetic two-parish fixtures, member/household directory, versioned registers, approval, correction and annotations, original archive, manual/local printed-text OCR adapter, human review/import, certificates/PDFs, reports/export and append-only audit/version history. Added Docker tooling, API contract, security/integration/browser tests and operational guides. Production acceptance remains pending; see RELEASE_STATUS.md.

Added granular permission overrides, mandatory production privileged MFA, encrypted SMTP delivery outbox, member relationships/movement/merge reversal, event-time identity snapshots, immutable raw OCR results with word overlays, PDF page processing with fonts, queue reconciliation, Brotli/gzip assets, container hardening, CI and successful database/PDF preservation drills.
