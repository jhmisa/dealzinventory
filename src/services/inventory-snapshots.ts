import { supabase } from '@/lib/supabase'

export interface InventorySnapshot {
  id: string
  snapshot_date: string
  period_label: string
  total_items: number
  total_purchase_cost: number
  total_additional_costs: number
  total_inventory_value: number
  total_accessory_skus: number
  total_accessory_units: number
  total_accessory_value: number
  grand_total: number
  summary_by_status: Record<string, { count: number; value: number }>
  summary_by_brand: Record<string, { count: number; value: number }>
  summary_by_source: Record<string, { count: number; value: number }>
  summary_by_grade: Record<string, { count: number; value: number }>
  generated_at: string
  generated_by: string | null
  created_at: string
}

export interface InventorySnapshotItem {
  id: string
  snapshot_id: string
  item_code: string
  item_type: 'item' | 'accessory'
  brand: string | null
  model_name: string | null
  condition_grade: string | null
  item_status: string
  source_type: string | null
  purchase_price: number
  additional_costs: number
  total_cost: number
  stock_quantity: number | null
  unit_cost: number | null
  created_at: string
}

export async function getSnapshots() {
  const { data, error } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as InventorySnapshot[]
}

export async function getSnapshot(id: string) {
  const { data, error } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as InventorySnapshot
}

export async function getSnapshotItems(snapshotId: string) {
  const { data, error } = await supabase
    .from('inventory_snapshot_items')
    .select('*')
    .eq('snapshot_id', snapshotId)
    .order('item_type', { ascending: true })
    .order('item_code', { ascending: true })

  if (error) throw error
  return (data ?? []) as InventorySnapshotItem[]
}

export async function generateSnapshot() {
  const { data, error } = await supabase.rpc('generate_inventory_snapshot')

  if (error) throw error
  return data as string
}

export function downloadSnapshotCsv(items: InventorySnapshotItem[], periodLabel: string) {
  const headers = [
    'Item Code',
    'Type',
    'Brand',
    'Model',
    'Grade',
    'Status',
    'Source',
    'Purchase Price',
    'Additional Costs',
    'Total Cost',
    'Stock Qty',
    'Unit Cost',
  ]

  const rows = items.map((item) => [
    item.item_code,
    item.item_type,
    item.brand ?? '',
    item.model_name ?? '',
    item.condition_grade ?? '',
    item.item_status,
    item.source_type ?? '',
    item.purchase_price,
    item.additional_costs,
    item.total_cost,
    item.stock_quantity ?? '',
    item.unit_cost ?? '',
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const str = String(cell)
          return str.includes(',') || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str
        })
        .join(',')
    ),
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `inventory-report-${periodLabel.replace(/\s+/g, '-').toLowerCase()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
