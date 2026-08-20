-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN "brand_name" TEXT;

-- CreateTable
CREATE TABLE "ExternalPrescriptionMedicine" (
    "ext_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prescription_id" INTEGER NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "medicine_id" INTEGER,
    "medicine_name" TEXT NOT NULL,
    "generic_name" TEXT,
    "brand_name" TEXT,
    "dosage_form" TEXT NOT NULL,
    "strength" TEXT,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT,
    "duration" TEXT,
    "quantity" INTEGER NOT NULL,
    "quantity_unit" TEXT NOT NULL,
    "instructions" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ExternalPrescriptionMedicine_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "Prescription" ("prescription_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExternalPrescriptionMedicine_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExternalPrescriptionMedicine_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExternalPrescriptionMedicine_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExternalPrescriptionMedicine_patient_id_idx" ON "ExternalPrescriptionMedicine"("patient_id");

-- CreateIndex
CREATE INDEX "ExternalPrescriptionMedicine_prescription_id_idx" ON "ExternalPrescriptionMedicine"("prescription_id");
