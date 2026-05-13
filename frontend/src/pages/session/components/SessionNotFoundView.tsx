import { useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SessionNotFoundView() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-5xl leading-none select-none">🎾</p>
      <div className="space-y-1.5">
        <p className="font-bold text-lg leading-snug">Session not found</p>
        <p className="text-sm text-muted-foreground max-w-xs">This link may be invalid or the session has expired.</p>
      </div>
      <Button variant="outline" onClick={() => navigate('/')}>
        <Home className="h-4 w-4 mr-2" />
        Back to home
      </Button>
    </div>
  )
}
