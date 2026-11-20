# Database ERD
```mermaid
erDiagram
 archdioceses ||--o{ foranes : contains
 foranes ||--o{ tenants : groups
 foranes ||--o{ users : office_accounts
 foranes ||--o{ forane_activities : coordinates
 forane_activities ||--o{ forane_activity_parishes : requests_reports
 tenants ||--o{ forane_activity_parishes : responds
 foranes ||--o{ forane_events : audits
 archdioceses ||--o{ tenants : oversees
 archdioceses ||--o{ users : central_administrators
 tenants ||--o{ change_alerts : warns
 change_alerts ||--o{ alert_reads : acknowledged
 change_alerts ||--o{ mail_outbox : delivers
 tenants ||--o{ users : owns
 users ||--o{ sessions : authenticates
 tenants ||--o{ organisations : contains
 organisations ||--o{ organisations : parent
 tenants ||--o{ households : owns
 tenants ||--o{ parish_units : defines
 parish_units |o--o{ households : groups
 households ||--o{ persons : current_members
 persons ||--o| person_photos : optional_private_photo
 tenants ||--o{ register_schemas : configures
 register_schemas ||--o{ entries : validates
 persons ||--o{ entries : subject
 entries ||--o{ entry_versions : preserves
 entries ||--o{ annotations : annotates
 tenants ||--o{ volumes : preserves
 volumes ||--o{ assets : contains
 assets ||--o{ ocr_jobs : processes
 assets ||--o{ entries : source
 tenants ||--o{ certificate_templates : approves
 entries ||--o{ certificate_issues : certifies
 tenants ||--o{ audit_events : logs
 users ||--o{ account_tokens : invites_resets
```
All record-to-record tenant foreign keys include tenant_id. Actor foreign keys reference globally unique users, allowing central administrators to remain accountable in parish audit/history. RLS is forced on tenant tables. sessions and account tokens are accessed only by identity services. Version and audit rows cannot be updated or deleted by the application role.
