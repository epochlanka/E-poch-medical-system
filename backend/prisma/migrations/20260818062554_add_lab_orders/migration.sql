-- CreateTable
CREATE TABLE "LabTest" (
    "lab_test_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "normal_range" TEXT,
    "price" REAL NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "LabOrder" (
    "lab_order_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consultation_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Ordered',
    "notes" TEXT,
    "ordered_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabOrder_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation" ("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LabOrderItem" (
    "lab_order_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lab_order_id" INTEGER NOT NULL,
    "lab_test_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "result_value" TEXT,
    "result_notes" TEXT,
    "is_abnormal" BOOLEAN,
    "resulted_by" INTEGER,
    "resulted_at" DATETIME,
    CONSTRAINT "LabOrderItem_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "LabOrder" ("lab_order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabOrderItem_lab_test_id_fkey" FOREIGN KEY ("lab_test_id") REFERENCES "LabTest" ("lab_test_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabOrderItem_resulted_by_fkey" FOREIGN KEY ("resulted_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LabTest_name_idx" ON "LabTest"("name");

-- CreateIndex
CREATE INDEX "LabTest_category_idx" ON "LabTest"("category");
