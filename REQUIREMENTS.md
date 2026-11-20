# Church Records Management & Digitisation Platform

## Product Requirements Specification (PRS) and Software Requirements Specification (SRS)

**Document status:** Baseline specification for AI-assisted software
development\
**Version:** 1.0\
**Prepared:** 20 November 2026\
**Product type:** Multi-tenant SaaS web application\
**Initial deployment context:** India, with support for international
churches\
**Primary users:** Church administrators, parish priests/pastors,
secretaries, record clerks, archivists and diocesan administrators

------------------------------------------------------------------------

## 0. Instructions for AI coding agents

This document is the product and engineering source of truth for the
initial implementation.

1.  Read this document completely before proposing architecture or
    writing code.
2.  Do not implement the entire platform in one uncontrolled
    code-generation pass. Work in the phases and vertical slices defined
    in `26. Implementation roadmap`.
3.  Before coding, produce an architecture decision record (ADR),
    database ERD, module map, API contract and milestone plan. Identify
    contradictions or missing decisions explicitly.
4.  Use migrations for every database schema change. Never rely on
    manual production database edits.
5.  Enforce tenant isolation on the server and database access paths. A
    tenant identifier supplied by a browser is never trusted by itself.
6.  Treat OCR/AI output as an unverified suggestion. It must never
    automatically become an approved official register entry.
7.  Preserve original uploaded files and page images. Never overwrite
    archival source images with enhanced, cropped or compressed
    derivatives.
8.  Implement audit logging for sensitive reads and all consequential
    writes, not only login events.
9.  Use synthetic sample data in development. Never commit real
    parishioner records, sacramental documents, secrets, API keys or
    production uploads.
10. Do not invent church rules, canonical requirements, certificate
    wording, retention periods or legal conclusions. Make them
    configurable and obtain approval from the relevant church authority.
11. If an external AI/OCR service is unavailable, the core system must
    still support manual entry, review and archival storage.
12. Keep provider-specific OCR, LLM, storage, email and messaging
    integrations behind replaceable adapters.
13. Create automated tests for tenant isolation, role permissions,
    record approval, audit history, document access and OCR review.
14. Document every implemented feature, environment variable, migration,
    background worker and operational procedure.
15. When requirements are ambiguous, record an assumption and ask for a
    decision rather than silently making an irreversible product
    decision.

### Requirement priority

-   **P0 -- Must:** Required for a safe and usable first production
    release.
-   **P1 -- Should:** Important capability for the first major release.
-   **P2 -- Could:** Optional or later enhancement.
-   **Future:** Explicitly outside the initial release unless separately
    approved.

------------------------------------------------------------------------

# 1. Product vision

Create one secure, reliable, multi-tenant web application that helps
churches preserve, digitise, search, manage and retrieve their
historical and current records.

The platform must replace fragile paper-only workflows while retaining
the evidentiary value of the original registers. It must support both:

-   **Born-digital records:** Records created directly in the
    application.
-   **Digitised historical records:** Records transcribed from
    photographs, scans or PDFs of existing registers.

Every structured record should be traceable to its source, such as a
register, volume, page, row, image or uploaded document.

The application should be usable by a small local church with a few
staff members and scalable to a diocese managing many parishes.

## 1.1 Product objectives

1.  Prevent loss of church records caused by water, humidity, fire,
    termites, ageing paper, mishandling or physical deterioration.
2.  Make records searchable without repeatedly browsing physical books.
3.  Reduce manual data entry through OCR, handwriting recognition and
    AI-assisted extraction.
4.  Preserve original source images and their relationship to
    transcribed data.
5.  Maintain accurate member, household, sacramental, administrative and
    historical records.
6.  Support certificates, extracts, reports, corrections and official
    annotations.
7.  Provide secure access to authorised church staff and supervisory
    authorities.
8.  Support multiple churches through one application without
    cross-tenant data exposure.
9.  Support configurable church structures, denominations, languages,
    fields and workflows.
10. Make future migration, export and long-term archival preservation
    possible.

## 1.2 Non-goals for the initial release

-   Replacing civil government birth, death or marriage registration
    systems.
-   Automatically declaring an OCR result to be an official church
    record.
-   Publicly exposing all sacramental or personal records.
-   Automatically determining canonical validity or resolving complex
    pastoral/legal cases.
-   Replacing physical registers where the relevant church authority or
    law still requires them.
-   Building a full accounting ERP, payroll system or complete church
    website builder in the MVP.

The system must clearly distinguish a **church record of birth
information** from a **government-issued birth certificate**. Likewise,
a church marriage entry is not automatically a civil marriage
certificate.

------------------------------------------------------------------------

# 2. Product scope and modules

The application is modular. Each tenant can enable the modules included
in its subscription and permitted by its church configuration.

  -----------------------------------------------------------------------
  Module                  Scope                   Priority
  ----------------------- ----------------------- -----------------------
  SaaS super              Tenants, subscriptions, P0
  administration          plans, platform         
                          settings                

  Church administration   Church profile, staff,  P0
                          settings, register      
                          configuration           

  Organisation hierarchy  Diocese, archdiocese,   P0
                          parish, mission,        
                          chapel, units           

  User and access         Invitations, roles,     P0
  management              permissions, account    
                          lifecycle               

  Member and family       Person profiles,        P0
  registry                households,             
                          relationships           

  Sacramental registers   Baptism, confirmation,  P0
                          marriage and other      
                          configured rites        

  Birth/death registers   Church-maintained birth P0
                          and death information   

  Digital archive         Books, volumes, pages,  P0
                          scans and preservation  
                          metadata                

  OCR/AI digitisation     Image/PDF processing,   P0
                          extraction and review   

  Search                  Global and              P0
                          register-specific       
                          search                  

  Audit and history       Activity logs, version  P0
                          history and approvals   

  Certificate generation  Configurable official   P1
                          extracts and            
                          certificates            

  Transfers and           Transfer letters,       P1
  permissions             membership movement and 
                          clearances              

  Units/wards/families    Local church structure  P1
                          and household mapping   

  Events and attendance   Services, programmes    P1
                          and attendance          

  Finance and             Offerings, donations,   P2
  contributions           receipts and expense    
                          tracking                

  Communication           Email, SMS and approved P2
                          messaging integrations  

  Pastoral care           Restricted pastoral     P2
                          notes and follow-up     

  Cemetery/burial         Burial location and     P2
                          cemetery records        

  Property/assets         Land, building and      P2
                          asset register          

  Member self-service     Controlled profile      Future
                          requests and            
                          certificate requests    

  Public historical       Explicitly approved     Future
  archive                 public archival         
                          collections             
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 3. Tenancy and organisation hierarchy

## 3.1 Multi-tenant model

The platform operator runs one application. Each subscribed church is a
separate tenant.

Every tenant must have: - Unique tenant ID and human-readable tenant
code. - Church name, denomination/tradition, jurisdiction and contact
details. - Logo, seal, address, phone, email and website. - Configured
timezone, locale, date format and preferred language. - Subscription
plan, storage quota, user quota and module entitlements. -
Tenant-specific numbering formats and certificate templates. -
Tenant-specific staff, roles, permissions and workflow configuration. -
Tenant-specific data retention and export settings, subject to
applicable law. - Tenant-specific document storage namespace and access
policies.

**Mandatory isolation rule:** Users from Tenant A must never read,
search, export, modify or infer records belonging to Tenant B unless a
specifically authorised cross-tenant supervisory relationship has been
established.

Use tenant-aware database queries, service-layer checks and
database-level safeguards where practical. Do not depend only on
frontend filtering.

