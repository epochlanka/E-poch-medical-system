-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Medicine" (
    "medicine_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "generic_name" TEXT,
    "category" TEXT,
    "form" TEXT,
    "strength" TEXT,
    "unit" TEXT NOT NULL,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "unit_price" REAL NOT NULL DEFAULT 0,
    "buy_price" REAL NOT NULL DEFAULT 0,
    "barcode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Medicine" ("barcode", "category", "form", "generic_name", "is_active", "medicine_id", "name", "reorder_level", "strength", "unit", "unit_price") SELECT "barcode", "category", "form", "generic_name", "is_active", "medicine_id", "name", "reorder_level", "strength", "unit", "unit_price" FROM "Medicine";
DROP TABLE "Medicine";
ALTER TABLE "new_Medicine" RENAME TO "Medicine";
CREATE UNIQUE INDEX "Medicine_barcode_key" ON "Medicine"("barcode");
CREATE INDEX "Medicine_name_idx" ON "Medicine"("name");
CREATE INDEX "Medicine_generic_name_idx" ON "Medicine"("generic_name");
CREATE INDEX "Medicine_category_idx" ON "Medicine"("category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
