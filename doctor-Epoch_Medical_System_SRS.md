# E-Poch Medical System
## Software Requirements Specification — Doctor Role
**Derived from:** E-Poch Medical System SRS v4.0 (30 July 2026) and the combined Module Deep-Dive Specification
**Scope of this document:** Every module, screen, API, business rule, and acceptance criterion relevant to the **Doctor** role only. Admin/Receptionist/Pharmacist-only detail is intentionally omitted — see the parent SRS for full system coverage.
**Confirmed technology stack:** React (frontend SPA) • Node.js + Express (backend API) • Prisma ORM • SQLite (on-premise) / PostgreSQL (cloud)

---

## 1. Role Summary

The Doctor owns the **clinical core** of the system: conducting the consultation, recording vitals and notes, and issuing the electronic prescription that everything downstream (pharmacy, billing) depends on. The consultation record, once finalized, is treated as close to immutable as a medical record should be.

**Primary responsibilities:**
- Review patient history, allergies, and chronic conditions before treating
- Record vitals, diagnosis, and clinical notes per visit
- Issue electronic prescriptions with live stock validation
- Manage their own position in the queue (call next, skip/recall)
- View personal consultation and follow-up reports

---

## 2. Permission Matrix (Doctor row, Section 6 of parent SRS)

| Module | Access |
|---|---|
| User & Role Management | No access |
| Patient Registration | Read only |
| Family Management | Read only |
| Appointments & Queue | Read, Update (own queue only) |
| Consultation Records | Create, Read, Update, Delete (own records only) |
| Prescriptions | Create, Read, Update, Delete (own) |
| Pharmacy Queue / Dispensing | Read only |
| Inventory & Batches | Read only |
| Suppliers & Purchase Orders | No access |
| Billing & Invoices | Read only |
| Reports & Dashboards | Clinical / own reports only |
| System Settings & Audit Log | No access |

**Role description (verbatim from parent SRS, Section 6.1):** Conducts consultations, records vitals/history/allergies/notes, and issues electronic prescriptions. Can view historical records of their own patients.

---

## 3. Sidebar / Menu — Doctor View

```
📊 Dashboard
   ├─ My Consultation Counts
   └─ Follow-ups Due Widget

📅 Appointments & Queue
   ├─ Live Queue Board (read)
   ├─ Doctor Call-Next Console
   └─ Skip / Recall (own patients)

🩺 Consultations
   ├─ Consultation Workspace
   ├─ Vitals Entry (BP, Temp, Pulse, Weight, Height, BMI)
   ├─ Clinical Notes & Diagnosis (ICD-10 optional)
   ├─ Allergy & Chronic Condition Flags
   └─ Consultation Amendment Log (own records)

💊 Prescriptions
   ├─ Prescription Builder
   ├─ Medicine Lookup (name/generic/category)
   ├─ Allergy Conflict Warnings
   ├─ Refill / Repeat Prescription
   └─ Printable Prescription (PDF)

🧑‍🤝‍🧑 Patients (read-only)
   └─ Patient History Timeline

📈 Reports
   └─ Doctor Dashboard (personal consultation counts, follow-up due lists)
```

---

## 4. Applicable Functional Requirements

### 4.1 Doctor Consultation (FR5)
| ID | Requirement | Priority |
|---|---|---|
| FR-032 | Present the doctor with the patient's consultation history, allergies and chronic conditions at the start of a visit. | M |
| FR-033 | Allow capturing vital signs (BP, temperature, pulse, weight, height); BMI auto-calculated. | M |
| FR-034 | Allow free-text and structured clinical notes (diagnosis, complaint, examination findings) per visit. | M |
| FR-035 | Allow attaching diagnosis codes (e.g., ICD-10) to a consultation record. | S |
| FR-036 | Allow recording follow-up instructions and a recommended review date. | S |
| FR-037 | Prevent editing of a finalized consultation record except by the original doctor or an Administrator, with all edits logged. | M |
| FR-038 | Allow attaching scanned documents or images (e.g., prior reports) to a consultation. | C |

