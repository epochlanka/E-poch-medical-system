/*
  Warnings:

  - You are about to drop the `LabOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LabOrderItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LabTest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LabOrder";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LabOrderItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LabTest";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "LabTestOrder" (
    "lab_test_order_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "consultation_id" INTEGER NOT NULL,
    "test_name" TEXT NOT NULL,
    "test_category" TEXT,
    "instructions" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Routine',
    "additional_notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "order_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "LabTestOrder_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabTestOrder_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LabTestOrder_patient_id_idx" ON "LabTestOrder"("patient_id");

-- CreateIndex
CREATE INDEX "LabTestOrder_consultation_id_idx" ON "LabTestOrder"("consultation_id");

-- CreateIndex
CREATE INDEX "LabTestOrder_status_idx" ON "LabTestOrder"("status");
