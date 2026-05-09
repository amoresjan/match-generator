import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, saveAdminToken } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SPORTS, getSport, type SportType } from '@/lib/sports'

const MODE_COPY: Record<string, string> = {
  fair: 'Everyone gets equal court time and varied opponents. Best for casual play.',
  competitive: 'Players are matched by win count — top players face each other, bottom players face each other.',
  tournament: 'Single-elimination bracket. Set up teams, then play match by match until a champion.',
}

export function HomePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [sport, setSport] = useState<SportType>('pickleball')
  const [matchType, setMatchType] = useState<'1v1' | '2v2'>('2v2')
  const [numCourts, setNumCourts] = useState('1')
  const [mode, setMode] = useState<'fair' | 'competitive' | 'tournament'>('fair')
  const [joinId, setJoinId] = useState('')

  const create = useMutation({
    mutationFn: () => {
      const isTournament = mode === 'tournament'
      return api.createSession({
        name,
        sport_type: sport,
        match_type: matchType,
        num_courts: Math.max(1, Math.min(8, parseInt(numCourts) || 1)),
        generation_mode: isTournament ? 'fair' : mode,
        session_mode: isTournament ? 'tournament' : 'rotation',
      })
    },
    onSuccess: (data) => {
      saveAdminToken(data.id, data.admin_token)
      navigate(`/session/${data.id}`)
    },
  })

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const raw = joinId.trim()
    if (!raw) return
    const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    navigate(`/session/${m ? m[0] : raw}`)
  }

  const activeSport = getSport(sport)

  return (
    <div className={`min-h-screen ${activeSport.themeClass}`}>

      {/* Hero */}
      <div className="relative bg-primary/10 transition-colors duration-300 px-6 pt-14 pb-10 text-center">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <span
          key={sport}
          aria-hidden="true"
          className="block text-5xl mb-5 animate-winner-pop select-none"
        >
          {activeSport.emoji}
        </span>
        <h1 className="text-[2.75rem] font-bold tracking-tight text-primary leading-none">
          Rally
        </h1>
        <p className="mt-3 text-base text-foreground/60 max-w-[15rem] mx-auto leading-snug">
          Stop doing the math.<br />Start playing.
        </p>
      </div>

      {/* Form */}
      <div className="max-w-sm mx-auto px-4 pt-7 pb-10 space-y-5">

        {/* Sport picker */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Sport</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SPORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSport(s.value)}
                className={`flex flex-col items-center gap-0.5 rounded-xl border-2 py-2.5 text-xs font-medium transition duration-150 active:scale-95 ${
                  sport === s.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                <span className="text-xl leading-none">{s.emoji}</span>
                <span className="mt-0.5">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Session name */}
        <div>
          <label htmlFor="session-name" className="text-xs text-muted-foreground mb-1.5 block">
            Session name
          </label>
          <Input
            id="session-name"
            placeholder="e.g. Friday Pickles"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Match type + Courts */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Match type</label>
            <Select value={matchType} onValueChange={(v) => setMatchType(v as '1v1' | '2v2')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2v2">2v2</SelectItem>
                <SelectItem value="1v1">1v1</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Courts</label>
            <Input
              type="text"
              inputMode="numeric"
              value={numCourts}
              onChange={(e) => setNumCourts(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>

        {/* Mode */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Mode</label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'fair' | 'competitive' | 'tournament')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fair">Fair Rotation</SelectItem>
              <SelectItem value="competitive">Competitive</SelectItem>
              <SelectItem value="tournament">Tournament</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {MODE_COPY[mode]}
          </p>
        </div>

        {/* Create */}
        <Button
          className="w-full h-11 text-sm font-semibold active:scale-95 transition-transform"
          onClick={() => create.mutate()}
          disabled={!name.trim() || create.isPending}
        >
          {create.isPending ? 'Creating…' : 'Create Session'}
        </Button>

        {/* Divider */}
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Join */}
        <form onSubmit={handleJoin} className="space-y-1.5">
          <label htmlFor="join-id" className="text-xs text-muted-foreground block">
            Join a session
          </label>
          <div className="flex gap-2">
            <Input
              id="join-id"
              placeholder="Paste link or ID…"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              className="flex-1"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!joinId.trim()}
              className="shrink-0"
            >
              Join
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground/40 pt-2">by @amoresjan</p>
      </div>
    </div>
  )
}
