import { Card, CardContent } from '@/components/ui/card'
import { CodeDisplay } from '@/components/shared'
import type { Item, ProductModel } from '@/lib/types'

interface ItemHeaderCardProps {
  item: Item
  productModel: ProductModel | null
  supplierName: string | null
}

export function ItemHeaderCard({ item, productModel, supplierName }: ItemHeaderCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">P-Code:</span>{' '}
            <CodeDisplay code={item.item_code} />
          </div>
          <div>
            <span className="text-muted-foreground">Model:</span>{' '}
            {productModel ? `${productModel.brand} ${productModel.model_name}` : '—'}
          </div>
          <div>
            <span className="text-muted-foreground">Color:</span>{' '}
            {item.color ?? productModel?.color ?? '—'}
          </div>
          <div>
            <span className="text-muted-foreground">Supplier:</span>{' '}
            {supplierName ?? '—'}
          </div>
          {item.device_category && (
            <div>
              <span className="text-muted-foreground">Category:</span>{' '}
              {item.device_category}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
