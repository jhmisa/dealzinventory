import { supabase } from '@/lib/supabase'
import type { CustomerReview, CustomerReviewInsert, CustomerReviewUpdate } from '@/lib/types'

export async function getCustomerReviews() {
  const { data, error } = await supabase
    .from('customer_reviews')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as CustomerReview[]
}

export async function getCustomerReview(id: string) {
  const { data, error } = await supabase
    .from('customer_reviews')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as CustomerReview
}

export async function createCustomerReview(review: CustomerReviewInsert) {
  const { data, error } = await supabase
    .from('customer_reviews')
    .insert(review)
    .select()
    .single()

  if (error) throw error
  return data as CustomerReview
}

export async function updateCustomerReview(id: string, updates: CustomerReviewUpdate) {
  const { data, error } = await supabase
    .from('customer_reviews')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as CustomerReview
}

export async function deleteCustomerReview(id: string) {
  const { error } = await supabase
    .from('customer_reviews')
    .delete()
    .eq('id', id)

  if (error) throw error
}
