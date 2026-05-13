import { Button } from '@/components/ui/button'
import { CurrentRound } from '@/features/rotation/components/CurrentRound'
import type { Session } from '@/types'

interface Props {
  session: Session
  isAdmin: boolean
  claimedPlayerId: string | null
  onShowClaimPrompt: () => void
}

export function RoundTab({ session, isAdmin, claimedPlayerId, onShowClaimPrompt }: Props) {
  const claimedPlayer = session.players.find((p) => p.id === claimedPlayerId) ?? null

  return (
    <>
      <CurrentRound
        session={session}
        isAdmin={isAdmin}
        currentPlayerId={claimedPlayerId ?? undefined}
      />
      {session.players.length > 0 && (
        claimedPlayer ? (
          <p className="text-xs text-muted-foreground text-center">
            Playing as <span className="font-medium text-foreground">{claimedPlayer.name}</span>
            <Button size="sm" variant="ghost" className="h-auto px-1.5 py-0.5 text-xs ml-1" onClick={onShowClaimPrompt}>Change</Button>
          </p>
        ) : (
          <div className="rounded-xl border bg-primary/5 border-primary/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Who are you playing as?</p>
                <p className="text-xs text-muted-foreground">Select your name to see yourself highlighted in matches</p>
              </div>
              <Button size="sm" className="shrink-0" onClick={onShowClaimPrompt}>Select</Button>
            </div>
          </div>
        )
      )}
    </>
  )
}
