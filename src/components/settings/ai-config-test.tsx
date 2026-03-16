import { useState, useRef } from 'react'
import { Upload, Loader2, CheckCircle, XCircle, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useTestAiConfiguration } from '@/hooks/use-ai-configurations'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/utils'
import type { AiConfiguration } from '@/lib/types'

interface SelectedFile {
  name: string
  size: number
  type: string
  previewUrl: string | null
}

interface AiConfigTestProps {
  config: AiConfiguration
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AiConfigTest({ config }: AiConfigTestProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const testMutation = useTestAiConfiguration()

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const validTypes = ['jpg', 'jpeg', 'png', 'pdf', 'csv']
    if (!validTypes.includes(ext)) {
      toast.error('Unsupported format. Use JPG, PNG, PDF, or CSV.')
      return
    }

    const isImage = ['jpg', 'jpeg', 'png'].includes(ext)
    const previewUrl = isImage ? URL.createObjectURL(file) : null
    setSelectedFile({ name: file.name, size: file.size, type: ext, previewUrl })

    setUploading(true)
    try {
      const fileName = `test/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('intake-invoices')
        .upload(fileName, file, { contentType: file.type })

      if (uploadError) throw uploadError

      const { data: urlData, error: signedUrlError } = await supabase.storage
        .from('intake-invoices')
        .createSignedUrl(fileName, 300) // 5 min expiry

      if (signedUrlError || !urlData?.signedUrl) throw signedUrlError ?? new Error('Failed to create signed URL')

      await testMutation.mutateAsync(
        { configId: config.id, fileUrl: urlData.signedUrl, fileType: ext === 'jpeg' ? 'jpg' : ext },
      )
      toast.success('Test successful')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (!testMutation.isError) {
        toast.error(`Upload failed: ${message}`)
      } else {
        toast.error(`Test failed: ${message}`)
      }
    } finally {
      setUploading(false)
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files?.[0]) return
    handleFile(files[0])
  }

  function clearFile() {
    if (selectedFile?.previewUrl) {
      URL.revokeObjectURL(selectedFile.previewUrl)
    }
    setSelectedFile(null)
    testMutation.reset()
    if (inputRef.current) inputRef.current.value = ''
  }

  const isProcessing = uploading || testMutation.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedFile ? (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              {selectedFile.previewUrl ? (
                <img
                  src={selectedFile.previewUrl}
                  alt="Invoice preview"
                  className="h-16 w-16 rounded-md object-cover border flex-shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center flex-shrink-0">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedFile.type.toUpperCase()} &middot; {formatFileSize(selectedFile.size)}
                </p>
                {isProcessing && (
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">
                      {uploading ? 'Uploading...' : 'Analyzing invoice...'}
                    </span>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={clearFile}
                disabled={isProcessing}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Drop a sample invoice here (JPG, PNG, PDF, CSV)
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.csv"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {testMutation.isSuccess && testMutation.data && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {testMutation.data.success ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-700 font-medium">
                    Extracted {testMutation.data.line_items.length} line items
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-red-700 font-medium">
                    Parse failed{testMutation.data.error ? `: ${testMutation.data.error}` : ''}
                  </span>
                </>
              )}
            </div>

            {testMutation.data.line_items.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                      <th className="px-3 py-2 text-right font-medium">Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testMutation.data.line_items.map((item) => (
                      <tr key={item.line_number} className="border-t">
                        <td className="px-3 py-2">{item.line_number}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{item.product_description}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatPrice(item.unit_price)}</td>
                        <td className="px-3 py-2 text-right">{(item.confidence * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={clearFile}
            >
              Clear Test Results
            </Button>
          </div>
        )}

        {testMutation.isError && (
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="h-4 w-4 text-red-600" />
            <span className="text-red-700 font-medium">
              Test failed: {testMutation.error?.message ?? 'Unknown error'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
