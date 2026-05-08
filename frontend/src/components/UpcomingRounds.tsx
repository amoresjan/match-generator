import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { usePreviewRounds } from '@/hooks/useSession'
import { toast } from '@/lib/toast'
import type { Player, PreviewRound } from '@/lib/types'

interface Props {
  sessionId: string
  players: Player[]
  isAdmin: boolean
  roundCount: number
  sessionKey: string
  currentPlayerId?: string
}

function resolveTeamJSX(ids: string[], players: Player[], currentPlayerId?: string) {
  const members = ids.map((id) => ({ id, name: players.find((p) => p.id === id)?.name ?? '?' }))
  return (
    <>
      {members.map((m, i) => (
        <span key={m.id}>
          {i > 0 && ' & '}
          <span className={m.id === currentPlayerId ? 'font-bold underline underline-offset-2' : ''}>{m.name}</span>
        </span>
      ))}
    </>
  )
}

function PreviewRoundRow({
  round, players, open, onOpenChange, animClass, currentPlayerId,
}: {
  round: PreviewRound
  players: Player[]
  open: boolean
  onOpenChange: (open: boolean) => void
  animClass?: string
  currentPlayerId?: string
}) {
  return (
    <div className={`rounded-lg border ${animClass ?? ''}`}>
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        onClick={() => onOpenChange(!open)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Round {round.round_number}</span>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 space-y-2 border-t pt-2">
            {round.courts.map((court) => (
              <div key={court.court} className="rounded-md border bg-muted/30 p-2.5 text-sm">
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">Court {court.court}</p>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{resolveTeamJSX(court.team1, players, currentPlayerId)}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="font-medium">{resolveTeamJSX(court.team2, players, currentPlayerId)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const EXIT_DURATION = 300  // matches animate-card-exit duration

export function UpcomingRounds({ sessionId, players, roundCount, sessionKey, currentPlayerId }: Props) {
  const preview = usePreviewRounds(sessionId)
  const [rounds, setRounds] = useState<PreviewRound[] | null>(null)
  const [openNum, setOpenNum] = useState<number | null>(null)
  const [exitingNum, setExitingNum] = useState<number | null>(null)
  const [enteringNum, setEnteringNum] = useState<number | null>(null)

  const mutateRef = useRef(preview.mutateAsync)
  mutateRef.current = preview.mutateAsync
  const mounted = useRef(false)

  function applyRounds(next: PreviewRound[]) {
    setRounds(next)
    if (next.length > 0) setOpenNum(next[0].round_number)
  }

  // Auto-generate on mount
  useEffect(() => {
    mutateRef.current(5).then(applyRounds).catch(() => toast.error('Failed to load upcoming rounds'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When a new real round is committed: animate first card out, fetch, animate last card in
  useEffect(() => {
    if (!mounted.current) return
    if (rounds === null || rounds.length === 0) return

    const exiting = rounds[0].round_number
    setExitingNum(exiting)

    const t = setTimeout(() => {
      setExitingNum(null)
      mutateRef.current(5).then((next) => {
        applyRounds(next)
        if (next.length > 0) {
          const entering = next[next.length - 1].round_number
          setEnteringNum(entering)
          setTimeout(() => setEnteringNum(null), 400)
        }
      }).catch(() => toast.error('Failed to refresh upcoming rounds'))
    }, EXIT_DURATION)

    return () => clearTimeout(t)
  }, [roundCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Silent regenerate for other session changes (player added/removed, duo, courts)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (rounds === null) return
    mutateRef.current(5).then(applyRounds).catch(() => toast.error('Failed to refresh upcoming rounds'))
  }, [sessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Upcoming</h3>
        {preview.isPending && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="text-xs text-muted-foreground/70 -mt-1">
        Preview only — matchups may change when players are added, removed, or other session changes occur.
      </p>

      {rounds && (
        <div className="space-y-2">
          {rounds.map((round) => (
            <PreviewRoundRow
              key={round.round_number}
              round={round}
              players={players}
              open={openNum === round.round_number}
              onOpenChange={(o) => setOpenNum(o ? round.round_number : null)}
              currentPlayerId={currentPlayerId}
              animClass={
                exitingNum === round.round_number
                  ? 'animate-card-exit pointer-events-none'
                  : enteringNum === round.round_number
                    ? 'animate-card-enter'
                    : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
