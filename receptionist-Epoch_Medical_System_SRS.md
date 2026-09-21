# E-Poch Medical System
## Software Requirements Specification — Receptionist Role
**Derived from:** E-Poch Medical System SRS v4.0 (30 July 2026) and the combined Module Deep-Dive Specification
**Scope of this document:** Every module, screen, API, business rule, and acceptance criterion relevant to the **Receptionist** role only. Admin/Doctor/Pharmacist-only detail is intentionally omitted — see the parent SRS for full system coverage.
**Confirmed technology stack:** React (frontend SPA) • Node.js + Express (backend API) • Prisma ORM • SQLite (on-premise) / PostgreSQL (cloud)

---

## 1. Role Summary

The Receptionist owns the **front desk**: turning a patient's arrival into a registered, de-duplicated record; getting them into the day's queue; and closing out the visit financially once the doctor and pharmacist are done. The Receptionist is the first and last point of contact for every visit.

**Primary responsibilities:**
- Register new patients and manage family groupings
- Search for existing patients and detect duplicates
- Book appointments and manage walk-ins
- Operate the front-desk side of the live queue
- Generate consolidated invoices and record payments
- View operational (non-clinical) reports

---

## 2. Permission Matrix (Receptionist row, Section 6 of parent SRS)

| Module | Access |
|---|---|
| User & Role Management | No access |
| Patient Registration | Create, Read, Update, Delete (CRUD) |
| Family Management | CRUD |
| Appointments & Queue | CRUD |
| Consultation Records | Read (limited) |
| Prescriptions | Read only |
| Pharmacy Queue / Dispensing | Read only |
| Inventory & Batches | No access |
| Suppliers & Purchase Orders | No access |
| Billing & Invoices | Create, Read, Update (no delete/void) |
| Reports & Dashboards | Operational reports only |
| System Settings & Audit Log | No access |

**Role description (verbatim from parent SRS, Section 6.1):** Registers patients and families, schedules appointments, manages the front-desk queue, and initiates billing.

---

## 3. Sidebar / Menu — Receptionist View

```
📊 Dashboard
   └─ Operational widgets: Today's Queue Snapshot, Follow-ups scheduling view

🧑‍🤝‍🧑 Patients
   ├─ All Patients
   ├─ Register New Patient
   ├─ Duplicate / Near-Duplicate Review Queue
   └─ Patient Photo Capture

👨‍👩‍👧 Families
   ├─ Family Directory
   ├─ Family Member Roster
   ├─ Head of Family Assignment
   └─ Family Merge Tool

📅 Appointments & Queue
   ├─ Book Appointment
   ├─ Walk-in / Add to Queue
   ├─ Live Queue Board
   └─ Skip / Recall Log (view)

💵 Billing
   ├─ Consolidated Invoice (consultation + dispensed items)
   ├─ Payments (cash/card/mobile, split payments)
   ├─ Discounts (senior citizen, staff, insurance)
   ├─ Outstanding Balances / Partial Settlement
   └─ End-of-Day Cash Reconciliation

📈 Reports
   └─ Operational reports (patient volume, queue throughput) — no financial P&L or inventory data
```

---

## 4. Applicable Functional Requirements

### 4.1 Patient Registration (FR2)
| ID | Requirement | Priority |
|---|---|---|
| FR-009 | Capture patient demographics: full name, NIC/passport, DOB, gender, phone, address, blood group. | M |
| FR-010 | Validate NIC uniqueness at entry; block registration on duplicate NIC. | M |
| FR-011 | Auto-generate a unique, human-readable Patient ID (e.g., PT000123). | M |
| FR-012 | Support minor registration using guardian NIC + DOB as an alternate key. | M |
| FR-013 | Capture known allergies and chronic conditions at registration. | S |
| FR-014 | Support editing patient demographic data with full change history retained. | M |
| FR-015 | Support patient photo capture/upload for positive identification. | C |
| FR-016 | Search patients by NIC, name, phone, or Patient ID, returning results in under 2 seconds. | M |
| FR-017 | Flag possible near-duplicate patients (fuzzy name + DOB match) for receptionist review even when NIC differs. | S |

