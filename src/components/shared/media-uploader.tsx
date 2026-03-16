import { useState, useRef, useCallback } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface MediaUploaderProps {
  /** Supabase storage bucket name */
  bucket: string
  /** Path prefix within the bucket, e.g. "photo-group-media/{id}" */
  pathPrefix: string
  /** Called after each successful upload with the public URL */
  onUpload: (url: string, fileName: string) => void
  /** Accept filter, defaults to images */
  accept?: string
  /** Allow multiple files at once */
  multiple?: boolean
  /** Max file size in bytes (default 10MB) */
  maxSizeBytes?: number
  className?: string
}

interface UploadingFile {
  name: string
  progress: number
}

export function MediaUploader({
  bucket,
  pathPrefix,
  onUpload,
  accept = 'image/*',
  multiple = true,
  maxSizeBytes = 10 * 1024 * 1024,
  className,
}: MediaUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState<UploadingFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > maxSizeBytes) {
      toast.error(`${file.name} exceeds ${Math.round(maxSizeBytes / 1024 / 1024)}MB limit`)
      return
    }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const fileName = `${crypto.randomUUID()}.${ext}`
    const filePath = `${pathPrefix}/${fileName}`

    setUploading((prev) => [...prev, { name: file.name, progress: 50 }])

    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { contentType: file.type, upsert: false })

      if (error) throw error

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)

      setUploading((prev) => prev.map((u) => u.name === file.name ? { ...u, progress: 100 } : u))
      onUpload(urlData.publicUrl, fileName)
      toast.success(`Uploaded ${file.name}`)
    } catch (err) {
      toast.error(`Upload failed: ${file.name}`)
      console.error('Upload error:', err)
    } finally {
      setUploading((prev) => prev.filter((u) => u.name !== file.name))
    }
  }, [bucket, pathPrefix, maxSizeBytes, onUpload])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(uploadFile)
  }, [uploadFile])

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Drag & drop files here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Max {Math.round(maxSizeBytes / 1024 / 1024)}MB per file
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploading.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploading.map((file) => (
            <div key={file.name} className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="truncate flex-1">{file.name}</span>
              <span className="text-muted-foreground">{file.progress}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
