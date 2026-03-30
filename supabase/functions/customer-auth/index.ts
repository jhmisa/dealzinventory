import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'register':
        return await handleRegister(supabase, body);
      case 'login':
        return await handleLogin(supabase, body);
      case 'change_pin':
        return await handleChangePin(supabase, body);
      case 'reset_pin':
        return await handleResetPin(supabase, body);
      default:
        return jsonResponse({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResponse({ error: message });
  }
});

// Use PostgreSQL pgcrypto for bcrypt hashing (available in all Supabase projects)
async function hashPin(supabase: ReturnType<typeof createClient>, pin: string): Promise<string> {
  const { data, error } = await supabase.rpc('_hash_pin', { pin_text: pin });
  if (error) throw new Error(`Hash failed: ${error.message}`);
  return data as string;
}

async function verifyPin(supabase: ReturnType<typeof createClient>, pin: string, hash: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('_verify_pin', { pin_text: pin, pin_hash: hash });
  if (error) throw new Error(`Verify failed: ${error.message}`);
  return data as boolean;
}

// --- Register ---
async function handleRegister(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const {
    customer_code,
    last_name,
    first_name,
    email,
    phone,
    pin,
    shipping_address,
  } = body;

  if (!customer_code || !last_name || !pin) {
    return jsonResponse({ error: 'customer_code, last_name, and pin are required' });
  }

  // Check for duplicate email or phone
  if (email) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      return jsonResponse({ error: 'A customer with this email already exists' });
    }
  }

  if (phone) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    if (existing) {
      return jsonResponse({ error: 'A customer with this phone number already exists' });
    }
  }

  // Hash the PIN via pgcrypto
  const pin_hash = await hashPin(supabase, String(pin));

  // Insert customer
  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      customer_code,
      last_name: String(last_name),
      first_name: first_name ? String(first_name) : null,
      email: email ? String(email) : null,
      phone: phone ? String(phone) : null,
      pin_hash,
      shipping_address: shipping_address ? JSON.stringify(shipping_address) : null,
    })
    .select()
    .single();

  if (error) {
    return jsonResponse({ error: `Failed to create customer: ${error.message}` });
  }

  return jsonResponse({ customer });
}

// --- Login ---
async function handleLogin(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const { last_name, email_or_phone, pin } = body;

  if (!last_name || !email_or_phone || !pin) {
    return jsonResponse({ error: 'last_name, email_or_phone, and pin are required' });
  }

  // Find customer by last_name + (email or phone)
  const nameUpper = String(last_name).toUpperCase();
  const contact = String(email_or_phone);

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('last_name', nameUpper)
    .or(`email.eq.${contact},phone.eq.${contact}`)
    .maybeSingle();

  if (!customer) {
    return jsonResponse({ error: 'Invalid credentials' });
  }

  // Verify PIN
  const valid = await verifyPin(supabase, String(pin), customer.pin_hash);
  if (!valid) {
    return jsonResponse({ error: 'Invalid credentials' });
  }

  // Return customer (strip pin_hash) with a simple token
  const { pin_hash: _, ...safeCustomer } = customer;
  const token = crypto.randomUUID(); // Simple session token for MVP

  return jsonResponse({ customer: safeCustomer, token });
}

// --- Change PIN ---
async function handleChangePin(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const { customer_id, current_pin, new_pin } = body;

  if (!customer_id || !current_pin || !new_pin) {
    return jsonResponse({ error: 'customer_id, current_pin, and new_pin are required' });
  }

  // Fetch customer
  const { data: customer } = await supabase
    .from('customers')
    .select('pin_hash')
    .eq('id', customer_id)
    .maybeSingle();

  if (!customer) {
    return jsonResponse({ error: 'Customer not found' });
  }

  // Verify current PIN
  const valid = await verifyPin(supabase, String(current_pin), customer.pin_hash);
  if (!valid) {
    return jsonResponse({ error: 'Current PIN is incorrect' });
  }

  // Hash and update new PIN
  const new_pin_hash = await hashPin(supabase, String(new_pin));
  const { error } = await supabase
    .from('customers')
    .update({ pin_hash: new_pin_hash })
    .eq('id', customer_id);

  if (error) {
    return jsonResponse({ error: `Failed to update PIN: ${error.message}` });
  }

  return jsonResponse({ success: true });
}

// --- Reset PIN (admin, no current PIN required) ---
async function handleResetPin(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const { customer_id, new_pin } = body;

  if (!customer_id || !new_pin) {
    return jsonResponse({ error: 'customer_id and new_pin are required' });
  }

  if (!/^\d{6}$/.test(String(new_pin))) {
    return jsonResponse({ error: 'PIN must be exactly 6 digits' });
  }

  // Verify customer exists
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .maybeSingle();

  if (!customer) {
    return jsonResponse({ error: 'Customer not found' });
  }

  // Hash and update new PIN
  const new_pin_hash = await hashPin(supabase, String(new_pin));
  const { error } = await supabase
    .from('customers')
    .update({ pin_hash: new_pin_hash })
    .eq('id', customer_id);

  if (error) {
    return jsonResponse({ error: `Failed to reset PIN: ${error.message}` });
  }

  return jsonResponse({ success: true });
}

// --- Helpers ---
// Always return 200 — supabase.functions.invoke() treats non-2xx as a generic error
// and hides the actual message. Errors are indicated by an `error` field in the body.
function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
