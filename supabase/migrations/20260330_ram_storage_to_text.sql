ALTER TABLE items ALTER COLUMN ram_gb TYPE text USING ram_gb::text;
ALTER TABLE items ALTER COLUMN storage_gb TYPE text USING storage_gb::text;
ALTER TABLE product_models ALTER COLUMN ram_gb TYPE text USING ram_gb::text;
ALTER TABLE product_models ALTER COLUMN storage_gb TYPE text USING storage_gb::text;
