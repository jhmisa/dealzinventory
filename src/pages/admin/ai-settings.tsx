import { useState } from 'react'
import { Plus, Pencil, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared'
import { ConfirmDialog } from '@/components/shared'
import { AiConfigFormDialog, AiConfigTest, AiPromptList } from '@/components/settings'
import {
  useAiConfigurations,
  useDeleteAiConfiguration,
  useSetActiveAiConfiguration,
} from '@/hooks/use-ai-configurations'
import { formatDateTime } from '@/lib/utils'
import type { AiConfiguration } from '@/lib/types'

export default function AiSettingsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editConfig, setEditConfig] = useState<AiConfiguration | null>(null)
  const [deleteConfig, setDeleteConfig] = useState<AiConfiguration | null>(null)
  const [testConfig, setTestConfig] = useState<AiConfiguration | null>(null)

  const { data: configs, isLoading } = useAiConfigurations()
  const deleteMutation = useDeleteAiConfiguration()
  const setActiveMutation = useSetActiveAiConfiguration()

  function handleEdit(config: AiConfiguration) {
    setEditConfig(config)
    setFormOpen(true)
  }

  function handleDelete() {
    if (!deleteConfig) return
    deleteMutation.mutate(deleteConfig.id, {
      onSuccess: () => {
        toast.success('Configuration deleted')
        setDeleteConfig(null)
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  function handleSetActive(config: AiConfiguration) {
    if (!config.last_test_at) {
      toast.error('Test the configuration first before setting it active')
      return
    }
    setActiveMutation.mutate(config.id, {
      onSuccess: () => toast.success(`${config.service_name} is now active`),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="AI Configuration" description="Configure AI services for invoice parsing." />
        <Button onClick={() => { setEditConfig(null); setFormOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add AI Service
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : !configs?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No AI services configured. Add one to enable invoice parsing.
            </p>
            <Button onClick={() => { setEditConfig(null); setFormOpen(true) }}>
              <Plus className="h-4 w-4 mr-2" />
              Add AI Service
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => (
            <Card key={config.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{config.service_name}</CardTitle>
                    {config.is_active && (
                      <Badge className="bg-green-100 text-green-800 border-green-300">Active</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!config.is_active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetActive(config)}
                        disabled={setActiveMutation.isPending}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Set Active
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setTestConfig(testConfig?.id === config.id ? null : config)}>
                      Test
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(config)} aria-label="Edit configuration">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfig(config)} aria-label="Delete configuration">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Endpoint: </span>
                    <span className="font-mono text-xs break-all">{config.api_endpoint_url}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Tested: </span>
                    <span>{config.last_test_at ? formatDateTime(config.last_test_at) : 'Never'}</span>
                  </div>
                </div>

                {testConfig?.id === config.id && (
                  <AiConfigTest config={config} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AiConfigFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditConfig(null)
        }}
        editConfig={editConfig}
      />

      <div className="border-t pt-6">
        <AiPromptList />
      </div>

      <ConfirmDialog
        open={!!deleteConfig}
        onOpenChange={(open) => !open && setDeleteConfig(null)}
        title="Delete AI Configuration"
        description={`Are you sure you want to delete "${deleteConfig?.service_name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
