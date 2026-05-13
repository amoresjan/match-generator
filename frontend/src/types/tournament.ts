export interface TournamentTeam {
  id: string
  seed: number
  name: string
  player_ids: string[]
}

export interface TournamentMatchSlot {
  id: string
  round: number
  position: number
  top_team_id: string | null
  bottom_team_id: string | null
  is_bye: boolean
  winner_id: string | null
  db_match_id: string | null
  status: 'pending' | 'ready' | 'active' | 'done'
  feeds: string[]
}

export interface TournamentBracket {
  teams: TournamentTeam[]
  match_slots: TournamentMatchSlot[]
  active_match_ids: string[]
  current_match_id: string | null
  champion_team_id: string | null
  status: 'in_progress' | 'complete'
  num_teams: number
  bracket_size: number
  num_rounds: number
}
