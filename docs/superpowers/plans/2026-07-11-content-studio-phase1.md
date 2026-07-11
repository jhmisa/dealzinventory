# Content Studio — Phase 1 Implementation Plan (Scheduler backbone + Library + Calendar + Studio shell)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use `- [ ]` tracking.

**Overall goal (all phases):** Build the Content Studio per `docs/superpowers/specs/2026-07-10-content-studio-design.md` — an all-in-one content engine (Plan · Create · Library · Calendar · Rules · Posted) where rules materialise editable posts onto a calendar and a dumb cron publishes "due today" to Blotato. Phases build in order 1→2→3→4.

**Phase 1 goal:** Stand up the Studio shell (6 tabs), the content-library data model (`content_categories`, `content_items`), the calendar-entry changes to `social_media_posts`, the **Library** and **Calendar** tabs, and the **`publish-due`** cron **shipped DISABLED** behind a kill switch. Nothing auto-posts until Joey enables it.

**Architecture:** One admin page `/admin/content-studio` with URL-driven tabs. Plan/Create/Posted tabs reuse existing Shoots/social pages/components; Library + Calendar are new, backed by new services/hooks over `content_items` and scheduled `social_media_posts`. `publish-due` reuses the existing Blotato client + caption builder; it's idempotent and gated by a settings kill-switch + created disabled in pg_cron.

**Tech Stack:** React 18 + Vite + TS, TanStack Query, shadcn/ui, React Router, Supabase (Postgres + Edge Functions + pg_cron). Migrations applied via Supabase CLI.

**Safety invariants (do not violate):**
- Never enable the `publish-due` cron (create it `active := false`); never push to `main`.
- All new tables get `GRANT ALL ... TO anon, authenticated, service_role` + RLS.
- Do not regenerate `src/lib/types.ts` (hand-maintained) — add types by hand.
- Preserve existing `social_media_posts` columns/behaviour; only ADD nullable columns.

---

## File structure (created / modified in Phase 1)

**Migrations (create):**
- `supabase/migrations/20260711000000_content_categories.sql`
- `supabase/migrations/20260711000100_content_items.sql`
- `supabase/migrations/20260711000200_social_posts_calendar_columns.sql`
- `supabase/migrations/20260711000300_content_items_backfill_videos.sql`
- `supabase/migrations/20260711000400_app_settings.sql` (kill-switch flag store)
- `supabase/migrations/20260711000500_publish_due_cron.sql` (cron DISABLED)

**Edge function (create):**
- `supabase/functions/publish-due/index.ts`

**Types (modify):**
- `src/lib/types.ts` — add `ContentCategory*`, `ContentItem*`, extend `SocialMediaPost*` with new columns.

**Services (create):**
- `src/services/content-categories.ts`
- `src/services/content-items.ts`
- `src/services/content-calendar.ts` (scheduled-post queries + pin/reschedule)

**Hooks (create):**
- `src/hooks/use-content-categories.ts`
- `src/hooks/use-content-items.ts`
- `src/hooks/use-content-calendar.ts`

**Pages / components (create):**
- `src/pages/admin/content-studio.tsx` (shell + tab router)
- `src/components/content-studio/studio-tabs.tsx`
- `src/components/content-studio/library/library-tab.tsx`
- `src/components/content-studio/library/library-card.tsx`
- `src/components/content-studio/library/rotation-status.ts` (pure: compute rotation label)
- `src/components/content-studio/library/rotation-status.test.ts`
- `src/components/content-studio/calendar/calendar-tab.tsx`
- `src/components/content-studio/calendar/calendar-month.tsx`
- `src/components/content-studio/calendar/calendar-week.tsx`
- `src/components/content-studio/calendar/calendar-model.ts` (pure: bucket posts by day/slot, "due" logic)
- `src/components/content-studio/calendar/calendar-model.test.ts`
- `src/components/content-studio/calendar/add-content-popup.tsx`
- `src/components/content-studio/index.ts` (barrel)

