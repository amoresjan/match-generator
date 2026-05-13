export interface Player {
  id: string
  name: string
  permanent_partner_id: string | null
  permanent_partner_name: string | null
  total_wait_rounds: number
  sit_out: boolean
  created_at: string
}

export interface Match {
  id: string
  court_number: number
  team1_players: string[]
  team2_players: string[]
  winner: 'team1' | 'team2' | null
}

export interface Round {
  id: string
  number: number
  created_at: string
  matches: Match[]
}

export interface Session {
  id: string
  name: string
  match_type: '1v1' | '2v2'
  num_courts: number
  generation_mode: 'fair' | 'competitive'
  sport_type: 'pickleball' | 'tennis' | 'badminton' | 'ping_pong' | 'padel' | 'others'
  session_mode: 'rotation' | 'tournament'
  tournament_data: import('./tournament').TournamentBracket | null
  is_active: boolean
  auto_deactivated: boolean
  created_at: string
  players: Player[]
  rounds: Round[]
  removed_players: Record<string, string>
}

export interface SessionWithToken extends Session {
  admin_token: string
}

export interface PreviewCourt {
  court: number
  team1: string[]
  team2: string[]
}

export interface PreviewRound {
  round_number: number
  courts: PreviewCourt[]
  bye_players: string[]
}
