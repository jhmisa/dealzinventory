-- Change camera from text to boolean (has_camera), matching has_bluetooth pattern
ALTER TABLE product_models DROP COLUMN IF EXISTS camera;
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS has_camera boolean NOT NULL DEFAULT false;

-- Update category form_fields: rename 'camera' to 'has_camera'
UPDATE categories
SET form_fields = (
  SELECT jsonb_agg(
    CASE WHEN elem = '"camera"' THEN '"has_camera"'::jsonb ELSE elem END
  )
  FROM jsonb_array_elements(form_fields) AS elem
)
WHERE form_fields::text LIKE '%"camera"%';
