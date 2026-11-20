# Privacy and security operations
All development fixtures are synthetic. Real personal records must never enter source control or public screenshots. Keep .env, data, mail outbox, test traces and backups private. The outbox contains short-lived account links and needs restricted filesystem access and expiry cleanup.

Use TLS, secure cookies, private databases/storage, least-privilege credentials, disk/object encryption and off-site encrypted backups. APP_ORIGIN is exact; do not add wildcard CORS. Set a unique 32-byte MFA key, keep it with secret backups and plan controlled rotation. Use a network-restricted ClamAV service for production originals; uploads fail closed without one. Patch dependencies and review npm audit before releases.

Do not assert Indian privacy-law or canon-law compliance from code alone. Obtain current independent advice, confirm approved diocesan forms and wording, retention, guardian processing, legal hold, controller/processor agreements and incident notification procedures. No retention/deletion workflow is implemented; do not promise it. No external AI processing is permitted by this baseline.

Known gaps and launch gates are in RELEASE_STATUS.md. Conduct penetration testing of session handling, cross-tenant requests, upload processing, permission escalation, password recovery, CSV/PDF output, storage and admin paths. Store logs without raw document content, credentials or recovery tokens. Export request IDs to monitored logs and establish incident ownership.
