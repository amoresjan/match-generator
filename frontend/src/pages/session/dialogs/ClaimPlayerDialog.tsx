import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { Player } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  players: Player[]
  claimedPlayerId: string | null
  onClaim: (playerId: string) => void
}

export function ClaimPlayerDialog({ open, onOpenChange, players, claimedPlayerId, onClaim }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <DialogTitle className="text-base font-semibold">Which one is you?</DialogTitle>
          <DialogDescription className="text-xs mt-1">Tap your name to personalize your view.</DialogDescription>
        </div>

        <div className="relative px-3 pb-3">
          <div className="max-h-56 overflow-y-auto">
            {players.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 px-3">
                No players yet — the host will add everyone before play starts.
              </p>
            ) : [...players].sort((a, b) => a.name.localeCompare(b.name)).map((player) => {
              const isClaimed = player.id === claimedPlayerId
              const initial = player.name.charAt(0).toUpperCase()
              return (
                <button
                  key={player.id}
                  onClick={() => onClaim(player.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors active:scale-[0.98] ${
                    isClaimed ? 'bg-primary/10' : 'hover:bg-muted/60'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 select-none transition-colors duration-150 ${
                    isClaimed ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {initial}
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">{player.name}</span>
                  {isClaimed && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 h-8 bg-gradient-to-t from-background to-transparent rounded-b-lg" />
        </div>

        <div className="border-t px-6 py-3.5">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            Skip for now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
