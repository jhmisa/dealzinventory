-- Create item_defects table for tracking individual defects found during inspection
CREATE TABLE item_defects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  area TEXT NOT NULL CHECK (area IN ('body', 'screen', 'keyboard', 'other')),
  defect_type TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for fast lookup by item
CREATE INDEX idx_item_defects_item_id ON item_defects(item_id);

-- RLS
ALTER TABLE item_defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage item defects"
  ON item_defects FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
