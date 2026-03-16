import { Card, CardContent } from '@/components/ui/card'

interface SupplierDescriptionBannerProps {
  description: string | null
}

export function SupplierDescriptionBanner({ description }: SupplierDescriptionBannerProps) {
  if (!description) return null

  return (
    <Card className="bg-amber-50 border-amber-200">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-amber-700 mb-1">Supplier Description</p>
        <p className="text-sm text-amber-900 whitespace-pre-wrap">{description}</p>
      </CardContent>
    </Card>
  )
}
