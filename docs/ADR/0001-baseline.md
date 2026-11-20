# ADR 0001 — Baseline implementation
Status: accepted for reversible engineering choices; product-policy decisions pending church approval.

Use TypeScript, React/Vite, Express, parameterised pg queries, PostgreSQL, Redis/BullMQ and S3-compatible storage. The recommended Next/Nest/ORM stack is not mandatory in §16; a small modular API and static client avoid duplicate server runtimes, reduce browser payload and expose database security explicitly. All schema changes use SQL migrations. This tradeoff requires explicit request validation and service boundaries instead of framework decorators.

Use Docker-managed PostgreSQL on port 55432 to avoid changing or requiring credentials for the independently installed PostgreSQL. Production requires its own database role and secrets. Tests exercise real PostgreSQL with a non-superuser application role.

English UI, Unicode data, denomination-neutral register schemas, manual entry always available, no cloud AI transmission, maker/checker enabled by default. Partial historical dates remain text plus precision; never invent dates. Certificate wording is disabled for official issuance until an administrator supplies and approves a template. P2 modules are disabled rather than presenting fictitious functionality.

Unresolved: pilot denomination, mandatory fields/authority, Malayalam launch priority, OCR samples/volume, paid subscriptions, hosting, retention, approved certificate wording, email provider, supervisory scopes. §2 calls subscriptions P0 while §20 calls billing P1: implement tenant lifecycle and entitlements, defer payment collection. No legal/canonical compliance is asserted.
