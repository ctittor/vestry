# Archdiocese administration and parish onboarding

The hierarchy is **archdiocese → forane → parish/church → unit → household → member**. Each parish is a separate database tenant. Existing parish records remain in their original tenants; migration 012 assigns existing parishes to the initial archdiocese office. All record relationships retain composite parish foreign keys.

Migrations 014-015 add the forane tier. Confirm existing parish assignments through Parish directory; only synthetic seed parishes receive demonstration mappings. See [FORANE_GUIDE.md](FORANE_GUIDE.md).

## Access levels

| Login | Scope | Capabilities |
| --- | --- | --- |
| Super administrator (`platform_admin`) | All archdioceses and parishes | Provision parishes and archdiocese administrators; manage parish lifecycle; open any parish workspace |
| Archdiocese administrator (`archdiocese_admin`) | Assigned archdiocese | Provision and monitor its parishes; open its parish workspaces and manage records |
| Forane administrator (`forane_admin`) | Assigned forane | Dashboard, activities, reports, and management of only its assigned parish workspaces |
| Parish administrator (`admin`) | Assigned parish | Units, households, members, staff, registers, archive and alerts for that parish |
| Other parish staff | Assigned parish and granted permissions | Existing priest, secretary, clerk, archivist and auditor roles |

Archdiocese users cannot open another archdiocese's parish, even with a guessed ID. Parish accounts cannot switch parishes. Central access always requires an explicit parish selection. Central users retain their own identity in the audit trail; they do not impersonate parish staff. Production requires authenticator enrollment for super administrators, archdiocese administrators, forane administrators, parish administrators and priests.

## Local logins

Run migrations and `npm run db:seed` in development. The synthetic accounts use the private `SEED_PASSWORD` already configured in the local `.env`:

| Purpose | Login email |
| --- | --- |
| Super administrator | `operator@vestry.example` |
| Archdiocese administrator | `archdiocese@vestry.example` |
| St. Mary's parish administrator | `admin@stmary.example` |
| St. Joseph's parish administrator | `admin@stjoseph.example` |

Open **http://localhost:5173** after `npm run dev`. These are local demonstration accounts. A fresh production database must use the bootstrap process and independent passwords, never the synthetic seed. Seed reruns do not reset existing passwords.

## Add a church or parish

1. Sign in as super administrator or archdiocese administrator.
2. In the oversight banner, enter a meaningful **Reason for changes** (at least five characters). This is required for central changes.
3. Create the forane through **Foranes > Add forane**, then select **Add parish** in **Parish directory** and choose its assigned forane.
4. Enter the parish name, a unique uppercase code (letters, numbers and hyphens, 2–20 characters), administrator's name, email, and a private initial password of at least 14 characters.
5. Save. The parish workspace, administrator account, parish organisation and standard register schemas are created together. The administrator can sign in immediately using the supplied email/password. A single-use password setup invitation is also queued for delivery; use it to replace the shared initial password privately.
6. Share the site's login address and credentials directly with the parish administrator. Never publish them in shared project documents.
7. Select **Open parish workspace**, or find the parish in the directory and select **Open parish**. The oversight banner identifies the current parish.

The directory shows unit, household, member and staff counts, plus records needing assignment. Use its search field to find a parish. **Parish directory** returns central users to the directory and clears the selected parish. A browser reload also clears the selection and requires selecting a parish again.

## Log in as a parish and build its records

1. Sign out through **My account**, or use a separate browser profile.
2. Sign in at the same site address with that parish administrator's email and password. In production, complete authenticator setup in **My account** first.
3. Open **Households → Manage units** to create or rename units.
4. Choose **Add household**, assign a unit, and enter its contact/address. Household changes follow the existing draft, submission and independent approval workflow.
5. Open **Members** to create members and assign their households. A member's unit is derived from their household. Unassigned records are allowed as drafts/staging records and are highlighted in oversight counts.
6. In **Record management**, configure **unit authority email** and **household warning email**. Set individual members' email addresses in their member profiles.
7. Use **Administration** to edit parish details, invite additional parish staff and control their permissions. A parish administrator cannot create central users.

Unit authorities and household members are warning recipients, not separate login roles in this release. Parish staff logins and central logins are implemented. Contact email addresses must be configured to notify people without staff accounts.

## Update, remove and recover

Open a parish as a central user, enter the change reason, and use the same parish modules. **Administration** edits parish details and staff access; **Households** edits units/households; **Members** edits member profiles.

**Record management** provides permanent deletion of unlinked units, households and members. Enter a separate deletion reason and submit the explicitly labelled delete action. Dependent records and historical links block deletion: reassign children first or mark a member inactive. Official registers and membership history remain protected. Parish removal uses the directory's **archived** status, preserving its records while revoking parish sessions and preventing parish logins. Restore access with **active**. **Suspended** permits parish read access but blocks parish writes; central administrators can still make corrections.

Central users can send a parish staff password setup/reset email from **Record management → Parish login recovery**. This revokes existing sessions and replaces unused setup/reset tokens. A disabled account with a password must first be enabled in **Administration**. Existing **Forgot your password?** remains available on the login page.

Super administrators can create and enable/disable archdiocese administrator accounts in **Parish directory → Archdiocese access**. The default single-archdiocese installation assigns new central accounts to the initial archdiocese. The schema/API also support explicit archdiocese assignments; managing multiple archdiocese organisations through the UI is not included.

## Warning alerts and delivery

Changes to parish details, units, households and members produce a warning in **Alerts**. Other central record mutations also warn parish administrators. Each warning records the actor, action, affected reference, time and reason. The warning and queued email are committed in the same transaction as the change. A rejected/failed operation produces no warning. These are change notifications, not a preapproval workflow.

Recipients include active parish administrators/priests and, where linked, the affected unit authority, household warning contact and member emails. Parish-level changes notify configured linked contacts across the parish. Emails contain a minimal change/reference notice and ask recipients to sign in; record details and reasons remain in the authenticated app. Recipients without logins can contact their parish administrator to investigate. Email cannot be sent to contacts without configured addresses; SMS/push delivery is not implemented.

**Alerts** shows delivered, pending and failed email counts. Reading an alert is tracked per staff user. The mail poller runs in the API process every 15 seconds. It retries delivery up to five times, five minutes apart. In development without SMTP, delivery writes to the private `data/mail-outbox` folder; a delivered count then means delivery to that local outbox, not a real email. Production requires SMTP and a running API process. Configure external monitoring of exhausted delivery failures; no automatic SMS escalation is provided.

## Deploy

Follow [DEPLOYMENT.md](DEPLOYMENT.md) using a fresh production database, HTTPS origin, SMTP, persistent storage, backups, malware scanning and production secrets. Apply migrations through **015** before starting this build. Bootstrap the first super administrator with `node --import tsx tools/bootstrap.ts`; then create the archdiocese users and real parishes through the UI. Never seed demonstration data into production.

This repository uses a persistent Express/PostgreSQL/Redis stack. It is not a static export suitable for static-only hosting. The domain/server and SMTP credentials must be supplied for a real deployment. Local build/test success does not verify a production host, email provider or diocesan acceptance.
