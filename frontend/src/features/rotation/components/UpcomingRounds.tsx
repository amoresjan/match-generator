import { useEffect, useRef, useState } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Player, PreviewRound } from '@/types'

interface Props {
  sessionId: string
  players: Player[]
  isAdmin: boolean
  roundCount: number
  sessionKey: string
  currentPlayerId?: string
}

function resolveNames(ids: string[], players: Player[]): { id: string; name: string }[] {
  return ids.map((id) => ({ id, name: players.find((p) => p.id === id)?.name ?? '?' }))
}

function TeamLabel({ ids, players, currentPlayerId }: { ids: string[]; players: Player[]; currentPlayerId?: string }) {
  const members = resolveNames(ids, players)
  return (
    <>
      {members.map((m, i) => (
        <span key={m.id}>
          {i > 0 && <span className="text-muted-foreground/50 mx-0.5">&amp;</span>}
          <span className={m.id === currentPlayerId ? 'font-semibold text-foreground' : 'text-foreground/75'}>{m.name}</span>
        </span>
      ))}
    </>
  )
}

function PreviewRoundRow({
  round, players, open, onOpenChange, animClass, animDelay, currentPlayerId, isNext,
}: {
  round: PreviewRound
  players: Player[]
  open: boolean
  onOpenChange: (open: boolean) => void
  animClass?: string
  animDelay?: number
  currentPlayerId?: string
  isNext?: boolean
}) {
  const [courtAnimating, setCourtAnimating] = useState(false)
  const prevOpen = useRef(false)

  useEffect(() => {
    if (open && !prevOpen.current) {
      setCourtAnimating(true)
      const t = setTimeout(() => setCourtAnimating(false), 450)
      prevOpen.current = true
      return () => clearTimeout(t)
    }
    prevOpen.current = open
  }, [open])

  const byeNames = round.bye_players.map((id) => players.find((p) => p.id === id)?.name ?? '?')
  const myInBye = currentPlayerId ? round.bye_players.includes(currentPlayerId) : false

  return (
    <div
      className={`rounded-lg border ${isNext ? 'border-border' : 'border-border/60'} ${animClass ?? ''}`}
      style={animDelay !== undefined ? { animationDelay: `${animDelay}ms` } : undefined}
    >
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        onClick={() => onOpenChange(!open)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Round {round.round_number}</span>
          <span className="text-[10px] text-muted-foreground/60">
            {round.courts.length} court{round.courts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="border-t pt-1 pb-2">
            {round.courts.map((court, idx) => {
              const hasMe = currentPlayerId
                ? [...court.team1, ...court.team2].includes(currentPlayerId)
                : false
              return (
                <div
                  key={court.court}
                  className={[
                    'flex items-center gap-3 mx-2 px-2 py-2 rounded-md text-sm',
                    hasMe ? 'bg-primary/5' : '',
                    courtAnimating ? 'animate-card-enter' : '',
                  ].join(' ')}
                  style={courtAnimating ? { animationDelay: `${idx * 60}ms` } : undefined}
                >
                  <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded bg-muted text-[10px] font-bold text-muted-foreground tabular-nums">
                    {court.court}
                  </span>
                  <span className="flex-1 min-w-0 leading-snug">
                    <TeamLabel ids={court.team1} players={players} currentPlayerId={currentPlayerId} />
                    <span className="mx-1.5 text-muted-foreground/40 text-xs">vs</span>
                    <TeamLabel ids={court.team2} players={players} currentPlayerId={currentPlayerId} />
                  </span>
                  {hasMe && (
                    <span className="shrink-0 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full leading-none">You</span>
                  )}
                </div>
              )
            })}
            {byeNames.length > 0 && (
              <div
                className={`mx-2 px-2 pt-1.5 mt-1 border-t border-border/40 text-[10px] text-muted-foreground/60 ${courtAnimating ? 'animate-card-enter' : ''}`}
                style={courtAnimating ? { animationDelay: `${round.courts.length * 60}ms` } : undefined}
              >
                Sitting out: <span className={myInBye ? 'font-semibold text-muted-foreground' : ''}>{byeNames.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const EXIT_DURATION = 300

export function UpcomingRounds({ sessionId, players, roundCount, sessionKey, currentPlayerId }: Props) {
  // Single query keyed on roundCount + sessionKey — TanStack Query deduplicates
  // concurrent fetches with the same key, preventing the double-fetch that
  // occurred when sessionKey changed shortly after mount (window-focus refetch
  // racing with the initial preview load).
  const { data: freshRounds, isFetching } = useQuery({
    queryKey: ['preview-rounds', sessionId, roundCount, sessionKey],
    queryFn: () => api.previewRounds(sessionId, 5),
    staleTime: Infinity, // only re-fetch when the key changes, never on a timer
    gcTime: 0,           // don't keep stale previews in cache
  })

  const [rounds, setRounds] = useState<PreviewRound[] | null>(null)
  const [openNum, setOpenNum] = useState<number | null>(null)
  const [exitingNum, setExitingNum] = useState<number | null>(null)
  const [enteringNum, setEnteringNum] = useState<number | null>(null)
  const [staggeringNums, setStaggeringNums] = useState<Set<number>>(new Set())

  const prevRoundCount = useRef(roundCount)
  const isFirstLoad = useRef(true)

  useEffect(() => {
    if (!freshRounds) return

    const isNewRound = roundCount !== prevRoundCount.current
    prevRoundCount.current = roundCount

    if (isFirstLoad.current) {
      // Initial mount: stagger all rows in.
      isFirstLoad.current = false
      setRounds(freshRounds)
      if (freshRounds.length > 0) setOpenNum(freshRounds[0].round_number)
      const nums = new Set(freshRounds.map((r) => r.round_number))
      setStaggeringNums(nums)
      setTimeout(() => setStaggeringNums(new Set()), (freshRounds.length - 1) * 80 + 400)
      return
    }

    if (isNewRound && rounds && rounds.length > 0) {
      // A new round was committed: animate the top row out, then swap in new data.
      const exiting = rounds[0].round_number
      setExitingNum(exiting)
      setTimeout(() => {
        setExitingNum(null)
        setRounds(freshRounds)
        if (freshRounds.length > 0) {
          setOpenNum(freshRounds[0].round_number)
          const entering = freshRounds[freshRounds.length - 1].round_number
          setEnteringNum(entering)
          setTimeout(() => setEnteringNum(null), 400)
        }
      }, EXIT_DURATION)
      return
    }

    // Session state changed (players/settings): just swap data quietly.
    setRounds(freshRounds)
    if (freshRounds.length > 0 && openNum === null) setOpenNum(freshRounds[0].round_number)
  }, [freshRounds]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-muted-foreground">Upcoming</h3>
        <span className="text-[10px] text-muted-foreground/40">· preview</span>
        {isFetching && (
          <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground/50 ml-auto" />
        )}
      </div>

      {rounds === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-border/60 animate-pulse" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-16 rounded bg-muted" />
                  <div className="h-3 w-10 rounded bg-muted/60" />
                </div>
                <div className="h-4 w-4 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {rounds && (
        <div className="space-y-2">
          {rounds.map((round, idx) => (
            <PreviewRoundRow
              key={round.round_number}
              round={round}
              players={players}
              open={openNum === round.round_number}
              onOpenChange={(o) => setOpenNum(o ? round.round_number : null)}
              currentPlayerId={currentPlayerId}
              isNext={idx === 0}
              animClass={
                exitingNum === round.round_number
                  ? 'animate-card-exit pointer-events-none'
                  : enteringNum === round.round_number || staggeringNums.has(round.round_number)
                    ? 'animate-card-enter'
                    : undefined
              }
              animDelay={staggeringNums.has(round.round_number) ? idx * 80 : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