## 3.2 Hierarchy

Support a configurable organisation tree. A possible structure is:

`Denomination / Church Body → Archdiocese → Diocese → Parish / Church → Mission / Chapel → Unit / Ward / Small Group → Household`

Not every denomination uses all these levels. The hierarchy must be
configurable.

Requirements: - A church can exist independently without a parent
diocese. - A diocese can supervise multiple parishes. - An archdiocese
can supervise multiple dioceses. - A parish can have units, wards,
zones, families or other local groupings. - A person may have a primary
parish and historical membership in other churches. - A supervisory user
can access only the churches explicitly assigned to that user. -
Cross-parish records must retain their originating church and source
reference. - A transfer must not silently move or rewrite historical
sacramental entries.

## 3.3 Organisation directory

Each organisation node should store: - Name and code. - Type and parent
node. - Address and contact details. - Active/inactive status. -
Established date, where known. - Office-bearers and authorised
signatories. - Logo/seal and document settings. - Notes and source
references.

------------------------------------------------------------------------

# 4. User accounts, roles and permissions

## 4.1 Account lifecycle

Support: - Super-admin creation through a secure bootstrap process. -
Tenant creation by super admin. - Church admin invitation or creation of
staff accounts. - Email verification and secure password setup. -
Password reset with expiring, single-use tokens. - Optional/mandatory
MFA policy for privileged roles. - Account activation, suspension,
deactivation and reactivation. - Session listing and remote session
revocation. - Login throttling and suspicious-login detection. -
Invitation expiry and resend. - Staff departure and reassignment of
pending work.

Do not allow public self-registration to create a tenant administrator
without an approved onboarding process.

## 4.2 Default roles

Roles are starting templates. Permission assignment must be
configurable.

### Platform roles

-   **Super Admin:** Manages the SaaS platform, tenants, plans, platform
    configuration and support access.
-   **Platform Support:** Limited operational support; no default access
    to private church records.
-   **Billing Operator:** Manages subscription and payment
    administration without access to sacramental content.

### Tenant roles

-   **Church Admin:** Full administration of one tenant, subject to
    platform policies.
-   **Parish Priest / Pastor / Authorised Minister:** Reviews and
    approves designated official entries, annotations and certificates.
-   **Secretary:** Manages members, register workflows, correspondence
    and reports.
-   **Record Clerk:** Enters and edits permitted records, uploads source
    documents and processes OCR drafts.
-   **Archivist:** Manages books, volumes, scans, preservation metadata
    and archival descriptions.
-   **Finance Officer:** Accesses finance modules only.
-   **Unit/Zone Coordinator:** Accesses assigned unit members and
    permitted activities.
-   **Read-only Auditor:** Reads explicitly assigned records and audit
    reports without editing.
-   **Diocese/Archdiocese Administrator:** Supervisory access to
    assigned subordinate organisations, based on policy.
-   **Member:** Future limited self-service access.

## 4.3 Permission model

Implement granular permissions using RBAC, with optional resource-level
and organisation-scope restrictions.

Example permissions: - `tenant.manage` - `users.invite` -
`users.manage` - `organisation.view` - `organisation.manage` -
`members.view` - `members.create` - `members.update` - `members.merge` -
`members.export` - `registers.view` - `registers.create` -
`registers.update_draft` - `registers.submit` - `registers.approve` -
`registers.correct` - `registers.annote` - `registers.certify` -
`archive.upload` - `archive.view` - `archive.download_original` -
`ocr.process` - `ocr.review` - `ocr.approve_import` - `reports.view` -
`audit.view` - `finance.manage` - `pastoral_notes.view`

Rules: - Deny access by default. - A role may be scoped to one church, a
set of churches, a unit or a module. - Sensitive access must be
logged. - A staff member must not approve their own high-risk record if
the tenant enables maker-checker separation. - Super-admin status must
not silently bypass tenant privacy controls for ordinary support work. -
Emergency/break-glass access must require a reason, be time-limited and
generate an alert and audit event. - UI hiding is not authorisation.
Enforce permissions on every API operation and file download.

------------------------------------------------------------------------

# 5. Person, member and household registry

The member registry is the central identity layer. Other modules should
reference a person record rather than create unrelated duplicate people.

## 5.1 Person profile

Suggested fields: - Internal UUID. - Tenant ID. - Church membership
number. - First, middle and last names. - Name in local script and
alternate/transliterated names. - Preferred display name. - Gender, only
where required by the church's approved policy. - Date of birth and
whether exact, estimated or unknown. - Place of birth. - Contact
information. - Current and historical addresses. - Primary
church/parish. - Membership status. - Date joined and date left, where
applicable. - Preferred communication language. - Profile photograph,
optional. - Notes with restricted access. - Created/updated metadata and
record status.

Do not require government identity numbers unless there is a documented
lawful and operational need. Minimise personal data.

## 5.2 Identity and duplicate management

-   Search for possible duplicates using name variants, date of birth,
    parent names, spouse and church reference numbers.
-   Support manual review and controlled merge.
-   Never automatically merge people solely because names are similar.
-   Preserve old IDs and redirect references after a merge.
-   Maintain a merge audit record and allow authorised reversal where
    technically safe.
-   Support unknown, illegible and approximate values without inventing
    data.

## 5.3 Household/family registry

Support: - Household ID and household name. - Primary address and
contact details. - Household head/contact person, where applicable. -
Members and relationships. - Spouse, parent, child, guardian, sibling
and other configurable relationships. - Household movement between
units/wards. - Historical household membership. - Family tree
visualisation. - Household-level reports and labels.

Relationships must be date-aware where necessary. A person may belong to
different households over time.

## 5.4 Membership history

Record: - Joined, transferred in, transferred out, deceased, inactive or
other configured status. - Previous and next parish. - Effective date. -
Transfer document and authorising person. - Historical unit/ward
membership. - Reason and notes, with appropriate access restrictions.

------------------------------------------------------------------------

# 6. Register and record management

## 6.1 Configurable register framework

Do not hard-code every register as an unrelated table with a rigid set
of fields.

Build a shared register framework with: - Register type and schema
version. - Register book/volume. - Entry number and numbering policy. -
Event date and registration date. - Person or people references. -
Custom fields and validation rules. - Source archive reference. -
Approval state. - Amendment/annotation history. - Attachments. -
Configurable certificate mapping. - Retention and visibility policy.

Use strongly typed core fields for important data and validated custom
fields for denomination- or diocese-specific requirements. Avoid an
unrestricted EAV design for every field.

Register schemas must be versioned. Updating a form must not silently
change the meaning of old entries.

## 6.2 Baptism register

Suggested configurable fields: - Baptism register number. - Baptism
date. - Baptism church/place. - Baptised person's name. - Date of
birth. - Place of birth. - Father/parent details. - Mother/parent
details, including maiden name where applicable. -
Godparents/sponsors. - Witnesses. - Minister who administered baptism. -
Denomination/rite or other church-specific classification. - Birth or
civil registration reference, if supplied. - Book, volume, page and
row. - Remarks. - Source image/document. - Later canonical or
church-status annotations where applicable.

For Catholic configurations, the relevant canonical rules must be
checked against the current official texts and local diocesan
instructions. Canon 877 identifies key baptism-register information,
while Canon 535 addresses parish registers and preservation. These are
configurable domain rules, not assumptions to impose on every
denomination.

## 6.3 Birth information register

This module records information maintained by the church. It must not
imply that the church issued a government birth certificate.

Fields: - Child's name. - Date and place of birth. - Parent/guardian
details. - Hospital/place, if recorded. - Civil birth registration
number, optional. - Church notification/registration date. - Source
reference and remarks.

