import { useState, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Info } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, ConfirmDialog } from '@/components/shared'
import {
  IntakeStepIndicator,
  InvoiceDropzone,
  IntakeLineItemTable,
  IntakeReviewCard,
  IntakeSuccessCard,
  SpecReviewTable,
  type IntakeStep,
  type LineItemRow,
  type ParsedSpecs,
  type ResolvedSpecs,
} from '@/components/intake'
import { useSuppliers } from '@/hooks/use-suppliers'
import { useProductModelsWithHeroImage } from '@/hooks/use-product-models'
import { useActiveAiConfiguration } from '@/hooks/use-ai-configurations'
import { useCreateIntakeBatch, useUploadInvoiceFile, useParseInvoice } from '@/hooks/use-intake-receipts'
import { getInvoiceSignedUrl } from '@/services/intake-receipts'
import { batchMatchProducts } from '@/services/product-models'
import { autoMatchSingle } from '@/lib/product-matcher'
import { SOURCE_TYPES } from '@/lib/constants'
import type { SourceType } from '@/lib/types'

type IntakeMode = 'upload' | 'manual'

interface ExtractedMeta {
  supplier_name?: string
  invoice_date?: string
  invoice_total?: number
}

function loosely_matches(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_.,()（）株式会社有限会社co\.ltd\.inc\.]+/g, '')
  const na = normalize(a)
  const nb = normalize(b)
  return na.includes(nb) || nb.includes(na)
}

