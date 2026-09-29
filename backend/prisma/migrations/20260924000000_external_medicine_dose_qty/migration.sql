-- Units per administration for an externally-bought line, matching PrescriptionItem.dose_qty.
-- The quantity was previously derived from frequency x duration alone, silently assuming one
-- unit per dose, and the dose never reached the printed slip the patient carries to the outside
-- pharmacy. Nullable: rows written before this column stay valid and print as they always did.
ALTER TABLE "ExternalPrescriptionMedicine" ADD COLUMN "dose_qty" DOUBLE PRECISION;
