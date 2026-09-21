# Production readiness review — 21 September 2026

**Decision: do not launch with real patient data in the current state.**

Reviewed commit `9634507` and the local configuration, configured Supabase database metadata, and locally available production containers. Database checks were read-only: permissions, migration state, and setup counts. No patient records were retrieved, no live payments or dispensing were performed, and no application or database fixes were applied. This document is the review artifact.

## Verified results

- Backend and all four frontend production builds passed.
- Role-access test suite passed: 10 tests.
- Current production-dependency audit: backend has two high-severity affected packages (`multer`, `nodemailer`) and one moderate (`qs`); all have available fixes. All four frontend production-dependency audits reported zero findings. This did not audit development dependencies or operating-system packages.
- Configured database: initial migration completed; two active administrators; **zero active payment methods**; two backup metadata records. Backup records do not prove recovery works.
- All 42 public-schema tables, including Prisma's migration table, have row-level security disabled. The database `anon` role has SELECT, INSERT, UPDATE, and DELETE privileges on every one.
- Local production backend container was running but marked unhealthy, with repeated failing health probes. Frontend containers were running.
- Current backend production image contains PostgreSQL client 17.11, runs Node 20.20.2 in UTC, and lacks LibreOffice, the compiled blank-letter template, and the administrator bootstrap script.
- Isolated tests using the actual compiled billing service with an in-memory database substitute reproduced inconsistent concurrent-payment totals and omission of partially dispensed medicines from invoices. These are code-path reproductions, not live PostgreSQL concurrency/load tests.

## Release blockers

### 1. Critical: database access can bypass application authorization

Confirmed database permissions: all 42 public tables have RLS disabled and anonymous read/write/delete grants. This includes `Patient`, `Consultation`, `Prescription`, `User`, `UserSession`, `Payment`, and `AuditLog`.

If Supabase's Data API is enabled for this schema, access through that API can bypass Express authentication and role checks. The external Data API's enabled state and API-key configuration were not verified; the unsafe database permissions themselves were verified. The initial migration contains no RLS policies, enablement, or privilege revocations, so rebuilding from the migration does not establish this protection.

Before launch: disable unused Data API exposure, or move application tables to an unexposed schema and configure least-privilege grants/RLS appropriately. Verify anonymous and authenticated API access is denied, and preserve the backend's required access. If real data has already been present, review external exposure and access history.

Evidence: `backend/prisma/migrations/20260918060641_init/migration.sql`; read-only PostgreSQL catalog checks. [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api).

### 2. High: patient files are publicly downloadable

`backend/src/app.ts:120` mounts `/uploads` without authentication. Only letter-template and issued-letter subdirectories are blocked. Patient photos and consultation PDF/image attachments remain publicly served to anyone who knows the URL. Consultation filenames contain consultation IDs and timestamps, not an authorization boundary.

Before launch: serve patient files through authenticated, authorized routes; block direct static access. Validate actual uploaded content and extensions, since the current photo/document filters trust client-supplied MIME types and retain the original extension.

Evidence: `backend/src/app.ts:120`; `backend/src/modules/consultations/router.ts:104`; `backend/src/modules/patients/router.ts:28`.

### 3. High: prescription quantity calculation ignores dose and unit

The authoritative calculation accepts frequency and duration only. It returns 10 for BD for five days, irrespective of whether the instruction is one tablet, two tablets, or a liquid amount per dose. The service rejects a different quantity whenever this calculation succeeds. The doctor UI repeats the same calculation.

For a two-tablet dose twice daily for five days, a quantity of 20 is rejected in favor of 10. The software needs explicit per-dose quantity and dispensing-unit handling, or a deliberate clinician-confirmed manual quantity where conversion cannot be safely inferred.

Evidence: `backend/src/modules/prescriptions/qtyCalc.ts:35`; `backend/src/modules/prescriptions/service.ts:103`; `doctor-frontend/src/pages/prescriptions/NewPrescription.tsx:309`.

### 4. High: concurrent dispensing can overdraw stock or dispense an item twice

`dispense()` reads item completion and batch availability before writing them, with no row lock, conditional stock update, or explicit serializable isolation/retry. The batch decrement itself is atomic, but its preceding availability check is not. Two requests can both observe enough stock and then both decrement it. Two requests for the same item can also use the same old `dispensed_qty`.

Before launch: serialize or atomically guard stock and prescription-item transitions, add appropriate database constraints and retry handling, and test simultaneous confirmations against isolated PostgreSQL.

Evidence: `backend/src/modules/pharmacy/service.ts:130`, `:176`, `:198`, `:235`.

### 5. High: concurrent payments can corrupt invoice balances

