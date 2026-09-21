# E-Poch Medical System
## Software Requirements Specification — Pharmacist Role
**Derived from:** E-Poch Medical System SRS v4.0 (30 July 2026) and the combined Module Deep-Dive Specification
**Scope of this document:** Every module, screen, API, business rule, and acceptance criterion relevant to the **Pharmacist** role only. Admin/Receptionist/Doctor-only detail is intentionally omitted — see the parent SRS for full system coverage.
**Confirmed technology stack:** React (frontend SPA) • Node.js + Express (backend API) • Prisma ORM • SQLite (on-premise) / PostgreSQL (cloud)

---

## 1. Role Summary

The Pharmacist owns the **safety-critical last mile**: turning a validated prescription into medicine actually handed to a patient, correctly batch-tracked and stock-deducted, and keeping the whole procure-to-restock cycle honest — from a low-stock alert through to a Goods Received Note landing new batches on the shelf.

**Primary responsibilities:**
- Manage the pharmacy dispensing queue and dispense against valid prescriptions
- Maintain stock at batch level with FEFO allocation and expiry control
- Raise and receive purchase orders against suppliers
- Perform stock-takes and reason-coded manual adjustments
- Record dispensed items as billing line items
- View inventory-focused reports and dashboards

---

## 2. Permission Matrix (Pharmacist row, Section 6 of parent SRS)

| Module | Access |
|---|---|
| User & Role Management | No access |
| Patient Registration | Read only |
| Family Management | Read only |
| Appointments & Queue | Read only |
| Consultation Records | Read only |
| Prescriptions | Read, Execute (dispense) |
| Pharmacy Queue / Dispensing | Create, Read, Update, Delete, Execute |
| Inventory & Batches | CRUD |
| Suppliers & Purchase Orders | Create, Read, Update (Admin holds full CRUD) |
| Billing & Invoices | Read, Create/Update (pharmacy line items only) |
| Reports & Dashboards | Inventory reports |
| System Settings & Audit Log | No access |

**Role description (verbatim from parent SRS, Section 6.1):** Manages the pharmacy queue, dispenses medicine against valid prescriptions, maintains stock batches, and raises purchase orders.

---

## 3. Sidebar / Menu — Pharmacist View

```
📊 Dashboard
   ├─ Low-Stock / Expiring Batches Widget
   └─ Today's Dispensing Volume

💊 Prescriptions (read-only)
   └─ View incoming prescriptions

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
   └─ Receipt Discrepancy Review (flag for Admin)

💵 Billing (pharmacy scope)
   └─ Dispensed items appended as invoice line items

📈 Reports
   └─ Pharmacist Dashboard (low stock, expiring batches, today's dispensing volume)
```

---

## 4. Applicable Functional Requirements

### 4.1 Pharmacy Queue & Dispensing Workflow (FR7)
| ID | Requirement | Priority |
|---|---|---|
| FR-047 | Display incoming prescriptions in a pharmacy queue ordered by submission time. | M |
| FR-048 | Track dispensing status per the state machine: Pending → Preparing → Dispensed → Collected. | M |
| FR-049 | Allow substituting a prescribed medicine with an equivalent, subject to doctor/administrator-configured rules. | S |
| FR-050 | Block the Dispensed transition if any line item fails stock or expiry validation. | M |
| FR-051 | Record the dispensing pharmacist, timestamp, and batch number against every dispensed item. | M |
| FR-052 | Allow partial dispensing of a prescription with remaining items held as pending. | S |
| FR-053 | Generate a dispensing label with medicine name, dosage instructions, and patient name. | S |

### 4.2 Drug & Inventory Management (FR8)
| ID | Requirement | Priority |
|---|---|---|
| FR-054 | Maintain a master medicine catalog including generic name, brand name, form, strength, unit of measure. | M |
| FR-055 | Track stock at batch level, capturing batch number, manufacture date, expiry date, quantity received. | M |
| FR-056 | Allocate stock for dispensing using First-Expiry-First-Out (FEFO) logic by default. | M |
| FR-057 | Generate an expiry alert for any batch nearing expiry within a configurable threshold (default 90 days). | M |
| FR-058 | Generate a low-stock notification when on-hand quantity falls below the configured reorder level. | M |
| FR-059 | Automatically deduct stock from the allocated batch immediately upon successful dispensing. | M |
| FR-060 | Prevent manual stock deduction below zero and require a documented reason for manual adjustments. | M |
| FR-061 | Support stock-take / physical count reconciliation with variance reporting. | S |
| FR-062 | Support barcode/QR scanning for rapid batch identification during goods receipt and dispensing. | S |
| FR-063 | Maintain a full stock ledger (movement history) per batch for audit purposes. | M |

