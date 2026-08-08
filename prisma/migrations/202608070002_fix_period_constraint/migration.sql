ALTER TABLE "invoices" DROP CONSTRAINT "invoices_period_format";

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_period_format"
  CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
