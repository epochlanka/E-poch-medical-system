-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Supplier" (
    "supplier_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Supplier" ("address", "contact", "is_active", "name", "supplier_id") SELECT "address", "contact", "is_active", "name", "supplier_id" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
