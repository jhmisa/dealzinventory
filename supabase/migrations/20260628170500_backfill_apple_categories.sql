-- Categorize all Apple product_models onto the EXISTING coarse category taxonomy
-- (no new categories created; keyed on brand + model_name, longest-prefix wins).
--   iPhone*            -> iPhone
--   iPad*              -> iPad
--   MacBook*           -> MacBook
--   iMac*              -> iMac All-In-One
--   Mac mini*          -> CPU
--   Apple Watch / AirPods -> Accessories
WITH mapping(prefix, catname) AS (
  VALUES
    ('iPhone','iPhone'),
    ('iPad','iPad'),
    ('MacBook','MacBook'),
    ('iMac','iMac All-In-One'),
    ('Mac mini','CPU'),
    ('Apple Watch','Accessories'),
    ('Watch','Accessories'),
    ('AirPods','Accessories')
),
resolved AS (
  SELECT pm.id,
    (SELECT c.id
       FROM mapping mp
       JOIN public.categories c ON c.name = mp.catname
      WHERE pm.model_name ILIKE mp.prefix || '%'
      ORDER BY length(mp.prefix) DESC
      LIMIT 1) AS cat_id
  FROM public.product_models pm
  WHERE pm.brand = 'Apple'
)
UPDATE public.product_models pm
SET category_id = r.cat_id
FROM resolved r
WHERE pm.id = r.id
  AND r.cat_id IS NOT NULL
  AND pm.category_id IS DISTINCT FROM r.cat_id;
