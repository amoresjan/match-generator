import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, saveAdminToken } from '@/lib/api'

interface Props {
  sessionId: string
  onUnlocked: () => void
}

export function AdminCodeEntry({ sessionId, onUnlocked }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')

    try {
      await api.validateAdminToken(sessionId, trimmed)
      saveAdminToken(sessionId, trimmed)
      onUnlocked()
    } catch {
      setError('Invalid admin code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          placeholder="Enter admin code…"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError('') }}
          className="flex-1 font-mono text-sm"
        />
        <Button type="submit" size="sm" disabled={!code.trim() || loading}>
          {loading ? '…' : 'Unlock'}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
