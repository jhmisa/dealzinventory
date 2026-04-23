import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { socialMediaPostSchema, type SocialMediaPostFormValues } from '@/validators/social-media-post'
import { ItemSearchInput } from './item-search-input'
import { MediaPicker } from './media-picker'
import { useCreateSocialMediaPost } from '@/hooks/use-social-media-posts'
import type { SocialPostStatus } from '@/lib/types'

interface PostFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PostFormDialog({ open, onOpenChange }: PostFormDialogProps) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const createMutation = useCreateSocialMediaPost()

  const form = useForm<SocialMediaPostFormValues>({
    resolver: zodResolver(socialMediaPostSchema),
    defaultValues: {
      item_id: '',
      item_code: '',
      platform: 'facebook',
      caption: '',
      media_urls: [],
      schedule_type: 'next_slot',
      scheduled_at: null,
    },
  })

  const itemId = form.watch('item_id')
  const scheduleType = form.watch('schedule_type')
  const mediaUrls = form.watch('media_urls')

  function handleSubmit(status: SocialPostStatus) {
    return form.handleSubmit((values) => {
      createMutation.mutate(
        {
          item_id: values.item_id,
          item_code: values.item_code,
          platform: values.platform,
          caption: values.caption || null,
          media_urls: values.media_urls,
          schedule_type: values.schedule_type,
          scheduled_at: values.scheduled_at || null,
          status,
        },
        {
          onSuccess: () => {
            toast.success(status === 'queued' ? 'Post queued' : 'Draft saved')
            form.reset()
            setSelectedProductId(null)
            onOpenChange(false)
          },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        }
      )
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Social Media Post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Item Search */}
          <div className="space-y-1.5">
            <Label>Item (P-code)</Label>
            <ItemSearchInput
              value={itemId}
              onSelect={(item) => {
                form.setValue('item_id', item.id, { shouldValidate: true })
                form.setValue('item_code', item.item_code)
                form.setValue('media_urls', [])
                setSelectedProductId(item.product_id)
              }}
            />
            {form.formState.errors.item_id && (
              <p className="text-xs text-destructive">{form.formState.errors.item_id.message}</p>
            )}
          </div>

          {/* Media Picker */}
          <div className="space-y-1.5">
            <Label>
              Media
              {mediaUrls.length > 0 && (
                <span className="text-muted-foreground ml-1">({mediaUrls.length} selected)</span>
              )}
            </Label>
            <MediaPicker
              itemId={itemId || undefined}
              productId={selectedProductId}
              selected={mediaUrls}
              onSelectionChange={(urls) => form.setValue('media_urls', urls, { shouldValidate: true })}
            />
            {form.formState.errors.media_urls && (
              <p className="text-xs text-destructive">{form.formState.errors.media_urls.message}</p>
            )}
          </div>

          {/* Schedule Type */}
          <div className="space-y-1.5">
            <Label>Schedule</Label>
            <RadioGroup
              value={scheduleType}
              onValueChange={(val) => form.setValue('schedule_type', val as 'now' | 'next_slot' | 'scheduled')}
              className="flex gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="now" id="sched-now" />
                <Label htmlFor="sched-now" className="font-normal text-sm">Now</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="next_slot" id="sched-next" />
                <Label htmlFor="sched-next" className="font-normal text-sm">Next Slot</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="scheduled" id="sched-custom" />
                <Label htmlFor="sched-custom" className="font-normal text-sm">Custom Date</Label>
              </div>
            </RadioGroup>
            {scheduleType === 'scheduled' && (
              <Input
                type="datetime-local"
                {...form.register('scheduled_at')}
                className="mt-1.5"
              />
            )}
          </div>

          {/* Caption */}
          <div className="space-y-1.5">
            <Label>Caption (optional)</Label>
            <Textarea
              placeholder="Leave blank to auto-generate with Claude..."
              rows={3}
              {...form.register('caption')}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={createMutation.isPending}
              onClick={() => handleSubmit('draft')}
            >
              Save Draft
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={createMutation.isPending}
              onClick={() => handleSubmit('queued')}
            >
              Queue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
