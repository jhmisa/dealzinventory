import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Creates a customer order from the public shop checkout.
//
// Customers authenticate with the custom PIN system (NOT Supabase Auth), so the
// browser's anon client cannot insert into `orders`/`order_items` (RLS allows
// only authenticated staff). This function runs with the service-role key and
// re-derives price + item availability from the DB so the client cannot forge
// either. Mirrors services/orders.ts `pickAvailableItemsFromSellGroup` +
// `createManualOrder` (shop variant: shipping_cost 0, default PENDING status).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlaceShopOrderInput {
  customer_id: string
  order_source: string
  sell_group_id: string
  quantity: number
  shipping_address: string
  delivery_date?: string | null
  delivery_time_code?: string | null
  payment_method?: string | null
  receiver_first_name?: string | null
  receiver_last_name?: string | null
  receiver_phone?: string | null
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

    const body: PlaceShopOrderInput = await req.json();
    const {
      customer_id,
      order_source,
      sell_group_id,
      quantity,
      shipping_address,
      delivery_date,
      delivery_time_code,
      payment_method,
      receiver_first_name,
      receiver_last_name,
      receiver_phone,
    } = body;

    if (!customer_id) return jsonResponse({ error: 'customer_id is required' });
    if (!sell_group_id) return jsonResponse({ error: 'sell_group_id is required' });
    if (!shipping_address) return jsonResponse({ error: 'shipping_address is required' });
    const qty = Number(quantity) || 0;
    if (qty < 1) return jsonResponse({ error: 'quantity must be at least 1' });

    // Verify the customer exists (don't let callers place orders for unknown ids)
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .maybeSingle();
    if (!customer) return jsonResponse({ error: 'Customer not found' });

    // --- Resolve the sell group ---
    const { data: sg, error: sgError } = await supabase
      .from('sell_groups')
      .select('id, sell_group_code, product_models(brand, model_name)')
      .eq('id', sell_group_id)
      .maybeSingle();
    if (sgError || !sg) return jsonResponse({ error: 'Sell group not found' });

    // --- Pick `qty` available items (server-side, authoritative pricing) ---
    const { data: sgi } = await supabase
      .from('sell_group_items')
      .select('item_id, items!inner(id, item_code, item_status, condition_grade, selling_price, discount)')
      .eq('sell_group_id', sell_group_id)
      .eq('items.item_status', 'AVAILABLE')
      .neq('items.condition_grade', 'J');

    if (!sgi || sgi.length === 0) {
      return jsonResponse({ error: 'No available items in this sell group' });
    }

    // Exclude items already attached to an order
    const candidateIds = sgi.map((s) => s.item_id);
    const { data: orderedItems } = await supabase
      .from('order_items')
      .select('item_id')
      .in('item_id', candidateIds);
    const orderedSet = new Set((orderedItems ?? []).map((o) => o.item_id));
    const available = sgi.filter((s) => !orderedSet.has(s.item_id));

    if (available.length < qty) {
      return jsonResponse({ error: `Only ${available.length} item(s) available, requested ${qty}` });
    }

    const pm = sg.product_models as { brand: string; model_name: string } | null;
    const description = pm ? `${pm.brand} ${pm.model_name}` : sg.sell_group_code;

    const picked = available.slice(0, qty).map((entry) => {
      const item = entry.items as { id: string; selling_price: number | null; discount: number | null };
      return {
        item_id: item.id,
        unit_price: item.selling_price ?? 0,
        discount: item.discount ? Number(item.discount) : 0,
      };
    });

    // Shop checkout charges no shipping at checkout (staff add it later).
    const shippingCost = 0;
    const totalPrice =
      picked.reduce((sum, p) => sum + p.unit_price - p.discount, 0) + shippingCost;

    // --- Generate the order code + insert the order ---
    const { data: orderCodeData, error: orderCodeError } = await supabase.rpc('generate_code', {
      prefix: 'ORD',
      seq_name: 'ord_code_seq',
    });
    if (orderCodeError) {
      return jsonResponse({ error: `Failed to generate order code: ${orderCodeError.message}` });
    }
    const orderCode = orderCodeData as string;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_code: orderCode,
        customer_id,
        order_source,
        shipping_address,
        quantity: qty,
        total_price: totalPrice,
        delivery_date: delivery_date ?? null,
        delivery_time_code: delivery_time_code ?? null,
        payment_method: payment_method ?? null,
        receiver_first_name: receiver_first_name ?? null,
        receiver_last_name: receiver_last_name ?? null,
        receiver_phone: receiver_phone ?? null,
        shipping_cost: shippingCost,
        sell_group_id: null,
      })
      .select()
      .single();
    if (orderError) {
      return jsonResponse({ error: `Failed to create order: ${orderError.message}` });
    }

    // --- Insert order items (unique constraint on item_id guards double-sale) ---
    const orderItems = picked.map((p) => ({
      order_id: order.id,
      item_id: p.item_id,
      accessory_id: null,
      description,
      quantity: 1,
      unit_price: p.unit_price,
      discount: p.discount,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);
    if (itemsError) {
      // Roll back the order so we don't leave an empty shell
      await supabase.from('orders').delete().eq('id', order.id);
      if (itemsError.code === '23505') {
        return jsonResponse({ error: 'One of these items was just ordered by someone else. Please try again.' });
      }
      return jsonResponse({ error: `Failed to create order items: ${itemsError.message}` });
    }

    // Mark the purchased items as RESERVED (mirrors createManualOrder)
    const itemIds = picked.map((p) => p.item_id);
    if (itemIds.length > 0) {
      await supabase
        .from('items')
        .update({ item_status: 'RESERVED' })
        .in('id', itemIds);
    }

    return jsonResponse({ order_code: orderCode, order_id: order.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResponse({ error: message });
  }
});

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
