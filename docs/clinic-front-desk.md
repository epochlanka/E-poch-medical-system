# Two-computer clinic workflow

The front-desk computer uses the Reception and Pharmacy workspaces; the doctor uses the Clinical workspace. Staff do not sign out or change accounts to switch counter duties.

> The four portals are now one application — see [unified-frontend-migration.md](unified-frontend-migration.md). Everything below still describes how the counter works; only the addresses changed.

- Reception: register patients, book visits, manage the waiting queue, and take payments.
- Pharmacy: find the doctor's prescription, check the patient, pick and confirm each medicine, record dispensing, and complete handover.
- The header shows prescriptions to prepare and ready for handover. It checks for new prescriptions every 15 seconds while the browser tab is visible and announces newly received prescriptions.
- Top workspace tabs switch between the two desks. They no longer return to each desk's last page or keep its forms mounted — that ended when the desks became separately routed workspaces. Saved drafts survive (they are in localStorage); scroll position and transient state do not. Finish or save work before switching.
- Billing uses the existing reception invoice/payment pages. Inventory and purchasing tools are grouped below the main pharmacy actions.

## Accounts and local access

The existing `reception` account has the `FrontDesk` role; its password is unchanged. Other Receptionist and Pharmacist accounts retain their original permissions. Administrators can select “Front Desk (Reception & Pharmacy)” when assigning roles. The combined role includes counter duties without doctor-only prescribing or administrator-only account management. Actions retain the signed-in user's identity in existing audit records.

- Sign in: http://localhost:5173/login
- Reception: http://localhost:5173/reception/dashboard
- Pharmacy: http://localhost:5173/pharmacy/queue
- Doctor: http://localhost:5173/doctor/dashboard
- Backend: port 3000

For two physical PCs on the same private network, use one shared backend/database and open the application with the server's LAN hostname or IP address instead of `localhost` (for example, `http://192.168.1.50:5173`). The app derives the API address from the browser's hostname, so no fixed-IP frontend configuration is required. The backend accepts loopback and private-network origins in development; in production it allows the one origin derived from `SITE_HOST`. For anything unusual — an extra hostname, or TLS in front — set `FRONTEND_URLS`.

## Verification

(Written when this was two portals.) All five applications built successfully. Ten focused permission tests cover combined duties, exclusion of doctor/admin privileges, unchanged standalone roles, the permission matrix, and preservation of the original actor. Browser checks verified reception sign-in redirects to the combined portal, registration state survives switching to Pharmacy and back, and the pharmacy search survives switching to Reception and back. The role change was preceded by a database backup in `backend/backups`; no patient records were created or deleted for these checks.
