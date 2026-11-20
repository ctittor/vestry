# Church administrator guide
Sign in with the invitation link and set a private password. Open your account from the lower-left profile to enroll an authenticator and inspect/revoke sessions. Administration contains church identity, timezone, independent approval and local OCR settings. Leave independent approval enabled unless your authority approves otherwise.

Staff & access lets you prepare invitations, choose roles, restrict/extend individual permissions and deactivate departing users. Role/permission changes revoke sessions immediately; an explicit denial takes priority over a role default. Share setup links privately; do not paste them into public tickets. Review register schemas with your diocese. A new schema version preserves older record meaning. Configure certificate wording only after authority approval.

Register schemas provides a form builder: create a register type, add labelled text/date/number fields and choose which are required. New versions copy existing field references and leave historical forms intact. Only the latest version offers the next-version action. No JSON editing or deployment is needed. Certificate templates separately control whether official annotations are printed, under your authority's approved policy.

Use the approval inbox for submitted records. A creator/submitting clerk cannot approve their own entry under the default policy. Amendments preserve old versions and need a separate reviewer. Audit history records sensitive access and consequential writes. CSV exports require a purpose; store exported personal information securely.

## Parish units and households

Open Households → Manage units to create or rename units, using your parish's own names (for example St Mary's Unit, St Joseph Unit, St Ignatius Loyola Unit, St Alphonsa Unit). Names are unique within the parish, ignoring case and surrounding spaces. Renaming a unit preserves household assignments. Editing staff assign a unit when creating or editing a household. Filter the directory by unit, including unassigned households, and review the status counts above the table.

New and migrated households start as drafts: previous directory records did not have approval evidence. Assign a unit before submitting. A different authorised reviewer, with `registers.approve`, approves or rejects submitted households; rejection requires a reason. Saving household changes starts a fresh draft review. Counts include all matching pages, regardless of the selected status filter.

## Registers by event year

Baptism, Birth, Confirmation, First Holy Communion, Marriage, Death and Burial have year filters and grouped tables. Choose the register, then the year and optional status. Exact dates and year-only dates belong to their recorded calendar year; approximate and unknown dates remain in Unknown / uncertain year. The event year is independent of entry creation or approval dates. Group headings indicate the rows on the current page; pagination continues within the selected filters.

Counters follow the selected register, search and year, but include every status and every page. Not approved means draft + awaiting approval + rejected; corrected and void entries are counted separately. Existing combined Death & burial forms and records retain their historical meaning; use the separate Burial register for new standalone burial entries. First Holy Communion has optional parent, baptism reference/parish and catechism preparation fields, plus the standard person, date, place and minister fields. Adapt new schema versions with your parish/diocese rather than changing historical forms.

## Optional member photos

In Members → Add member or View profile, choose or drag a JPEG, PNG or WebP image onto the photo area. Editing staff with `members.update` can replace or remove photos. Photos are optional; maximum input is 5 MB and 16 megapixels. Save member to apply changes. Images are resized to at most 512 × 512 WebP pixels and metadata is stripped. Photos require the same authenticated parish member access as the profile; they are not public or included in certificates. Removal deletes the active image from PostgreSQL; ordinary backup retention still applies.

## Indian parish research and design decisions

Research checked on 20 November 2026. Family units are a real organisational structure: the [Archdiocese of Trichur parish directory](https://www.trichurarchdiocese.org/public/parish/172) separately counts family units and families, and the [Ernakulam–Angamaly department directory](https://ernakulamarchdiocese.org/department) includes Family Units and Parish Renewal. These examples support configurable parish units; they do not establish a single naming scheme for every Indian parish or Catholic rite.

[Sacred Heart Cathedral, Delhi](https://sacredheartcathedraldelhi.org/menu/Notices/FullNotice.aspx?NId=574) asks First Holy Communion and Confirmation candidates to register with baptism certificates. This supports the optional baptism reference and preparation fields; the source describes preparation, not a nationwide mandatory register format. [Canon 535](https://www.vatican.va/archive/cod-iuris-canonici/eng/documents/cic_lib2-cann460-572_en.html) identifies baptism, marriage and death registers and allows further registers prescribed by competent church authority. [Canon 895](https://press.vatican.va/archive/cod-iuris-canonici/eng/documents/cic_lib4-cann879-958_en.html) addresses confirmation recording. These Latin-code sources are context for the Roman Catholic pilot, not proof of universal Indian or Eastern Catholic requirements. Separate Holy Communion/Burial types and configurable fields are product decisions requested for this system. Calendar-year grouping is a retrieval feature, not a replacement for original volume, page or entry references.
