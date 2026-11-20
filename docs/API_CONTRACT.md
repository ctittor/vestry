# API contract v1
Prefix `/api/v1`; JSON requests except multipart originals. Errors: `{error, requestId}`. Cookie session; mutation requests require matching Origin and X-CSRF-Token. Tenant scope comes only from the authenticated session. Lists accept `q`, `page` and `limit` (maximum 100), return `{items,total,page,limit}`.

Identity: POST `/auth/login`, `/auth/logout`, `/auth/forgot`, `/auth/accept`; GET `/auth/me`, `/auth/sessions`; DELETE `/auth/sessions/:id`; POST `/auth/mfa/setup`, `/auth/mfa/enable`.

Core: GET `/dashboard`; GET/POST `/persons`, `/households`, `/organisations`, `/schemas`, `/volumes`; PATCH `/persons/:id`; GET `/entries`, POST `/entries`, GET/PATCH `/entries/:id`; POST `/entries/:id/transition`, `/entries/:id/amendments`, `/entries/:id/annotations`; GET `/entries/:id/history`.

Parish units: GET `/units` (`members.view`), POST `/units`, PATCH `/units/:id` (`tenant.manage`), body `{name}`. Tenant-scoped, case-insensitive unique names; GET includes household counts. Households accept `unit_id` instead of free-text unit names; GET filters `q`, `unit` (UUID or `unassigned`), `status`, `page`, `limit`, and includes `summary` counts independent of the status filter. POST creates a draft; PATCH `/households/:id` requires `revision`, resets draft/reviewer state. POST `/households/:id/transition` accepts `{status,revision,reason?}`; submission requires a unit and `members.update`, decisions require `registers.approve` and a different maker/submitter. Rejection requires a reason. A stale revision returns 409.

GET `/entries` additionally filters `kind`, `status`, `year` (four digits or `unknown`). Response includes `summary` for the register/search/year scope, independent of status and pagination; `years:[{year,count}]` covers the register/search scope across statuses. `event_year` is generated from exact/year-only event dates. Results sort by event year descending, unknown last, then date and stable creation/id order. `not_approved` is draft + submitted + rejected; approved/corrected/void remain distinct.

Member photos: POST `/persons/:id/photo` multipart `file`, DELETE the same path (`members.update`); GET (`members.view`) returns private WebP bytes with no-store caching. Upload max 5 MB, 16 million input pixels, still JPEG/PNG/WebP; output at most 512 × 512, metadata stripped, production malware policy enforced. `persons.photo_version > 0` indicates a photo; member JSON never embeds image bytes. GET `/persons?household_id=UUID` filters members before pagination.

Archive: GET/POST `/assets` (multipart `file`, `volume_id`, `page_label`); GET `/assets/:id/file`; GET/POST `/jobs`; PATCH `/jobs/:id/review`; POST `/jobs/:id/import`, `/jobs/:id/retry`.

Administration: GET/PATCH `/settings`; GET `/users`; POST `/invitations`; PATCH `/users/:id`; GET `/audit`, `/search`, `/reports`; GET `/export?purpose=…`.

Certificates: GET/POST `/templates`; GET/POST `/certificates`; GET `/certificates/:id/pdf`; POST `/certificates/:id/revoke`; GET public `/verify/:reference` returns validity only.

Central administration: GET/POST `/platform/tenants`; PATCH `/platform/tenants/:id`; GET `/archdiocese/overview`; GET/POST `/archdiocese/users`; PATCH `/archdiocese/users/:id`. Super administrators may select any parish; archdiocese administrators may select only a parish in their assigned archdiocese. Select explicitly with `X-Parish-Id`; central writes also require `X-Change-Reason` (5–2000 characters). Parish accounts cannot override their session parish. Record queries still run through forced RLS.

Warnings: GET `/alerts?page=1`; POST `/alerts/:id/read`; PATCH `/contacts/unit/:id` or `/contacts/household/:id` with `{email}`. DELETE `/units/:id`, `/households/:id`, `/persons/:id` requires parish administration and `{reason}` (5–2000 characters); linked history/dependents return 409 and roll back warnings. Parish lifecycle uses archive status. POST `/parish-admin/reset` with `{id}` queues account recovery for staff in the selected parish and revokes sessions. See ARCHDIOCESE_GUIDE.md for contact recipients and delivery semantics.

OpenAPI skeleton: `/api/v1/openapi.json`. Revision conflicts return 409; invalid requests 400; missing session 401; forbidden 403; scoped missing IDs 404; oversized files 413. Approval requires submitted state and independent reviewer; import idempotent by job ID.

## Forane extension

GET/POST `/foranes`; PATCH `/foranes/:id`; GET `/foranes/:id/dashboard`; PATCH `/foranes/:id/parishes/:parish` with `{previous_forane_id}`; POST `/foranes/:id/users`; PATCH `/foranes/:id/users/:user` with `{active,password?}`. Archdiocese/super administrators manage structure/accounts. Forane administrators access only their own office. Parish creation requires `forane_id` and validates the creator's scope.

GET/POST `/forane-activities`; GET/PATCH `/forane-activities/:id`; PATCH `/forane-activities/:id/report` for parish submissions; PATCH `/forane-activities/:id/responses/:parish` for oversight review/return. Writes use revision checks and validated categories, participants, dates, checklists and transitions. Office mutations require the existing change-reason header. Parish responses omit private office fields/history and other parishes' reports. See FORANE_GUIDE.md for workflow details.
