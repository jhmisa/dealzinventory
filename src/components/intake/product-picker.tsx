import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Image as ImageIcon, Loader2, Plus } from 'lucide-react'
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
import { useProductModelSearch } from '@/hooks/use-product-models'
import type { ProductModelWithHeroImage } from '@/lib/types'
import type { ProductModelFormValues } from '@/validators/product-model'

interface ProductPickerProps {
  value: string
  onSelect: (productId: string) => void
  // Off-list rows to always keep available for display (selected row + auto-matched row +
  // a small default/recent set shown when the search box is empty). NOT the whole table.
  products: ProductModelWithHeroImage[]
  initialSearch?: string
  categoryId?: string
  onCreate?: (values: ProductModelFormValues) => Promise<string>
  invoiceDescription?: string
}

export function ProductPicker({
  value,
  onSelect,
  products,
  initialSearch,
  categoryId,
  onCreate,
  invoiceDescription,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)

  // Debounce the typed term ~250ms before hitting the server.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const { data: serverResults, isFetching } = useProductModelSearch(debounced, categoryId)

  // Selected/auto-matched row comes from the passed `products` (off-list safe).
  const selected = value ? products.find((p) => p.id === value) : null

  // What the list renders: server results while searching, else the passed default set.
  // Always include the selected row so it stays visible/checkable even if absent from results.
  const rows = useMemo(() => {
    const base = debounced.length > 0 ? (serverResults ?? []) : products
    if (selected && !base.some((p) => p.id === selected.id)) {
      return [selected, ...base]
    }
    return base
  }, [debounced, serverResults, products, selected])

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
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search products..."
            className="h-8 text-xs"
          />
          <CommandList className="max-h-[350px]">
            {isFetching && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}
            <CommandEmpty>
              <div className="py-2 text-center">
                <p className="text-sm text-muted-foreground">
                  {debounced.length === 0 ? 'Type to search products.' : 'No products found.'}
                </p>
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
              {rows.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
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
                      <div className="text-xs font-medium">
                        {product.brand} {product.model_name}
                      </div>
                      {(product.model_number || product.part_number) && (
                        <div className="text-[11px] font-mono text-muted-foreground/80">
                          {[
                            product.model_number,
                            product.part_number ? `(${product.part_number})` : null,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {product.short_description || product.color}
                      </div>
                      {(() => {
                        const specs = [
                          product.cpu,
                          product.ram_gb ? `${product.ram_gb}GB` : null,
                          product.storage_gb ? `${product.storage_gb}GB` : null,
                          product.screen_size ? `${product.screen_size}"` : null,
                          product.short_description ? product.color : null,
                        ].filter(Boolean)
                        return specs.length > 0 ? (
                          <div className="text-[11px] text-muted-foreground/70">
                            {specs.join(' · ')}
                          </div>
                        ) : null
                      })()}
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
