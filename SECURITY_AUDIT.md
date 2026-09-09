# E-POCH Medical System Security Audit

Audit date: 2026-09-09  
Audited revision: `d881ee0ae85a935dc0acd56baee580604a5282ef` (`error-handling`)  
Audit branch: `codex/security-audit`

## Executive summary

This static review found two critical, three high, and four moderate issues. The most urgent problem is an authentication bypass: the application has a published fallback JWT signing key, loads `.env` after the authentication modules have already read configuration, and accepts signed tokens that do not identify a server-side session. The Docker startup path also creates predictable administrator credentials on a fresh database.

Do not deploy this revision to an exposed or production environment before the critical findings are remediated and tested. Treat any deployment that used the fallback signing key or seeded accounts as potentially compromised: rotate the JWT key, revoke all sessions, rotate account passwords, and review audit logs.

## Scope and approach

Reviewed areas included backend authentication and authorization, HTTP and Socket.IO exposure, uploads and patient documents, secrets and seed data, database/backup handling, frontend token storage, container startup, and all five npm lockfiles. `npm audit` was run on 2026-09-09 both with and without development dependencies.

This was a source and dependency audit, not a full penetration test. No deployed host, production configuration, production database, network perimeter, TLS termination, or cloud/IAM configuration was provided. Findings should be retested dynamically after fixes.

## Findings

### CRITICAL-01: Forged JWTs can bypass authentication and session controls

**Evidence**

- `backend/src/middlewares/auth.ts:8-11` accepts the hard-coded fallback `super-secret-jwt-key-replace-in-production`.
- `backend/src/modules/auth/service.ts:8` uses the same fallback to issue tokens.
- `backend/src/app.ts:13-31` imports authentication-dependent modules before `dotenv.config()` runs at line 34. ES module dependencies execute before the importing module body, so values captured at module initialization can miss settings from `backend/.env`.
- `backend/src/middlewares/auth.ts:25-40` only checks session validity when `jwt_payload.sid` is truthy. A correctly signed token without `sid` proceeds using the database user selected by `sub`.

**Impact**

An attacker who can reach the API can sign a token with the published key and the `sub` of an active user. Omitting `sid` bypasses revocation and idle-timeout checks. If the selected user is an administrator, this exposes user management, password resets, database backups, clinical data, and financial data.

**Required remediation**

1. Load and validate configuration in the process entry point before importing application modules.
2. Remove the fallback. Refuse to start unless a cryptographically random production secret of sufficient length is configured.
3. Require a valid `sid` on every access token and reject tokens whose session is absent, revoked, expired, or belongs to a different `sub`.
4. Pin the accepted JWT algorithm and validate issuer and audience.
5. Rotate the signing key and revoke all existing sessions after deployment of the fix.
6. Add negative tests for the fallback key, missing `sid`, mismatched session owner, revoked sessions, and invalid issuer/audience.

### CRITICAL-02: Container startup provisions predictable administrator credentials

**Evidence**

- `backend/docker-entrypoint.sh:10-11` runs the Prisma seed every time the container starts.
- `backend/prisma/seed.ts:9-34` creates `admin/admin123`, `doctor/doctor123`, `pharmacist/pharmacist123`, and `reception/reception123` when those users do not exist.
- The Docker configuration does not restrict this seed path to development.

**Impact**

A fresh deployment exposes known credentials, including an administrator account. Because the upserts use an empty update, later startup does not correct an already-created weak account.

**Required remediation**

1. Never run demo seeding automatically in production.
2. Make demo data an explicit development-only operation that refuses to run when `NODE_ENV=production`.
3. Bootstrap the first administrator with a one-time random secret delivered out of band, and force an immediate password change and 2FA enrollment.
4. Remove real-looking patient data from default deployment seeds.
5. Rotate or remove all accounts created by this seed in any existing environment.

### HIGH-01: Clinical documents, lab reports, and patient photos are publicly readable

**Evidence**

