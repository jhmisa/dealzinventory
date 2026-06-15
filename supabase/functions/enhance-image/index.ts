import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveFalModelUrl, extractFalImageUrl } from "./fal.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const MAX_POLLS = 20;
const POLL_INTERVAL_MS = 3000;

// Submit to Fal queue, then poll until COMPLETED (bounded).
async function runFal(modelUrl: string, apiKey: string, input: Record<string, unknown>): Promise<string> {
  const submit = await fetch(modelUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${apiKey}` },
    body: JSON.stringify(input),
  });
  if (!submit.ok) {
    throw new Error(`Fal submit error ${submit.status}: ${await submit.text()}`);
  }
  const submitJson = await submit.json();
  const statusUrl: string = submitJson.status_url ?? `${modelUrl}/requests/${submitJson.request_id}/status`;
  const responseUrl: string = submitJson.response_url ?? `${modelUrl}/requests/${submitJson.request_id}`;

  // Poll up to ~60s (MAX_POLLS * POLL_INTERVAL_MS).
  let completed = false;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await fetch(statusUrl, { headers: { 'Authorization': `Key ${apiKey}` } });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === 'COMPLETED') { completed = true; break; }
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error(`Fal job failed: ${JSON.stringify(status)}`);
    }
  }
  if (!completed) {
    throw new Error(`Fal job did not complete within ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`);
  }

  const resultRes = await fetch(responseUrl, { headers: { 'Authorization': `Key ${apiKey}` } });
  if (!resultRes.ok) {
    throw new Error(`Fal result error ${resultRes.status}: ${await resultRes.text()}`);
  }
  const result = await resultRes.json();
  const imageUrl = extractFalImageUrl(result);
  if (!imageUrl) throw new Error('No image URL found in Fal response');
  return imageUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ success: false, error: 'Missing authorization header' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ success: false, error: 'Invalid or expired token' }, 401);
  }

  try {
    const { config_id, image_url, prompt } = await req.json();
    if (!image_url) return json({ success: false, error: 'image_url is required' }, 400);

    const { data: aiConfig, error } = config_id
      ? await supabase.from('ai_configurations').select('*').eq('id', config_id).single()
      : await supabase
          .from('ai_configurations')
          .select('*')
          .eq('purpose', 'image_enhancement')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

    if (error || !aiConfig) {
      return json({ success: false, error: 'No active image_enhancement AI configuration found.' }, 400);
    }

    const modelUrl = resolveFalModelUrl(aiConfig.api_endpoint_url, aiConfig.model_id);
    const resultUrl = await runFal(modelUrl, aiConfig.api_key_encrypted, {
      image_url,
      prompt: prompt ?? '',
    });

    return json({ success: true, image_url: resultUrl });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
