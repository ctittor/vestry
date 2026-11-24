# Directories, filters and identity images

Open **Members** for the complete directory of the selected parish. Results are paginated (25, 50 or 100 per page); totals and age cards count every matching record, including records on other pages. Click an age card to filter, click it again or use Clear filters to reset. Combine name, state, place, unit, membership status, and minimum/maximum age. List and card views open the same member profile.

Age groups use completed years on the database's current date:

| Group | Years |
| --- | --- |
| Infant | 0-1 |
| Child | 2-12 |
| Teenager | 13-19 |
| Young adult | 20-35 |
| Middle age | 36-59 |
| Older adult | 60+ |
| Unknown | Missing, partial, approximate or future birth date |

These are application reporting categories. Partial birth years do not create guessed birthdays. Minimum/maximum age filters exclude unknown ages. All statuses are included by default; choose Active for active parish membership. Age cards reflect the other applied filters, independent of the selected age card.

Set State and Place in a member profile or household. A member's explicit location takes precedence; blank member locations inherit the household location. Existing address text is preserved and is not automatically guessed into geographic fields. Household lists have state/place, unit and review-status filters. Registers have event-place and member-unit filters alongside register type, event year and approval status.

Central users can choose a permitted forane and parish in Members. The **Church directory** also offers direct **Full parish member list** links. Parish accounts see only their own parish and its parent churches. Central choices are restricted to the user's archdiocese/forane. Filters do not grant additional access.

## Church and building images

Open **Church directory**, search by name/location, or filter church type, state, place, forane and parish. Open **Church details & buildings** to set a church location, upload/replace/remove its image, and add named buildings such as a hall, chapel or office. Each building has its own image. Buildings appear as searchable directory cards after closing the details dialog.

Parish administrators manage their own parish and its buildings. Forane administrators also manage churches under their own forane. Archdiocese administrators manage their archdiocese; super administrators manage the permitted platform scope. Parent church images are visible to parish users but cannot be changed by them. Central users must enter a reason in the oversight banner before changing church data.

Images accept still JPEG, PNG or WebP, maximum 4 MB and 16 megapixels. The server decodes, strips metadata, resizes and re-encodes them into bounded JPEGs (maximum 256 KiB) stored in PostgreSQL under row-level security. These identity images work on Vercel without S3 and are included in database backups. Original register documents retain their separate storage/scanning requirements and remain disabled in the synthetic test profile. Upload only synthetic images when TEST_DEPLOYMENT=true.

## Profile menu

Click the top-right avatar for **My profile & photo**, **Quick settings**, **Church directory**, and **Sign out**. Escape closes the menu and restores focus; arrow keys move between options. Profile images are private to the signed-in account. Upload or remove yours under My account; the header thumbnail updates after saving.

An unauthenticated /auth/me request returns 401 because no session exists. This expected login-screen check is no longer logged as a server error. Other authentication failures remain traceable; genuine server errors retain error-level logs and request IDs.

## Migration and deployment

Migration **016_directory_filters_images.sql** adds structured location fields, church buildings and private identity photos. Run npm run db:migrate with the intended owner's MIGRATION_DATABASE_URL before deploying code that uses these tables. Preserve the existing encryption key. The migration adds fields/tables and does not replace records. Local startup and API health detect a missing migration. No new Vercel environment variables or object-storage account are required for identity images.
