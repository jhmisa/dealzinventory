import { useState, useRef, useCallback } from 'react'
import { Upload, Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useClipboardPaste } from '@/hooks/use-clipboard-paste'

interface InvoiceDropzoneProps {
  onFileSelected: (file: File) => void
  isProcessing: boolean
  selectedFileName?: string
  disabled?: boolean
}

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
]
const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.pdf,.csv'

export function InvoiceDropzone({ onFileSelected, isProcessing, selectedFileName, disabled }: InvoiceDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useClipboardPaste({
    onPaste: useCallback((files: File[]) => {
      if (files[0]) onFileSelected(files[0])
    }, [onFileSelected]),
    enabled: !isProcessing && !disabled,
    accept: 'image',
  })

  function handleFiles(files: FileList | null) {
    if (!files?.[0]) return
    const file = files[0]

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const validExts = ['jpg', 'jpeg', 'png', 'pdf', 'csv']
    if (!validExts.includes(ext)) {
      toast.error('Unsupported file type. Use JPG, PNG, PDF, or CSV.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('File too large. Maximum 20MB.')
      return
    }

    onFileSelected(file)
  }

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
        (isProcessing || disabled) && 'pointer-events-none opacity-50',
      )}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true) }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (!disabled) handleFiles(e.dataTransfer.files) }}
      onClick={() => !isProcessing && !disabled && inputRef.current?.click()}
    >
      {isProcessing ? (
        <>
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-2" />
          <p className="text-sm font-medium">Analyzing invoice...</p>
          <p className="text-xs text-muted-foreground mt-1">This may take a few seconds</p>
        </>
      ) : selectedFileName ? (
        <>
          <FileText className="h-8 w-8 mx-auto text-primary mb-2" />
          <p className="text-sm font-medium">{selectedFileName}</p>
          <p className="text-xs text-muted-foreground mt-1">Click or drop to replace</p>
        </>
      ) : (
        <>
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Drag & drop an invoice here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Supports JPG, PNG, PDF, CSV (max 20MB) — or paste from clipboard
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
      />
    </div>
  )
}
