-- R1 Phase 2: self-hosted MediaPipe assets for the recorder's camera segmentation (Blur /
-- Virtual background). A public, read-only bucket holds the tasks-vision WASM runtime + the
-- selfie-segmenter .tflite model, so the recorder never depends on a third-party CDN at record time.
-- Files are uploaded out-of-band via `supabase storage cp` (not tracked in this migration).
insert into storage.buckets (id, name, public)
values ('ml-models', 'ml-models', true)
on conflict (id) do update set public = excluded.public;
