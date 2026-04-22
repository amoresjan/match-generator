import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Session } from '@/lib/types'

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

export function useUpdateSession(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Pick<Session, 'name' | 'match_type' | 'num_courts'>>) =>
      api.updateSession(sessionId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
  })
}
