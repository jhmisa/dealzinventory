import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendViaMissive, type MessageAttachment } from "../_shared/send-via-missive.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSIVE_API_TOKEN = Deno.env.get('MISSIVE_API_TOKEN') ?? '';
const MISSIVE_API_URL = 'https://public.missiveapp.com/v1';
const MISSIVE_MESSENGER_ACCOUNT_ID = Deno.env.get('MISSIVE_MESSENGER_ACCOUNT_ID') ?? '';

// ---------- Main handler ----------

Deno.serve(async (req) => {
  // Top-level catch — ensures we ALWAYS return a 200 JSON response
  // so `supabase.functions.invoke()` never sees a non-2xx status
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('Failed to parse request body:', parseErr);
      return jsonResponse({ error: 'Invalid JSON in request body' });
    }

    // Health check endpoint (no auth required)
    if (body.health_check) {
      if (!MISSIVE_API_TOKEN) {
        return jsonResponse({ error: 'MISSIVE_API_TOKEN not configured' });
      }
      try {
        const res = await fetch(`${MISSIVE_API_URL}/organizations`, {
          headers: { Authorization: `Bearer ${MISSIVE_API_TOKEN}` },
        });
        // 200 = success, 403 = token valid but no access (still connected)
        if (res.status === 401) {
          return jsonResponse({ error: 'MISSIVE_API_TOKEN is invalid' });
        }
        return jsonResponse({ ok: true, connected: true });
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : 'Network error' });
      }
    }

    // Env check — log which vars are present for debugging
    const hasUrl = !!Deno.env.get('SUPABASE_URL');
    const hasAnon = !!Deno.env.get('SUPABASE_ANON_KEY');
    const hasService = !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const hasMissive = !!MISSIVE_API_TOKEN;
    const hasMessengerAccount = !!MISSIVE_MESSENGER_ACCOUNT_ID;
    console.log('Env check:', { hasUrl, hasAnon, hasService, hasMissive, hasMessengerAccount });

    if (!hasUrl || !hasAnon || !hasService) {
      return jsonResponse({
        error: 'Missing Supabase env vars',
        details: { hasUrl, hasAnon, hasService },
      });
    }

    // All other endpoints require staff auth
    const authHeader = req.headers.get('Authorization') ?? '';
    console.log('Auth header present:', !!authHeader, 'length:', authHeader.length);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error('Auth failed:', authError?.message ?? 'no user');
      return jsonResponse({ error: `Auth failed: ${authError?.message ?? 'Invalid or expired token'}` });
    }
    console.log('Authenticated as:', user.id, user.email);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { conversation_id, content, approve_draft_id, attachments: inputAttachments } = body as unknown as {
      conversation_id: string; content: string; approve_draft_id?: string; attachments?: MessageAttachment[];
    };
    if (!conversation_id || !content) {
      return jsonResponse({ error: "conversation_id and content are required" });
    }

    const result = await sendViaMissive(supabase, {
      conversationId: conversation_id,
      content,
      attachments: inputAttachments,
      approveDraftId: approve_draft_id,
      sentBy: user.id,
      autoSent: false,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error, message_id: result.messageId });
    }
    return jsonResponse({ ok: true, message_id: result.messageId, missive_message_id: result.missiveMessageId });
  } catch (err) {
    // Absolute last resort — log everything and still return 200 JSON
    console.error('FATAL send-message error:', err);
    const message = err instanceof Error ? `${err.message}\n${err.stack}` : 'Internal server error';
    return jsonResponse({ error: message });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
