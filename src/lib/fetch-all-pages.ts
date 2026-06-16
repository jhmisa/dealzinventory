import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Fetch every row of a query, transparently paging past PostgREST's `max-rows`
 * cap (1000 on Supabase). A single unbounded `.select()` silently returns at
 * most 1000 rows, so list queries on tables that can exceed 1000 rows must page.
 *
 * `page(from, to)` must build a FRESH query each call (a PostgREST builder is
 * single-use once awaited), already filtered/ordered, and apply `.range(from, to)`.
 * The query MUST have a stable final ordering key (e.g. a trailing `.order('id')`)
 * so rows can't shift across page boundaries and get skipped or duplicated.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}
