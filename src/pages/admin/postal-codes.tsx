import { useState, useRef, useEffect } from 'react'
import { Upload, Database, CheckCircle2, AlertCircle, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { PageHeader } from '@/components/shared'
import { parsePostalCodeCSV, seedPostalCodes, getPostalCodeStats } from '@/services/postal-codes'

type UploadState = 'idle' | 'parsing' | 'uploading' | 'done' | 'error'

export default function PostalCodesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [parsedCount, setParsedCount] = useState(0)
  const [insertedCount, setInsertedCount] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileName, setFileName] = useState('')
  const [dbRowCount, setDbRowCount] = useState<number | null>(null)

  // Load current stats on mount
  useEffect(() => {
    getPostalCodeStats()
      .then(({ totalRows }) => setDbRowCount(totalRows))
      .catch(() => setDbRowCount(null))
  }, [state])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset state
    setErrorMessage('')
    setInsertedCount(0)
    setParsedCount(0)
    setTotalRows(0)
    setFileName(file.name)

    try {
      // Step 1: Parse CSV
      setState('parsing')
      const buffer = await file.arrayBuffer()
      const rows = parsePostalCodeCSV(buffer)

      if (rows.length === 0) {
        throw new Error('No valid postal code rows found in the CSV. Expected format: "postal_code","prefecture_ja","city_ja","town_ja","prefecture_en","city_en","town_en"')
      }

      setParsedCount(rows.length)
      setTotalRows(rows.length)

      // Step 2: Upload to Supabase
      setState('uploading')
      const result = await seedPostalCodes(rows, (inserted, total) => {
        setInsertedCount(inserted)
        setTotalRows(total)
      })

      setState('done')
      toast.success(`Imported ${result.totalInserted.toLocaleString()} postal codes`)
    } catch (err) {
      setState('error')
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setErrorMessage(msg)
      toast.error(`Upload failed: ${msg}`)
    }

    // Reset file input so re-upload works
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const progressPercent = totalRows > 0 ? Math.round((insertedCount / totalRows) * 100) : 0

  return (
    <div className="space-y-6">
      <PageHeader title="Postal Code Data" />

      {/* Current Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Current Data
          </CardTitle>
          <CardDescription>
            Postal codes loaded in the database for address auto-fill
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {dbRowCount !== null ? `${dbRowCount.toLocaleString()} rows` : 'Loading...'}
          </div>
          {dbRowCount === 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              No postal codes loaded yet. Upload a Japan Post CSV below to enable address auto-fill.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Japan Post CSV
          </CardTitle>
          <CardDescription>
            Upload <code>KEN_ALL_ROME</code> CSV file from Japan Post. Supports Shift-JIS and UTF-8 encoding.
            This will replace all existing postal code data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Expected format info */}
          <div className="rounded-lg border bg-muted/50 p-3 text-sm">
            <p className="font-medium mb-1">Expected CSV format (7 columns, quoted):</p>
            <code className="text-xs text-muted-foreground">
              &quot;postal_code&quot;,&quot;prefecture_ja&quot;,&quot;city_ja&quot;,&quot;town_ja&quot;,&quot;prefecture_en&quot;,&quot;city_en&quot;,&quot;town_en&quot;
            </code>
          </div>

          {/* Upload button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              disabled={state === 'parsing' || state === 'uploading'}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={state === 'parsing' || state === 'uploading'}
              variant={state === 'done' ? 'outline' : 'default'}
            >
              <FileText className="h-4 w-4 mr-2" />
              {state === 'idle' ? 'Select CSV File' :
               state === 'done' ? 'Upload Another' :
               state === 'error' ? 'Try Again' :
               'Processing...'}
            </Button>
          </div>

          {/* Progress */}
          {(state === 'parsing' || state === 'uploading' || state === 'done') && (
            <div className="space-y-2">
              {fileName && (
                <p className="text-sm text-muted-foreground">File: {fileName}</p>
              )}

              {state === 'parsing' && (
                <p className="text-sm">Parsing CSV file...</p>
              )}

              {state === 'uploading' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Inserting rows...</span>
                    <span>{insertedCount.toLocaleString()} / {totalRows.toLocaleString()}</span>
                  </div>
                  <Progress value={progressPercent} />
                </div>
              )}

              {state === 'done' && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    Successfully imported {insertedCount.toLocaleString()} postal codes from {parsedCount.toLocaleString()} parsed rows
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {state === 'error' && errorMessage && (
            <div className="flex items-start gap-2 text-sm text-destructive rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
