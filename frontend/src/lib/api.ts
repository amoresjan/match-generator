import type { Match, Player, Round, Session, SessionWithToken } from './types'

export const BASE = import.meta.env.VITE_API_URL ?? '/api'

function getAdminToken(sessionId: string): string | null {
  return localStorage.getItem(`admin_token:${sessionId}`)
}

export function saveAdminToken(sessionId: string, token: string) {
  localStorage.setItem(`admin_token:${sessionId}`, token)
}

async function request<T>(
  path: string,
  options: RequestInit & { adminToken?: string } = {},
): Promise<T> {
  const { adminToken, ...init } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (adminToken) headers['X-Admin-Token'] = adminToken

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Sessions
export const api = {
  createSession: (data: { name: string; match_type: '1v1' | '2v2'; num_courts: number; generation_mode: 'fair' | 'competitive' }) =>
    request<SessionWithToken>('/sessions/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSession: (id: string) => request<Session>(`/sessions/${id}/`),

  updateSession: (id: string, data: Partial<{ name: string; match_type: '1v1' | '2v2'; num_courts: number; generation_mode: 'fair' | 'competitive' }>) =>
    request<Session>(`/sessions/${id}/update/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      adminToken: getAdminToken(id) ?? undefined,
    }),

  // Players
  addPlayer: (sessionId: string, name: string) =>
    request<Player>(`/sessions/${sessionId}/players/`, {
      method: 'POST',
      body: JSON.stringify({ name }),
      adminToken: getAdminToken(sessionId) ?? undefined,
    }),

  updatePlayer: (sessionId: string, playerId: string, name: string) =>
    request<Player>(`/sessions/${sessionId}/players/${playerId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
      adminToken: getAdminToken(sessionId) ?? undefined,
    }),

  removePlayer: (sessionId: string, playerId: string) =>
    request<void>(`/sessions/${sessionId}/players/${playerId}/`, {
      method: 'DELETE',
      adminToken: getAdminToken(sessionId) ?? undefined,
    }),

  setPartner: (sessionId: string, playerId: string, partnerId: string | null) =>
    request<Player>(`/sessions/${sessionId}/players/${playerId}/partner/`, {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId }),
      adminToken: getAdminToken(sessionId) ?? undefined,
    }),

  // Rounds
  generateRound: (sessionId: string) =>
    request<Round>(`/sessions/${sessionId}/generate/`, {
      method: 'POST',
      adminToken: getAdminToken(sessionId) ?? undefined,
    }),

  overrideMatch: (sessionId: string, matchId: string, data: { team1_players: string[]; team2_players: string[] }) =>
    request<Match>(`/sessions/${sessionId}/matches/${matchId}/override/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      adminToken: getAdminToken(sessionId) ?? undefined,
    }),

  setMatchResult: (sessionId: string, matchId: string, winner: 'team1' | 'team2' | null) =>
    request<Match>(`/sessions/${sessionId}/matches/${matchId}/result/`, {
      method: 'PATCH',
      body: JSON.stringify({ winner }),
      adminToken: getAdminToken(sessionId) ?? undefined,
    }),
}
