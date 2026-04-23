import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RefreshCw, Settings, Users, ChevronDown, LogOut, Copy, Check, ShieldCheck, Trophy, Moon, Sun } from 'lucide-react'
import { useSession, useGenerateRound, useUpdateSession } from '@/hooks/useSession'
import { useTheme } from '@/hooks/useTheme'
import { CurrentRound } from '@/components/CurrentRound'
import { PlayerList } from '@/components/PlayerList'
import { RoundHistory } from '@/components/RoundHistory'
import { Leaderboard } from '@/components/Leaderboard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { saveAdminToken, BASE } from '@/lib/api'

type Tab = 'round' | 'players' | 'history' | 'leaderboard' | 'settings'

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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'round', label: 'Round', icon: <RefreshCw className="h-4 w-4" /> },
    { key: 'players', label: 'Players', icon: <Users className="h-4 w-4" /> },
    { key: 'history', label: 'History', icon: <ChevronDown className="h-4 w-4" /> },
    { key: 'leaderboard', label: 'Board', icon: <Trophy className="h-4 w-4" /> },
    { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  ]

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
                <Badge variant="secondary" className="text-xs shrink-0">{session.match_type}</Badge>
                <Badge variant="outline" className="text-xs shrink-0">{session.num_courts} court{session.num_courts !== 1 ? 's' : ''}</Badge>
                <Badge variant="outline" className="text-xs shrink-0">{session.generation_mode === 'competitive' ? 'Competitive' : 'Fair'}</Badge>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="border-b bg-background sticky top-[61px] z-10">
        <div className="flex max-w-2xl mx-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
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
        {tab === 'round' && (
          <CurrentRound
            session={session}
            isAdmin={admin}
            onGenerateRound={admin ? () => generateRound.mutate() : undefined}
            isGenerating={generateRound.isPending}
          />
        )}
        {tab === 'players' && (
          admin
            ? <PlayerList session={session} />
            : <PublicPlayerList players={session.players} />
        )}
        {tab === 'history' && <RoundHistory sessionId={session.id} rounds={session.rounds} players={session.players} isAdmin={admin} />}
        {tab === 'leaderboard' && <Leaderboard players={session.players} rounds={session.rounds} />}
        {tab === 'settings' && (
          admin
            ? <SessionSettings
                sessionId={sessionId!}
                session={session}
                onSave={(data) => updateSession.mutate(data)}
                saving={updateSession.isPending}
              />
            : <GuestSettings sessionId={sessionId!} />
        )}

        {/* Admin code entry — always visible to non-admins */}
        {!admin && (
          <AdminCodeEntry sessionId={sessionId!} onUnlocked={handleAdminUnlocked} />
        )}
      </main>

      {/* Sticky generate button — only on Round tab for admins */}
      {admin && tab === 'round' && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-background/80 backdrop-blur border-t">
          <div className="max-w-2xl mx-auto">
            <Button
              className="w-full"
              onClick={() => generateRound.mutate()}
              disabled={generateRound.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${generateRound.isPending ? 'animate-spin' : ''}`} />
              {session.rounds.length === 0 ? 'Start' : 'Next Round'}
            </Button>
          </div>
        </div>
      )}
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
      // Validate by attempting an authenticated no-op update
      const res = await fetch(`${BASE}/sessions/${sessionId}/update/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': trimmed },
        body: JSON.stringify({}),
      })

      if (res.ok) {
        saveAdminToken(sessionId, trimmed)
        onUnlocked()
      } else {
        setError('Invalid admin code. Please try again.')
      }
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        Are you the host?
      </div>
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

function PublicPlayerList({ players }: { players: import('@/lib/types').Player[] }) {
  const seen = new Set<string>()
  const duoPairs: [import('@/lib/types').Player, import('@/lib/types').Player][] = []
  const solos: import('@/lib/types').Player[] = []

  for (const player of players) {
    if (seen.has(player.id)) continue
    if (player.permanent_partner_id) {
      const partner = players.find((p) => p.id === player.permanent_partner_id)
      if (partner) {
        duoPairs.push([player, partner])
        seen.add(player.id)
        seen.add(partner.id)
        continue
      }
    }
    solos.push(player)
  }

  function renderRow(p: import('@/lib/types').Player) {
    return (
      <>
        <span className="text-sm font-medium">{p.name}</span>
        {p.total_wait_rounds > 0 && (
          <Badge variant="outline" className="text-xs">Wait: {p.total_wait_rounds}</Badge>
        )}
      </>
    )
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Players ({players.length})</h2>

      {duoPairs.map(([a, b]) => (
        <div key={`${a.id}-${b.id}`} className="rounded-lg border-2 p-3 space-y-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <Users className="h-3 w-3" />
            Duo
          </Badge>
          <div className="space-y-1.5 border-t pt-2">
            <div className="flex items-center justify-between">{renderRow(a)}</div>
            <div className="flex items-center justify-between">{renderRow(b)}</div>
          </div>
        </div>
      ))}

      {solos.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
          {renderRow(p)}
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

function ShareField({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/session/${sessionId}`

  function copy() {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="w-full rounded-md bg-muted p-3 text-left transition-colors hover:bg-muted/70 active:bg-muted/50 group"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground font-medium">Session ID — tap to copy & share with players</p>
        {copied
          ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
          : <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        }
      </div>
      <p className="text-xs font-mono break-all">{link}</p>
    </button>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="w-full rounded-md bg-muted p-3 text-left transition-colors hover:bg-muted/70 active:bg-muted/50 group"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        {copied
          ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
          : <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        }
      </div>
      <p className="text-xs font-mono break-all">{value}</p>
    </button>
  )
}

function GuestSettings({ sessionId }: { sessionId: string }) {
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
        <ShareField sessionId={sessionId} />
      </SettingsSection>
      <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
        <LogOut className="h-4 w-4 mr-2" />
        Leave Session
      </Button>
      <p className="text-center text-xs text-muted-foreground/50 pt-4">by @amoresjan</p>
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
  const [numCourts, setNumCourts] = useState(session.num_courts)
  const [mode, setMode] = useState<'fair' | 'competitive'>(session.generation_mode)
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  const adminToken = localStorage.getItem(`admin_token:${sessionId}`) ?? ''

  return (
    <div className="space-y-6">

      <SettingsSection title="Game">
        <div className="grid grid-cols-2 gap-3">
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
            <Input type="number" min={1} max={8} value={numCourts} onChange={(e) => setNumCourts(Number(e.target.value))} />
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
        <ShareField sessionId={session.id} />
        <CopyField label="Admin Code — tap to copy & share with co-hosts" value={adminToken} />
      </SettingsSection>

      <div className="space-y-2 pt-2">
        <Button
          className="w-full"
          onClick={() => onSave({ name, match_type: matchType, num_courts: numCourts, generation_mode: mode })}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
        <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
          <LogOut className="h-4 w-4 mr-2" />
          Leave Session
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground/50 pt-4">by @amoresjan</p>
    </div>
  )
}
