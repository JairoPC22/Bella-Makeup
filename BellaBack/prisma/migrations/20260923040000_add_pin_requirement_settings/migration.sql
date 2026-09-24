-- Interruptores de autorización por PIN de supervisor, configurables por acción.
ALTER TABLE "company_settings" ADD COLUMN "require_pin_for_discounts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "company_settings" ADD COLUMN "require_pin_for_returns" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "company_settings" ADD COLUMN "require_pin_for_shrinkage" BOOLEAN NOT NULL DEFAULT true;
