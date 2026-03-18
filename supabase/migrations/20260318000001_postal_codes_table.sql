-- Postal codes lookup table (seeded from Japan Post CSV data)
CREATE TABLE postal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postal_code text NOT NULL,
  prefecture_ja text NOT NULL,
  prefecture_en text NOT NULL,
  city_ja text NOT NULL,
  city_en text NOT NULL,
  town_ja text NOT NULL DEFAULT '',
  town_en text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_postal_codes_code ON postal_codes(postal_code);

-- RLS: anyone can read, only service_role can write
ALTER TABLE postal_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read postal codes"
  ON postal_codes FOR SELECT
  USING (true);
