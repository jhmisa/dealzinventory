-- ============================================================
-- Dealz K.K. — Initial Schema Migration
-- 17 enums, 14 tables, triggers, indexes, sequences, functions
-- ============================================================

-- ========================
-- 1. Custom Enum Types
-- ========================

CREATE TYPE condition_grade AS ENUM ('S', 'A', 'B', 'C', 'D', 'J');
CREATE TYPE item_status AS ENUM ('INTAKE', 'AVAILABLE', 'REPAIR', 'MISSING');
CREATE TYPE source_type AS ENUM ('AUCTION', 'WHOLESALE', 'KAITORI');
CREATE TYPE ac_adapter_status AS ENUM ('CORRECT', 'INCORRECT', 'MISSING');
CREATE TYPE supplier_type AS ENUM ('auction', 'wholesaler', 'individual_kaitori');
CREATE TYPE config_status AS ENUM ('DRAFT', 'CONFIRMED');
CREATE TYPE photo_group_status AS ENUM ('DRAFT', 'ACTIVE');
CREATE TYPE media_type AS ENUM ('image', 'video');
CREATE TYPE media_role AS ENUM ('hero', 'gallery', 'video');
CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TYPE order_source AS ENUM ('SHOP', 'LIVE_SELLING');
CREATE TYPE kaitori_status AS ENUM ('QUOTED', 'ACCEPTED', 'SHIPPED', 'RECEIVED', 'INSPECTING', 'PRICE_REVISED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');
CREATE TYPE kaitori_delivery_method AS ENUM ('SHIP', 'WALK_IN');
CREATE TYPE kaitori_payment_method AS ENUM ('CASH', 'BANK_TRANSFER');
CREATE TYPE battery_condition AS ENUM ('GOOD', 'FAIR', 'POOR');
CREATE TYPE screen_condition AS ENUM ('GOOD', 'FAIR', 'POOR', 'CRACKED');
CREATE TYPE body_condition AS ENUM ('GOOD', 'FAIR', 'POOR', 'DAMAGED');
CREATE TYPE kaitori_media_role AS ENUM ('front', 'back', 'screen', 'battery_info', 'damage', 'other');


-- ========================
-- 2. Helper: Auto-update updated_at
-- ========================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ========================
-- 3. Tables (in FK dependency order)
-- ========================

