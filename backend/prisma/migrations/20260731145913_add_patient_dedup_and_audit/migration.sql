-- CreateTable
CREATE TABLE "PatientChangeLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,
    "changed_by" INTEGER NOT NULL,
    "changed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientChangeLog_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientChangeLog_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PatientDuplicateFlag" (
    "flag_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT NOT NULL,
    "matched_patient_id" TEXT NOT NULL,
    "match_reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "reviewed_by" INTEGER,
    "reviewed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientDuplicateFlag_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientDuplicateFlag_matched_patient_id_fkey" FOREIGN KEY ("matched_patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientDuplicateFlag_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Patient" (
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
    "photo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Patient_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "Family" ("family_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("allergies", "blood_group", "dob", "family_id", "full_name", "gender", "guardian_nic", "is_active", "nic", "patient_id", "phone") SELECT "allergies", "blood_group", "dob", "family_id", "full_name", "gender", "guardian_nic", "is_active", "nic", "patient_id", "phone" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE UNIQUE INDEX "Patient_nic_key" ON "Patient"("nic");
CREATE INDEX "Patient_full_name_idx" ON "Patient"("full_name");
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");
CREATE INDEX "Patient_guardian_nic_dob_idx" ON "Patient"("guardian_nic", "dob");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PatientChangeLog_patient_id_changed_at_idx" ON "PatientChangeLog"("patient_id", "changed_at");

-- CreateIndex
CREATE INDEX "PatientDuplicateFlag_status_idx" ON "PatientDuplicateFlag"("status");
