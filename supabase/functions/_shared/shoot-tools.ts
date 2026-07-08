// Tools for the conversational shoot planner. Mirrors the SEARCH_INVENTORY_TOOL shape in
// ai-providers.ts. create_shoot drops a card onto the shoots board's PLANNED lane.
import { createClient } from "jsr:@supabase/supabase-js@2";

export const CREATE_SHOOT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_shoot",
    description:
      "Create a shoot card on the Planned lane once the user confirms the plan. Give it an engaging, " +
      "specific title (e.g. \"5 Gaming Laptops under ¥80,000\") and the real product codes to feature.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Engaging shoot title." },
        item_codes: {
          type: "array",
          items: { type: "string" },
          description: "Real P/G/B codes to feature in the shoot (from search_inventory results).",
        },
        notes: { type: "string", description: "Optional notes for the person shooting." },
      },
      required: ["title", "item_codes"],
    },
  },
};

export interface CreateShootArgs {
  title?: string;
  item_codes?: string[];
  notes?: string;
}

export interface CreateShootResult {
  ok?: boolean;
  shoot?: { id: string; title: string; item_codes: string[] };
  error?: string;
}

export async function createShoot(
  supabase: ReturnType<typeof createClient>,
  args: CreateShootArgs,
): Promise<CreateShootResult> {
  const title = (args.title ?? "").trim();
  if (!title) return { error: "title is required" };
  const item_codes = Array.isArray(args.item_codes)
    ? args.item_codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  // The untyped edge client resolves .from('shoots') to never; cast to a minimal
  // structural shape (same approach as inventory-search.ts's rpc cast) — no `any`.
  const db = supabase as unknown as {
    from: (t: string) => {
      insert: (v: Record<string, unknown>) => {
        select: (c: string) => {
          single: () => Promise<{
            data: { id: string; title: string; item_codes: string[] } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await db
    .from("shoots")
    .insert({ title, item_codes, notes: args.notes ?? null, status: "PLANNED" })
    .select("id, title, item_codes")
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: "insert returned no row" };
  return { ok: true, shoot: data };
}
