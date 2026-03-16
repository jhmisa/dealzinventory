import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { PageHeader, ConfirmDialog, TableSkeleton } from '@/components/shared'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/use-categories'
import { categorySchema, type CategoryFormValues } from '@/validators/category'
import { AVAILABLE_SPEC_FIELDS, ALWAYS_DESCRIPTION_FIELDS, getSpecFieldLabel } from '@/lib/constants'
import type { Category } from '@/lib/types'

function CategoryForm({
  category,
  loading,
  onSubmit,
  onCancel,
}: {
  category?: Category | null
  loading?: boolean
  onSubmit: (values: CategoryFormValues) => void
  onCancel: () => void
}) {
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      slug: category?.slug ?? '',
      form_fields: category?.form_fields ?? [],
      description_fields: category?.description_fields ?? [],
      sort_order: category?.sort_order ?? 0,
    },
  })

  const formFields = form.watch('form_fields')
  const descriptionFields = form.watch('description_fields')

  // Auto-generate slug from name
  function handleNameChange(name: string) {
    form.setValue('name', name)
    if (!category) {
      form.setValue('slug', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  // Description field candidates = always-available fields + whatever is in form_fields
  const descriptionCandidates = [
    ...ALWAYS_DESCRIPTION_FIELDS,
    ...formFields.filter(f => !ALWAYS_DESCRIPTION_FIELDS.includes(f)),
  ]
  // Remove duplicates
  const uniqueDescCandidates = [...new Set(descriptionCandidates)]

  function toggleFormField(key: string, checked: boolean) {
    const current = form.getValues('form_fields')
    if (checked) {
      form.setValue('form_fields', [...current, key])
    } else {
      form.setValue('form_fields', current.filter(f => f !== key))
      // Also remove from description_fields if it was there and not an always-available field
      if (!ALWAYS_DESCRIPTION_FIELDS.includes(key)) {
        const descCurrent = form.getValues('description_fields')
        form.setValue('description_fields', descCurrent.filter(f => f !== key))
      }
    }
  }

  function toggleDescriptionField(key: string, checked: boolean) {
    const current = form.getValues('description_fields')
    if (checked) {
      form.setValue('description_fields', [...current, key])
    } else {
      form.setValue('description_fields', current.filter(f => f !== key))
    }
  }

  function moveDescField(key: string, direction: 'up' | 'down') {
    const current = [...form.getValues('description_fields')]
    const idx = current.indexOf(key)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= current.length) return
    ;[current[idx], current[newIdx]] = [current[newIdx], current[idx]]
    form.setValue('description_fields', current)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Computer, iPhone, etc."
                    {...field}
                    onChange={(e) => handleNameChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Slug</FormLabel>
                <FormControl>
                  <Input placeholder="computer" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="sort_order"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sort Order</FormLabel>
              <FormControl>
                <Input type="number" className="w-24" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Form Fields */}
        <div>
          <FormLabel className="text-sm font-medium">Form Fields</FormLabel>
          <p className="text-xs text-muted-foreground mb-2">
            Select which spec fields appear when creating products in this category.
            Brand, Model Name, Color, and Notes always show.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AVAILABLE_SPEC_FIELDS
              .filter(f => !['brand', 'model_name', 'color'].includes(f.key))
              .map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={formFields.includes(field.key)}
                    onCheckedChange={(checked) => toggleFormField(field.key, !!checked)}
                  />
                  {field.label}
                </label>
              ))}
          </div>
        </div>

        {/* Description Fields */}
        <div>
          <FormLabel className="text-sm font-medium">Short Description Fields</FormLabel>
          <p className="text-xs text-muted-foreground mb-2">
            Select and order the fields that make up the auto-generated short description
            (e.g., &quot;Apple MacBook Air M2 16GB 512GB Silver&quot;).
          </p>
          <div className="space-y-1">
            {/* Currently selected description fields in order */}
            {descriptionFields.length > 0 && (
              <div className="space-y-1 mb-3 rounded-md border p-2 bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground">Current order:</span>
                {descriptionFields.map((key, idx) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <span className="flex-1">{getSpecFieldLabel(key)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1"
                      disabled={idx === 0}
                      onClick={() => moveDescField(key, 'up')}
                    >
                      &uarr;
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1"
                      disabled={idx === descriptionFields.length - 1}
                      onClick={() => moveDescField(key, 'down')}
                    >
                      &darr;
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {uniqueDescCandidates.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={descriptionFields.includes(key)}
                    onCheckedChange={(checked) => toggleDescriptionField(key, !!checked)}
                  />
                  {getSpecFieldLabel(key)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : category ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Form>
  )
}

export default function CategoriesPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

  const { data: categories, isLoading } = useCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const deleteMutation = useDeleteCategory()

  function handleCreate(values: CategoryFormValues) {
    createMutation.mutate(values, {
      onSuccess: () => {
        toast.success('Category created')
        setFormOpen(false)
      },
      onError: (err) => toast.error(`Failed to create: ${err.message}`),
    })
  }

  function handleUpdate(values: CategoryFormValues) {
    if (!editing) return
    updateMutation.mutate(
      { id: editing.id, updates: values },
      {
        onSuccess: () => {
          toast.success('Category updated')
          setEditing(null)
        },
        onError: (err) => toast.error(`Failed to update: ${err.message}`),
      },
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Category deleted')
        setDeleteTarget(null)
      },
      onError: (err) => toast.error(`Cannot delete: ${err.message}`),
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categories"
        description="Product categories control which spec fields appear in the product form and short description."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(categories ?? []).map((cat) => (
            <Card key={cat.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{cat.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(cat)} aria-label="Edit category">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(cat)} aria-label="Delete category">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Slug:</span>{' '}
                  <code className="text-xs bg-muted px-1 rounded">{cat.slug}</code>
                  <span className="text-muted-foreground text-xs ml-3">Order:</span>{' '}
                  <span className="text-xs">{cat.sort_order}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block mb-1">Form Fields:</span>
                  <div className="flex flex-wrap gap-1">
                    {cat.form_fields.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">None (brand/model/color only)</span>
                    ) : (
                      cat.form_fields.map((f) => (
                        <Badge key={f} variant="secondary" className="text-xs">{getSpecFieldLabel(f)}</Badge>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block mb-1">Description Fields:</span>
                  <div className="flex flex-wrap gap-1">
                    {cat.description_fields.map((f, i) => (
                      <Badge key={f} variant="outline" className="text-xs">
                        {i + 1}. {getSpecFieldLabel(f)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <CategoryForm
            loading={createMutation.isPending}
            onSubmit={handleCreate}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editing && (
            <CategoryForm
              category={editing}
              loading={updateMutation.isPending}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Category"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Products using this category will need to be reassigned.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
