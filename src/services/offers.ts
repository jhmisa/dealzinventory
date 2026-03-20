import { supabase } from '@/lib/supabase'
import type { Offer, Item } from '@/lib/types'
import { createManualOrder } from './orders'

// --- Code Generation ---

async function generateOfferCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'OFR',
    seq_name: 'ofr_code_seq',
  })
  if (error) throw error
  return data as string
}

// --- Core CRUD ---

interface CreateOfferInput {
  fb_name: string
  item_id: string
  price: number
  description: string
  notes?: string
  created_by?: string
}

export async function createOfferOrAddItem(input: CreateOfferInput) {
  // Check if item is already in a PENDING offer
  const { data: existingOfferItem } = await supabase
    .from('offer_items')
    .select('id, offers!inner(id, offer_code, offer_status)')
    .eq('item_id', input.item_id)
    .eq('offers.offer_status', 'PENDING')
    .limit(1)

  if (existingOfferItem && existingOfferItem.length > 0) {
    throw new Error('This item is already in a pending offer')
  }

  // Check if a PENDING offer already exists for this fb_name
  const { data: existingOffer } = await supabase
    .from('offers')
    .select('*')
    .eq('fb_name', input.fb_name)
    .eq('offer_status', 'PENDING')
    .limit(1)
    .single()

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  if (existingOffer) {
    // Add item to existing offer and reset expiry
    const { error: itemError } = await supabase
      .from('offer_items')
      .insert({
        offer_id: existingOffer.id,
        item_id: input.item_id,
        description: input.description,
        unit_price: input.price,
        added_by: 'staff',
      })
    if (itemError) throw itemError

    // Reset expiry and update notes if provided
    const updates: Record<string, unknown> = {
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }
    if (input.notes) updates.notes = input.notes

    const { error: updateError } = await supabase
      .from('offers')
      .update(updates)
      .eq('id', existingOffer.id)
    if (updateError) throw updateError

    // Mark item as RESERVED
    await supabase
      .from('items')
      .update({ item_status: 'RESERVED' as Item['item_status'] })
      .eq('id', input.item_id)

    return { ...existingOffer, ...updates, isExisting: true } as Offer & { isExisting: boolean }
  }

  // Create new offer
  const offerCode = await generateOfferCode()

  const { data: offer, error: offerError } = await supabase
    .from('offers')
    .insert({
      offer_code: offerCode,
      fb_name: input.fb_name,
      notes: input.notes || null,
      expires_at: expiresAt,
      created_by: input.created_by || null,
    })
    .select()
    .single()

  if (offerError) throw offerError

  // Add first item
  const { error: itemError } = await supabase
    .from('offer_items')
    .insert({
      offer_id: (offer as Offer).id,
      item_id: input.item_id,
      description: input.description,
      unit_price: input.price,
      added_by: 'staff',
    })
  if (itemError) throw itemError

  // Mark item as RESERVED
  await supabase
    .from('items')
    .update({ item_status: 'RESERVED' as Item['item_status'] })
    .eq('id', input.item_id)

  return { ...(offer as Offer), isExisting: false } as Offer & { isExisting: boolean }
}