### 4.3 Supplier & Purchase Order Management (FR9)
| ID | Requirement | Priority |
|---|---|---|
| FR-064 | Maintain a supplier master with contact details, payment terms, and supplied medicine catalog. | M |
| FR-065 | Allow creating a purchase order against a supplier, listing medicines, quantities, expected cost. | M |
| FR-066 | Track PO status through: Draft → Submitted → Partially Received → Received → Closed. | M |
| FR-067 | Auto-suggest reorder quantities based on medicines flagged as low-stock. | S |
| FR-068 | Record Goods Received Notes (GRN) against a PO, creating new stock batches automatically. | M |
| FR-069 | Flag discrepancies between ordered and received quantities for administrator review. | S |

### 4.4 Billing (Pharmacist-relevant subset)
| ID | Requirement | Priority |
|---|---|---|
| FR-070 | Generate a single consolidated invoice per visit combining consultation fee and dispensed medicine charges (dispensed items feed in from Pharmacy). | M |

### 4.5 Reports (Pharmacist-relevant)
| ID | Requirement | Priority |
|---|---|---|
| FR-083 | Provide a Pharmacist dashboard summarizing low-stock items, expiring batches, and today's dispensing volume. | M |

---

## 5. Module Deep-Dives

### 5.1 Pharmacy & Dispensing Module

**Business Logic:** Incoming prescriptions display in a queue ordered by submission time — first in, first served (`FR-047`). Dispensing status is a strict state machine: `Pending → Preparing → Dispensed → Collected` (`BR-06`). For each line, the system suggests the batch to allocate using **FEFO** by default (`FR-056`); the pharmacist can override, but an override requires a documented reason (`BR-07`). The `Dispensed` transition is **blocked** if any line item fails stock or expiry validation *at the moment of confirming* (`FR-050`) — stock can shift between prescribing and dispensing, so this check runs again here. **Partial dispensing** is allowed: some lines dispense now, the rest remain `Pending` (`FR-052`). Stock is deducted **immediately** on successful dispensing (`FR-059`, `BR-04`) — no batch job or end-of-day step.

**Pharmacist workflow:**
1. Open the next `Pending` prescription — status updates to `Preparing`.
2. For each item, the system suggests the FEFO batch.
3. Confirm batch and quantity per item.
4. System re-validates batch is not expired and stock is sufficient.
5. Confirm dispensing — system deducts quantity and updates status to `Dispensed`.
6. System checks whether remaining stock falls below reorder level and raises a low-stock notification if so.
7. Hand over medicine to the patient and mark status `Collected`.
8. System appends dispensed items as billing line items on the visit invoice.

**Key DB fields:** reuses `prescriptions` / `prescription_items`; allocation writes to `batches(batch_id, medicine_id, batch_no, expiry_date, qty_on_hand, supplier_id)` and the append-only `stock_ledger`.

**API:**
```
GET  /api/v1/pharmacy/queue
POST /api/v1/pharmacy/dispense
GET  /api/v1/inventory/batches?medicineId=
```

**Edge cases:** the suggested FEFO batch turns out to be damaged on physical inspection — select the next-valid batch with a reason logged; a patient never returns to collect after `Dispensed` — the record sits at `Dispensed`, not auto-advanced to `Collected`, preserving an honest state.

**Best Practice:** re-validate stock and expiry at the moment of confirming dispense, not only when the queue entry was opened; never let stock deduction and status update be two separately-failable steps — wrap them in one transaction.

---

### 5.2 Inventory Module

**Business Logic:** Stock is tracked at **batch level**, not just medicine level (`FR-055`). A full stock ledger (movement history) is kept per batch for audit purposes (`FR-063`) — every dispense, adjustment, and goods-received event is a row, never an overwrite of a running total. Manual stock deduction can never take a batch below zero, and any manual adjustment requires a documented reason (`FR-060`). Expiry alerts fire for any batch nearing expiry within a configurable threshold, default 90 days (`FR-057`). Low-stock notifications fire when a medicine's on-hand quantity (summed across batches) falls below its reorder level (`FR-058`). Stock-take/physical count reconciliation compares counted vs. system quantity and produces a variance report (`FR-061`). Barcode/QR scanning is supported for rapid batch identification at goods receipt and dispensing (`FR-062`).

**Key DB fields:** `medicines(medicine_id, name, generic_name, form, unit, reorder_level, is_active)`, `batches(batch_id, medicine_id, batch_no, expiry_date, qty_on_hand, supplier_id)`.