- `backend/src/app.ts:78-90` exposes the entire `uploads` directory without authentication. Only `letter-templates` and `issued-letters` are blocked.
- Consultation documents are stored under `uploads/consultations` (`backend/src/modules/consultations/service.ts:7`).
- Lab reports are stored under `uploads/lab-reports` and their public path is persisted (`backend/src/modules/labTestOrders/service.ts:7,191`).
- Patient photos are stored under `uploads/patients` (`backend/src/modules/patients/router.ts:20`).
- Names use record IDs plus millisecond timestamps, which leak identifiers and are more guessable than random object keys.

**Impact**

Anyone who learns or guesses a URL can retrieve protected health information without logging in. URLs may leak through browser history, referrers, logs, screenshots, or shared records.

**Required remediation**

Remove unauthenticated static serving for all patient-related content. Serve each object through an authenticated controller that applies role and record-level authorization. Use random server-generated object identifiers, `Content-Disposition: attachment` where appropriate, `X-Content-Type-Options: nosniff`, restrictive caching, and an audit entry for access to sensitive documents.

### HIGH-02: Appointment routes have broken role and record-level authorization

**Evidence**

- `backend/src/modules/appointments/router.ts:130-152` applies authentication but no role restrictions to any appointment route.
- Consequently any authenticated role can create appointments, alter status, reschedule, skip, and convert a temporary patient record.
- `backend/src/modules/appointments/controller.ts:86-95` and `backend/src/modules/appointments/service.ts:396-407` expose the unscoped `GET /api/v1/appointments` path. Unlike the newer list path, it does not force Doctor users to their own records.
- `updateTime` and `convertToPatient` do not pass an actor or enforce doctor ownership (`backend/src/modules/appointments/controller.ts:217-235`).

**Impact**

A low-privilege user such as a pharmacist can modify scheduling and patient-linkage data. A doctor can retrieve appointments belonging to other doctors through the legacy endpoint and can reschedule or convert records outside their ownership.

**Required remediation**

Define explicit read/write role sets on every route, remove the legacy unscoped endpoint, and enforce ownership in the service layer for every record operation. Add a deny-by-default authorization test matrix for all four roles and cross-doctor object IDs.

### HIGH-03: Production dependencies contain known denial-of-service vulnerabilities

The production-only audit found three vulnerable packages in the backend:

| Package | Locked version | Severity | Relevant advisories |
|---|---:|---:|---|
| `multer` | 2.2.0 | High | GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-qvfw-j98x-7q72, GHSA-535w-7cp7-47q4 |
| `nodemailer` | 9.0.6 | High | GHSA-8m3c-c648-2xjj, GHSA-wmmp-3585-3rmp, GHSA-2x7j-588g-ccc2, GHSA-cc9r-2j5m-2m83 |
| `qs` | 6.15.3 | Moderate | GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g |

`multer` is directly exposed by multiple authenticated upload routes. `qs` is relevant to `express.urlencoded({ extended: true })`. Nodemailer currently sends to configuration-controlled addresses, which reduces exploitability of some advisories, but the vulnerable version should still be replaced.

Upgrade to patched releases, regenerate the lockfile, run the full test suite, and rerun `npm audit --omit=dev`. Do not use `npm audit fix --force` without reviewing breaking changes.

Development-only advisories were also reported for backend `js-yaml` 3.15.0 (high) and frontend `nanoid` 3.3.16 (high). The other three frontend lockfiles reported no advisories at audit time.

### MODERATE-01: Upload validation trusts attacker-controlled metadata and preserves arbitrary extensions

**Evidence**

- Patient, consultation, and lab upload filters accept the client-supplied MIME value while filenames preserve the original extension (`backend/src/modules/patients/router.ts:23-39`, `backend/src/modules/consultations/router.ts:97-111`, and `backend/src/modules/labTestOrders/router.ts:80-94`).
- The current logic therefore permits mismatched content and extensions, such as an `.html` filename presented with an allowed MIME header.
- Files are then served from an active web origin by the public static handler described in HIGH-01.

**Impact**

Attackers with upload permission can store unexpected active content or malware, bypass intended type controls, and create content-sniffing or stored-content risks.

**Required remediation**

