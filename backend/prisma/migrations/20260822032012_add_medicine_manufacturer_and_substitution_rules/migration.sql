-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN "manufacturer" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MedicineSubstitution" (
    "substitution_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "medicine_id" INTEGER NOT NULL,
    "substitute_medicine_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL DEFAULT 'Manual',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicineSubstitution_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MedicineSubstitution_substitute_medicine_id_fkey" FOREIGN KEY ("substitute_medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MedicineSubstitution_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MedicineSubstitution" ("created_at", "created_by", "is_active", "medicine_id", "substitute_medicine_id", "substitution_id") SELECT "created_at", "created_by", "is_active", "medicine_id", "substitute_medicine_id", "substitution_id" FROM "MedicineSubstitution";
DROP TABLE "MedicineSubstitution";
ALTER TABLE "new_MedicineSubstitution" RENAME TO "MedicineSubstitution";
CREATE UNIQUE INDEX "MedicineSubstitution_medicine_id_substitute_medicine_id_key" ON "MedicineSubstitution"("medicine_id", "substitute_medicine_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
