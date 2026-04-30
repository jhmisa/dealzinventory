-- Live session records
CREATE TABLE live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES auth.users(id),
  staff_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_sold int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sales captured during a live session
CREATE TABLE live_session_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id),
  item_code text,
  description text,
  amount numeric,
  customer_name text,
  order_id uuid REFERENCES orders(id),
  order_code text,
  sold_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_session_sales_session ON live_session_sales(session_id);

-- RLS
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage live sessions"
  ON live_sessions FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage live session sales"
  ON live_session_sales FOR ALL USING (auth.uid() IS NOT NULL);
