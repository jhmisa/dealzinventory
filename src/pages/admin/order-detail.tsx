import { useParams, useNavigate } from 'react-router-dom'
import { OrderDetailContent } from '@/components/orders/order-detail-content'

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  return <OrderDetailContent orderId={id!} onNavigate={navigate} />
}
