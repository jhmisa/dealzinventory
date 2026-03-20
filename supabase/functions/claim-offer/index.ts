import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClaimOfferInput {
  offer_id: string
  customer_id?: string
  last_name?: string
  first_name?: string
  email?: string
  phone?: string
  shipping_address: string
  delivery_date?: string | null
  delivery_time_code?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: ClaimOfferInput = await req.json();
    const {
      offer_id,
      customer_id,
      last_name,
      first_name,
      email,
      phone,
      shipping_address,
      delivery_date,
      delivery_time_code,
    } = body;

    if (!offer_id) {
      return jsonResponse({ error: 'offer_id is required' });
    }
    if (!shipping_address) {
      return jsonResponse({ error: 'shipping_address is required' });
    }

    // 1. Fetch offer and validate
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('*, offer_items(id, item_id, description, unit_price, quantity)')
      .eq('id', offer_id)
      .single();

    if (offerError || !offer) {
      return jsonResponse({ error: 'Offer not found' });
    }
    if (offer.offer_status !== 'PENDING') {
      return jsonResponse({ error: `Offer is ${offer.offer_status.toLowerCase()}, cannot be claimed` });
    }
    if (new Date(offer.expires_at) < new Date()) {
      return jsonResponse({ error: 'Offer has expired' });
    }

    // 2. Resolve customer
    let resolvedCustomerId: string;

    if (customer_id) {
      // Logged-in customer — verify exists
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('id', customer_id)
        .maybeSingle();

      if (!existing) {
        return jsonResponse({ error: 'Customer not found' });
      }
      resolvedCustomerId = existing.id;
    } else {
      // Guest — find by email or create
      if (!email) {
        return jsonResponse({ error: 'email is required for guest checkout' });
      }
      if (!last_name) {
        return jsonResponse({ error: 'last_name is required for guest checkout' });
      }

      const { data: existingByEmail } = await supabase
        .from('customers')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingByEmail) {
        resolvedCustomerId = existingByEmail.id;
      } else {
        // Generate customer code
        const { data: codeData, error: codeError } = await supabase.rpc('generate_code', {
          prefix: 'C',
          seq_name: 'cust_code_seq',
        });
        if (codeError) {
          return jsonResponse({ error: `Failed to generate customer code: ${codeError.message}` });
        }

        const { data: newCustomer, error: custError } = await supabase
          .from('customers')
          .insert({
            customer_code: codeData as string,
            last_name: String(last_name).toUpperCase(),
            first_name: first_name ? String(first_name).toUpperCase() : null,
            email: String(email),
            phone: phone || null,
          })
          .select()
          .single();

        if (custError) {
          return jsonResponse({ error: `Failed to create customer: ${custError.message}` });
        }
        resolvedCustomerId = newCustomer.id;
      }
    }

    // 3. Generate order code
    const { data: orderCodeData, error: orderCodeError } = await supabase.rpc('generate_code', {
      prefix: 'ORD',
      seq_name: 'ord_code_seq',
    });
    if (orderCodeError) {
      return jsonResponse({ error: `Failed to generate order code: ${orderCodeError.message}` });
    }
    const orderCode = orderCodeData as string;

    // 4. Calculate totals
    const offerItems = (offer.offer_items ?? []) as {
      id: string; item_id: string | null; description: string; unit_price: number; quantity: number
    }[];

    const quantity = offerItems.reduce((sum, oi) => sum + oi.quantity, 0);
    const totalPrice = offerItems.reduce(
      (sum, oi) => sum + Number(oi.unit_price) * oi.quantity,
      0
    );

    // 5. Insert order
    const { data: order, error: orderError2 } = await supabase
      .from('orders')
      .insert({
        order_code: orderCode,
        customer_id: resolvedCustomerId,
        order_source: 'FB',
        order_status: 'CONFIRMED',
        shipping_address,
        quantity,
        total_price: totalPrice,
        delivery_date: delivery_date ?? null,
        delivery_time_code: delivery_time_code ?? null,
        notes: offer.notes || null,
        shipping_cost: 0,
        sell_group_id: null,
      })
      .select()
      .single();

    if (orderError2) {
      return jsonResponse({ error: `Failed to create order: ${orderError2.message}` });
    }

    // 6. Insert order_items from offer_items
    const orderItems = offerItems.map((oi) => ({
      order_id: order.id,
      item_id: oi.item_id,
      description: oi.description,
      quantity: oi.quantity,
      unit_price: Number(oi.unit_price),
      discount: 0,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      // Rollback order
      await supabase.from('orders').delete().eq('id', order.id);
      return jsonResponse({ error: `Failed to create order items: ${itemsError.message}` });
    }

    // 7. Update offer → CLAIMED
    const { error: claimError } = await supabase
      .from('offers')
      .update({
        offer_status: 'CLAIMED',
        order_id: order.id,
        customer_id: resolvedCustomerId,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', offer_id);

    if (claimError) {
      return jsonResponse({ error: `Failed to update offer: ${claimError.message}` });
    }

    return jsonResponse({ order_code: orderCode, order_id: order.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResponse({ error: message });
  }
});

// Always return 200 — supabase.functions.invoke() treats non-2xx as a generic error
function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
