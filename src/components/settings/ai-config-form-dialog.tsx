import { useState, useEffect } from 'react'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useCreateAiConfiguration, useUpdateAiConfiguration } from '@/hooks/use-ai-configurations'
import { aiConfigurationSchema, AI_PURPOSES, type AiConfigurationFormValues } from '@/validators/ai-configuration'
import type { AiConfiguration } from '@/lib/types'

interface AiConfigFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editConfig?: AiConfiguration | null
}

export function AiConfigFormDialog({ open, onOpenChange, editConfig }: AiConfigFormDialogProps) {
  const [showKey, setShowKey] = useState(false)
  const createMutation = useCreateAiConfiguration()
  const updateMutation = useUpdateAiConfiguration()

  const form = useForm<AiConfigurationFormValues>({
    resolver: zodResolver(aiConfigurationSchema),
    defaultValues: {
      service_name: '',
      api_endpoint_url: '',
      api_key_encrypted: '',
      purpose: 'general',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        service_name: editConfig?.service_name ?? '',
        api_endpoint_url: editConfig?.api_endpoint_url ?? '',
        api_key_encrypted: editConfig ? '••••••••' : '',
        purpose: (editConfig as Record<string, unknown>)?.purpose as string ?? 'general',
      })
      setShowKey(false)
    }
  }, [open, editConfig])

  function handleSubmit(values: AiConfigurationFormValues) {
    if (editConfig) {
      const updates: Record<string, string> = {
        service_name: values.service_name,
        api_endpoint_url: values.api_endpoint_url,
        purpose: values.purpose,
      }
      if (values.api_key_encrypted !== '••••••••') {
        updates.api_key_encrypted = values.api_key_encrypted
      }
      updateMutation.mutate(
        { id: editConfig.id, updates },
        {
          onSuccess: () => {
            toast.success('AI configuration updated')
            onOpenChange(false)
            form.reset()
          },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    } else {
      createMutation.mutate(
        values,
        {
          onSuccess: () => {
            toast.success('AI configuration created')
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editConfig ? 'Edit' : 'Add'} AI Service</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="service_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. "Claude API", "OpenAI"' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select purpose" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AI_PURPOSES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="api_endpoint_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Endpoint URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://api.anthropic.com/v1/messages" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="api_key_encrypted"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showKey ? 'text' : 'password'}
                        placeholder="sk-..."
                        {...field}
                        onFocus={() => {
                          if (field.value === '••••••••') {
                            field.onChange('')
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1 h-7 text-xs"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : editConfig ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
