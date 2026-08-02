-- AlterTable
ALTER TABLE "Batch" ADD COLUMN "manufacture_date" DATETIME;

-- CreateTable
CREATE TABLE "StockLedger" (
    "ledger_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "batch_id" INTEGER NOT NULL,
    "change_qty" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "reason" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLedger_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch" ("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLedger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockCount" (
    "stock_count_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "performed_by" INTEGER NOT NULL,
    "reviewed_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" DATETIME,
    CONSTRAINT "StockCount_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCount_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "stock_count_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stock_count_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER NOT NULL,
    "variance" INTEGER NOT NULL,
    CONSTRAINT "StockCountItem_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "StockCount" ("stock_count_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCountItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch" ("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "po_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "po_id" INTEGER NOT NULL,
    "medicine_id" INTEGER NOT NULL,
    "qty_ordered" INTEGER NOT NULL,
    "unit_cost" REAL,
    CONSTRAINT "PurchaseOrderItem_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "PurchaseOrder" ("po_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderItem_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine" ("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoodsReceivedNote" (
    "grn_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "po_id" INTEGER NOT NULL,
    "received_by" INTEGER NOT NULL,
    "received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "has_discrepancy" BOOLEAN NOT NULL DEFAULT false,
    "discrepancy_reviewed_by" INTEGER,
    "discrepancy_reviewed_at" DATETIME,
    "discrepancy_notes" TEXT,
    CONSTRAINT "GoodsReceivedNote_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "PurchaseOrder" ("po_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceivedNote_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceivedNote_discrepancy_reviewed_by_fkey" FOREIGN KEY ("discrepancy_reviewed_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GRNItem" (
    "grn_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "grn_id" INTEGER NOT NULL,
    "po_item_id" INTEGER NOT NULL,
    "batch_id" INTEGER,
    "qty_received" INTEGER NOT NULL,
    CONSTRAINT "GRNItem_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "GoodsReceivedNote" ("grn_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GRNItem_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "PurchaseOrderItem" ("po_item_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GRNItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch" ("batch_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "invoice_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_id" INTEGER NOT NULL,
    "item_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unit_price" REAL NOT NULL,
    "line_total" REAL NOT NULL,
    "source_prescription_item_id" INTEGER,
    CONSTRAINT "InvoiceItem_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice" ("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_source_prescription_item_id_fkey" FOREIGN KEY ("source_prescription_item_id") REFERENCES "PrescriptionItem" ("rx_item_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "payment_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_id" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "received_by" INTEGER NOT NULL,
    "received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice" ("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
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
INSERT INTO "new_Invoice" ("created_at", "invoice_id", "patient_id", "payment_status", "total_amount") SELECT "created_at", "invoice_id", "patient_id", "payment_status", "total_amount" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_created_at_idx" ON "Invoice"("created_at");
CREATE TABLE "new_Medicine" (
    "medicine_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "generic_name" TEXT,
    "category" TEXT,
    "form" TEXT,
    "unit" TEXT NOT NULL,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "unit_price" REAL NOT NULL DEFAULT 0,
    "barcode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Medicine" ("category", "form", "generic_name", "is_active", "medicine_id", "name", "reorder_level", "unit") SELECT "category", "form", "generic_name", "is_active", "medicine_id", "name", "reorder_level", "unit" FROM "Medicine";
DROP TABLE "Medicine";
ALTER TABLE "new_Medicine" RENAME TO "Medicine";
CREATE UNIQUE INDEX "Medicine_barcode_key" ON "Medicine"("barcode");
CREATE INDEX "Medicine_name_idx" ON "Medicine"("name");
CREATE INDEX "Medicine_generic_name_idx" ON "Medicine"("generic_name");
CREATE INDEX "Medicine_category_idx" ON "Medicine"("category");
CREATE TABLE "new_PurchaseOrder" (
    "po_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplier_id" INTEGER NOT NULL,
    "order_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrder_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier" ("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseOrder" ("created_by", "order_date", "po_id", "status", "supplier_id") SELECT "created_by", "order_date", "po_id", "status", "supplier_id" FROM "PurchaseOrder";
DROP TABLE "PurchaseOrder";
ALTER TABLE "new_PurchaseOrder" RENAME TO "PurchaseOrder";
CREATE TABLE "new_Supplier" (
    "supplier_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Supplier" ("address", "contact", "name", "supplier_id") SELECT "address", "contact", "name", "supplier_id" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StockLedger_batch_id_created_at_idx" ON "StockLedger"("batch_id", "created_at");

-- CreateIndex
CREATE INDEX "StockCountItem_stock_count_id_idx" ON "StockCountItem"("stock_count_id");

-- CreateIndex
CREATE UNIQUE INDEX "GRNItem_batch_id_key" ON "GRNItem"("batch_id");

-- CreateIndex
CREATE INDEX "Payment_received_at_idx" ON "Payment"("received_at");

-- CreateIndex
CREATE INDEX "Batch_medicine_id_expiry_date_idx" ON "Batch"("medicine_id", "expiry_date");

