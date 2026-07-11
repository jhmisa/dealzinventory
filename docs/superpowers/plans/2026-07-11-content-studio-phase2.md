# Content Studio — Phase 2 Implementation Plan (Categories + Rules + rotation engine)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use `- [ ]` tracking.

**Phase 2 goal:** Automations. A **rule** (pool + cadence + pick strategy) that **materialises editable ghost posts** onto the calendar up to a horizon, via a `materialize-rules` edge fn. Rules tab + New Rule builder; Library rotation controls (active-window + cooldown); ghost (dashed) cards populated; Library rotation-status wired to real upcoming rule posts. **The materialiser only creates `status='scheduled'` editable posts — it NEVER publishes.** Publisher stays disabled (Phase 1 kill switch untouched).

**Architecture:** `content_rules` table drives a `materialize-rules` edge fn (idempotent per `(rule_id, scheduled_at)`). The app invokes it on rule create/edit so ghosts appear immediately; a `materialize-rules` cron is created **DISABLED** (safe — no posting — but off for control). Cadence is `{ days: int[] (0-6), time: 'HH:MM' }` (JST). "In rotation" for an item = it has a future `origin='rule'` post → drives the Library rotation chip.

**Tech stack:** same as Phase 1. Migrations via CLI. Deno edge fn.

**Safety invariants:** never enable `publish-due` cron or `content_publisher_enabled`; never push to main; new tables get grants + RLS; hand-edit `types.ts`; `materialize-rules` inserts only `status='scheduled'` (editable), never calls Blotato.

---

## File structure (Phase 2)

- Migration `supabase/migrations/20260711010000_content_rules.sql` (table + rule_id FK)
- Migration `supabase/migrations/20260711010100_materialize_rules_cron.sql` (cron DISABLED)
- Edge fn `supabase/functions/materialize-rules/index.ts` + `supabase/functions/materialize-rules/slots.ts` + `slots.test.ts` (Deno pure slot computation)
- `src/lib/types.ts` — ContentRule aliases + RuleCadence type
- `src/services/content-rules.ts` + `src/hooks/use-content-rules.ts`
- `src/services/content-calendar.ts` — add `getUpcomingRulePostsByItem()` (item_id → next date)
- `src/hooks/use-content-calendar.ts` — add `useUpcomingRulePosts()`
- `src/components/content-studio/rules/rules-tab.tsx`, `rule-form-dialog.tsx`, `cadence-summary.ts` (+ test)
- `src/components/content-studio/library/library-card.tsx` + `library-tab.tsx` — active-window/cooldown editor + real rotation status
- `src/pages/admin/content-studio.tsx` — Rules tab → `<RulesTab/>`; Rules tab count badge

---

## Task 1 — DB: content_rules + rule_id FK

- [ ] **1.1** `20260711010000_content_rules.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.content_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.content_categories(id) ON DELETE CASCADE,
  cadence jsonb NOT NULL DEFAULT '{"days":[1,3,5],"time":"18:00"}'::jsonb, -- { days:int[0-6], time:'HH:MM' } JST
  pick_strategy text NOT NULL DEFAULT 'lru' CHECK (pick_strategy IN ('lru','random','newest')),
  platform text NOT NULL DEFAULT 'facebook',
  account_id text,
  page_id text,
  materialize_horizon_days int NOT NULL DEFAULT 14,
  active boolean NOT NULL DEFAULT true,
  active_from date,
  active_to date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_rules_active ON public.content_rules(active);
ALTER TABLE public.content_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_rules_auth_all ON public.content_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.content_rules TO anon, authenticated, service_role;
CREATE TRIGGER update_content_rules_updated_at BEFORE UPDATE ON public.content_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Now that content_rules exists, add the deferred FK from Phase 1.
ALTER TABLE public.social_media_posts
  ADD CONSTRAINT social_media_posts_rule_id_fkey
  FOREIGN KEY (rule_id) REFERENCES public.content_rules(id) ON DELETE SET NULL;
```
- [ ] **1.2** Apply via `supabase db push --yes`. Regenerate `database.types.ts` via CLI to temp, verify `content_rules:` present, copy over. `tsc --noEmit`.
- [ ] **1.3** `types.ts`: `export type ContentRule = Tables['content_rules']['Row']` + Insert/Update; `export interface RuleCadence { days: number[]; time: string }`.
- [ ] **1.4** Commit `feat(content-studio): content_rules table + rule_id FK + types`.

## Task 2 — Services + hooks

- [ ] **2.1** `services/content-rules.ts`: `getContentRules()`, `getContentRule(id)`, `createContentRule(insert)`, `updateContentRule(id, updates)`, `deleteContentRule(id)`, `setRuleActive(id, active)`, and `materializeRules()` = `supabase.functions.invoke('materialize-rules', { body: {} })` (fire-and-forget; returns count).
- [ ] **2.2** `services/content-calendar.ts`: add `getUpcomingRulePostsByItem(): Promise<Map<string,string>>` — select `content_item_id, scheduled_at` from social_media_posts where `origin='rule'` and `status='scheduled'` and `scheduled_at >= now()`; reduce to earliest per content_item_id.
- [ ] **2.3** `hooks/use-content-rules.ts`: `useContentRules`, `useCreateContentRule` (onSuccess also invokes materializeRules + invalidates calendar), `useUpdateContentRule` (same), `useDeleteContentRule`, `useSetRuleActive`. Add query keys `contentRules`.
- [ ] **2.4** `hooks/use-content-calendar.ts`: `useUpcomingRulePosts()` query.
- [ ] **2.5** `tsc --noEmit`. Commit `feat(content-studio): content-rules service + hooks + upcoming-rule-posts`.

