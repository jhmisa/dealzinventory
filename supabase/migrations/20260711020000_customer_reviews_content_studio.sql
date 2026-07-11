-- Content Studio Phase 4: wire customer_reviews as a content source.
-- rating drives the ★ on review cards; imported_from tracks manual/paste/CSV ingestion
-- (NO live FB scrape — Meta blocks it, spec §9); review_card_content_item_id back-links the
-- rendered card in the Library.
ALTER TABLE public.customer_reviews
  ADD COLUMN IF NOT EXISTS rating int CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS imported_from text NOT NULL DEFAULT 'manual'
    CHECK (imported_from IN ('manual','csv','paste')),
  ADD COLUMN IF NOT EXISTS review_card_content_item_id uuid
    REFERENCES public.content_items(id) ON DELETE SET NULL;
