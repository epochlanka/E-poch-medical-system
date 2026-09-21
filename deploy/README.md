# Deploying and operating E-Poch

Two PCs: the **server** (front desk — runs Docker) and the **doctor's PC** (browser only).
Everything below happens on the server unless it says "workstation".

## 1. Prepare the server (once)

- Ubuntu Desktop 24.04 LTS. Install Docker Engine + Compose plugin, add your user to the `docker` group.
- **Fixed LAN IP** (router DHCP reservation). Workstations will use this address.
- **Never sleep**: Settings → Power → Automatic suspend **Off**, screen blank is fine. A sleeping server drops the database connection and the clinic stops.
- Firewall: allow only `3000` and `5173-5176` (TCP) from the LAN — and never forward them from the router to the internet. Nothing else needs to be reachable.

## 2. Configure

```bash
cp .env.example .env                    # SITE_HOST = the server's fixed LAN IP
cp backend/.env.example backend/.env    # then edit backend/.env:
```

`backend/.env` must have, for production:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL`, `DIRECT_URL` | Supabase **session pooler** URLs (see `.env.example`) |
| `JWT_SECRET` | `openssl rand -base64 48` — a **new** value for this deployment |
| `SMTP_*`, `ERROR_ALERT_EMAIL` | so failures email someone (Gmail: an App Password) |
| `ICD11_CLIENT_ID/SECRET` | from the WHO ICD-API portal, if diagnosis lookup is used |

Nothing to configure for browser origins or the login cookie: the stack serves plain HTTP on the clinic LAN, the allowed origins follow from `SITE_HOST`, and `docker-compose.prod.yml` sets `COOKIE_SECURE=false` (a `Secure` cookie is never sent back over HTTP). Because it is plain HTTP, treat the clinic network as trusted — no guest devices on it.

## 3. Supabase (once, in the dashboard)

- **Disable the Data API** for this project (Project Settings → API). The app talks to the database only through the backend; the auto-generated API is an unauthenticated back door. The migrations also revoke public access and the backend refuses to start if that ever regresses — but do not leave the API exposed.
- Use a **paid plan** (daily backups + optional point-in-time recovery). The free plan has no restorable backups.
- Pick a region close to the pharmacy. Every query pays the round-trip time; `/health` reports `databaseLatencyMs`.

## 4. First launch

```bash
./deploy/launch.sh
docker compose -f docker-compose.prod.yml exec -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='<12+ chars, unique>' \
  backend node scripts/bootstrap-production.js
```

This creates the first administrator and — only if none exist — the standard payment methods (Cash, Card, Mobile, Bank Transfer, Other; adjust under Settings → Payment Methods). Production never runs the demo seed.

Auto-start on boot: install `epoch-medical.service` (instructions at the top of the file).

## 5. Workstations

Nothing to install. Open the portal in a browser, using the server's address (the same `SITE_HOST`):

| Portal | Address |
|---|---|
| Front desk | `http://<SITE_HOST>:5173` |
| Doctor | `http://<SITE_HOST>:5174` |
| Receptionist | `http://<SITE_HOST>:5175` |
| Pharmacist | `http://<SITE_HOST>:5176` |

Make a desktop shortcut per PC (Chrome: *More tools → Create shortcut → Open as window*). The browser on the server itself can use the same address, or `localhost`.

## 6. Updating

```bash
ssh <server> './E-poch-medical-system/deploy/update.sh'   # fast-forwards to the pushed commit, rebuilds what changed
```

Migrations apply automatically and are forward-only. The backend refuses to start if the database is exposed to Supabase's public API.

## 7. Backups and recovery

**Three layers, all needed:** Supabase's own backups (managed, off-site), a daily copy of the database + uploads to an *independent* drive (`backup.sh`), and Settings → Backups (on-demand archive you can download).

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

The drill reports how long it took: **that is the recovery time (RTO) for a database this size.** Data-loss window (RPO) = time since the last backup — at most 24 h with the daily backup, less with Supabase point-in-time recovery.

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
- [ ] Supabase Data API disabled; paid plan; region chosen
- [ ] A **restore drill** completed successfully from a real backup
- [ ] Error email and heartbeat alert each **tested** by making them fail once
- [ ] Every workstation can open its portal by the server's address and log in (test from the doctor's PC)
- [ ] Letter preview → issue → download → print tested; a payment and refund tested on a synthetic patient
- [ ] Clinician and pharmacist have accepted prescription-quantity and dispensing behaviour
