import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import type { MessageChannel } from '@/lib/types'

const channelConfig: Record<MessageChannel, { label: string; className: string }> = {
  facebook: { label: 'FB', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  email: { label: 'Email', className: 'bg-gray-100 text-gray-800 border-gray-300' },
  sms: { label: 'SMS', className: 'bg-green-100 text-green-800 border-green-300' },
}

export const ChannelBadge = memo(function ChannelBadge({ channel }: { channel: MessageChannel }) {
  const config = channelConfig[channel] ?? channelConfig.facebook
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
})
