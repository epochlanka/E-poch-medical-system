-- CreateTable
CREATE TABLE "Family" (
    "family_id" SERIAL NOT NULL,
    "family_name" TEXT NOT NULL,
    "head_patient_id" TEXT,
    "address" TEXT,
    "city" TEXT,
    "family_type" TEXT,
    "contact_no" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("family_id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "patient_id" TEXT NOT NULL,
    "family_id" INTEGER NOT NULL,
    "nic" TEXT,
    "guardian_nic" TEXT,
    "full_name" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "gender" TEXT NOT NULL,
    "phone" TEXT,
    "blood_group" TEXT,
    "allergies" TEXT,
    "photo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nationality" TEXT,
    "marital_status" TEXT,
    "occupation" TEXT,
    "employer_school" TEXT,
    "relationship_to_head" TEXT,
    "chronic_conditions" TEXT,
    "current_medications" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "PatientChangeLog" (
    "id" SERIAL NOT NULL,
    "patient_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,
    "changed_by" INTEGER NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDuplicateFlag" (
    "flag_id" SERIAL NOT NULL,
    "patient_id" TEXT NOT NULL,
    "matched_patient_id" TEXT NOT NULL,
    "match_reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDuplicateFlag_pkey" PRIMARY KEY ("flag_id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "appointment_id" SERIAL NOT NULL,
    "patient_id" TEXT,
    "doctor_id" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Waiting',
    "skip_reason" TEXT,
    "skipped_at" TIMESTAMP(3),
    "is_walk_in" BOOLEAN NOT NULL DEFAULT false,
    "consultation_type" TEXT,
    "visit_type" TEXT NOT NULL DEFAULT 'Appointment',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "is_temporary" BOOLEAN NOT NULL DEFAULT false,
    "temp_patient_name" TEXT,
    "temp_patient_gender" TEXT,
    "temp_patient_phone" TEXT,
    "temp_patient_age" INTEGER,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("appointment_id")
);

-- CreateTable
CREATE TABLE "AppointmentQueueLog" (
    "log_id" SERIAL NOT NULL,
    "appointment_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "actor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentQueueLog_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "consultation_id" SERIAL NOT NULL,
    "appointment_id" INTEGER NOT NULL,
    "vitals_json" TEXT,
    "allergies_ack" BOOLEAN NOT NULL DEFAULT false,
    "complaint" TEXT,
    "history_of_present_illness" TEXT,
    "examination_findings" TEXT,
    "medical_history_json" TEXT,
    "diagnosis" TEXT,
    "icd10_code" TEXT,
    "notes" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),
    "consultation_fee" DOUBLE PRECISION,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("consultation_id")
);

-- CreateTable
CREATE TABLE "ConsultationDocument" (
    "document_id" SERIAL NOT NULL,
    "consultation_id" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationDocument_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "ConsultationAmendmentLog" (
    "id" SERIAL NOT NULL,
    "consultation_id" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT NOT NULL,
    "amended_by" INTEGER NOT NULL,
    "amended_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationAmendmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "prescription_id" SERIAL NOT NULL,
    "consultation_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "is_refill" BOOLEAN NOT NULL DEFAULT false,
    "refill_of_id" INTEGER,
    "notes" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("prescription_id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "rx_item_id" SERIAL NOT NULL,
    "prescription_id" INTEGER NOT NULL,
    "medicine_id" INTEGER NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT,
    "duration" TEXT,
    "route" TEXT,
    "instructions" TEXT,
    "qty" INTEGER NOT NULL,
    "external_qty" INTEGER NOT NULL DEFAULT 0,
    "dispensed_qty" INTEGER NOT NULL DEFAULT 0,
    "batch_id" INTEGER,
    "substituted_medicine_id" INTEGER,
    "fefo_override_reason" TEXT,
    "dispensed_by" INTEGER,
    "dispensed_at" TIMESTAMP(3),

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("rx_item_id")
);

-- CreateTable
CREATE TABLE "PrescriptionItemDispense" (
    "dispense_id" SERIAL NOT NULL,
    "rx_item_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fefo_override_reason" TEXT,
    "notes" TEXT,
    "dispensed_by" INTEGER NOT NULL,
    "dispensed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionItemDispense_pkey" PRIMARY KEY ("dispense_id")
);

-- CreateTable
CREATE TABLE "Medicine" (
    "medicine_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "generic_name" TEXT,
    "brand_name" TEXT,
    "category" TEXT,
    "form" TEXT,
    "strength" TEXT,
    "manufacturer" TEXT,
    "requires_prescription" BOOLEAN NOT NULL DEFAULT false,
    "base_unit" TEXT NOT NULL DEFAULT 'Piece',
    "default_pack_unit" TEXT,
    "default_pack_size" DOUBLE PRECISION,
    "default_selling_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "max_stock_level" INTEGER NOT NULL DEFAULT 0,
    "barcode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("medicine_id")
);

-- CreateTable
CREATE TABLE "ExternalPrescriptionMedicine" (
    "ext_item_id" SERIAL NOT NULL,
    "prescription_id" INTEGER NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "medicine_id" INTEGER,
    "medicine_name" TEXT NOT NULL,
    "generic_name" TEXT,
    "brand_name" TEXT,
    "dosage_form" TEXT NOT NULL,
    "strength" TEXT,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT,
    "duration" TEXT,
    "quantity" INTEGER NOT NULL,
    "quantity_unit" TEXT NOT NULL,
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPrescriptionMedicine_pkey" PRIMARY KEY ("ext_item_id")
);

-- CreateTable
CREATE TABLE "LabTestCatalog" (
    "test_id" SERIAL NOT NULL,
    "test_name" TEXT NOT NULL,
    "test_code" TEXT,
    "category" TEXT,
    "abbreviation" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LabTestCatalog_pkey" PRIMARY KEY ("test_id")
);

-- CreateTable
CREATE TABLE "LabTestParameter" (
    "parameter_id" SERIAL NOT NULL,
    "test_id" INTEGER NOT NULL,
    "parameter_name" TEXT NOT NULL,
    "unit" TEXT,
    "reference_range" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "data_type" TEXT NOT NULL DEFAULT 'Numeric',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LabTestParameter_pkey" PRIMARY KEY ("parameter_id")
);

-- CreateTable
CREATE TABLE "LabTestOrder" (
    "lab_test_order_id" SERIAL NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" INTEGER NOT NULL,
    "consultation_id" INTEGER NOT NULL,
    "catalog_test_id" INTEGER,
    "test_name" TEXT NOT NULL,
    "test_category" TEXT,
    "instructions" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Routine',
    "additional_notes" TEXT,
    "request_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_at" TIMESTAMP(3),
    "printed_by" INTEGER,
    "report_received_at" TIMESTAMP(3),
    "report_received_by" INTEGER,
    "received_note" TEXT,
    "interpretation" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by" INTEGER,
    "result_value" TEXT,
    "unit" TEXT,
    "reference_range" TEXT,
    "result_notes" TEXT,
    "result_date" TIMESTAMP(3),
    "laboratory_name" TEXT,
    "report_file_path" TEXT,
    "entered_by" INTEGER,
    "entered_at" TIMESTAMP(3),
    "reviewed_by" INTEGER,
    "review_notes" TEXT,
    "reviewed_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabTestOrder_pkey" PRIMARY KEY ("lab_test_order_id")
);

-- CreateTable
CREATE TABLE "LabResult" (
    "result_id" SERIAL NOT NULL,
    "lab_test_order_id" INTEGER NOT NULL,
    "parameter_id" INTEGER,
    "parameter_name" TEXT NOT NULL,
    "unit" TEXT,
    "reference_range" TEXT,
    "result_value" TEXT NOT NULL,
    "result_flag" TEXT,
    "entered_by" INTEGER NOT NULL,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("result_id")
);

-- CreateTable
CREATE TABLE "MedicineSubstitution" (
    "substitution_id" SERIAL NOT NULL,
    "medicine_id" INTEGER NOT NULL,
    "substitute_medicine_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL DEFAULT 'Manual',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineSubstitution_pkey" PRIMARY KEY ("substitution_id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "batch_id" SERIAL NOT NULL,
    "medicine_id" INTEGER NOT NULL,
    "batch_no" TEXT NOT NULL,
    "supplier_id" INTEGER,
    "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manufacture_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "received_unit" TEXT NOT NULL DEFAULT 'Piece',
    "received_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "units_per_pack" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "qty_base_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty_on_hand" DOUBLE PRECISION NOT NULL,
    "purchase_price_per_pack" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost_per_base_unit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "selling_price_per_pack" DOUBLE PRECISION,
    "selling_price_per_base_unit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "location" TEXT,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "ledger_id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "change_qty" DOUBLE PRECISION NOT NULL,
    "balance_after" DOUBLE PRECISION NOT NULL,
    "event_type" TEXT NOT NULL,
    "unit_price" DOUBLE PRECISION,
    "unit_cost" DOUBLE PRECISION,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "reason" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("ledger_id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "stock_count_id" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "notes" TEXT,
    "performed_by" INTEGER NOT NULL,
    "reviewed_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMP(3),

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("stock_count_id")
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "stock_count_item_id" SERIAL NOT NULL,
    "stock_count_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "expected_qty" DOUBLE PRECISION NOT NULL,
    "counted_qty" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("stock_count_item_id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "supplier_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("supplier_id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "po_id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "expected_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("po_id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "po_item_id" SERIAL NOT NULL,
    "po_id" INTEGER NOT NULL,
    "medicine_id" INTEGER NOT NULL,
    "qty_ordered" DOUBLE PRECISION NOT NULL,
    "unit_cost" DOUBLE PRECISION,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("po_item_id")
);

-- CreateTable
CREATE TABLE "GoodsReceivedNote" (
    "grn_id" SERIAL NOT NULL,
    "po_id" INTEGER NOT NULL,
    "received_by" INTEGER NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "has_discrepancy" BOOLEAN NOT NULL DEFAULT false,
    "discrepancy_reviewed_by" INTEGER,
    "discrepancy_reviewed_at" TIMESTAMP(3),
    "discrepancy_notes" TEXT,

    CONSTRAINT "GoodsReceivedNote_pkey" PRIMARY KEY ("grn_id")
);

-- CreateTable
CREATE TABLE "GRNItem" (
    "grn_item_id" SERIAL NOT NULL,
    "grn_id" INTEGER NOT NULL,
    "po_item_id" INTEGER NOT NULL,
    "batch_id" INTEGER,
    "qty_received" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GRNItem_pkey" PRIMARY KEY ("grn_item_id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "invoice_id" SERIAL NOT NULL,
    "patient_id" TEXT,
    "consultation_id" INTEGER,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'Outstanding',
    "created_via" TEXT NOT NULL DEFAULT 'Manual',
    "void_reason" TEXT,
    "voided_by" INTEGER,
    "voided_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "invoice_item_id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "item_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,
    "source_prescription_item_id" INTEGER,
    "medicine_id" INTEGER,
    "batch_id" INTEGER,
    "source_dispense_id" INTEGER,
    "base_qty" DOUBLE PRECISION,
    "unit" TEXT,
    "purchase_cost" DOUBLE PRECISION,
    "profit" DOUBLE PRECISION,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("invoice_item_id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "payment_id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "idempotency_key" TEXT,
    "received_by" INTEGER NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "refund_id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "issued_by" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("refund_id")
);

-- CreateTable
CREATE TABLE "User" (
    "user_id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "registration_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "session_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" TEXT,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "ClinicSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "clinic_name" TEXT NOT NULL DEFAULT 'MediCare Clinic & Dispensary',
    "clinic_address" TEXT,
    "registration_number" TEXT,
    "logo_url" TEXT,
    "default_consultation_fee" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "expiry_alert_threshold_days" INTEGER NOT NULL DEFAULT 90,
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 15,
    "account_lockout_minutes" INTEGER NOT NULL DEFAULT 15,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterTemplate" (
    "letter_template_id" SERIAL NOT NULL,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("letter_template_id")
);

-- CreateTable
CREATE TABLE "LetterTemplateVersion" (
    "version_id" SERIAL NOT NULL,
    "letter_template_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "docx_filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "placeholder_report_json" TEXT NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterTemplateVersion_pkey" PRIMARY KEY ("version_id")
);

-- CreateTable
CREATE TABLE "IssuedLetter" (
    "issued_letter_id" SERIAL NOT NULL,
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
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuedLetter_pkey" PRIMARY KEY ("issued_letter_id")
);

-- CreateTable
CREATE TABLE "MasterDataItem" (
    "item_id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MasterDataItem_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "DbBackup" (
    "backup_id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "DbBackup_pkey" PRIMARY KEY ("backup_id")
);

-- CreateIndex
CREATE INDEX "Family_family_name_idx" ON "Family"("family_name");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nic_key" ON "Patient"("nic");

-- CreateIndex
CREATE INDEX "Patient_full_name_idx" ON "Patient"("full_name");

-- CreateIndex
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");

-- CreateIndex
CREATE INDEX "Patient_guardian_nic_dob_idx" ON "Patient"("guardian_nic", "dob");

-- CreateIndex
CREATE INDEX "PatientChangeLog_patient_id_changed_at_idx" ON "PatientChangeLog"("patient_id", "changed_at");

-- CreateIndex
CREATE INDEX "PatientDuplicateFlag_status_idx" ON "PatientDuplicateFlag"("status");

-- CreateIndex
CREATE INDEX "AppointmentQueueLog_appointment_id_created_at_idx" ON "AppointmentQueueLog"("appointment_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointment_id_key" ON "Consultation"("appointment_id");

-- CreateIndex
CREATE INDEX "ConsultationDocument_consultation_id_idx" ON "ConsultationDocument"("consultation_id");

-- CreateIndex
CREATE INDEX "ConsultationAmendmentLog_consultation_id_amended_at_idx" ON "ConsultationAmendmentLog"("consultation_id", "amended_at");

-- CreateIndex
CREATE INDEX "PrescriptionItemDispense_rx_item_id_idx" ON "PrescriptionItemDispense"("rx_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_barcode_key" ON "Medicine"("barcode");

-- CreateIndex
CREATE INDEX "Medicine_name_idx" ON "Medicine"("name");

-- CreateIndex
CREATE INDEX "Medicine_generic_name_idx" ON "Medicine"("generic_name");

-- CreateIndex
CREATE INDEX "Medicine_category_idx" ON "Medicine"("category");

-- CreateIndex
CREATE INDEX "ExternalPrescriptionMedicine_patient_id_idx" ON "ExternalPrescriptionMedicine"("patient_id");

-- CreateIndex
CREATE INDEX "ExternalPrescriptionMedicine_prescription_id_idx" ON "ExternalPrescriptionMedicine"("prescription_id");

-- CreateIndex
CREATE UNIQUE INDEX "LabTestCatalog_test_code_key" ON "LabTestCatalog"("test_code");

-- CreateIndex
CREATE INDEX "LabTestCatalog_test_name_idx" ON "LabTestCatalog"("test_name");

-- CreateIndex
CREATE INDEX "LabTestCatalog_category_idx" ON "LabTestCatalog"("category");

-- CreateIndex
CREATE INDEX "LabTestParameter_test_id_idx" ON "LabTestParameter"("test_id");

-- CreateIndex
CREATE UNIQUE INDEX "LabTestOrder_request_number_key" ON "LabTestOrder"("request_number");

-- CreateIndex
CREATE INDEX "LabTestOrder_patient_id_idx" ON "LabTestOrder"("patient_id");

-- CreateIndex
CREATE INDEX "LabTestOrder_consultation_id_idx" ON "LabTestOrder"("consultation_id");

-- CreateIndex
CREATE INDEX "LabTestOrder_status_idx" ON "LabTestOrder"("status");

-- CreateIndex
CREATE INDEX "LabResult_lab_test_order_id_idx" ON "LabResult"("lab_test_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineSubstitution_medicine_id_substitute_medicine_id_key" ON "MedicineSubstitution"("medicine_id", "substitute_medicine_id");

-- CreateIndex
CREATE INDEX "Batch_medicine_id_expiry_date_idx" ON "Batch"("medicine_id", "expiry_date");

-- CreateIndex
CREATE INDEX "StockLedger_batch_id_created_at_idx" ON "StockLedger"("batch_id", "created_at");

-- CreateIndex
CREATE INDEX "StockCountItem_stock_count_id_idx" ON "StockCountItem"("stock_count_id");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GRNItem_batch_id_key" ON "GRNItem"("batch_id");

-- CreateIndex
CREATE INDEX "Invoice_created_at_idx" ON "Invoice"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceItem_source_dispense_id_key" ON "InvoiceItem"("source_dispense_id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotency_key_key" ON "Payment"("idempotency_key");

-- CreateIndex
CREATE INDEX "Payment_received_at_idx" ON "Payment"("received_at");

-- CreateIndex
CREATE INDEX "Refund_issued_at_idx" ON "Refund"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "UserSession_user_id_idx" ON "UserSession"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplate_current_version_id_key" ON "LetterTemplate"("current_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplateVersion_letter_template_id_version_number_key" ON "LetterTemplateVersion"("letter_template_id", "version_number");

-- CreateIndex
CREATE INDEX "IssuedLetter_patient_id_idx" ON "IssuedLetter"("patient_id");

-- CreateIndex
CREATE INDEX "MasterDataItem_type_idx" ON "MasterDataItem"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MasterDataItem_type_value_key" ON "MasterDataItem"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "DbBackup_filename_key" ON "DbBackup"("filename");

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_head_patient_id_fkey" FOREIGN KEY ("head_patient_id") REFERENCES "Patient"("patient_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "Family"("family_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientChangeLog" ADD CONSTRAINT "PatientChangeLog_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientChangeLog" ADD CONSTRAINT "PatientChangeLog_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDuplicateFlag" ADD CONSTRAINT "PatientDuplicateFlag_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDuplicateFlag" ADD CONSTRAINT "PatientDuplicateFlag_matched_patient_id_fkey" FOREIGN KEY ("matched_patient_id") REFERENCES "Patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDuplicateFlag" ADD CONSTRAINT "PatientDuplicateFlag_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentQueueLog" ADD CONSTRAINT "AppointmentQueueLog_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("appointment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentQueueLog" ADD CONSTRAINT "AppointmentQueueLog_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("appointment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationDocument" ADD CONSTRAINT "ConsultationDocument_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation"("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationDocument" ADD CONSTRAINT "ConsultationDocument_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationAmendmentLog" ADD CONSTRAINT "ConsultationAmendmentLog_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation"("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationAmendmentLog" ADD CONSTRAINT "ConsultationAmendmentLog_amended_by_fkey" FOREIGN KEY ("amended_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation"("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_refill_of_id_fkey" FOREIGN KEY ("refill_of_id") REFERENCES "Prescription"("prescription_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "Prescription"("prescription_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine"("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_substituted_medicine_id_fkey" FOREIGN KEY ("substituted_medicine_id") REFERENCES "Medicine"("medicine_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_dispensed_by_fkey" FOREIGN KEY ("dispensed_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItemDispense" ADD CONSTRAINT "PrescriptionItemDispense_rx_item_id_fkey" FOREIGN KEY ("rx_item_id") REFERENCES "PrescriptionItem"("rx_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItemDispense" ADD CONSTRAINT "PrescriptionItemDispense_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItemDispense" ADD CONSTRAINT "PrescriptionItemDispense_dispensed_by_fkey" FOREIGN KEY ("dispensed_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPrescriptionMedicine" ADD CONSTRAINT "ExternalPrescriptionMedicine_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "Prescription"("prescription_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPrescriptionMedicine" ADD CONSTRAINT "ExternalPrescriptionMedicine_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPrescriptionMedicine" ADD CONSTRAINT "ExternalPrescriptionMedicine_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPrescriptionMedicine" ADD CONSTRAINT "ExternalPrescriptionMedicine_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine"("medicine_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestParameter" ADD CONSTRAINT "LabTestParameter_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "LabTestCatalog"("test_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation"("consultation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_catalog_test_id_fkey" FOREIGN KEY ("catalog_test_id") REFERENCES "LabTestCatalog"("test_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_printed_by_fkey" FOREIGN KEY ("printed_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_report_received_by_fkey" FOREIGN KEY ("report_received_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestOrder" ADD CONSTRAINT "LabTestOrder_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_lab_test_order_id_fkey" FOREIGN KEY ("lab_test_order_id") REFERENCES "LabTestOrder"("lab_test_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "LabTestParameter"("parameter_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSubstitution" ADD CONSTRAINT "MedicineSubstitution_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine"("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSubstitution" ADD CONSTRAINT "MedicineSubstitution_substitute_medicine_id_fkey" FOREIGN KEY ("substitute_medicine_id") REFERENCES "Medicine"("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSubstitution" ADD CONSTRAINT "MedicineSubstitution_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine"("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("supplier_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "StockCount"("stock_count_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "PurchaseOrder"("po_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine"("medicine_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "PurchaseOrder"("po_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_discrepancy_reviewed_by_fkey" FOREIGN KEY ("discrepancy_reviewed_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNItem" ADD CONSTRAINT "GRNItem_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "GoodsReceivedNote"("grn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNItem" ADD CONSTRAINT "GRNItem_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "PurchaseOrderItem"("po_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNItem" ADD CONSTRAINT "GRNItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation"("consultation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_source_prescription_item_id_fkey" FOREIGN KEY ("source_prescription_item_id") REFERENCES "PrescriptionItem"("rx_item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "Medicine"("medicine_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_source_dispense_id_fkey" FOREIGN KEY ("source_dispense_id") REFERENCES "PrescriptionItemDispense"("dispense_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicSettings" ADD CONSTRAINT "ClinicSettings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "LetterTemplateVersion"("version_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplateVersion" ADD CONSTRAINT "LetterTemplateVersion_letter_template_id_fkey" FOREIGN KEY ("letter_template_id") REFERENCES "LetterTemplate"("letter_template_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplateVersion" ADD CONSTRAINT "LetterTemplateVersion_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedLetter" ADD CONSTRAINT "IssuedLetter_letter_template_id_fkey" FOREIGN KEY ("letter_template_id") REFERENCES "LetterTemplate"("letter_template_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedLetter" ADD CONSTRAINT "IssuedLetter_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "LetterTemplateVersion"("version_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedLetter" ADD CONSTRAINT "IssuedLetter_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedLetter" ADD CONSTRAINT "IssuedLetter_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("appointment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedLetter" ADD CONSTRAINT "IssuedLetter_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "Consultation"("consultation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedLetter" ADD CONSTRAINT "IssuedLetter_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DbBackup" ADD CONSTRAINT "DbBackup_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
