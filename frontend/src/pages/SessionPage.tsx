import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RefreshCw, Settings, Users, Clock, LogOut, Copy, Check, Trophy, Moon, Sun } from 'lucide-react'
import { useSession, useGenerateRound, useUpdateSession } from '@/hooks/useSession'
import { useTheme } from '@/hooks/useTheme'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CurrentRound } from '@/components/CurrentRound'
import { PlayerList } from '@/components/PlayerList'
import { RoundHistory } from '@/components/RoundHistory'
import { Leaderboard } from '@/components/Leaderboard'
import { SessionSummaryCard } from '@/components/SessionSummaryCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { api, saveAdminToken, getAdminToken } from '@/lib/api'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { OnboardingWizard, hasBeenOnboarded } from '@/components/OnboardingWizard'
import { partitionPlayers } from '@/lib/utils'
import { toast } from '@/lib/toast'

type Tab = 'round' | 'players' | 'history' | 'leaderboard' | 'settings'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'round', label: 'Round', icon: <RefreshCw className="h-4 w-4" /> },
  { key: 'players', label: 'Players', icon: <Users className="h-4 w-4" /> },
  { key: 'history', label: 'History', icon: <Clock className="h-4 w-4" /> },
  { key: 'leaderboard', label: 'Board', icon: <Trophy className="h-4 w-4" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

function getStoredToken(sessionId: string): string | null {
  return localStorage.getItem(`admin_token:${sessionId}`)
}

function isAdmin(sessionId: string): boolean {
  return getStoredToken(sessionId) !== null
}

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { data: session, isLoading, error } = useSession(sessionId!)
  const generateRound = useGenerateRound(sessionId!)
  const updateSession = useUpdateSession(sessionId!)
  const [tab, setTab] = useState<Tab>('round')
  const [admin, setAdmin] = useState(() => isAdmin(sessionId!))
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [showWizard, setShowWizard] = useState(() => !hasBeenOnboarded())

  function switchTab(t: Tab) {
    setTab(t)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleGenerateRound() {
    const latest = session?.rounds[session.rounds.length - 1]
    const hasUnrecorded = latest?.matches.some((m) => m.winner === null)
    if (hasUnrecorded) {
      setConfirmGenerate(true)
    } else {
      generateRound.mutate()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading session…
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive text-sm">
        Session not found or unavailable.
      </div>
    )
  }

  function handleAdminUnlocked() {
    setAdmin(true)
    setTab('round')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight truncate">{session.name}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                {admin && <Badge className="text-xs shrink-0">Host</Badge>}
                <Badge variant="secondary" className="text-xs shrink-0">{session.match_type === '2v2' ? '👥 2v2' : '👤 1v1'}</Badge>
                <Badge variant={session.generation_mode === 'competitive' ? 'default' : 'outline'} className="text-xs shrink-0">{session.generation_mode === 'competitive' ? '🏆 Competitive' : '🔄 Fair'}</Badge>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="border-b bg-background sticky top-[61px] z-10">
        <div role="tablist" className="flex max-w-2xl mx-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => switchTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className={`max-w-2xl mx-auto p-4 space-y-6 ${admin && tab === 'round' ? 'pb-24' : ''}`}>
        <ErrorBoundary>
          {tab === 'round' && (
            <CurrentRound
              session={session}
              isAdmin={admin}
            />
          )}
          {tab === 'players' && (
            admin
              ? <PlayerList session={session} />
              : <PublicPlayerList players={session.players} />
          )}
          {tab === 'history' && <RoundHistory sessionId={session.id} rounds={session.rounds} players={session.players} removedPlayers={session.removed_players} isAdmin={admin} />}
          {tab === 'leaderboard' && (
            <div className="space-y-6">
              <Leaderboard players={session.players} rounds={session.rounds} />
              {session.rounds.some((r) => r.matches.some((m) => m.winner !== null)) && (
                <SessionSummaryCard sessionName={session.name} players={session.players} rounds={session.rounds} />
              )}
            </div>
          )}
          {tab === 'settings' && (
            admin
              ? <SessionSettings
                  sessionId={sessionId!}
                  session={session}
                  onSave={(data) => updateSession.mutate(data)}
                  saving={updateSession.isPending}
                />
              : <GuestSettings sessionId={sessionId!} session={session} onUnlocked={handleAdminUnlocked} />
          )}
        </ErrorBoundary>
      </main>

      {/* Confirm generate dialog */}
      <Dialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unrecorded results</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Some matches in the current round don't have a result. Generate the next round anyway?
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setConfirmGenerate(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setConfirmGenerate(false)
                generateRound.mutate()
              }}
            >
              Generate anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* First-session onboarding wizard */}
      {showWizard && (
        <OnboardingWizard
          sessionName={session.name}
          matchType={session.match_type}
          isAdmin={admin}
          onGoToPlayers={() => switchTab('players')}
          onGoToSettings={() => switchTab('settings')}
          onDone={() => setShowWizard(false)}
        />
      )}

      {/* Sticky generate button — only on Round tab for admins */}
      {admin && tab === 'round' && (() => {
        const activePlayers = session.players.filter((p) => !p.sit_out)
        const minPlayers = session.match_type === '2v2' ? 4 : 2
        const hint = activePlayers.length === 0
          ? 'Add players to get started.'
          : activePlayers.length < minPlayers
            ? `Need at least ${minPlayers} active players for ${session.match_type}.`
            : null
        return (
          <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-background/80 backdrop-blur border-t">
            <div className="max-w-2xl mx-auto space-y-1.5">
              {hint && <p className="text-xs text-muted-foreground text-center">{hint}</p>}
              <Button
                className="w-full"
                onClick={handleGenerateRound}
                disabled={generateRound.isPending || !!hint}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${generateRound.isPending ? 'animate-spin' : ''}`} />
                {session.rounds.length === 0 ? 'Start' : 'Next Round'}
              </Button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Admin code entry
// ---------------------------------------------------------------------------

function AdminCodeEntry({ sessionId, onUnlocked }: { sessionId: string; onUnlocked: () => void }) {
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

// ---------------------------------------------------------------------------
// Public player list (read-only)
// ---------------------------------------------------------------------------

function PublicPlayerRow({ player }: { player: import('@/lib/types').Player }) {
  return (
    <>
      <span className={`text-sm font-medium ${player.sit_out ? 'line-through text-muted-foreground' : ''}`}>
        {player.name}
      </span>
      {player.total_wait_rounds > 0 && (
        <Badge variant="outline" className="text-xs">Wait: {player.total_wait_rounds}</Badge>
      )}
    </>
  )
}

function PublicPlayerList({ players }: { players: import('@/lib/types').Player[] }) {
  const { duoPairs, solos } = partitionPlayers(players)

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Players ({players.length})</h2>

      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium">💡 Duo tip</p>
        <p>Want to permanently team up with someone? Ask the host to set you up as a duo.</p>
      </div>

      {duoPairs.map(([a, b]) => (
        <div key={`${a.id}-${b.id}`} className="rounded-lg border-2 p-3 space-y-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <Users className="h-3 w-3" />
            Duo
          </Badge>
          <div className="space-y-1.5 border-t pt-2">
            <div className="flex items-center justify-between"><PublicPlayerRow player={a} /></div>
            <div className="flex items-center justify-between"><PublicPlayerRow player={b} /></div>
          </div>
        </div>
      ))}

      {solos.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
          <PublicPlayerRow player={p} />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings (admin only)
// ---------------------------------------------------------------------------

interface SettingsProps {
  sessionId: string
  session: import('@/lib/types').Session
  onSave: (data: Partial<{ name: string; match_type: '1v1' | '2v2'; num_courts: number; generation_mode: 'fair' | 'competitive' }>) => void
  saving: boolean
}

function ShareField({ session }: { session: import('@/lib/types').Session }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/session/${session.id}`

  const modeEmoji = session.generation_mode === 'competitive' ? '🏆' : '🔄'
  const modeLabel = session.generation_mode === 'competitive' ? 'Competitive' : 'Fair Rotation'
  const typeEmoji = session.match_type === '2v2' ? '👥' : '👤'

  const message = `${session.name}\n${modeEmoji} ${modeLabel}\n${typeEmoji} ${session.match_type}\n\nSee live matches: ${link}`

  function copy() {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <div className="px-4 py-4 space-y-1">
        <p className="font-bold text-sm leading-snug">{session.name}</p>
        <p className="text-sm">{modeEmoji} {modeLabel}</p>
        <p className="text-sm">{typeEmoji} {session.match_type}</p>
        <p className="text-sm pt-2 text-muted-foreground break-all">See live matches: {link}</p>
      </div>
      <div className="border-t" />
      <button
        onClick={copy}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-primary hover:bg-muted/50 active:bg-muted transition-colors"
      >
        {copied
          ? <><Check className="h-4 w-4" /> Copied!</>
          : <><Copy className="h-4 w-4" /> Copy Message</>
        }
      </button>
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-mono break-all">{value}</p>
      </div>
      <div className="border-t" />
      <button
        onClick={copy}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-primary hover:bg-muted/50 active:bg-muted transition-colors"
      >
        {copied
          ? <><Check className="h-4 w-4" /> Copied!</>
          : <><Copy className="h-4 w-4" /> Copy Code</>
        }
      </button>
    </div>
  )
}

function GuestSettings({ sessionId, session, onUnlocked }: { sessionId: string; session: import('@/lib/types').Session; onUnlocked: () => void }) {
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <SettingsSection title="Appearance">
        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <span className="text-sm">Dark mode</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </SettingsSection>
      <SettingsSection title="Share">
        <ShareField session={session} />
      </SettingsSection>
      <SettingsSection title="Host Access">
        <AdminCodeEntry sessionId={sessionId} onUnlocked={onUnlocked} />
      </SettingsSection>
      <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
        <LogOut className="h-4 w-4 mr-2" />
        Leave Session
      </Button>
      <p className="text-center text-xs text-muted-foreground/60 pt-2">
        Got feedback?{' '}
        <a href="https://forms.gle/bFa9PwrG3DweFfnZ9" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Let us know
        </a>
      </p>
      <p className="text-center text-xs text-muted-foreground/50">by <a href="https://amoresjan.dev" target="_blank" rel="noreferrer" className="underline underline-offset-2">@amoresjan</a></p>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

function SessionSettings({ sessionId, session, onSave, saving }: SettingsProps) {
  const [name, setName] = useState(session.name)
  const [matchType, setMatchType] = useState<'1v1' | '2v2'>(session.match_type)
  const [numCourts, setNumCourts] = useState(String(session.num_courts))
  const [mode, setMode] = useState<'fair' | 'competitive'>(session.generation_mode)
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    setName(session.name)
    setMatchType(session.match_type)
    setNumCourts(String(session.num_courts))
    setMode(session.generation_mode)
  }, [session.name, session.match_type, session.num_courts, session.generation_mode])

  const adminToken = getAdminToken(sessionId) ?? ''

  return (
    <div className="space-y-6">

      <SettingsSection title="Game">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Match Type</label>
            <Select value={matchType} onValueChange={(v) => setMatchType(v as '1v1' | '2v2')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2v2">2v2</SelectItem>
                <SelectItem value="1v1">1v1</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Courts</label>
            <Input type="text" inputMode="numeric" value={numCourts} onChange={(e) => setNumCourts(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'fair' | 'competitive')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
      </SettingsSection>

      <SettingsSection title="Session">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </SettingsSection>

      <SettingsSection title="Appearance">
        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <span className="text-sm">Dark mode</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Share">
        <ShareField session={session} />
        <CopyField label="Admin Code — tap to copy & share with co-hosts" value={adminToken} />
      </SettingsSection>

      <div className="space-y-2 pt-2">
        <Button
          className="w-full"
          onClick={() => onSave({ name, match_type: matchType, num_courts: Math.max(1, Math.min(8, parseInt(numCourts) || 1)), generation_mode: mode })}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
        <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
          <LogOut className="h-4 w-4 mr-2" />
          Leave Session
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground/60 pt-2">
        Got feedback?{' '}
        <a href="https://forms.gle/bFa9PwrG3DweFfnZ9" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Let us know
        </a>
      </p>
      <p className="text-center text-xs text-muted-foreground/50">by <a href="https://amoresjan.dev" target="_blank" rel="noreferrer" className="underline underline-offset-2">@amoresjan</a></p>
    </div>
  )
}
