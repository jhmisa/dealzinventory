import { supabase } from '@/lib/supabase'

export async function getPaymentConfirmations(orderId: string) {
  const { data, error } = await supabase
    .from('payment_confirmations')
    .select(`
      *,
      staff_profiles!confirmed_by(display_name)
    `)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function uploadPaymentProof(orderId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const filePath = `${orderId}/${fileName}`

  const { error } = await supabase.storage
    .from('payment-proofs')
    .upload(filePath, file, { contentType: file.type, upsert: false })

  if (error) throw error
  return filePath
}

export async function getPaymentProofSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(path, 3600) // 1 hour expiry

  if (error || !data?.signedUrl) throw error ?? new Error('Failed to create signed URL')
  return data.signedUrl
}

export async function createPaymentConfirmation(params: {
  orderId: string
  amount: number
  screenshotUrl: string
  notes?: string
}) {
  const { data: { session } } = await supabase.auth.getSession()

  const { data, error } = await supabase
    .from('payment_confirmations')
    .insert({
      order_id: params.orderId,
      amount: params.amount,
      screenshot_url: params.screenshotUrl,
      notes: params.notes || null,
      confirmed_by: session?.user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deletePaymentConfirmation(id: string, screenshotUrl: string) {
  // Delete file from storage
  const { error: storageError } = await supabase.storage
    .from('payment-proofs')
    .remove([screenshotUrl])

  if (storageError) throw storageError

  // Delete row
  const { error } = await supabase
    .from('payment_confirmations')
    .delete()
    .eq('id', id)

  if (error) throw error
}
