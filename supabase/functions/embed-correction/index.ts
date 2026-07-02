import { createClient } from "jsr:@supabase/supabase-js@2";
import { embed } from "../_shared/embeddings.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { id } = await req.json();
    if (!id) return json({ error: "missing id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error: readErr } = await supabase
      .from("ai_corrections").select("id, customer_message").eq("id", id).single();
    if (readErr || !row) return json({ error: `correction not found: ${readErr?.message ?? "unknown"}` }, 404);

    const embedding = await embed(row.customer_message as string);
    if (!embedding) return json({ error: "embedding unavailable in this runtime" }, 503);

    const { error: updErr } = await supabase
      .from("ai_corrections").update({ embedding }).eq("id", id);
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