## Task 3 — materialize-rules edge fn + DISABLED cron

- [ ] **3.1** `supabase/functions/materialize-rules/slots.ts` (pure, Deno): `dueSlots(fromISO, horizonDays, days, time): string[]` — for each JST calendar day in [from, from+horizon], if weekday ∈ days, emit ISO of `${dayKey}T${time}:00+09:00` when >= fromISO. Helpers `jstDayKey`, `shiftDayKey`, `weekdayOf` (mirror calendar-model, JST).
- [ ] **3.2** `slots.test.ts` (Deno `Deno.test` or node:assert run via `deno test`): assert count for a 14-day window with days=[1,3,5], slots are in JST at the right time, none before `from`.
- [ ] **3.3** `materialize-rules/index.ts`:
  - service-role client; load active rules (`active=true`, within active_from/active_to).
  - for each rule: `slots = dueSlots(now, horizon, cadence.days, cadence.time)`.
  - fetch existing `(rule_id, scheduled_at)` posts for this rule in window → skip slots already materialised.
  - build eligible pool: `content_items` where `category_id = rule.category_id` AND `retired_at IS NULL` AND (`is_evergreen` true) AND within `active_from/active_to` AND not within `cooldown_days` of `last_posted_at`.
  - if pool empty → skip rule (log).
  - for each un-materialised slot, pick by strategy (lru = min last_posted_at nulls first; random = index by slot to stay deterministic-ish; newest = max created_at), rotating through the pool so consecutive slots differ; insert `social_media_posts` (origin='rule', rule_id, content_item_id, category_id, media_urls, item_codes, caption=item.title, post_type video/product, status='scheduled', schedule_type='scheduled', scheduled_at=slot).
  - return `{ materialized: N }`. NEVER call Blotato.
- [ ] **3.4** Deploy: `supabase functions deploy materialize-rules`. Smoke: invoke with no rules → `{materialized:0}`.
- [ ] **3.5** `20260711010100_materialize_rules_cron.sql`: `trigger_materialize_rules()` (net.http_post to the fn, hardcoded URL+anon like publish-due) + `cron.schedule('content-materialize-rules','15 * * * *', ...)` then `cron.alter_job(active:=false)` (created DISABLED; safe but off — app invokes on demand). Apply.
- [ ] **3.6** Commit `feat(content-studio): materialize-rules edge fn (ghosts only, no publish) + disabled cron`.

## Task 4 — Rules tab + New Rule builder

- [ ] **4.1** `rules/cadence-summary.ts` (pure) + test: `cadenceSummary({days,time}): string` → e.g. "Every Mon, Wed & Fri at 18:00", "Every day at 09:00", "Weekdays at 12:00". Run via `npx tsx`.
- [ ] **4.2** `rules/rule-form-dialog.tsx`: New/Edit rule. Fields: name; **pool** (category select, colour dot); **cadence** — preset chips (Daily / Weekdays / Custom) + 7 day toggles + time input; **pick strategy** (LRU/Random/Newest segmented); **active window** (optional from/to dates); live **plain-English preview** via cadenceSummary; Create/Save. On submit → useCreate/UpdateContentRule (which materialises).
- [ ] **4.3** `rules/rules-tab.tsx`: list rules as cards — name, pool dot+name, cadence summary, pick strategy, **active toggle**, materialised-count (from useUpcomingRulePosts filtered by rule) , Edit/Delete. Empty state + "New Rule" button opens the dialog.
- [ ] **4.4** `content-studio.tsx`: `rules` tab → `<RulesTab/>`; pass a count to `StudioTabs` (number of active rules) if easy.
- [ ] **4.5** `tsc` + commit `feat(content-studio): Rules tab + New Rule builder`.

## Task 5 — Library rotation controls + real status

- [ ] **5.1** `library-card.tsx`: add a "Schedule settings" popover — active-from/active-to date inputs + cooldown_days number — saving via `onUpdateSchedule(item, { active_from, active_to, cooldown_days })`. Accept a `rotation` prop `{ hasRule: boolean; nextDate?: string }` and pass to `rotationStatus`.
- [ ] **5.2** `library-tab.tsx`: call `useUpcomingRulePosts()`; build item→nextDate map; pass `rotation={{ hasRule: map.has(id), nextDate: fmt(map.get(id)) }}` to each card; wire the schedule-settings save to `useUpdateContentItem`.
- [ ] **5.3** `tsc` + commit `feat(content-studio): Library active-window + cooldown controls + real rotation status`.

## Task 6 — Verify + milestone

- [ ] **6.1** Playwright (dev-staff login): create a rule (pool with evergreen items — first mark a couple Library videos evergreen so the pool is non-empty), confirm ghost (dashed) cards appear on the Calendar and the Rules tab shows the rule; confirm a Library card shows "In rotation · next …". Clean up test rule + its ghost posts. Screenshot. 0 console errors.
- [ ] **6.2** Update PROJECT_STATE; commit. Milestone show-and-tell to Joey.

## Phase 2 exit criteria
- A rule materialises editable ghost posts onto the calendar (dashed), never publishes; publisher still disabled.
- Rules tab CRUD + active toggle; Library shows active-window/cooldown + real rotation status.
- All migrations applied via CLI; `tsc` green; new pure tests pass; atomic commits.