function IntakeSharedFields({
  supplierId, setSupplierId,
  sourceType, setSourceType,
  dateReceived, setDateReceived,
  notes, setNotes,
  suppliers,
  extractedMeta,
  selectedSupplierName,
}: {
  supplierId: string
  setSupplierId: (v: string) => void
  sourceType: SourceType
  setSourceType: (v: SourceType) => void
  dateReceived: string
  setDateReceived: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  suppliers: { id: string; supplier_name: string }[] | undefined
  extractedMeta?: ExtractedMeta | null
  selectedSupplierName?: string
}) {
  const supplierMismatch = extractedMeta?.supplier_name && selectedSupplierName
    ? !loosely_matches(extractedMeta.supplier_name, selectedSupplierName)
    : false
  const dateMismatch = extractedMeta?.invoice_date && dateReceived
    ? extractedMeta.invoice_date !== dateReceived
    : false

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div>
          <Label>Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {(suppliers ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Source Type</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date Received</Label>
            <Input
              type="date"
              value={dateReceived}
              onChange={(e) => setDateReceived(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this intake..."
            className="mt-1.5"
          />
        </div>
        {extractedMeta && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-blue-800">
              <Info className="h-4 w-4" />
              Invoice Metadata (extracted)
            </div>
            {extractedMeta.supplier_name && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Company Name</span>
                <span>{extractedMeta.supplier_name}</span>
                {supplierMismatch && (
                  <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" title="Doesn't match selected supplier" />
                )}
              </div>
            )}
            {extractedMeta.invoice_date && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Invoice Date</span>
                <span>{extractedMeta.invoice_date}</span>
                {dateMismatch && (
                  <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" title="Differs from selected Date Received" />
                )}
              </div>
            )}
            {extractedMeta.invoice_total != null && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Invoice Total</span>
                <span>{`¥${extractedMeta.invoice_total.toLocaleString('ja-JP')}`}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function makeEmptyLine(): LineItemRow {
  return {
    id: crypto.randomUUID(),
    product_description: '',
    quantity: 1,
    unit_price: 0,
    product_id: '',
    ai_confidence: null,
    notes: '',
  }
}

function resolveSpecs(
  csvSpecs: ParsedSpecs | undefined,
  productModel: { brand?: string | null; model_name?: string | null; cpu?: string | null; ram_gb?: number | null; storage_gb?: number | null; screen_size?: number | null } | null,
): ResolvedSpecs {
  const pm = productModel ?? {}
  return {
    brand:         pm.brand         || csvSpecs?.brand         || undefined,
    model_name:    pm.model_name    || csvSpecs?.model_name    || undefined,
    cpu:           pm.cpu           || csvSpecs?.cpu           || undefined,
    ram_gb:        pm.ram_gb        ?? csvSpecs?.ram_gb        ?? undefined,
    storage_gb:    pm.storage_gb    ?? csvSpecs?.storage_gb    ?? undefined,
    screen_size:   pm.screen_size   ?? csvSpecs?.screen_size   ?? undefined,
    serial_number: csvSpecs?.serial_number ?? undefined,
  }
}

const INTAKE_DRAFT_KEY = 'dealz_intake_draft'

interface IntakeDraft {
  step: IntakeStep
  mode: IntakeMode
  supplierId: string
  sourceType: SourceType
  dateReceived: string
  notes: string
  invoiceFileUrl: string
  selectedFileName: string
  lineItems: LineItemRow[]
  extractedMeta?: ExtractedMeta | null
}

function loadDraft(): IntakeDraft | null {
  try {
    const raw = sessionStorage.getItem(INTAKE_DRAFT_KEY)
    if (!raw) return null
    const draft: IntakeDraft = JSON.parse(raw)
    if (draft.step === 'success') return null
    return draft
  } catch {
    sessionStorage.removeItem(INTAKE_DRAFT_KEY)
    return null
  }
}

export default function BulkIntakePage() {
  const navigate = useNavigate()

  // Load draft from sessionStorage (once on mount)
  const [draft] = useState(() => loadDraft())

  // Step management
  const [step, setStep] = useState<IntakeStep>(draft?.step ?? 'upload')
  const [mode, setMode] = useState<IntakeMode>(draft?.mode ?? 'upload')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  // Form state
  const [supplierId, setSupplierId] = useState(draft?.supplierId ?? '')
  const [sourceType, setSourceType] = useState<SourceType>(draft?.sourceType ?? 'AUCTION')
  const [dateReceived, setDateReceived] = useState(draft?.dateReceived ?? format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState(draft?.notes ?? '')
  const [invoiceFileUrl, setInvoiceFileUrl] = useState(draft?.invoiceFileUrl ?? '')
  const [selectedFileName, setSelectedFileName] = useState(draft?.selectedFileName ?? '')
  const [extractedMeta, setExtractedMeta] = useState<ExtractedMeta | null>(draft?.extractedMeta ?? null)

  // Line items
  const [lineItems, setLineItems] = useState<LineItemRow[]>(draft?.lineItems ?? [])
  const [specConflictCount, setSpecConflictCount] = useState(0)

  // Success data
  const [successData, setSuccessData] = useState<{
    receiptId: string
    receiptCode: string
    totalItems: number
    totalCost: number
    pCodeRangeStart: string
    pCodeRangeEnd: string
    items: Array<{ id: string; item_code: string }>
  } | null>(null)

  // Persist draft to sessionStorage
  useEffect(() => {
    if (step === 'success') {
      sessionStorage.removeItem(INTAKE_DRAFT_KEY)
      return
    }
    const data: IntakeDraft = {
      step, mode, supplierId, sourceType, dateReceived,
      notes, invoiceFileUrl, selectedFileName, lineItems, extractedMeta,
    }
    sessionStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(data))
  }, [step, mode, supplierId, sourceType, dateReceived, notes, invoiceFileUrl, selectedFileName, lineItems, extractedMeta])

  // Data hooks
  const { data: suppliers } = useSuppliers()
  const { data: products } = useProductModelsWithHeroImage()
  const { data: activeAiConfig } = useActiveAiConfiguration('invoice_parsing')

  // Mutation hooks
  const uploadMutation = useUploadInvoiceFile()
  const parseMutation = useParseInvoice()
  const createBatchMutation = useCreateIntakeBatch()

  // Auto-match items against product models (called from event handlers on step transition)
  async function runAutoMatch(items: LineItemRow[]) {
    if (!products || items.length === 0) return

    const unmatchedItems = items.filter((item) => !item.product_id)
    if (unmatchedItems.length === 0) return

    // Tier 1: DB-level regex matching via RPC
    const descriptions = unmatchedItems.map((item) => item.product_description)
    const dbMatches = await batchMatchProducts(descriptions)

    let matchCount = 0
    const updates = new Map<string, { product_id: string; ai_confidence: number }>()

    for (const item of unmatchedItems) {
      const dbMatch = dbMatches.get(item.product_description)
      if (dbMatch) {
        updates.set(item.id, { product_id: dbMatch, ai_confidence: 0.9 })
        matchCount++
        continue
      }

      // Tier 2: Client-side fuzzy matching
      const fuzzyMatch = autoMatchSingle(item.product_description, products!, item.csv_specs)
      if (fuzzyMatch) {
        updates.set(item.id, {
          product_id: fuzzyMatch.productId,
          ai_confidence: fuzzyMatch.confidence,
        })
        matchCount++
      }
    }

    if (updates.size > 0) {
      setLineItems((prev) =>
        prev.map((item) => {
          const update = updates.get(item.id)
          if (update) {
            return { ...item, product_id: update.product_id, ai_confidence: update.ai_confidence }
          }
          return item
        })
      )
    }

    if (matchCount > 0) {
      toast.success(`Auto-matched ${matchCount} of ${unmatchedItems.length} items`)
    }
  }

  const supplierName = suppliers?.find(s => s.id === supplierId)?.supplier_name ?? ''
  const isProcessing = uploadMutation.isPending || parseMutation.isPending

  // File upload + AI parsing
  const handleFileSelected = useCallback(async (file: File) => {
    if (!supplierId) {
      toast.error('Select a supplier before uploading an invoice')
      return
    }
    if (!activeAiConfig && !file.name.endsWith('.csv')) {
      toast.error('No AI service configured. Use CSV or configure AI in Settings.')
      return
    }

    setSelectedFileName(file.name)

    try {
      // Upload to storage (returns storage path, not signed URL)
      const storagePath = await uploadMutation.mutateAsync(file)
      setInvoiceFileUrl(storagePath)

      // Generate a temporary signed URL for the AI to read the file
      const signedUrl = await getInvoiceSignedUrl(storagePath)

      // Parse
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const fileType = ext === 'jpeg' ? 'jpg' : ext
      const result = await parseMutation.mutateAsync({ fileUrl: signedUrl, fileType })

      if (!result.success) {
        toast.error(`Parse failed: ${result.line_items.length === 0 ? 'No items found' : 'Unknown error'}`)
        return
      }

      // Save extracted metadata for display
      setExtractedMeta({
        supplier_name: result.supplier_name,
        invoice_date: result.invoice_date,
        invoice_total: result.invoice_total,
      })

      // Convert parsed items to LineItemRow
      const newItems: LineItemRow[] = result.line_items.map((item) => ({
        id: crypto.randomUUID(),
        product_description: item.product_description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        product_id: '',
        ai_confidence: item.confidence,
        notes: item.notes ?? '',
        csv_specs: item.specs ?? undefined,
      }))

      setLineItems(newItems)
      setStep('verify')
      toast.success(`Extracted ${newItems.length} line items`)
      runAutoMatch(newItems)
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [supplierId, activeAiConfig, uploadMutation, parseMutation])

  // Line item management
  function updateLineItem(id: string, field: keyof LineItemRow, value: string | number | null) {
    setLineItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  function deleteLineItem(id: string) {
    setLineItems(prev => prev.filter(item => item.id !== id))
  }

  function addLineItem() {
    setLineItems(prev => [...prev, makeEmptyLine()])
  }

  // Submit batch
  async function handleCreateItems() {
    if (!supplierId) {
      toast.error('Select a supplier')
      return
    }
    if (lineItems.length === 0) {
      toast.error('Add at least one line item')
      return
    }

    try {
      const result = await createBatchMutation.mutateAsync({
        supplier_id: supplierId,
        source_type: sourceType,
        date_received: dateReceived,
        invoice_file_url: invoiceFileUrl || undefined,
        supplier_contact_snapshot: suppliers?.find(s => s.id === supplierId)?.contact_info ?? undefined,
        notes: notes || undefined,
        line_items: lineItems.map(item => ({
          product_description: item.product_description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          product_id: item.product_id || undefined,
          ai_confidence: item.ai_confidence,
          notes: item.notes || undefined,
          resolved_specs: item.resolved_specs,
        })),
      })

      setSuccessData({
        receiptId: result.receipt_id,
        receiptCode: result.receipt_code,
        totalItems: result.total_items,
        totalCost: result.total_cost,
        pCodeRangeStart: result.p_code_range_start,
        pCodeRangeEnd: result.p_code_range_end,
        items: result.items,
      })
      setStep('success')
      setConfirmDialogOpen(false)
      toast.success(`${result.total_items} items created — ${result.receipt_code}`)
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setConfirmDialogOpen(false)
    }
  }

  function handleReset() {
    sessionStorage.removeItem(INTAKE_DRAFT_KEY)
    setStep('upload')
    setMode('upload')
    setSupplierId('')
    setSourceType('AUCTION')
    setDateReceived(format(new Date(), 'yyyy-MM-dd'))
    setNotes('')
    setInvoiceFileUrl('')
    setSelectedFileName('')
    setExtractedMeta(null)
    setLineItems([])
    setSuccessData(null)
  }

  function goToManualVerify() {
    if (!supplierId) {
      toast.error('Select a supplier first')
      return
    }
    setLineItems([makeEmptyLine()])
    setStep('verify')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/items')} aria-label="Back to items">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title="New Intake" description="Upload an invoice or manually add items." />
      </div>

      <IntakeStepIndicator currentStep={step} />

      {/* STEP 1: Upload / Manual Entry */}
      {step === 'upload' && (
        <div className="space-y-4 max-w-2xl">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'upload' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('upload')}
            >
              Upload Invoice
            </Button>
            <Button
              variant={mode === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('manual')}
            >
              Manual Entry
            </Button>
          </div>

          <IntakeSharedFields
            supplierId={supplierId} setSupplierId={setSupplierId}
            sourceType={sourceType} setSourceType={setSourceType}
            dateReceived={dateReceived} setDateReceived={setDateReceived}
            notes={notes} setNotes={setNotes}
            suppliers={suppliers}
            extractedMeta={extractedMeta}
            selectedSupplierName={supplierName}
          />

          {/* Upload mode */}
          {mode === 'upload' && (
            <div className="space-y-3">
              {!activeAiConfig && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No AI service configured. Only CSV parsing is available.{' '}
                    <Link to="/admin/settings/ai" className="underline font-medium">Configure AI Settings</Link>
                  </AlertDescription>
                </Alert>
              )}
              <InvoiceDropzone
                onFileSelected={handleFileSelected}
                isProcessing={isProcessing}
                selectedFileName={selectedFileName}
                disabled={!supplierId}
              />
            </div>
          )}

          {/* Manual mode */}
          {mode === 'manual' && (
            <Button onClick={goToManualVerify} className="w-full">
              Continue to Line Items
            </Button>
          )}
        </div>
      )}

      {/* STEP 2: Verify */}
      {step === 'verify' && (
        <div className="space-y-4">
          <IntakeSharedFields
            supplierId={supplierId} setSupplierId={setSupplierId}
            sourceType={sourceType} setSourceType={setSourceType}
            dateReceived={dateReceived} setDateReceived={setDateReceived}
            notes={notes} setNotes={setNotes}
            suppliers={suppliers}
            extractedMeta={extractedMeta}
            selectedSupplierName={supplierName}
          />

          <IntakeLineItemTable
            lineItems={lineItems}
            onUpdateItem={updateLineItem}
            onDeleteItem={deleteLineItem}
            onAddItem={addLineItem}
            products={products ?? []}
            onConflictsChange={setSpecConflictCount}
          />
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              Clear & Start Over
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                disabled={specConflictCount > 0}
                title={specConflictCount > 0 ? 'Resolve spec conflicts before continuing' : undefined}
                onClick={() => {
                  if (lineItems.length === 0) {
                    toast.error('Add at least one line item')
                    return
                  }
                  if (lineItems.some(item => !item.product_description)) {
                    toast.error('All items need a description')
                    return
                  }
                  // Resolve specs for each line item before advancing
                  setLineItems(prev => prev.map(item => {
                    const pm = products?.find(p => p.id === item.product_id) ?? null
                    return { ...item, resolved_specs: resolveSpecs(item.csv_specs, pm) }
                  }))
                  setStep('review-specs')
                }}
              >
                Review Specs
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Review Specs */}
      {step === 'review-specs' && (
        <div className="space-y-4">
          <SpecReviewTable
            items={lineItems}
            products={products ?? []}
            onUpdateSpecs={(id, specs) => {
              setLineItems(prev => prev.map(item =>
                item.id === id ? { ...item, resolved_specs: specs } : item
              ))
            }}
          />
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep('verify')}>
              Back
            </Button>
            <Button onClick={() => setStep('confirm')}>
              Confirm
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <IntakeReviewCard
            supplierName={supplierName}
            sourceType={sourceType}
            dateReceived={dateReceived}
            notes={notes}
            lineItems={lineItems}
          />
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep('review-specs')}>
              Go Back
            </Button>
            <Button
              onClick={() => setConfirmDialogOpen(true)}
              disabled={createBatchMutation.isPending}
            >
              {createBatchMutation.isPending ? 'Creating...' : 'Create Items'}
            </Button>
          </div>

          <ConfirmDialog
            open={confirmDialogOpen}
            onOpenChange={setConfirmDialogOpen}
            title="Confirm Intake"
            description={`This will create ${lineItems.reduce((sum, i) => sum + i.quantity, 0)} items from ${lineItems.length} line items. This action generates an immutable receipt.`}
            confirmLabel="Create Items"
            onConfirm={handleCreateItems}
            loading={createBatchMutation.isPending}
          />
        </div>
      )}

      {/* STEP 5: Success */}
      {step === 'success' && successData && (
        <IntakeSuccessCard
          receiptId={successData.receiptId}
          receiptCode={successData.receiptCode}
          totalItems={successData.totalItems}
          totalCost={successData.totalCost}
          pCodeRangeStart={successData.pCodeRangeStart}
          pCodeRangeEnd={successData.pCodeRangeEnd}
          createdItems={successData.items}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
