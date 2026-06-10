import { useCallback, useMemo, useState } from 'react'
import type { CheckoutData, CheckoutStep } from './types'
import { INITIAL_CHECKOUT_DATA, NUMBERED_STEPS } from './types'

interface UseCheckoutFlow {
  step: CheckoutStep
  data: CheckoutData
  /** 1-based index for the progress bar (0 on the 'item' landing). */
  stepNumber: number
  totalSteps: number
  setData: (patch: Partial<CheckoutData>) => void
  goTo: (step: CheckoutStep) => void
  /** Advance to the next step in the canonical order, skipping 'account' when authed. */
  next: () => void
  back: () => void
}

const ORDER: CheckoutStep[] = ['item', 'account', 'address', 'schedule', 'payment', 'review', 'confirmed']

export function useCheckoutFlow(isAuthenticated: boolean): UseCheckoutFlow {
  const [step, setStep] = useState<CheckoutStep>('item')
  const [data, setRawData] = useState<CheckoutData>(INITIAL_CHECKOUT_DATA)
  const [, setHistory] = useState<CheckoutStep[]>([])

  const setData = useCallback((patch: Partial<CheckoutData>) => {
    setRawData((prev) => ({ ...prev, ...patch }))
  }, [])

  // Note: setters are called independently (never nested inside another updater) so
  // React StrictMode's double-invocation of updaters can't double-push the history.
  const goTo = useCallback((target: CheckoutStep) => {
    setHistory((h) => [...h, step])
    setStep(target)
  }, [step])

  const next = useCallback(() => {
    const idx = ORDER.indexOf(step)
    let nextStep = ORDER[Math.min(idx + 1, ORDER.length - 1)]
    // Logged-in users skip the Account step entirely.
    if (nextStep === 'account' && isAuthenticated) nextStep = 'address'
    setHistory((h) => [...h, step])
    setStep(nextStep)
  }, [step, isAuthenticated])

  const back = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setStep(prev)
      return h.slice(0, -1)
    })
  }, [])

  const stepNumber = useMemo(() => {
    const i = NUMBERED_STEPS.indexOf(step)
    return i === -1 ? 0 : i + 1
  }, [step])

  return { step, data, stepNumber, totalSteps: NUMBERED_STEPS.length, setData, goTo, next, back }
}
