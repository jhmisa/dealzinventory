import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { useUploadTicketMedia } from '@/hooks/use-tickets'
import { toast } from 'sonner'
import type { TicketMedia } from '@/services/tickets'

interface TicketMediaSectionProps {
  ticketId: string
  media: TicketMedia[]
}

export function TicketMediaSection({ ticketId, media }: TicketMediaSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useUploadTicketMedia()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    upload.mutate(
      { ticketId, file },
      {
        onSuccess: () => toast.success('Media uploaded'),
        onError: (err) => toast.error(`Upload failed: ${err.message}`),
      },
    )

    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Media</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
        >
          <Upload className="h-3 w-3 mr-1" />
          {upload.isPending ? 'Uploading...' : 'Upload'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {media.length === 0 ? (
        <p className="text-sm text-muted-foreground">No media attached.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {media.map((m) => (
            <a
              key={m.id}
              href={m.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-square overflow-hidden rounded-md border hover:opacity-80 transition-opacity"
            >
              {m.media_type === 'video' ? (
                <video src={m.file_url} className="h-full w-full object-cover" />
              ) : (
                <img src={m.file_url} alt="" className="h-full w-full object-cover" />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