The invoice balance is read before the transaction, and the transaction sets a new balance calculated from that stale value. An isolated reproduction allowed two concurrent payments of 60 against a 100 invoice: payment rows totaled 120, while `paid_amount` ended at 60.

Before launch: lock/serialize payment, refund, void, and invoice-sync operations; enforce balance invariants and reliable idempotency. Also guard creation of the one active invoice per consultation at database level: the current pre-check has no corresponding unique constraint.

Evidence: `backend/src/modules/billing/service.ts:426`, `:453`, `:464`; `backend/prisma/schema.prisma:671`.

### 6. High: partial dispensing is omitted from billing

The pharmacy records partial draws immediately, but only sets `dispensed_at` when the entire prescription line is complete. Billing filters out every item without that timestamp. A test of the compiled service with five dispensed units at 10 each produced zero medicine invoice lines. If the remaining quantity is never dispensed, those supplied units remain unbilled.

Before launch: bill each unbilled dispense record regardless of whether its parent prescription line is complete. Ensure failed invoice synchronization is retried or visibly reconciled; currently a sync failure is only logged after dispensing succeeds.

Evidence: `backend/src/modules/billing/service.ts:108`, `:217`; `backend/src/modules/pharmacy/service.ts:235`, `:260`.

### 7. High: payments are currently blocked by missing setup

The configured database has **zero active PaymentMethod records**. Every payment calls `assertValidPaymentMethod`, so Cash, Card, and any other method will be rejected.

Before launch: configure intended payment methods and clinic fee/settings through the administrator interface and complete a payment/reconciliation smoke test in staging. Production startup intentionally does not seed demo data; do not enable demo seeding to solve this.

Evidence: live metadata count; `backend/src/modules/billing/service.ts:416`.

### 8. High: live session cookies can appear in request logs

The request logger serializes response headers. Its redaction list covers incoming cookies and authorization, but not outgoing `res.headers["set-cookie"]`. A synthetic marker passed through the configured logger remained visible. Login sets the session cookie in exactly this response header.

Before launch: redact response cookies and review existing log access/retention. If real sessions have been logged, invalidate affected sessions and handle existing logs securely. Request URLs can also contain patient search terms and should be minimized/redacted.

Evidence: `backend/src/errors/logger.ts:23`; `backend/src/app.ts:88`; `backend/src/modules/auth/controller.ts:28`; installed pino response serializer.

### 9. High: transport and allowed origins need deployment configuration

Local `.env` uses production mode with `COOKIE_SECURE=false` and localhost-only allowed frontend origins. Compose exposes HTTP ports on all interfaces and supplies no TLS termination. A LAN client using the server IP will not match the configured CORS origins; without an external HTTPS layer, credentials and patient traffic travel unencrypted.

Before launch: configure HTTPS for portals and API, secure cookies, exact deployed origins, and intended API/portal URLs. If a reverse proxy is introduced, configure trusted proxies narrowly so rate limiting and source-IP tracking work correctly. Verify from every actual workstation. An external proxy/firewall was not inspected.

Evidence: local configuration summary (no secrets reproduced); `docker-compose.prod.yml:21`; `frontend/src/lib/api.ts:7`; `backend/src/config/auth.ts`.

### 10. High: backup/restore is not a demonstrated recovery plan

Backup covers PostgreSQL only; photos, consultation attachments, and issued-letter files reside separately under uploads. No scheduled off-machine backup or retention setup was found in deployment files. The verify button lists an archive's contents; it does not restore it.

Restore drops/recreates objects in the live database while the app remains active, without a single transaction or exit-on-error option. An error can leave a partially restored database. Restoring the database also replaces the backup catalog itself, potentially removing metadata for the newly created safety backup although its file remains on disk.

Before launch: back up the database and uploads to a protected independent location, test a full restore to an isolated instance, document recovery time/data-loss limits, and use a controlled maintenance recovery procedure. Do not exercise the current restore button against the live database as a test.

