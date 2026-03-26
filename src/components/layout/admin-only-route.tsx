import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/admin/dashboard" replace />
  }

  return <>{children}</>
}
