# Deploying and operating E-Poch

## Simplest offline deployment: one image

Use this when the Ubuntu clinic machine should receive one prebuilt Docker image rather than the
source tree and five separately built images.

On the build machine (an internet connection is needed only while building):

```bash
./deploy/build-clinic-image.sh
```

Copy the resulting `deploy/transfer` directory to the Ubuntu clinic machine (USB drive, local
network, or `scp`). On the clinic machine:

```bash
cd transfer
cp clinic.env.example clinic.env
nano clinic.env                         # set SITE_HOST, POSTGRES_PASSWORD (in all three places), JWT_SECRET
./start-clinic.sh admin                 # starts the app and creates the first administrator
```

`epoch-medical-clinic.tar` carries **both** images — the application and PostgreSQL 17 — so the
install needs no internet at all. Alongside it are the Compose file, an environment template, a
checksum, the start script, and the backup tooling (`backup.sh`, `restore.sh`, and the systemd
units). The database, patient uploads, backups and logs all live in `transfer/data`; they survive
image replacement.

### The database runs on the clinic machine

PostgreSQL is the `db` service in the same Compose file, storing its data in `transfer/data/postgres`.
It publishes no port, so it is reachable only by the application over the private Compose network,
never from the clinic LAN. `POSTGRES_PASSWORD` must match the password inside `DATABASE_URL` and
`DIRECT_URL` — `start-clinic.sh` refuses to start if they disagree.

Because the database is local, `SKIP_DB_SECURITY_CHECK=true` is set: that startup check looks for
Supabase's `anon`/`authenticated` API roles, which do not exist here.

> **This machine is now the only copy of the clinic's records.** There is no managed off-site
> backup behind it any more. Set up `backup.sh` to an external drive *before* the clinic starts
> entering real data — see "Backups" below. To update later, build a fresh transfer directory,
copy the new image tar to the clinic, and run `./start-clinic.sh` again. Database migrations run
automatically before the new version starts.

The image defaults to `linux/amd64`, which is correct for ordinary Intel/AMD Ubuntu PCs. For an ARM
clinic computer, build with `PLATFORM=linux/arm64 ./deploy/build-clinic-image.sh`.

The older five-container, source-on-server deployment remains documented below.

Two PCs: the **server** (front desk — runs Docker) and the **doctor's PC** (browser only).
Everything below happens on the server unless it says "workstation".

## 1. Prepare the server (once)

- Ubuntu Desktop 24.04 LTS. Install Docker Engine + Compose plugin, add your user to the `docker` group.
- **Fixed LAN IP** (router DHCP reservation). Workstations will use this address.
- **Never sleep**: Settings → Power → Automatic suspend **Off**, screen blank is fine. A sleeping server drops the database connection and the clinic stops.
- Firewall: allow only `3000` and `5173` (TCP) from the LAN — and never forward them from the router to the internet. Nothing else needs to be reachable.

## 2. Configure

```bash
cp .env.example .env                    # SITE_HOST = the server's fixed LAN IP
cp backend/.env.example backend/.env    # then edit backend/.env:
```

`backend/.env` must have, for production:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | The local database; the password must also appear in both URLs below |
| `DATABASE_URL`, `DIRECT_URL` | `postgresql://epoch:<password>@db:5432/epoch` — host is the Compose service `db` |
| `SKIP_DB_SECURITY_CHECK` | `true` for a local PostgreSQL (the check is Supabase-specific) |
| `JWT_SECRET` | `openssl rand -base64 48` — a **new** value for this deployment |
| `SMTP_*`, `ERROR_ALERT_EMAIL` | so failures email someone (Gmail: an App Password) |
| `ICD11_CLIENT_ID/SECRET` | from the WHO ICD-API portal, if diagnosis lookup is used |

Nothing to configure for browser origins or the login cookie: the stack serves plain HTTP on the clinic LAN, the allowed origins follow from `SITE_HOST`, and `docker-compose.prod.yml` sets `COOKIE_SECURE=false` (a `Secure` cookie is never sent back over HTTP). Because it is plain HTTP, treat the clinic network as trusted — no guest devices on it.

## 3. The database

The clinic install runs PostgreSQL locally as the `db` service (see the top of this file). Nothing
further is needed: it has no public API surface, and queries no longer cross the internet, so
`/health`'s `databaseLatencyMs` should be a fraction of a millisecond.

The trade for that is backups. A hosted database provided managed off-site copies; a machine under
the clinic's desk does not. Treat "Backups" below as part of the installation, not as an optional
extra — and complete a restore drill before real data is entered.

If a deployment is instead pointed at a hosted Supabase project, disable its Data API (Project
Settings → API), use a paid plan for restorable backups, pick a nearby region, and leave
`SKIP_DB_SECURITY_CHECK` unset so the startup check runs.

## 4. First launch

```bash
./deploy/launch.sh
docker compose -f docker-compose.prod.yml exec -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='<12+ chars, unique>' \
  backend node scripts/bootstrap-production.js
```

