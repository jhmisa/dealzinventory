import { memo, useState, useCallback, useRef } from 'react'
import { Paperclip, X, FileIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCreateTemplate, useUpdateTemplate, useUploadAttachment } from '@/hooks/use-messaging'
import type { MessagingTemplate, MessageAttachment } from '@/lib/types'

const AVAILABLE_VARIABLES = ['customer_name', 'customer_code', 'order_code']

interface CannedResponseFormProps {
  template?: MessagingTemplate | null
  onSaved: () => void
  onCancel: () => void
}

export const CannedResponseForm = memo(function CannedResponseForm({
  template,
  onSaved,
  onCancel,
}: CannedResponseFormProps) {
  const isEditing = !!template

  const [name, setName] = useState(template?.name ?? '')
  const [contentEn, setContentEn] = useState(template?.content_en ?? '')
  const [contentJa, setContentJa] = useState(template?.content_ja ?? '')
  const [isActive, setIsActive] = useState(template?.is_active ?? true)
  const [attachments, setAttachments] = useState<MessageAttachment[]>(template?.attachments ?? [])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const uploadAttachment = useUploadAttachment()

  const isUploading = uploadAttachment.isPending
  const isSaving = createTemplate.isPending || updateTemplate.isPending

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''

      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`"${file.name}" exceeds the 10MB limit`)
          continue
        }

        try {
          const pathPrefix = `templates/${template?.id ?? 'new'}`
          const att = await uploadAttachment.mutateAsync({ file, pathPrefix })
          setAttachments((prev) => [...prev, att])
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`)
        }
      }
    },
    [template?.id, uploadAttachment],
  )

  const removeAttachment = useCallback((fileUrl: string) => {
    setAttachments((prev) => prev.filter((a) => a.file_url !== fileUrl))
  }, [])

  const insertVariable = useCallback(
    (variable: string) => {
      setContentEn((prev) => `${prev}{{${variable}}}`)
    },
    [],
  )

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!contentEn.trim()) {
      toast.error('Content is required')
      return
    }

    // Detect variables used in content
    const usedVars: string[] = []
    const regex = /\{\{(\w+)\}\}/g
    let match
    while ((match = regex.exec(contentEn)) !== null) {
      if (!usedVars.includes(match[1])) {
        usedVars.push(match[1])
      }
    }

    const payload = {
      name: name.trim(),
      content_en: contentEn.trim(),
      content_ja: contentJa.trim() || contentEn.trim(),
      message_type: 'REPLY' as const,
      variables: usedVars,
      attachments,
      is_active: isActive,
    }

    try {
      if (isEditing && template) {
        await updateTemplate.mutateAsync({ id: template.id, updates: payload })
        toast.success('Response updated')
      } else {
        await createTemplate.mutateAsync(payload)
        toast.success('Response created')
      }
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }, [name, contentEn, contentJa, isActive, attachments, isEditing, template, createTemplate, updateTemplate, onSaved])

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acctg: PayPal Payment"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="content-en" className="text-xs">Content (English / Taglish)</Label>
          <Textarea
            id="content-en"
            value={contentEn}
            onChange={(e) => setContentEn(e.target.value)}
            placeholder="Hi {{customer_name}}, ..."
            className="min-h-[120px] text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono hover:bg-accent transition-colors"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="content-ja" className="text-xs">Content (Japanese)</Label>
          <Textarea
            id="content-ja"
            value={contentJa}
            onChange={(e) => setContentJa(e.target.value)}
            placeholder="Japanese version (optional)"
            className="min-h-[80px] text-sm"
          />
        </div>

        {/* Attachments */}
        <div className="space-y-1.5">
          <Label className="text-xs">Attachments</Label>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileSelect}
          />
          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                >
                  <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{att.filename}</span>
                  {att.size_bytes && (
                    <span className="text-muted-foreground shrink-0">
                      {(att.size_bytes / 1024).toFixed(0)}KB
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.file_url)}
                    className="p-0.5 hover:bg-destructive/10 rounded"
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            Add attachment
          </Button>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" />
          <Label htmlFor="is-active" className="text-xs">Active</Label>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
})