### 4.2 Family Management (FR3)
| ID | Requirement | Priority |
|---|---|---|
| FR-018 | Allow grouping multiple patients under a single Family record. | M |
| FR-019 | Each patient belongs to exactly one family; each family may contain many patients. | M |
| FR-020 | Designate a Head of Family for billing and contact purposes. | M |
| FR-021 | View all members and combined visit/billing history of a family from one screen. | S |
| FR-022 | Move a patient from one family to another with an audit record of the change. | S |
| FR-023 | Merge two family records where a duplicate family entry is discovered. | C |

### 4.3 Appointment Scheduling & Queue Management (FR4)
| ID | Requirement | Priority |
|---|---|---|
| FR-024 | Book, reschedule, and cancel appointments against a doctor's available slots. | M |
| FR-025 | Prevent double-booking of the same doctor for overlapping time slots. | M |
| FR-026 | Support walk-in patients added directly to the day's queue without a pre-booked slot. | M |
| FR-027 | Maintain queue status per the state machine: Waiting → Called → Consulting → Completed. | M |
| FR-028 | Display a live, auto-refreshing queue board visible to reception and doctor screens. | S |
| FR-030 | Compute and display estimated waiting time based on average consultation duration. | C |
| FR-031 | Notify reception when a consultation is marked Completed so billing can proceed. | M |

### 4.4 Billing, Invoices & Payments (FR10)
| ID | Requirement | Priority |
|---|---|---|
| FR-070 | Generate a single consolidated invoice per visit combining consultation fee and dispensed medicine charges. | M |
| FR-071 | Support cash, card, and mobile-payment methods with partial and split payments. | M |
| FR-072 | Apply configurable discount rules (senior citizen, staff, insurance) at line or total level. | S |
| FR-073 | Generate a printable/PDF receipt immediately upon payment confirmation. | M |
| FR-074 | Track outstanding balances and support recording of later/partial settlements. | S |
| FR-076 | Reconcile daily cash/card totals against recorded payments for end-of-day closing. | S |

> **Note:** FR-075 (invoice void/refund) requires Administrator approval and is **not** a Receptionist-initiated action — the Receptionist may request a void but cannot approve or execute it.

---

## 5. Module Deep-Dives

### 5.1 Patient & Family Module

**Business Logic:** NIC is the primary de-duplication key — registration is *blocked*, not just warned, on an exact match. Minors without a NIC use guardian NIC + DOB. A fuzzy name+DOB match with a different NIC is *flagged for the receptionist to review*, not auto-blocked — this is a judgment call the Receptionist makes, not the system. Every patient belongs to exactly one Family (`BR-01`), and one member is designated Head of Family for consolidated billing.

**Receptionist workflow:**
1. Enter NIC → system checks for duplicates in real time.
2. If unique, remaining fields unlock; if duplicate, the existing record is shown for verification.
3. Enter demographics, allergies (optional), link to existing family or create a new one.
4. Submit → system generates Patient ID and confirms.

**Key DB fields:** `patients(patient_id, family_id, nic, guardian_nic, full_name, dob, gender, phone, blood_group, allergies, is_active)`, `families(family_id, family_name, head_patient_id, address, contact_no)`.

**API:**
```
GET  /api/v1/patients?search=
POST /api/v1/patients
PUT  /api/v1/patients/{patientId}
GET  /api/v1/families/{familyId}
POST /api/v1/families/{familyId}/merge
```

**Edge cases the Receptionist will encounter:** two families need merging after a duplicate household is found (`FR-023`); a minor "ages into" having their own NIC and the guardian-NIC record must be re-keyed without breaking historical links.

---

### 5.2 Appointment & Queue Module

**Business Logic:** Two entry paths into the queue — a booked appointment against a doctor's slot, or a walk-in added directly to today's queue (`FR-026`). Double-booking the same doctor is rejected outright (`FR-025`). Queue status is a strict state machine (`Waiting → Called → Consulting → Completed`) enforced server-side; the Receptionist cannot skip a step manually. The live queue board pushes updates in real time so reception always sees current status without refreshing (`FR-028`).

**Receptionist workflow:**
1. Search for the patient by NIC, name, or Patient ID.
2. Select an available doctor/slot, or mark as walk-in.
3. System validates no conflicting booking exists.
4. Appointment enters the queue as `Waiting`.
5. When the doctor marks a consultation `Completed`, reception is notified to begin billing (`FR-031`).

