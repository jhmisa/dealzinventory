import { ChevronLeft, HelpCircle } from 'lucide-react'
import { DealzWordmark } from '@/components/marketing/dealz-logo'

interface CheckoutShellProps {
  onBack?: () => void
  children: React.ReactNode
}

export function CheckoutShell({ onBack, children }: CheckoutShellProps) {
  return (
    <div className="min-h-dvh bg-brand-paper font-brand text-brand-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-5">
        <header className="flex items-center justify-between py-3">
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm disabled:opacity-0"
          >
            <ChevronLeft className="h-5 w-5 text-brand-ink" />
          </button>
          <DealzWordmark className="text-xl" />
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
            <HelpCircle className="h-5 w-5 text-brand-ash" />
          </span>
        </header>
        <main className="flex flex-1 flex-col pb-2">{children}</main>
      </div>
    </div>
  )
}