This creates the first administrator and — only if none exist — the standard payment methods (Cash, Card, Mobile, Bank Transfer, Other; adjust under Settings → Payment Methods). Production never runs the demo seed.

Auto-start on boot: install `epoch-medical.service` (instructions at the top of the file).

## 5. Workstations

Nothing to install. Open the application in a browser, using the server's address (the same `SITE_HOST`):

| | Address |
|---|---|
| Every workstation | `http://<SITE_HOST>:5173` |

Everyone uses that one address. Signing in opens the workspace their role allows — administration,
clinical, reception or pharmacy — and a front desk account can switch between reception and
pharmacy from the topbar.

Make a desktop shortcut per PC (Chrome: *More tools → Create shortcut → Open as window*). The browser on the server itself can use the same address, or `localhost`.

## 6. Updating

```bash
ssh <server> './E-poch-medical-system/deploy/update.sh'   # fast-forwards to the pushed commit, rebuilds what changed
```

Migrations apply automatically and are forward-only, and a fresh local database records its
migration history correctly from the first start.

## 7. Backups and recovery

**With the database on the clinic machine there is no managed off-site copy, so `backup.sh` is
not optional — it is the only thing standing between a failed disk and the loss of every record.**

Two layers, both needed: a daily copy of the database + uploads to an *independent* drive
(`backup.sh`, scheduled by `epoch-backup.timer`), and Settings → Backups (on-demand archive you can
download). Use `BACKUP_PASSPHRASE_FILE` — these files contain patient records and will be sitting on
a removable drive.

On the clinic machine `backup.sh` runs from inside the install folder (it detects the layout), so:

```bash
cd transfer
echo "BACKUP_DEST=/media/clinic/backup-drive/epoch" >> clinic.env
./backup.sh                              # prove it works before trusting the timer
```

Daily backup — set in the repo-root `.env`:

```
BACKUP_DEST=/media/epoch-backup          # an EXTERNAL drive or network share — not this PC's system disk
BACKUP_PASSPHRASE_FILE=/etc/epoch-backup.pass   # encrypts backups (they contain patient records)
BACKUP_HEARTBEAT_URL=https://hc-ping.com/<id>   # alerts you if a night is missed
```

Install `epoch-backup.service` + `epoch-backup.timer` (daily 02:00, catches up after being off). Uploaded photos/attachments are **not** in the database — the backup includes them.

**Prove it works — do this on a schedule, and after any change to backups:**

```bash
# restore into a throwaway empty database (e.g. a local Postgres), never the live one
./deploy/restore.sh --drill backup-2026-…tar --target-url postgresql://postgres:pw@localhost:5432/drill
./deploy/restore.sh --drill database-<ts>.dump.enc,uploads-<ts>.tar.gz.enc --target-url …   # for backup.sh output
```

The drill reports how long it took: **that is the recovery time (RTO) for a database this size.** Data-loss window (RPO) = time since the last backup — up to 24 h with the daily backup. With the
database on the clinic machine there is nothing finer-grained behind it, so consider running
`backup.sh` more than once a day if a day of lost records would be unacceptable.

**Real disaster recovery** (destroys current data, stops the app):

```bash
./deploy/restore.sh --live <backup>     # asks you to type a confirmation phrase
```

It saves a safety dump first, restores in a single transaction (all-or-nothing), restores the uploaded files, revokes every session, restarts and re-runs the security check. **Do not** try to restore from inside the application — that button was removed on purpose.

## 8. Monitoring

- `SMTP_*` set → the app emails `ERROR_ALERT_EMAIL` when something breaks. **Test it once** (stop the database connection briefly, or trigger an error) — silence proves nothing.
- `deploy/heartbeat.sh` + `epoch-heartbeat.timer` ping an outside monitor every 5 minutes only while the app is healthy, the disk has room and every container is up.
- Logs rotate automatically (Docker: 5 × 10 MB per container; app error log: 3 × 20 MB).
- Remote access for the dev team: Tailscale on the server and each laptop, then `ssh`.

## 9. Before real patients — checklist

- [ ] `JWT_SECRET` is new; all sessions revoked (`UPDATE "UserSession" SET revoked_at = now() WHERE revoked_at IS NULL;`)
- [ ] Admin password is unique (not reused anywhere) and 2FA enabled for administrators
- [ ] `BACKUP_DEST` points at an external drive, `backup.sh` run once by hand, timer enabled
- [ ] `BACKUP_PASSPHRASE_FILE` set — the backup drive holds patient records
- [ ] A **restore drill** completed successfully from a real backup
- [ ] Error email and heartbeat alert each **tested** by making them fail once
- [ ] Every workstation can open the application by the server's address and log in, and lands in the right workspace (test from the doctor's PC)
- [ ] Letter preview → issue → download → print tested; a payment and refund tested on a synthetic patient
- [ ] Clinician and pharmacist have accepted prescription-quantity and dispensing behaviour
