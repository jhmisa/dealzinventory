import { useMemo, useRef, useState } from 'react'
import { Film, Trash2, Upload, Settings2, Loader2, Music2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useVideoAssets, useCreateVideoAsset, useDeleteVideoAsset } from '@/hooks/use-video-assets'
import type { VideoAsset, VideoAssetKind } from '@/services/video-assets'

export interface ClipSelection {
  enabled: boolean
  id: string | null
}

export interface MusicSelection extends ClipSelection {
  /** Fixed background-music level, 0–100 (mixed under the seller's voice). */
  volume: number
}

interface Props {
  intro: ClipSelection
  outro: ClipSelection
  music: MusicSelection
  onIntroChange: (v: ClipSelection) => void
  onOutroChange: (v: ClipSelection) => void
  onMusicChange: (v: MusicSelection) => void
  disabled?: boolean
}

export function IntroOutroControls({
  intro, outro, music, onIntroChange, onOutroChange, onMusicChange, disabled,
}: Props) {
  const [managerOpen, setManagerOpen] = useState(false)
  const { data: assets = [] } = useVideoAssets()
  const introAssets = useMemo(() => assets.filter((a) => a.kind === 'intro'), [assets])
  const outroAssets = useMemo(() => assets.filter((a) => a.kind === 'outro'), [assets])
  const musicAssets = useMemo(() => assets.filter((a) => a.kind === 'music'), [assets])

  function row(
    label: string,
    sel: ClipSelection,
    list: VideoAsset[],
    onChange: (v: ClipSelection) => void,
  ) {
    // Default the dropdown to the newest clip when enabling with nothing chosen.
    const selectedId = sel.id ?? list[0]?.id ?? null
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={sel.enabled && list.length > 0}
          disabled={disabled || list.length === 0}
          onCheckedChange={(on) => onChange({ enabled: on, id: on ? selectedId : sel.id })}
        />
        <span className="w-12 shrink-0 text-xs font-medium">{label}</span>
        {list.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">No {label.toLowerCase()} clips — add one →</span>
        ) : (
          <Select
            value={selectedId ?? undefined}
            onValueChange={(id) => onChange({ enabled: sel.enabled, id })}
            disabled={disabled || !sel.enabled}
          >
            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Choose a clip" /></SelectTrigger>
            <SelectContent>
              {list.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    )
  }

  const musicSelectedId = music.id ?? musicAssets[0]?.id ?? null
  const musicOn = music.enabled && musicAssets.length > 0

  return (
    <div className="w-full space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Intro, Outro &amp; Music</span>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setManagerOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" />
          Manage clips
        </Button>
      </div>
      {row('Intro', intro, introAssets, onIntroChange)}
      {row('Outro', outro, outroAssets, onOutroChange)}

      {/* Music bed: on/off + track picker, then a fixed low-volume slider under the voice. */}
      <div className="flex items-center gap-2">
        <Switch
          checked={musicOn}
          disabled={disabled || musicAssets.length === 0}
          onCheckedChange={(on) =>
            onMusicChange({ ...music, enabled: on, id: on ? musicSelectedId : music.id })
          }
        />
        <span className="w-12 shrink-0 text-xs font-medium">Music</span>
        {musicAssets.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">No music tracks — add one →</span>
        ) : (
          <Select
            value={musicSelectedId ?? undefined}
            onValueChange={(id) => onMusicChange({ ...music, id })}
            disabled={disabled || !music.enabled}
          >
            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Choose a track" /></SelectTrigger>
            <SelectContent>
              {musicAssets.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {musicOn && (
        <div className="flex items-center gap-2 pl-[3.75rem]">
          <Music2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={music.volume}
            disabled={disabled}
            onChange={(e) => onMusicChange({ ...music, volume: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer accent-foreground"
            aria-label="Music volume"
          />
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{music.volume}%</span>
        </div>
      )}

      <VideoAssetManager open={managerOpen} onOpenChange={setManagerOpen} assets={assets} />
    </div>
  )
}

function VideoAssetManager({
  open, onOpenChange, assets,
}: { open: boolean; onOpenChange: (o: boolean) => void; assets: VideoAsset[] }) {
  const create = useCreateVideoAsset()
  const remove = useDeleteVideoAsset()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<VideoAssetKind>('intro')
  const [file, setFile] = useState<File | null>(null)

  const isMusic = kind === 'music'

  function submit() {
    if (!file) { toast.error(isMusic ? 'Choose an audio file.' : 'Choose a video file.'); return }
    const finalName = name.trim() || file.name.replace(/\.[^.]+$/, '')
    create.mutate(
      { name: finalName, kind, file },
      {
        onSuccess: () => {
          toast.success(isMusic ? 'Track added' : 'Clip added')
          setName(''); setFile(null)
          if (fileRef.current) fileRef.current.value = ''
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Upload failed'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Intro, outro &amp; music</DialogTitle>
        </DialogHeader>

        {/* Upload */}
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isMusic ? 'e.g. Upbeat bed' : 'e.g. Dealz intro'} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={kind} onValueChange={(v) => { setKind(v as VideoAssetKind); setFile(null); if (fileRef.current) fileRef.current.value = '' }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="intro">Intro</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                  <SelectItem value="music">Music</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={isMusic ? 'audio/*' : 'video/*'}
            className="block w-full text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-muted file:px-2 file:py-1 file:text-xs"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {isMusic && (
            <p className="text-[11px] text-amber-500">Use royalty-free music only — Facebook may mute or block posts with copyrighted audio.</p>
          )}
          <Button size="sm" className="w-full gap-1.5" disabled={create.isPending || !file} onClick={submit}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isMusic ? 'Add track' : 'Add clip'}
          </Button>
        </div>

        {/* Library */}
        <div className="space-y-2">
          {assets.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No clips yet.</p>
          ) : (
            assets.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                {a.kind === 'music' ? (
                  <audio src={a.file_url} className="h-10 w-24 shrink-0" preload="metadata" controls />
                ) : (
                  <video src={a.file_url} className="h-14 w-24 shrink-0 rounded bg-black object-contain" muted preload="metadata" controls />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.kind}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: a.id, file_url: a.file_url })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          {assets.length === 0 && <Film className="mx-auto h-6 w-6 text-muted-foreground" />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
