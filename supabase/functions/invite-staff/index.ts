import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Always return 200 — supabase.functions.invoke() treats non-2xx as a generic error
// and hides the actual message. Errors are indicated by an `error` field in the body.
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
    return jsonResponse({ error: 'Forbidden: only ADMIN users can invite staff' });
  }

  try {
    const body = await req.json();
    const { email, display_name, role } = body as {
      email?: string;
      display_name?: string;
      role?: string;
    };

    if (!email || !display_name || !role) {
      return jsonResponse({ error: 'Missing required fields: email, display_name, role' });
    }

    // Use service role client for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Create the auth user with a random password and email pre-confirmed
    const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });

    if (createUserError || !newUser.user) {
      return jsonResponse({ error: createUserError?.message ?? 'Failed to create user' });
    }

    // Insert the staff_profiles row
    const { data: profile, error: insertError } = await supabaseAdmin
      .from('staff_profiles')
      .insert({
        id: newUser.user.id,
        email,
        display_name,
        role,
        is_active: true,
      })
      .select()
      .single();

    if (insertError || !profile) {
      // Attempt to clean up the orphaned auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return jsonResponse({ error: insertError?.message ?? 'Failed to create staff profile' });
    }

    return jsonResponse({ profile });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});
