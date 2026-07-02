import { createClient } from "jsr:@supabase/supabase-js@2";

export interface ItemSpecs {
  resolved_by: 'code' | 'model';
  code: string;
  brand: string | null;
  model_name: string | null;
  model_number: string | null;
  condition_grade: string | null;
  battery_health_pct: number | null;
  has_cellular: boolean | null;
  is_unlocked: boolean | null;
  carrier: string | null;
  has_touchscreen: boolean | null;
  supports_stylus: boolean | null;
  cpu: string | null;
  gpu: string | null;
  chipset: string | null;
  ram_gb: string | null;
  storage_gb: string | null;
  screen_size: number | null;
  os_family: string | null;
  ports: string | null;
  color: string | null;
  year: number | null;
  condition_notes: string | null;
  price: number | null;
  units_may_vary: boolean;
}

// Look up structured specs for a specific item/model via the get_item_full_specs RPC.
// Returns the resolved row, or { found: false } so the model can ask for a code.
export async function getItemSpecs(
  supabase: ReturnType<typeof createClient>,
  args: { code?: string; query?: string },
): Promise<ItemSpecs | { found: false }> {
  // Member-access on the client so `this` stays bound (supabase-js rpc reads this.rest).
  const db = supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await db.rpc('get_item_full_specs', {
    p_code: args.code ?? null,
    p_query: args.query ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as ItemSpecs[];
  return rows[0] ?? { found: false };
}
