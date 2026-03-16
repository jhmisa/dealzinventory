import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/shared'
import { AiPromptForm } from './ai-prompt-form'
import { useAiPrompts, useDeleteAiPrompt } from '@/hooks/use-ai-prompts'
import type { AiPrompt } from '@/services/ai-prompts'

export function AiPromptList() {
  const [formOpen, setFormOpen] = useState(false)
  const [editPrompt, setEditPrompt] = useState<AiPrompt | null>(null)
  const [deletePrompt, setDeletePrompt] = useState<AiPrompt | null>(null)

  const { data: prompts, isLoading } = useAiPrompts()
  const deleteMutation = useDeleteAiPrompt()

  function handleEdit(prompt: AiPrompt) {
    setEditPrompt(prompt)
    setFormOpen(true)
  }

  function handleDelete() {
    if (!deletePrompt) return
    deleteMutation.mutate(deletePrompt.id, {
      onSuccess: () => {
        toast.success('Prompt deleted')
        setDeletePrompt(null)
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">AI Enhancement Prompts</h2>
          <p className="text-sm text-muted-foreground">
            Manage prompt templates for AI-powered photo enhancement.
          </p>
        </div>
        <Button onClick={() => { setEditPrompt(null); setFormOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Prompt
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : !prompts?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No AI prompts configured. Add one to get started with photo enhancement.
            </p>
            <Button onClick={() => { setEditPrompt(null); setFormOpen(true) }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Prompt
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {prompts.map((prompt) => (
            <Card key={prompt.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{prompt.name}</CardTitle>
                    {prompt.is_active ? (
                      <Badge className="bg-green-100 text-green-800 border-green-300">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(prompt)} aria-label="Edit prompt">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletePrompt(prompt)} aria-label="Delete prompt">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {prompt.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{prompt.description}</p>
                )}
                <div className="flex items-start gap-3">
                  {prompt.sample_image_url && (
                    <img
                      src={prompt.sample_image_url}
                      alt={`${prompt.name} sample`}
                      className="h-16 w-16 rounded-md border object-cover flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  )}
                  <p className="text-xs font-mono text-muted-foreground line-clamp-3 break-all">
                    {prompt.prompt_text}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Type: {prompt.media_type}</span>
                  <span>Order: {prompt.sort_order}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AiPromptForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditPrompt(null)
        }}
        editPrompt={editPrompt}
      />

      <ConfirmDialog
        open={!!deletePrompt}
        onOpenChange={(open) => !open && setDeletePrompt(null)}
        title="Delete AI Prompt"
        description={`Are you sure you want to delete "${deletePrompt?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
