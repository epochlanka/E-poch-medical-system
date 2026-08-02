-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Family" (
    "family_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "family_name" TEXT NOT NULL,
    "head_patient_id" TEXT,
    "address" TEXT,
    "contact_no" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Family_head_patient_id_fkey" FOREIGN KEY ("head_patient_id") REFERENCES "Patient" ("patient_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Family" ("address", "contact_no", "created_at", "family_id", "family_name", "head_patient_id") SELECT "address", "contact_no", "created_at", "family_id", "family_name", "head_patient_id" FROM "Family";
DROP TABLE "Family";
ALTER TABLE "new_Family" RENAME TO "Family";
CREATE INDEX "Family_family_name_idx" ON "Family"("family_name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
