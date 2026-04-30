import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { startLiveSession, endLiveSession, addSessionSale } from '@/services/live-sessions'

export type SessionSale = {
  itemId: string
  itemCode: string
  description: string
  amount: number | null
  customerName: string
  orderCode: string
  orderId: string
  timestamp: Date
}

const chaChingAudio = typeof window !== 'undefined' ? new Audio('/sounds/cha-ching.mp3') : null

/**
 * Hook that subscribes to order_items inserts and shows toast notifications
 * when a live-selling item gets ordered. Also tracks recently-ordered item IDs
 * for row highlighting (auto-clears after 10s).
 *
 * Extended with live session tracking: start/end session, track sales, play sound.
 */
export function useLiveSellingRealtime(enabled: boolean) {
  const [recentlyOrderedItemIds, setRecentlyOrderedItemIds] = useState<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Session state
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [sessionSales, setSessionSales] = useState<SessionSale[]>([])
  const sessionIdRef = useRef<string | null>(null)

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

  const startSession = useCallback(async (staffName: string) => {
    try {
      const id = await startLiveSession(staffName)
      sessionIdRef.current = id
      setSessionSales([])
      setIsSessionActive(true)
    } catch (err) {
      toast.error('Failed to start live session')
      console.error(err)
    }
  }, [])

  const endSession = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return []

    const finalSales = sessionSales
    try {
      await endLiveSession(sessionId, finalSales.length)
    } catch (err) {
      console.error('Failed to end session:', err)
    }

    sessionIdRef.current = null
    setIsSessionActive(false)
    setSessionSales([])
    return finalSales
  }, [sessionSales])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel('live-selling-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_items' },
        async (payload) => {
          const { item_id, order_id } = payload.new as { item_id: string; order_id: string }

          // Check if this item is live-selling — also fetch description fields
          const { data: item } = await supabase
            .from('items')
            .select('id, item_code, is_live_selling, selling_price, brand, model_name, cpu, ram_gb, storage_gb, screen_size, supplier_description, product_models(brand, model_name, screen_size, categories(description_fields))')
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

          // Session tracking: persist sale + play sound
          if (sessionIdRef.current) {
            // Build description
            const pm = item.product_models as { brand: string; model_name: string; screen_size: number | null; categories: { description_fields: string[] } | null } | null
            const brand = item.brand ?? pm?.brand ?? ''
            const modelName = item.model_name ?? pm?.model_name ?? ''
            const desc = [brand, modelName, item.cpu, item.ram_gb, item.storage_gb]
              .filter(Boolean)
              .join(' ')
            const description = desc || item.supplier_description || item.item_code

            const sale: SessionSale = {
              itemId: item.id,
              itemCode: item.item_code,
              description,
              amount: item.selling_price,
              customerName: name,
              orderCode: order.order_code,
              orderId: order.id,
              timestamp: new Date(),
            }

            setSessionSales((prev) => [...prev, sale])

            // Persist to database (fire and forget)
            addSessionSale(sessionIdRef.current, {
              itemId: sale.itemId,
              itemCode: sale.itemCode,
              description: sale.description,
              amount: sale.amount,
              customerName: sale.customerName,
              orderId: sale.orderId,
              orderCode: sale.orderCode,
            }).catch((err) => console.error('Failed to persist sale:', err))

            // Play cha-ching sound
            if (chaChingAudio) {
              chaChingAudio.currentTime = 0
              chaChingAudio.play().catch(() => {})
            }
          }
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

  return { recentlyOrderedItemIds, isSessionActive, sessionSales, startSession, endSession }
}
