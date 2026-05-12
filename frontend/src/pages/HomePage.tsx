import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, saveAdminToken } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SPORTS, getSport, type SportType } from '@/lib/sports'

type HomeTab = 'create' | 'join'

const MODE_COPY: Record<string, string> = {
  fair: 'Everyone gets equal court time and varied opponents.',
  competitive: 'Players are sorted by wins. Top players face top players; lower-ranked players face each other.',
  tournament: 'Single-elimination bracket. Add players, then play match by match until a winner.',
}

export function HomePage() {
  const navigate = useNavigate()
  const [homeTab, setHomeTab] = useState<HomeTab>('create')
  const [name, setName] = useState('')
  const [sport, setSport] = useState<SportType>('pickleball')
  const [matchType, setMatchType] = useState<'1v1' | '2v2'>('2v2')
  const [numCourts, setNumCourts] = useState('1')
  const [mode, setMode] = useState<'fair' | 'competitive' | 'tournament'>('fair')
  const [joinId, setJoinId] = useState('')
  const [joinError, setJoinError] = useState('')

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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim()) create.mutate()
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const raw = joinId.trim()
    if (!raw) return
    const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (!m) {
      setJoinError("Doesn't look like a valid session link or ID. Ask your host to resend it.")
      return
    }
    setJoinError('')
    navigate(`/session/${m[0]}`)
  }

  const activeSport = getSport(sport)

  return (
    <div className={`min-h-screen ${activeSport.themeClass}`}>

      {/* Hero */}
      <div className="relative overflow-hidden bg-primary dark:bg-primary/10 hero-court-pattern transition-colors duration-300 pt-14 pb-10">
        <div className="absolute top-4 right-4 z-10 [&>button]:text-white/75 [&>button:hover]:bg-white/10 dark:[&>button]:text-foreground dark:[&>button:hover]:bg-accent">
          <ThemeToggle />
        </div>

        {/* Background emoji — large, faded, top-right accent */}
        <span
          key={sport}
          aria-hidden="true"
          className="absolute -right-3 -top-2 z-0 text-[8rem] leading-none opacity-[0.15] dark:opacity-[0.10] select-none pointer-events-none rotate-[14deg] animate-winner-pop"
        >
          {activeSport.emoji}
        </span>

        {/* Hero content */}
        <div className="max-w-sm mx-auto px-4 relative z-10">
          <p
            key={sport}
            className="text-xs tracking-[0.2em] uppercase font-semibold text-white/55 dark:text-primary/65 mb-2 animate-hero-up"
          >
            {activeSport.label}
          </p>
          <h1 className="text-8xl font-black tracking-tighter text-white dark:text-primary leading-none animate-hero-up">
            Rally
          </h1>
          <p className="mt-4 text-sm text-white/75 dark:text-foreground/60 max-w-[13rem] leading-snug animate-hero-up-delay">
            Stop doing the math.<br />Start playing.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-sm mx-auto">

        {/* Tab bar */}
        <div role="tablist" className="relative flex border-b">
          {(['create', 'join'] as HomeTab[]).map((t) => (
            <button
              key={t}
              id={`tab-btn-${t}`}
              role="tab"
              aria-selected={homeTab === t}
              aria-controls={`tab-panel-${t}`}
              onClick={() => setHomeTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                homeTab === t
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'create' ? 'Create' : 'Join'}
            </button>
          ))}
          <div
            aria-hidden="true"
            className="tab-indicator pointer-events-none absolute bottom-0 left-0 h-0.5 bg-primary"
            style={{ width: '50%', transform: `translateX(${homeTab === 'join' ? '100%' : '0%'})` }}
          />
        </div>

        {/* Create tab */}
        {homeTab === 'create' && (
          <form
            id="tab-panel-create"
            role="tabpanel"
            aria-labelledby="tab-btn-create"
            onSubmit={handleCreate}
            className="px-4 pt-6 pb-8 animate-tab-in"
          >

            {/* Sport picker */}
            <div>
              <p id="sport-group-label" className="text-xs text-muted-foreground mb-2">Sport</p>
              <div role="radiogroup" aria-labelledby="sport-group-label" className="grid grid-cols-3 gap-1.5">
                {SPORTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={sport === s.value}
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
            <div className="mt-6">
              <label htmlFor="session-name" className="text-xs text-muted-foreground mb-1.5 block">
                Session name
              </label>
              <Input
                id="session-name"
                placeholder="e.g. Friday Pickles"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                aria-required="true"
              />
            </div>

            {/* Match type + Courts */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="match-type" className="text-xs text-muted-foreground mb-1.5 block">
                  Match type
                </label>
                <Select value={matchType} onValueChange={(v) => setMatchType(v as '1v1' | '2v2')}>
                  <SelectTrigger id="match-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2v2">2v2</SelectItem>
                    <SelectItem value="1v1">1v1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="num-courts" className="text-xs text-muted-foreground mb-1.5 block">
                  Courts (1–8)
                </label>
                <Input
                  id="num-courts"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={numCourts}
                  onChange={(e) => setNumCourts(e.target.value.replace(/\D/g, ''))}
                  onBlur={(e) => setNumCourts(String(Math.max(1, Math.min(8, parseInt(e.target.value) || 1))))}
                />
              </div>
            </div>

            {/* Mode */}
            <div className="mt-4">
              <label htmlFor="mode" className="text-xs text-muted-foreground mb-1.5 block">Mode</label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'fair' | 'competitive' | 'tournament')}>
                <SelectTrigger id="mode" aria-describedby="mode-desc"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fair">Fair Rotation</SelectItem>
                  <SelectItem value="competitive">Competitive</SelectItem>
                  <SelectItem value="tournament">Tournament</SelectItem>
                </SelectContent>
              </Select>
              <p id="mode-desc" className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {MODE_COPY[mode]}
              </p>
            </div>

            {/* Create */}
            <div className="mt-7 space-y-1.5">
              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold active:scale-95 transition-transform"
                disabled={!name.trim() || create.isPending}
              >
                {create.isPending ? 'Creating…' : 'Create Session'}
              </Button>
              {create.isError && (
                <p className="text-xs text-destructive text-center">
                  Couldn't create the session. Check your connection and try again.
                </p>
              )}
            </div>

          </form>
        )}

        {/* Join tab */}
        {homeTab === 'join' && (
          <form
            id="tab-panel-join"
            role="tabpanel"
            aria-labelledby="tab-btn-join"
            onSubmit={handleJoin}
            className="px-4 pt-6 pb-8 space-y-1.5 animate-tab-in"
          >
            <label htmlFor="join-id" className="text-xs text-muted-foreground block">
              Session link or ID
            </label>
            <div className="flex gap-2">
              <Input
                id="join-id"
                placeholder="Paste link or ID…"
                value={joinId}
                onChange={(e) => { setJoinId(e.target.value); setJoinError('') }}
                className="flex-1"
                aria-describedby={joinError ? 'join-error' : undefined}
                aria-invalid={!!joinError}
                autoFocus
              />
              <Button
                type="submit"
                disabled={!joinId.trim()}
                className="shrink-0 active:scale-95 transition-transform"
              >
                Join
              </Button>
            </div>
            {joinError && (
              <p id="join-error" role="alert" className="text-xs text-destructive">
                {joinError}
              </p>
            )}
          </form>
        )}

      </div>
    </div>
  )
}
