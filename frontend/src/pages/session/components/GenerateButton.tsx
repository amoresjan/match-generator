import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Session } from '@/types'

interface Props {
  session: Session
  onGenerate: () => void
  isPending: boolean
}

export function GenerateButton({ session, onGenerate, isPending }: Props) {
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
          onClick={onGenerate}
          disabled={isPending || !!hint}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
          {session.rounds.length === 0 ? 'Start' : 'Next Round'}
        </Button>
      </div>
    </div>
  )
}
