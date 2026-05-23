import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, SSE_BASE } from '@/lib/api'
import { toast } from '@/lib/toast'
import type { PreviewRound, Session } from '@/types'

export const sessionKeys = {
  all: ['sessions'] as const,
  detail: (id: string) => ['sessions', id] as const,
}

function invalidateSession(qc: QueryClient, sessionId: string) {
  return qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) })
}

export function useSession(sessionId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    const es = new EventSource(`${SSE_BASE}/sessions/${sessionId}/events/`)
    let connected = false

    es.onopen = () => {
      if (connected) {
        // Reconnected after a drop — catch up on missed events.
        qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) })
      }
      connected = true
    }

    es.addEventListener('update', () => {
      qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) })
    })

    return () => es.close()
  }, [sessionId, qc])

  return useQuery({
    queryKey: sessionKeys.detail(sessionId),
    queryFn: async () => {
      const previous = qc.getQueryData<Session>(sessionKeys.detail(sessionId))
      const latestRound = previous?.rounds.length
        ? Math.max(...previous.rounds.map(r => r.number))
        : undefined

      // Fetch from latestRound-1 so the current round is always re-fetched.
      // This ensures match result/override updates on the latest round are included.
      const sinceRound = latestRound !== undefined && latestRound > 0
        ? latestRound - 1
        : undefined

      const patch = await api.getSession(sessionId, sinceRound)

      if (sinceRound === undefined || !previous) return patch

      // Replace rounds returned by the server (fresh data) and keep the rest from cache.
      const patchRoundIds = new Set(patch.rounds.map(r => r.id))
      return {
        ...patch,
        rounds: [
          ...previous.rounds.filter(r => !patchRoundIds.has(r.id)),
          ...patch.rounds,
        ].sort((a, b) => a.number - b.number),
      }
    },
    refetchInterval: 30_000, // fallback if SSE drops
    refetchIntervalInBackground: false,
  })
}

export function useAddPlayer(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.addPlayer(sessionId, name),
    onSuccess: () => invalidateSession(qc, sessionId),
    onError: () => toast.error('Failed to add player'),
  })
}

export function useRemovePlayer(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (playerId: string) => api.removePlayer(sessionId, playerId),
    onSuccess: () => invalidateSession(qc, sessionId),
    onError: () => toast.error('Failed to remove player'),
  })
}

export function useUpdatePlayer(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ playerId, name }: { playerId: string; name: string }) =>
      api.updatePlayer(sessionId, playerId, name),
    onSuccess: () => invalidateSession(qc, sessionId),
    onError: () => toast.error('Failed to rename player'),
  })
}

export function useSetSitOut(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ playerId, sitOut }: { playerId: string; sitOut: boolean }) =>
      api.setSitOut(sessionId, playerId, sitOut),
    onSuccess: () => invalidateSession(qc, sessionId),
    onError: () => toast.error('Failed to update sit-out status'),
  })
}

export function useSetPartner(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ playerId, partnerId }: { playerId: string; partnerId: string | null }) =>
      api.setPartner(sessionId, playerId, partnerId),
    onSuccess: () => invalidateSession(qc, sessionId),
    onError: () => toast.error('Failed to update partner'),
  })
}

export function useGenerateRound(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.generateRound(sessionId),
    onSuccess: () => {
      invalidateSession(qc, sessionId)
      toast.success('Round generated')
    },
    onError: () => toast.error('Failed to generate round'),
  })
}

export function useOverrideMatch(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      matchId,
      team1_players,
      team2_players,
    }: {
      matchId: string
      team1_players: string[]
      team2_players: string[]
    }) => api.overrideMatch(sessionId, matchId, { team1_players, team2_players }),
    onSuccess: (updatedMatch) => {
      qc.setQueryData<Session>(sessionKeys.detail(sessionId), (old) => {
        if (!old) return old
        return {
          ...old,
          rounds: old.rounds.map(round => ({
            ...round,
            matches: round.matches.map(match =>
              match.id === updatedMatch.id ? updatedMatch : match
            ),
          })),
        }
      })
      invalidateSession(qc, sessionId)
    },
    onError: () => toast.error('Failed to save match override'),
  })
}

export function useSetMatchResult(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ matchId, winner }: { matchId: string; winner: 'team1' | 'team2' | null }) =>
      api.setMatchResult(sessionId, matchId, winner),
    onMutate: async ({ matchId, winner }) => {
      await qc.cancelQueries({ queryKey: sessionKeys.detail(sessionId) })
      const previous = qc.getQueryData<Session>(sessionKeys.detail(sessionId))
      qc.setQueryData<Session>(sessionKeys.detail(sessionId), (old) => {
        if (!old) return old
        return {
          ...old,
          rounds: old.rounds.map((round) => ({
            ...round,
            matches: round.matches.map((match) =>
              match.id === matchId ? { ...match, winner } : match
            ),
          })),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(sessionKeys.detail(sessionId), context.previous)
      toast.error('Failed to record result')
    },
    onSettled: () => invalidateSession(qc, sessionId),
  })
}

export function useSetSessionActive(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (isActive: boolean) => api.setSessionActive(sessionId, isActive),
    onSuccess: () => invalidateSession(qc, sessionId),
    onError: (err: Error) => toast.error(err.message || 'Failed to update session status'),
  })
}

export function usePreviewRounds(sessionId: string) {
  return useMutation<PreviewRound[], Error, number>({
    mutationFn: (count: number) => api.previewRounds(sessionId, count),
  })
}

export function useUpdateSession(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Pick<Session, 'name' | 'match_type' | 'num_courts'>>) =>
      api.updateSession(sessionId, data),
    onSuccess: () => {
      invalidateSession(qc, sessionId)
      toast.success('Settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })
}

export function useTournamentSetup(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { randomize: true } | { teams: { player_ids: string[] }[] }) =>
      api.tournamentSetup(sessionId, payload),
    onSuccess: (data) => {
      qc.setQueryData<Session>(sessionKeys.detail(sessionId), (old) =>
        old ? { ...old, tournament_data: data.tournament_data } : old
      )
      invalidateSession(qc, sessionId)
    },
    onError: () => toast.error('Failed to set up tournament'),
  })
}

export function useTournamentAdvance(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ matchSlotId, winnerTeamId }: { matchSlotId: string; winnerTeamId: string }) =>
      api.tournamentAdvance(sessionId, matchSlotId, winnerTeamId),
    onSuccess: (data) => {
      qc.setQueryData<Session>(sessionKeys.detail(sessionId), (old) =>
        old ? { ...old, tournament_data: data.tournament_data } : old
      )
    },
    onError: () => toast.error('Failed to record result'),
  })
}