## 6.4 Confirmation register

Configurable fields: - Person. - Confirmation date and location. -
Minister/bishop. - Sponsor. - Register number and source location. -
Related baptism record. - Notes and annotations.

## 6.5 Marriage register

Support: - Marriage register number. - Date and place of celebration. -
Spouse A and spouse B, including names at the time of marriage. -
Date/place of birth where maintained. - Parent details where required. -
Witnesses. - Officiating minister. - Marriage preparation/reference
number. - Dispensation or other authorisation references, where
relevant. - Previous marriage/status declarations only where the church
requires them and access is restricted. - Related baptism records. -
Book, volume, page and row. - Remarks and source documents.

For Catholic configurations, Canon 1121 is a relevant reference for
marriage-register entries. Local conference/diocesan requirements must
also be configurable.

## 6.6 Death register

Suggested fields: - Deceased person's name. - Date and place of death. -
Date of burial/funeral. - Burial location/cemetery. - Age or date of
birth, if known. - Family/next-of-kin details. - Funeral service
details. - Minister. - Related member profile. - Civil death certificate
reference, optional. - Book, volume, page and row. - Source document and
remarks.

## 6.7 Other configurable registers

The framework should allow tenants to enable additional register types,
for example: - First Communion / Eucharist. - Reception into the
church. - Profession of faith. - Ordination and religious profession. -
Blessings and dedications. - Pastoral visits. - Transfers and letters of
introduction. - Membership admission and removal. - Funeral and burial
records. - Church office-bearers. - Vows and other denomination-specific
rites. - Special permissions, dispensations and declarations. -
Congregational decisions and official minutes.

The tenant administrator must be able to configure labels, fields,
validation, approval roles, visibility and certificate layouts without
requiring a code deployment for ordinary changes.

## 6.8 Official corrections and annotations

Official register entries must not be silently overwritten or deleted.

Implement: - Draft, submitted, approved, rejected and corrected
states. - Amendment request with reason and supporting document. -
Previous and new value snapshots. - Requested by, reviewed by and
approved by. - Timestamp and audit reference. - Optional two-person
approval. - Annotation entries that preserve the original event
record. - Configurable rules for whether a correction appears on a
certificate. - Void/superseded status rather than destructive deletion.

For canonical records, follow the authorised church authority's process.
The software must support the process; it must not decide canonical
validity.

------------------------------------------------------------------------

# 7. Digital archive and preservation

## 7.1 Archive hierarchy

Support a hierarchy such as:

`Collection → Series → Register Type → Book/Volume → Page → Entry`

Archive metadata: - Collection title and description. -
Church/organisation of origin. - Register type. - Book/volume
identifier. - Start and end dates. - Language and script. - Physical
condition. - Custodian. - Date digitised. - Digitisation operator. -
Scanner/camera information, optional. - Rights/access classification. -
Preservation notes. - Page count and missing-page markers.

## 7.2 Upload formats

P0: - PDF. - JPEG/JPG. - PNG.

P1: - TIFF. - WebP for derivatives only where suitable. - Multi-page
scanned documents. - ZIP-based controlled batch import, with safe
extraction rules.

Set configurable file-size, page-count and image-dimension limits.
Validate file signatures/MIME types; do not trust filename extensions.

## 7.3 Archival preservation requirements

-   Keep an immutable original upload.
-   Generate separate working derivatives for rotation, deskew, crop,
    contrast and OCR.
-   Calculate a cryptographic checksum, such as SHA-256, for each
    original.
-   Detect duplicate uploads by checksum without deleting either archive
    reference.
-   Preserve original filename, uploader, timestamp and source context.
-   Store page order and page-to-book relationships.
-   Support page labels, missing pages, blank pages and damaged pages.
-   Allow multiple images for one page (front/back, detail shot,
    rescan).
-   Keep a complete processing history.
-   Support export of originals, metadata and structured records.
-   Use redundant backups and periodically test restoration.
-   Apply storage lifecycle policies only after an approved retention
    decision.
-   Do not use lossy transformations as the only stored copy.

## 7.4 Image viewer

Provide: - Zoom, pan and fit-to-screen. - Page navigation and
thumbnails. - Rotate view without altering original. - Side-by-side
original and processed image. - OCR text overlay, if available. -
Highlight extracted text regions. - Jump from a structured record to its
source page and row. - Page-level notes and quality flags. - Download
permission checks. - Mobile-friendly viewing.

------------------------------------------------------------------------

# 8. OCR, handwriting recognition and AI digitisation

This is a core differentiating feature.

## 8.1 End-to-end workflow

1.  Authorised user creates an archive collection or digitisation batch.
2.  User uploads images or PDFs.
3.  System validates files, records metadata and calculates checksums.
4.  PDF pages are separated into page-level processing units without
    altering the original.
5.  Image preprocessing creates temporary/derived versions: orientation
    correction, deskew, denoise, contrast adjustment and optional crop.
6.  Page-layout detection identifies tables, columns, rows, headings and
    handwritten regions.
7.  OCR/HTR provider extracts text and coordinates.
8.  AI classifies the likely register type and maps content into the
    selected register schema.
9.  System creates a **draft extraction**, not an official record.
10. Staff reviews the source image beside extracted fields.
11. Staff corrects uncertain text and links people/relationships.
12. Authorised reviewer approves the import.
13. Approved records are saved and indexed, with permanent source
    references.
14. Audit history records the entire process.

## 8.2 OCR and HTR requirements

Support: - Printed text OCR. - Handwritten text recognition (HTR). -
Mixed printed and handwritten pages. - Table and column recognition. -
Row segmentation. - Field extraction. - Language and script detection. -
Multilingual content. - Historical spelling and abbreviations. -
Low-quality and faded scans. - Confidence scores at page, line, word and
field levels where provider supports them. - Bounding boxes/polygons for
recognised text. - Human correction and feedback.

Do not assume standard OCR can accurately read historical handwriting.
Evaluate HTR models on representative church register samples.

Potential provider/technology adapters: - Transkribus for historical
handwritten document recognition and structured extraction. - Tesseract
OCR for a self-hosted baseline, particularly printed text. - PaddleOCR
for OCR and document text detection/recognition. - Cloud OCR/document AI
services as optional adapters. - Local or self-hosted LLMs for schema
mapping and classification where practical.

Provider selection must be based on measured accuracy, language/script
support, privacy, price, throughput and licensing. These are candidate
integrations, not mandatory vendor commitments.

## 8.3 AI classification

AI should propose: - Register category: baptism, birth, confirmation,
marriage, death, burial, transfer, membership or unknown. -
Document/page type: register page, certificate, letter, application,
index, minutes or other. - Likely date range. - Language/script. -
Column/row structure. - Person names and name variants. - Dates and
places. - Parent, spouse, sponsor, witness and minister relationships. -
Register number and source location. - Whether a page appears to contain
multiple entries. - Whether the page is blank, damaged, duplicated or
out of sequence.

Classification must include a confidence score and allow a human to
override it.

## 8.4 Structured extraction contract

The AI service should return validated JSON matching a versioned
extraction schema.

Illustrative structure:

``` json
{
  "document_type": "baptism_register",
  "schema_version": "1.0",
  "language": "en",
  "page_reference": {
    "volume": "Baptism Book 1985-2000",
    "page_number": "42",
    "row_number": "7"
  },
  "fields": {
    "person_name": {
      "value": "Thomas Joseph",
      "confidence": 0.94,
      "source_region": [120, 240, 680, 310],
      "needs_review": false
    },
    "baptism_date": {
      "value": "1998-03-14",
      "raw_value": "14 March 1998",
      "confidence": 0.89,
      "source_region": [700, 240, 910, 310],
      "needs_review": true
    }
  },
  "relationships": [],
  "warnings": [],
  "human_review_required": true
}
```

