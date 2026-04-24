import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClaimMineInput {
  code: string
  customer_id: string
  shipping_address: string
  delivery_date?: string | null
  delivery_time_code?: string | null
  payment_method?: string
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

    const body: ClaimMineInput = await req.json();
    const {
      code,
      customer_id,
      shipping_address,
      delivery_date,
      delivery_time_code,
      payment_method,
    } = body;

    if (!code) return jsonResponse({ error: 'code is required' });
    if (!customer_id) return jsonResponse({ error: 'customer_id is required' });
    if (!shipping_address) return jsonResponse({ error: 'shipping_address is required' });

    // Map payment method to numeric code
    const PAYMENT_METHOD_CODES: Record<string, number> = {
      COD: 2, CREDIT_CARD: 2, BANK: 0, KONBINI: 0, CASH: 0, PAYPAL: 0,
    };
    const payment_method_code = payment_method
      ? (PAYMENT_METHOD_CODES[payment_method] ?? 0)
      : null;

    // Verify customer exists
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .maybeSingle();

    if (!customer) return jsonResponse({ error: 'Customer not found' });

    // Parse code prefix
    const match = code.match(/^([PGA])(\d{6})$/i);
    if (!match) return jsonResponse({ error: 'Invalid code format' });

    const prefix = match[1].toUpperCase();
    let itemId: string | null = null;
    let accessoryId: string | null = null;
    let description = '';
    let unitPrice = 0;
    let quantity = 1;

    if (prefix === 'P') {
      // Fetch item by P-code
      const { data: item, error: itemError } = await supabase
        .from('items')
        .select('id, item_code, item_status, condition_grade, selling_price, product_id, product_models(brand, model_name)')
        .eq('item_code', code.toUpperCase())
        .maybeSingle();

      if (itemError || !item) return jsonResponse({ error: 'Item not found' });
      if (item.item_status !== 'AVAILABLE') return jsonResponse({ error: 'Item is not available' });
      if (item.condition_grade === 'J') return jsonResponse({ error: 'This item cannot be sold (grade J)' });

      itemId = item.id;
      const pm = item.product_models as { brand: string; model_name: string } | null;
      description = pm ? `${pm.brand} ${pm.model_name}` : item.item_code;
      unitPrice = item.selling_price ?? 0;

    } else if (prefix === 'G') {
      // Fetch sell group
      const { data: sg, error: sgError } = await supabase
        .from('sell_groups')
        .select('id, sell_group_code, active, base_price, product_id, product_models(brand, model_name)')
        .ilike('sell_group_code', code.toUpperCase())
        .maybeSingle();

      if (sgError || !sg) return jsonResponse({ error: 'Sell group not found' });
      if (!sg.active) return jsonResponse({ error: 'This sell group is not active' });

      // Find first available item in the sell group that's not already in an order
      const { data: sgi } = await supabase
        .from('sell_group_items')
        .select('item_id, items!inner(id, item_status, condition_grade)')
        .eq('sell_group_id', sg.id)
        .eq('items.item_status', 'AVAILABLE')
        .neq('items.condition_grade', 'J');

      if (!sgi || sgi.length === 0) return jsonResponse({ error: 'No available items in this sell group' });

      // Filter out items already in orders
      const candidateIds = sgi.map(s => s.item_id);
      const { data: orderedItems } = await supabase
        .from('order_items')
        .select('item_id')
        .in('item_id', candidateIds);

      const orderedSet = new Set((orderedItems ?? []).map(o => o.item_id));
      const availableItem = candidateIds.find(id => !orderedSet.has(id));

      if (!availableItem) return jsonResponse({ error: 'All items in this sell group are already claimed' });

      itemId = availableItem;
      const pm = sg.product_models as { brand: string; model_name: string } | null;
      description = pm ? `${pm.brand} ${pm.model_name}` : sg.sell_group_code;
      unitPrice = sg.base_price ?? 0;

    } else if (prefix === 'A') {
      // Fetch accessory
      const { data: acc, error: accError } = await supabase
        .from('accessories')
        .select('id, accessory_code, name, brand, selling_price, stock_quantity, active')
        .eq('accessory_code', code.toUpperCase())
        .maybeSingle();

      if (accError || !acc) return jsonResponse({ error: 'Accessory not found' });
      if (!acc.active) return jsonResponse({ error: 'This accessory is not available' });
      if (acc.stock_quantity <= 0) return jsonResponse({ error: 'This accessory is out of stock' });

      accessoryId = acc.id;
      description = [acc.brand, acc.name].filter(Boolean).join(' ');
      unitPrice = acc.selling_price;
    }

    // Generate order code
    const { data: orderCodeData, error: orderCodeError } = await supabase.rpc('generate_code', {
      prefix: 'ORD',
      seq_name: 'ord_code_seq',
    });
    if (orderCodeError) return jsonResponse({ error: `Failed to generate order code: ${orderCodeError.message}` });
    const orderCode = orderCodeData as string;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_code: orderCode,
        customer_id,
        order_source: 'FB',
        order_status: 'CONFIRMED',
        shipping_address,
        quantity,
        total_price: unitPrice * quantity,
        delivery_date: delivery_date ?? null,
        delivery_time_code: delivery_time_code ?? null,
        payment_method: payment_method ?? null,
        payment_method_code,
        shipping_cost: 0,
        sell_group_id: null,
      })
      .select()
      .single();

    if (orderError) return jsonResponse({ error: `Failed to create order: ${orderError.message}` });

    // Create order item
    const { error: oiError } = await supabase
      .from('order_items')
      .insert({
        order_id: order.id,
        item_id: itemId,
        accessory_id: accessoryId,
        description,
        quantity,
        unit_price: unitPrice,
        discount: 0,
      });

    if (oiError) {
      // Rollback order
      await supabase.from('orders').delete().eq('id', order.id);
      // Check for unique constraint (double-claim)
      if (oiError.code === '23505') {
        return jsonResponse({ error: 'This item has already been claimed by another customer' });
      }
      return jsonResponse({ error: `Failed to create order item: ${oiError.message}` });
    }

    // Reserve the item (P/G-code)
    if (itemId) {
      await supabase
        .from('items')
        .update({ item_status: 'RESERVED' })
        .eq('id', itemId)
        .eq('item_status', 'AVAILABLE');
    }

    // Decrement accessory stock (A-code)
    if (accessoryId) {
      const { data: newQty, error: stockError } = await supabase.rpc('decrement_accessory_stock', {
        p_accessory_id: accessoryId,
        p_quantity: quantity,
      });
      if (stockError || newQty === null) {
        // Rollback
        await supabase.from('order_items').delete().eq('order_id', order.id);
        await supabase.from('orders').delete().eq('id', order.id);
        return jsonResponse({ error: 'Insufficient stock for this accessory' });
      }
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
