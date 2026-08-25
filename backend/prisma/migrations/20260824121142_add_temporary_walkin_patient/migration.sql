-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "appointment_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT,
    "doctor_id" INTEGER NOT NULL,
    "scheduled_at" DATETIME NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Waiting',
    "skip_reason" TEXT,
    "skipped_at" DATETIME,
    "is_walk_in" BOOLEAN NOT NULL DEFAULT false,
    "consultation_type" TEXT,
    "visit_type" TEXT NOT NULL DEFAULT 'Appointment',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "is_temporary" BOOLEAN NOT NULL DEFAULT false,
    "temp_patient_name" TEXT,
    "temp_patient_gender" TEXT,
    "temp_patient_phone" TEXT,
    "temp_patient_age" INTEGER,
    CONSTRAINT "Appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("appointment_id", "consultation_type", "created_by", "doctor_id", "is_walk_in", "notes", "patient_id", "priority", "reason", "scheduled_at", "skip_reason", "skipped_at", "status", "visit_type") SELECT "appointment_id", "consultation_type", "created_by", "doctor_id", "is_walk_in", "notes", "patient_id", "priority", "reason", "scheduled_at", "skip_reason", "skipped_at", "status", "visit_type" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
