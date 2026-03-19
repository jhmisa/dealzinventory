import { useState, useRef, useCallback } from 'react'
import { Plus, X, Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { DEFECT_TYPES } from '@/lib/constants'
import type { DefectArea } from '@/lib/constants'
import type { ItemDefect } from '@/services/item-defects'
import { useAddItemDefect, useDeleteItemDefect } from '@/hooks/use-item-defects'

interface DefectSectionProps {
  itemId: string
  area: DefectArea
  title: string
  defects: ItemDefect[]
}

const BUCKET = 'item-media'

export function DefectSection({ itemId, area, title, defects }: DefectSectionProps) {
  const [adding, setAdding] = useState(false)
  const [defectType, setDefectType] = useState('')
  const [freeText, setFreeText] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)

  const addDefect = useAddItemDefect()
  const deleteDefect = useDeleteItemDefect(itemId)

  const isOtherArea = area === 'other'
  const defectOptions = !isOtherArea ? DEFECT_TYPES[area] : []

  const resetForm = useCallback(() => {
    setAdding(false)
    setDefectType('')
    setFreeText('')
    setDescription('')
    setPhotoUrl(null)
  }, [])

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const fileName = `${crypto.randomUUID()}.${ext}`
      const filePath = `items/${itemId}/defects/${fileName}`

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { contentType: file.type, upsert: false })

      if (error) throw error

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
      setPhotoUrl(urlData.publicUrl)
      toast.success('Photo captured')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      toast.error(`Photo upload failed: ${message}`)
    } finally {
      setUploading(false)
      // Reset input so same file can be re-selected
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  function handleSave() {
    const resolvedType = isOtherArea ? freeText.trim() : defectType
    if (!resolvedType) {
      toast.error(isOtherArea ? 'Please describe the defect' : 'Please select a defect type')
      return
    }

    addDefect.mutate(
      {
        itemId,
        area,
        defectType: resolvedType,
        description: description.trim() || undefined,
        photoUrl: photoUrl ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success('Defect added')
          resetForm()
        },
        onError: (err) => toast.error(`Failed to save: ${err.message}`),
      },
    )
  }

  function handleDelete(defectId: string) {
    if (!window.confirm('Remove this defect?')) return
    deleteDefect.mutate(defectId, {
      onSuccess: () => toast.success('Defect removed'),
      onError: (err) => toast.error(`Delete failed: ${err.message}`),
    })
  }

  function getDefectLabel(type: string): string {
    if (isOtherArea) return type
    const found = defectOptions.find((d) => d.value === type)
    return found?.label ?? type
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {title}
          {defects.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {defects.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Existing defects list */}
        {defects.map((defect) => (
          <div
            key={defect.id}
            className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
          >
            {defect.photo_url && (
              <img
                src={defect.photo_url}
                alt="Defect photo"
                className="h-14 w-14 rounded-md object-cover border shrink-0 cursor-pointer"
                onClick={() => window.open(defect.photo_url!, '_blank')}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{getDefectLabel(defect.defect_type)}</p>
              {defect.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{defect.description}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDelete(defect.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {/* Add defect form (inline) */}
        {adding ? (
          <div className="space-y-3 p-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5">
            {/* Defect type: dropdown for body/screen/keyboard, free-text for other */}
            {isOtherArea ? (
              <Input
                placeholder="Describe the defect..."
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                autoFocus
              />
            ) : (
              <Select value={defectType} onValueChange={setDefectType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select defect type..." />
                </SelectTrigger>
                <SelectContent>
                  {defectOptions.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Optional description */}
            <Textarea
              placeholder="Additional notes (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
            />

            {/* Photo capture */}
            <div className="flex items-center gap-3">
              {photoUrl ? (
                <div className="relative">
                  <img
                    src={photoUrl}
                    alt="Defect proof"
                    className="h-16 w-16 rounded-md object-cover border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-5 w-5 absolute -top-1.5 -right-1.5"
                    onClick={() => setPhotoUrl(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={uploading}
                  onClick={() => cameraRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  {uploading ? 'Uploading...' : 'Take Photo'}
                </Button>
              )}

              {/* Hidden camera input */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={addDefect.isPending || uploading}
              >
                {addDefect.isPending ? 'Saving...' : 'Save Defect'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetForm}
                disabled={addDefect.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Defect
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
