import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Keyboard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, ManualCodeInput } from '@/components/shared'
import { QRScannerCamera } from '@/components/shared/media'
import * as itemsService from '@/services/items'
import * as accessoriesService from '@/services/accessories'

type Mode = 'camera' | 'manual'

export default function QRScannerPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('camera')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const processingRef = useRef(false)

  const lookupItem = useCallback(async (code: string) => {
    if (processingRef.current) return
    processingRef.current = true
    setIsLookingUp(true)

    const trimmed = code.trim().toUpperCase()

    try {
      if (trimmed.startsWith('A')) {
        const accessory = await accessoriesService.getAccessoryByCode(trimmed)
        navigate(`/admin/accessories/${accessory.id}`)
      } else {
        const item = await itemsService.getItemByCode(trimmed)
        navigate(`/admin/items/${item.id}`)
      }
    } catch {
      toast.error(`Not found: ${code}`)
      processingRef.current = false
      setIsLookingUp(false)
    }
  }, [navigate])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/dashboard')} aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title="Scan QR Code"
          description="Scan a P-code or A-code QR sticker, or enter the code manually."
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant={mode === 'camera' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('camera')}
        >
          <Camera className="h-4 w-4 mr-2" />
          Camera
        </Button>
        <Button
          variant={mode === 'manual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('manual')}
        >
          <Keyboard className="h-4 w-4 mr-2" />
          Manual Entry
        </Button>
      </div>

      {mode === 'camera' ? (
        <QRScannerCamera
          containerId="qr-scanner-reader"
          onScan={lookupItem}
          onError={() => setMode('manual')}
        />
      ) : (
        <ManualCodeInput
          onSubmit={lookupItem}
          isLoading={isLookingUp}
        />
      )}
    </div>
  )
}
