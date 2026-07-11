import { useState } from 'react'
import { toast } from 'sonner'
import { Upload, ArrowUp, ArrowDown, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useContentCategories } from '@/hooks/use-content-categories'
import { useCreateContentItem } from '@/hooks/use-content-items'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CarouselBuilderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CarouselBuilder({ open, onOpenChange }: CarouselBuilderProps) {
  const { data: categories = [] } = useContentCategories()
  const createItem = useCreateContentItem()

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [slides, setSlides] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function addImages(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `carousels/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('social-media').upload(path, file, { contentType: file.type })
        if (up.error) {
          toast.error(`Upload failed: ${up.error.message}`)
          continue
        }
        const { data: pub } = supabase.storage.from('social-media').getPublicUrl(path)
        setSlides((prev) => [...prev, pub.publicUrl])
      }
    } finally {
      setUploading(false)
    }
  }

  function move(i: number, dir: -1 | 1) {
    setSlides((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function remove(i: number) {
    setSlides((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!title.trim()) return toast.error('Give the carousel a title.')
    if (slides.length < 2) return toast.error('Add at least 2 slides.')
    setSaving(true)
    try {
      await createItem.mutateAsync({
        kind: 'carousel',
        title: title.trim(),
        media_urls: slides,
        category_id: categoryId || null,
        orientation: 'square',
        source: 'carousel',
      })
      toast.success('Carousel added to your Library')
      onOpenChange(false)
      setTitle(''); setSlides([]); setCategoryId('')
    } catch (e) {
      toast.error(`Couldn't save: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Build a carousel</DialogTitle>
          <DialogDescription>
            Ordered slides for a multi-image post. The first slide is the cover. The caption is written when you schedule it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend deals — 5 picks" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Slides ({slides.length})</Label>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Add images
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(e.target.files)} />
              </label>
            </div>
            {slides.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Add images to build the carousel.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {slides.map((url, i) => (
                  <div key={url} className="relative overflow-hidden rounded-md border">
                    <img src={url} alt="" className="aspect-square w-full object-cover" />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                        COVER
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-0.5">
                      <button type="button" onClick={() => move(i, -1)} className="text-white disabled:opacity-30" disabled={i === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} className="text-white disabled:opacity-30" disabled={i === slides.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => remove(i)} className="text-white">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save carousel'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