The coordinates above are illustrative. The implementation must define a
consistent coordinate system and normalise coordinates against original
page dimensions.

Important: - Preserve the raw recognised text. - Store the normalised
value separately. - Store confidence and provenance. - Use
`null`/unknown for unreadable or absent information. - Never invent a
name, date, relationship or location to fill a required field. -
Distinguish illegible, not present, not applicable and not yet
reviewed. - Validate dates and relationships before import. - Treat AI
output and uploaded document content as untrusted input, not executable
instructions.

## 8.5 Human review interface

The review screen must show: - Original page image. - Processed image. -
Extracted text. - Structured record fields. - Confidence indicators. -
Source region highlighting. - Previous/next entry navigation. -
Keyboard-friendly correction. - Mark unreadable/unknown. - Split or
combine incorrectly detected rows. - Change register type. - Link to an
existing person or create a new draft person. - Duplicate warnings. -
Save draft, submit for review, approve or reject. - Reviewer comments.

Low-confidence fields should be highlighted. Configure thresholds per
provider and field. No single global confidence threshold guarantees
correctness.

## 8.6 Quality assurance and evaluation

Build an evaluation dataset from church-approved sample pages, with
personal information masked where possible.

Measure: - Character error rate (CER). - Word error rate (WER). -
Field-level exact-match accuracy. - Name/date extraction accuracy. -
Row/column segmentation accuracy. - Classification precision and
recall. - Human correction rate. - Processing time and cost per page.

Test separately by: - Language/script. - Historical period. -
Handwriting style. - Scan quality. - Register type. - Table layout.

Do not market an accuracy percentage until it has been measured on
representative data.

## 8.7 AI privacy and governance

-   No uploaded church record may be sent to an external AI provider
    unless the tenant's configuration and contractual/privacy policy
    allow it.
-   Clearly identify whether processing is local, self-hosted or
    third-party cloud.
-   Do not use tenant documents to train shared models by default.
-   Provide provider retention and deletion configuration where
    available.
-   Keep API keys server-side.
-   Redact data from application logs.
-   Record provider, model, model version, prompt/template version and
    processing time.
-   Support manual processing when AI is disabled.
-   Provide a tenant-level AI disable switch.
-   Review vendor data-processing terms before production use.

------------------------------------------------------------------------

# 9. Search and retrieval

Implement a unified search with strict permission and tenant filters.

Search across: - Person/member name. - Alternate spellings and
transliterations. - Church membership number. - Register number. -
Baptism/marriage/death/confirmation details. -
Parent/spouse/sponsor/witness names. - Date or date range. - Place. -
Book, volume, page and row. - Unit, ward, zone and household. - Archive
metadata. - OCR full text, subject to access permissions.

Features: - Exact and partial search. - Typo-tolerant search. -
Phonetic/fuzzy matching as an optional aid. - Filters by tenant, church,
register type, date, status and source. - Search result snippets with
masked sensitive fields where required. - Open record and source page
directly. - Saved searches for authorised staff. - Export search results
only with explicit permission. - Log access to restricted results.

A search result must never reveal that a confidential record exists to
an unauthorised user.

------------------------------------------------------------------------

# 10. Certificates, extracts and official documents

P1.

Create configurable document templates for: - Baptism
certificate/extract. - Confirmation certificate. - Marriage
certificate/extract. - Death/burial extract. - Membership certificate. -
Transfer letter. - Letter of introduction. - Other tenant-defined
documents.

Requirements: - Template editor with church logo/seal, address and
signatory. - Tenant-specific wording and language. - Configurable field
mapping. - Unique certificate/reference number. - QR code or
verification URL with minimal public disclosure. - Issue date and
issuing authority. - PDF generation. - Reprint tracking. -
Revocation/cancellation status. - Watermark for draft or unofficial
copies. - Optional digital signature integration after legal and
operational review. - Print-friendly layouts. - Certificate issuance
audit log.

Do not generate an official certificate from an unapproved record.
Certificate templates must not imply government certification.

Public verification should reveal only the minimum needed, such as
whether a certificate reference is valid, revoked or not found. Do not
expose full personal details by default.

------------------------------------------------------------------------

# 11. Church units, activities and administration

## 11.1 Unit/ward/zone management

-   Create units, wards, zones, small groups and other local structures.
-   Assign households and members.
-   Assign coordinators and access scopes.
-   Maintain historical assignments.
-   Generate member and household lists.
-   Move households between units with effective dates.
-   Support multiple grouping schemes if a church needs both geographic
    and ministry-based groups.

## 11.2 Events and attendance (P1/P2)

-   Create one-time and recurring events.
-   Service, feast, retreat, class, meeting and programme categories.
-   Event location and capacity.
-   Attendance by member, household, group or guest.
-   Manual and optional QR-based check-in.
-   Attendance reports.
-   Restricted child check-in/out workflows if introduced.
-   Event staff and volunteer assignments.

## 11.3 Finance and contributions (P2)

Optional module: - Offerings, donations, pledges and funds. -
Receipts. - Expense records and approvals. - Cash/bank reconciliation
support. - Financial year and currency settings. - Restricted finance
permissions. - Reports and exports. - Payment gateway integration only
after compliance and reconciliation requirements are defined.

Do not mix financial access with sacramental record permissions by
default.

## 11.4 Communication (P2)

-   Email and SMS templates.
-   Approved WhatsApp Business integration, subject to provider terms.
-   Targeted groups based on authorised member filters.
-   Delivery status and opt-out preferences.
-   Communication history.
-   Consent/preference management.
-   Avoid exposing recipient lists to unauthorised staff.

## 11.5 Pastoral care (P2)

-   Pastoral visit scheduling.
-   Follow-up tasks.
-   Restricted pastoral notes.
-   Referral and assignment workflow.
-   Strong separation from ordinary member and register access.
-   No AI summarisation or external processing of pastoral notes unless
    explicitly approved.

## 11.6 Cemetery and burial (P2)

-   Cemetery/section/plot mapping.
-   Burial register.
-   Deceased person and family links.
-   Plot allocation and availability.
-   Maintenance notes.
-   Search and reports.
-   Restricted personal and family information.

## 11.7 Property and asset register (P2)

-   Land/building/property records.
-   Asset category, location, purchase/acquisition date and condition.
-   Ownership/document references.
-   Maintenance history.
-   Insurance and renewal reminders.
-   Restricted financial/legal documents.

------------------------------------------------------------------------

# 12. Dashboards and reporting

## 12.1 Super-admin dashboard

-   Total tenants and active tenants.
-   Trial, active, suspended and expired subscriptions.
-   User counts.
-   Storage consumption.
-   Upload and processing volume.
-   OCR job success/failure rates.
-   Background queue health.
-   Platform usage and operational alerts.
-   Subscription revenue, if billing is implemented.
-   Support access audit.

Do not display church personal or sacramental content on the platform
dashboard by default.

## 12.2 Church dashboard

-   Member and household counts.
-   Register entry counts by category.
-   Pending drafts and approvals.
-   OCR batches awaiting review.
-   Recently digitised books.
-   Missing or damaged page alerts.
-   Certificates issued.
-   Upcoming events, if enabled.
-   Storage usage.
-   Recent activity within the user's permission scope.

## 12.3 Diocese dashboard

