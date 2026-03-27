import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' });
  }

  // Verify caller is authenticated and has ADMIN role
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Invalid or expired token' });
  }

  const { data: callerProfile, error: profileError } = await supabaseUser
    .from('staff_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !callerProfile || callerProfile.role !== 'ADMIN') {
    return jsonResponse({ error: 'Forbidden: only ADMIN users can set passwords' });
  }

  try {
    const body = await req.json();
    const { user_id, password } = body as {
      user_id?: string;
      password?: string;
    };

    if (!user_id || !password) {
      return jsonResponse({ error: 'Missing required fields: user_id, password' });
    }

    if (password.length < 8) {
      return jsonResponse({ error: 'Password must be at least 8 characters' });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password,
    });

    if (updateError) {
      return jsonResponse({ error: updateError.message });
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});
