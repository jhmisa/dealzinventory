-- Refine the numeric-boundary rule: only SHORT numbers (≤3 digits) need a word boundary.
--
-- The boundary rule (20260629130000) exists to stop a short generation/spec number from
-- matching inside a longer code — "iphone 11" must not surface an iPhone 6s because "11"
-- sits inside one of its part numbers. But it also rejected a long number split off a code:
-- searching "C 001439" for customer C001439 missed, because "001439" is glued to "C" in the
-- source (not at a word boundary) — even though "C-001439" and "C001439" both hit. That
-- spacing inconsistency is exactly the human-formatting problem the engine should erase.
--
-- A 4+ digit number matching as a substring is virtually always intentional (A-numbers,
-- customer/order codes, long SKUs), so only tokens of ≤3 digits keep the boundary guard.
CREATE OR REPLACE FUNCTION public.search_matches(haystack text, query text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  norm_hay  text := public.search_normalize(haystack);  -- separators stripped
  fold_hay  text := public.search_fold(haystack);       -- separators kept (for \m tests)
  raw_tok   text;
  norm_tok  text;
BEGIN
  FOR raw_tok IN
    SELECT t FROM regexp_split_to_table(btrim(coalesce(query, '')), '\s+') AS t
  LOOP
    norm_tok := public.search_normalize(raw_tok);
    IF norm_tok = '' THEN
      CONTINUE;                                   -- punctuation-only token, ignore
    ELSIF norm_tok ~ '^[0-9]{1,3}$' THEN
      -- short pure number: only at the start of a word -> never mid-code
      IF fold_hay !~ ('\m' || norm_tok) THEN
        RETURN false;
      END IF;
    ELSE
      -- letters, or a long (4+ digit) number: separator-insensitive substring
      IF strpos(norm_hay, norm_tok) = 0 THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;                                    -- empty query or all tokens present
END;
$$;