-   Number of subordinate churches.
-   Digitisation progress by church.
-   Register coverage by year/type.
-   Pending administrative reviews.
-   Storage and adoption metrics.
-   Aggregated reports that do not expose personal details unless
    specifically authorised.

## 12.4 Reports and exports

-   Register-wise and year-wise reports.
-   Baptism/marriage/death/confirmation indexes.
-   Household and unit directories.
-   Missing page and incomplete digitisation reports.
-   OCR review and correction reports.
-   Certificate issue register.
-   Transfer reports.
-   Audit reports.
-   CSV/XLSX/PDF export where permission allows.
-   Export filters, timestamp, user and purpose logged.
-   Bulk exports should require elevated permission and optionally
    approval.

------------------------------------------------------------------------

# 13. Notifications and workflow engine

P1.

Notification channels: - In-app notifications. - Email. - SMS/WhatsApp
integrations later.

Events: - New user invitation. - Password/security event. - OCR batch
completed or failed. - Review task assigned. - Record submitted for
approval. - Record approved/rejected. - Correction request submitted. -
Certificate issued. - Storage quota threshold reached. - Subscription
expiry. - Backup/processing operational alert for platform operators.

Workflow requirements: - Configurable approver roles. - Assignment and
reassignment. - Due dates and reminders. - Comments and rejection
reasons. - Escalation rules. - Workflow history. - No notification
should contain sensitive personal data unless the channel and policy
permit it.

------------------------------------------------------------------------

# 14. Audit, history and accountability

P0.

Audit events should include: - Authentication success/failure. - User
invitation, role and permission changes. - Tenant and organisation
configuration changes. - Record creation, viewing where sensitive,
editing, approval and correction. - Archive upload, download, export and
deletion request. - OCR processing and human corrections. - Certificate
generation, download, revocation and reprint. - Bulk exports. -
Break-glass access. - Data retention and privacy requests.

Each audit event should include: - Event ID. - Tenant ID, if
applicable. - Actor user ID and role. - Action and resource type/ID. -
Timestamp in UTC. - Source IP/device metadata where lawful and
appropriate. - Before/after change summary for write operations, with
sensitive values protected. - Reason/comment where required. -
Correlation/request ID.

Audit logs must be append-only from ordinary application workflows.
Restrict access and protect logs from tampering. Define retention with
legal and church policy review.

Provide record version history and a readable change timeline.

------------------------------------------------------------------------

# 15. Privacy, security and compliance

P0.

## 15.1 Data protection principles

Design for: - Purpose limitation. - Data minimisation. - Accuracy. -
Transparency. - Appropriate retention. - Security safeguards. -
Accountability. - Data subject request handling where applicable.

For an India-first deployment, assess the Digital Personal Data
Protection Act, 2023 and Digital Personal Data Protection Rules, 2025,
including commencement dates and applicable obligations at the time of
launch. Obtain qualified legal advice for the actual church/operator
relationship and processing purposes.

Official starting points: - DPDP Act:
https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf -
Government notification overview:
https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190655 - Rules
text/reference:
https://indiacode.ecourtsindia.com/rules/digital-personal-data-protection-dpdp-rules-2025-fe07b131/

Do not assume every church record is exempt from data protection law
because it is religious or historical.

## 15.2 Children and deceased persons

-   Records may contain information about children. Apply appropriate
    guardian/parent consent and processing rules where required by
    applicable law.
-   Restrict children's personal data to staff with a legitimate role.
-   Do not expose children's records in public search.
-   Define a careful process for deceased-person records and living
    relatives' information.
-   Do not infer that all data about a deceased person is free of
    privacy considerations.

## 15.3 Security controls

-   HTTPS everywhere.
-   Secure password hashing using Argon2id or an appropriately
    configured modern password hashing algorithm.
-   MFA for privileged roles.
-   Rate limiting and brute-force protection.
-   CSRF protection where cookie-based authentication is used.
-   Secure, HttpOnly, SameSite cookies where appropriate.
-   Strict CORS configuration.
-   Content Security Policy and security headers.
-   Input validation and output encoding.
-   Parameterised SQL/ORM queries.
-   File upload malware scanning.
-   File type/signature validation.
-   Signed, short-lived object access URLs.
-   Encryption at rest for databases and object storage where supported.
-   Secrets manager/environment-based secrets; never commit secrets.
-   Dependency scanning and patch process.
-   Regular backup and restore testing.
-   Database least-privilege accounts.
-   Secure production error handling without stack traces or personal
    data.
-   Security event monitoring.

## 15.4 Sensitive information separation

Pastoral notes, safeguarding records, marriage investigation documents
and other highly sensitive materials should have separate permission
scopes and, where appropriate, separate storage/encryption policies.

The ordinary member profile should not expose these documents.

## 15.5 Retention and deletion

-   Configure retention by record/document category and jurisdiction.
-   Support legal hold and archival preservation flags.
-   Avoid destructive deletion of official registers without explicit
    authorised process.
-   Support account closure and data export.
-   Support correction/restriction requests where legally applicable.
-   Document deletion from primary storage, derivatives, search indexes
    and backups, including backup expiry behaviour.
-   Do not promise immediate deletion from immutable backups unless the
    architecture can actually deliver it.

------------------------------------------------------------------------

# 16. Technical architecture

## 16.1 Recommended baseline stack

The following is a practical baseline. Keep implementation modular and
avoid unnecessary microservices in the first release.

  -----------------------------------------------------------------------
  Layer                               Recommended technology
  ----------------------------------- -----------------------------------
  Frontend                            Next.js (React)

  UI                                  Tailwind CSS and accessible
                                      component system

  Backend                             Node.js with NestJS

  API                                 REST API with OpenAPI documentation

  Database                            PostgreSQL

  ORM                                 Prisma or TypeORM; choose one and
                                      standardise

  Background jobs                     Redis + BullMQ

  File storage                        S3-compatible object storage

  OCR/AI worker                       Python service for OCR/HTR
                                      integrations

  Search                              PostgreSQL full-text/trigram
                                      initially; dedicated search engine
                                      later if justified

  Authentication                      Secure session/cookie architecture
                                      or well-managed OIDC

  PDF generation                      Server-side HTML-to-PDF or a
                                      suitable PDF library

  Reverse proxy                       Nginx

  Deployment                          Linux VPS/cloud infrastructure

  Process management                  Docker Compose or PM2/systemd,
                                      selected consistently

  Monitoring                          Structured logs, metrics, error
                                      tracking and uptime monitoring
  -----------------------------------------------------------------------

Do not introduce Kubernetes, microservices or a separate search cluster
until measured requirements justify them.

## 16.2 Architecture pattern

Start with a modular monolith plus independent background workers.

Logical modules: - Identity and access. - Tenant and organisation. -
Member/family. - Register management. - Archive management. - OCR
orchestration. - AI extraction and validation. - Search. -
Certificates. - Workflow and notifications. - Reporting. - Audit. -
Billing/subscription.

The OCR worker may be a separate Python service because OCR libraries
and document processing tools have a strong Python ecosystem.
Communicate through a queue or internal API.

## 16.3 Suggested repository structure

``` text
church-records-platform/
  apps/
    web/                  # Next.js frontend
    api/                  # NestJS backend
    worker/               # Background jobs
  services/
    document-ai/          # Python OCR/HTR adapter service
  packages/
    shared-types/
    validation/
    ui/
    config/
  prisma/                 # Or selected ORM migrations
  infrastructure/
    docker/
    nginx/
    scripts/
  docs/
    architecture/
    api/
    database/
    operations/
    security/
  tests/
    e2e/
    integration/
    tenant-isolation/
  .env.example
  README.md
```

