-- CreateTable
CREATE TABLE "Family" (
    "family_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "family_name" TEXT NOT NULL,
    "head_patient_id" TEXT,
    "address" TEXT,
    "contact_no" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Family_head_patient_id_fkey" FOREIGN KEY ("head_patient_id") REFERENCES "Patient" ("patient_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Patient" (
    "patient_id" TEXT NOT NULL PRIMARY KEY,
    "family_id" INTEGER NOT NULL,
    "nic" TEXT,
    "guardian_nic" TEXT,
    "full_name" TEXT NOT NULL,
    "dob" DATETIME NOT NULL,
    "gender" TEXT NOT NULL,
    "phone" TEXT,
    "blood_group" TEXT,
    "allergies" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Patient_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "Family" ("family_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appointment" (
    "appointment_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "scheduled_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Waiting',
    "created_by" INTEGER NOT NULL,
    CONSTRAINT "Appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Consultation" (
    "consultation_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "appointment_id" INTEGER NOT NULL,
    "vitals_json" TEXT,
    "allergies_ack" BOOLEAN NOT NULL DEFAULT false,
    "diagnosis" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consultation_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment" ("appointment_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prescription" (
    "prescription_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consultation_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prescription_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation" ("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "rx_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prescription_id" INTEGER NOT NULL,
    "medicine_id" INTEGER NOT NULL,
    "dosage" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "batch_id" INTEGER,
    CONSTRAINT "PrescriptionItem_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "Prescription" ("prescription_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrescriptionItem_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrescriptionItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch" ("batch_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Medicine" (
    "medicine_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "generic_name" TEXT,
    "form" TEXT,
    "unit" TEXT NOT NULL,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Batch" (
    "batch_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "medicine_id" INTEGER NOT NULL,
    "batch_no" TEXT NOT NULL,
    "expiry_date" DATETIME NOT NULL,
    "qty_on_hand" INTEGER NOT NULL,
    "supplier_id" INTEGER,
    CONSTRAINT "Batch_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Batch_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier" ("supplier_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "supplier_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "address" TEXT
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "po_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplier_id" INTEGER NOT NULL,
    "order_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "created_by" INTEGER NOT NULL,
    CONSTRAINT "PurchaseOrder_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier" ("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "invoice_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT NOT NULL,
    "prescription_id" INTEGER,
    "total_amount" REAL NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'Outstanding',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "Prescription" ("prescription_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "user_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "log_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nic_key" ON "Patient"("nic");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointment_id_key" ON "Consultation"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_prescription_id_key" ON "Invoice"("prescription_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
