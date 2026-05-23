import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSession, useGenerateRound, useUpdateSession, useSetSessionActive, useTournamentSetup, useTournamentAdvance } from '@/hooks/useSession'
import { useClaimedPlayer } from '@/hooks/useClaimedPlayer'
import { useSessionPushSync } from '@/hooks/useSessionPushSync'
import { SPORTS, getSport } from '@/lib/sports'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { OnboardingWizard, hasBeenOnboarded, hasSeenAdminOnboarding } from '@/features/session/components/OnboardingWizard'
import { SessionLoadingView } from './components/SessionLoadingView'
import { SessionNotFoundView } from './components/SessionNotFoundView'
import { SessionHeader } from './components/SessionHeader'
import { TabBar, ROTATION_TABS, TOURNAMENT_TABS, type Tab } from './components/TabBar'
import { GenerateButton } from './components/GenerateButton'
import { ConfirmGenerateDialog } from './dialogs/ConfirmGenerateDialog'
import { ClaimPlayerDialog } from './dialogs/ClaimPlayerDialog'
import { RoundTab } from './tabs/RoundTab'
import { PlayersTab } from './tabs/PlayersTab'
import { HistoryTab } from './tabs/HistoryTab'
import { RanksTab } from './tabs/RanksTab'
import { SettingsTab } from './tabs/SettingsTab'
import { TournamentCourtsTab } from './tabs/TournamentCourtsTab'
import { TournamentBracketTab } from './tabs/TournamentBracketTab'

function getStoredToken(sessionId: string): string | null {
  return localStorage.getItem(`admin_token:${sessionId}`)
}

function isAdminUser(sessionId: string): boolean {
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
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left')
  const prevTabRef = useRef<Tab>('round')
  const [admin, setAdmin] = useState(() => isAdminUser(sessionId!))
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [showWizard, setShowWizard] = useState(() => !hasBeenOnboarded(sessionId!))
  const [wizardIsCoHost, setWizardIsCoHost] = useState(false)
  const { claimedPlayerId, claimPlayer } = useClaimedPlayer(sessionId!)
  useSessionPushSync(sessionId!, claimedPlayerId)
  const claimPromptTriggered = useRef(false)
  const [showClaimPrompt, setShowClaimPrompt] = useState(false)
  const [isSlowLoad, setIsSlowLoad] = useState(false)

  useEffect(() => {
    if (!isLoading) { setIsSlowLoad(false); return }
    const t = setTimeout(() => setIsSlowLoad(true), 3000)
    return () => clearTimeout(t)
  }, [isLoading])

  // Switch to courts tab when tournament session loads
  useEffect(() => {
    if (session?.session_mode === 'tournament' && tab === 'round') {
      setTab('courts')
      prevTabRef.current = 'courts'
    }
  }, [session?.session_mode])

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

  function handleAdminUnlocked() {
    setAdmin(true)
    setTab('round')
    if (!hasSeenAdminOnboarding(sessionId!)) {
      setWizardIsCoHost(true)
      setShowWizard(true)
    }
  }

  if (isLoading) return <SessionLoadingView isSlowLoad={isSlowLoad} />
  if (error || !session) return <SessionNotFoundView />

  const showGenerateButton = admin && tab === 'round' && session.is_active && !isTournament

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background">
        <SessionHeader session={session} sport={sport} isAdmin={admin} isTournament={isTournament} />
        <TabBar tabs={TABS} activeTab={tab} onTabChange={switchTab} session={session} />
      </div>

      <main
        key={tab}
        id="tab-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className={`max-w-2xl mx-auto p-4 space-y-6 ${showGenerateButton ? 'pb-24' : ''} ${slideDir === 'left' ? 'animate-tab-slide-left' : 'animate-tab-slide-right'}`}
      >
        <ErrorBoundary>
          {tab === 'courts'      && <TournamentCourtsTab session={session} isAdmin={admin} claimedPlayerId={claimedPlayerId} onSetup={(p) => tournamentSetup.mutate(p)} onAdvance={(slotId, winnerId) => tournamentAdvance.mutate({ matchSlotId: slotId, winnerTeamId: winnerId })} setupPending={tournamentSetup.isPending} advancePending={tournamentAdvance.isPending} />}
          {tab === 'bracket'     && <TournamentBracketTab session={session} />}
          {tab === 'round'       && <RoundTab session={session} isAdmin={admin} claimedPlayerId={claimedPlayerId} onShowClaimPrompt={() => setShowClaimPrompt(true)} />}
          {tab === 'players'     && <PlayersTab session={session} isAdmin={admin} isTournament={isTournament} claimedPlayerId={claimedPlayerId} />}
          {tab === 'history'     && <HistoryTab session={session} isAdmin={admin} claimedPlayerId={claimedPlayerId} />}
          {tab === 'leaderboard' && <RanksTab session={session} claimedPlayerId={claimedPlayerId} />}
          {tab === 'settings'    && <SettingsTab sessionId={sessionId!} session={session} isAdmin={admin} claimedPlayerId={claimedPlayerId} onSave={(d) => updateSession.mutate(d)} saving={updateSession.isPending} onSetActive={(v) => setSessionActive.mutate(v)} settingActive={setSessionActive.isPending} onAdminUnlocked={handleAdminUnlocked} />}
        </ErrorBoundary>
      </main>

      {showGenerateButton && (
        <GenerateButton session={session} onGenerate={handleGenerateRound} isPending={generateRound.isPending} />
      )}

      <ConfirmGenerateDialog
        open={confirmGenerate}
        onOpenChange={setConfirmGenerate}
        onConfirm={() => { setConfirmGenerate(false); generateRound.mutate() }}
      />

      <ClaimPlayerDialog
        open={showClaimPrompt}
        onOpenChange={setShowClaimPrompt}
        players={session.players}
        claimedPlayerId={claimedPlayerId}
        onClaim={(id) => { claimPlayer(id); setTimeout(() => setShowClaimPrompt(false), 300) }}
      />

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
    </div>
  )
}
