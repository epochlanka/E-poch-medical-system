-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "appointment_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "scheduled_at" DATETIME NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Waiting',
    "skip_reason" TEXT,
    "skipped_at" DATETIME,
    "is_walk_in" BOOLEAN NOT NULL DEFAULT false,
    "consultation_type" TEXT,
    "visit_type" TEXT NOT NULL DEFAULT 'Appointment',
    "created_by" INTEGER NOT NULL,
    CONSTRAINT "Appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("appointment_id", "created_by", "doctor_id", "is_walk_in", "patient_id", "reason", "scheduled_at", "skip_reason", "skipped_at", "status") SELECT "appointment_id", "created_by", "doctor_id", "is_walk_in", "patient_id", "reason", "scheduled_at", "skip_reason", "skipped_at", "status" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
