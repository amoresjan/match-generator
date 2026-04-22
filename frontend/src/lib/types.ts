export interface Player {
  id: string
  name: string
  permanent_partner_id: string | null
  permanent_partner_name: string | null
  total_wait_rounds: number
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
  is_active: boolean
  created_at: string
  players: Player[]
  rounds: Round[]
}

export interface SessionWithToken extends Session {
  admin_token: string
}
