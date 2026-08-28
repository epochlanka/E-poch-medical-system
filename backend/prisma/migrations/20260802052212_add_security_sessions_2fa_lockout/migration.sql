-- CreateTable
CREATE TABLE "UserSession" (
    "session_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" DATETIME,
    "user_agent" TEXT,
    "ip_address" TEXT,
    CONSTRAINT "UserSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClinicSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "clinic_name" TEXT NOT NULL DEFAULT 'MediCare Clinic & Dispensary',
    "clinic_address" TEXT,
    "registration_number" TEXT,
    "logo_url" TEXT,
    "default_consultation_fee" REAL NOT NULL DEFAULT 500,
    "expiry_alert_threshold_days" INTEGER NOT NULL DEFAULT 90,
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 15,
    "account_lockout_minutes" INTEGER NOT NULL DEFAULT 15,
    "updated_by" INTEGER,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ClinicSettings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClinicSettings" ("clinic_address", "clinic_name", "default_consultation_fee", "expiry_alert_threshold_days", "id", "logo_url", "registration_number", "updated_at", "updated_by") SELECT "clinic_address", "clinic_name", "default_consultation_fee", "expiry_alert_threshold_days", "id", "logo_url", "registration_number", "updated_at", "updated_by" FROM "ClinicSettings";
DROP TABLE "ClinicSettings";
ALTER TABLE "new_ClinicSettings" RENAME TO "ClinicSettings";
CREATE TABLE "new_User" (
    "user_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "registration_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" DATETIME,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" DATETIME
);
INSERT INTO "new_User" ("is_active", "password_hash", "registration_number", "role", "user_id", "username") SELECT "is_active", "password_hash", "registration_number", "role", "user_id", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserSession_user_id_idx" ON "UserSession"("user_id");
