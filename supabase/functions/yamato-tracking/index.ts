import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderInput {
  order_id: string
  tracking_number: string
}

interface TrackingResult {
  order_id: string
  tracking_number: string
  yamato_status: string | null
  delivered: boolean
  issue: boolean
  error?: string
}

// Map Japanese Yamato status text → our status enum
// Ordered longest-first so substring matches (e.g. 発送 vs 発送済み) prefer the longer key
const STATUS_MAP: Record<string, string> = {
  '荷物受付': 'ACCEPTED',
  '発送済み': 'IN_TRANSIT',
  '発送': 'IN_TRANSIT',
  '輸送中': 'IN_TRANSIT',
  '配達完了': 'DELIVERED',
  '配達中': 'OUT_FOR_DELIVERY',
  '持戻': 'FAILED_ATTEMPT',
  '保管中': 'HELD_AT_DEPOT',
  '調査中': 'INVESTIGATING',
  '返品': 'RETURNED',
}

const ISSUE_STATUSES = new Set(['FAILED_ATTEMPT', 'HELD_AT_DEPOT', 'INVESTIGATING', 'RETURNED'])

const YAMATO_PROXY_URL = Deno.env.get('YAMATO_PROXY_URL') ?? ''
const YAMATO_PROXY_KEY = Deno.env.get('YAMATO_PROXY_KEY') ?? ''

/**
 * Parse the Yamato tracking HTML response.
 * The CGI response contains semantic HTML with tracking events:
 *   <div class="item">STATUS</div>
 *   <div class="date">MM月DD日 HH:MM</div>
 * We extract all <div class="item"> entries per tracking number
 * and take the LAST one as the current status.
 */
function parseYamatoResponse(html: string, trackingNumbers: string[]): Map<string, string | null> {
  const results = new Map<string, string | null>()

  for (const tn of trackingNumbers) {
    // Yamato displays tracking numbers with hyphens (e.g. "3803-3191-3824")
    // so search for both the raw number and the hyphenated format
    const hyphenated = tn.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3')
    let tnIndex = html.indexOf(hyphenated)
    const searchLen = tnIndex !== -1 ? hyphenated.length : tn.length
    if (tnIndex === -1) {
      tnIndex = html.indexOf(tn)
    }
    if (tnIndex === -1) {
      results.set(tn, null)
      continue
    }

    // Scope: from the tracking number to the next tracking-invoice-block or end
    const afterTn = html.substring(tnIndex)
    const nextBlockMatch = afterTn.substring(searchLen).search(/tracking-invoice-block-title/)
    const block = nextBlockMatch !== -1
      ? afterTn.substring(0, searchLen + nextBlockMatch)
      : afterTn

    // Extract all <div class="item">STATUS</div> entries
    const itemPattern = /<div\s+class="item">\s*([^<]+?)\s*<\/div>/g
    let lastStatus: string | null = null
    let match: RegExpExecArray | null

    while ((match = itemPattern.exec(block)) !== null) {
      const statusText = match[1].trim()
      if (STATUS_MAP[statusText]) {
        lastStatus = STATUS_MAP[statusText]
      }
    }

    // Fallback: search for known status keywords in the block.
    // Use the LAST occurrence by position in the HTML (most recent event)
    // rather than iterating the map in insertion order.
    if (!lastStatus) {
      let lastIndex = -1
      for (const [jpStatus, enStatus] of Object.entries(STATUS_MAP)) {
        const idx = block.lastIndexOf(jpStatus)
        if (idx > lastIndex) {
          lastIndex = idx
          lastStatus = enStatus
        }
      }
    }

    results.set(tn, lastStatus)
  }

  return results
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

    const body = await req.json();
    const orders: OrderInput[] = body.orders ?? [];

    if (orders.length === 0) {
      return jsonResponse({ results: [], message: 'No orders to check' });
    }

    if (orders.length > 10) {
      return jsonResponse({ error: 'Maximum 10 tracking numbers per request' });
    }

    // Build POST body for Yamato CGI
    const formParams = new URLSearchParams();
    formParams.set('number00', String(orders.length));
    for (let i = 0; i < orders.length; i++) {
      const key = `number${String(i + 1).padStart(2, '0')}`;
      formParams.set(key, orders[i].tracking_number);
    }

    // Fetch via Vercel proxy (Yamato's TLS requires RSA ciphers unsupported by Deno/rustls)
    if (!YAMATO_PROXY_URL) {
      return jsonResponse({ error: 'YAMATO_PROXY_URL not configured' });
    }

    let html: string;
    try {
      const proxyRes = await fetch(YAMATO_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': YAMATO_PROXY_KEY,
        },
        body: JSON.stringify({ formBody: formParams.toString() }),
      });

      if (!proxyRes.ok) {
        const errData = await proxyRes.json().catch(() => ({}));
        return jsonResponse({ error: `Proxy error: ${(errData as Record<string, string>).error ?? proxyRes.statusText}` });
      }

      const proxyData = await proxyRes.json() as { html: string };
      html = proxyData.html;
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : 'Failed to reach proxy';
      return jsonResponse({ error: `Yamato fetch failed: ${message}` });
    }

    // Parse tracking statuses
    const trackingNumbers = orders.map(o => o.tracking_number);
    const statusMap = parseYamatoResponse(html, trackingNumbers);

    // Update each order in DB
    const results: TrackingResult[] = [];

    for (const order of orders) {
      const yamatoStatus = statusMap.get(order.tracking_number) ?? null;
      const result: TrackingResult = {
        order_id: order.order_id,
        tracking_number: order.tracking_number,
        yamato_status: yamatoStatus,
        delivered: false,
        issue: false,
      };

      if (!yamatoStatus) {
        // Couldn't parse status — just update last_checked timestamp
        await supabase
          .from('orders')
          .update({ yamato_last_checked_at: new Date().toISOString() })
          .eq('id', order.order_id);

        result.error = 'Could not parse tracking status';
        results.push(result);
        continue;
      }

      const updateFields: Record<string, unknown> = {
        yamato_status: yamatoStatus,
        yamato_last_checked_at: new Date().toISOString(),
      };

      if (yamatoStatus === 'DELIVERED') {
        updateFields.order_status = 'DELIVERED';
        updateFields.delivery_issue_flag = false;
        result.delivered = true;
      } else if (ISSUE_STATUSES.has(yamatoStatus)) {
        updateFields.delivery_issue_flag = true;
        result.issue = true;
      } else {
        // Normal in-transit status — clear any previous issue flag
        updateFields.delivery_issue_flag = false;
      }

      const { error: updateErr } = await supabase
        .from('orders')
        .update(updateFields)
        .eq('id', order.order_id);

      if (updateErr) {
        result.error = updateErr.message;
      }

      // If delivered, mark items as SOLD
      if (result.delivered) {
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('item_id')
          .eq('order_id', order.order_id)
          .not('item_id', 'is', null);

        const itemIds = (orderItems ?? [])
          .map((oi: { item_id: string | null }) => oi.item_id)
          .filter((id: string | null): id is string => !!id);

        if (itemIds.length > 0) {
          await supabase
            .from('items')
            .update({ item_status: 'SOLD' })
            .in('id', itemIds);
        }
      }

      results.push(result);
    }

    return jsonResponse({ results });
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
