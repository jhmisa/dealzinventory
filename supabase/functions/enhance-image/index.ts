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

  // Poll up to ~60s (20 * 3s).
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(statusUrl, { headers: { 'Authorization': `Key ${apiKey}` } });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === 'COMPLETED') break;
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error(`Fal job failed: ${JSON.stringify(status)}`);
    }
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
  if (!req.headers.get('authorization')) {
    return json({ success: false, error: 'Missing authorization' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { config_id, image_url, prompt } = await req.json();
    if (!image_url) return json({ success: false, error: 'image_url is required' }, 400);

    const query = supabase.from('ai_configurations').select('*');
    const { data: aiConfig, error } = config_id
      ? await query.eq('id', config_id).single()
      : await query.eq('purpose', 'image_enhancement').eq('is_active', true).maybeSingle();

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
