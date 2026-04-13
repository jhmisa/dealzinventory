import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCustomerContext, formatContextForPrompt } from "../_shared/build-ai-context.ts";
import { generateAIReply, type AIProvider } from "../_shared/ai-providers.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestMessage {
  role: 'customer' | 'assistant';
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check — require staff JWT
    const authHeader = req.headers.get('authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messages, customer_id }: { messages: TestMessage[]; customer_id?: string } =
      await req.json();

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role client for data access
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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch active persona
    const { data: persona } = await serviceClient
      .from('messaging_persona')
      .select('system_prompt')
      .eq('is_active', true)
      .maybeSingle();

    if (!persona?.system_prompt) {
      return new Response(JSON.stringify({ error: 'No active persona configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch active guardrails + knowledge base
    const { data: kbEntries } = await serviceClient
      .from('knowledge_base')
      .select('entry_type, title, content')
      .eq('is_active', true)
      .order('sort_order');

    const entries = kbEntries ?? [];
    const guardrails = entries.filter((e: { entry_type: string }) => e.entry_type === 'guardrail');
    const knowledge = entries.filter((e: { entry_type: string }) => e.entry_type === 'knowledge');

    // Build full system prompt: guardrails first, then persona, then knowledge
    let fullSystemPrompt = '';

    if (guardrails.length > 0) {
      const rules = guardrails
        .map((g: { title: string; content: string }, i: number) => `${i + 1}. **${g.title}**: ${g.content}`)
        .join('\n');
      fullSystemPrompt += `# Rules (NEVER violate)\n${rules}\n\n`;
    }

    fullSystemPrompt += persona.system_prompt;

    if (knowledge.length > 0) {
      const articles = knowledge
        .map((k: { title: string; content: string }) => `## ${k.title}\n${k.content}`)
        .join('\n\n');
      fullSystemPrompt += `\n\n# Knowledge Base\n${articles}`;
    }

    // Build customer context if customer_id provided
    let contextBlock = '';
    if (customer_id) {
      // Use 'test-playground' as a sentinel conversation ID — buildCustomerContext
      // will still fetch customer data but won't find messages for this fake ID
      const context = await buildCustomerContext(serviceClient, customer_id, 'test-playground');
      // Override recentMessages with our test messages for context
      context.recentMessages = [];
      contextBlock = formatContextForPrompt(context);
    }

    // Call AI
    const chatMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const aiResponse = await generateAIReply(
      provider as AIProvider,
      fullSystemPrompt,
      contextBlock,
      chatMessages,
    );

    return new Response(JSON.stringify(aiResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
