# Archival preservation
Originals use `<tenant uuid>/<asset uuid>/original`. Files are written with create-only semantics locally, or S3 conditional writes. Originals are never rotated, cropped, enhanced or replaced. Metadata records original name, signature-detected type, SHA-256, byte size, uploader, volume and page label. Duplicate hashes may have separate references, as required.

25 MB per original; PDF, PNG and JPEG signatures only. A signature is not a malware verdict. Production upload requires the ClamAV adapter to succeed. Keep original paths private and never expose storage as a static directory. Runtime SQL role cannot update/delete asset rows. Configure object-store versioning and write-once policies through the storage operator.

Viewer rotation is transient CSS; it does not edit source bytes. Downloads pass through session, tenant and download permission checks and are audited. PDF working images are separate `archive_pages` objects; the source PDF is never replaced. Back up originals and working pages alongside PostgreSQL; database backups alone cannot restore the archive. Keep object-store versioning/retention policies under operator control.
