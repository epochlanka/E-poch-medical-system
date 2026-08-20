-- CreateTable
CREATE TABLE "LabTestCatalog" (
    "test_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "test_name" TEXT NOT NULL,
    "test_code" TEXT,
    "category" TEXT,
    "abbreviation" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "LabTestParameter" (
    "parameter_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "test_id" INTEGER NOT NULL,
    "parameter_name" TEXT NOT NULL,
    "unit" TEXT,
    "reference_range" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "data_type" TEXT NOT NULL DEFAULT 'Numeric',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "LabTestParameter_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "LabTestCatalog" ("test_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LabResult" (
    "result_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lab_test_order_id" INTEGER NOT NULL,
    "parameter_id" INTEGER,
    "parameter_name" TEXT NOT NULL,
    "unit" TEXT,
    "reference_range" TEXT,
    "result_value" TEXT NOT NULL,
    "result_flag" TEXT,
    "entered_by" INTEGER NOT NULL,
    "entered_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabResult_lab_test_order_id_fkey" FOREIGN KEY ("lab_test_order_id") REFERENCES "LabTestOrder" ("lab_test_order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabResult_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "LabTestParameter" ("parameter_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabResult_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LabTestOrder" (
    "lab_test_order_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "consultation_id" INTEGER NOT NULL,
    "catalog_test_id" INTEGER,
    "test_name" TEXT NOT NULL,
    "test_category" TEXT,
    "instructions" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Routine',
    "additional_notes" TEXT,
    "request_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "order_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_at" DATETIME,
    "printed_by" INTEGER,
    "report_received_at" DATETIME,
    "report_received_by" INTEGER,
    "received_note" TEXT,
    "interpretation" TEXT,
    "completed_at" DATETIME,
    "completed_by" INTEGER,
    "result_value" TEXT,
    "unit" TEXT,
    "reference_range" TEXT,
    "result_notes" TEXT,
    "result_date" DATETIME,
    "laboratory_name" TEXT,
    "report_file_path" TEXT,
    "entered_by" INTEGER,
    "entered_at" DATETIME,
    "reviewed_by" INTEGER,
    "review_notes" TEXT,
    "reviewed_date" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "LabTestOrder_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation" ("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_catalog_test_id_fkey" FOREIGN KEY ("catalog_test_id") REFERENCES "LabTestCatalog" ("test_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_printed_by_fkey" FOREIGN KEY ("printed_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_report_received_by_fkey" FOREIGN KEY ("report_received_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LabTestOrder" ("additional_notes", "consultation_id", "created_at", "doctor_id", "entered_at", "entered_by", "instructions", "lab_test_order_id", "laboratory_name", "order_date", "patient_id", "priority", "reference_range", "report_file_path", "result_date", "result_notes", "result_value", "review_notes", "reviewed_by", "reviewed_date", "status", "test_category", "test_name", "unit", "updated_at") SELECT "additional_notes", "consultation_id", "created_at", "doctor_id", "entered_at", "entered_by", "instructions", "lab_test_order_id", "laboratory_name", "order_date", "patient_id", "priority", "reference_range", "report_file_path", "result_date", "result_notes", "result_value", "review_notes", "reviewed_by", "reviewed_date", "status", "test_category", "test_name", "unit", "updated_at" FROM "LabTestOrder";
DROP TABLE "LabTestOrder";
ALTER TABLE "new_LabTestOrder" RENAME TO "LabTestOrder";
CREATE UNIQUE INDEX "LabTestOrder_request_number_key" ON "LabTestOrder"("request_number");
CREATE INDEX "LabTestOrder_patient_id_idx" ON "LabTestOrder"("patient_id");
CREATE INDEX "LabTestOrder_consultation_id_idx" ON "LabTestOrder"("consultation_id");
CREATE INDEX "LabTestOrder_status_idx" ON "LabTestOrder"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "LabTestCatalog_test_code_key" ON "LabTestCatalog"("test_code");

-- CreateIndex
CREATE INDEX "LabTestCatalog_test_name_idx" ON "LabTestCatalog"("test_name");

-- CreateIndex
CREATE INDEX "LabTestCatalog_category_idx" ON "LabTestCatalog"("category");

-- CreateIndex
CREATE INDEX "LabTestParameter_test_id_idx" ON "LabTestParameter"("test_id");

-- CreateIndex
CREATE INDEX "LabResult_lab_test_order_id_idx" ON "LabResult"("lab_test_order_id");
