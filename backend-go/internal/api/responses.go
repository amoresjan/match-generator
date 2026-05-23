package api

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/amoresjan/match-generator/backend/internal/store"
)

type playerResp struct {
	ID                   uuid.UUID  `json:"id"`
	Name                 string     `json:"name"`
	PermanentPartnerID   *uuid.UUID `json:"permanent_partner_id"`
	PermanentPartnerName *string    `json:"permanent_partner_name"`
	TotalWaitRounds      int        `json:"total_wait_rounds"`
	SitOut               bool       `json:"sit_out"`
	CreatedAt            time.Time  `json:"created_at"`
}

type matchResp struct {
	ID           uuid.UUID `json:"id"`
	CourtNumber  int       `json:"court_number"`
	Team1Players []string  `json:"team1_players"`
	Team2Players []string  `json:"team2_players"`
	Winner       *string   `json:"winner"`
}

type roundResp struct {
	ID        uuid.UUID   `json:"id"`
	Number    int         `json:"number"`
	CreatedAt time.Time   `json:"created_at"`
	Matches   []matchResp `json:"matches"`
}

type sessionResp struct {
	ID              uuid.UUID         `json:"id"`
	Name            string            `json:"name"`
	MatchType       string            `json:"match_type"`
	NumCourts       int               `json:"num_courts"`
	GenerationMode  string            `json:"generation_mode"`
	SportType       string            `json:"sport_type"`
	SessionMode     string            `json:"session_mode"`
	TournamentData  json.RawMessage   `json:"tournament_data"`
	IsActive        bool              `json:"is_active"`
	AutoDeactivated bool              `json:"auto_deactivated"`
	CreatedAt       time.Time         `json:"created_at"`
	Players         []playerResp      `json:"players"`
	Rounds          []roundResp       `json:"rounds"`
	RemovedPlayers  map[string]string `json:"removed_players"`
}

// createSessionResp extends sessionResp with the admin_token (returned only on creation).
type createSessionResp struct {
	sessionResp
	AdminToken uuid.UUID `json:"admin_token"`
}

func toPlayerResp(p store.PlayerWithPartner) playerResp {
	return playerResp{
		ID:                   p.ID,
		Name:                 p.Name,
		PermanentPartnerID:   p.PermanentPartnerID,
		PermanentPartnerName: p.PartnerName,
		TotalWaitRounds:      p.TotalWaitRounds,
		SitOut:               p.SitOut,
		CreatedAt:            p.CreatedAt,
	}
}

func toMatchResp(m store.Match) matchResp {
	return matchResp{
		ID:           m.ID,
		CourtNumber:  m.CourtNumber,
		Team1Players: m.Team1Players,
		Team2Players: m.Team2Players,
		Winner:       m.Winner,
	}
}

func toRoundResp(r store.RoundWithMatches) roundResp {
	matches := make([]matchResp, len(r.Matches))
	for i, m := range r.Matches {
		matches[i] = toMatchResp(m)
	}
	return roundResp{ID: r.ID, Number: r.Number, CreatedAt: r.CreatedAt, Matches: matches}
}

func toSessionResp(s store.Session, players []store.PlayerWithPartner, rounds []store.RoundWithMatches) sessionResp {
	pr := make([]playerResp, len(players))
	for i, p := range players {
		pr[i] = toPlayerResp(p)
	}
	rr := make([]roundResp, len(rounds))
	for i, r := range rounds {
		rr[i] = toRoundResp(r)
	}

	var removed map[string]string
	if len(s.RemovedPlayers) > 0 {
		json.Unmarshal(s.RemovedPlayers, &removed)
	}
	if removed == nil {
		removed = map[string]string{}
	}

	return sessionResp{
		ID:              s.ID,
		Name:            s.Name,
		MatchType:       s.MatchType,
		NumCourts:       s.NumCourts,
		GenerationMode:  s.GenerationMode,
		SportType:       s.SportType,
		SessionMode:     s.SessionMode,
		TournamentData:  s.TournamentData,
		IsActive:        s.IsActive,
		AutoDeactivated: s.AutoDeactivated,
		CreatedAt:       s.CreatedAt,
		Players:         pr,
		Rounds:          rr,
		RemovedPlayers:  removed,
	}
}