**Routing / nav (modify):**
- `src/routes.tsx` — add `content-studio` route; redirect old `social-media|shoots|video-editor|recorded-videos` paths to the studio tab (keep deep links alive).
- `src/components/layout/sidebar.tsx` — replace the 4 Messaging entries with one **Content Studio** item (+ `AUTO` badge).

---

## Task 1 — Studio shell, routing, sidebar (ship the frame first)

**Files:** create `src/pages/admin/content-studio.tsx`, `src/components/content-studio/studio-tabs.tsx`, `src/components/content-studio/index.ts`; modify `src/routes.tsx`, `src/components/layout/sidebar.tsx`.

- [ ] **1.1** Create `studio-tabs.tsx`: horizontal tab bar (MONO: active = ink pill, inactive = muted), tabs `Plan · Create · Library · Calendar · Rules · Posted`, reads/writes `?tab=` via `useSearchParams` (default `plan`). Rules tab shows a `count` badge slot (unused in P1). Match the Paper flagship shell.
- [ ] **1.2** Create `content-studio.tsx`: `PageHeader` ("Content Studio") + `<StudioTabs/>` + a switch that renders the active panel. P1 wiring:
  - `plan` → render existing Shoots board content (reuse `src/pages/admin/shoots.tsx`'s board; extract its inner board into a component if needed, else render `<ShootsPage/>` inline minus its own PageHeader — simplest: import the existing kanban component used by shoots).
  - `create` → `<CreateHubPlaceholder/>` (simple grid of 4 maker cards linking to existing recorder/editor/routes; full build Phase 3).
  - `library` → `<LibraryTab/>` (Task 6).
  - `calendar` → `<CalendarTab/>` (Task 7).
  - `rules` → `<RulesPlaceholder/>` ("Automations arrive in Phase 2").
  - `posted` → reuse the published view (filter existing social posts `status='published'`), or embed social-media page's published column.
- [ ] **1.3** `routes.tsx`: add `const ContentStudioPage = lazy(() => import('@/pages/admin/content-studio'))` and `{ path: 'content-studio', element: lazyElement(ContentStudioPage) }`. Add redirects: `{ path: 'social-media', element: <Navigate to="/admin/content-studio?tab=posted" replace/> }` etc. for `shoots`→`?tab=plan`, `recorded-videos`→`?tab=library`. Keep `video-editor` route as-is (deep target of Create).
- [ ] **1.4** `sidebar.tsx`: replace the 4 items (Social Media, Shoots, Video Editor, Recorded Videos) in the Messaging section with a single `{ title: 'Content Studio', href: '/admin/content-studio', icon: Clapperboard }`. Keep Messages/Tickets/Feedback. (Reuse the existing `AUTO`-style badge convention if one exists; else plain.)
- [ ] **1.5** Verify: `npm run build` (or `tsc --noEmit` + `vite build`) passes; app boots; clicking Content Studio shows tabs; old links redirect. Commit: `feat(content-studio): studio shell + 6 tabs, consolidate sidebar nav`.

---

## Task 2 — DB: content_categories

**Files:** create `supabase/migrations/20260711000000_content_categories.sql`.

- [ ] **2.1** Write migration:
```sql
create table if not exists public.content_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text not null,               -- hex, drives calendar/chip colour
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.content_categories enable row level security;
create policy "staff read content_categories" on public.content_categories
  for select to authenticated using (true);
create policy "staff write content_categories" on public.content_categories
  for all to authenticated using (true) with check (true);
grant all on public.content_categories to anon, authenticated, service_role;

insert into public.content_categories (name, slug, color, sort_order) values
  ('New Arrivals','new-arrivals','#2E5E7D',1),
  ('Deals','deals','#C52F12',2),
  ('Reviews','reviews','#256B43',3),
  ('Kaitori Explainers','kaitori-explainers','#8A6200',4),
  ('Quotes','quotes','#6D5BA6',5)
on conflict (slug) do nothing;
```
- [ ] **2.2** Apply via CLI (`supabase db push` or `supabase migration up` — whichever the project uses). Verify `select * from content_categories` returns 5 rows.
- [ ] **2.3** Commit: `feat(content-studio): content_categories table + seed`.

---

## Task 3 — DB: content_items

**Files:** create `supabase/migrations/20260711000100_content_items.sql`.

- [ ] **3.1** Write migration (mirror spec §6):
```sql
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('video','carousel','review_card','quote','photo')),
  title text not null,
  category_id uuid references public.content_categories(id) on delete set null,
  media_urls text[] not null default '{}',
  thumbnail_url text,
  item_codes text[],
  orientation text check (orientation in ('portrait','landscape','square')),
  duration_sec numeric,
  source text not null check (source in ('recorder','editor','carousel','review','import')),
  is_evergreen boolean not null default false,
  active_from date,
  active_to date,
  cooldown_days int not null default 0,
  times_posted int not null default 0,
  last_posted_at timestamptz,
  retired_at timestamptz,
  shoot_id uuid references public.shoots(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_content_items_category on public.content_items(category_id);
create index if not exists idx_content_items_kind on public.content_items(kind);
create index if not exists idx_content_items_rotation on public.content_items(retired_at, last_posted_at);

alter table public.content_items enable row level security;
create policy "staff read content_items" on public.content_items for select to authenticated using (true);
create policy "staff write content_items" on public.content_items for all to authenticated using (true) with check (true);
grant all on public.content_items to anon, authenticated, service_role;

-- updated_at trigger (reuse project's set_updated_at() if present; else create)
create or replace function public.content_items_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger content_items_updated_at before update on public.content_items
  for each row execute function public.content_items_touch_updated_at();
```
- [ ] **3.2** Apply + verify table exists (empty).
- [ ] **3.3** Commit: `feat(content-studio): content_items table`.

---

## Task 4 — DB: social_media_posts calendar columns + settings + backfill

**Files:** create `..._social_posts_calendar_columns.sql`, `..._app_settings.sql`, `..._content_items_backfill_videos.sql`.

- [ ] **4.1** `social_posts_calendar_columns.sql`:
```sql
alter table public.social_media_posts
  add column if not exists content_item_id uuid references public.content_items(id) on delete set null,
  add column if not exists rule_id uuid,                 -- FK added in Phase 2 (content_rules)
  add column if not exists origin text not null default 'manual' check (origin in ('manual','rule')),
  add column if not exists category_id uuid references public.content_categories(id) on delete set null;
create index if not exists idx_social_posts_scheduled_at on public.social_media_posts(scheduled_at);
create index if not exists idx_social_posts_origin on public.social_media_posts(origin);
```
- [ ] **4.2** `app_settings.sql` — a tiny key/value store for the kill switch:
```sql
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "staff read app_settings" on public.app_settings for select to authenticated using (true);
create policy "staff write app_settings" on public.app_settings for all to authenticated using (true) with check (true);
grant all on public.app_settings to anon, authenticated, service_role;
insert into public.app_settings(key,value) values ('content_publisher_enabled','false'::jsonb)
  on conflict (key) do nothing;
```
- [ ] **4.3** `content_items_backfill_videos.sql` — seed the Library from existing recorded videos so it isn't empty (idempotent):
```sql
insert into public.content_items (kind, title, category_id, media_urls, thumbnail_url, item_codes, orientation, source, created_by, created_at)
select 'video',
       coalesce(nullif(p.caption,''), 'Recorded video ' || left(p.id::text,8)),
       null,
       p.media_urls,
       null,
       coalesce(p.item_codes, case when p.item_code is not null then array[p.item_code] end),
       'portrait',
       'recorder',
       p.created_by,
       p.created_at
from public.social_media_posts p
where p.post_type = 'video'
  and array_length(p.media_urls,1) >= 1
  and not exists (select 1 from public.content_items ci where ci.media_urls = p.media_urls);
```
- [ ] **4.4** Apply all three. Verify: new columns exist on `social_media_posts`; `app_settings` has `content_publisher_enabled=false`; `content_items` now has one row per existing video.
- [ ] **4.5** Commit: `feat(content-studio): social post calendar columns + settings kill-switch + video backfill`.

---

## Task 5 — Types + services + hooks

**Files:** modify `src/lib/types.ts`; create the 3 services + 3 hooks.

- [ ] **5.1** `types.ts` — hand-add (do NOT regenerate):
```ts
export type ContentCategory = Tables['content_categories']['Row']
export type ContentCategoryInsert = Tables['content_categories']['Insert']
export type ContentItemKind = 'video'|'carousel'|'review_card'|'quote'|'photo'
export type ContentItemSource = 'recorder'|'editor'|'carousel'|'review'|'import'
export type ContentItem = Tables['content_items']['Row']
export type ContentItemInsert = Tables['content_items']['Insert']
export type ContentItemUpdate = Tables['content_items']['Update']
```
(If `database.types.ts` lacks the new tables, add explicit interfaces instead — mirror the SQL columns exactly. Regenerate `database.types.ts` ONLY via CLI to a temp file, copy the two new table blocks in, do not touch types.ts's alias layer.) Then extend `SocialMediaPost`/`Insert`/`Update` with `content_item_id: string|null; rule_id: string|null; origin: 'manual'|'rule'; category_id: string|null`.
- [ ] **5.2** `services/content-categories.ts`: `getContentCategories(): Promise<ContentCategory[]>` (order by sort_order).
- [ ] **5.3** `services/content-items.ts`: `getContentItems(filters?)`, `getContentItem(id)`, `createContentItem(insert)`, `updateContentItem(id, updates)`, `retireContentItem(id)` (`retired_at=now()`), `unretireContentItem(id)`. All try/catch → throw; TanStack query keys `['content-items', filters]`.
- [ ] **5.4** `services/content-calendar.ts`: `getScheduledPosts(rangeStart, rangeEnd)` (social_media_posts where `scheduled_at` in range OR status in scheduled/published, join category colour), `pinContentToSlot(contentItemId, scheduledAt)` (insert social_media_posts: origin='manual', status='scheduled', copies media_urls/item_codes/category_id from the content_item, post_type from kind), `reschedulePost(id, scheduledAt)`, `unpinPost(id)` (delete manual scheduled row).
- [ ] **5.5** Hooks mirroring each service with TanStack Query (`use-content-categories`, `use-content-items`, `use-content-calendar`) + invalidations on mutations.
- [ ] **5.6** Verify `tsc --noEmit`. Commit: `feat(content-studio): types, services, hooks for categories/items/calendar`.

---

## Task 6 — Library tab

**Files:** create `library/rotation-status.ts` (+ test), `library/library-card.tsx`, `library/library-tab.tsx`.

- [ ] **6.1** `rotation-status.ts` — pure fn `rotationStatus(item: ContentItem, opts:{hasRule:boolean; nextDate?:string|null}): { label:string; tone:'muted'|'active'|'warn' }`. Rules: `retired_at` → "Retired"/muted; `hasRule && nextDate` → `In rotation · {times_posted}× · next {date}`/active; `is_evergreen && !hasRule` → "Evergreen (no rule)"/warn; else "Not scheduled"/muted. (Phase 1 always passes `hasRule=false`; the branch exists for Phase 2.)
- [ ] **6.2** `rotation-status.test.ts` — assert each branch. Run: `npx vitest run rotation-status` → PASS.
- [ ] **6.3** `library-card.tsx` — MONO card: thumbnail (or kind-tinted placeholder), kind badge, title, category dot+name, rotation-status chip, and a control row (evergreen toggle, cooldown, active-window, **Retire**). Use existing shadcn `Switch`, `Popover`, `Button`.
- [ ] **6.4** `library-tab.tsx` — filter bar (kind + rotation status) + responsive grid of `library-card`s from `useContentItems`. Empty state. Wire evergreen/retire/cooldown mutations to `useUpdateContentItem`/`useRetireContentItem`.
- [ ] **6.5** Verify visually (dev server, `?tab=library` shows backfilled videos). Commit: `feat(content-studio): Library tab (grid, filters, rotation status, item controls)`.

---

## Task 7 — Calendar tab

**Files:** create `calendar/calendar-model.ts` (+ test), `calendar-month.tsx`, `calendar-week.tsx`, `add-content-popup.tsx`, `calendar-tab.tsx`.

- [ ] **7.1** `calendar-model.ts` — pure helpers: `buildMonthGrid(year, month, posts)` → weeks[] of days[{date, posts[], isToday, inMonth}]; `buildWeekLanes(weekStart, posts)` → per-day time-bucketed lanes; `isPinned(post)`=`origin==='manual'`, `isGhost(post)`=`origin==='rule'`. Dates in JST (project stores UTC; convert for display — reuse existing tz helper if present, else `Intl`/date-fns with Asia/Tokyo).
- [ ] **7.2** `calendar-model.test.ts` — test month grid boundaries (first/last week padding), today flag, pinned vs ghost. Run vitest → PASS.
- [ ] **7.3** `calendar-month.tsx` — month grid; each cell shows category-colour-barred cards (solid pinned / dashed ghost); past days show "N posted"; today highlighted. Prev/next month.
- [ ] **7.4** `calendar-week.tsx` — time lanes, live "now" line, **drag a card to reschedule** (HTML5 DnD or existing dnd lib; on drop call `reschedulePost`), click empty slot → open `add-content-popup` for that slot.
- [ ] **7.5** `add-content-popup.tsx` — search `content_items` (reuse a simple search over `useContentItems`), pick one → `pinContentToSlot(itemId, slotISO)` → closes, calendar refetches. (Match Paper `CBL-1`.)
- [ ] **7.6** `calendar-tab.tsx` — Month/Week toggle + the two views, range→`useScheduledPosts`.
- [ ] **7.7** Verify visually. Commit: `feat(content-studio): Calendar tab (month/week, drag reschedule, add-content pin popup)`.

---

## Task 8 — publish-due edge function + cron (DISABLED)

**Files:** create `supabase/functions/publish-due/index.ts`, `..._publish_due_cron.sql`.

- [ ] **8.1** Read an existing cron→edge-fn migration (e.g. the AI-drafts cron) to copy the hardcoded-URL+anon-key pattern (GUCs unavailable to postgres role — see project memory).
- [ ] **8.2** `publish-due/index.ts`: (a) read `app_settings.content_publisher_enabled`; if false → no-op return `{skipped:true}`. (b) select `social_media_posts where status='scheduled' and scheduled_at <= now()`. (c) per row, **idempotent guard**: `update ... set status='processing' where id=? and status='scheduled'` returning; only proceed if a row was claimed. (d) publish via existing `_shared/blotato.ts publishPost` (Reel for video, carousel for multi-image); generate caption via `_shared/social-caption.ts` if blank. (e) on success set `status='published', published_at=now(), blotato_submission_id`; bump `content_items.times_posted+1, last_posted_at=now()` when `content_item_id` set. (f) on error set `status='failed', error_message`. Reuse the exact client calls `process-social-queue` uses.
- [ ] **8.3** `publish_due_cron.sql`: schedule via `cron.schedule` calling the function URL with anon key, then **immediately disable**: `update cron.job set active = false where jobname = 'publish-due';` (create it disabled). Cadence per spec §14 Q1 — default hourly `0 * * * *` reading "due now"; document that it's off.
- [ ] **8.4** Deploy the function (`supabase functions deploy publish-due`) but keep cron disabled. Verify a manual invoke with the kill-switch false returns `{skipped:true}`.
- [ ] **8.5** Commit: `feat(content-studio): publish-due edge fn + cron (SHIPPED DISABLED behind kill-switch)`.

---

## Phase 1 exit criteria
- Sidebar shows one **Content Studio** entry; old links redirect; 6 tabs render.
- Library shows existing videos with rotation controls; Calendar shows month/week, supports pinning a library item to a slot and dragging to reschedule.
- `publish-due` exists, is idempotent, and is **provably inert** (cron disabled + kill-switch false).
- `tsc --noEmit` + build pass; each task committed atomically on `feat/content-studio`.

## Deferred to later phases
- Rules/materialise engine, ghost cards populated by rules (Phase 2).
- Recorder layout switcher/Retake/shortcuts, talking-head layout, editor improvements, New Shoot reskin, Templates (Phase 3).
- Reviews ingestion, review-card maker, carousel builder (Phase 4).