**API:**
```
POST  /api/v1/appointments
PATCH /api/v1/appointments/{id}/status
GET   /api/v1/queue/today
```

**Edge cases:** a walk-in arrives while a booked patient's slot is also due — both enter the same physical queue ordered by arrival/call time, not booking type.

---

### 5.3 Billing Module

**Business Logic:** One consolidated invoice per visit combines the consultation fee and all dispensed-medicine charges — this closes the "two separate bills" gap that was one of the clinic's original problems (`FR-070`, Objective O5). Payments support cash, card, and mobile methods, with partial/split payments recorded against the same invoice (`FR-071`). Discounts (senior citizen, staff, insurance) apply at the line or total level (`FR-072`). **Voiding an invoice requires Administrator approval and a documented reason — this is never a Receptionist self-service action** (`FR-075`, `BR-09`).

**Receptionist workflow:**
1. System auto-generates the consolidated invoice once consultation + any dispensing are complete.
2. Receptionist applies any configured discount.
3. Receptionist records payment method(s) and amount(s).
4. On full payment, invoice is marked `Paid` and a printable receipt is generated.
5. Partial payment keeps the invoice `Outstanding` with a running paid-to-date total.
6. At day's end, the Receptionist reconciles cash/card totals against recorded payments (`FR-076`).

**Key DB fields:** `invoices(invoice_id, patient_id, prescription_id, total_amount, payment_status, created_at)`.

**API:**
```
POST /api/v1/invoices
POST /api/v1/invoices/{id}/payments
```
*(`POST /api/v1/invoices/{id}/void` exists but is gated to Administrator approval — not a Receptionist-callable action in practice, even though the endpoint may be technically reachable; UI must not expose a void button to this role.)*

**Best Practice:** never allow a Paid invoice to be edited directly — corrections go through the formal void-and-reissue path, which requires escalation to an Administrator.

---

## 6. Relevant Use Cases (full text, from parent SRS Section 11)

### UC-01: Register a New Patient
**Actor:** Receptionist
**Preconditions:** Receptionist is logged in with a valid session.
**Trigger:** A new (previously unregistered) patient arrives at the clinic.

**Main Success Scenario:**
1. Receptionist selects "New Patient Registration".
2. Receptionist enters NIC number; system checks for duplicates.
3. System confirms NIC is unique and enables the remaining fields.
4. Receptionist enters name, DOB, gender, phone, address, blood group.
5. Receptionist links the patient to an existing family or creates a new one.
6. Receptionist submits the form.
7. System generates a unique Patient ID and saves the record.
8. System displays a confirmation with the new Patient ID.

**Alternate/Exception Flows:** duplicate NIC blocks submission and shows the existing record; minors use guardian NIC + DOB; incomplete mandatory fields block submission with inline errors.

**Postconditions:** A new patient record exists with a unique Patient ID, linked to a family, and searchable system-wide.

---

### UC-02: Book an Appointment and Manage the Queue
**Actors:** Receptionist, Doctor
**Preconditions:** Patient is registered.
**Trigger:** Patient requests an appointment or arrives as a walk-in.

**Main Success Scenario:**
1. Receptionist searches for the patient by NIC, name, or Patient ID.
2. Receptionist selects an available doctor/slot, or "Walk-in — add to today's queue".
3. System validates no conflicting booking for that doctor/slot.
4. System creates the appointment (status `Waiting`) and adds it to the live queue.
5. Doctor calls "Next Patient" → status `Called`, then `Consulting`.
6. On completion, status becomes `Completed` and the Receptionist is notified for billing.

**Alternate/Exception Flows:** conflicting slot → system suggests next available; patient doesn't respond when Called → doctor marks Skipped, patient re-enters queue.

**Postconditions:** The queue accurately reflects real-time patient status for reception and doctor.

---

### UC-06: Generate Invoice and Record Payment
**Actors:** Receptionist, Pharmacist
**Preconditions:** Consultation status is Completed; any dispensed pharmacy items are recorded.
**Trigger:** Patient proceeds to settle payment.

**Main Success Scenario:**
1. System auto-generates a consolidated invoice (consultation fee + dispensed medicine charges).
2. Receptionist applies any applicable discount.
3. Receptionist selects payment method(s) and records amount(s) received.
4. System confirms full payment and marks the invoice Paid.
5. System generates a printable/PDF receipt.