### 4.2 Electronic Prescription (FR6)
| ID | Requirement | Priority |
|---|---|---|
| FR-039 | Provide a searchable medicine lookup (by name, generic name, or category) while creating a prescription. | M |
| FR-040 | Validate, in real time, sufficient unexpired stock for each prescribed item before submission. | M |
| FR-041 | Capture dosage, frequency, duration, and administration route for each prescribed medicine. | M |
| FR-042 | Warn the doctor of a documented patient allergy that conflicts with a selected medicine. | S |
| FR-043 | Allow marking a prescription item as a repeat/refill of a previous prescription. | S |
| FR-044 | Generate a printable/PDF prescription document bearing doctor name, registration number, and clinic letterhead. | M |
| FR-045 | Route a submitted prescription automatically to the Pharmacy Queue with status Pending. | M |
| FR-046 | Prevent submission of a prescription containing an expired or discontinued medicine. | M |

### 4.3 Appointment & Queue (relevant subset)
| ID | Requirement | Priority |
|---|---|---|
| FR-027 | Maintain queue status per the state machine: Waiting → Called → Consulting → Completed. | M |
| FR-029 | Allow a doctor to recall or skip a patient in the queue with reason capture. | S |

### 4.4 Reports (Doctor-relevant)
| ID | Requirement | Priority |
|---|---|---|
| FR-082 | Provide a Doctor dashboard summarizing personal consultation counts and follow-up due lists. | S |

---

## 5. Module Deep-Dives

### 5.1 Consultation Module

**Business Logic:** On opening a `Consulting`-status patient, the system surfaces history, allergies, and chronic conditions **before** the doctor starts typing — this ordering matters for patient safety (`FR-032`). Vitals capture BP, temperature, pulse, weight, and height; **BMI is auto-calculated**, never hand-entered, to avoid transcription error. A consultation can be saved as a **Draft** and resumed later if interrupted — it only becomes immutable once explicitly finalized. Once **Finalized**, a consultation may only be amended by the originating doctor or an Administrator, and every amendment is logged (`BR-08`, `FR-037`) — this is a hard rule, not a UI convenience.

**Doctor workflow:**
1. System displays the patient's history, allergies, and chronic conditions.
2. Doctor records vitals (BP, temperature, pulse, weight, height) — BMI auto-calculates.
3. Doctor enters diagnosis and clinical notes.
4. Doctor moves to the prescription builder (Section 5.2) if medicine is needed, or closes the consultation record.
5. Consultation and queue status become `Completed`.

**Key DB fields:** `consultations(consultation_id, appointment_id, vitals_json, allergies_ack, diagnosis, notes, status, created_at)`.

**API:**
```
POST /api/v1/consultations
GET  /api/v1/patients/{patientId}/history
```

**Edge cases:** the doctor is interrupted mid-consultation and the patient is called away — Draft persists safely; two browser tabs open on the same consultation — the UI must lock or warn on concurrent edit, since last-write-wins is not acceptable for clinical records.

**Best Practice:** never edit a Finalized consultation through the same form as a Draft — a distinct, logged "amend" action keeps the audit trail unambiguous.

---

### 5.2 Prescription Module

**Business Logic:** Medicine lookup is searchable by brand name, generic name, or category while building the prescription line-by-line (`FR-039`). **Real-time stock validation**: each line shows live stock status before the doctor can submit — an out-of-stock item is flagged, not silently allowed through (`FR-040`). A prescription **cannot be finalized** if it references an expired or discontinued medicine (`FR-046`) — a hard block, not a warning. Refill/repeat prescriptions can be marked as such, referencing a prior prescription for continuity (`FR-043`). On submission, the prescription **automatically routes** to the Pharmacy Queue with status `Pending` (`FR-045`) — there is no manual "send to pharmacy" step to forget.

