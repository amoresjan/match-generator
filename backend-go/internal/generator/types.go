package generator

import "github.com/amoresjan/match-generator/backend/internal/store"

// CourtAssignment mirrors the Django TypedDict of the same name.
type CourtAssignment struct {
	Court int      `json:"court"`
	Team1 []string `json:"team1"`
	Team2 []string `json:"team2"`
}

// GeneratedRound is the pure-computation result of one round. Not persisted.
type GeneratedRound struct {
	RoundNumber int               `json:"round_number"`
	Courts      []CourtAssignment `json:"courts"`
	ByePlayers  []string          `json:"bye_players"`
}

// Normalize ensures Courts and ByePlayers are never nil so they serialize
// as [] rather than null in JSON responses.
func (g *GeneratedRound) Normalize() {
	if g.Courts == nil {
		g.Courts = []CourtAssignment{}
	}
	if g.ByePlayers == nil {
		g.ByePlayers = []string{}
	}
}

// History holds aggregated per-player state used by the cost functions.
type History struct {
	Partner     map[string]map[string]int // partner_counts[a][b]
	Opponent    map[string]map[string]int // opponent_counts[a][b]
	LastOppRnd  map[string]map[string]int // last round a and b were opponents
	Wait        map[string]int            // rounds sat out
	LastSatOut  map[string]int            // most recent round number sat out
	LastPlayed  map[string]int            // most recent round number played
}

// PlayerUnit is either a permanent-partner pair or a solo player.
type playerUnit struct {
	ids        []string
	waitScore  float64 // average wait rounds
	lastPlayed int
}

// activeSet is the resolved sit-out selection for one round.
type activeSet struct {
	pairs   [][]string // permanent-partner pairs still active
	singles []string   // solo players still active
	byes    []string   // UUIDs sitting out
}

// historyPlayers is the minimal player info the generator needs from the DB.
type historyPlayer struct {
	id                 string
	permanentPartnerID *string
	sitOut             bool
}

func storePlayerToHistoryPlayer(p store.PlayerWithPartner) historyPlayer {
	hp := historyPlayer{id: p.ID.String(), sitOut: p.SitOut}
	if p.PermanentPartnerID != nil {
		s := p.PermanentPartnerID.String()
		hp.permanentPartnerID = &s
	}
	return hp
}
