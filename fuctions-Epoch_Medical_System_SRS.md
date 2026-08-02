# E-Poch Medical System
## Software Requirements & Technical Design Specification (SRS / FRD / BRD / TDD / DB / API / UI-UX)

**Document type:** Combined SRS, FRD, BRD, TDD, Database Design Guide, API Design Guide, UI/UX Specification
**Target platform class:** Single-clinic / small private-practice Clinic + Dispensary Management System (comparable in scope to a lightweight OpenMRS + pharmacy-POS hybrid, sized for one doctor's practice with an in-house pharmacy)
**Core modules:** Authentication • Patient • Family • Appointment • Consultation • Prescription • Pharmacy • Inventory • Supplier • Billing • Reports • Dashboard • Settings
**Confirmed technology stack:** React (frontend SPA) • Node.js + Express (backend API) • Prisma ORM • SQLite (on-premise/local) • PostgreSQL (cloud)

---

## 0. Core Design Philosophy

The single most important architectural decision in a clinic system that must connect a doctor's clinical judgment to a pharmacist's stock room to a receptionist's cash drawer is this:

> **Never let money move or medicine leave the shelf without a traceable clinical origin. One Visit, one clinical record, one prescription, one dispense event, one invoice — always linked, never orphaned.**

This is achieved through four mechanisms used throughout this document:

| Mechanism | What it does | Example |
|---|---|---|
| **Unified Visit/Encounter Chain** | Appointment → Consultation → Prescription → Dispense → Invoice are all foreign-keyed back to one originating visit | A pharmacist can never dispense against a prescription that isn't linked to a finalized consultation |
| **State-Machine Enforcement** | Every workflow (Queue, Prescription, Purchase Order) is a strict, named status sequence, not a free-text field | Queue status can only move Waiting → Called → Consulting → Completed, never skip a step silently |
| **FEFO/Batch Engine** | All stock is tracked at batch level with expiry dates; dispensing always allocates the earliest-expiring valid batch first | Two batches of the same medicine with different expiry dates — the system always suggests the one expiring soonest |
| **Audit-First Design** | Every create/update/delete on a clinical or financial record writes an immutable audit-log row before the user sees success | A disputed invoice or an amended diagnosis can always be traced to a specific user, timestamp, and before/after value |

All modules below are written against this universal core.

---

## 1. Complete Sidebar — Full Module & Submenu Tree

```
📊 Dashboard
   ├─ Overview (Today's Patients, Revenue, Low Stock, Expiring Batches)
   ├─ Queue Snapshot Widget
   ├─ Follow-ups Due Widget
   └─ Alerts & Notifications Center

🧑‍🤝‍🧑 Patients
   ├─ All Patients
   ├─ Register New Patient
   ├─ Duplicate / Near-Duplicate Review Queue
   ├─ Patient Photo Capture
   ├─ Patient History Timeline
   └─ Patient Audit Log

👨‍👩‍👧 Families
   ├─ Family Directory
   ├─ Family Member Roster
   ├─ Head of Family Assignment
   └─ Family Merge Tool

📅 Appointments & Queue
   ├─ Book Appointment
   ├─ Walk-in / Add to Queue
   ├─ Live Queue Board
   ├─ Doctor Call-Next Console
   └─ Skip / Recall Log

🩺 Consultations
   ├─ Consultation Workspace
   ├─ Vitals Entry (BP, Temp, Pulse, Weight, Height, BMI)
   ├─ Clinical Notes & Diagnosis (ICD-10 optional)
   ├─ Allergy & Chronic Condition Flags
   └─ Consultation Amendment Log

💊 Prescriptions
   ├─ Prescription Builder
   ├─ Medicine Lookup (name/generic/category)
   ├─ Allergy Conflict Warnings
   ├─ Refill / Repeat Prescription
   └─ Printable Prescription (PDF)

🏥 Pharmacy
   ├─ Pharmacy Queue (Kanban: Pending/Preparing/Dispensed/Collected)
   ├─ Dispensing Screen (FEFO batch picker)
   ├─ Partial Dispense Handling
   ├─ Dispensing Label Printing
   └─ Substitution Rules

📦 Inventory
   ├─ Medicine Catalog
   ├─ Batch & Expiry Tracking
   ├─ Stock Ledger (movement history)
   ├─ Low-Stock / Reorder Alerts
   ├─ Expiry Alerts
   ├─ Stock-Take / Physical Count
   └─ Manual Adjustment (reason-coded)

🚚 Suppliers
   ├─ Supplier Directory
   ├─ Purchase Orders (Draft → Submitted → Received → Closed)
   ├─ Goods Received Notes (GRN)
   └─ Receipt Discrepancy Review

💵 Billing
   ├─ Consolidated Invoice (consultation + dispensed items)
   ├─ Payments (cash/card/mobile, split payments)
   ├─ Discounts (senior citizen, staff, insurance)
   ├─ Outstanding Balances / Partial Settlement
   ├─ Void / Refund (Admin-approved)
   └─ End-of-Day Cash Reconciliation

📈 Reports
   ├─ Admin Dashboard (volume, revenue, top medicines)
   ├─ Doctor Dashboard (consultations, follow-ups due)
   ├─ Pharmacist Dashboard (low stock, expiring batches, dispensing volume)
   ├─ PDF/Excel Export
   └─ Scheduled Report Emailer

⚙️ Settings
   ├─ Clinic Profile (name, logo, registration number)
   ├─ Fee Schedules & Reorder Levels
   ├─ Expiry Alert Thresholds
   ├─ Master Data (categories, payment methods, discount types)
   └─ Backup & Restore

🔐 Security
   ├─ Users & Roles (Admin/Receptionist/Doctor/Pharmacist)
   ├─ Permission Matrix
   ├─ Two-Factor Authentication (Admin)
   ├─ Session Management
   └─ Audit Trail / Activity Logs
```

---

## 2. Module Deep-Dive Template

Every core module below follows this fixed structure so the specification stays consistent and directly buildable by a dev team:

`Purpose → Business Logic → Required Inputs → Key DB Fields → CRUD → Validation → Permissions → Relationships/Dependencies → API Endpoints → UI Components → Search/Filters → Audit Logs → Notifications → Status Flow → Edge Cases → Best Practices`

---

## 3. Patient & Family Module

### Purpose
A single de-duplicated patient record, groupable into households, that every other module (appointments, consultations, prescriptions, billing) hangs off of.

### Business Logic
- NIC (National Identity Card) number is the primary de-duplication key; registration is **blocked**, not just warned, on an exact NIC match.
- Minors without their own NIC use **guardian NIC + date of birth** as an alternate composite key.
- A fuzzy name+DOB match (different NIC) is **flagged for review**, not blocked — the receptionist decides.
- Every patient belongs to **exactly one** Family (`BR-01`); a Family designates one member as Head of Family for consolidated billing/contact purposes.
- Patient edits are never destructive — demographic changes retain a full field-level change history.
- A patient photo is optional but recommended for positive identification at a busy front desk.

### Required Inputs
Full name, NIC/passport or guardian NIC, date of birth, gender, phone, address, blood group, known allergies/chronic conditions (optional), family link (existing or new).

### Key DB Fields
```
patients   (patient_id [PK, e.g. PT-000123], family_id [FK], nic [unique, nullable],
            guardian_nic, full_name, dob, gender, phone, blood_group,
            allergies, is_active)
families   (family_id [PK], family_name, head_patient_id [FK], address, contact_no)
patient_change_log (id, patient_id, field, old_value, new_value, changed_by, changed_at)
```

### CRUD
- **Create:** NIC-uniqueness check runs before the rest of the form unlocks.
- **Read:** search by NIC, name, phone, or Patient ID; results must return in under 2 seconds (`FR-016`).
- **Update:** every field change is logged; family reassignment carries an audit entry (`FR-022`).
- **Delete:** patients are never hard-deleted (they carry clinical history); `is_active=false` archives instead.

### Validation Rules
- NIC unique across the entire patient database (`BR-02`).
- Minors validated against guardian NIC + DOB, not a bare NIC field.
- Mandatory fields block submission with inline errors, not silent failure.
- Family move/merge requires a documented audit reason.

### Permissions
`patient.view`, `patient.create`, `patient.edit`, `patient.merge-family`, `family.view`, `family.edit`, `family.merge` — Receptionist has full CRUD; Doctor and Pharmacist are Read-only (Section 6 permission matrix).

### Relationships & Dependencies
Feeds: Appointments, Consultations, Prescriptions, Invoices, Patient History Timeline. Depends on: nothing (root entity alongside Family).

### API Endpoints
```
GET    /api/v1/patients?search=
POST   /api/v1/patients
PUT    /api/v1/patients/{patientId}
GET    /api/v1/families/{familyId}
POST   /api/v1/families/{familyId}/merge
```

### UI Components
NIC live-validation field with instant duplicate lookup, demographic form, family picker/creator combo, near-duplicate review banner, patient photo uploader, tabbed detail page (Demographics / Family / History / Allergies).

### Search & Filters
By NIC, name, phone, Patient ID, family, active/inactive status, blood group.

### Audit Logs
Every create/update/merge on Patient or Family writes an entry with user, timestamp, field, before/after value (`FR-089`).

### Notifications
Near-duplicate match flagged to receptionist at point of entry; no other proactive notifications for this module.

### Status Flow
`Active ⇄ Archived (is_active toggle)` — no multi-step workflow; this is master data, not a transactional document.

### Edge Cases
Two families need merging after a duplicate household is discovered (`FR-023`, Could-have) — must preserve both families' billing history. A minor "ages into" having their own NIC — the guardian-NIC record must be re-keyed without breaking historical links.

### Best Practices
Block, don't just warn, on exact NIC duplicates; never hard-delete a patient with any transaction history; make the family picker default to "create new family" only when no existing family is selected, to avoid accidental orphan patients.

---

## 4. Appointment & Queue Module

### Purpose
Turns a verbal/paper waiting line into a real-time, disputable-proof state machine visible to reception and the doctor simultaneously.

### Business Logic
- Two entry paths into the queue: a **booked appointment** against a doctor's slot, or a **walk-in** added directly to today's queue with no pre-booked slot (`FR-026`).
- Double-booking the same doctor for an overlapping slot is rejected outright, not just warned (`FR-025`).
- Queue status is a **strict state machine**: `Waiting → Called → Consulting → Completed`, with no skipping except an explicit override + reason (`BR-05`).
- The live queue board auto-refreshes on reception and doctor screens without a manual page reload — this is a real-time push requirement, not a polling nice-to-have (`FR-028`).
- A doctor can **Skip** a called patient who doesn't respond; the skipped patient re-enters the queue rather than being dropped.

### Required Inputs
Patient (searched, not re-typed), doctor, time slot (or walk-in flag), receptionist creating the entry.

### Key DB Fields
```
appointments (appointment_id [PK], patient_id [FK], doctor_id [FK], scheduled_at,
              status ENUM(Waiting,Called,Consulting,Completed,Skipped), created_by)
```

### CRUD
Create (book/walk-in), Read (today's queue, per-doctor calendar), Update (status transitions, reschedule), rarely Delete (cancellations are a status, not a row removal).

### Validation Rules
No overlapping slot for the same doctor; status transitions must follow the defined sequence server-side, even if a stale client tries to skip a step.

### Permissions
`appointment.create`, `appointment.reschedule`, `appointment.status.update` (Doctor limited to their own queue — see Section 6 matrix).

### Relationships & Dependencies
Triggers Consultation creation on entering `Consulting`; notifies Billing when marked `Completed` (`FR-031`).

### API Endpoints
```
POST  /api/v1/appointments
PATCH /api/v1/appointments/{id}/status
GET   /api/v1/queue/today
```

### UI Components
Calendar/slot picker, live queue list with color-coded status chips, "Call Next Patient" button, skip/recall modal with reason capture, estimated-wait-time indicator (Could-have, `FR-030`).

### Search & Filters
By doctor, date, status, patient name/ID.

### Audit Logs
Every status transition logged with actor and timestamp; skip/recall reasons stored verbatim.

### Notifications
Reception notified the instant a consultation completes, so billing can start immediately (`FR-031`).

### Status Flow
`Waiting → Called → Consulting → Completed` (side-path: `Called → Skipped → Waiting` on no-response).

### Edge Cases
A walk-in arrives while a booked patient's slot is also due — both enter the same physical queue, ordered by arrival/call time, not by booking type. A doctor's console disconnects mid-consultation — the queue status must not silently regress.

### Best Practices
Enforce the state machine server-side, never trust a client to only send valid transitions; push queue updates over WebSockets so a waiting-room display stays accurate without refresh.

---

## 5. Consultation Module

### Purpose
The doctor's clinical workspace — history, vitals, diagnosis, and notes — finalized into an immutable record that everything downstream (prescriptions, billing, future visits) can trust.

### Business Logic
- On opening a `Consulting`-status patient, the system surfaces history, allergies, and chronic conditions **before** the doctor starts typing — this ordering matters for patient safety (`FR-032`).
- Vitals capture BP, temperature, pulse, weight, and height; **BMI is auto-calculated**, never hand-entered, to avoid transcription error.
- A consultation can be saved as a **Draft** and resumed later if the doctor is interrupted — it only becomes immutable once explicitly finalized.
- Once **Finalized**, a consultation may only be amended by the originating doctor or an Administrator, and every amendment is logged (`BR-08`, `FR-037`) — this is a hard rule, not a UI convenience.
- Diagnosis codes (ICD-10) are optional, not mandatory, to avoid slowing down a busy consultation.

### Required Inputs
Vitals (BP, temp, pulse, weight, height), diagnosis/complaint text, free-text notes, optional ICD-10 code, optional follow-up date, optional attachments (prior reports/images).

### Key DB Fields
```
consultations (consultation_id [PK], appointment_id [FK], vitals_json,
               allergies_ack BOOLEAN, diagnosis, notes,
               status ENUM(Draft,Finalized), created_at)
```

### CRUD
Create (on entering Consulting), Update (Draft is freely editable; Finalized requires the amendment path), no Delete (clinical records are permanent).

### Validation Rules
An allergy conflict with a to-be-prescribed medicine requires explicit doctor acknowledgement (`allergies_ack`) before the prescription can proceed (`FR-042`). A Finalized record cannot be silently overwritten — only the original doctor or an Admin can amend, and the amendment is logged.

### Permissions
`consultation.create`, `consultation.edit.own`, `consultation.amend` (Admin-only override), `consultation.view` (Read-only for Receptionist/Pharmacist).

### Relationships & Dependencies
Depends on: Appointment (must be `Consulting`), Patient history/allergies. Feeds: Prescription, Patient History Timeline, Queue status (marks `Completed`).

### API Endpoints
```
POST /api/v1/consultations
GET  /api/v1/patients/{patientId}/history
```

### UI Components
History/allergy panel (always visible, never a click-to-expand), vitals form with live BMI calculation, rich-text notes editor, allergy banner with blocking acknowledgement modal, attachment uploader.

### Search & Filters
By patient, doctor, date range, diagnosis keyword.

### Audit Logs
Every amendment to a Finalized consultation logs the field, old/new value, amending user, and timestamp — no exceptions, even for the Administrator.

### Notifications
None proactive from this module directly; it triggers the Queue-completion notification described in Section 4.

### Status Flow
`Draft → Finalized` (one-way; further changes go through the logged amendment path, not a status regression).

### Edge Cases
Doctor is interrupted mid-consultation and the patient is called away — Draft persists safely. Two browser tabs open on the same consultation — last-write-wins is not acceptable here; the UI must lock or warn on concurrent edit.

### Best Practices
Never let a Finalized consultation be edited through the same form as a Draft — force a distinct, logged "amend" action so the audit trail is unambiguous.

---

## 6. Prescription Module

### Purpose
Turns a doctor's decision into a structured, pharmacy-actionable, stock-validated order — the antidote to illegible handwritten prescriptions.

### Business Logic
- Medicine lookup is searchable by brand name, generic name, or category while building the prescription line-by-line (`FR-039`).
- **Real-time stock validation**: each line shows live stock status before the doctor can submit — an out-of-stock item is flagged, not silently allowed through (`FR-040`).
- A prescription **cannot be finalized** if it references an expired or discontinued medicine (`FR-046`) — this is a hard block, not a warning.
- Refill/repeat prescriptions can be marked as such, referencing a prior prescription for continuity (`FR-043`).
- On submission, the prescription **automatically routes** to the Pharmacy Queue with status `Pending` (`FR-045`) — there is no manual "send to pharmacy" step to forget.
- A printable/PDF prescription is generated bearing doctor name, registration number, and clinic letterhead (`FR-044`).

### Required Inputs
Consultation (source), one or more medicine lines each with dosage, frequency, duration, and administration route.

### Key DB Fields
```
prescriptions      (prescription_id [PK], consultation_id [FK],
                     status ENUM(Pending,Preparing,Dispensed,Collected), issued_at)
prescription_items (rx_item_id [PK], prescription_id [FK], medicine_id [FK],
                     dosage, qty, batch_id [FK, null until dispensed])
```

### CRUD
Create (from a Consulting-status visit only), Read (by pharmacy queue, by patient history), no Update after submission (a correction is a new prescription, not an edit to a submitted one), no Delete.

### Validation Rules
Every line must pass live stock/expiry validation before submission; an allergy conflict blocks submission pending doctor acknowledgement (shared logic with Consultation module); refill flag must reference a real prior prescription for the same patient.

### Permissions
`prescription.create` (Doctor, own patients only), `prescription.view` (all clinical/pharmacy roles), `prescription.dispense` (Pharmacist — see Pharmacy module).

### Relationships & Dependencies
Depends on: finalized/in-progress Consultation, Medicine catalog, Batch stock levels. Feeds: Pharmacy Queue, Patient History Timeline, Invoice (dispensed items become billing lines).

### API Endpoints
```
POST /api/v1/prescriptions
GET  /api/v1/medicines?search=
```

### UI Components
Search-as-you-type medicine picker, dosage/frequency/duration fields per line, per-line stock-status badge (green/amber/red), allergy warning modal, refill toggle, print-preview pane.

### Search & Filters
By patient, doctor, date, medicine, status.

### Audit Logs
Prescription creation and every status transition (via the Pharmacy module) are logged; the printed PDF itself is treated as a generated artifact, not a separately editable record.

### Notifications
None directly; triggers the Pharmacy Queue's incoming-prescription visibility.

### Status Flow
`Pending → Preparing → Dispensed → Collected` (owned end-to-end by this + the Pharmacy module — see Section 7).

### Edge Cases
A prescribed item has insufficient stock at the moment of prescribing — the doctor may substitute, reduce quantity, or proceed with the item flagged for pharmacist follow-up (does not block the whole prescription). A doctor prescribes a repeat of a medicine now discontinued — the refill is blocked, forcing a substitute decision.

### Best Practices
Validate stock in real time against the same ledger the pharmacist will allocate from, not a cached snapshot, to avoid a "looked fine at prescribing time, gone by dispensing time" gap; never allow a submitted prescription to be silently edited — corrections are a new prescription referencing the old one.

---

## 7. Pharmacy & Dispensing Module

### Purpose
The safety-critical last mile: turning a validated prescription into medicine actually handed to a patient, correctly batch-tracked and stock-deducted.

### Business Logic
- Incoming prescriptions display in a queue **ordered by submission time** — first in, first served (`FR-047`).
- Dispensing status is a strict state machine: `Pending → Preparing → Dispensed → Collected` (`BR-06`).
- For each line, the system suggests the batch to allocate using **First-Expiry-First-Out (FEFO)** by default (`FR-056`) — the pharmacist can override, but an override requires a documented reason (`BR-07`).
- The `Dispensed` transition is **blocked** if any line item fails stock or expiry validation at the moment of confirming (`FR-050`) — stock can shift between prescribing and dispensing, so this check runs again here, not just once upstream.
- **Partial dispensing** is allowed: some lines dispense now, the rest remain `Pending` for later (`FR-052`).
- Stock is deducted from the allocated batch **immediately** on successful dispensing (`FR-059`, `BR-04`) — there is no batch job or end-of-day reconciliation step for this.
- A dispensing label prints with medicine name, dosage instructions, and patient name (`FR-053`).

### Required Inputs
Prescription (from queue), confirmed batch per line, confirmed quantity per line, override reason (if FEFO is bypassed).

### Key DB Fields
```
-- reuses prescriptions / prescription_items from §6; batch allocation writes:
batches       (batch_id [PK], medicine_id [FK], batch_no, expiry_date, qty_on_hand, supplier_id [FK])
stock_ledger* (see §8 Inventory Module — every dispense writes a ledger row here)
```
*(The dispensing event is the primary producer of Inventory's stock ledger rows — see Section 8.)*

### CRUD
Create is implicit (a Pending prescription arriving); the module's real work is Update (status transitions + batch allocation); no Delete.

### Validation Rules
Batch must not be expired; batch quantity must be ≥ requested quantity (or partial-dispense applies); a manual FEFO override requires a non-empty reason field; the Dispensed transition re-validates stock at confirm-time, not just at queue-open time.

### Permissions
`pharmacy.queue.view`, `pharmacy.dispense`, `pharmacy.dispense.override-fefo` (may be restricted to senior pharmacists).

### Relationships & Dependencies
Depends on: Prescription (must be Pending/Preparing), Batch/Inventory stock. Feeds: Inventory stock ledger, Billing (dispensed items become invoice line items, `FR-070`).

### API Endpoints
```
GET  /api/v1/pharmacy/queue
POST /api/v1/pharmacy/dispense
GET  /api/v1/inventory/batches?medicineId=
```

### UI Components
Kanban board (Pending/Preparing/Dispensed/Collected columns), batch selector pre-sorted FEFO with expiry dates visible, quantity-confirm stepper, barcode-scan input for rapid batch identification, label print preview.

### Search & Filters
By patient, medicine, status, submission time.

### Audit Logs
Every dispense event logs the dispensing pharmacist, timestamp, and exact batch number against every line (`FR-051`) — this is both a clinical and a regulatory requirement.

### Notifications
A low-stock notification fires the moment a dispense drops a medicine's on-hand quantity below its reorder level — target latency under 1 minute (`FR-058`, acceptance criteria in Section 19 of the parent SRS).

### Status Flow
`Pending → Preparing → Dispensed → Collected` (blocked transition back to `Pending` on failed validation, not a silent stall).

### Edge Cases
The suggested FEFO batch turns out to be damaged on physical inspection — pharmacist selects the next-valid batch with a reason logged. A patient never returns to collect after `Dispensed` — the record sits at `Dispensed`, not auto-advanced to `Collected`, preserving an honest state.

### Best Practices
Re-validate stock and expiry at the moment of confirming dispense, not only when the queue entry was opened, since time passes between the two; never let stock deduction and status update be two separate, independently-failable steps — wrap them in one transaction.

---

## 8. Inventory Module

### Purpose
Single source of truth for medicine stock, batch, and expiry across the whole clinic — the pharmacy-grade backbone that makes FEFO and low-stock alerting possible.

### Business Logic
- **Stock is tracked at batch level**, not just medicine level: batch number, manufacture date, expiry date, and quantity on hand (`FR-055`).
- A full stock ledger (movement history) is kept per batch for audit purposes (`FR-063`) — every dispense, adjustment, and goods-received event is a row, not an overwrite of a running total.
- Manual stock deduction can never take a batch below zero, and any manual adjustment requires a documented reason (`FR-060`) — this closes the loophole that ledger-based systems must guard against.
- Expiry alerts fire for any batch nearing expiry within a configurable threshold, default 90 days (`FR-057`).
- Low-stock notifications fire when a medicine's on-hand quantity (summed across its batches) falls below its configured reorder level (`FR-058`).
- Stock-take / physical count reconciliation compares counted vs. system quantity and produces a variance report (`FR-061`).
- Barcode/QR scanning is supported for rapid batch identification during goods receipt and dispensing (`FR-062`).

### Required Inputs
Medicine master data (generic name, brand, form, unit, reorder level), batch receipts (from GRN — see Section 9), manual adjustment entries (quantity + reason).

### Key DB Fields
```
medicines (medicine_id [PK], name, generic_name, form, unit, reorder_level, is_active)
batches   (batch_id [PK], medicine_id [FK], batch_no, expiry_date, qty_on_hand, supplier_id [FK])
```
*(A dedicated append-only `stock_ledger` table, per Section 15's design principles, records every quantity-changing event — dispense, GRN receipt, adjustment, stock-take correction — referencing the batch and a reason/reference document.)*

### CRUD
Medicine catalog: standard CRUD by Admin/Pharmacist. Batches: Create via GRN, Update only via a ledger-writing event (dispense, adjustment, count correction) — never a direct quantity edit. No Delete on a batch with any movement history.

### Validation Rules
Expiry date is mandatory on every batch; quantity on hand can never go negative; a manual adjustment without a reason code is rejected; stock-take variances beyond a configurable threshold should require a second-level review before posting.

### Permissions
`inventory.view`, `inventory.medicine.manage` (Admin), `inventory.batch.manage` (Pharmacist), `inventory.adjust` (reason-coded, logged), `inventory.count.perform`.

### Relationships & Dependencies
Depends on: Supplier/Purchase (GRN creates batches), Pharmacy (dispense deducts stock). Feeds: Prescription (live stock validation), Reports (stock valuation, top-dispensed medicines), Dashboard alerts.

### API Endpoints
```
GET /api/v1/inventory/batches?medicineId=
GET /api/v1/inventory/alerts
```

### UI Components
Medicine catalog table, batch table with expiry/low-stock color coding, stock-take entry sheet (barcode-scan friendly), manual adjustment modal with mandatory reason field, stock ledger drill-down view per batch.

### Search & Filters
By medicine, expiry range, stock status (in-stock/low/out), supplier, batch number.

### Audit Logs
Every stock-affecting event writes to the ledger by design — the ledger *is* the audit log for this module, not a separate overlay.

### Notifications
Low-stock alert to the pharmacist dashboard; expiry alert at the configured threshold (default 90 days); both drive the "Suggested Purchase" flow in Section 9.

### Status Flow
Not a document-status workflow — batches move through a lifecycle of `Received → Active (on-hand > 0) → Depleted/Expired`, tracked implicitly via ledger balance and expiry date rather than an explicit status field.

### Edge Cases
A batch is discovered expired during a stock-take before the automated 90-day alert fired (data-entry error on expiry date) — corrected via a reason-coded adjustment, not a silent edit. Two pharmacists dispense from the same batch at nearly the same moment — the ledger's append-only, transactional nature prevents a lost update.

### Best Practices
Treat "current stock" as always `SUM(ledger movements)` for a batch, never a mutable field trusted on its own; make reorder-level and expiry-threshold configuration self-service for the Administrator (`FR-088`) rather than a code change.

---

## 9. Supplier & Purchase Order Module

**Purpose:** Manage the procure-to-restock cycle from a low-stock alert through to new batches landing on the shelf.

**Business Logic:** The chain is `Draft PO → Submitted → Partially Received → Received → Closed` (`FR-066`). Reorder quantities can be auto-suggested from medicines currently flagged low-stock (`FR-067`). A **Goods Received Note (GRN)** against a PO is what actually creates new stock batches, capturing batch number and expiry date (`FR-068`) — the PO itself is a commercial commitment, not a stock event, mirroring the separation used in larger ERP systems. Discrepancies between ordered and received quantities are flagged for Administrator review rather than silently accepted (`FR-069`).

**Key DB Fields:**
```
suppliers       (supplier_id [PK], name, contact, address)
purchase_orders (po_id [PK], supplier_id [FK], order_date,
                 status ENUM(Draft,Submitted,PartiallyReceived,Received,Closed), created_by)
```
*(GRN line items reference the PO and create rows in `batches`, per Section 8.)*

**Permissions:** `supplier.manage` (Admin), `purchase-order.create` / `.receive` (Pharmacist), `purchase-order.discrepancy.review` (Admin). **API:** `POST /api/v1/purchase-orders`, `POST /api/v1/purchase-orders/{id}/grn`. **Status Flow:** `Draft → Submitted → Partially Received → Received → Closed`. **Edge Cases:** a supplier delivers a different batch/expiry than what was ordered — accepted via GRN as its own batch record, not forced to match the PO line. **Best Practice:** never let a batch be created without a GRN reference, so every unit of stock in the system traces back to a purchase document.

---

## 10. Billing Module

**Purpose:** Unify the consultation fee and every dispensed medicine charge from one visit into a single, reconcilable invoice — closing the "two separate bills" gap identified in the clinic's original problem statement.

**Business Logic:** One consolidated invoice per visit combines the consultation fee and all dispensed-item charges (`FR-070`, `BR` intent behind Objective O5). Payments support cash, card, and mobile methods, with partial/split payments recorded against the same invoice (`FR-071`). Configurable discount rules (senior citizen, staff, insurance) apply at line or total level (`FR-072`). Voiding an invoice requires Administrator approval and a documented reason — never a self-service delete (`FR-075`, `BR-09`). Daily cash/card totals reconcile against recorded payments for end-of-day closing (`FR-076`).

**Key DB Fields:**
```
invoices (invoice_id [PK], patient_id [FK], prescription_id [FK, nullable],
          total_amount, payment_status ENUM(Outstanding,Paid,Voided), created_at)
```

**Permissions:** `billing.create`, `billing.discount.apply`, `billing.void` (Admin-approval required), `billing.reconcile`. **API:** `POST /api/v1/invoices`, `POST /api/v1/invoices/{id}/payments`, `POST /api/v1/invoices/{id}/void`. **Status Flow:** `Outstanding → Paid` (or `Outstanding → Partially Paid → Paid`); `Paid/Outstanding → Voided` (Admin-approved only). **Edge Cases:** a patient pays part now and the rest later — invoice stays `Outstanding` with a running paid-to-date total; a voided invoice must reverse both the financial record and, if applicable, flag the associated dispensed stock for review (was medicine physically returned or not?). **Best Practice:** never allow a Paid invoice to be edited directly — corrections go through the formal void-and-reissue path, preserving the same audit integrity principle used for Consultations.

---

## 11. Reports Module

**Purpose:** Give every role — Admin, Doctor, Pharmacist — the numbers they need, filtered and exportable, without needing to query the live transactional tables directly.

**Design principle:** Dashboard and report figures are computed from the same underlying ledgers (stock, invoices, consultations) that drive daily operations, so a report for any past date reconciles exactly with what actually happened — never a separately-maintained "reporting copy" that can drift out of sync (Section 19 acceptance criteria: "Dashboard and report figures reconcile exactly with underlying transactional data").

**Representative report catalog:**

| Role | Example Reports |
|---|---|
| Administrator | Daily patient volume, revenue, top-dispensed medicines, audit log search |
| Doctor | Personal consultation counts, follow-up due list |
| Pharmacist | Low-stock items, expiring batches, today's dispensing volume |
| All (shared) | Date-range comparisons (this month vs. last month), PDF/Excel export |

**Best Practice:** every export is either watermarked or logged to trace potential patient-data leakage (`SEC-11`); report visibility is role-gated exactly per the Section 6 permission matrix — a Doctor never sees pharmacy cost data, a Pharmacist never sees another doctor's private consultation notes.

---

## 12. Settings & Security Modules

**Settings:** Clinic profile (name, address, logo, registration number used on every printout), configurable reorder levels and expiry-alert thresholds, consultation fee schedules, and master data lists (medicine categories, payment methods, discount types) — all Administrator-editable without a code deployment (`FR-087`, `FR-088`, `FR-091`). Scheduled daily automatic backups with restore verification are mandatory, not optional (`FR-090`).

**Security:** Role-Based Access Control (RBAC) enforced at both the UI and API layer — never trust the frontend alone (`NFR-07`, `SEC-04`). Passwords are salted-hashed (bcrypt/argon2), never logged in plaintext (`FR-003`). Accounts lock after 5 consecutive failed attempts (`FR-004`); optional two-factor authentication is available for Administrator accounts (`FR-008`). Every create/update/delete on a clinical or financial record is captured in an immutable, searchable audit log (`FR-089`, `SEC-06`). Sensitive PII/PHI is encrypted at rest (`SEC-05`).

---

## 13. Technology Stack & Architecture

**Frontend:** React single-page application, built with Vite, using React Router for navigation and TanStack Query for server-state fetching/caching, styled with Tailwind CSS, with a Socket.IO client for real-time queue and pharmacy-queue updates.

**Backend:** Node.js + Express REST + WebSocket API. Because Express does not impose a module system, the codebase is organized as one feature folder per functional module (auth, patients, families, appointments, consultations, prescriptions, pharmacy, inventory, suppliers, billing, reports, settings), each with its own router/controller/service/repository files — preserving modular boundaries by convention.

**Data layer:** Prisma ORM shared across two deployment profiles:

| Profile | Database | Best suited to |
|---|---|---|
| On-Premise / Local | SQLite (single embedded file) | A single clinic workstation or pilot rollout with limited/unstable internet |
| Cloud / Hosted | PostgreSQL (managed instance) | Production rollout with multiple concurrent staff, and the base for any future multi-branch phase |

**Supporting libraries:** Passport.js + JWT (auth), Zod (validation middleware), node-cron (scheduled expiry/low-stock/backup jobs), BullMQ + Redis (cloud-only background jobs), PDFKit/Puppeteer (prescriptions, receipts, labels), ExcelJS (report export), Multer (file uploads), html5-qrcode + bwip-js/JsBarcode (barcode/QR), Nodemailer (email), swagger-jsdoc/swagger-ui-express (API docs), Helmet + express-rate-limit (security headers, brute-force protection), Docker + Nginx (containerization/TLS), GitHub Actions (CI/CD).

**Concurrency caveat:** SQLite serializes writes at the file level. It is adequate for a single-workstation deployment, but once reception, doctor, and pharmacist are writing concurrently from separate machines, enable WAL mode at minimum and treat PostgreSQL as the recommended default.

---

## 14. Database Design Guide

### Design Principles
1. **Append-only ledgers for anything financial or stock-related** (`stock_ledger`, `patient_change_log`, `audit_log`) — corrections are new rows, never silent UPDATE/DELETE, giving a perfect audit trail by construction.
2. **Soft deletes on master data** (`is_active` on Patient, Medicine) so historical invoices/prescriptions referencing them never break.
3. **Every transactional table** carries `created_at` and `created_by`; clinical tables additionally carry an amendment log rather than allowing silent overwrite.
4. **Normalized master data** (Patient, Family, Medicine, Supplier) to avoid update anomalies; **the ledger tables** are the source of truth for anything computed (current stock, invoice totals), not a cached field trusted in isolation.
5. **Indexes** on the columns every module filters by: `(nic)` unique on patients, `(medicine_id, expiry_date)` on batches for fast FEFO lookup, `(status, created_at)` on appointments/prescriptions for queue ordering.

### Core Entity-Relationship Overview (ASCII)
```
families ──< patients ──< appointments ──< consultations ──< prescriptions ──< prescription_items ──> medicines
                                                                    │                                      │
                                                                    │                                stocked as
                                                                    ▼                                      ▼
                                                                invoices                                batches ──> suppliers
                                                                                                            │
                                                                                                     supplied via
                                                                                                            │
                                                                                                    purchase_orders

users (staff) ──< audit_log
```

### Table Categories
| Category | Examples | Delete Policy |
|---|---|---|
| **Master (rarely change)** | families, medicines, suppliers | Soft delete (`is_active`) |
| **Clinical (append/amend-only)** | consultations, prescriptions | Never delete; amendments logged |
| **Transactional** | appointments, invoices, purchase_orders | Status-driven, never row-deleted |
| **Ledger** | stock_ledger, patient_change_log, audit_log | Append-only, immutable |

### Constraints & Integrity
Foreign keys enforced at the database level between every transaction line and its master data; `CHECK` constraints for non-negative batch quantities; unique constraint on `patients.nic`; a batch's `qty_on_hand` must never go below zero at the database layer, not just in application code.

---

## 15. UI/UX Design Specification

**Layout:** persistent left-hand module menu, top bar showing logged-in user/role, global patient search always accessible. **Dashboard:** role-specific KPI cards (Admin sees revenue/volume; Doctor sees follow-ups due; Pharmacist sees low-stock/expiry), with a live queue-length alert.

**Forms:** tabbed detail pages for complex entities (Patient: Demographics/Family/History/Allergies) to avoid a single long scroll; inline, real-time field validation.

**Data Grids:** pagination, sorting, and free-text search on every list view; destructive actions (delete, void invoice) always require a confirmation dialog stating the consequence.

**Consultation & Prescription screens:** history/allergy panel always visible (not click-to-expand), search-as-you-type medicine picker, live per-line stock-status badges.

**Pharmacy screens:** Kanban board for the dispensing queue, FEFO-sorted batch selector with expiry visibly color-coded, barcode-scan input field.

**Color Convention:** green = success/available, amber = warning/low-stock or nearing expiry, red = blocked/expired/error — applied consistently across every screen, not just Inventory.

**Accessibility:** WCAG 2.1 AA color-contrast and full keyboard navigation on all core clinical workflows.

**Mobile/Tablet:** responsive down to tablet width for reception and doctor use; the dispensing screen is tablet-friendly for barcode-scan workflows at the pharmacy counter.

---

## 16. Development Roadmap

### Phase 1 — MVP (Single Clinic, Core Workflow)
Authentication + RBAC, Patient + Family registration with NIC de-duplication, Appointment booking + walk-in queue, Doctor Consultation workspace, Electronic Prescription with stock validation, Pharmacy dispensing with FEFO, basic Inventory (batch/expiry), consolidated Billing, Admin/Doctor/Pharmacist dashboards. **Goal:** replace the clinic's paper registers end-to-end for one branch.

### Phase 2 — Depth & Safety Hardening
Full Supplier/Purchase Order cycle with GRN discrepancy review, stock-take/physical count reconciliation, barcode/QR scanning at goods-receipt and dispensing, report scheduler (email delivery), two-factor authentication for Admin, cloud/PostgreSQL deployment profile for multi-user concurrency.

### Phase 3 — Future Enhancements (explicitly out of scope for Phase 1)
Online/public self-service appointment booking, WhatsApp/SMS reminders, native mobile apps, AI-assisted clinical decision support (e.g., drug interaction checking), full laboratory test ordering/results integration, multi-branch consolidated operation and reporting.

### Risk Analysis
The highest-risk technical area is **stock/expiry data integrity at the dispense moment** — mitigated by re-validating batch expiry and quantity inside the same transaction that deducts stock, never trusting a value fetched even a few seconds earlier. The highest-risk product area is **clinical record immutability** — mitigated by the hard rule that a Finalized consultation can only be changed through a logged amendment, never a plain edit.

### Testing Strategy
Unit tests on FEFO batch-selection logic, NIC de-duplication, and RBAC middleware (these are the most safety- and audit-sensitive); integration tests across the full document chain (Appointment → Consultation → Prescription → Dispense → Invoice); load testing on the live queue and dispensing endpoints; UAT with the actual clinic staff (receptionist, doctor, pharmacist) before go-live, per the acceptance criteria in the parent SRS.

---

*End of specification. This document is intended as a living artifact — update module sections as detailed engineering design (exact API contracts, field lists) is finalized during each development phase.*
