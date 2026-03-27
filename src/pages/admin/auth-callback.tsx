import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const { isPasswordRecovery, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    if (isPasswordRecovery) {
      navigate('/admin/set-password', { replace: true })
      return
    }

    // If no recovery event detected after auth settles, redirect to login
    const timeout = setTimeout(() => {
      navigate('/admin/login', { replace: true })
    }, 3000)

    return () => clearTimeout(timeout)
  }, [loading, isPasswordRecovery, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Processing...</p>
      </div>
    </div>
  )
}
