import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, saveAdminToken } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ThemeToggle } from '@/components/ThemeToggle'

export function HomePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [matchType, setMatchType] = useState<'1v1' | '2v2'>('2v2')
  const [numCourts, setNumCourts] = useState(1)
  const [joinId, setJoinId] = useState('')

  const create = useMutation({
    mutationFn: () => api.createSession({ name, match_type: matchType, num_courts: numCourts }),
    onSuccess: (data) => {
      saveAdminToken(data.id, data.admin_token)
      navigate(`/session/${data.id}`)
    },
  })

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const id = joinId.trim()
    if (id) navigate(`/session/${id}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-green-950/30 dark:to-background flex flex-col items-center justify-center p-4 gap-6 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="text-center">
        <h1 className="text-3xl font-bold text-green-700 dark:text-green-400">Pickleball</h1>
        <p className="text-muted-foreground">Match Generator</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Create a Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Session name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Match type</label>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as '1v1' | '2v2')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2v2">2v2</SelectItem>
                  <SelectItem value="1v1">1v1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Courts</label>
              <Input
                type="number"
                min={1}
                max={8}
                value={numCourts}
                onChange={(e) => setNumCourts(Number(e.target.value))}
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create Session'}
          </Button>
        </CardContent>
      </Card>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Join a Session</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoin} className="flex gap-2">
            <Input
              placeholder="Session ID or link…"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="outline" disabled={!joinId.trim()}>
              Join
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
