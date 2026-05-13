import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const ONBOARDING_KEY = (id: string) => `rally_onboarded:${id}`
const ADMIN_ONBOARDING_KEY = (id: string) => `rally_onboarded_admin:${id}`

export function hasBeenOnboarded(sessionId: string): boolean {
  return localStorage.getItem(ONBOARDING_KEY(sessionId)) !== null
}

export function hasSeenAdminOnboarding(sessionId: string): boolean {
  return localStorage.getItem(ADMIN_ONBOARDING_KEY(sessionId)) !== null
}

interface StepDef {
  icon: string
  title: string
  body: ReactNode
  action: { label: string; onClick: () => void } | null
  accent: boolean
}

interface Props {
  sessionId: string
  sessionName: string
  matchType: '1v1' | '2v2'
  isAdmin: boolean
  isCoHost?: boolean
  onGoToPlayers: () => void
  onGoToSettings: () => void
  onDone: () => void
}

export function OnboardingWizard({
  sessionId, sessionName, matchType, isAdmin, isCoHost = false,
  onGoToPlayers, onGoToSettings, onDone,
}: Props) {
  const [step, setStep] = useState(0)
  const directionRef = useRef<'forward' | 'back'>('forward')
  const [animKey, setAnimKey] = useState(0)
  const minPlayers = matchType === '2v2' ? 4 : 2

  function finish() {
    localStorage.setItem(ONBOARDING_KEY(sessionId), '1')
    if (isAdmin) localStorage.setItem(ADMIN_ONBOARDING_KEY(sessionId), '1')
    onDone()
  }

  function goForward() {
    directionRef.current = 'forward'
    setAnimKey((k) => k + 1)
    setStep((s) => s + 1)
  }

  function goBack() {
    directionRef.current = 'back'
    setAnimKey((k) => k + 1)
    setStep((s) => s - 1)
  }

  const adminSteps: StepDef[] = [
    {
      icon: isCoHost ? '🔑' : '🎉',
      title: isCoHost ? "You're a co-host!" : 'Session created!',
      body: isCoHost ? (
        <>You've unlocked host access for <strong className="text-foreground">{sessionName}</strong>. You can manage players, generate rounds, and record results.</>
      ) : (
        <>You're the host of <strong className="text-foreground">{sessionName}</strong>. Players can join to view live matchups, but only you can manage rounds.</>
      ),
      action: null,
      accent: true,
    },
    {
      icon: '👥',
      title: 'Add your players',
      body: (
        <>Head to <strong className="text-foreground">Players</strong> and add everyone playing today. You'll need at least <strong className="text-foreground">{minPlayers} players</strong> to get started.</>
      ),
      action: { label: 'Go to Players', onClick: () => { finish(); onGoToPlayers() } },
      accent: false,
    },
    {
      icon: '🚀',
      title: 'Ready to play',
      body: (
        <>Once players are in, hit <strong className="text-foreground">Start</strong> to generate the first round. Share the link from <strong className="text-foreground">Settings</strong> so everyone can follow along.</>
      ),
      action: null,
      accent: false,
    },
  ]

  const guestSteps: StepDef[] = [
    {
      icon: '👋',
      title: "You're in!",
      body: (
        <>You're viewing <strong className="text-foreground">{sessionName}</strong> as a player. Check the <strong className="text-foreground">Round</strong> tab for live matchups.</>
      ),
      action: null,
      accent: true,
    },
    {
      icon: '🏓',
      title: 'Find your court',
      body: (
        <>Court cards show who's playing each match. When you see your name, you're up. Co-hosting? Get the admin code from <strong className="text-foreground">Settings</strong>.</>
      ),
      action: { label: 'Open Settings', onClick: () => { finish(); onGoToSettings() } },
      accent: false,
    },
  ]

  const steps = isAdmin ? adminSteps : guestSteps
  const current = steps[step]
  const isFirst = step === 0
  const isLast = step === steps.length - 1

  const badgeLabel = isAdmin ? (isCoHost ? 'Co-host' : 'Host') : 'Player'
  const badgeClass = isAdmin
    ? 'bg-primary/10 text-primary'
    : 'bg-muted text-muted-foreground'

  const animClass = directionRef.current === 'forward'
    ? 'animate-tab-slide-left'
    : 'animate-tab-slide-right'

  return (
    <Dialog open onOpenChange={(open) => { if (!open) finish() }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">

        {/* Animated step content */}
        <div key={animKey} className={`${animClass} px-6 pt-8 pb-5 space-y-5`}>

          {/* Icon circle + role badge */}
          <div className="flex flex-col items-center gap-2.5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${
              current.accent ? 'bg-primary/[0.1]' : 'bg-muted/70'
            }`}>
              {current.icon}
            </div>
            <span className={`text-[10px] font-semibold tracking-widest uppercase px-2.5 py-0.5 rounded-full ${badgeClass}`}>
              {badgeLabel}
            </span>
          </div>

          {/* Title + body */}
          <div className="text-center space-y-2">
            <DialogTitle className="text-base font-semibold leading-snug">
              {current.title}
            </DialogTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {current.body}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center items-center gap-1.5 pt-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/25'
                }`}
              />
            ))}
          </div>

          {/* Optional secondary action */}
          {current.action && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={current.action.onClick}
            >
              {current.action.label}
            </Button>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 pb-6 pt-1">
          {isFirst ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs h-8"
              onClick={finish}
            >
              Skip
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8"
              onClick={goBack}
            >
              Back
            </Button>
          )}
          <Button
            size="sm"
            className="min-w-[72px] h-8 text-xs"
            onClick={isLast ? finish : goForward}
          >
            {isLast ? "Let's go!" : 'Next'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