Evidence: `backend/src/modules/settings/service.ts:148`, `:175`, `:198`; `docker-compose.prod.yml:23`. [PostgreSQL restore behavior](https://www.postgresql.org/docs/17/app-pgrestore.html).

### 11. High: supported runtime and vulnerable dependencies

Backend production audit reports high-severity findings in Multer and Nodemailer and moderate findings in qs, all with fixes available. Exploitability differs by code path; this review did not claim every listed advisory is exploitable here. Multer is used by upload endpoints.

Production Dockerfiles use Node 20, which is now end-of-life. Upgrade to a supported runtime and patched dependencies, rebuild images, and repeat testing and package/container audits.

Evidence: current `npm audit --omit=dev --json` results; `backend/Dockerfile.prod:4`, `:17`. [Node support status](https://nodejs.org/en/about/eol).

## Additional issues to resolve or explicitly scope out before launch

1. **Unhealthy running backend:** repeated local Docker health checks failed. Resolve this and verify sustained database connectivity before relying on this deployment. A passing host-side metadata query does not establish container connectivity.
2. **Letters fail in the production image:** no LibreOffice binary is installed; the blank DOCX asset is not copied into `dist`. Install conversion dependencies/fonts and copy the asset, then test preview, issue, download, and printing. The startup binary check misleadingly treats a bare `soffice` command as available without checking it. Sources: `backend/Dockerfile.prod:19`, `backend/src/modules/letters/service.ts:29`, `backend/src/modules/letters/libreoffice.ts:37`.
3. **Clinic timezone mismatch:** the inspected image uses UTC, while billing and appointment/report logic use process-local day boundaries. For this Sri Lankan deployment, configure and test Asia/Colombo semantics, especially day-end reconciliation and appointments around midnight. Source: `backend/src/modules/billing/service.ts:16` and Compose environment.
4. **Polling prevents inactivity expiry:** every authenticated request updates session activity, and portal polling runs every 10–15 seconds. Leaving a workstation unattended can therefore keep a session active until its absolute token expiry. Base idle locking on human activity and verify it on the actual portals. Sources: `backend/src/middlewares/auth.ts:71`; `pharmacist-frontend/src/components/layout/Topbar.tsx:72`.
5. **2FA setup can disable existing 2FA without reauthentication:** setup unconditionally sets `totp_enabled=false`, unlike the disable endpoint, which checks a password. Preserve existing protection until replacement is verified, and require reauthentication. Source: `backend/src/modules/auth/service.ts:100`.
6. **Consultation attachment writes lack ownership/finalization checks:** upload and deletion allow a Doctor role without enforcing that the consultation belongs to that doctor. Deletion takes no actor at all, and can remove attachments from finalized records. Apply the same ownership/amendment controls used for clinical fields. Sources: `backend/src/modules/consultations/router.ts:132`; `backend/src/modules/consultations/service.ts:544`, `:572`.
7. **Refund validation skips unpaid invoices:** refund amounts and methods are checked only when `paid_amount > 0`, but refund rows are inserted whenever refunds are supplied. An admin can therefore record a refund against an unpaid invoice. Require refunds to be bounded by actual unrefunded payments in all cases. Source: `backend/src/modules/billing/service.ts:497`, `:509`.
8. **Sensitive drafts persist across logout:** registration and prescription drafts are kept in localStorage; logout does not clear or isolate them by user. Review shared-workstation behavior and remove or protect these drafts. Sources: `receptionist-frontend/src/pages/patients/RegisterPatient.tsx:74`; `doctor-frontend/src/pages/prescriptions/NewPrescription.tsx:351`; portal AuthContext logout functions.
9. **Monitoring is not verified:** local SMTP credentials are absent, so email alerts are disabled. Heartbeat service files contain installation placeholders; their presence does not prove a monitor is installed. Configure an alert destination, test a failure alert, and set log rotation/disk monitoring.
10. **ICD lookup is unconfigured:** local ICD credentials are absent. Configure and smoke-test diagnosis lookup if it is required for launch.
11. **Fresh-install admin bootstrap is not in the runtime image:** the script exists in source but is not compiled/copied into the image, and tsx is a development dependency. The current database already has administrators, but clean recovery/install needs a documented usable bootstrap path.
12. **Unused unauthenticated Socket.IO listener:** connections can join arbitrary rooms. No application data emission was found, so this is not reported as an existing patient-data leak; remove it if unused or authenticate and authorize it before using it. Source: `backend/src/server.ts:14`.

## Required acceptance checks

Use a separate staging database and synthetic patients. Existing integration tests log in with demo credentials and write settings, records, payments, and backups to the configured database; they must not be run against real clinic data. The normal Jest setup only overrides the JWT secret and does not isolate the database.

Before approval, verify: clean migration/bootstrap; each role's login/access restrictions; patient registration and appointment flow; multi-unit/liquid prescription quantities; concurrent and partial dispensing; concurrent/retried payments and refunds; complete invoices and reconciliation; printer/PDF workflows; human inactivity locking; workstation HTTPS/origins; restart and network-outage behavior; monitoring alerts; and database-plus-files recovery. Obtain clinician/pharmacist acceptance of prescription and dispensing behavior.

The review does not certify regulatory compliance, clinical suitability, or all possible defects. It identifies concrete blockers and the outstanding verification needed for this release.
