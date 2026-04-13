import { useState } from 'react'
import { Plus, Trash2, Check, Bot, Sparkles, FileText, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import {
  useAiProviders,
  useCreateAiProvider,
  useSetActiveAiProvider,
  useDeleteAiProvider,
  useActivePersona,
  useUpdatePersona,
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from '@/hooks/use-messaging'
import type { AiProvider, MessagingTemplate, MessagingTemplateInsert } from '@/lib/types'

// ---------- AI Provider Form ----------

function AddProviderDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'google'>('anthropic')
  const [modelId, setModelId] = useState('')
  const [apiKey, setApiKey] = useState('')

  const createProvider = useCreateAiProvider()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !modelId || !apiKey) return

    createProvider.mutate(
      {
        name,
        provider,
        model_id: modelId,
        api_key_encrypted: apiKey,
        purpose: 'messaging',
      },
      {
        onSuccess: () => {
          toast.success('AI provider added')
          onOpenChange(false)
          setName('')
          setModelId('')
          setApiKey('')
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  const modelSuggestions: Record<string, string[]> = {
    anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
    openai: ['gpt-4o', 'gpt-4o-mini'],
    google: ['gemini-2.0-flash', 'gemini-2.5-pro-preview-06-05'],
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add AI Provider</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claude Sonnet" />
          </div>
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => { setProvider(v as typeof provider); setModelId('') }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                <SelectItem value="google">Google (Gemini)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Model ID</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
              <SelectContent>
                {modelSuggestions[provider]?.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createProvider.isPending || !name || !modelId || !apiKey}>
              Add Provider
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Template Form ----------

const MESSAGE_TYPE_OPTIONS = [
  { value: 'REPLY', label: 'Reply' },
  { value: 'REVIEW_REQUEST', label: 'Review Request' },
  { value: 'DELIVERY_ALERT', label: 'Delivery Alert' },
] as const

function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: MessagingTemplate | null
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [contentEn, setContentEn] = useState(template?.content_en ?? '')
  const [contentJa, setContentJa] = useState(template?.content_ja ?? '')
  const [messageType, setMessageType] = useState<string>(template?.message_type ?? 'REPLY')
  const [variables, setVariables] = useState(template?.variables?.join(', ') ?? '')

  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()

  // Reset form when template changes
  const isEdit = !!template
  if (isEdit && name !== template.name && !createTemplate.isPending) {
    setName(template.name)
    setDescription(template.description ?? '')
    setContentEn(template.content_en)
    setContentJa(template.content_ja)
    setMessageType(template.message_type)
    setVariables(template.variables?.join(', ') ?? '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: MessagingTemplateInsert = {
      name,
      description: description || null,
      content_en: contentEn,
      content_ja: contentJa,
      message_type: messageType as MessagingTemplateInsert['message_type'],
      variables: variables.split(',').map((v) => v.trim()).filter(Boolean),
    }

    if (isEdit) {
      updateTemplate.mutate(
        { id: template.id, updates: payload },
        {
          onSuccess: () => { toast.success('Template updated'); onOpenChange(false) },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    } else {
      createTemplate.mutate(payload, {
        onSuccess: () => { toast.success('Template created'); onOpenChange(false) },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      })
    }
  }

  const isPending = createTemplate.isPending || updateTemplate.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Review Request" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESSAGE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this template is for..." />
          </div>
          <div className="space-y-2">
            <Label>Content (English / Taglish)</Label>
            <Textarea value={contentEn} onChange={(e) => setContentEn(e.target.value)} className="min-h-[100px] text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Content (Japanese)</Label>
            <Textarea value={contentJa} onChange={(e) => setContentJa(e.target.value)} className="min-h-[100px] text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Variables (comma-separated)</Label>
            <Input value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="customer_name, order_code, tracking_number" />
            <p className="text-xs text-muted-foreground">Use {'{{variable_name}}'} in content. Available: customer_name, customer_code, order_code, order_status, tracking_number, yamato_status, total_price, shop_url</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !name || !contentEn || !contentJa}>
              {isEdit ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Main Page ----------

export default function MessagingSettingsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [editTemplate, setEditTemplate] = useState<MessagingTemplate | null>(null)

  const { data: providers = [], isLoading: loadingProviders } = useAiProviders()
  const { data: templates = [], isLoading: loadingTemplates } = useTemplates()
  const deleteTemplateMutation = useDeleteTemplate()
  const setActive = useSetActiveAiProvider()
  const deleteProvider = useDeleteAiProvider()
  const { data: persona, isLoading: loadingPersona } = useActivePersona()
  const updatePersona = useUpdatePersona()

  // Persona form state
  const [personaName, setPersonaName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [languageStyle, setLanguageStyle] = useState('')
  const [useEmojis, setUseEmojis] = useState(true)
  const [greetingTemplate, setGreetingTemplate] = useState('')
  const [personaDirty, setPersonaDirty] = useState(false)

  // Sync persona data when loaded
  const personaLoaded = !loadingPersona && persona
  if (personaLoaded && !personaDirty) {
    if (personaName !== persona.name) setPersonaName(persona.name)
    if (systemPrompt !== persona.system_prompt) setSystemPrompt(persona.system_prompt)
    if (languageStyle !== persona.language_style) setLanguageStyle(persona.language_style)
    if (useEmojis !== persona.use_emojis) setUseEmojis(persona.use_emojis)
    if (greetingTemplate !== (persona.greeting_template ?? '')) setGreetingTemplate(persona.greeting_template ?? '')
  }

  function handleSavePersona() {
    if (!persona) return
    updatePersona.mutate(
      {
        id: persona.id,
        updates: {
          name: personaName,
          system_prompt: systemPrompt,
          language_style: languageStyle,
          use_emojis: useEmojis,
          greeting_template: greetingTemplate || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Persona updated')
          setPersonaDirty(false)
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleActivate(provider: AiProvider) {
    setActive.mutate(
      { id: provider.id },
      {
        onSuccess: () => toast.success(`${provider.name} is now active`),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleDeleteProvider(provider: AiProvider) {
    deleteProvider.mutate(provider.id, {
      onSuccess: () => toast.success('Provider deleted'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Messaging"
        description="Configure AI providers and agent persona for automated customer replies"
      />

      {/* AI Providers Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Providers
              </CardTitle>
              <CardDescription>Add and manage AI services for message generation</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Provider
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingProviders ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No AI providers configured. Add one to enable AI auto-replies.
            </p>
          ) : (
            <div className="space-y-3">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {p.is_active ? (
                      <Badge className="bg-green-100 text-green-800 border-green-300" variant="outline">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.provider} / {p.model_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!p.is_active && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleActivate(p)}
                        disabled={setActive.isPending}
                      >
                        <Check className="h-3 w-3" />
                        Activate
                      </Button>
                    )}
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleDeleteProvider(p)}
                      disabled={deleteProvider.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddProviderDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Persona Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Persona
          </CardTitle>
          <CardDescription>
            Define how the AI responds to customers — tone, language, and knowledge base
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPersona ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !persona ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No persona configured. One was seeded during migration — check the database.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Persona Name</Label>
                  <Input
                    value={personaName}
                    onChange={(e) => { setPersonaName(e.target.value); setPersonaDirty(true) }}
                    placeholder="e.g. Dealz Assistant"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Language Style</Label>
                  <Select
                    value={languageStyle}
                    onValueChange={(v) => { setLanguageStyle(v); setPersonaDirty(true) }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="taglish">Taglish (Tagalog + English)</SelectItem>
                      <SelectItem value="english">English</SelectItem>
                      <SelectItem value="japanese">Japanese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={useEmojis}
                  onCheckedChange={(v) => { setUseEmojis(v); setPersonaDirty(true) }}
                />
                <Label>Use emojis in messages</Label>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>System Prompt (includes knowledge base)</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => { setSystemPrompt(e.target.value); setPersonaDirty(true) }}
                  className="min-h-[300px] font-mono text-xs"
                  placeholder="System instructions for the AI agent..."
                />
                <p className="text-xs text-muted-foreground">
                  This prompt defines the AI's personality, rules, and knowledge. Customer context (orders, tracking) is injected automatically.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Greeting Template</Label>
                <Input
                  value={greetingTemplate}
                  onChange={(e) => { setGreetingTemplate(e.target.value); setPersonaDirty(true) }}
                  placeholder="e.g. Hi po! 😊 Paano kita matutulungan today?"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSavePersona}
                  disabled={!personaDirty || updatePersona.isPending}
                >
                  Save Persona
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Templates Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Message Templates
              </CardTitle>
              <CardDescription>Pre-built templates for automated messages (review requests, delivery alerts)</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setEditTemplate(null); setTemplateFormOpen(true) }}>
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTemplates ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No templates yet. Default templates are created by the automation migration.
            </p>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.name}</span>
                      <Badge variant="outline">{t.message_type.replace('_', ' ')}</Badge>
                      {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => { setEditTemplate(t); setTemplateFormOpen(true) }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => {
                          deleteTemplateMutation.mutate(t.id, {
                            onSuccess: () => toast.success('Template deleted'),
                            onError: (err) => toast.error(`Failed: ${err.message}`),
                          })
                        }}
                        disabled={deleteTemplateMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Variables: {t.variables.length > 0 ? t.variables.map((v) => `{{${v}}}`).join(', ') : 'None'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateFormDialog
        open={templateFormOpen}
        onOpenChange={setTemplateFormOpen}
        template={editTemplate}
      />
    </div>
  )
}
