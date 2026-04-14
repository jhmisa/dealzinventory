import { memo, useState, useMemo, useCallback } from 'react'
import { X, Search, Paperclip, Plus, Send, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useTemplates, useDeleteTemplate } from '@/hooks/use-messaging'
import { resolveTemplateContext, resolveVariables } from '@/lib/template-variables'
import type { Conversation, MessagingTemplate, MessageAttachment } from '@/lib/types'
import { CannedResponseForm } from './canned-response-form'

interface CannedResponsesPanelProps {
  open: boolean
  onClose: () => void
  onInsert: (content: string, attachments?: MessageAttachment[]) => void
  onSendNow: (content: string, attachments?: MessageAttachment[]) => void
  conversation: Pick<Conversation, 'id' | 'customer_id'>
}

export const CannedResponsesPanel = memo(function CannedResponsesPanel({
  open,
  onClose,
  onInsert,
  onSendNow,
  conversation,
}: CannedResponsesPanelProps) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessagingTemplate | null>(null)
  const [isResolving, setIsResolving] = useState(false)

  const { data: templates = [] } = useTemplates()
  const deleteTemplate = useDeleteTemplate()

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.is_active),
    [templates],
  )

  const filtered = useMemo(() => {
    if (!search) return activeTemplates
    const q = search.toLowerCase()
    return activeTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.content_en.toLowerCase().includes(q) ||
        t.content_ja.toLowerCase().includes(q),
    )
  }, [activeTemplates, search])

  const selected = useMemo(
    () => filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  )

  const resolveAndGetContent = useCallback(
    async (template: MessagingTemplate) => {
      const ctx = await resolveTemplateContext(conversation)
      // Use content_en as the primary content (can extend to pick based on language)
      const resolved = resolveVariables(template.content_en, ctx)
      return resolved
    },
    [conversation],
  )

  const handleInsert = useCallback(async () => {
    if (!selected) return
    setIsResolving(true)
    try {
      const content = await resolveAndGetContent(selected)
      onInsert(content, selected.attachments?.length ? selected.attachments : undefined)
    } catch {
      toast.error('Failed to resolve variables')
    } finally {
      setIsResolving(false)
    }
  }, [selected, resolveAndGetContent, onInsert])

  const handleSendNow = useCallback(async () => {
    if (!selected) return
    setIsResolving(true)
    try {
      const content = await resolveAndGetContent(selected)
      onSendNow(content, selected.attachments?.length ? selected.attachments : undefined)
      toast.success('Response sent')
    } catch {
      toast.error('Failed to send response')
    } finally {
      setIsResolving(false)
    }
  }, [selected, resolveAndGetContent, onSendNow])

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm('Delete this response?')) return
      deleteTemplate.mutate(id, {
        onSuccess: () => {
          toast.success('Response deleted')
          if (selectedId === id) setSelectedId(null)
        },
        onError: (err) => toast.error(err.message),
      })
    },
    [deleteTemplate, selectedId],
  )

  const handleFormSaved = useCallback(() => {
    setShowForm(false)
    setEditingTemplate(null)
  }, [])

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">
              {showForm ? (
                <button
                  onClick={() => { setShowForm(false); setEditingTemplate(null) }}
                  className="flex items-center gap-1.5 text-sm hover:text-primary"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Responses
                </button>
              ) : (
                'Responses'
              )}
            </SheetTitle>
          </div>
        </SheetHeader>

        {showForm ? (
          <CannedResponseForm
            template={editingTemplate}
            onSaved={handleFormSaved}
            onCancel={() => { setShowForm(false); setEditingTemplate(null) }}
          />
        ) : (
          <>
            <div className="flex flex-1 overflow-hidden">
              {/* Left list */}
              <div className="w-[220px] shrink-0 border-r flex flex-col">
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search..."
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-0.5 p-1">
                    {filtered.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          selected?.id === t.id
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-muted',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{t.name}</p>
                          <p className="text-muted-foreground truncate">
                            {t.content_en.slice(0, 60)}
                          </p>
                        </div>
                        {t.attachments && t.attachments.length > 0 && (
                          <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
                        )}
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                        No responses found
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right detail */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selected ? (
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-semibold">{selected.name}</h3>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              setEditingTemplate(selected)
                              setShowForm(true)
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-destructive"
                            onClick={() => handleDelete(selected.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {selected.content_en}
                      </p>
                      {selected.content_ja && (
                        <div className="border-t pt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Japanese:</p>
                          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                            {selected.content_ja}
                          </p>
                        </div>
                      )}
                      {selected.attachments && selected.attachments.length > 0 && (
                        <div className="border-t pt-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Attachments:</p>
                          {selected.attachments.map((att, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
                            >
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate">{att.filename}</span>
                              {att.size_bytes && (
                                <span className="text-muted-foreground shrink-0">
                                  {(att.size_bytes / 1024).toFixed(0)}KB
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {selected.variables && selected.variables.length > 0 && (
                        <div className="border-t pt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Variables:</p>
                          <div className="flex flex-wrap gap-1">
                            {selected.variables.map((v) => (
                              <span
                                key={v}
                                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono"
                              >
                                {`{{${v}}}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Select a response to preview
                  </div>
                )}
              </div>
            </div>

            {/* Bottom actions */}
            <div className="flex items-center justify-between border-t px-4 py-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setEditingTemplate(null)
                  setShowForm(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Create new
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selected || isResolving}
                  onClick={handleInsert}
                >
                  Insert
                </Button>
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={!selected || isResolving}
                  onClick={handleSendNow}
                >
                  <Send className="h-3.5 w-3.5" />
                  Send now
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
})
