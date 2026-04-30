import { formatPhoneDisplay } from '@/lib/phone'

interface PhoneDisplayProps {
  phone: string | null | undefined
  className?: string
}

export function PhoneDisplay({ phone, className }: PhoneDisplayProps) {
  if (!phone) return <span className={className}>-</span>
  const formatted = formatPhoneDisplay(phone)
  return <span className={className}>{formatted}</span>
}
