import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ManualCodeInputProps {
  onSubmit: (code: string) => void
  placeholder?: string
  title?: string
  submitLabel?: string
  isLoading?: boolean
}

export function ManualCodeInput({
  onSubmit,
  placeholder = 'e.g. P000417',
  title = 'Enter P-Code',
  submitLabel = 'Go',
  isLoading = false,
}: ManualCodeInputProps) {
  const [code, setCode] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    onSubmit(code.trim())
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono"
            autoFocus
          />
          <Button type="submit" disabled={isLoading || !code.trim()}>
            {isLoading ? 'Looking up...' : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
