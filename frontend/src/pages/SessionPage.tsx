import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RefreshCw, Settings, Users, Clock, LogOut, Copy, Check, Trophy, Moon, Sun, Swords } from 'lucide-react'
import { useSession, useGenerateRound, useUpdateSession, useSetSessionActive, useTournamentSetup, useTournamentAdvance } from '@/hooks/useSession'
import { useClaimedPlayer } from '@/hooks/useClaimedPlayer'
import { useTheme } from '@/hooks/useTheme'
import { SPORTS, getSport, type SportType } from '@/lib/sports'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CurrentRound } from '@/components/CurrentRound'
import { PlayerList } from '@/components/PlayerList'
import { RoundHistory } from '@/components/RoundHistory'
import { Leaderboard } from '@/components/Leaderboard'
import { SessionSummaryCard } from '@/components/SessionSummaryCard'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { api, saveAdminToken, getAdminToken } from '@/lib/api'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { OnboardingWizard, hasBeenOnboarded, hasSeenAdminOnboarding } from '@/components/OnboardingWizard'
import { PushNotificationSettings } from '@/components/PushNotificationSettings'
import { TournamentSetup } from '@/components/tournament/TournamentSetup'
import { TournamentBracket, TournamentCourts, TournamentLeaderboard } from '@/components/tournament/TournamentBracket'
import { partitionPlayers } from '@/lib/utils'
import { toast } from '@/lib/toast'

type Tab = 'round' | 'players' | 'history' | 'leaderboard' | 'settings' | 'bracket' | 'courts'

