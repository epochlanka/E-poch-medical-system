-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN "examination_findings" TEXT;
ALTER TABLE "Consultation" ADD COLUMN "finalized_at" DATETIME;
ALTER TABLE "Consultation" ADD COLUMN "history_of_present_illness" TEXT;
ALTER TABLE "Consultation" ADD COLUMN "medical_history_json" TEXT;

-- CreateTable
CREATE TABLE "ConsultationDocument" (
    "document_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consultation_id" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsultationDocument_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation" ("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsultationDocument_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConsultationDocument_consultation_id_idx" ON "ConsultationDocument"("consultation_id");