**Doctor workflow:**
1. Search the medicine catalog and add items to the prescription with dosage, frequency, duration, route.
2. System validates real-time stock availability for each item.
3. If an allergy conflict is detected, the doctor must explicitly acknowledge the warning before proceeding (`FR-042`).
4. Doctor finalizes and submits the prescription.
5. System generates a printable prescription and routes it to the Pharmacy Queue.

**Key DB fields:** `prescriptions(prescription_id, consultation_id, status, issued_at)`, `prescription_items(rx_item_id, prescription_id, medicine_id, dosage, qty, batch_id)`.

**API:**
```
POST /api/v1/prescriptions
GET  /api/v1/medicines?search=
```

**Edge cases:** a prescribed item has insufficient stock at the moment of prescribing — the doctor may substitute, reduce quantity, or proceed with the item flagged for pharmacist follow-up (this does not block the whole prescription); a repeat of a now-discontinued medicine is blocked, forcing a substitute decision.

**Best Practice:** validate stock against the same ledger the pharmacist will allocate from — not a cached snapshot — to avoid a "looked fine at prescribing time, gone by dispensing time" gap. A submitted prescription is never silently edited — corrections are a new prescription referencing the old one.

---

### 5.3 Appointment & Queue (Doctor's console)

**Business Logic:** Queue status is a strict state machine — `Waiting → Called → Consulting → Completed` — enforced server-side, with no skipping except an explicit override + reason (`BR-05`). A doctor can **Skip** a called patient who doesn't respond; the skipped patient re-enters the queue rather than being dropped (`FR-029`).

**Doctor workflow:** from the Call-Next Console, select "Call Next Patient" → status updates to `Called`, then to `Consulting` once the consultation screen opens. If the patient doesn't respond, the doctor may Skip with a reason.

**API:**
```
PATCH /api/v1/appointments/{id}/status
GET   /api/v1/queue/today
```

---

## 6. Relevant Use Cases (full text, from parent SRS Section 11)

### UC-02: Book an Appointment and Manage the Queue (Doctor's portion)
**Actors:** Receptionist, Doctor
5. Doctor, from their console, selects "Call Next Patient".
6. System updates the appointment status to Called, then to Consulting once the doctor opens the consultation screen.
7. On completion, status updates to Completed and the receptionist is notified for billing.

**Alternate/Exception Flow:** if a patient does not respond when Called, the doctor may mark them Skipped and call the next patient; the skipped patient re-enters the queue.

---

### UC-03: Conduct a Consultation and Issue a Prescription
**Actor:** Doctor
**Preconditions:** Patient status is Consulting; doctor has opened the patient's consultation screen.
**Trigger:** Doctor begins examining the patient.

**Main Success Scenario:**
1. System displays the patient's history, allergies, and chronic conditions.
2. Doctor records vitals (BP, temperature, pulse, weight, height); BMI is auto-calculated.
3. Doctor enters diagnosis and clinical notes.
4. Doctor searches the medicine catalog and adds items to the prescription with dosage, frequency, and duration.
5. System validates real-time stock availability for each prescribed item.
6. Doctor finalizes and submits the prescription.
7. System generates a printable prescription and routes it to the Pharmacy Queue with status Pending.
8. System marks the consultation and queue status as Completed.

**Alternate/Exception Flows:**
- If a prescribed medicine conflicts with a documented allergy, the system displays a warning requiring doctor acknowledgement before proceeding.
- If a prescribed item has insufficient stock, the system flags the item; the doctor may substitute, reduce quantity, or proceed with the item flagged for pharmacist follow-up.
- If the doctor is interrupted, the consultation may be saved as a draft and resumed later.

**Postconditions:** A finalized, timestamped consultation record and an associated prescription exist; the prescription is visible in the pharmacy queue.

---

## 7. Relevant User Stories