This is a suggested layout, not a requirement to use a monorepo tool.
The agent should choose a maintainable workspace setup and explain the
decision.

## 16.4 API conventions

-   Version APIs, e.g. `/api/v1`.
-   Use consistent pagination, filtering and sorting.
-   Validate every request DTO.
-   Use standard error response shapes.
-   Use idempotency keys for retryable imports and other sensitive
    operations.
-   Use request/correlation IDs.
-   Generate OpenAPI documentation.
-   Never trust tenant IDs, role names or ownership claims from request
    bodies without server-side verification.

------------------------------------------------------------------------

# 17. Initial database domain model

The following is a conceptual model. Produce a complete ERD and
migration plan before implementation.

## 17.1 Platform and tenancy

-   `tenants`
-   `subscription_plans`
-   `tenant_subscriptions`
-   `tenant_settings`
-   `tenant_module_entitlements`
-   `organisations`
-   `organisation_relationships`
-   `organisation_user_scopes`

## 17.2 Identity and access

-   `users`
-   `user_profiles`
-   `roles`
-   `permissions`
-   `role_permissions`
-   `user_role_assignments`
-   `invitations`
-   `sessions`
-   `mfa_methods`
-   `security_events`

## 17.3 People and families

-   `persons`
-   `person_identifiers`
-   `person_names`
-   `person_contacts`
-   `person_addresses`
-   `households`
-   `household_memberships`
-   `person_relationships`
-   `membership_records`
-   `unit_memberships`
-   `person_merge_history`

## 17.4 Registers

-   `register_types`
-   `register_schema_versions`
-   `register_field_definitions`
-   `register_books`
-   `register_entries`
-   `register_entry_people`
-   `register_entry_field_values`
-   `register_annotations`
-   `register_amendment_requests`
-   `register_approvals`
-   `register_entry_versions`

## 17.5 Archive

-   `archive_collections`
-   `archive_series`
-   `archive_volumes`
-   `archive_pages`
-   `archive_assets`
-   `archive_asset_derivatives`
-   `archive_entry_links`
-   `archive_processing_history`
-   `archive_quality_flags`

## 17.6 OCR/AI

-   `digitisation_batches`
-   `digitisation_batch_files`
-   `ocr_jobs`
-   `ocr_job_pages`
-   `ocr_results`
-   `ai_extraction_drafts`
-   `ai_extracted_fields`
-   `ai_review_actions`
-   `ai_provider_configs`
-   `ai_evaluation_runs`

## 17.7 Supporting modules

-   `certificate_templates`
-   `certificate_issues`
-   `workflow_definitions`
-   `workflow_instances`
-   `workflow_tasks`
-   `notifications`
-   `events`
-   `event_attendance`
-   `finance_transactions` (later)
-   `audit_events`
-   `data_export_jobs`

## 17.8 Data modelling rules

-   Use UUID primary keys for externally exposed entities.
-   Include `tenant_id` on tenant-owned rows and enforce tenant
    consistency in relationships.
-   Use foreign keys and appropriate unique constraints.
-   Use UTC timestamps and store the tenant timezone separately.
-   Store event dates as date-only values where time is not meaningful.
-   Support partial/unknown historical dates without fabricating a full
    date.
-   Preserve raw OCR text and normalised structured values separately.
-   Use explicit status enums or validated lookup tables.
-   Use soft deletion only for entities where it makes sense; official
    records should use controlled status/history workflows.
-   Add indexes for tenant, register number, dates, person references
    and common search fields.
-   Define retention and partitioning strategy only after realistic
    volume estimates.
-   Do not use a single unvalidated JSON blob as the entire database
    model.
-   Use JSONB for genuinely flexible schema/configuration data, with
    validation and versioning.

------------------------------------------------------------------------

# 18. User interface and experience

## 18.1 Design principles

-   Clean, professional, calm administrative interface.
-   Responsive desktop, tablet and mobile layouts.
-   Optimised for clerks processing many records.
-   Accessible forms, keyboard navigation and readable contrast.
-   Clear distinction between official approved records and drafts.
-   Consistent date, name and address display.
-   Avoid overwhelming small churches with modules they do not use.
-   Support configurable language labels and local terminology.

## 18.2 Main navigation

Suggested navigation: 1. Dashboard 2. Members 3. Families/Households 4.
Registers - Baptism - Birth - Confirmation - Marriage - Death/Burial -
Other registers 5. Digital Archive 6. Digitisation / OCR Queue 7.
Certificates 8. Units / Wards 9. Events / Attendance 10. Reports 11.
Notifications / Tasks 12. Administration 13. Audit History

Show only modules and actions the current user can access.

## 18.3 Important screens

-   Login, invitation acceptance and password recovery.
-   Super-admin dashboard.
-   Tenant creation/editing wizard.
-   Church onboarding wizard.
-   Organisation hierarchy manager.
-   User/role/permission manager.
-   Member list, profile and family tree.
-   Register book list and register entry detail.
-   Manual record entry/edit form.
-   Archive collection and volume manager.
-   Upload/batch creation screen.
-   OCR processing queue.
-   Side-by-side OCR review editor.
-   Approval inbox.
-   Certificate template and issue screen.
-   Search results and source viewer.
-   Reports and export centre.
-   Audit timeline.
-   Tenant settings, subscription and storage usage.

------------------------------------------------------------------------

# 19. Non-functional requirements

## 19.1 Performance

Initial targets, to be validated by load testing: - Common authenticated
page loads: p95 under 2.5 seconds under normal load. - Search: p95 under
2 seconds for a normal tenant dataset. - Standard API reads: p95 under
500 ms, excluding large file operations. - Uploads and OCR must be
asynchronous for large files. - A user must be able to continue using
the application while OCR jobs run. - Use pagination and avoid loading
entire registers into the browser.

These are engineering targets, not guaranteed SLAs.

## 19.2 Availability and recovery

Set service objectives after hosting and budget are selected.

Proposed initial operational targets: - Daily automated database
backups. - More frequent backups or point-in-time recovery where
supported and justified. - Separate backup copy from primary
storage/account. - Object storage versioning or equivalent protection. -
Periodic restore tests. - Documented recovery procedure. - Initial
target RPO: 24 hours maximum; improve where feasible. - Initial target
RTO: 8 hours maximum; validate with infrastructure design.

A backup is not considered reliable until a restore has been tested.

## 19.3 Scalability

-   Start with a modular monolith.
-   Use background queues for OCR, PDF generation and exports.
-   Store documents in object storage, not PostgreSQL byte columns.
-   Scale API and worker processes independently.
-   Add indexes and monitor slow queries.
-   Consider tenant-aware partitioning only when volume justifies it.
-   Avoid cross-tenant reporting queries that scan all personal records
    unnecessarily.

## 19.4 Accessibility and compatibility

-   Current Chrome, Edge, Firefox and Safari.
-   Responsive layouts.
-   WCAG 2.2 AA as the target.
-   Keyboard-operable workflows.
-   Screen-reader labels.
-   Clear validation messages.
-   Avoid colour-only status indicators.

## 19.5 Internationalisation

-   Support English initially.
-   Design for Malayalam and other Indian languages.
-   Support Unicode names and local scripts.
-   Support transliterated and alternate spellings.
-   Configurable date formats and timezone.
-   Localised certificate templates.
-   Avoid assuming Western name order or one fixed address format.

------------------------------------------------------------------------

# 20. Subscription and SaaS administration

P1 unless subscriptions are required for the first pilot.

## 20.1 Plans and entitlements

