import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as receiptService from '@/services/intake-receipts'

interface ReceiptFilters {
  supplierId?: string
  dateFrom?: string
  dateTo?: string
}

export function useIntakeReceipts(filters: ReceiptFilters = {}) {
  return useQuery({
    queryKey: queryKeys.intakeReceipts.list(filters),
    queryFn: () => receiptService.getIntakeReceipts(filters),
  })
}

export function useIntakeReceipt(id: string) {
  return useQuery({
    queryKey: queryKeys.intakeReceipts.detail(id),
    queryFn: () => receiptService.getIntakeReceipt(id),
    enabled: !!id,
  })
}

export function useReceiptItems(receiptId: string) {
  return useQuery({
    queryKey: queryKeys.intakeReceipts.items(receiptId),
    queryFn: () => receiptService.getReceiptItems(receiptId),
    enabled: !!receiptId,
  })
}

export function useReceiptAdjustments(receiptId: string) {
  return useQuery({
    queryKey: queryKeys.intakeReceipts.adjustments(receiptId),
    queryFn: () => receiptService.getReceiptAdjustments(receiptId),
    enabled: !!receiptId,
  })
}

export function useCreateIntakeBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: receiptService.createIntakeBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.intakeReceipts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useCreateIntakeAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: receiptService.createIntakeAdjustment,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.intakeReceipts.adjustments(variables.receipt_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.intakeReceipts.items(variables.receipt_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useParseInvoice() {
  return useMutation({
    mutationFn: ({ fileUrl, fileType, supplierType }: { fileUrl: string; fileType: string; supplierType?: string }) =>
      receiptService.parseInvoice(fileUrl, fileType, supplierType),
  })
}

export function useUploadInvoiceFile() {
  return useMutation({
    mutationFn: (file: File) => receiptService.uploadInvoiceFile(file),
  })
}
