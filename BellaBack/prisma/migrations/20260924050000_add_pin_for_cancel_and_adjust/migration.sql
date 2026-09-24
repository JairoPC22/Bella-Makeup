-- Segundo grupo de interruptores de PIN: agregan un atajo de supervisor a
-- acciones que antes solo el permiso directo podía realizar.
ALTER TABLE "company_settings" ADD COLUMN "allow_pin_for_sale_cancel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN "allow_pin_for_inventory_adjust" BOOLEAN NOT NULL DEFAULT false;