Configurable plans can control: - Number of staff users. - Number of
organisation nodes/churches. - Storage quota. - Monthly OCR
pages/jobs. - Enabled modules. - Certificate generation. - Export
capability. - Support level. - Retention and backup options.

Avoid hard-coding pricing in application logic.

## 20.2 Tenant onboarding

Suggested flow: 1. Super admin creates tenant or approves a registration
request. 2. Tenant details and denomination are entered. 3. Organisation
hierarchy is configured. 4. Initial church administrator is invited. 5.
Register types and templates are selected. 6. Staff accounts are
created. 7. Existing books and archive metadata are imported. 8. A
sample OCR batch is processed and reviewed. 9. Church administrator
completes onboarding checklist. 10. Tenant becomes active.

## 20.3 Tenant lifecycle

-   Trial.
-   Active.
-   Payment overdue/grace period.
-   Suspended.
-   Cancelled.
-   Archived.

Suspension must not destroy or silently remove church data. Provide an
appropriate read-only/export and recovery policy.

------------------------------------------------------------------------

# 21. Integrations

Use adapter interfaces so providers can be changed without rewriting
business modules.

Potential integrations: - OCR/HTR providers. - LLM providers. -
S3-compatible storage. - Email provider. - SMS gateway. - WhatsApp
Business provider. - Payment gateway. - PDF generation. -
Antivirus/malware scanning. - Identity provider/OIDC. - Monitoring and
error tracking.

Each integration needs: - Tenant/platform configuration scope. -
Credentials stored securely. - Connection test. - Usage/cost visibility
where available. - Failure handling and retry policy. - Data
retention/privacy documentation. - Provider outage fallback.

------------------------------------------------------------------------

# 22. Acceptance criteria

A release is not complete merely because the screens exist. The
following behaviours must be tested.

## 22.1 Tenant isolation

-   A user in Church A cannot retrieve Church B records by changing URL
    IDs, query parameters or API payloads.
-   Search, exports, files and background jobs enforce tenant scope.
-   A diocesan user sees only assigned subordinate churches.
-   Automated integration tests attempt cross-tenant access and verify
    denial.

## 22.2 Record integrity

-   An authorised user can create a draft baptism record.
-   An authorised reviewer can approve it.
-   Approval records the actor and timestamp.
-   A correction creates a traceable amendment/version rather than
    silently overwriting history.
-   The original source image remains accessible to authorised users.
-   A record can be traced to its book, page and row.

## 22.3 Digitisation

-   An authorised clerk uploads a PDF or image.
-   Original file and checksum are stored.
-   A background job processes pages.
-   OCR output is stored as a draft with provenance and confidence.
-   Staff can compare the source image with extracted fields.
-   Staff can correct unreadable or incorrect fields.
-   No draft becomes an official entry without approval.
-   Failed jobs can be retried without creating duplicate official
    entries.

## 22.4 Search

-   An authorised clerk can find a record by name, register number and
    date.
-   Search results respect permissions.
-   Opening a result displays its source reference.
-   Fuzzy matches are suggestions, not automatic identity merges.

## 22.5 Certificates

-   A certificate can be generated only from an eligible approved
    record.
-   It uses the tenant's selected template.
-   Issue number, issuer and timestamp are stored.
-   Reprints and revocations are traceable.
-   Public verification does not disclose unnecessary personal
    information.

## 22.6 Security and audit

-   Privileged actions are permission-checked server-side.
-   Sensitive downloads and exports are audited.
-   Password reset tokens expire and cannot be reused.
-   Staff deactivation revokes sessions.
-   Backup restoration is tested and documented.

------------------------------------------------------------------------

# 23. Testing strategy

Required test layers:

1.  Unit tests for validation, permission decisions, date handling and
    register rules.
2.  Integration tests for database relationships, transactions and
    tenant filtering.
3.  API tests for every role-sensitive endpoint.
4.  End-to-end tests for onboarding, record creation, approval and OCR
    review.
5.  File upload security tests.
6.  Tenant-isolation adversarial tests.
7.  OCR evaluation tests using a labelled sample dataset.
8.  Accessibility tests.
9.  Performance/load tests with realistic tenant and register volumes.
10. Backup/restore drills.
11. Regression tests for register schema version changes.
12. Security review before production launch.

Use synthetic fixtures for automated tests.

------------------------------------------------------------------------

# 24. Sample end-to-end workflows

## 24.1 Historical baptism register digitisation

1.  Archivist creates collection:
    `St Mary's Parish Historical Registers`.
2.  Archivist creates volume: `Baptism Register 1980–1995`.
3.  Archivist uploads a scanned PDF.
4.  System stores original PDF and checksum.
5.  System creates page records and image derivatives.
6.  OCR/HTR worker detects page layout and handwriting.
7.  AI proposes baptism entries and field values.
8.  Clerk reviews each entry against the page image.
9.  Clerk links recognised names to existing members or creates draft
    persons.
10. Clerk submits reviewed entries.
11. Authorised reviewer approves entries.
12. Entries appear in baptism search and member profiles.
13. Each entry links to the original PDF page and source region.
14. Digitisation progress report is updated.

## 24.2 New baptism entry

1.  Clerk searches for the child/person to avoid duplication.
2.  Clerk creates or selects a person profile.
3.  Clerk enters baptism details.
4.  System validates required fields and warns about possible
    duplicates.
5.  Clerk attaches supporting documents if required.
6.  Clerk submits the record.
7.  Authorised minister/administrator reviews and approves.
8.  The record becomes official according to the tenant workflow.
9.  Certificate can be generated by a permitted user.
10. All actions are audited.

## 24.3 Marriage and baptism cross-reference

1.  Clerk records an approved marriage entry.
2.  System identifies the spouses' linked baptism records, if available.
3.  System creates a proposed annotation task according to the tenant's
    configured rules.
4.  Authorised staff review the annotation.
5.  Approval adds a traceable annotation to the relevant baptism record.
6.  The original baptism entry is not overwritten.
7.  Certificate generation follows the tenant's approved annotation
    policy.

## 24.4 Transfer between parishes

1.  Receiving parish records a transfer request.
2.  Staff searches for the person and verifies identity using permitted
    evidence.
3.  Transfer letter/source is attached.
4.  Sending/receiving church workflow is followed as configured.
5.  Membership history is updated with effective date.
6.  Historical sacramental records remain linked to the church and
    register where they originated.
7.  Audit history records the transfer.

------------------------------------------------------------------------

# 25. Open decisions and assumptions

The coding agent must keep these as explicit product decisions. Do not
silently assume answers.

1.  Which denomination or church tradition is the first pilot for? The
    platform should remain configurable.
2.  Is the initial target a single parish, a diocese or multiple
    independent churches?
3.  Which register types are mandatory for the first release?
4.  Which languages must be supported at launch: English, Malayalam or
    others?
5.  Are historical books mostly handwritten, printed or mixed?
6.  What are typical PDF/image sizes and expected monthly page volumes?
7.  Is external cloud OCR permitted, or is self-hosted/local processing
    required?
8.  What is the initial hosting budget and preferred provider?
9.  Will the platform operator or each church own/control its storage
    account?
10. Does a church require two-person approval for official records?
11. Which certificates and exact wording are approved by the pilot
    church?
12. Are there diocesan reporting or central supervision requirements?
13. Is the application initially a paid SaaS, free pilot or mixed
    subscription model?
14. Which email/SMS/payment integrations are actually required?
15. What retention, backup and disaster-recovery commitments can be
    funded?
16. Which local church authority will validate register fields and
    workflows?

