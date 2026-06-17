import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCustomerContext,
  formatContextForPrompt,
  getRecentMessagesByCustomer,
} from "../_shared/build-ai-context.ts";
import { generateAIReply, type AIProvider } from "../_shared/ai-providers.ts";
import { buildSpecialistSystemPrompt, type SpecialistRow } from "../_shared/build-specialist-prompt.ts";
import { modelSupportsVision, type VisionImage } from "../_shared/ai-vision.ts";
import { searchInventory, deriveOfferCodes, type InventorySearchResult } from "../_shared/inventory-search.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestMessage {
  role: 'customer' | 'assistant';
  content: string;
}

interface TestOffer {
  code: string;
  description: string;
  price: number | null;
  image_url: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, customer_id, images }: {
      messages: TestMessage[];
      customer_id?: string;
      images?: VisionImage[];
    } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch active AI provider
    const { data: provider } = await serviceClient
      .from('ai_providers')
      .select('id, name, provider, model_id, api_key_encrypted')
      .eq('is_active', true)
      .eq('purpose', 'messaging')
      .maybeSingle();

    if (!provider) {
      return new Response(JSON.stringify({ error: 'No active AI provider configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Using AI provider:', provider.name, provider.provider, provider.model_id);

    // Fetch active persona
    const { data: persona } = await serviceClient
      .from('messaging_persona')
      .select('system_prompt')
      .eq('is_active', true)
      .maybeSingle();

    if (!persona?.system_prompt) {
      return new Response(JSON.stringify({ error: 'No active persona configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch active guardrails + knowledge base (with specialist tags)
    const { data: kbEntries } = await serviceClient
      .from('knowledge_base')
      .select('entry_type, title, content, specialist_tags')
      .eq('is_active', true)
      .order('sort_order');

    const entries = (kbEntries ?? []) as Array<{
      entry_type: string;
      title: string;
      content: string;
      specialist_tags: string[] | null;
    }>;
    const guardrails = entries
      .filter((e) => e.entry_type === 'guardrail')
      .map((e) => ({ title: e.title, content: e.content }));
    const knowledge = entries
      .filter((e) => e.entry_type === 'knowledge')
      .map((e) => ({ title: e.title, content: e.content, specialist_tags: e.specialist_tags ?? [] }));

    // Fetch active specialists (per-topic playbooks)
    const { data: specialistRows } = await serviceClient
      .from('messaging_specialists')
      .select('slug, name, intents, playbook, always_escalate, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    const specialists = (specialistRows ?? []) as SpecialistRow[];

    const fullSystemPrompt = buildSpecialistSystemPrompt({
      guardrails,
      personaSystemPrompt: persona.system_prompt,
      knowledge,
      specialists,
    });

    // Always build context — inventory data doesn't require a customer
    const context = await buildCustomerContext(serviceClient, customer_id ?? null, 'test-playground');
    // The typed test transcript (chatMessages below) is the live thread. For the
    // "Recent Conversation" context block, inject the selected customer's REAL
    // message history so the AI understands prior context like production does.
    // No customer selected → no prior history (the transcript is all there is).
    context.recentMessages = customer_id
      ? await getRecentMessagesByCustomer(serviceClient, customer_id)
      : [];
    const contextBlock = formatContextForPrompt(context);

    // Call AI
    const chatMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Vision: forward uploaded images only when the active model supports them
    // (keeps parity with generate-draft and avoids sending images to text-only models).
    const latestImages = modelSupportsVision(
      (provider as AIProvider).provider,
      (provider as AIProvider).model_id,
    )
      ? (images ?? []).slice(0, 3)
      : [];

    // Tool: wire search_inventory exactly like generate-draft so availability asks
    // run a real live-inventory search. Accumulate results by code to attach the
    // offered product's photo to the reply.
    const offerCatalog = new Map<string, InventorySearchResult>();
    // Capture any tool failure verbatim so the playground can surface it (the model
    // otherwise paraphrases it into a vague "search tool error" escalation).
    const toolErrors: string[] = [];
    // Trace every search the model ran (query + result codes) so the playground can show
    // whether/what it searched — an empty trace means the model answered WITHOUT searching.
    const toolCalls: { query: string; result_count: number; codes: string[] }[] = [];
    const executeTool = async (name: string, args: unknown): Promise<unknown> => {
      if (name !== 'search_inventory') return { error: `unknown tool: ${name}` };
      const a = (args ?? {}) as Record<string, unknown>;
      const query = String(a.query ?? '');
      try {
        const results = await searchInventory(serviceClient, {
          query,
          category_id: a.category_id ? String(a.category_id) : undefined,
          brand: a.brand ? String(a.brand) : undefined,
          price_min: a.price_min != null ? Number(a.price_min) : undefined,
          price_max: a.price_max != null ? Number(a.price_max) : undefined,
        });
        for (const r of results) offerCatalog.set(r.code, r);
        toolCalls.push({ query, result_count: results.length, codes: results.map((r) => r.code) });
        return results.map((r) => ({
          type: r.type, code: r.code, description: r.description,
          grade: r.grade, price: r.price, available_count: r.available_count, order_url: r.order_url,
        }));
      } catch (toolErr) {
        const detail = toolErr instanceof Error
          ? `${toolErr.message}${toolErr.stack ? `\n${toolErr.stack}` : ''}`
          : JSON.stringify(toolErr);
        console.error('search_inventory tool failed:', detail);
        toolErrors.push(detail);
        toolCalls.push({ query, result_count: -1, codes: [] });
        return { error: detail };
      }
    };

    const aiResponse = await generateAIReply(
      provider as AIProvider,
      fullSystemPrompt,
      contextBlock,
      chatMessages,
      latestImages,
      executeTool,
    );

    // Surface the offered product photo(s) for the playground (display_url from
    // photo-group-media is public-read, so it renders directly — no storage upload).
    // Derive codes from the reply (links/bare codes) so the photo shows whenever the AI
    // offers something, not only when it remembered to fill offer_codes.
    const offers: TestOffer[] = deriveOfferCodes(aiResponse.reply, aiResponse.offer_codes, offerCatalog)
      .map((code) => {
        const r = offerCatalog.get(code);
        if (!r) return null;
        return {
          code: r.code,
          description: r.description,
          price: r.price,
          image_url: r.display_url ?? r.thumbnail_url,
        } as TestOffer;
      })
      .filter((o): o is TestOffer => o !== null);

    return new Response(JSON.stringify({ ...aiResponse, offers, tool_errors: toolErrors, tool_calls: toolCalls }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('test-ai-reply error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