**Alternate/Exception Flows:** partial payment → invoice stays Outstanding; void requires Administrator approval with a documented reason before the invoice is reversed.

**Postconditions:** A finalized invoice and payment record exist, linked to the patient's history timeline and the daily billing report.

---

## 7. Relevant User Stories

| ID | User Story | Acceptance Criteria (summary) |
|---|---|---|
| US-01 | As a Receptionist, I want to be warned immediately if a NIC already exists, so that I never create duplicate patient records. | Duplicate NIC entry is blocked with an on-screen match to the existing record. |
| US-02 | As a Receptionist, I want to add a walk-in patient directly to today's queue, so that I don't need to create a formal appointment slot. | Walk-in patient appears in the queue with status Waiting within 2 seconds. |
| US-08 | As a Receptionist, I want a single consolidated invoice per visit, so that patients don't receive separate consultation and pharmacy bills. | One invoice number covers all consultation and dispensed-item charges for a visit. |

---

## 8. UI Screens (Receptionist-facing)

| Screen | Key Elements |
|---|---|
| Login | Username/password, "forgot password" link |
| Dashboard | Today's queue snapshot, appointment overview |
| Patient Registration | NIC live-validation field, demographic form, family picker/creator |
| Family Management | Family list, member roster, head-of-family selector |
| Appointment & Queue Board | Calendar/slot picker, live queue list with status chips, call-next visibility |
| Billing / Invoice | Line-item summary, discount entry, payment method selector, print receipt |
| Patient History Timeline | Read-only chronological feed (for context when patients ask about past visits) |

**General UI guidelines applicable:** persistent left-hand module menu and top-bar showing logged-in user/role; inline real-time form validation; destructive actions require confirmation dialogs; all list views support pagination, sorting, and free-text search; color coding — green = success/available, amber = warning, red = blocked/expired/error.

---

## 9. API Endpoints Summary (Receptionist scope)

```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/patients?search=
POST   /api/v1/patients
PUT    /api/v1/patients/{patientId}
GET    /api/v1/families/{familyId}
POST   /api/v1/families/{familyId}/merge
POST   /api/v1/appointments
PATCH  /api/v1/appointments/{id}/status
GET    /api/v1/queue/today
POST   /api/v1/invoices
POST   /api/v1/invoices/{id}/payments
GET    /api/v1/reports/dashboard?role=receptionist
```

All endpoints require an authenticated session and enforce RBAC server-side per Section 6 — never trust the frontend alone.

---

## 10. Business Rules Applicable to This Role

| ID | Rule |
|---|---|
| BR-01 | One patient belongs to exactly one family; one family may contain many patients. |
| BR-02 | Duplicate NIC numbers are not permitted across the patient database. |
| BR-05 | Patient queue status must progress strictly through Waiting → Called → Consulting → Completed. |
| BR-09 | An invoice may not be voided without Administrator approval and a documented reason. |

---

## 11. Security Requirements Applicable

- All traffic over HTTPS/TLS 1.2+ (`SEC-01`).
- Passwords salted-hashed; account locks after 5 failed logins (`SEC-02`, `SEC-08`).
- RBAC enforced server-side on every endpoint the Receptionist touches, not just hidden in the UI (`SEC-04`).
- Every create/update on a patient, family, appointment, or invoice writes an audit-log entry (`SEC-06`).
- Data exports containing patient data are watermarked/logged if the Receptionist role is granted export access (`SEC-11`).

---

## 12. Acceptance Criteria (Receptionist-relevant subset)

| Feature Area | Acceptance Criteria |
|---|---|
| Patient Registration | A duplicate NIC is rejected 100% of the time with a clear message; a unique Patient ID is generated for every valid new registration. |
| Queue Management | Queue status transitions strictly follow the defined sequence and are visible in real time to reception. |
| Billing | Every completed visit with a prescription produces exactly one consolidated invoice; invoice totals reconcile to the sum of consultation fee plus dispensed item charges. |

---

*This document is a role-scoped extract of the parent E-Poch Medical System SRS v4.0. For system-wide requirements, security specification, database dictionary, and the Doctor/Pharmacist/Admin views, refer to the parent SRS and its companion Doctor and Pharmacist SRS documents.*