Validate file signatures (magic bytes), decode and re-encode images, map verified types to a server-selected extension, reject encrypted or malformed documents where applicable, add malware scanning, and serve from a non-executable isolated origin or authenticated download controller.

### MODERATE-02: Socket.IO accepts unauthenticated clients and arbitrary room names

**Evidence**

`backend/src/server.ts:15-35` has no Socket.IO authentication middleware. Any client accepted by CORS can emit `join` with an arbitrary value and be placed in that room. There is no schema, allowlist, authorization, or per-socket join limit.

**Impact**

The current code does not emit application data, so immediate confidentiality impact is limited. However, arbitrary room creation can consume memory, and future broadcasts could silently expose data to unauthorized subscribers.

**Required remediation**

Authenticate the handshake, resolve the user and active session server-side, authorize server-derived room names, validate all event payloads, limit event rates and room membership, and add tests before emitting clinical or operational data.

### MODERATE-03: Browser access policy is unrestricted

**Evidence**

- `backend/src/app.ts:41-42` uses `cors()` with the permissive default instead of the configured frontend origin.
- Patient files explicitly receive `Cross-Origin-Resource-Policy: cross-origin` (`backend/src/app.ts:78-87`).
- All four frontends store bearer tokens in `localStorage`.

**Impact**

The API can be called by scripts hosted on any origin when they possess a token, and any frontend script injection would expose the bearer token until expiry. The public cross-origin patient content increases unintended disclosure paths.

**Required remediation**

Use an explicit environment-specific origin allowlist and fail closed in production. Remove cross-origin public PHI. Prefer short-lived access tokens held in memory with a hardened refresh mechanism in `Secure`, `HttpOnly`, `SameSite` cookies, or document and accept the localStorage risk with a strict Content Security Policy and comprehensive XSS controls.

### MODERATE-04: PHI, backups, and TOTP secrets lack application-level encryption at rest

The Prisma schema stores patient/clinical fields and `totp_secret` directly in SQLite, while `backend/src/modules/settings/service.ts:142-203` copies the database into ordinary `.db` backup files. No encryption or managed-key integration is present. This also conflicts with the repository SRS requirement `SEC-05`.

**Impact**

Filesystem, volume, backup, or snapshot access reveals clinical data, identity data, password hashes, and active TOTP seeds. A leaked TOTP seed defeats that factor for the affected administrator.

**Required remediation**

Use encrypted storage and encrypted backups with keys held outside the application volume. Envelope-encrypt TOTP seeds and especially sensitive fields with a managed key service, restrict filesystem permissions, define key rotation and backup retention, and test restore procedures without exposing plaintext copies.

## Additional hardening observations

- Login has no dedicated low-volume IP/user rate limiter; the shared limit is 2,000 requests per 15 minutes. Lockout responses can be used to distinguish and deliberately lock valid accounts after repeated guesses.
- The global rate limiter depends on `req.ip`, but trusted-proxy behavior is not configured. Validate this behind the actual reverse proxy so clients cannot evade limits and all users are not collapsed into one address.
- Password rules only require eight characters. Prefer longer passphrases, compromised-password screening, forced change of bootstrap passwords, and mandatory administrator 2FA.
- Container startup runs `prisma db push --accept-data-loss`. Use reviewed migrations and a separate operational process in production.
- No dependency audit is enforced in repository scripts or CI. Add lockfile scanning, secret scanning, SAST, and a scheduled update workflow.

## Recommended remediation order

1. Fix CRITICAL-01, rotate the JWT key, and revoke sessions.
2. Remove/rotate seeded accounts and make production startup fail closed.
3. Remove public access to uploads and protect every clinical document route.
4. Correct appointment authorization and add cross-role/cross-record tests.
5. Upgrade vulnerable production dependencies.
6. Harden uploads, Socket.IO, CORS, token storage, and encryption at rest.
7. Perform an authenticated dynamic penetration test and verify production infrastructure controls.

## Audit result snapshot

- Critical: 2
- High: 3
- Moderate: 4
- Production npm advisories: 3 packages (2 high, 1 moderate)
- Frontend production npm advisories: 0 across all four frontends

