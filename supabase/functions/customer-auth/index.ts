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
        return await handleResetPin(supabase, req, body);
      case 'forgot_pin_request':
        return await handleForgotPinRequest(supabase, body);
      case 'forgot_pin_complete':
        return await handleForgotPinComplete(supabase, body);
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

  let { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('last_name', nameUpper)
    .or(`email.eq.${contact},phone.eq.${contact}`)
    .maybeSingle();

  // E.164 fallback: if no match and phone is in E.164 format, retry with local format
  // +819012345678 → 09012345678 (Japan)
  // +639171234567 → 09171234567 (Philippines)
  if (!customer && contact.startsWith('+81')) {
    const localPhone = '0' + contact.slice(3);
    const { data: fallback } = await supabase
      .from('customers')
      .select('*')
      .eq('last_name', nameUpper)
      .eq('phone', localPhone)
      .maybeSingle();
    customer = fallback;
  } else if (!customer && contact.startsWith('+63')) {
    const localPhone = '0' + contact.slice(3);
    const { data: fallback } = await supabase
      .from('customers')
      .select('*')
      .eq('last_name', nameUpper)
      .eq('phone', localPhone)
      .maybeSingle();
    customer = fallback;
  }

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

// --- Reset PIN (staff-only, requires Supabase Auth session) ---
async function handleResetPin(
  supabase: ReturnType<typeof createClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  // Require a valid staff Supabase Auth JWT. supabase.functions.invoke() from the
  // admin frontend automatically attaches the session, so authorized staff calls
  // pass through unchanged; anon / signed-out callers are now rejected.
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  const jwt = authHeader?.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return jsonResponse({ error: 'Unauthorized' });
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Unauthorized' });
  }

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

// --- Forgot PIN: request a 6-digit code by email (customer-facing) ---
async function handleForgotPinRequest(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const { last_name, email } = body;

  // Always respond success — never reveal whether the (name, email) pair exists.
  const successResponse = jsonResponse({ success: true });

  if (!last_name || !email) {
    return successResponse;
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .eq('last_name', String(last_name).toUpperCase())
    .eq('email', String(email))
    .maybeSingle();

  if (!customer || !customer.email) {
    return successResponse;
  }

  // Invalidate any prior unused token for this customer (one outstanding code at a time).
  await supabase
    .from('customer_pin_resets')
    .update({ used_at: new Date().toISOString() })
    .eq('customer_id', customer.id)
    .is('used_at', null);

  // Generate a 6-digit code, store its sha-256 hash, give it a 15-minute TTL.
  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  const tokenHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase
    .from('customer_pin_resets')
    .insert({
      customer_id: customer.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (insertErr) {
    // Don't leak DB failures to the client; log to function logs only.
    console.error('forgot_pin_request insert failed:', insertErr.message);
    return successResponse;
  }

  try {
    const displayName = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'there';
    await sendEmailViaResend({
      to: customer.email,
      subject: 'Your Dealz PIN reset code',
      html: forgotPinEmailHtml(displayName, code),
    });
  } catch (mailErr) {
    console.error('forgot_pin_request email failed:', mailErr instanceof Error ? mailErr.message : mailErr);
    // Still return success — privacy and to allow staff fallback.
  }

  return successResponse;
}

// --- Forgot PIN: verify the code and set a new PIN (customer-facing) ---
async function handleForgotPinComplete(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const { last_name, email, code, new_pin } = body;

  if (!last_name || !email || !code || !new_pin) {
    return jsonResponse({ error: 'last_name, email, code, and new_pin are required' });
  }
  if (!/^\d{6}$/.test(String(code))) {
    return jsonResponse({ error: 'Code must be 6 digits' });
  }
  if (!/^\d{6}$/.test(String(new_pin))) {
    return jsonResponse({ error: 'PIN must be exactly 6 digits' });
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('last_name', String(last_name).toUpperCase())
    .eq('email', String(email))
    .maybeSingle();

  // Generic error for any mismatch path — never reveal which field was wrong.
  const invalid = jsonResponse({ error: 'Code is invalid or has expired' });

  if (!customer) {
    return invalid;
  }

  const { data: token } = await supabase
    .from('customer_pin_resets')
    .select('id, token_hash, attempts, expires_at, used_at')
    .eq('customer_id', customer.id)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!token) {
    return invalid;
  }

  if (new Date(token.expires_at).getTime() < Date.now()) {
    return invalid;
  }

  if (token.attempts >= 5) {
    // Burn the token so further guesses are pointless even if expiry hasn't hit.
    await supabase
      .from('customer_pin_resets')
      .update({ used_at: new Date().toISOString() })
      .eq('id', token.id);
    return jsonResponse({ error: 'Too many attempts. Please request a new code.' });
  }

  const submittedHash = await sha256Hex(String(code));
  if (submittedHash !== token.token_hash) {
    await supabase
      .from('customer_pin_resets')
      .update({ attempts: token.attempts + 1 })
      .eq('id', token.id);
    return invalid;
  }

  // Code is valid — update the PIN and consume the token.
  const newPinHash = await hashPin(supabase, String(new_pin));
  const { error: updateErr } = await supabase
    .from('customers')
    .update({ pin_hash: newPinHash })
    .eq('id', customer.id);

  if (updateErr) {
    return jsonResponse({ error: `Failed to update PIN: ${updateErr.message}` });
  }

  await supabase
    .from('customer_pin_resets')
    .update({ used_at: new Date().toISOString() })
    .eq('id', token.id);

  return jsonResponse({ success: true });
}

// --- Email + hash helpers ---

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sendEmailViaResend(args: { to: string; subject: string; html: string }) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY or EMAIL_FROM not configured');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${text}`);
  }
}

function forgotPinEmailHtml(name: string, code: string): string {
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, sans-serif; color:#111; max-width:480px; margin:0 auto; padding:24px;">
  <h2 style="margin:0 0 16px;">Dealz PIN reset</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Use this code to set a new PIN for your Dealz account:</p>
  <p style="font-size:28px; font-weight:700; letter-spacing:6px; margin:24px 0; text-align:center; background:#f5f5f5; padding:16px; border-radius:8px;">${code}</p>
  <p style="color:#666; font-size:14px;">This code expires in 15 minutes. If you didn't request a PIN reset, you can safely ignore this email.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' :
    '&#39;'
  ));
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
