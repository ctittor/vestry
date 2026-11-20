# Forane administration, activities and research

The hierarchy is **archdiocese → forane → parish/church → unit → household → member**. A forane is a group of parishes; its designated forane church is also a parish. The office login and that church's parish login are separate accounts.

## Research basis

Research checked on 20 November 2026, with emphasis on the Syro-Malabar Church.

| Source | Findings used in the design |
| --- | --- |
| [Holy See, CCEO canons 276–278](https://www.vatican.va/content/john-paul-ii/la/apost_constitutions/documents/hf_jp-ii_apc_19901018_codex-can-eccl-orient-1.html) | Forane oversight concerns pastoral coordination, clergy support/formation, liturgical and church care, proper parish registers, stewardship and parish visits. The eparchial bishop governs establishment and alteration of districts. |
| [Syro-Malabar Vision, May 2025, Rights and Duties of Protopresbyters](https://console.syromalabarchurch.in/uploads/documents/Syro-Malabar_Vision_%28May-2025%29.pdf) | Explains the forane office, parish-based forane church, clergy meetings and welfare, document preservation, visitations and particular-law responsibilities. Its examples of installations and marriage-banns permissions inform a reference-based request log, not automatic authorization. |
| [Syro-Malabar Catechetical Commission, organization](https://www.syromalabarcatechesis.com/inner?pgid=NXpLUUVra1NBdEk2Z0kweXArNG5NZz09&ptype=Qjc0WFFtcWdSamRyR08yRlNUQ2xoZz09) | Catechesis connects eparchy, forane and parish. The forane council includes the vicar, director, secretary, priest representatives, promoters and headmasters. Its published guidance calls for meetings at least every six months. Record coordinators and attendees in plans/minutes; use locally approved meeting dates. |
| [Archdiocese of Trichur, forane directory](https://trichurarchdiocese.org/Foranes) | Demonstrates foranes with designated churches and grouped parishes. This informed the separate forane entity and head-parish relationship. No real appointments or boundaries were imported. |

The workflow mapping below is an application design derived from these sources. Particular duties, delegation and meeting practice depend on the competent authority and local policy. Software access does not itself confer an ecclesiastical office or power.

## Implemented work areas

| Activity category | Working features |
| --- | --- |
| Pastoral coordination | Common plans, parish participation, coordinator, venue, schedule, reporting deadline, minutes and follow-up |
| Catechesis & faith formation | Council/teacher coordination, formation events and parish activity reports with attendance |
| Clergy meetings & formation | Meeting plans, records of discussion, coordination and follow-up |
| Parish visitation | Structured observations covering pastoral follow-up, registers/documents, liturgy, furnishings, goods, parish house and clergy formation/support arrangements |
| Liturgy & church care | Liturgy/furnishings checklist and follow-up observations |
| Registers & stewardship | Registers, goods and parish-house checklist; recordkeeping oversight rather than a financial ledger |
| Clergy support coordination | Office-only coordination records; no parish participant access |
| Delegated request / installation | Required authority/approval reference plus outcomes and history; does not issue a dispensation, appointment or canonical approval |

Each checklist item can be pending, satisfactory, require follow-up, or be not applicable. Follow-up requires a note. Completion requires reviewed observations, minutes/outcomes and reviewed reports from every active participating parish. Activities close through completion or cancellation and remain available as history. Create a new activity for later follow-up.

## Sample local logins

Open **http://localhost:5173**. All demonstration accounts use the local `.env` **SEED_PASSWORD**, unchanged from the earlier local setup.

| Login email | Demonstration scope |
| --- | --- |
| `forane@vestry.example` | St. Mary Forane; St. Mary's parish and parishes deliberately assigned to that forane |
| `forane.stjoseph@vestry.example` | St. Joseph Forane; St. Joseph's parish and its assigned parishes |
| `archdiocese@vestry.example` | Archdiocese administration |
| `operator@vestry.example` | Super administration |

The seed creates only synthetic demonstration assignments and a sample visitation activity. Existing non-demonstration parish-to-forane mappings remain unassigned for confirmation. Seed reruns do not reset existing account passwords or overwrite an existing parish assignment.

## Create a forane and its login

1. Sign in as archdiocese or super administrator and enter **Reason for changes** in the oversight banner.
2. Open **Foranes → Add forane**. Record name, uppercase code, vicar, office email and address. A super administrator also chooses the archdiocese.
3. Open **Parish directory** and choose the correct forane in each existing parish row. Newly created parishes require an active forane in their creation form.
4. Open the forane and choose **Edit forane** to designate its **Forane church (head parish)**. Only a parish assigned to that forane can be selected.
5. Choose **Add forane user**, enter the administrator name/email and an initial password of at least 14 characters. Share the login privately.
6. The forane administrator signs in at the same site address. The initial screen is its own **Forane dashboard**.

Only archdiocese/super administrators can create/edit/archive forane offices, reassign parishes between foranes and create/disable/reset forane accounts. Forane administrators can provision parish accounts inside their own forane and control its parish records through **Open parish**. They cannot create another forane or move parish boundaries.

The dashboard shows parish/unit/household/member totals, open and overdue activities, reports awaiting review, upcoming work, parish access and office history. Its own head church's parish records are managed through **Open parish**, just like other parishes in the forane.

## Run an activity and review reports

1. Open **Forane activities → Plan activity**.
2. Choose the category and forane, enter instructions, coordinator, venue, scheduled date and report deadline. Select participating parishes. Office minutes and follow-up are separate from shared instructions.
3. For visits, liturgy or stewardship, record the applicable checklist observations. Delegated requests require a competent-authority reference. Clergy support coordination is office-only.
4. Create the plan. Participating parishes receive an in-app alert; email is queued for configured recipients.
5. A participating parish signs in with its own staff account, opens **Forane activities → View activity**, records attendance and its report, then selects **Submit parish report**. A member-update permission is required to submit; other permitted staff can read.
6. The forane administrator opens the activity and reviews each parish report. **Return for revision** requires a note. The parish corrects and resubmits; **Mark reviewed** records acceptance. Reviewed reports are locked until returned.
7. Use **Edit activity** to update progress, minutes, observations and follow-up. Complete only when all required reports and observations are reviewed. Cancelled/completed activities cannot be edited or reopened.

Parish users see only activities assigned to their own parish and only their own response. Other parishes' reports, office minutes, office checklist observations, authority references, action items and office history are excluded from parish responses. Forane users see only their own office and its parish data; archdiocese users see only their assigned archdiocese, while super administrators can oversee all.

## Reassignment, alerts and history

Parish reassignment validates the previous forane and archdiocese. A forane church cannot be moved until a replacement head parish is designated or that designation is cleared. After a move, the former forane immediately loses access to the parish's records, including through an existing session. Old activity participation is withdrawn; history remains with the original office, and the parish retains its own records. New activity invitations are explicit.

Changes retain the actor and recorded reason. Forane office history is append-only; activity updates retain before/after snapshots. Parish reports use revision checks and parish audit/alerts. Activity mutation and reporting use transaction locks to avoid closing an activity while a report is being submitted. Failed operations roll back their warnings and emails.

Warnings include parish administrators/priests, the responsible active forane accounts/office email and applicable unit/household/member contacts. Reassignment alerts include former and new forane authorities. Alerts are generated when changes occur. Overdue counts are dashboard indicators; scheduled reminder emails are not implemented.

Archiving a forane revokes its office sessions and stops new activity reports; existing history remains available to permitted users.

Email delivery still uses the existing transactional outbox and SMTP configuration. Without SMTP in development, it writes to the private local outbox, not to a real recipient. Production requires MFA for forane administrators as well as the other privileged roles.

## Upgrade and verification

Run `npm run db:migrate` through migration **015** before this build. For local demonstrations run `npm run db:seed`, then `npm run dev`. Do not run the seed in production. Existing EC2/S3 configuration remains unchanged.

Verification commands: `npm run build`, `npm test`, `npm run test:e2e`. API tests exercise office boundaries, forged selections, raw RLS, parish report privacy, revision conflicts, review/return/completion, checklist validation, reassignment and account/MFA controls. Browser tests exercise archdiocese provisioning, forane login, shared activity planning, parish reporting, review/completion and responsive/accessibility behavior. These checks cover tested workflows, not a guarantee of universal legal or operational correctness.