### Assumptions for the baseline build

-   India is the first deployment market.
-   The platform is multi-tenant from the first migration, not
    retrofitted later.
-   English is the initial interface language; Malayalam support is
    designed for, then implemented as a planned language release.
-   The first pilot includes member/family registry, baptism, birth,
    marriage, death, archive and OCR review.
-   OCR/AI is assistive and human-reviewed.
-   PostgreSQL is the primary relational database.
-   Original scans are preserved independently from OCR output.
-   A church administrator controls staff access within that tenant.
-   Diocesan access is optional and explicitly scoped.
-   Civil registration is outside the platform's authority.

------------------------------------------------------------------------

# 26. Implementation roadmap

Develop in small, working vertical slices. Do not build all modules
before testing the core data and permission model.

## Phase 0 --- Discovery and architecture

Deliverables: - Confirm pilot denomination/church. - Confirm first
register templates. - Confirm hosting and OCR privacy constraints. -
Architecture decision records. - ERD and tenant isolation strategy. -
API conventions and OpenAPI skeleton. - UI wireframes for the critical
workflows. - Threat model and data classification. - Development and
deployment plan.

Exit criteria: key open decisions for MVP are documented and approved.

## Phase 1 --- Platform foundation (P0)

Implement: - Repository and environments. - Authentication and
sessions. - Tenant creation and tenant context. - Organisation
hierarchy. - User invitation and role/permission management. - Audit
framework. - PostgreSQL migrations. - Object storage adapter. - CI
pipeline and basic monitoring.

Exit criteria: two test tenants can be created and automated tests prove
isolation.

## Phase 2 --- Member and register core (P0)

Implement: - Person/member profile. - Household and relationships. -
Membership history. - Register framework and schema versioning. -
Baptism, birth, marriage and death registers. - Manual entry and
approval workflow. - Source references and record history. - Basic
search.

Exit criteria: a church can operate core records without OCR.

## Phase 3 --- Archive and digitisation (P0)

Implement: - Collections, books, volumes and pages. - Upload and
original-file preservation. - PDF page processing. - Image viewer. -
Background queue. - OCR/HTR adapter interface. - Extraction schema and
draft storage. - Human review UI. - Approval/import workflow. - Retry
and failure handling.

Exit criteria: a sample historical book can be digitised end-to-end with
provenance and no automatic official import.

## Phase 4 --- Search, certificates and reports (P1)

Implement: - Improved search. - Source-page navigation. - Certificate
templates and PDF output. - Certificate audit and verification. -
Register reports. - Export centre. - Approval dashboards.

Exit criteria: authorised staff can retrieve and issue a certificate
from an approved record.

## Phase 5 --- Church administration expansion (P1/P2)

Implement as separately enabled modules: - Unit/ward/zone management. -
Events and attendance. - Notifications and workflow reminders. -
Finance/contributions. - Communications. - Pastoral care. - Cemetery and
property records.

Exit criteria: modules can be enabled per tenant without breaking core
record workflows.

## Phase 6 --- Production hardening and rollout

-   Independent security review.
-   Privacy/legal review.
-   OCR accuracy evaluation.
-   Load and failure testing.
-   Backup restore drill.
-   Tenant data export test.
-   Staff training and onboarding guide.
-   Operational runbooks.
-   Monitoring and alerting.
-   Pilot acceptance sign-off.
-   Controlled production rollout.

------------------------------------------------------------------------

# 27. Required documentation produced by the coding agent

Maintain these files in the repository:

``` text
docs/
  PRD.md
  SRS.md
  ARCHITECTURE.md
  ADR/
  DATABASE_ERD.md
  DATA_DICTIONARY.md
  TENANCY_AND_AUTHORIZATION.md
  OCR_AI_PIPELINE.md
  ARCHIVAL_PRESERVATION.md
  PRIVACY_AND_SECURITY.md
  API_CONTRACT.md
  TEST_STRATEGY.md
  DEPLOYMENT.md
  BACKUP_AND_RECOVERY.md
  USER_GUIDE_CHURCH_ADMIN.md
  USER_GUIDE_RECORD_CLERK.md
  USER_GUIDE_ARCHIVIST.md
  CHANGELOG.md
```

Keep this master specification at the repository root as
`REQUIREMENTS.md`. When a decision changes a requirement, update the
document and record the decision in an ADR.

------------------------------------------------------------------------

# 28. Definition of MVP complete

The MVP is complete only when all of the following are true:

-   Super admin can create and manage multiple church tenants.
-   Each church admin can manage users and permissions within their
    church.
-   Tenant data is isolated and tested.
-   Organisation hierarchy supports a church and optional diocese.
-   Staff can create and manage person and household profiles.
-   Staff can create, review and approve core register records.
-   Historical books can be represented as collections, volumes and
    pages.
-   PDF and image uploads preserve original files.
-   OCR/HTR can create structured draft records through a replaceable
    provider adapter.
-   Staff can compare extracted data with the original page and correct
    it.
-   No AI-generated record becomes official without human approval.
-   Search can retrieve approved records and navigate to source pages.
-   Corrections, annotations and approvals are auditable.
-   Backup and restore procedures have been tested.
-   Documentation and deployment instructions are complete.

------------------------------------------------------------------------

# 29. Research references

The following references informed the product direction. They are
starting points for engineering and domain validation, not substitutes
for legal advice or the applicable church authority's instructions.

## Church records and canonical register context

1.  Vatican --- Code of Canon Law, Book IV, including baptism
    registration (Canons 875--878):\
    https://www.vatican.va/archive/cod-iuris-canonici/eng/documents/cic_lib4-cann834-878_en.html

2.  Vatican --- Code of Canon Law, marriage register (Canon 1121):\
    https://www.vatican.va/archive/cod-iuris-canonici/eng/documents/cic_lib4-cann998-1165_en.html

3.  Arlington Diocese --- Canon Law and Sacramental Registers handbook
    (example of diocesan operational guidance):\
    https://www.arlingtondiocese.org/wp-content/uploads/2025/08/Sacramental-Register-Handbook-6-29-2023-FINAL-edited-12-23-2023-with-OCIA-comments-1-14-2025.pdf

## Existing church management platforms

4.  ParishRecords.in --- Features and parish register workflow
    examples:\
    https://parishrecords.in/features/

5.  ChurchCRM --- Feature overview:\
    https://docs.churchcrm.io/getting-started/features-overview

6.  ChurchNest --- Membership, attendance, groups and pastoral care:\
    https://www.churchnest.com/

7.  Church management solution guidance --- Parish Resources:\
    https://parishresources.org.uk/wp-content/uploads/Church-Management-Solution-Apps_updated-2020.pdf

## OCR, HTR and archival extraction

8.  Transkribus --- Church archives and handwriting recognition:\
    https://www.transkribus.org/for-churches

9.  Transkribus --- Structured document data extraction:\
    https://www.transkribus.org/document-data-extraction

10. Transkribus --- Parish register transcription:\
    https://www.transkribus.org/parish-register-transcription

11. Transkribus --- Guide to transcribing church records:\
    https://blog.transkribus.org/en/how-to-transcribe-church-records-with-transkribus

## India data protection

12. Government of India --- Digital Personal Data Protection Act, 2023:\
    https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf

13. Press Information Bureau --- DPDP Rules, 2025 notification
    overview:\
    https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190655

14. DPDP Rules, 2025 reference text:\
    https://indiacode.ecourtsindia.com/rules/digital-personal-data-protection-dpdp-rules-2025-fe07b131/

------------------------------------------------------------------------

**End of specification --- Version 1.0**
