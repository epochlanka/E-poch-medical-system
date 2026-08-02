-- CreateTable
CREATE TABLE "ClinicSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "clinic_name" TEXT NOT NULL DEFAULT 'MediCare Clinic & Dispensary',
    "clinic_address" TEXT,
    "registration_number" TEXT,
    "logo_url" TEXT,
    "default_consultation_fee" REAL NOT NULL DEFAULT 500,
    "expiry_alert_threshold_days" INTEGER NOT NULL DEFAULT 90,
    "updated_by" INTEGER,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ClinicSettings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MasterDataItem" (
    "item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "DbBackup" (
    "backup_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" DATETIME,
    CONSTRAINT "DbBackup_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MasterDataItem_type_idx" ON "MasterDataItem"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MasterDataItem_type_value_key" ON "MasterDataItem"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "DbBackup_filename_key" ON "DbBackup"("filename");