| ID | User Story | Acceptance Criteria (summary) |
|---|---|---|
| US-03 | As a Doctor, I want to see a patient's allergies before prescribing, so that I avoid prescribing a conflicting medicine. | Allergy banner is visible on the consultation screen; a conflicting medicine triggers a blocking warning. |
| US-04 | As a Doctor, I want real-time stock validation while prescribing, so that I don't prescribe medicine that isn't available. | Each prescription line shows live stock status before submission. |
| US-10 | As a Doctor, I want to view a patient's full visit history on one timeline, so that I can make informed clinical decisions quickly. | Timeline loads all appointments, consultations, prescriptions and invoices in chronological order within 2 seconds. |

---

## 8. UI Screens (Doctor-facing)

| Screen | Key Elements |
|---|---|
| Login | Username/password, "forgot password" link |
| Dashboard | Personal consultation counts, follow-ups due list |
| Appointment & Queue Board | Call-next button, live queue list with status chips (own patients) |
| Consultation Workspace | History/allergy panel (always visible), vitals form with live BMI, notes editor, allergy banner, prescription builder |
| Prescription Builder | Medicine search-as-you-type, dosage/frequency/duration fields, per-line stock-status badge |
| Patient History Timeline | Chronological feed with filter chips, export-to-PDF |
| Reports & Analytics | Personal filterable tables/charts, PDF/Excel export |

**General UI guidelines applicable:** history/allergy panel always visible, never click-to-expand (patient-safety requirement); form validation errors shown inline; color coding — green = success/available, amber = warning/low-stock, red = blocked/expired/error.

---

## 9. API Endpoints Summary (Doctor scope)

```
POST  /api/v1/auth/login
POST  /api/v1/auth/logout
GET   /api/v1/patients/{patientId}/history
POST  /api/v1/consultations
POST  /api/v1/prescriptions
GET   /api/v1/medicines?search=
PATCH /api/v1/appointments/{id}/status
GET   /api/v1/queue/today
GET   /api/v1/reports/dashboard?role=doctor
```

All endpoints require an authenticated session and enforce RBAC server-side — a Doctor's API access is limited to their own patients/consultations/prescriptions per Section 6.

---

## 10. Business Rules Applicable to This Role

| ID | Rule |
|---|---|
| BR-05 | Patient queue status must progress strictly through Waiting → Called → Consulting → Completed (no skipping without an explicit override and reason). |
| BR-07 | Stock allocation for dispensing follows FEFO unless a documented clinical override is recorded (relevant when a doctor is informed of a pharmacist override on a prescribed item). |
| BR-08 | A consultation record, once finalized, may only be amended by the originating doctor or an Administrator, and every amendment is logged. |

---

## 11. Security Requirements Applicable

- All traffic over HTTPS/TLS 1.2+ (`SEC-01`).
- RBAC enforced server-side — a Doctor can only amend their own finalized consultations (`SEC-04`).
- Sensitive PII/PHI (patient history, diagnoses) encrypted at rest (`SEC-05`).
- Every create/update/delete on a consultation or prescription writes an immutable audit-log entry (`SEC-06`).
- Session/access tokens expire and require refresh (`SEC-03`).

---

## 12. Acceptance Criteria (Doctor-relevant subset)

| Feature Area | Acceptance Criteria |
|---|---|
| Prescription & Stock Validation | No prescription can be finalized referencing an out-of-stock or expired medicine without an explicit, logged override. |
| Queue Management | Queue status transitions strictly follow the defined sequence and are visible in real time on the doctor's console. |
| Security & Audit | Every create/update/delete of a clinical record produces a corresponding audit log entry with correct user, action, and timestamp. |

---

*This document is a role-scoped extract of the parent E-Poch Medical System SRS v4.0. For system-wide requirements, security specification, database dictionary, and the Receptionist/Pharmacist/Admin views, refer to the parent SRS and its companion Receptionist and Pharmacist SRS documents.*
