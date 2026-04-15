import { memo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bot } from 'lucide-react'
import type { MessageRole } from '@/lib/types'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (name[0] ?? '?').toUpperCase()
}

interface MessageAvatarProps {
  role: MessageRole
  name: string
  avatarUrl?: string | null
}

export const MessageAvatar = memo(function MessageAvatar({
  role,
  name,
  avatarUrl,
}: MessageAvatarProps) {
  if (role === 'assistant') {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
    )
  }

  return (
    <Avatar size="sm">
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className="text-[10px]">{getInitials(name)}</AvatarFallback>
    </Avatar>
  )
})
