import { useState } from 'react'
import { Check, ChevronsUpDown, Image as ImageIcon, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ProductForm } from '@/components/items/product-form'
import type { ProductModelWithHeroImage } from '@/lib/types'
import type { ProductModelFormValues } from '@/validators/product-model'

interface ProductPickerProps {
  value: string
  onSelect: (productId: string) => void
  products: ProductModelWithHeroImage[]
  initialSearch?: string
  onCreate?: (values: ProductModelFormValues) => Promise<string>
  invoiceDescription?: string
}

export function ProductPicker({ value, onSelect, products, initialSearch, onCreate, invoiceDescription }: ProductPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  const selected = value ? products.find((p) => p.id === value) : null

  async function handleProductCreate(values: ProductModelFormValues) {
    if (!onCreate) return
    setCreateLoading(true)
    try {
      const newProductId = await onCreate(values)
      setCreateDialogOpen(false)
      onSelect(newProductId)
    } catch {
      // Error handling done by parent via toast
    } finally {
      setCreateLoading(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && initialSearch && !value) {
      setSearch(initialSearch)
    }
    if (!nextOpen) setSearch('')
    setOpen(nextOpen)
  }

  return (
    <>
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between text-xs font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-1.5 truncate">
              {selected.hero_image_url ? (
                <img
                  src={selected.hero_image_url}
                  alt=""
                  className="h-5 w-5 rounded object-cover shrink-0"
                />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">
                {selected.brand} {selected.model_name}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select product...</span>
          )}
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search products..." className="h-8 text-xs" />
          <CommandList className="max-h-[250px]">
            <CommandEmpty>
              <div className="py-2 text-center">
                <p className="text-sm text-muted-foreground">No products found.</p>
                {onCreate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setOpen(false)
                      setCreateDialogOpen(true)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create Product
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onSelect('')
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-3.5 w-3.5',
                    !value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="text-muted-foreground">None</span>
              </CommandItem>
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${product.brand} ${product.model_name} ${product.short_description ?? ''} ${product.color}`}
                  onSelect={() => {
                    onSelect(product.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-3.5 w-3.5 shrink-0',
                      value === product.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex items-center gap-2 min-w-0">
                    {product.hero_image_url ? (
                      <img
                        src={product.hero_image_url}
                        alt=""
                        className="h-8 w-8 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">
                        {product.brand} {product.model_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {product.short_description || product.color}
                      </div>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>

    {onCreate && (
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Product</DialogTitle>
          </DialogHeader>
          {invoiceDescription && (
            <div className="rounded-md border bg-muted/50 px-3 py-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Invoice Description</p>
              <p className="text-sm select-all">{invoiceDescription}</p>
            </div>
          )}
          <ProductForm
            loading={createLoading}
            onSubmit={handleProductCreate}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    )}
    </>
  )
}
