import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useCreateAiPrompt, useUpdateAiPrompt } from '@/hooks/use-ai-prompts'
import { aiPromptSchema, type AiPromptFormValues } from '@/validators/ai-prompt'
import type { AiPrompt } from '@/services/ai-prompts'

interface AiPromptFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editPrompt?: AiPrompt | null
}

export function AiPromptForm({ open, onOpenChange, editPrompt }: AiPromptFormProps) {
  const createMutation = useCreateAiPrompt()
  const updateMutation = useUpdateAiPrompt()

  const form = useForm<AiPromptFormValues>({
    resolver: zodResolver(aiPromptSchema),
    defaultValues: {
      name: '',
      description: '',
      prompt_text: '',
      media_type: 'image',
      sample_image_url: '',
      is_active: true,
      sort_order: 0,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: editPrompt?.name ?? '',
        description: editPrompt?.description ?? '',
        prompt_text: editPrompt?.prompt_text ?? '',
        media_type: editPrompt?.media_type ?? 'image',
        sample_image_url: editPrompt?.sample_image_url ?? '',
        is_active: editPrompt?.is_active ?? true,
        sort_order: editPrompt?.sort_order ?? 0,
      })
    }
  }, [open, editPrompt])

  const sampleUrl = form.watch('sample_image_url')

  function handleSubmit(values: AiPromptFormValues) {
    const payload = {
      ...values,
      description: values.description || null,
      sample_image_url: values.sample_image_url || null,
    }

    if (editPrompt) {
      updateMutation.mutate(
        { id: editPrompt.id, updates: payload },
        {
          onSuccess: () => {
            toast.success('Prompt updated')
            onOpenChange(false)
            form.reset()
          },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    } else {
      createMutation.mutate(
        payload,
        {
          onSuccess: () => {
            toast.success('Prompt created')
            onOpenChange(false)
            form.reset()
          },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editPrompt ? 'Edit' : 'Add'} AI Prompt</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Product Hero Shot" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of what this prompt does..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prompt_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prompt Text</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the AI prompt template..."
                      rows={5}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Supported placeholders: {'{product_name}'}, {'{brand}'}, {'{category}'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="media_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Media Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select media type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="image">Image</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sample_image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sample Image URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com/sample.jpg" {...field} />
                  </FormControl>
                  {sampleUrl && sampleUrl.startsWith('http') && (
                    <div className="mt-2">
                      <img
                        src={sampleUrl}
                        alt="Sample preview"
                        className="h-24 w-24 rounded-md border object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-6">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Active</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="font-normal whitespace-nowrap">Sort Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        className="w-20"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : editPrompt ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
