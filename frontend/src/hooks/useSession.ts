import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PreviewRound, Session } from '@/lib/types'

export const sessionKeys = {
  all: ['sessions'] as const,
  detail: (id: string) => ['sessions', id] as const,
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId),
    queryFn: () => api.getSession(sessionId),
    refetchInterval: 3_000,
  })
}

export function useAddPlayer(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.addPlayer(sessionId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
  })
}

export function useRemovePlayer(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (playerId: string) => api.removePlayer(sessionId, playerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
  })
}

export function useUpdatePlayer(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ playerId, name }: { playerId: string; name: string }) =>
      api.updatePlayer(sessionId, playerId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
  })
}

export function useSetPartner(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ playerId, partnerId }: { playerId: string; partnerId: string | null }) =>
      api.setPartner(sessionId, playerId, partnerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
  })
}

export function useGenerateRound(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.generateRound(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
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
    },
    onSettled: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
  })
}
