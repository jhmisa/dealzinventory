import { memo } from 'react'
import {
  Inbox,
  MessageSquare,
  Target,
  ShoppingCart,
  Package,
  AlertTriangle,
  Wrench,
  Folder,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { MessageFolder } from '@/lib/types'

const ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox,
  'message-square': MessageSquare,
  target: Target,
  'shopping-cart': ShoppingCart,
  package: Package,
  'alert-triangle': AlertTriangle,
  wrench: Wrench,
  folder: Folder,
}

interface FolderSidebarProps {
  folders: MessageFolder[]
  selectedFolderId: string | null
  onSelectFolder: (folderId: string) => void
  awaitingCounts: Record<string, number>
}

export const FolderSidebar = memo(function FolderSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  awaitingCounts,
}: FolderSidebarProps) {
  const systemFolders = folders.filter((f) => f.is_system)
  const pipelineFolders = folders.filter((f) => !f.is_system)

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r bg-muted/30">
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {systemFolders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              isSelected={folder.id === selectedFolderId}
              awaitingCount={awaitingCounts[folder.id] ?? 0}
              onSelect={onSelectFolder}
            />
          ))}

          {pipelineFolders.length > 0 && (
            <>
              <div className="px-2 pt-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pipeline
                </span>
              </div>
              {pipelineFolders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  isSelected={folder.id === selectedFolderId}
                  awaitingCount={awaitingCounts[folder.id] ?? 0}
                  onSelect={onSelectFolder}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
})

function FolderItem({
  folder,
  isSelected,
  awaitingCount,
  onSelect,
}: {
  folder: MessageFolder
  isSelected: boolean
  awaitingCount: number
  onSelect: (id: string) => void
}) {
  const Icon = ICON_MAP[folder.icon] ?? Folder

  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        isSelected ? 'bg-accent font-medium' : 'hover:bg-muted/80 text-muted-foreground',
      )}
      onClick={() => onSelect(folder.id)}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate flex-1 text-left">{folder.name}</span>
      {awaitingCount > 0 && (
        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] font-semibold">
          {awaitingCount}
        </Badge>
      )}
    </button>
  )
}
