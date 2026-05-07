import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const onboardingKey = (sessionId: string) => `rally_onboarded:${sessionId}`

export function hasBeenOnboarded(sessionId: string): boolean {
  return localStorage.getItem(onboardingKey(sessionId)) !== null
}

interface Props {
  sessionId: string
  sessionName: string
  matchType: '1v1' | '2v2'
  isAdmin: boolean
  onGoToPlayers: () => void
  onGoToSettings: () => void
  onDone: () => void
}

export function OnboardingWizard({ sessionId, sessionName, matchType, isAdmin, onGoToPlayers, onGoToSettings, onDone }: Props) {
  const [step, setStep] = useState(0)
  const minPlayers = matchType === '2v2' ? 4 : 2

  function finish() {
    localStorage.setItem(onboardingKey(sessionId), '1')
    onDone()
  }

  const adminSteps = [
    {
      icon: '🎉',
      title: 'Session created!',
      body: (
        <>
          You're the host of <strong className="text-foreground">{sessionName}</strong>. Players can join to view live matchups, but only you can manage rounds and generate matches.
        </>
      ),
      action: null,
    },
    {
      icon: '👥',
      title: 'Add your players',
      body: (
        <>
          Go to the <strong className="text-foreground">Players</strong> tab and add everyone playing today. You'll need at least <strong className="text-foreground">{minPlayers} players</strong> to generate a round.
        </>
      ),
      action: { label: 'Go to Players', onClick: () => { finish(); onGoToPlayers() } },
    },
    {
      icon: '🚀',
      title: 'Start playing',
      body: (
        <>
          Once everyone's added, hit <strong className="text-foreground">Start</strong> to generate the first round. Share the session link from <strong className="text-foreground">Settings</strong> so players can follow along.
        </>
      ),
      action: null,
    },
  ]

  const guestSteps = [
    {
      icon: '👋',
      title: `Welcome to ${sessionName}!`,
      body: (
        <>
          You're viewing this session as a <strong className="text-foreground">player</strong>. Check the <strong className="text-foreground">Round</strong> tab to see live matchups as they're generated.
        </>
      ),
      action: null,
    },
    {
      icon: '🔑',
      title: 'Co-hosting?',
      body: (
        <>
          If you're helping manage this session, ask the host for the <strong className="text-foreground">admin code</strong> and enter it in <strong className="text-foreground">Settings → Host Access</strong>.
        </>
      ),
      action: { label: 'Go to Settings', onClick: () => { finish(); onGoToSettings() } },
    },
  ]

  const steps = isAdmin ? adminSteps : guestSteps
  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <Dialog open onOpenChange={(open) => { if (!open) finish() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="text-3xl mb-1">{current.icon}</div>
          <DialogTitle>{current.title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>

        <div className="flex justify-center gap-1.5 py-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted'}`}
            />
          ))}
        </div>

        <div className="flex gap-2 justify-between">
          <div>
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {current.action && (
              <Button variant="outline" size="sm" onClick={current.action.onClick}>
                {current.action.label}
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={finish}>Got it</Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>Next</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
