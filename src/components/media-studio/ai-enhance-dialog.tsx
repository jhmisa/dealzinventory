import { useState } from 'react'
import { Sparkles, Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { processImage } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import { useActiveAiPrompts } from '@/hooks/use-ai-prompts'
import { useActiveAiConfiguration } from '@/hooks/use-ai-configurations'
import { useAddProductMedia } from '@/hooks/use-product-models'
import type { AiPrompt } from '@/services/ai-prompts'

interface AiEnhanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  originalImageUrl: string | null
  productId: string
}

const BUCKET = 'photo-group-media'

export function AiEnhanceDialog({
  open,
  onOpenChange,
  originalImageUrl,
  productId,
}: AiEnhanceDialogProps) {
  const [selectedPrompt, setSelectedPrompt] = useState<AiPrompt | null>(null)
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: prompts, isLoading: promptsLoading } = useActiveAiPrompts('image')
  const { data: aiConfig, isLoading: configLoading } = useActiveAiConfiguration('image_enhancement')
  const addMediaMutation = useAddProductMedia()

  function handleClose() {
    setSelectedPrompt(null)
    setEnhancedUrl(null)
    setGenerating(false)
    setSaving(false)
    onOpenChange(false)
  }

  async function handleGenerate() {
    if (!selectedPrompt || !originalImageUrl || !aiConfig) return

    setGenerating(true)
    setEnhancedUrl(null)

    try {
      // Substitute placeholders in the selected prompt text.
      const promptText = selectedPrompt.prompt_text
        .replace(/\{image_url\}/g, originalImageUrl)
        .replace(/\{original_url\}/g, originalImageUrl)

      const { data, error } = await supabase.functions.invoke('enhance-image', {
        body: {
          config_id: aiConfig.id,
          image_url: originalImageUrl,
          prompt: promptText,
        },
      })

      if (error) throw error
      if (!data?.success || !data?.image_url) {
        throw new Error(data?.error ?? 'Enhancement failed')
      }

      setEnhancedUrl(data.image_url as string)
      toast.success('Enhancement generated')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`AI enhancement failed: ${message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!enhancedUrl) return

    setSaving(true)

    try {
      // Fetch the enhanced image
      const imageResponse = await fetch(enhancedUrl)
      if (!imageResponse.ok) throw new Error('Failed to download enhanced image')
      const rawBlob = await imageResponse.blob()

      // Process through unified pipeline (square crop + resize + compress)
      const processed = await processImage(rawBlob)

      const basePath = `product-media/${productId}`
      const displayPath = `${basePath}/${processed.id}_display.webp`
      const thumbPath = `${basePath}/${processed.id}_thumb.webp`

      const [displayResult, thumbResult] = await Promise.all([
        supabase.storage.from(BUCKET).upload(displayPath, processed.display, {
          contentType: 'image/webp',
          upsert: false,
        }),
        supabase.storage.from(BUCKET).upload(thumbPath, processed.thumbnail, {
          contentType: 'image/webp',
          upsert: false,
        }),
      ])

      if (displayResult.error) throw displayResult.error
      if (thumbResult.error) throw thumbResult.error

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(displayPath)

      addMediaMutation.mutate(
        { productId, fileUrl: urlData.publicUrl, role: 'gallery', mediaType: 'image' },
        {
          onSuccess: () => {
            toast.success('Enhanced image saved')
            handleClose()
          },
          onError: (err) => {
            toast.error(`Failed to save: ${err.message}`)
          },
        },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Save failed: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  const noConfig = !configLoading && !aiConfig

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Enhance with AI
          </DialogTitle>
        </DialogHeader>

        {noConfig && (
          <div className="py-8 text-center">
            <p className="text-muted-foreground mb-2">
              No AI configuration is set up.
            </p>
            <p className="text-sm text-muted-foreground">
              Go to <span className="font-medium">AI Settings</span> to configure an image enhancement API.
            </p>
          </div>
        )}

        {!noConfig && (
          <div className="space-y-6">
            {/* Comparison View */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original */}
              <div>
                <p className="text-sm font-medium mb-2">Original</p>
                <div className="aspect-square rounded-lg overflow-hidden border bg-muted">
                  {originalImageUrl ? (
                    <img
                      src={originalImageUrl}
                      alt="Original"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      No image
                    </div>
                  )}
                </div>
              </div>

              {/* Enhanced */}
              <div>
                <p className="text-sm font-medium mb-2">Enhanced</p>
                <div className="aspect-square rounded-lg overflow-hidden border bg-muted">
                  {generating ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <p className="text-sm">Generating...</p>
                    </div>
                  ) : enhancedUrl ? (
                    <img
                      src={enhancedUrl}
                      alt="Enhanced"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      Select a prompt and click Generate
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Prompt Selection */}
            <div>
              <p className="text-sm font-medium mb-3">Select Enhancement Style</p>
              {promptsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading prompts...
                </div>
              ) : prompts && prompts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      type="button"
                      onClick={() => setSelectedPrompt(prompt)}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                        selectedPrompt?.id === prompt.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50',
                      )}
                    >
                      {prompt.sample_image_url && (
                        <img
                          src={prompt.sample_image_url}
                          alt=""
                          className="w-12 h-12 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{prompt.name}</p>
                        {prompt.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {prompt.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No image enhancement prompts available. Add prompts in AI Settings.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {!noConfig && (
            <>
              <Button
                onClick={handleGenerate}
                disabled={!selectedPrompt || generating || !originalImageUrl}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
              {enhancedUrl && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Save Enhanced
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
