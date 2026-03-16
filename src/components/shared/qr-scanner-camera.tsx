import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'

interface QRScannerCameraProps {
  onScan: (code: string) => void
  onError?: () => void
  /** Unique DOM id for the scanner container. Defaults to 'qr-reader'. */
  containerId?: string
}

export function QRScannerCamera({ onScan, onError, containerId = 'qr-reader' }: QRScannerCameraProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    let scanner: Html5Qrcode | null = null

    const start = async () => {
      try {
        scanner = new Html5Qrcode(containerId)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => onScan(decodedText),
          () => {},
        )
      } catch (err) {
        console.error('Camera error:', err)
        toast.error('Could not access camera. Try manual entry instead.')
        onError?.()
      }
    }

    start()

    return () => {
      if (scanner?.isScanning) {
        scanner.stop().catch(() => {})
      }
      scannerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId])

  return (
    <Card className="max-w-md">
      <CardContent className="p-4">
        <div id={containerId} className="w-full" />
        <p className="text-center text-sm text-muted-foreground mt-3">
          Point camera at a QR code
        </p>
      </CardContent>
    </Card>
  )
}
