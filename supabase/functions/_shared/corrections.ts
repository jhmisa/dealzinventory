import { createClient } from "jsr:@supabase/supabase-js@2";
import { embed } from "./embeddings.ts";
import type { CorrectionExample } from "./build-specialist-prompt.ts";

interface MatchRow {
  id: string;
  customer_message: string;
  correct_reply: string;
  note: string | null;
}

// Retrieve the most relevant APPROVED/PROMOTED corrections for the incoming message. Scopes to the
// classified specialist first; if that returns fewer than matchCount, tops up with an unscoped
// search. Fully NON-FATAL: any failure (including no embedding) returns [].
export async function retrieveCorrections(
  supabase: ReturnType<typeof createClient>,
  customerMessage: string,
  specialistSlug: string | null,
  matchCount = 3,
): Promise<CorrectionExample[]> {
  const embedding = await embed(customerMessage);
  if (!embedding) return [];

  const db = supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const seen = new Set<string>();
  const out: CorrectionExample[] = [];
  const push = (rows: MatchRow[]) => {
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ customer_message: r.customer_message, correct_reply: r.correct_reply, note: r.note });
    }
  };

  try {
    if (specialistSlug) {
      const scoped = await db.rpc('match_ai_corrections', {
        query_embedding: embedding, filter_specialist: specialistSlug, match_count: matchCount,
      });
      if (!scoped.error) push((scoped.data ?? []) as MatchRow[]);
    }
    if (out.length < matchCount) {
      const unscoped = await db.rpc('match_ai_corrections', {
        query_embedding: embedding, filter_specialist: null, match_count: matchCount,
      });
      if (!unscoped.error) push((unscoped.data ?? []) as MatchRow[]);
    }
  } catch (e) {
    console.error('retrieveCorrections failed (non-fatal):', e);
  }
  return out.slice(0, matchCount);
}
