import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Check, Bot, Sparkles, FileText, Pencil, ShieldAlert, BookOpen, FlaskConical, Send, ChevronUp, ChevronDown, RotateCcw, Power, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatCustomerName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
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
  useUpdateAiProvider,
  useDeleteAiProvider,
  useActivePersona,
  useUpdatePersona,
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useKnowledgeBase,
  useCreateKnowledgeBaseEntry,
  useUpdateKnowledgeBaseEntry,
  useDeleteKnowledgeBaseEntry,
  useTestAIReply,
  useSystemSetting,
  useUpdateSystemSetting,
  useMessageSyncStatus,
  useRunMessageSync,
  type MessageSyncProgress,
} from '@/hooks/use-messaging'
import { useCustomers } from '@/hooks/use-customers'
import type { AiProvider, MessagingTemplate, MessagingTemplateInsert, KnowledgeBaseEntry, TestAIMessage, TestAIResponse } from '@/lib/types'

// ---------- AI Provider Form ----------

function ProviderFormDialog({
  open,
  onOpenChange,
  editProvider,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editProvider?: AiProvider | null
}) {
  const [name, setName] = useState(editProvider?.name ?? '')
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'google' | 'openrouter'>(editProvider?.provider ?? 'anthropic')
  const [modelId, setModelId] = useState(editProvider?.model_id ?? '')
  const [apiKey, setApiKey] = useState('')

  const createProvider = useCreateAiProvider()
  const updateProvider = useUpdateAiProvider()

  const isEdit = !!editProvider
  if (isEdit && name !== editProvider.name && !updateProvider.isPending) {
    setName(editProvider.name)
    setProvider(editProvider.provider)
    setModelId(editProvider.model_id)
    setApiKey('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !modelId) return

    if (isEdit) {
      const updates: Record<string, string> = { name, provider, model_id: modelId }
      if (apiKey) updates.api_key_encrypted = apiKey
      updateProvider.mutate(
        { id: editProvider.id, updates },
        {
          onSuccess: () => { toast.success('Provider updated'); onOpenChange(false) },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    } else {
      if (!apiKey) return
      createProvider.mutate(
        { name, provider, model_id: modelId, api_key_encrypted: apiKey, purpose: 'messaging' },
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
  }

  const modelSuggestions: Record<string, string[]> = {
    anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-5-20251001'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    google: ['gemini-2.5-pro-preview-06-05', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    openrouter: ['openrouter/auto', 'google/gemini-2.5-flash', 'google/gemini-2.0-flash-001', 'anthropic/claude-sonnet-4', 'openai/gpt-4o-mini'],
  }

  const isPending = createProvider.isPending || updateProvider.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit AI Provider' : 'Add AI Provider'}</DialogTitle>
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
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Model ID</Label>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="e.g. claude-sonnet-4-20250514"
              list={`models-${provider}`}
            />
            <datalist id={`models-${provider}`}>
              {modelSuggestions[provider]?.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>API Key{isEdit ? ' (leave blank to keep current)' : ''}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit ? '(unchanged)' : 'sk-...'}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !name || !modelId || (!isEdit && !apiKey)}>
              {isEdit ? 'Update' : 'Add Provider'}
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

// ---------- Knowledge Base / Guardrail Form ----------

const KB_CATEGORY_OPTIONS = ['Products', 'Shipping', 'Returns', 'Payments', 'Grading', 'Policies', 'FAQ', 'Kaitori', 'Custom'] as const

function KbEntryFormDialog({
  open,
  onOpenChange,
  entry,
  entryType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: KnowledgeBaseEntry | null
  entryType: 'knowledge' | 'guardrail'
}) {
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [category, setCategory] = useState(entry?.category ?? 'Custom')
  const [isActive, setIsActive] = useState(entry?.is_active ?? true)

  const createEntry = useCreateKnowledgeBaseEntry()
  const updateEntry = useUpdateKnowledgeBaseEntry()

  const isEdit = !!entry
  if (isEdit && title !== entry.title && !createEntry.isPending) {
    setTitle(entry.title)
    setContent(entry.content)
    setCategory(entry.category)
    setIsActive(entry.is_active)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !content) return

    if (isEdit) {
      updateEntry.mutate(
        { id: entry.id, updates: { title, content, category, is_active: isActive } },
        {
          onSuccess: () => { toast.success(`${entryType === 'guardrail' ? 'Rule' : 'Article'} updated`); onOpenChange(false) },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    } else {
      createEntry.mutate(
        { entry_type: entryType, title, content, category, is_active: isActive },
        {
          onSuccess: () => { toast.success(`${entryType === 'guardrail' ? 'Rule' : 'Article'} created`); onOpenChange(false) },
          onError: (err) => toast.error(`Failed: ${err.message}`),
        },
      )
    }
  }

  const isPending = createEntry.isPending || updateEntry.isPending
  const isGuardrail = entryType === 'guardrail'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'New'} {isGuardrail ? 'Rule' : 'Article'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isGuardrail ? 'e.g. Never share selling prices' : 'e.g. Shipping Information'}
            />
          </div>
          {!isGuardrail && (
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KB_CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>{isGuardrail ? 'Rule Description' : 'Content'}</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={`min-h-[150px] text-sm ${!isGuardrail ? 'font-mono' : ''}`}
              placeholder={isGuardrail ? 'Describe the rule the AI must follow...' : 'Article content...'}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Active</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !title || !content}>
              {isEdit ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Confidence Badge ----------

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.7) {
    return <Badge className="bg-green-100 text-green-800 border-green-300" variant="outline">{(confidence * 100).toFixed(0)}%</Badge>
  }
  if (confidence >= 0.5) {
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300" variant="outline">{(confidence * 100).toFixed(0)}%</Badge>
  }
  return <Badge className="bg-red-100 text-red-800 border-red-300" variant="outline">{(confidence * 100).toFixed(0)}%</Badge>
}

// ---------- Main Page ----------

export default function MessagingSettingsPage() {
  const [providerFormOpen, setProviderFormOpen] = useState(false)
  const [editProvider, setEditProvider] = useState<AiProvider | null>(null)
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [editTemplate, setEditTemplate] = useState<MessagingTemplate | null>(null)
  const [kbFormOpen, setKbFormOpen] = useState(false)
  const [editKbEntry, setEditKbEntry] = useState<KnowledgeBaseEntry | null>(null)
  const [kbFormType, setKbFormType] = useState<'knowledge' | 'guardrail'>('knowledge')

  const { data: providers = [], isLoading: loadingProviders } = useAiProviders()
  const { data: templates = [], isLoading: loadingTemplates } = useTemplates()
  const { data: kbEntries = [], isLoading: loadingKb } = useKnowledgeBase()
  const deleteTemplateMutation = useDeleteTemplate()
  const setActive = useSetActiveAiProvider()
  const deleteProvider = useDeleteAiProvider()
  const { data: persona, isLoading: loadingPersona } = useActivePersona()
  const updatePersona = useUpdatePersona()
  const updateKbEntry = useUpdateKnowledgeBaseEntry()
  const deleteKbEntry = useDeleteKnowledgeBaseEntry()

  const { data: aiGlobalEnabled, isLoading: loadingAiGlobal } = useSystemSetting('ai_messaging_enabled')
  const updateSystemSetting = useUpdateSystemSetting()

  const guardrails = kbEntries.filter((e) => e.entry_type === 'guardrail')
  const knowledgeArticles = kbEntries.filter((e) => e.entry_type === 'knowledge')

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

  // Test playground state
  const [testMessages, setTestMessages] = useState<(TestAIMessage & { meta?: TestAIResponse })[]>([])
  const [testInput, setTestInput] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined)
  const { data: customerResults } = useCustomers(customerSearch || undefined)
  const testAI = useTestAIReply()
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [testMessages])

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

  function handleToggleKbEntry(entry: KnowledgeBaseEntry) {
    updateKbEntry.mutate(
      { id: entry.id, updates: { is_active: !entry.is_active } },
      {
        onSuccess: () => toast.success(`${entry.title} ${entry.is_active ? 'disabled' : 'enabled'}`),
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleMoveKbEntry(entry: KnowledgeBaseEntry, direction: 'up' | 'down') {
    const sameType = kbEntries.filter((e) => e.entry_type === entry.entry_type)
    const idx = sameType.findIndex((e) => e.id === entry.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sameType.length) return

    const swapEntry = sameType[swapIdx]
    updateKbEntry.mutate({ id: entry.id, updates: { sort_order: swapEntry.sort_order } })
    updateKbEntry.mutate({ id: swapEntry.id, updates: { sort_order: entry.sort_order } })
  }

  function handleDeleteKbEntry(entry: KnowledgeBaseEntry) {
    deleteKbEntry.mutate(entry.id, {
      onSuccess: () => toast.success(`${entry.title} deleted`),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handleSendTestMessage() {
    if (!testInput.trim()) return
    const newMsg: TestAIMessage = { role: 'customer', content: testInput.trim() }
    const allMessages = [...testMessages.map(({ role, content }) => ({ role, content })), newMsg]
    setTestMessages((prev) => [...prev, newMsg])
    setTestInput('')

    testAI.mutate(
      { messages: allMessages, customerId: selectedCustomerId },
      {
        onSuccess: (response) => {
          setTestMessages((prev) => [
            ...prev,
            {
              role: 'assistant' as const,
              content: response.reply,
              meta: response,
            },
          ])
        },
        onError: (err) => {
          toast.error(`AI error: ${err.message}`)
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Messaging"
        description="Configure AI providers, persona, guardrails, knowledge base, and test the AI"
      />

      {/* Global AI Kill Switch */}
      <Card className={aiGlobalEnabled === 'true' ? 'border-green-200 bg-green-50/50' : 'border-orange-200 bg-orange-50/50'}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Power className={`h-5 w-5 ${aiGlobalEnabled === 'true' ? 'text-green-600' : 'text-orange-600'}`} />
            <div>
              <p className="font-medium">AI Auto-Replies</p>
              <p className="text-sm text-muted-foreground">
                {aiGlobalEnabled === 'true'
                  ? 'AI drafts are enabled globally. Per-conversation toggles still apply.'
                  : 'AI drafts are globally disabled. No AI drafts will be generated for any conversation.'}
              </p>
            </div>
          </div>
          <Switch
            checked={aiGlobalEnabled === 'true'}
            disabled={loadingAiGlobal || updateSystemSetting.isPending}
            onCheckedChange={(checked) => {
              updateSystemSetting.mutate(
                { key: 'ai_messaging_enabled', value: checked ? 'true' : 'false' },
                {
                  onSuccess: () => toast.success(checked ? 'AI auto-replies enabled' : 'AI auto-replies disabled'),
                  onError: (err) => toast.error(`Failed: ${err.message}`),
                },
              )
            }}
          />
        </CardContent>
      </Card>

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
            <Button size="sm" onClick={() => { setEditProvider(null); setProviderFormOpen(true) }}>
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
                      onClick={() => { setEditProvider(p); setProviderFormOpen(true) }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
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

      <ProviderFormDialog open={providerFormOpen} onOpenChange={setProviderFormOpen} editProvider={editProvider} />

      {/* Persona Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Persona
          </CardTitle>
          <CardDescription>
            Define how the AI responds to customers — tone, language, and personality
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
                <Label>System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => { setSystemPrompt(e.target.value); setPersonaDirty(true) }}
                  className="min-h-[300px] font-mono text-xs"
                  placeholder="System instructions for the AI agent..."
                />
                <p className="text-xs text-muted-foreground">
                  Core personality and instructions. Guardrails and knowledge base articles are injected automatically around this prompt.
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

      {/* AI Guardrails Section */}
      <Card className="border-red-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="h-5 w-5" />
                AI Guardrails
              </CardTitle>
              <CardDescription>Rules the AI must NEVER violate — injected at the top of every prompt</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => { setEditKbEntry(null); setKbFormType('guardrail'); setKbFormOpen(true) }}
            >
              <Plus className="h-4 w-4" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingKb ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : guardrails.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No guardrails configured. Add rules to prevent the AI from making mistakes.
            </p>
          ) : (
            <div className="space-y-3">
              {guardrails.map((g) => (
                <div
                  key={g.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${g.is_active ? 'border-red-200 bg-red-50/50' : 'opacity-60'}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch
                      checked={g.is_active}
                      onCheckedChange={() => handleToggleKbEntry(g)}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{g.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{g.content}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button size="icon-xs" variant="ghost" onClick={() => { setEditKbEntry(g); setKbFormType('guardrail'); setKbFormOpen(true) }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon-xs" variant="ghost" onClick={() => handleDeleteKbEntry(g)} disabled={deleteKbEntry.isPending}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Base Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Knowledge Base
              </CardTitle>
              <CardDescription>Informational articles injected into the AI's context</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setEditKbEntry(null); setKbFormType('knowledge'); setKbFormOpen(true) }}>
              <Plus className="h-4 w-4" />
              Add Article
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingKb ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : knowledgeArticles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No knowledge articles yet. Add articles to give the AI domain knowledge.
            </p>
          ) : (
            <div className="space-y-3">
              {knowledgeArticles.map((k, idx) => (
                <div
                  key={k.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${!k.is_active ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch
                      checked={k.is_active}
                      onCheckedChange={() => handleToggleKbEntry(k)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{k.title}</p>
                        <Badge variant="secondary" className="shrink-0">{k.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{k.content}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button size="icon-xs" variant="ghost" onClick={() => handleMoveKbEntry(k, 'up')} disabled={idx === 0}>
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon-xs" variant="ghost" onClick={() => handleMoveKbEntry(k, 'down')} disabled={idx === knowledgeArticles.length - 1}>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button size="icon-xs" variant="ghost" onClick={() => { setEditKbEntry(k); setKbFormType('knowledge'); setKbFormOpen(true) }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon-xs" variant="ghost" onClick={() => handleDeleteKbEntry(k)} disabled={deleteKbEntry.isPending}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <KbEntryFormDialog
        open={kbFormOpen}
        onOpenChange={setKbFormOpen}
        entry={editKbEntry}
        entryType={kbFormType}
      />

      {/* AI Test Playground Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5" />
                AI Test Playground
              </CardTitle>
              <CardDescription>Test the AI before it handles real customers</CardDescription>
            </div>
            {testMessages.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setTestMessages([])}>
                <RotateCcw className="h-4 w-4" />
                Clear Chat
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer Selector */}
          <div className="space-y-2">
            <Label>Customer Context (optional)</Label>
            <div className="flex gap-2">
              <Input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customer by name or code..."
                className="flex-1"
              />
              {selectedCustomerId && (
                <Button size="sm" variant="outline" onClick={() => { setSelectedCustomerId(undefined); setCustomerSearch('') }}>
                  Clear
                </Button>
              )}
            </div>
            {customerSearch && !selectedCustomerId && customerResults && customerResults.length > 0 && (
              <div className="rounded-md border bg-popover text-popover-foreground shadow-md">
                {customerResults.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                    onClick={() => {
                      setSelectedCustomerId(c.id)
                      setCustomerSearch(`${c.customer_code} — ${formatCustomerName(c)}`)
                    }}
                  >
                    <Badge variant="outline" className="shrink-0">{c.customer_code}</Badge>
                    <span>{formatCustomerName(c)}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedCustomerId ? 'Real customer data (orders, kaitori) will be injected into AI context.' : 'No customer selected — AI will respond with general knowledge only.'}
            </p>
          </div>

          <Separator />

          {/* Chat Area */}
          <ScrollArea className="h-[400px] rounded-md border p-4">
            <div className="space-y-4">
              {testMessages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">
                  Send a message to test the AI. The full system prompt, guardrails, and knowledge base will be used.
                </p>
              )}
              {testMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] space-y-1 ${msg.role === 'customer' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        msg.role === 'customer'
                          ? 'bg-blue-500 text-white'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.meta && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <ConfidenceBadge confidence={msg.meta.confidence} />
                        <Badge variant="outline" className="text-xs">{msg.meta.intent}</Badge>
                        {msg.meta.escalation_reason && (
                          <Badge variant="destructive" className="text-xs">
                            Escalate: {msg.meta.escalation_reason}
                          </Badge>
                        )}
                        {msg.meta.data_used.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Data: {msg.meta.data_used.join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {testAI.isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground animate-pulse">
                    AI is thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          {/* Input Bar */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSendTestMessage() }}
            className="flex gap-2"
          >
            <Input
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Type a test message..."
              className="flex-1"
              disabled={testAI.isPending}
            />
            <Button type="submit" disabled={testAI.isPending || !testInput.trim()}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          </form>
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

      {/* Message Sync */}
      <MessageSyncCard />
    </div>
  )
}

// ---------- Message Sync Card ----------

const SYNC_WINDOWS = [
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
] as const

function windowToSince(window: string): string {
  const now = Date.now()
  const ms: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  }
  return new Date(now - (ms[window] ?? ms['24h'])).toISOString()
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function MessageSyncCard() {
  const [window, setWindow] = useState('24h')
  const [progress, setProgress] = useState<MessageSyncProgress | null>(null)
  const { data: syncStatus, isLoading: loadingStatus } = useMessageSyncStatus()
  const runSync = useRunMessageSync()

  const handleSync = () => {
    const since = windowToSince(window)
    setProgress({ scanned: 0, total: 0, recovered: 0, errors: 0 })
    runSync.mutate(
      {
        since,
        onProgress: setProgress,
      },
      {
        onSuccess: (result) => {
          setProgress(null)
          if (result.inserted_count > 0 && result.error_count > 0) {
            toast.success(
              `Recovered ${result.inserted_count} message(s) (${result.error_count} conversation(s) had errors)`
            )
          } else if (result.inserted_count > 0) {
            toast.success(`Recovered ${result.inserted_count} missing message(s)`)
          } else if (result.error_count > 0) {
            toast.error(`Sync completed with ${result.error_count} error(s)`)
          } else {
            toast.success(`All messages are synced`)
          }
        },
        onError: (err) => {
          setProgress(null)
          toast.error(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            <div>
              <CardTitle className="text-base">Message Sync</CardTitle>
              <CardDescription>
                Checks for customer messages that may have been missed by the live webhook
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Last sync status */}
        {loadingStatus ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : syncStatus ? (
          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              {syncStatus.status === 'ok' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-green-700 font-medium">All synced</span>
                </>
              )}
              {syncStatus.status === 'recovered' && (
                <>
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-yellow-700 font-medium">
                    Recovered {syncStatus.inserted_count} missing message(s)
                  </span>
                </>
              )}
              {syncStatus.status === 'error' && (
                <>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-red-700 font-medium">
                    {syncStatus.error_count} error(s) during sync
                  </span>
                </>
              )}
              <span className="text-muted-foreground ml-auto">
                {timeAgo(syncStatus.checked_at)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Scanned {syncStatus.conversations_scanned} conversations
            </p>
            {syncStatus.inserted_preview && syncStatus.inserted_preview.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
                {syncStatus.inserted_preview.map((m, i) => (
                  <div key={i} className="truncate">
                    {m.created_at ? new Date(m.created_at).toLocaleTimeString() : '?'} — {m.preview || '(attachment)'}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No sync has run yet.</p>
        )}

        {/* Run sync controls */}
        <div className="flex items-center gap-3">
          <Select value={window} onValueChange={setWindow}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SYNC_WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSync}
            disabled={runSync.isPending}
            className="gap-2"
          >
            {runSync.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {runSync.isPending ? 'Syncing...' : 'Run sync now'}
          </Button>
        </div>

        {runSync.isPending && progress !== null && (
          <div className="space-y-1.5">
            <Progress value={progress.total > 0 ? (progress.scanned / progress.total) * 100 : undefined} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.total > 0 ? `${progress.scanned} / ${progress.total} conversations` : 'Starting sync...'}</span>
              <span>
                {progress.recovered > 0 && `${progress.recovered} recovered · `}
                {progress.scanned - progress.recovered} synced
                {progress.errors > 0 && ` · ${progress.errors} errors`}
              </span>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Automatic sync runs every 15 minutes. Use this button if you suspect messages are missing.
        </p>
      </CardContent>
    </Card>
  )
}