**CRUD:** Medicine catalog — standard CRUD (shared with Admin). Batches — Create via GRN, Update only via a ledger-writing event (dispense, adjustment, count correction) — never a direct quantity edit. No Delete on a batch with any movement history.

**API:**
```
GET /api/v1/inventory/batches?medicineId=
GET /api/v1/inventory/alerts
```

**Edge cases:** a batch is discovered expired during a stock-take before the automated alert fired — corrected via a reason-coded adjustment, not a silent edit; two pharmacists dispense from the same batch at nearly the same moment — the ledger's append-only, transactional nature prevents a lost update.

**Best Practice:** treat "current stock" as always `SUM(ledger movements)` for a batch, never a mutable field trusted on its own.

---

### 5.3 Supplier & Purchase Order Module

**Business Logic:** The chain is `Draft PO → Submitted → Partially Received → Received → Closed` (`FR-066`). Reorder quantities can be auto-suggested from medicines currently flagged low-stock (`FR-067`). A **Goods Received Note (GRN)** against a PO is what actually creates new stock batches, capturing batch number and expiry date (`FR-068`) — the PO itself is a commercial commitment, not a stock event. Discrepancies between ordered and received quantities are flagged for **Administrator review**, not silently accepted (`FR-069`).

**Pharmacist workflow:**
1. Dashboard raises a low-stock notification.
2. Review suggested reorder quantities and select a supplier.
3. Create a purchase order listing medicines and quantities; status `Draft` → `Submitted`.
4. On delivery, record a Goods Received Note against the PO.
5. System creates new stock batches from the GRN.
6. System updates PO status to `Received` or `Partially Received`.
7. PO closes once all line items are fully received.

**Key DB fields:** `suppliers(supplier_id, name, contact, address)`, `purchase_orders(po_id, supplier_id, order_date, status, created_by)`.

**API:**
```
POST /api/v1/purchase-orders
POST /api/v1/purchase-orders/{id}/grn
```

**Edge cases:** a supplier delivers a different batch/expiry than what was ordered — accepted via GRN as its own batch record, not forced to match the PO line; a delivered batch is damaged or rejected — record a rejection reason, excluded from usable stock.

**Best Practice:** never let a batch be created without a GRN reference, so every unit of stock traces back to a purchase document.

---

## 6. Relevant Use Cases (full text, from parent SRS Section 11)

### UC-04: Dispense a Prescription at the Pharmacy
**Actor:** Pharmacist
**Preconditions:** A prescription with status Pending exists in the Pharmacy Queue.
**Trigger:** Pharmacist selects the next prescription in the queue.

**Main Success Scenario:**
1. Pharmacist opens the prescription; status updates to Preparing.
2. For each item, system suggests the batch to allocate using FEFO logic.
3. Pharmacist confirms the batch and quantity to dispense per item.
4. System validates the batch is not expired and stock is sufficient.
5. Pharmacist confirms dispensing; system deducts the quantity from the batch and updates status to Dispensed.
6. System checks whether remaining stock has fallen below the reorder level and raises a low-stock notification if so.
7. Pharmacist hands over the medicine to the patient and marks status Collected.
8. System appends the dispensed items as billing line items on the visit invoice.

**Alternate/Exception Flows:**
- If the suggested batch is expired or insufficient, the system blocks the Dispensed transition and prompts for an alternate batch or doctor consultation.
- If only some items can be dispensed, the pharmacist may partially dispense, leaving remaining items Pending.
- If the pharmacist manually overrides FEFO allocation, the system requires a documented reason.

**Postconditions:** Prescribed items are dispensed and recorded against a specific batch; inventory and billing are automatically updated.

---

### UC-05: Manage Inventory, Suppliers and Purchase Orders
**Actors:** Pharmacist, Administrator
**Preconditions:** Pharmacist/Administrator is logged in; medicine master data exists.
**Trigger:** Stock for a medicine approaches or falls below the reorder level, or a scheduled stock review occurs.

**Main Success Scenario:**
1. System raises a low-stock notification on the pharmacist dashboard.
2. Pharmacist reviews suggested reorder quantities and selects a supplier.
3. Pharmacist creates a purchase order listing medicines and quantities; status Draft, then Submitted.
4. Supplier delivers goods; pharmacist records a Goods Received Note against the PO.
5. System creates new stock batches from the GRN, capturing batch number and expiry date.
6. System updates the PO status to Received or Partially Received based on quantities recorded.
7. System closes the PO once all line items are fully received.

**Alternate/Exception Flows:**
- If received quantities differ from ordered quantities, the system flags the discrepancy for Administrator review before closing the PO.
- If a delivered batch is damaged or rejected, the pharmacist records a rejection reason and excludes it from usable stock.

