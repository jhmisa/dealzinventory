import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/shared/phone-input'
import { StickyCta } from '../sticky-cta'
import { CheckoutStepLayout } from '../step-layout'

interface AccountStepProps {
  onAuthed: () => void
}

type Mode = 'choice' | 'login' | 'register'

export function AccountStep({ onAuthed }: AccountStepProps) {
  const { login, register, isLoading } = useCustomerAuth()
  const [mode, setMode] = useState<Mode>('choice')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')

  const handleLogin = async () => {
    try {
      await login(lastName.trim(), emailOrPhone.trim(), pin.trim())
      onAuthed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign in')
    }
  }

  const handleRegister = async () => {
    try {
      const isEmail = emailOrPhone.includes('@')
      await register({
        last_name: lastName.trim(),
        first_name: firstName.trim() || undefined,
        email: isEmail ? emailOrPhone.trim() : undefined,
        phone: !isEmail ? emailOrPhone.trim() : phone.trim() || undefined,
        pin: pin.trim(),
      })
      onAuthed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create account')
    }
  }

  if (mode === 'choice') {
    return (
      <CheckoutStepLayout cta={<StickyCta label="Create an account" showArrow={false} onClick={() => setMode('register')} secondary={{ label: 'I already have an account', onClick: () => setMode('login') }} />}>
        <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">
          Let's set up your order
        </h1>
        <p className="mb-6 font-brand text-sm leading-snug text-brand-umber">
          Sign in to use a saved address — or create an account.
        </p>
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="font-brand text-sm text-brand-ink">✓ Use your saved shipping addresses</p>
          <p className="font-brand text-sm text-brand-ink">✓ Track your order &amp; delivery</p>
          <p className="font-brand text-sm text-brand-ink">✓ One account to buy &amp; to sell (kaitori)</p>
        </div>
      </CheckoutStepLayout>
    )
  }

  const title = mode === 'login' ? 'Welcome back' : 'Create your account'
  const cta = mode === 'login' ? 'Sign in' : 'Create account'
  const canSubmit =
    lastName.trim() && emailOrPhone.trim() && pin.trim().length === 6
  const submit = mode === 'login' ? handleLogin : handleRegister

  return (
    <CheckoutStepLayout cta={<StickyCta label={cta} showArrow={false} onClick={submit} disabled={!canSubmit} loading={isLoading} secondary={{ label: mode === 'login' ? 'Create an account instead' : 'I already have an account', onClick: () => setMode(mode === 'login' ? 'register' : 'login') }} />}>
      <h1 className="mb-1 flex items-center gap-2 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">
        {mode === 'login' ? <LogIn className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />} {title}
      </h1>
      <p className="mb-5 font-brand text-sm text-brand-umber">Last name + email/phone + 6-digit PIN.</p>
      <div className="space-y-3">
        <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        {mode === 'register' && (
          <Input placeholder="First name (optional)" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        )}
        <Input placeholder="Email or phone" value={emailOrPhone} onChange={(e) => setEmailOrPhone(e.target.value)} />
        {mode === 'register' && !emailOrPhone.includes('@') ? null : mode === 'register' ? (
          <PhoneInput value={phone} onChange={setPhone} />
        ) : null}
        <Input
          placeholder="6-digit PIN"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </div>
    </CheckoutStepLayout>
  )
}
