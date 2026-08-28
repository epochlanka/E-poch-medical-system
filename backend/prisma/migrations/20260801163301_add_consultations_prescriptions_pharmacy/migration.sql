-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN "complaint" TEXT;
ALTER TABLE "Consultation" ADD COLUMN "icd10_code" TEXT;

-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN "category" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "registration_number" TEXT;

-- CreateTable
CREATE TABLE "ConsultationAmendmentLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consultation_id" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT NOT NULL,
    "amended_by" INTEGER NOT NULL,
    "amended_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsultationAmendmentLog_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation" ("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsultationAmendmentLog_amended_by_fkey" FOREIGN KEY ("amended_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MedicineSubstitution" (
    "substitution_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "medicine_id" INTEGER NOT NULL,
    "substitute_medicine_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicineSubstitution_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MedicineSubstitution_substitute_medicine_id_fkey" FOREIGN KEY ("substitute_medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MedicineSubstitution_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Prescription" (
    "prescription_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consultation_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "is_refill" BOOLEAN NOT NULL DEFAULT false,
    "refill_of_id" INTEGER,
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prescription_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation" ("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Prescription_refill_of_id_fkey" FOREIGN KEY ("refill_of_id") REFERENCES "Prescription" ("prescription_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Prescription" ("consultation_id", "issued_at", "prescription_id", "status") SELECT "consultation_id", "issued_at", "prescription_id", "status" FROM "Prescription";
DROP TABLE "Prescription";
ALTER TABLE "new_Prescription" RENAME TO "Prescription";
CREATE TABLE "new_PrescriptionItem" (
    "rx_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prescription_id" INTEGER NOT NULL,
    "medicine_id" INTEGER NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT,
    "duration" TEXT,
    "route" TEXT,
    "qty" INTEGER NOT NULL,
    "batch_id" INTEGER,
    "substituted_medicine_id" INTEGER,
    "fefo_override_reason" TEXT,
    "dispensed_by" INTEGER,
    "dispensed_at" DATETIME,
    CONSTRAINT "PrescriptionItem_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "Prescription" ("prescription_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrescriptionItem_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrescriptionItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch" ("batch_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrescriptionItem_substituted_medicine_id_fkey" FOREIGN KEY ("substituted_medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrescriptionItem_dispensed_by_fkey" FOREIGN KEY ("dispensed_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PrescriptionItem" ("batch_id", "dosage", "medicine_id", "prescription_id", "qty", "rx_item_id") SELECT "batch_id", "dosage", "medicine_id", "prescription_id", "qty", "rx_item_id" FROM "PrescriptionItem";
DROP TABLE "PrescriptionItem";
ALTER TABLE "new_PrescriptionItem" RENAME TO "PrescriptionItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ConsultationAmendmentLog_consultation_id_amended_at_idx" ON "ConsultationAmendmentLog"("consultation_id", "amended_at");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineSubstitution_medicine_id_substitute_medicine_id_key" ON "MedicineSubstitution"("medicine_id", "substitute_medicine_id");

-- CreateIndex
CREATE INDEX "Medicine_name_idx" ON "Medicine"("name");

-- CreateIndex
CREATE INDEX "Medicine_generic_name_idx" ON "Medicine"("generic_name");

-- CreateIndex
CREATE INDEX "Medicine_category_idx" ON "Medicine"("category");