const ROTATION_TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'round', label: 'Round', icon: <RefreshCw className="h-4 w-4" /> },
  { key: 'players', label: 'Players', icon: <Users className="h-4 w-4" /> },
  { key: 'history', label: 'History', icon: <Clock className="h-4 w-4" /> },
  { key: 'leaderboard', label: 'Board', icon: <Trophy className="h-4 w-4" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

const TOURNAMENT_TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'courts', label: 'Courts', icon: <Swords className="h-4 w-4" /> },
  { key: 'bracket', label: 'Bracket', icon: <Trophy className="h-4 w-4" /> },
  { key: 'players', label: 'Players', icon: <Users className="h-4 w-4" /> },
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
  const setSessionActive = useSetSessionActive(sessionId!)
  const tournamentSetup = useTournamentSetup(sessionId!)
  const tournamentAdvance = useTournamentAdvance(sessionId!)
  const isTournament = session?.session_mode === 'tournament'
  const [tab, setTab] = useState<Tab>('round')

  // Switch to courts tab when a tournament session first loads
  useEffect(() => {
    if (session?.session_mode === 'tournament' && tab === 'round') {
      setTab('courts')
      prevTabRef.current = 'courts'
    }
  }, [session?.session_mode])
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left')
  const prevTabRef = useRef<Tab>('round')
  const [admin, setAdmin] = useState(() => isAdmin(sessionId!))
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [showWizard, setShowWizard] = useState(() => !hasBeenOnboarded(sessionId!))
  const [wizardIsCoHost, setWizardIsCoHost] = useState(false)
  const { claimedPlayerId, claimPlayer } = useClaimedPlayer(sessionId!)
  const claimPromptTriggered = useRef(false)
  const [showClaimPrompt, setShowClaimPrompt] = useState(false)

  useEffect(() => {
    if (admin || showWizard || claimedPlayerId || claimPromptTriggered.current) return
    if (!session?.players.length) return
    claimPromptTriggered.current = true
    setShowClaimPrompt(true)
  }, [admin, showWizard, claimedPlayerId, session?.players.length])

  const sport = getSport(session?.sport_type ?? 'pickleball')
  useEffect(() => {
    const el = document.documentElement
    SPORTS.forEach((s) => el.classList.remove(s.themeClass))
    el.classList.add(sport.themeClass)
    return () => { SPORTS.forEach((s) => el.classList.remove(s.themeClass)) }
  }, [sport.themeClass])

  const TABS = isTournament ? TOURNAMENT_TABS : ROTATION_TABS
  const TAB_ORDER = TABS.map((t) => t.key)

  function switchTab(t: Tab) {
    const prevIdx = TAB_ORDER.indexOf(prevTabRef.current)
    const nextIdx = TAB_ORDER.indexOf(t)
    setSlideDir(nextIdx > prevIdx ? 'left' : 'right')
    prevTabRef.current = t
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
    if (!hasSeenAdminOnboarding(sessionId!)) {
      setWizardIsCoHost(true)
      setShowWizard(true)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header + tab bar — single sticky unit eliminates sub-pixel gap */}
      <div className="sticky top-0 z-10 bg-background">
        <header className="border-b px-4 py-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="font-bold text-base leading-tight truncate">{session.name}</h1>
              {admin && (
                <span className="shrink-0 text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full leading-none">Host</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-none">
              {sport.emoji} {sport.label} · {session.match_type} · {isTournament ? 'Tournament' : session.generation_mode === 'competitive' ? 'Competitive' : 'Fair rotation'}
            </p>
          </div>
        </header>

        <nav className="bg-background">
        <div role="tablist" className="flex max-w-2xl mx-auto border-b">
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
        {!session.is_active && (
          <div className="border-b bg-muted px-4 py-2.5 text-center text-sm text-muted-foreground">
            {session.auto_deactivated
              ? 'This session was closed automatically after 24 hours of inactivity.'
              : 'This session has been closed by the host.'}
          </div>
        )}
        </nav>
      </div>

      {/* Content */}
      <main key={tab} className={`max-w-2xl mx-auto p-4 space-y-6 ${admin && tab === 'round' && session.is_active ? 'pb-24' : ''} ${slideDir === 'left' ? 'animate-tab-slide-left' : 'animate-tab-slide-right'}`}>
        <ErrorBoundary>
          {/* Tournament — Courts tab */}
          {tab === 'courts' && (
            session.tournament_data
              ? <>
                  <TournamentCourts
                    bracket={session.tournament_data}
                    isAdmin={admin}
                    onAdvance={(slotId, winnerId) => tournamentAdvance.mutate({ matchSlotId: slotId, winnerTeamId: winnerId })}
                    isPending={tournamentAdvance.isPending}
                  />
                  {session.tournament_data.status === 'complete' && (
                    <TournamentLeaderboard
                      bracket={session.tournament_data}
                      rounds={session.rounds}
                      currentPlayerId={claimedPlayerId ?? undefined}
                    />
                  )}
                </>
              : admin
                ? <TournamentSetup
                    session={session}
                    onSetup={(payload) => tournamentSetup.mutate(payload)}
                    isPending={tournamentSetup.isPending}
                  />
                : <div className="text-center text-muted-foreground py-12 text-sm">Waiting for the host to set up the bracket.</div>
          )}

          {/* Tournament — Bracket tab */}
          {tab === 'bracket' && (
            session.tournament_data
              ? <TournamentBracket bracket={session.tournament_data} />
              : <div className="text-center text-muted-foreground py-12 text-sm">No bracket yet.</div>
          )}

          {/* Rotation mode */}
          {tab === 'round' && (
            <CurrentRound
              session={session}
              isAdmin={admin}
              currentPlayerId={claimedPlayerId ?? undefined}
            />
          )}
          {tab === 'players' && (
            admin && !(isTournament && session.tournament_data)
              ? <PlayerList session={session} currentPlayerId={claimedPlayerId ?? undefined} />
              : <PublicPlayerList
                  players={session.players}
                  matchType={session.match_type}
                  currentPlayerId={claimedPlayerId ?? undefined}
                  bracketLocked={isTournament && !!session.tournament_data}
                />
          )}
          {tab === 'history' && <RoundHistory sessionId={session.id} rounds={session.rounds} players={session.players} removedPlayers={session.removed_players} isAdmin={admin} isActive={session.is_active} currentPlayerId={claimedPlayerId ?? undefined} />}
          {tab === 'leaderboard' && (
            <div className="space-y-6">
              <Leaderboard players={session.players} rounds={session.rounds} currentPlayerId={claimedPlayerId ?? undefined} />
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
                  onSetActive={(v) => setSessionActive.mutate(v)}
                  settingActive={setSessionActive.isPending}
                  claimedPlayerId={claimedPlayerId}
                  onChangeClaim={() => setShowClaimPrompt(true)}
                />
              : <GuestSettings sessionId={sessionId!} session={session} onUnlocked={handleAdminUnlocked} claimedPlayerId={claimedPlayerId} onChangeClaim={() => setShowClaimPrompt(true)} />
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

      {/* Claim player prompt */}
      <Dialog open={showClaimPrompt} onOpenChange={setShowClaimPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Who are you?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tap your name to highlight your courts and rounds.</p>
          <div className="space-y-1.5 mt-2 max-h-64 overflow-y-auto">
            {session.players.map((player) => (
              <button
                key={player.id}
                onClick={() => { claimPlayer(player.id); setShowClaimPrompt(false) }}
                className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted transition-colors ${player.id === claimedPlayerId ? 'border-primary bg-primary/10' : ''}`}
              >
                {player.name}
              </button>
            ))}
          </div>
          <Button variant="ghost" className="w-full text-muted-foreground text-sm" onClick={() => setShowClaimPrompt(false)}>
            Skip
          </Button>
        </DialogContent>
      </Dialog>

      {/* First-session onboarding wizard */}
      {showWizard && (
        <OnboardingWizard
          sessionId={session.id}
          sessionName={session.name}
          matchType={session.match_type}
          isAdmin={admin}
          isCoHost={wizardIsCoHost}
          onGoToPlayers={() => switchTab('players')}
          onGoToSettings={() => switchTab('settings')}
          onDone={() => { setShowWizard(false); setWizardIsCoHost(false) }}
        />
      )}

      {/* Sticky generate button — only on Round tab for active rotation admins */}
      {admin && tab === 'round' && session.is_active && !isTournament && (() => {
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

type PublicPlayer = import('@/lib/types').Player

function PlayerName({ player, isMe }: { player: PublicPlayer; isMe?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className={`text-sm font-medium truncate ${player.sit_out ? 'line-through text-muted-foreground/60' : ''}`}>
        {player.name}
      </span>
      {isMe && (
        <span className="shrink-0 text-[10px] font-semibold bg-primary/15 text-primary rounded-full px-1.5 py-0.5 leading-none">You</span>
      )}
      {player.sit_out && (
        <span className="shrink-0 text-[10px] text-muted-foreground/70">out</span>
      )}
    </span>
  )
}

function WaitLabel({ rounds }: { rounds: number }) {
  if (rounds <= 0) return null
  return (
    <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
      <Clock className="h-2.5 w-2.5" />
      {rounds}
    </span>
  )
}

function PublicPlayerList({ players, currentPlayerId, bracketLocked, matchType }: {
  players: PublicPlayer[]
  currentPlayerId?: string
  bracketLocked?: boolean
  matchType?: '1v1' | '2v2'
}) {
  const { duoPairs, solos } = partitionPlayers(players)
  const sortedDuoPairs = [...duoPairs].sort(([a, b], [c, d]) => {
    const meIn1 = currentPlayerId && (a.id === currentPlayerId || b.id === currentPlayerId)
    const meIn2 = currentPlayerId && (c.id === currentPlayerId || d.id === currentPlayerId)
    return meIn1 ? -1 : meIn2 ? 1 : 0
  })
  const sortedSolos = [...solos].sort((a, b) => {
    if (currentPlayerId && a.id === currentPlayerId) return -1
    if (currentPlayerId && b.id === currentPlayerId) return 1
    return 0
  })

  const sittingOutCount = players.filter(p => p.sit_out).length

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">{players.length} players</span>
        {sittingOutCount > 0 && (
          <span className="text-xs text-muted-foreground">{sittingOutCount} sitting out</span>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {sortedDuoPairs.map(([a, b]) => {
          const meInPair = a.id === currentPlayerId || b.id === currentPlayerId
          const groupBg = meInPair
            ? 'bg-primary/[0.05] dark:bg-primary/[0.07]'
            : 'bg-muted/30 dark:bg-muted/[0.15]'
          return (
            <div key={`${a.id}-${b.id}`} className={groupBg}>
              <div className="flex items-center justify-between px-3 py-3">
                <PlayerName player={a} isMe={a.id === currentPlayerId} />
                <span className="shrink-0 flex items-center gap-2">
                  <WaitLabel rounds={a.total_wait_rounds} />
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <Users className="h-2.5 w-2.5" />Duo
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 pl-5 border-t border-border/40">
                <PlayerName player={b} isMe={b.id === currentPlayerId} />
                <WaitLabel rounds={b.total_wait_rounds} />
              </div>
            </div>
          )
        })}

        {sortedSolos.map((p) => {
          const isMe = p.id === currentPlayerId
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between px-3 py-3 ${isMe ? 'bg-primary/[0.05] dark:bg-primary/[0.07]' : ''}`}
            >
              <PlayerName player={p} isMe={isMe} />
              <WaitLabel rounds={p.total_wait_rounds} />
            </div>
          )
        })}
      </div>

      {bracketLocked && (
        <p className="text-xs text-muted-foreground px-0.5">Player list is locked for the tournament.</p>
      )}
      {!bracketLocked && matchType === '2v2' && duoPairs.length === 0 && (
        <p className="text-xs text-muted-foreground px-0.5">Ask the host to set up permanent duos.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings (admin only)
// ---------------------------------------------------------------------------

interface SettingsProps {
  sessionId: string
  session: import('@/lib/types').Session
  onSave: (data: Partial<{ name: string; match_type: '1v1' | '2v2'; num_courts: number; generation_mode: 'fair' | 'competitive'; sport_type: string }>) => void
  saving: boolean
  onSetActive: (isActive: boolean) => void
  settingActive: boolean
  claimedPlayerId: string | null
  onChangeClaim: () => void
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

function GuestSettings({ sessionId, session, onUnlocked, claimedPlayerId, onChangeClaim }: { sessionId: string; session: import('@/lib/types').Session; onUnlocked: () => void; claimedPlayerId: string | null; onChangeClaim: () => void }) {
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const claimedName = session.players.find((p) => p.id === claimedPlayerId)?.name ?? null

  return (
    <div className="space-y-6">
      <SettingsGroup title="You">
        <SettingsRows>
          {claimedName ? (
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">Playing as</p>
                <p className="text-sm font-medium">{claimedName}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={onChangeClaim}>Change</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">Not set</span>
              <Button size="sm" variant="outline" onClick={onChangeClaim}>Select</Button>
            </div>
          )}
        </SettingsRows>
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRows>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">Dark mode</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
          <PushNotificationSettings sessionId={sessionId} claimedPlayerId={claimedPlayerId} />
        </SettingsRows>
      </SettingsGroup>

      <SettingsGroup title="Share">
        <ShareField session={session} />
      </SettingsGroup>

      <SettingsGroup title="Host Access">
        <div className="rounded-xl border px-4 py-3">
          <AdminCodeEntry sessionId={sessionId} onUnlocked={onUnlocked} />
        </div>
      </SettingsGroup>

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

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-0.5">{title}</p>
      {children}
    </div>
  )
}

function SettingsRows({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border overflow-hidden divide-y divide-border bg-background">
      {children}
    </div>
  )
}

function SessionSettings({ sessionId, session, onSave, saving, onSetActive, settingActive, claimedPlayerId, onChangeClaim }: SettingsProps) {
  const [name, setName] = useState(session.name)
  const [sport, setSport] = useState<SportType>(session.sport_type)
  const [matchType, setMatchType] = useState<'1v1' | '2v2'>(session.match_type)
  const [numCourts, setNumCourts] = useState(String(session.num_courts))
  const [mode, setMode] = useState<'fair' | 'competitive'>(session.generation_mode)
  const [confirmClose, setConfirmClose] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  const isTournament = session.session_mode === 'tournament'
  const bracketLocked = isTournament && !!session.tournament_data

  useEffect(() => {
    setName(session.name)
    setSport(session.sport_type)
    setMatchType(session.match_type)
    setNumCourts(String(session.num_courts))
    setMode(session.generation_mode)
  }, [session.name, session.sport_type, session.match_type, session.num_courts, session.generation_mode])

  const adminToken = getAdminToken(sessionId) ?? ''
  const fieldDisabled = !session.is_active || bracketLocked

  const parsedCourts = Math.max(1, Math.min(8, parseInt(numCourts) || 1))
  const hasChanges = session.is_active && !bracketLocked && (
    name !== session.name ||
    sport !== session.sport_type ||
    matchType !== session.match_type ||
    parsedCourts !== session.num_courts ||
    mode !== session.generation_mode
  )

  function handleSave() {
    onSave({ name, sport_type: sport, match_type: matchType, num_courts: parsedCourts, generation_mode: mode })
  }

  return (
    <div className="space-y-6">

      <SettingsGroup title="Game">
        {bracketLocked && (
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Settings are locked while a tournament bracket is active.
          </div>
        )}
        <SettingsRows>
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground mb-2">Sport</p>
            <div className="grid grid-cols-3 gap-1.5">
              {SPORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => !fieldDisabled && setSport(s.value)}
                  disabled={fieldDisabled}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border p-2 text-xs transition-colors disabled:opacity-50 ${
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
          <div className="px-4 py-3">
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={fieldDisabled} />
          </div>
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Match Type</label>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as '1v1' | '2v2')} disabled={fieldDisabled}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2v2">2v2</SelectItem>
                  <SelectItem value="1v1">1v1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Courts</label>
              <Input type="text" inputMode="numeric" value={numCourts} onChange={(e) => setNumCourts(e.target.value.replace(/\D/g, ''))} disabled={fieldDisabled} />
            </div>
          </div>
          {!isTournament && (
            <div className="px-4 py-3">
              <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'fair' | 'competitive')} disabled={fieldDisabled}>
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
          )}
        </SettingsRows>
        {session.is_active && !bracketLocked && (
          <div className="space-y-1.5">
            <p className={`text-xs text-amber-600 dark:text-amber-400 transition-opacity ${hasChanges ? 'opacity-100' : 'opacity-0'}`}>
              ● Unsaved changes
            </p>
            <Button className="w-full" onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="You">
        <SettingsRows>
          {claimedPlayerId && session.players.find((p) => p.id === claimedPlayerId) ? (
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">Playing as</p>
                <p className="text-sm font-medium">{session.players.find((p) => p.id === claimedPlayerId)!.name}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={onChangeClaim}>Change</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">Not set</span>
              <Button size="sm" variant="outline" onClick={onChangeClaim}>Select</Button>
            </div>
          )}
        </SettingsRows>
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRows>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">Dark mode</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
          <PushNotificationSettings sessionId={sessionId} claimedPlayerId={claimedPlayerId} />
        </SettingsRows>
      </SettingsGroup>

      <SettingsGroup title="Share">
        <ShareField session={session} />
      </SettingsGroup>

      <SettingsGroup title="Host Access">
        <CopyField label="Admin Code" value={adminToken} />
        <p className="text-xs text-muted-foreground px-0.5">Share with co-hosts to give them admin access.</p>
      </SettingsGroup>

      {session.is_active && (
        <SettingsGroup title="Session">
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => setConfirmClose(true)}
            disabled={settingActive}
          >
            Close Session
          </Button>
          <p className="text-xs text-muted-foreground">
            Players will no longer be able to generate new rounds. You can reopen it afterwards.
          </p>
        </SettingsGroup>
      )}

      {!session.is_active && (
        <SettingsGroup title="Session">
          <div className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
            {session.auto_deactivated
              ? 'This session was closed automatically and cannot be reopened.'
              : 'This session is closed.'}
          </div>
          {!session.auto_deactivated && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => onSetActive(true)}
              disabled={settingActive}
            >
              {settingActive ? 'Reopening…' : 'Reopen Session'}
            </Button>
          )}
        </SettingsGroup>
      )}

      <div className="pt-2">
        <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
          <LogOut className="h-4 w-4 mr-2" />
          Leave Session
        </Button>
      </div>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close this session?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            No new rounds can be generated once closed. You can reopen it from Settings.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setConfirmClose(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={settingActive}
              onClick={() => {
                setConfirmClose(false)
                onSetActive(false)
              }}
            >
              Close Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
