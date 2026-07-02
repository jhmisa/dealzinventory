// Local text embeddings via Supabase's built-in gte-small model (384-dim). `Supabase.ai` exists
// only inside the Supabase edge runtime, so embed() is GUARDED and NON-FATAL: callers treat a
// null return as "skip semantic memory" and continue normally.

// deno-lint-ignore no-explicit-any
const supabaseAi = (globalThis as any).Supabase?.ai;

export async function embed(text: string): Promise<number[] | null> {
  const input = (text ?? '').trim();
  if (!input) return null;
  if (!supabaseAi) {
    console.error('embeddings: Supabase.ai unavailable in this runtime — skipping embedding');
    return null;
  }
  try {
    const session = new supabaseAi.Session('gte-small');
    // mean_pool + normalize -> a unit-length 384-d vector suitable for cosine distance.
    const output = await session.run(input, { mean_pool: true, normalize: true });
    return output as number[];
  } catch (e) {
    console.error('embeddings: embed() failed (non-fatal):', e);
    return null;
  }
}
