-- CreateTable
CREATE TABLE "PrescriptionItemDispense" (
    "dispense_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rx_item_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "fefo_override_reason" TEXT,
    "notes" TEXT,
    "dispensed_by" INTEGER NOT NULL,
    "dispensed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrescriptionItemDispense_rx_item_id_fkey" FOREIGN KEY ("rx_item_id") REFERENCES "PrescriptionItem" ("rx_item_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrescriptionItemDispense_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch" ("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrescriptionItemDispense_dispensed_by_fkey" FOREIGN KEY ("dispensed_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PrescriptionItem" (
    "rx_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prescription_id" INTEGER NOT NULL,
    "medicine_id" INTEGER NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT,
    "duration" TEXT,
    "route" TEXT,
    "instructions" TEXT,
    "qty" INTEGER NOT NULL,
    "external_qty" INTEGER NOT NULL DEFAULT 0,
    "dispensed_qty" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_PrescriptionItem" ("batch_id", "dispensed_at", "dispensed_by", "dosage", "duration", "external_qty", "fefo_override_reason", "frequency", "instructions", "medicine_id", "prescription_id", "qty", "route", "rx_item_id", "substituted_medicine_id") SELECT "batch_id", "dispensed_at", "dispensed_by", "dosage", "duration", "external_qty", "fefo_override_reason", "frequency", "instructions", "medicine_id", "prescription_id", "qty", "route", "rx_item_id", "substituted_medicine_id" FROM "PrescriptionItem";
DROP TABLE "PrescriptionItem";
ALTER TABLE "new_PrescriptionItem" RENAME TO "PrescriptionItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PrescriptionItemDispense_rx_item_id_idx" ON "PrescriptionItemDispense"("rx_item_id");