**Postconditions:** Stock levels and batch records are accurately updated; a complete procurement audit trail exists from PO to GRN to batch.

---

## 7. Relevant User Stories

| ID | User Story | Acceptance Criteria (summary) |
|---|---|---|
| US-05 | As a Pharmacist, I want the system to suggest the earliest-expiring batch, so that I dispense using FEFO by default. | Suggested batch is always the earliest expiry among valid batches for the medicine. |
| US-06 | As a Pharmacist, I want to be notified when stock drops below the reorder level, so that I can raise a purchase order in time. | Low-stock notification appears on the dashboard within 1 minute of the deduction that caused the breach. |
| US-11 | As a Pharmacist, I want to record a Goods Received Note against a purchase order, so that new stock batches are created automatically. | GRN submission creates one batch record per line item with correct expiry and quantity. |

---

## 8. UI Screens (Pharmacist-facing)

| Screen | Key Elements |
|---|---|
| Login | Username/password, "forgot password" link |
| Dashboard | Low-stock/expiry alerts, today's dispensing volume |
| Pharmacy Queue | Prescription list, status Kanban (Pending/Preparing/Dispensed/Collected) |
| Dispensing Screen | Batch selector (FEFO-sorted), quantity confirm, barcode scan input |
| Inventory Management | Medicine catalog, batch table, expiry/low-stock filters |
| Supplier & Purchase Orders | Supplier list, PO builder, GRN entry form |
| Billing (pharmacy scope) | Dispensed line items reflected on the visit invoice |
| Reports & Analytics | Filterable tables/charts, PDF/Excel export |

**General UI guidelines applicable:** Kanban board for the dispensing queue; FEFO-sorted batch selector with expiry visibly color-coded; barcode-scan input field; color coding — green = success/available, amber = warning/low-stock or nearing expiry, red = blocked/expired/error; destructive actions (manual stock adjustment, discrepancy override) require confirmation with mandatory reason capture.

---

## 9. API Endpoints Summary (Pharmacist scope)

```
POST  /api/v1/auth/login
POST  /api/v1/auth/logout
GET   /api/v1/pharmacy/queue
POST  /api/v1/pharmacy/dispense
GET   /api/v1/inventory/batches?medicineId=
GET   /api/v1/inventory/alerts
POST  /api/v1/purchase-orders
POST  /api/v1/purchase-orders/{id}/grn
GET   /api/v1/reports/dashboard?role=pharmacist
```

All endpoints require an authenticated session and enforce RBAC server-side per Section 6 — never trust the frontend alone.

---

## 10. Business Rules Applicable to This Role

| ID | Rule |
|---|---|
| BR-03 | Medicines cannot be dispensed if the allocated batch is expired or if available stock is insufficient for the prescribed quantity. |
| BR-04 | Inventory quantities update automatically and immediately after a dispensing transaction is confirmed. |
| BR-06 | Pharmacy dispensing status must progress strictly through Pending → Preparing → Dispensed → Collected. |
| BR-07 | Stock allocation for dispensing follows FEFO unless a documented clinical override is recorded. |

---

## 11. Security Requirements Applicable

- All traffic over HTTPS/TLS 1.2+ (`SEC-01`).
- RBAC enforced server-side on every pharmacy/inventory endpoint (`SEC-04`).
- Every create/update/delete on a dispensing, batch, or purchase-order record writes an immutable audit-log entry, including the dispensing pharmacist, timestamp, and batch number (`SEC-06`, `FR-051`).
- Automated daily backups (covering stock ledger data) are encrypted and stored off-instance (`SEC-09`).
- API endpoints protected by rate limiting (`SEC-14`).

---

## 12. Acceptance Criteria (Pharmacist-relevant subset)

| Feature Area | Acceptance Criteria |
|---|---|
| Prescription & Stock Validation | No prescription can be finalized/dispensed referencing an out-of-stock or expired medicine without an explicit, logged override. |
| Dispensing (FEFO) | For any medicine with multiple valid batches, the system-suggested batch is always the one with the earliest expiry date. |
| Inventory Alerts | A low-stock notification is generated within 1 minute of a deduction that breaches the reorder level; an expiry alert is generated for any batch within the configured threshold. |
| Security & Audit | Every create/update/delete of a clinical or financial record produces a corresponding audit log entry with correct user, action, and timestamp. |

---

*This document is a role-scoped extract of the parent E-Poch Medical System SRS v4.0. For system-wide requirements, security specification, database dictionary, and the Receptionist/Doctor/Admin views, refer to the parent SRS and its companion Receptionist and Doctor SRS documents.*
