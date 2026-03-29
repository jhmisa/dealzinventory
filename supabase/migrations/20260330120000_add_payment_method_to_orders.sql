-- Add payment method to orders (selected at offer claim time)
ALTER TABLE orders
  ADD COLUMN payment_method text
    CHECK (payment_method IN ('COD','CREDIT_CARD','BANK','KONBINI','CASH')),
  ADD COLUMN payment_method_code smallint DEFAULT 0;
