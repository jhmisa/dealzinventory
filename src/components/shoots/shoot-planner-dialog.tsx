import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { shootPlannerChat, type ShootPlannerMessage } from '@/services/shoot-planner'

interface ShootPlannerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// One-tap preset asks — make the valuable inventory queries discoverable (pull, not push).
const PRESETS = [
  '🕗 Aged 60+ days',
  '💰 Best deals',
  '✨ Just inspected',
  '💻 Budget laptops under ¥40k',
] as const

const PRESET_PROMPTS: Record<string, string> = {
  '🕗 Aged 60+ days': 'Find items that have been in stock 60+ days and propose a shoot to move them.',
  '💰 Best deals': 'Find our best-value discounted items and propose a "best deals" shoot.',
  '✨ Just inspected': 'Find recently inspected, freshly available items and propose a shoot.',
  '💻 Budget laptops under ¥40k': 'Find laptops under ¥40,000 in stock and propose a budget laptop shoot.',
}

export function ShootPlannerDialog({ open, onOpenChange }: ShootPlannerDialogProps) {
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<ShootPlannerMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (!open) {
      setMessages([])
      setInput('')
      setSending(false)
    }
  }, [open])

  async function send(text: string) {
    const content = text.trim()
    if (!content || sending) return
    const nextThread: ShootPlannerMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextThread)
    setInput('')
    setSending(true)
    try {
      const res = await shootPlannerChat(nextThread)
      setMessages([...nextThread, { role: 'assistant', content: res.reply || '(no reply)' }])
      if (res.createdShootId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.shoots.all })
        toast.success('Shoot added to the Planned lane')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Planner failed')
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Sorry, something went wrong.' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Plan a shoot with AI
          </DialogTitle>
          <DialogDescription>
            Ask for what to feature. The planner searches live stock and drops a shoot on the Planned lane.
          </DialogDescription>
        </DialogHeader>

        {/* Preset asks */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={sending}
              onClick={() => send(PRESET_PROMPTS[p])}
            >
              {p}
            </Button>
          ))}
        </div>

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 min-h-[220px] overflow-y-auto rounded-lg border bg-muted/30 p-3 space-y-3">
          {messages.length === 0 && !sending ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Try a preset above, or ask e.g. “find 5 gaming laptops to showcase”.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background border',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the planner…"
            disabled={sending}
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