export async function addCustomOfferItem(
  offerId: string,
  item: { description: string; unit_price: number; quantity: number },
  addedBy: string = 'staff'
) {
  const { data, error } = await supabase
    .from('offer_items')
    .insert({
      offer_id: offerId,
      item_id: null,
      description: item.description,
      unit_price: item.unit_price,
      quantity: item.quantity,
      added_by: addedBy,
    })
    .select()
    .single()

  if (error) throw error

  // Reset expiry to 48h
  await supabase
    .from('offers')
    .update({
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId)

  return data
}

export async function addItemByCode(offerId: string, code: string) {
  const trimmedCode = code.trim().toUpperCase()

  if (trimmedCode.startsWith('P')) {
    // P-code: lookup single item
    const { data: item, error } = await supabase
      .from('items')
      .select('id, item_code, item_status, condition_grade, selling_price, product_models(brand, model_name, color)')
      .eq('item_code', trimmedCode)
      .single()

    if (error || !item) throw new Error(`Item ${trimmedCode} not found`)
    if (item.item_status !== 'AVAILABLE') throw new Error(`Item ${trimmedCode} is not available (status: ${item.item_status})`)
    if (item.condition_grade === 'J') throw new Error(`Item ${trimmedCode} is grade J and cannot be sold`)

    // Check if already in a pending offer
    const { data: existingOfferItem } = await supabase
      .from('offer_items')
      .select('id, offers!inner(offer_status)')
      .eq('item_id', item.id)
      .eq('offers.offer_status', 'PENDING')
      .limit(1)

    if (existingOfferItem && existingOfferItem.length > 0) {
      throw new Error(`Item ${trimmedCode} is already in another pending offer`)
    }

    const pm = item.product_models as { brand: string; model_name: string; color: string | null } | null
    const description = pm ? `${pm.brand} ${pm.model_name}${pm.color ? ` (${pm.color})` : ''}` : trimmedCode

    const { data: offerItem, error: insertError } = await supabase
      .from('offer_items')
      .insert({
        offer_id: offerId,
        item_id: item.id,
        description,
        unit_price: item.selling_price ?? 0,
        added_by: 'customer',
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Mark item as RESERVED
    await supabase
      .from('items')
      .update({ item_status: 'RESERVED' as Item['item_status'] })
      .eq('id', item.id)

    // Reset expiry
    await supabase
      .from('offers')
      .update({
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', offerId)

    return offerItem
  }

  if (trimmedCode.startsWith('G')) {
    // G-code: lookup sell group, add available items
    const { data: sellGroup, error: sgError } = await supabase
      .from('sell_groups')
      .select(`
        id, sell_group_code, base_price,
        product_models(brand, model_name, color),
        sell_group_items(
          items(id, item_code, item_status, condition_grade, selling_price)
        )
      `)
      .eq('sell_group_code', trimmedCode)
      .single()

    if (sgError || !sellGroup) throw new Error(`Sell group ${trimmedCode} not found`)

    const pm = sellGroup.product_models as { brand: string; model_name: string; color: string | null } | null
    const sgItems = (sellGroup.sell_group_items as { items: { id: string; item_code: string; item_status: string; condition_grade: string; selling_price: number | null } | null }[]) ?? []
    const availableItems = sgItems
      .map(sgi => sgi.items)
      .filter((item): item is NonNullable<typeof item> =>
        item !== null && item.item_status === 'AVAILABLE' && item.condition_grade !== 'J'
      )

    if (availableItems.length === 0) throw new Error(`No available items in sell group ${trimmedCode}`)

    const added = []
    for (const item of availableItems) {
      const description = pm ? `${pm.brand} ${pm.model_name}${pm.color ? ` (${pm.color})` : ''}` : item.item_code

      const { data: offerItem } = await supabase
        .from('offer_items')
        .insert({
          offer_id: offerId,
          item_id: item.id,
          description,
          unit_price: item.selling_price ?? Number(sellGroup.base_price) ?? 0,
          added_by: 'customer',
        })
        .select()
        .single()

      await supabase
        .from('items')
        .update({ item_status: 'RESERVED' as Item['item_status'] })
        .eq('id', item.id)

      if (offerItem) added.push(offerItem)
    }

    // Reset expiry
    await supabase
      .from('offers')
      .update({
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', offerId)

    return added
  }

  throw new Error(`Invalid code format. Use P-code (e.g., P000100) or G-code (e.g., G000001)`)
}

// --- Queries ---

interface OfferFilters {
  search?: string
  status?: string
}

export async function getOffers(filters: OfferFilters = {}) {
  let query = supabase
    .from('offers')
    .select(`
      *,
      offer_items(id, item_id, description, unit_price, quantity)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.or(
      `offer_code.ilike.%${filters.search}%,fb_name.ilike.%${filters.search}%`
    )
  }
  if (filters.status) {
    query = query.eq('offer_status', filters.status)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getOfferByCode(code: string) {
  const { data, error } = await supabase
    .from('offers')
    .select(`
      *,
      offer_items(
        id, item_id, description, unit_price, quantity, added_by, created_at,
        items(id, item_code, condition_grade, item_status, selling_price,
          product_models(brand, model_name, color, cpu, ram_gb, storage_gb,
            product_media(file_url, role, sort_order)
          )
        )
      )
    `)
    .eq('offer_code', code)
    .single()

  if (error) throw error
  return data
}

export async function getActiveOfferForItem(itemId: string) {
  const { data, error } = await supabase
    .from('offer_items')
    .select(`
      id, description, unit_price,
      offers!inner(id, offer_code, offer_status, fb_name, expires_at,
        offer_items(id, description, unit_price, quantity)
      )
    `)
    .eq('item_id', itemId)
    .eq('offers.offer_status', 'PENDING')
    .limit(1)

  if (error) throw error
  return data && data.length > 0 ? data[0] : null
}

// --- Claim ---

interface ClaimOfferInput {
  offerId: string
  lastName: string
  firstName?: string
  email: string
  phone?: string
  shippingAddress: string
}

export async function claimOffer(input: ClaimOfferInput) {
  // Get the offer with items
  const { data: offer, error: offerError } = await supabase
    .from('offers')
    .select('*, offer_items(id, item_id, description, unit_price, quantity)')
    .eq('id', input.offerId)
    .single()

  if (offerError || !offer) throw new Error('Offer not found')
  if (offer.offer_status !== 'PENDING') throw new Error(`Offer is ${offer.offer_status.toLowerCase()}, cannot be claimed`)
  if (new Date(offer.expires_at) < new Date()) throw new Error('Offer has expired')

  // Find or create customer by email
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('email', input.email)
    .limit(1)
    .single()

  let customerId: string

  if (existingCustomer) {
    customerId = existingCustomer.id
  } else {
    // Create a minimal customer record
    const { data: codeData, error: codeError } = await supabase.rpc('generate_code', {
      prefix: 'C',
      seq_name: 'cust_code_seq',
    })
    if (codeError) throw codeError

    const { data: newCustomer, error: custError } = await supabase
      .from('customers')
      .insert({
        customer_code: codeData as string,
        last_name: input.lastName.toUpperCase(),
        first_name: input.firstName?.toUpperCase() || null,
        email: input.email,
        phone: input.phone || null,
      })
      .select()
      .single()

    if (custError) throw custError
    customerId = newCustomer.id
  }

  // Create real order via createManualOrder
  const offerItems = (offer.offer_items as { id: string; item_id: string | null; description: string; unit_price: number; quantity: number }[]) ?? []

  const order = await createManualOrder({
    customer_id: customerId,
    order_source: 'FB',
    shipping_address: input.shippingAddress,
    shipping_cost: 0,
    notes: offer.notes || null,
    items: offerItems.map(oi => ({
      item_id: oi.item_id,
      description: oi.description,
      quantity: oi.quantity,
      unit_price: Number(oi.unit_price),
      discount: 0,
    })),
  })

  // Update offer: CLAIMED + link to order + customer
  const { error: claimError } = await supabase
    .from('offers')
    .update({
      offer_status: 'CLAIMED' as Offer['offer_status'],
      order_id: order.id,
      customer_id: customerId,
      claimed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.offerId)

  if (claimError) throw claimError

  return order
}

// --- Cancel ---

export async function cancelOffer(offerId: string) {
  // Get items to revert
  const { data: offerItems } = await supabase
    .from('offer_items')
    .select('item_id')
    .eq('offer_id', offerId)
    .not('item_id', 'is', null)

  // Update offer status
  const { error } = await supabase
    .from('offers')
    .update({
      offer_status: 'CANCELLED' as Offer['offer_status'],
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId)

  if (error) throw error

  // Revert items to AVAILABLE
  const itemIds = (offerItems ?? []).map(oi => oi.item_id).filter((id): id is string => !!id)
  if (itemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'AVAILABLE' as Item['item_status'] })
      .in('id', itemIds)
  }
}

// --- Remove item ---

export async function removeOfferItem(offerItemId: string) {
  // Get item_id before deleting
  const { data: offerItem } = await supabase
    .from('offer_items')
    .select('item_id')
    .eq('id', offerItemId)
    .single()

  const { error } = await supabase
    .from('offer_items')
    .delete()
    .eq('id', offerItemId)

  if (error) throw error

  // Revert inventory item to AVAILABLE
  if (offerItem?.item_id) {
    await supabase
      .from('items')
      .update({ item_status: 'AVAILABLE' as Item['item_status'] })
      .eq('id', offerItem.item_id)
  }
}
