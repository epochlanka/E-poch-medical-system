-- CreateTable
CREATE TABLE "LetterTemplate" (
    "letter_template_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "letter_type" TEXT NOT NULL DEFAULT 'General',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_version_id" INTEGER,
    "clinic_name" TEXT,
    "clinic_address" TEXT,
    "phone_number" TEXT,
    "doctor_name" TEXT,
    "doctor_qualification" TEXT,
    "doctor_department" TEXT,
    "registration_number" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "LetterTemplate_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LetterTemplate_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LetterTemplate_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "LetterTemplateVersion" ("version_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LetterTemplateVersion" (
    "version_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "letter_template_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "docx_filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "placeholder_report_json" TEXT NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LetterTemplateVersion_letter_template_id_fkey" FOREIGN KEY ("letter_template_id") REFERENCES "LetterTemplate" ("letter_template_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LetterTemplateVersion_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IssuedLetter" (
    "issued_letter_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "letter_template_id" INTEGER,
    "template_version_id" INTEGER,
    "patient_id" TEXT NOT NULL,
    "appointment_id" INTEGER,
    "consultation_id" INTEGER,
    "letter_type_name" TEXT NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "doctor_name_snapshot" TEXT NOT NULL,
    "letter_body" TEXT NOT NULL,
    "placeholder_data_json" TEXT NOT NULL,
    "docx_filename" TEXT NOT NULL,
    "pdf_filename" TEXT NOT NULL,
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssuedLetter_letter_template_id_fkey" FOREIGN KEY ("letter_template_id") REFERENCES "LetterTemplate" ("letter_template_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IssuedLetter_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "LetterTemplateVersion" ("version_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IssuedLetter_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient" ("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IssuedLetter_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment" ("appointment_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IssuedLetter_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation" ("consultation_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IssuedLetter_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplate_current_version_id_key" ON "LetterTemplate"("current_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplateVersion_letter_template_id_version_number_key" ON "LetterTemplateVersion"("letter_template_id", "version_number");

-- CreateIndex
CREATE INDEX "IssuedLetter_patient_id_idx" ON "IssuedLetter"("patient_id");