-- Table 1: product_models
CREATE TABLE product_models (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand         text NOT NULL,
  model_name    text NOT NULL,
  chipset       text,
  screen_size   numeric(4,1),
  form_factor   text,
  ports         text,
  model_notes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_product_models_updated
  BEFORE UPDATE ON product_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_product_models_brand ON product_models (brand);
CREATE INDEX idx_product_models_form_factor ON product_models (form_factor);


-- Table 2: config_groups
CREATE TABLE config_groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_model_id  uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  cpu               text,
  ram_gb            integer,
  storage_gb        integer,
  os_family         text,
  keyboard_layout   text,
  has_touchscreen   boolean DEFAULT false,
  has_dedicated_gpu boolean DEFAULT false,
  has_thunderbolt   boolean DEFAULT false,
  supports_stylus   boolean DEFAULT false,
  config_notes      text,
  status            config_status NOT NULL DEFAULT 'DRAFT',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_config_groups_updated
  BEFORE UPDATE ON config_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_config_groups_product_model ON config_groups (product_model_id);
CREATE INDEX idx_config_groups_status ON config_groups (status);


-- Table 3: photo_groups
CREATE TABLE photo_groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_group_code  text NOT NULL UNIQUE,
  product_model_id  uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  color             text NOT NULL,
  status            photo_group_status NOT NULL DEFAULT 'DRAFT',
  verified_by       uuid REFERENCES auth.users(id),
  verified_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_photo_groups_updated
  BEFORE UPDATE ON photo_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_photo_groups_product_model ON photo_groups (product_model_id);
CREATE INDEX idx_photo_groups_status ON photo_groups (status);


-- Table 4: photo_group_media
CREATE TABLE photo_group_media (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_group_id  uuid NOT NULL REFERENCES photo_groups(id) ON DELETE CASCADE,
  media_type      media_type NOT NULL,
  file_url        text NOT NULL,
  role            media_role NOT NULL DEFAULT 'gallery',
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_photo_group_media_group ON photo_group_media (photo_group_id);


-- Table 5: suppliers
CREATE TABLE suppliers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name  text NOT NULL,
  supplier_type  supplier_type NOT NULL,
  contact_info   text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_suppliers_updated
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- Table 6: items (without kaitori FK — added later)
CREATE TABLE items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code             text NOT NULL UNIQUE,
  supplier_id           uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_price        numeric(10,0),
  photo_group_id        uuid REFERENCES photo_groups(id) ON DELETE SET NULL,
  photo_group_verified  boolean NOT NULL DEFAULT false,
  config_group_id       uuid REFERENCES config_groups(id) ON DELETE SET NULL,
  condition_grade       condition_grade,
  item_status           item_status NOT NULL DEFAULT 'INTAKE',
  source_type           source_type NOT NULL DEFAULT 'AUCTION',
  kaitori_request_id    uuid,
  ac_adapter_status     ac_adapter_status DEFAULT 'MISSING',
  inspected_by          uuid REFERENCES auth.users(id),
  inspected_at          timestamptz,
  specs_notes           text,
  condition_notes       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_items_updated
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_items_status ON items (item_status);
CREATE INDEX idx_items_grade ON items (condition_grade);
CREATE INDEX idx_items_source ON items (source_type);
CREATE INDEX idx_items_supplier ON items (supplier_id);
CREATE INDEX idx_items_config_group ON items (config_group_id);
CREATE INDEX idx_items_photo_group ON items (photo_group_id);
CREATE INDEX idx_items_item_code ON items (item_code);


-- Table 7: sell_groups
CREATE TABLE sell_groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sell_group_code   text NOT NULL UNIQUE,
  photo_group_id    uuid NOT NULL REFERENCES photo_groups(id) ON DELETE RESTRICT,
  config_group_id   uuid NOT NULL REFERENCES config_groups(id) ON DELETE RESTRICT,
  condition_grade   condition_grade NOT NULL,
  base_price        numeric(10,0) NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sell_groups_no_junk CHECK (condition_grade != 'J')
);

CREATE TRIGGER trg_sell_groups_updated
  BEFORE UPDATE ON sell_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sell_groups_active ON sell_groups (active) WHERE active = true;
CREATE INDEX idx_sell_groups_config ON sell_groups (config_group_id);
CREATE INDEX idx_sell_groups_photo ON sell_groups (photo_group_id);


-- Table 8: sell_group_items
CREATE TABLE sell_group_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sell_group_id   uuid NOT NULL REFERENCES sell_groups(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE RESTRICT,
  assigned_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sell_group_items_group ON sell_group_items (sell_group_id);


-- Table 9: customers
CREATE TABLE customers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code         text NOT NULL UNIQUE,
  last_name             text NOT NULL,
  first_name            text,
  email                 text,
  phone                 text,
  pin_hash              text NOT NULL,
  shipping_address      text,
  is_seller             boolean NOT NULL DEFAULT false,
  bank_name             text,
  bank_branch           text,
  bank_account_number   text,
  bank_account_holder   text,
  id_verified           boolean NOT NULL DEFAULT false,
  id_verified_at        timestamptz,
  id_document_url       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TRIGGER trg_customers_updated
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_customers_email ON customers (email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_phone ON customers (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_last_name ON customers (last_name);


-- Table 10: orders
CREATE TABLE orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code        text NOT NULL UNIQUE,
  customer_id       uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sell_group_id     uuid NOT NULL REFERENCES sell_groups(id) ON DELETE RESTRICT,
  order_source      order_source NOT NULL,
  shipping_address  text NOT NULL,
  quantity          integer NOT NULL CHECK (quantity > 0),
  total_price       numeric(10,0) NOT NULL,
  order_status      order_status NOT NULL DEFAULT 'PENDING',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_orders_updated
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_status ON orders (order_status);
CREATE INDEX idx_orders_sell_group ON orders (sell_group_id);


-- Table 11: order_items
CREATE TABLE order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE RESTRICT,
  packed_at   timestamptz,
  packed_by   uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_order_items_order ON order_items (order_id);


-- Table 12: kaitori_price_list
CREATE TABLE kaitori_price_list (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_model_id  uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  config_group_id   uuid REFERENCES config_groups(id) ON DELETE RESTRICT,
  battery_condition battery_condition NOT NULL,
  screen_condition  screen_condition NOT NULL,
  body_condition    body_condition NOT NULL,
  purchase_price    numeric(10,0) NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_kaitori_price_list_updated
  BEFORE UPDATE ON kaitori_price_list
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_kaitori_price_model ON kaitori_price_list (product_model_id);
CREATE INDEX idx_kaitori_price_config ON kaitori_price_list (config_group_id);
CREATE INDEX idx_kaitori_price_active ON kaitori_price_list (active) WHERE active = true;


-- Table 13: kaitori_requests
CREATE TABLE kaitori_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kaitori_code              text NOT NULL UNIQUE,
  customer_id               uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  product_model_id          uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  config_group_id           uuid REFERENCES config_groups(id) ON DELETE RESTRICT,
  battery_condition         battery_condition NOT NULL,
  screen_condition          screen_condition NOT NULL,
  body_condition            body_condition NOT NULL,
  seller_notes              text,
  auto_quote_price          numeric(10,0) NOT NULL,
  final_price               numeric(10,0),
  price_revised             boolean NOT NULL DEFAULT false,
  revision_reason           text,
  seller_accepted_revision  boolean,
  delivery_method           kaitori_delivery_method NOT NULL,
  tracking_number           text,
  request_status            kaitori_status NOT NULL DEFAULT 'QUOTED',
  payment_method            kaitori_payment_method,
  paid_at                   timestamptz,
  paid_by                   uuid REFERENCES auth.users(id),
  inspected_by              uuid REFERENCES auth.users(id),
  inspected_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kaitori_revision_reason CHECK (
    (price_revised = false) OR (price_revised = true AND revision_reason IS NOT NULL)
  )
);

CREATE TRIGGER trg_kaitori_requests_updated
  BEFORE UPDATE ON kaitori_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_kaitori_customer ON kaitori_requests (customer_id);
CREATE INDEX idx_kaitori_status ON kaitori_requests (request_status);
CREATE INDEX idx_kaitori_product_model ON kaitori_requests (product_model_id);


-- Table 14: kaitori_request_media
CREATE TABLE kaitori_request_media (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kaitori_request_id  uuid NOT NULL REFERENCES kaitori_requests(id) ON DELETE CASCADE,
  media_type          media_type NOT NULL DEFAULT 'image',
  file_url            text NOT NULL,
  role                kaitori_media_role NOT NULL DEFAULT 'other',
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kaitori_media_request ON kaitori_request_media (kaitori_request_id);


-- ========================
-- 4. Deferred Foreign Key: items → kaitori_requests
-- ========================

ALTER TABLE items
  ADD CONSTRAINT fk_items_kaitori_request
  FOREIGN KEY (kaitori_request_id) REFERENCES kaitori_requests(id) ON DELETE SET NULL;

CREATE INDEX idx_items_kaitori_request ON items (kaitori_request_id) WHERE kaitori_request_id IS NOT NULL;


-- ========================
-- 5. Sequences for Code Generation
-- ========================

CREATE SEQUENCE p_code_seq START 1;
CREATE SEQUENCE pg_code_seq START 1;
CREATE SEQUENCE g_code_seq START 1;
CREATE SEQUENCE kt_code_seq START 1;
CREATE SEQUENCE ord_code_seq START 1;
CREATE SEQUENCE cust_code_seq START 1;


-- ========================
-- 6. Code Generation Function
-- ========================

CREATE OR REPLACE FUNCTION generate_code(prefix text, seq_name text)
RETURNS text AS $$
DECLARE
  next_val bigint;
BEGIN
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  RETURN prefix || lpad(next_val::text, 6, '0');
END;
$$ LANGUAGE plpgsql;
