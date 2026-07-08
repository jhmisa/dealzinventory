// Conversational shoot planner. The marketer chats; the AI searches live inventory and, on
// confirmation, creates a shoot card on the PLANNED lane. Reuses the messaging AI's
// SEARCH_INVENTORY_TOOL + searchInventory; adds a CREATE_SHOOT tool. Self-contained tool loop
// (conversational — unlike runChatCompletionWithTools which is tuned for JSON offer replies).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SEARCH_INVENTORY_TOOL } from "../_shared/ai-providers.ts";
import { searchInventory } from "../_shared/inventory-search.ts";
import { CREATE_SHOOT_TOOL, createShoot } from "../_shared/shoot-tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOOL_ROUNDS = 4;

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = [
  "You are the Dealz shoot planner. You help the marketing team decide what products to feature in a",
  "live-selling or product video shoot.",
  "- All prices are in Japanese yen (¥) — always use the ¥ symbol, never $ or ₹.",
  "- Use the search_inventory tool to find REAL available stock (never invent codes or prices).",
  "- Propose an engaging, specific shoot title and a short list of real product codes (P/G/B).",
  "- Keep replies short and action-oriented. Show the codes you picked and why.",
  "- When the user confirms (\"yes\", \"create it\", \"make the shoot\"), call create_shoot with the title and codes.",
  "- Stay strictly a shoot planner — do not answer unrelated questions or write captions.",
].join(" ");

interface ToolCall { id: string; type: string; function: { name: string; arguments: string } }
interface LoopMsg { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const incoming: Array<{ role: string; content: string }> = Array.isArray(body?.messages) ? body.messages : [];
    if (incoming.length === 0) return json({ error: "messages required" }, 400);

    const { data: provider } = await supabase
      .from("ai_providers")
      .select("model_id, api_key_encrypted")
      .eq("is_active", true)
      .eq("purpose", "messaging")
      .maybeSingle();
    if (!provider) return json({ error: "No active AI provider (purpose=messaging)" }, 400);

    const messages: LoopMsg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...incoming.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    ];

    // The generated client's generics differ slightly from the shared helpers' expected
    // ReturnType<createClient>; cast once (both helpers share the same param type).
    const sb = supabase as unknown as Parameters<typeof searchInventory>[0];

    const searchedCodes = new Set<string>();
    let createdShootId: string | null = null;
    const toolTrace: Array<{ name: string; ok: boolean }> = [];

    const executeTool = async (name: string, args: unknown): Promise<unknown> => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (name === "search_inventory") {
        const results = await searchInventory(sb, {
          query: String(a.query ?? ""),
          category_id: a.category_id ? String(a.category_id) : undefined,
          brand: a.brand ? String(a.brand) : undefined,
          price_min: a.price_min != null ? Number(a.price_min) : undefined,
          price_max: a.price_max != null ? Number(a.price_max) : undefined,
        });
        for (const r of results) searchedCodes.add(r.code);
        toolTrace.push({ name, ok: true });
        return results.map((r) => ({
          code: r.code, description: r.description, grade: r.grade,
          price: r.price, available_count: r.available_count,
        }));
      }
      if (name === "create_shoot") {
        const res = await createShoot(sb, {
          title: a.title ? String(a.title) : undefined,
          item_codes: Array.isArray(a.item_codes) ? (a.item_codes as unknown[]).map(String) : [],
          notes: a.notes ? String(a.notes) : undefined,
        });
        if (res.ok && res.shoot) createdShootId = res.shoot.id;
        toolTrace.push({ name, ok: Boolean(res.ok) });
        return res;
      }
      return { error: `unknown tool ${name}` };
    };

    // Conversational tool loop (no forced json_object — we want a chat reply).
    let reply = "";
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const includeTools = round < MAX_TOOL_ROUNDS;
      const reqBody: Record<string, unknown> = { model: provider.model_id, max_tokens: 700, messages };
      if (includeTools) reqBody.tools = [SEARCH_INVENTORY_TOOL, CREATE_SHOOT_TOOL];

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key_encrypted}` },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) {
        const t = await res.text();
        return json({ error: `AI error ${res.status}: ${t.slice(0, 300)}` }, 502);
      }
      const data = await res.json();
      const msg = data?.choices?.[0]?.message as LoopMsg | undefined;
      const toolCalls = msg?.tool_calls ?? [];

      if (!toolCalls.length || !includeTools) {
        reply = typeof msg?.content === "string" ? msg.content : "";
        break;
      }
      messages.push({ role: "assistant", content: msg?.content ?? null, tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let parsed: unknown = {};
        try { parsed = JSON.parse(tc.function.arguments || "{}"); } catch { parsed = {}; }
        let result: unknown;
        try { result = await executeTool(tc.function.name, parsed); }
        catch (err) { result = { error: err instanceof Error ? err.message : "tool error" }; }
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }

    return json({
      reply,
      createdShootId,
      codes: Array.from(searchedCodes),
      toolCalls: toolTrace,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "error" }, 500);
  }
});
