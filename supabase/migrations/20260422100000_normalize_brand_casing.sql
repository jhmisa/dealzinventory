-- Migration: Normalize brand name casing
-- Fixes duplicate brand entries caused by inconsistent casing (e.g. "ASUS"/"Asus", "LENOVO"/"Lenovo")

-- Step 1: Create canonical_brands lookup table
CREATE TABLE canonical_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lower_name text UNIQUE NOT NULL,
  canonical_name text NOT NULL
);

-- Enable RLS (required by project convention)
ALTER TABLE canonical_brands ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (staff need this for triggers)
CREATE POLICY "canonical_brands_select" ON canonical_brands
  FOR SELECT USING (true);

-- Seed with brand-accurate casing for all known brands
INSERT INTO canonical_brands (lower_name, canonical_name) VALUES
  -- Acronyms / all-caps brands
  ('hp', 'HP'),
  ('asus', 'ASUS'),
  ('zte', 'ZTE'),
  ('lg', 'LG'),
  ('msi', 'MSI'),
  ('htc', 'HTC'),
  ('tcl', 'TCL'),
  ('umidigi', 'UMIDIGI'),
  ('nec', 'NEC'),
  ('ibm', 'IBM'),
  ('bq', 'BQ'),
  -- Title case brands
  ('apple', 'Apple'),
  ('lenovo', 'Lenovo'),
  ('microsoft', 'Microsoft'),
  ('samsung', 'Samsung'),
  ('dell', 'Dell'),
  ('acer', 'Acer'),
  ('huawei', 'Huawei'),
  ('xiaomi', 'Xiaomi'),
  ('oppo', 'Oppo'),
  ('realme', 'Realme'),
  ('motorola', 'Motorola'),
  ('sharp', 'Sharp'),
  ('philips', 'Philips'),
  ('fujitsu', 'Fujitsu'),
  ('google', 'Google'),
  ('blackview', 'Blackview'),
  ('sony', 'Sony'),
  ('toshiba', 'Toshiba'),
  ('panasonic', 'Panasonic'),
  ('nokia', 'Nokia'),
  ('oneplus', 'OnePlus'),
  ('vivo', 'Vivo'),
  ('honor', 'Honor'),
  ('infinix', 'Infinix'),
  ('tecno', 'Tecno'),
  ('meizu', 'Meizu'),
  ('razer', 'Razer'),
  ('vaio', 'VAIO'),
  ('dynabook', 'Dynabook'),
  ('nothing', 'Nothing'),
  ('nothing phone', 'Nothing Phone'),
  ('cubot', 'Cubot'),
  ('doogee', 'Doogee'),
  ('oukitel', 'Oukitel'),
  ('ulefone', 'Ulefone'),
  ('gigabyte', 'Gigabyte'),
  ('framework', 'Framework'),
  ('surface', 'Surface')
ON CONFLICT (lower_name) DO NOTHING;


-- Step 2: Create normalize_brand() function
CREATE OR REPLACE FUNCTION normalize_brand(input text)
RETURNS text AS $$
DECLARE
  result text;
BEGIN
  IF input IS NULL OR TRIM(input) = '' THEN
    RETURN input;
  END IF;

  SELECT cb.canonical_name INTO result
  FROM canonical_brands cb
  WHERE cb.lower_name = LOWER(TRIM(input));

  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  -- Fallback: INITCAP for unknown brands
  RETURN INITCAP(TRIM(input));
END;
$$ LANGUAGE plpgsql STABLE;


-- Step 3: Update existing data
UPDATE product_models SET brand = normalize_brand(brand) WHERE brand IS NOT NULL;
UPDATE items SET brand = normalize_brand(brand) WHERE brand IS NOT NULL;
UPDATE accessories SET brand = normalize_brand(brand) WHERE brand IS NOT NULL;


-- Step 4: Triggers to auto-normalize future writes

CREATE OR REPLACE FUNCTION trigger_normalize_brand()
RETURNS trigger AS $$
BEGIN
  NEW.brand := normalize_brand(NEW.brand);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_normalize_brand_product_models
  BEFORE INSERT OR UPDATE OF brand ON product_models
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalize_brand();

CREATE TRIGGER trg_normalize_brand_items
  BEFORE INSERT OR UPDATE OF brand ON items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalize_brand();

CREATE TRIGGER trg_normalize_brand_accessories
  BEFORE INSERT OR UPDATE OF brand ON accessories
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalize_brand();


-- Step 5: Update get_available_brands() to wrap in normalize_brand() as belt-and-suspenders
CREATE OR REPLACE FUNCTION get_available_brands()
RETURNS TABLE (brand text) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT normalize_brand(i.brand) AS brand
  FROM items i
  WHERE i.item_status = 'AVAILABLE'
    AND i.brand IS NOT NULL
    AND i.brand != ''
  ORDER BY brand;
END;
$$ LANGUAGE plpgsql STABLE;
