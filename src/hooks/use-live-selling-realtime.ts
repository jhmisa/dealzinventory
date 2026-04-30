import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

/**
 * Hook that subscribes to order_items inserts and shows toast notifications
 * when a live-selling item gets ordered. Also tracks recently-ordered item IDs
 * for row highlighting (auto-clears after 10s).
 */
export function useLiveSellingRealtime(enabled: boolean) {
  const [recentlyOrderedItemIds, setRecentlyOrderedItemIds] = useState<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const addRecentItem = useCallback((itemId: string) => {
    setRecentlyOrderedItemIds((prev) => new Set(prev).add(itemId))

    // Clear any existing timer for this item
    const existing = timersRef.current.get(itemId)
    if (existing) clearTimeout(existing)

    // Auto-remove after 10 seconds
    const timer = setTimeout(() => {
      setRecentlyOrderedItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
      timersRef.current.delete(itemId)
    }, 10_000)
    timersRef.current.set(itemId, timer)
  }, [])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel('live-selling-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_items' },
        async (payload) => {
          const { item_id, order_id } = payload.new as { item_id: string; order_id: string }

          // Check if this item is live-selling
          const { data: item } = await supabase
            .from('items')
            .select('id, item_code, is_live_selling')
            .eq('id', item_id)
            .single()

          if (!item?.is_live_selling) return

          // Fetch order + customer
          const { data: order } = await supabase
            .from('orders')
            .select('id, order_code, customers(first_name, last_name)')
            .eq('id', order_id)
            .single()

          if (!order) return

          const customer = order.customers as { first_name: string | null; last_name: string } | null
          const name = customer
            ? `${customer.first_name ?? ''} ${customer.last_name}`.trim()
            : 'A customer'

          toast.success(`${name} ordered ${item.item_code}!`, {
            description: order.order_code,
            duration: 8000,
          })

          addRecentItem(item.id)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      // Clean up all timers
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [enabled, addRecentItem])

  return { recentlyOrderedItemIds }
}
