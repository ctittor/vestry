# Architecture and delivery plan

Vestry is a local repository application, deployed through Docker Compose. It is not a public static website. Read REQUIREMENTS.md in full; it remains authoritative.

## Modules
React/Vite browser → versioned Express API → PostgreSQL. API modules: identity, platform tenants, organisations, people/households, versioned registers, archive, digitisation, certificates, reports and audit. BullMQ/Redis feeds a separately runnable local OCR worker. S3-compatible storage preserves immutable originals; development can use a private local disk adapter. No external OCR transmission by default.

## Milestones
0. ADR, ERD, API contract, assumptions and threat model (before implementation).
1. Authentication, scoped transactions, tenant administration, roles, audit; prove isolation.
2. People, households, registers, approval, amendments and search; test integrity.
3. Archival originals, jobs, manual/local OCR review; test file access and human approval.
4. Approved certificate templates, PDF issuance, reports and export.
5. Optional P2 modules remain disabled until separately implemented.
6. Automated tests, production configuration, restore drill, operational documentation. Independent security/privacy review and church acceptance are release gates, not claims an automated build can make.

## Threat model
Assets: personal data, official records, immutable scans, credentials and audit history. Boundaries: browser/API, tenant/database, upload/storage, worker/provider, operator/tenant. Defences: server-derived session context; deny-by-default permission checks; transaction-local PostgreSQL RLS; composite tenant foreign keys; input schemas; immutable approved entries; append-only audit; authenticated original downloads; MIME signatures; optional ClamAV scan with production fail-closed; no provider credentials in the client; secure cookies/CSRF origin checks; CSP and bounded uploads.

## Interface direction
An archival editorial workspace: deep pine navigation, ivory paper workspace, vermilion actions, serif display typography, crisp tables, a custom line-art church, and restrained motion. Desktop has persistent navigation; small screens use a labelled menu drawer. Main workflows: overview → register → draft → submit → independent approval; archive → original → review → linked draft. No remote fonts or image dependencies.
