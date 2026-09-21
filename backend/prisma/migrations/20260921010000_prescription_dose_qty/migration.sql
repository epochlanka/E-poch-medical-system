-- Explicit units-per-dose for prescription lines. Until now the server computed the expected
-- quantity from frequency x duration only, i.e. it silently assumed ONE unit per dose: a
-- two-tablet BD x 5 day prescription (20) was rejected in favour of 10.
ALTER TABLE "PrescriptionItem" ADD COLUMN "dose_qty" DOUBLE PRECISION;
ALTER TABLE "PrescriptionItem" ADD COLUMN "qty_manual" BOOLEAN NOT NULL DEFAULT false;
