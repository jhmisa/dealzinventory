import { memo, useState, useCallback, useRef } from 'react'
import { Paperclip, X, FileIcon, FilmIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateTemplate, useUpdateTemplate, useUploadAttachment, useSpecialists } from '@/hooks/use-messaging'
import type { MessagingTemplate, MessageAttachment, TemplateAiUsage } from '@/lib/types'

const AVAILABLE_VARIABLES = ['customer_name', 'customer_code', 'order_code']

const AI_USAGE_OPTIONS: { value: TemplateAiUsage; label: string; hint: string }[] = [
  { value: 'AUTO', label: 'AUTO — AI may auto-send near-verbatim', hint: 'Self-contained reply, safe to send as-is.' },
  { value: 'DRAFT', label: 'DRAFT — AI may use, human approves', hint: 'AI drafts it; a person sends.' },
  { value: 'REFERENCE', label: 'REFERENCE — AI reads as fact only', hint: 'Has blanks / never sent verbatim.' },
  { value: 'OFF', label: 'OFF — hidden from AI', hint: 'AI never sees this template.' },
]

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
  const [specialistSlug, setSpecialistSlug] = useState<string>(template?.specialist_slug ?? '')
  const [aiUsage, setAiUsage] = useState<TemplateAiUsage>(template?.ai_usage ?? 'REFERENCE')
  const [attachments, setAttachments] = useState<MessageAttachment[]>(template?.attachments ?? [])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const uploadAttachment = useUploadAttachment()
  const { data: specialists } = useSpecialists()

  const isUploading = uploadAttachment.isPending
  const isSaving = createTemplate.isPending || updateTemplate.isPending

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''

      for (const file of files) {
        const isVideo = file.type.startsWith('video/')
        const maxBytes = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
        if (file.size > maxBytes) {
          toast.error(`"${file.name}" exceeds the ${isVideo ? '50MB' : '10MB'} limit`)
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
      specialist_slug: specialistSlug || null,
      ai_usage: aiUsage,
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
  }, [name, contentEn, contentJa, isActive, specialistSlug, aiUsage, attachments, isEditing, template, createTemplate, updateTemplate, onSaved])

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

        {/* AI usage */}
        <div className="space-y-1.5">
          <Label className="text-xs">AI usage</Label>
          <Select value={aiUsage} onValueChange={(v) => setAiUsage(v as TemplateAiUsage)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_USAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {AI_USAGE_OPTIONS.find((o) => o.value === aiUsage)?.hint}
          </p>
        </div>

        {/* Specialist */}
        <div className="space-y-1.5">
          <Label className="text-xs">Specialist</Label>
          <Select value={specialistSlug || '__none__'} onValueChange={(v) => setSpecialistSlug(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="All specialists" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-sm">All specialists (global)</SelectItem>
              {(specialists ?? []).map((s) => (
                <SelectItem key={s.slug} value={s.slug} className="text-sm">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Attachments */}
        <div className="space-y-1.5">
          <Label className="text-xs">Attachments (photo / video)</Label>
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
                  {att.mime_type?.startsWith('video/') ? (
                    <FilmIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
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
