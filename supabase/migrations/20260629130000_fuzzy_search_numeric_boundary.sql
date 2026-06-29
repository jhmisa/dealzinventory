-- ============================================================================
-- Fuzzy search precision pass: numeric-only tokens must hit a WORD BOUNDARY.
--
-- The pure separator-stripped matcher (20260629120000) is great for recall but a
-- bare number matches inside any longer code: searching "iphone 11" surfaced an
-- iPhone 6s because "11" appears inside one of its part/model numbers. The old
-- list_product_color_groups used \m word-boundary matching precisely to stop this
-- ("15" must not match the "15" inside "A2215").
--
-- Best of both: classify each query token AFTER normalization.
--   * token is ALL DIGITS (e.g. "11", "256", "2020")  -> require a \m word-boundary
--     hit on the folded haystack, so it matches "iPhone 11" / "256GB" but never the
--     middle of a part number.
--   * token has ANY letter (e.g. "11pro", "so51aa", "1ii", "promax", "iphone11")
--     -> separator-insensitive substring on the stripped haystack (full flexibility).
--
-- Only the shared helpers change; every search RPC keeps calling search_matches().
-- ============================================================================

-- Fold full-width -> half-width and lower-case, WITHOUT stripping separators.
-- Used for word-boundary tests; search_normalize builds on it.
CREATE OR REPLACE FUNCTION public.search_fold(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    translate(
      coalesce(p, ''),
      'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ' ||
      'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ' ||
      '０１２３４５６７８９',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ' ||
      'abcdefghijklmnopqrstuvwxyz' ||
      '0123456789'
    )
  );
$$;

-- Stripped form: folded + all whitespace/punctuation/JP separators removed.
CREATE OR REPLACE FUNCTION public.search_normalize(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(public.search_fold(p), '[[:space:][:punct:]・ー―‐]+', '', 'g');
$$;

-- Token-AND matcher with the numeric-boundary refinement.
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
      CONTINUE;                              -- punctuation-only token, ignore
    ELSIF norm_tok ~ '^[0-9]+$' THEN
      -- pure number: only matches at the start of a word -> never mid-code
      IF fold_hay !~ ('\m' || norm_tok) THEN
        RETURN false;
      END IF;
    ELSE
      -- has letters: separator-insensitive substring -> joined/split both hit
      IF strpos(norm_hay, norm_tok) = 0 THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;                               -- empty query or all tokens present
END;
$$;
