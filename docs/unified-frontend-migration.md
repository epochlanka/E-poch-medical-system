# Unified frontend migration

The four portals (`frontend`, `doctor-frontend`, `receptionist-frontend`, `pharmacist-frontend`)
are now one application: one address, one login, one session, four role-based workspaces.

`frontend/` is that application. The other three directories are no longer built or deployed and
can be deleted once this has run in the clinic for a while.

## Shape

```
frontend/src/
├── app/                     the shell: login, guards, workspace model, path helpers
│   ├── workspaces.ts        role → workspace(s), route prefixes, landing paths
│   ├── guards.tsx           RequireAuth, RequireWorkspace, RootRedirect
│   ├── WorkspaceContext.tsx useWorkspacePath / useWorkspaceNavigate / WsLink / WsNavLink
│   └── auth/                the shared sign-in and confirmation screens
├── workspaces/
│   ├── admin/               /admin      (entry only; its pages are still at src/pages — see below)
│   ├── doctor/              /doctor
│   ├── reception/           /reception  + the shared front desk shell
│   └── pharmacy/            /pharmacy
├── shared/                  was the repo-root shared/; moved in so frontend/ builds standalone
└── pages, lib, components   the admin workspace's own code
```

Each workspace is lazily imported, so its JavaScript *and its CSS* are a separate chunk. A
receptionist never downloads the clinical or administration bundles.

### How a page keeps its own paths

Every workspace was written as a standalone app with its pages at the root (`/dashboard`,
`/patients`). Rather than rewriting each path, the shell prefixes them: pages use
`useWorkspaceNavigate`, `WsLink` and `WsNavLink` from `app/WorkspaceContext`, which turn a
workspace-local path into a full app path. Nothing inside a workspace knows its own prefix.

The exception is the front desk shell, whose one menu spans two workspaces; it builds full app
paths with `deskPath('Reception' | 'Pharmacy', path)`.

### Roles

| Role | Workspace(s) | Lands on |
|---|---|---|
| Admin | admin | /admin/dashboard |
| Doctor | doctor | /doctor/dashboard |
| Receptionist | reception | /reception/dashboard |
| Pharmacist | pharmacy | /pharmacy/queue |
| FrontDesk | reception + pharmacy | chosen at sign-in, switched from the topbar |

`ROLE_WORKSPACES` in `app/workspaces.ts` mirrors the backend's `hasRoleAccess`. Keep them in step.
Route guards are for usability only — the backend's `requireRole` is the access control.

## What changed in behaviour

- **The shared login handles the TOTP challenge and the lockout response.** The backend has always
  returned `requiresTotp` and `locked`; no portal ever implemented either, so enabling 2FA on an
  account locked it out of every portal.
- **Front desk tab switching no longer preserves the other desk's page state.** The old portal kept
  both desks mounted with frozen locations; under one router per prefix that trick does not carry
  over. In-progress forms are unaffected — those are already saved to localStorage by `lib/drafts.ts`
  — but scroll position and transient UI state reset. Restoring it means keeping both route trees
  mounted inside a single shared mount point.
- **A pharmacist-only account keeps its own pharmacy charges screen.** In the front desk menu,
  billing points at reception's shared ledger; that remap now only applies when the account also has
  reception duty, since a pharmacist cannot open `/reception/*`.
- **The pharmacist portal's own shell is gone.** Both desks use the front desk shell, which is a
  superset of it — same nav style, and its prescription-arrival notice replaces the old pharmacy
  inbox topbar.
- **Admin deep links moved** from `/patients` to `/admin/patients`. Old bookmarks land on the
  dashboard rather than the page they named.
- The login page lost four non-functional controls (Remember me, Forgot password, Google, Microsoft,
  Sign up) and the brand reads E-Poch rather than MediCare.

## CSS

No scoping was needed, contrary to the first estimate. The 144 shared class names only collide if
two workspaces' stylesheets load into one page, and with per-workspace lazy chunks that never
happens: each role has one workspace, and the one pair that does coexist — reception and pharmacy
for FrontDesk — already coexisted in the front desk portal. `index.css` is byte-identical across all
four portals, so the global layer is common by construction.

If a future workspace is ever loaded alongside another, scope its rules under a root class first.

## Verified

Signed in as each seeded role against the running backend and walked the workspace:

- Admin — all 18 routes render on real data
- Doctor — dashboard, live queue, patient search, my consultations, clinical statistics
- Receptionist — dashboard, find a patient, book appointment, invoices, families
- Pharmacist — queue, medicine catalog, prescription records, suppliers, low stock, pharmacy charges
- Cross-role: a receptionist asking for `/pharmacy/*` and a pharmacist asking for `/reception/*` are
  both redirected to their own workspace

`tsc -b` and `vite build` are clean; oxlint reports only the warnings that predate the migration.

## Deployment

One container, built from `Dockerfile.clinic`, running the compiled API and nginx serving the web
application. It replaces the previous five (API plus one nginx per portal).

| | |
|---|---|
| `http://<SITE_HOST>:5173` | the application — every role, every workspace |
| `http://<SITE_HOST>:3000` | the API |

- `docker-compose.prod.yml` — one service, builds `Dockerfile.clinic` from the repo root.
- `deploy/docker-compose.clinic.yml` — the offline clinic install: that same image plus its own
  PostgreSQL. Publishes 3000 and 5173 only.
- `deploy/clinic-nginx.conf` — one site. Workspace routes are client-side, so anything that is not
  a file falls through to `index.html`.
- `backend/src/app.ts` — CORS derives one origin from `SITE_HOST` instead of four. The retired
  portal ports are no longer granted anything, which `lan-deployment.test.ts` now asserts.

Verified by building the image and running it against a throwaway database: the container reports
healthy (both the API and the web application answer), `/admin/dashboard`, `/doctor/queue/live`,
`/reception/patients/all` and `/pharmacy/queue` all serve the application, hashed assets come back
immutable, and a preflight from `:5173` is allowed while `:5174`, `:5176` and an outside origin are
refused.

The API still has its own port rather than being proxied under the application's origin. Putting
`/api` behind the same nginx would remove CORS from the picture entirely; it needs the app to use a
relative API base and a Vite dev proxy, so it was left out of this change.

## Not done

1. **FrontDesk has never been exercised at runtime** — no seeded account holds that role, so the
   two-workspace picker on the confirmation screen and the topbar desk switch are untested against a
   real session. Seed one before rollout.
2. **Write paths are untested.** Every page was checked for rendering, not for registering a patient,
   dispensing a prescription or taking a payment.
3. **Admin's pages still live at `src/pages`, `src/lib`, `src/components`** rather than under
   `src/workspaces/admin/`. Everything works, but the layout implies that code is shared when it is
   admin's alone. Worth moving for the next person reading this.
4. **The front desk shell lives under `workspaces/reception/`** although the pharmacy workspace
   imports it too. It deserves its own directory.
5. **The legacy portal bridge is still in the code** (`migrated: false` in `app/workspaces.ts` sends
   a workspace's users to its old port). Nothing uses it now; it is the rollback path, and it only
   works while the old portal containers still exist.
6. **The three portal directories are still in the repository.** Nothing builds or deploys them.
   Delete them once this has run in the clinic long enough that rolling back is off the table.
