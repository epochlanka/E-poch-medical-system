# Two-computer clinic workflow

The front-desk computer uses one portal with Reception and Pharmacy tabs. The doctor uses the separate doctor portal. Staff do not sign out or change accounts to switch counter duties.

- Reception: register patients, book visits, manage the waiting queue, and take payments.
- Pharmacy: find the doctor's prescription, check the patient, pick and confirm each medicine, record dispensing, and complete handover.
- The header shows prescriptions to prepare and ready for handover. It checks for new prescriptions every 15 seconds while the browser tab is visible and announces newly received prescriptions.
- Top workspace tabs return to each workspace's last page and preserve mounted forms/checklists. A reload, sign-out, or navigating away from a form is different from switching tabs; finish or save work first.
- Billing uses the existing reception invoice/payment pages. Inventory and purchasing tools are grouped below the main pharmacy actions.

## Accounts and local access

The existing `reception` account has the `FrontDesk` role; its password is unchanged. Other Receptionist and Pharmacist accounts retain their original permissions. Administrators can select “Front Desk (Reception & Pharmacy)” when assigning roles. The combined role includes counter duties without doctor-only prescribing or administrator-only account management. Actions retain the signed-in user's identity in existing audit records.

- Front desk: http://localhost:5175/dashboard
- Doctor: http://localhost:5174/dashboard
- Shared sign-in: http://localhost:5173/login
- Backend: port 3000

For installation on two physical PCs, use one shared backend/database. Configure `VITE_API_URL` and the portal URL environment variables on all frontend builds to the clinic server's reachable address. In particular, set `VITE_FRONT_DESK_APP_URL` (or `VITE_RECEPTIONIST_APP_URL`) to the front desk portal address. `localhost` addresses above are for testing on the development computer and do not point to another PC. Keep both frontend source folders when building the front desk: it reuses the pharmacist pages directly.

## Verification

All five applications built successfully. Ten focused permission tests cover combined duties, exclusion of doctor/admin privileges, unchanged standalone roles, the permission matrix, and preservation of the original actor. Browser checks verified reception sign-in redirects to the combined portal, registration state survives switching to Pharmacy and back, and the pharmacy search survives switching to Reception and back. The role change was preceded by a database backup in `backend/backups`; no patient records were created or deleted for these checks.
