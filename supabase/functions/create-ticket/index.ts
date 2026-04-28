import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateTicketInput {
  customer_id: string
  ticket_type_slug: string
  subject: string
  description: string
  order_id?: string
  // Return-specific fields
  reason_category?: string
  items?: { order_item_id: string; reason_note?: string }[]
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

    const body: CreateTicketInput = await req.json();
    const { customer_id, ticket_type_slug, subject, description, order_id, reason_category, items } = body;

    if (!customer_id || !ticket_type_slug || !subject || !description) {
      return jsonResponse({ error: 'customer_id, ticket_type_slug, subject, and description are required' });
    }

    // 1. Look up ticket type
    const { data: ticketType, error: typeError } = await supabase
      .from('ticket_types')
      .select('id, name')
      .eq('slug', ticket_type_slug)
      .eq('is_active', true)
      .single();

    if (typeError || !ticketType) {
      return jsonResponse({ error: 'Invalid ticket type' });
    }

    // 2. Validate customer exists
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .single();

    if (custError || !customer) {
      return jsonResponse({ error: 'Customer not found' });
    }

    // 3. If order_id provided, validate it belongs to customer
    if (order_id) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, order_status, customer_id')
        .eq('id', order_id)
        .single();

      if (orderError || !order) {
        return jsonResponse({ error: 'Order not found' });
      }
      if (order.customer_id !== customer_id) {
        return jsonResponse({ error: 'Order does not belong to this customer' });
      }

      // For RETURN type, validate order status
      if (ticketType.name === 'RETURN') {
        if (!['SHIPPED', 'DELIVERED'].includes(order.order_status)) {
          return jsonResponse({ error: `Cannot create return for order with status: ${order.order_status}` });
        }
      }
    }

    // 4. For RETURN type, validate items
    let returnData: Record<string, unknown> | null = null;
    if (ticketType.name === 'RETURN') {
      if (!order_id) {
        return jsonResponse({ error: 'Order is required for return tickets' });
      }
      if (!items?.length) {
        return jsonResponse({ error: 'At least one item is required for return tickets' });
      }
      if (!reason_category) {
        return jsonResponse({ error: 'Reason category is required for return tickets' });
      }

      // Validate items belong to order
      const orderItemIds = items.map(i => i.order_item_id);
      const { data: orderItems, error: oiError } = await supabase
        .from('order_items')
        .select('id, item_id')
        .eq('order_id', order_id)
        .in('id', orderItemIds);

      if (oiError) {
        return jsonResponse({ error: `Failed to validate items: ${oiError.message}` });
      }
      if (!orderItems || orderItems.length !== orderItemIds.length) {
        return jsonResponse({ error: 'One or more items do not belong to this order' });
      }

      // Check for existing open tickets on same items
      const { data: existingTickets } = await supabase
        .from('tickets')
        .select('id, return_data')
        .eq('order_id', order_id)
        .eq('ticket_type_id', ticketType.id)
        .not('ticket_status', 'in', '("RESOLVED","CLOSED","CANCELLED")');

      if (existingTickets && existingTickets.length > 0) {
        // Check if any of the selected items overlap
        for (const existing of existingTickets) {
          const existingItems = (existing.return_data as { items?: { order_item_id: string }[] })?.items ?? [];
          const existingItemIds = new Set(existingItems.map(i => i.order_item_id));
          const overlap = orderItemIds.some(id => existingItemIds.has(id));
          if (overlap) {
            return jsonResponse({ error: 'One or more items already have an open ticket' });
          }
        }
      }

      const itemIdMap = new Map(orderItems.map(oi => [oi.id, oi.item_id]));
      returnData = {
        reason_category,
        resolution_type: null,
        refund_amount: null,
        items: items.map(i => ({
          order_item_id: i.order_item_id,
          item_id: itemIdMap.get(i.order_item_id) ?? null,
          reason_note: i.reason_note || null,
        })),
      };
    }

    // 5. Generate ticket code
    const { data: codeData, error: codeError } = await supabase.rpc('generate_code', {
      prefix: 'TK',
      seq_name: 'tk_code_seq',
    });
    if (codeError) {
      return jsonResponse({ error: `Failed to generate ticket code: ${codeError.message}` });
    }

    // 6. Insert ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        ticket_code: codeData as string,
        ticket_type_id: ticketType.id,
        customer_id,
        order_id: order_id || null,
        subject,
        description,
        created_by_role: 'customer',
        return_data: returnData,
      })
      .select()
      .single();

    if (ticketError) {
      return jsonResponse({ error: `Failed to create ticket: ${ticketError.message}` });
    }

    return jsonResponse({
      ticket_code: codeData as string,
      ticket_id: ticket.id,
    });
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
