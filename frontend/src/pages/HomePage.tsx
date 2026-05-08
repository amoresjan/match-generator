import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, saveAdminToken } from '@/lib/api'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SPORTS, type SportType } from '@/lib/sports'

export function HomePage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [sport, setSport] = useState<SportType>('pickleball')
  const [matchType, setMatchType] = useState<'1v1' | '2v2'>('2v2')
  const [numCourts, setNumCourts] = useState('1')
  const [mode, setMode] = useState<'fair' | 'competitive'>('fair')
  const [joinId, setJoinId] = useState('')

  const create = useMutation({
    mutationFn: () => api.createSession({ name, sport_type: sport, match_type: matchType, num_courts: Math.max(1, Math.min(8, parseInt(numCourts) || 1)), generation_mode: mode }),
    onSuccess: (data) => {
      saveAdminToken(data.id, data.admin_token)
      navigate(`/session/${data.id}`)
    },
  })

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const raw = joinId.trim()
    if (!raw) return
    const match = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    const id = match ? match[0] : raw
    navigate(`/session/${id}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-green-950/30 dark:to-background flex flex-col items-center justify-center p-4 pb-24 gap-6 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="text-center space-y-1">
        <h1 className="text-3xl font-bold text-green-700 dark:text-green-400">Rally</h1>
        <p className="text-muted-foreground text-sm">Match generator for groups</p>
      </div>

      <Card className="w-full max-w-sm overflow-hidden">
        <CardContent className="pt-3">
          <Tabs defaultValue="create" onValueChange={(v) => setTab(v as 'create' | 'join')}>
            <TabsList className="w-full">
              <TabsTrigger value="create" className="flex-1">Create</TabsTrigger>
              <TabsTrigger value="join" className="flex-1">Join</TabsTrigger>
            </TabsList>

            {/* Sliding panels — both stay in the DOM so card height never changes */}
            <div className="overflow-hidden mt-2 -mx-1 px-1">
              <div
                className="flex transition-transform duration-300 ease-in-out will-change-transform"
                style={{ width: '200%', transform: tab === 'join' ? 'translateX(-50%)' : 'translateX(0)' }}
              >
                {/* Create panel */}
                <div className="w-1/2 min-w-0 space-y-3 py-3 px-1">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Sport</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {SPORTS.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setSport(s.value)}
                          className={`flex flex-col items-center gap-0.5 rounded-lg border p-2 text-xs transition-colors ${
                            sport === s.value
                              ? 'border-primary bg-primary/10 text-primary font-medium'
                              : 'border-border hover:border-muted-foreground/40'
                          }`}
                        >
                          <span className="text-base leading-none">{s.emoji}</span>
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="session-name" className="text-xs text-muted-foreground mb-1 block">Session name</label>
                    <Input id="session-name" placeholder="e.g. Friday Pickles" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
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
                        type="text"
                        inputMode="numeric"
                        value={numCourts}
                        onChange={(e) => setNumCourts(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
                    <Select value={mode} onValueChange={(v) => setMode(v as 'fair' | 'competitive')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fair">Fair Rotation</SelectItem>
                        <SelectItem value="competitive">Competitive</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {mode === 'competitive'
                        ? 'Players are matched by win count — top players face each other, bottom players face each other.'
                        : 'Everyone gets equal court time and varied opponents. Best for casual play.'}
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => create.mutate()}
                    disabled={!name.trim() || create.isPending}
                  >
                    {create.isPending ? 'Creating…' : 'Create Session'}
                  </Button>
                </div>

                {/* Join panel */}
                <div className="w-1/2 min-w-0 px-3 py-3 flex flex-col justify-center gap-5">
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="rounded-full bg-green-100 dark:bg-green-900/40 p-3">
                      <Users className="w-6 h-6 text-green-700 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Join a session</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Paste the link or ID your host shared with you.</p>
                    </div>
                  </div>
                  <form onSubmit={handleJoin} className="flex flex-col gap-2">
                    <label htmlFor="join-id" className="sr-only">Session ID or link</label>
                    <Input
                      id="join-id"
                      placeholder="Session ID or link…"
                      value={joinId}
                      onChange={(e) => setJoinId(e.target.value)}
                    />
                    <Button type="submit" className="w-full" disabled={!joinId.trim()}>
                      Join Session
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </Tabs>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground/50">by @amoresjan</p>
    </div>
  )
}
