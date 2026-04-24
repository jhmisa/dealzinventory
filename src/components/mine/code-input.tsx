import { useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PREFIXES = [
  { value: 'P', label: 'P — Item' },
  { value: 'G', label: 'G — Group' },
  { value: 'A', label: 'A — Accessory' },
] as const

interface CodeInputProps {
  value?: string
  onChange: (code: string) => void
}

export function CodeInput({ value, onChange }: CodeInputProps) {
  const parsed = value?.match(/^([PGA])(\d{0,6})$/i)
  const prefix = parsed ? parsed[1].toUpperCase() : 'P'
  const digits = parsed ? parsed[2].padEnd(6, '') : ''

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const emitChange = useCallback((newPrefix: string, newDigits: string) => {
    if (newDigits.replace(/ /g, '').length === 6) {
      onChange(`${newPrefix}${newDigits}`)
    }
  }, [onChange])

  const handlePrefixChange = useCallback((newPrefix: string) => {
    const cleanDigits = digits.replace(/ /g, '')
    if (cleanDigits.length === 6) {
      onChange(`${newPrefix}${cleanDigits}`)
    }
    // Focus first digit input
    inputRefs.current[0]?.focus()
  }, [digits, onChange])

  const handleDigitChange = useCallback((index: number, val: string) => {
    // Handle paste of full code
    if (val.length > 1) {
      const fullMatch = val.match(/^([PGA])(\d{6})$/i)
      if (fullMatch) {
        onChange(`${fullMatch[1].toUpperCase()}${fullMatch[2]}`)
        inputRefs.current[5]?.focus()
        return
      }
      // Paste of digits only
      const digitsOnly = val.replace(/\D/g, '').slice(0, 6 - index)
      if (digitsOnly.length > 0) {
        const arr = digits.split('')
        for (let i = 0; i < digitsOnly.length; i++) {
          arr[index + i] = digitsOnly[i]
        }
        const newDigits = arr.join('')
        emitChange(prefix, newDigits)
        const nextIdx = Math.min(index + digitsOnly.length, 5)
        inputRefs.current[nextIdx]?.focus()
        return
      }
    }

    if (!/^\d$/.test(val)) return

    const arr = digits.split('')
    arr[index] = val
    const newDigits = arr.join('')
    emitChange(prefix, newDigits)

    if (index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }, [digits, prefix, onChange, emitChange])

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const arr = digits.split('')
      if (arr[index] && arr[index] !== ' ') {
        arr[index] = ' '
      } else if (index > 0) {
        arr[index - 1] = ' '
        inputRefs.current[index - 1]?.focus()
      }
      // Don't emit full code on backspace
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }, [digits])

  return (
    <div className="flex items-center gap-3">
      <Select value={prefix} onValueChange={handlePrefixChange}>
        <SelectTrigger className="w-[140px] h-14 text-lg font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PREFIXES.map(p => (
            <SelectItem key={p.value} value={p.value} className="font-mono">
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Input
            key={i}
            ref={el => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            className="w-12 h-14 text-center text-xl font-mono p-0"
            value={digits[i] === ' ' ? '' : (digits[i] ?? '')}
            onChange={e => handleDigitChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onFocus={e => e.target.select()}
            onPaste={e => {
              e.preventDefault()
              handleDigitChange(i, e.clipboardData.getData('text'))
            }}
          />
        ))}
      </div>
    </div>
  )
}
