-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "idempotency_key" TEXT;

-- CreateTable
CREATE TABLE "Refund" (
    "refund_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_id" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT,
    "issued_by" INTEGER NOT NULL,
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice" ("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Refund_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "invoice_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patient_id" TEXT NOT NULL,
    "consultation_id" INTEGER,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discount_total" REAL NOT NULL DEFAULT 0,
    "total_amount" REAL NOT NULL DEFAULT 0,
    "paid_amount" REAL NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'Outstanding',
    "created_via" TEXT NOT NULL DEFAULT 'Manual',
    "void_reason" TEXT,
    "voided_by" INTEGER,
    "voided_at" DATETIME,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation" ("consultation_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("consultation_id", "created_at", "created_by", "discount_total", "invoice_id", "paid_amount", "patient_id", "payment_status", "subtotal", "total_amount", "void_reason", "voided_at", "voided_by") SELECT "consultation_id", "created_at", "created_by", "discount_total", "invoice_id", "paid_amount", "patient_id", "payment_status", "subtotal", "total_amount", "void_reason", "voided_at", "voided_by" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_created_at_idx" ON "Invoice"("created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Refund_issued_at_idx" ON "Refund"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotency_key_key" ON "Payment"("idempotency_key");
